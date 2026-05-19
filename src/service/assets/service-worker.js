// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

// Offline-first service worker.
//
// Strategy:
//   - Static assets (CSS/JS/manifest/icon)  : stale-while-revalidate with a long cache.
//   - HTML navigations                      : network-first with a short timeout, falling
//                                             back to the cached copy, and finally to a
//                                             generic /offline page if neither is available.
//   - Anything else                         : pass through to the network.
//
// The cache version is bumped whenever any asset content changes; older
// caches are pruned on activate.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const STATIC_CACHE = `homework-static-${VERSION}`;
const PAGES_CACHE = `homework-pages-${VERSION}`;

function versionedAsset(path) {
    return `${path}?v=${encodeURIComponent(VERSION)}`;
}

// Pre-cache the assets that are guaranteed to be needed.
//
// IMPORTANT: this list must stay in sync with the routes registered in
// src/service/mod.rs::load_https_app_service().  Every HTML page that must
// work offline needs an entry here.  When adding a new exercise, add its
// path to both places.
const PRECACHE = [
    versionedAsset("/theme.css"),
    versionedAsset("/homework.js"),
    versionedAsset("/manifest.webmanifest"),
    versionedAsset("/favicon.svg"),
    versionedAsset("/apple-touch-icon.png"),
    versionedAsset("/icon-192.png"),
    versionedAsset("/icon-512.png"),
    "/offline",
    "/",
    "/extra/flashcards",
    "/1/mathbox",
    "/1/multiplications",
    "/1/thermometer",
    "/2/clock",
    "/2/digital-clock",
    "/2/fractions",
    "/2/percentages",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(STATIC_CACHE);
            await cache.addAll(PRECACHE);
            self.skipWaiting();
        })(),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(
                names
                    .filter((n) => n.startsWith("homework-") && n !== STATIC_CACHE && n !== PAGES_CACHE)
                    .map((n) => caches.delete(n)),
            );
            await self.clients.claim();
            // Tell all controlled windows to reload so they pick up the new
            // HTML and versioned assets rather than staying on stale markup.
            const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
            for (const client of windowClients) {
                client.postMessage({ type: "SW_ACTIVATED", version: VERSION });
            }
        })(),
    );
});

function isStaticAsset(url) {
    return (
        url.pathname === "/theme.css" ||
        url.pathname === "/homework.js" ||
        url.pathname === "/manifest.webmanifest" ||
        url.pathname === "/favicon.svg" ||
        url.pathname === "/apple-touch-icon.png" ||
        url.pathname === "/icon-192.png" ||
        url.pathname === "/icon-512.png"
    );
}

function isHtmlRequest(request) {
    if (request.method !== "GET") return false;
    const accept = request.headers.get("accept") || "";
    if (accept.includes("text/html")) return true;
    if (request.mode === "navigate") return true;
    return false;
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    const fetchPromise = fetch(request)
        .then((res) => {
            if (res?.ok) cache.put(request, res.clone());
            return res;
        })
        .catch(() => null);
    return cached || (await fetchPromise) || Response.error();
}

// Cap the page cache so long-lived sessions can't run away with quota.
// Anything beyond MAX_PAGES_CACHE_ENTRIES gets evicted FIFO. The static
// pages we always want to keep are still in PRECACHE (STATIC_CACHE).
const MAX_PAGES_CACHE_ENTRIES = 30;
async function cachePagePut(cache, request, response) {
    try {
        await cache.put(request, response);
        const keys = await cache.keys();
        const overflow = keys.length - MAX_PAGES_CACHE_ENTRIES;
        if (overflow > 0) {
            // Service worker cache keys are stored in insertion order, so the
            // first N are the oldest writes.
            for (let i = 0; i < overflow; i++) await cache.delete(keys[i]);
        }
    } catch (_e) {
        // Quota exceeded etc. — try to make room by clearing the page cache.
        try {
            await caches.delete(PAGES_CACHE);
        } catch {}
    }
}

async function networkFirstHtml(request) {
    const cache = await caches.open(PAGES_CACHE);
    // Race network against a 2.5s timeout.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
    const network = fetch(request)
        .then((res) => {
            if (res?.ok) cachePagePut(cache, request, res.clone());
            return res;
        })
        .catch(() => null);
    const winner = await Promise.race([network, timeout]);
    if (winner?.ok) return winner;
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort: maybe network finishes after timeout
    const late = await network;
    if (late?.ok) return late;
    const fallback = await caches.match("/offline");
    return (
        fallback ||
        new Response("offline", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8" },
        })
    );
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (isStaticAsset(url)) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }
    if (isHtmlRequest(request)) {
        event.respondWith(networkFirstHtml(request));
    }
});
