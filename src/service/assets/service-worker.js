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
const PRECACHE = [
    versionedAsset("/theme.css"),
    versionedAsset("/homework.js"),
    versionedAsset("/manifest.webmanifest"),
    versionedAsset("/favicon.svg"),
    "/offline",
    "/",
    "/extra/flashcards",
    "/1/mathbox",
    "/1/multiplications",
    "/1/thermometer",
    "/2/clock",
    "/2/digital-clock",
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
                    .filter(
                        (n) =>
                            n.startsWith("homework-") &&
                            n !== STATIC_CACHE &&
                            n !== PAGES_CACHE,
                    )
                    .map((n) => caches.delete(n)),
            );
            await self.clients.claim();
        })(),
    );
});

function isStaticAsset(url) {
    return (
        url.pathname === "/theme.css" ||
        url.pathname === "/homework.js" ||
        url.pathname === "/manifest.webmanifest" ||
        url.pathname === "/favicon.svg" ||
        url.pathname.startsWith("/img/")
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
            if (res && res.ok) cache.put(request, res.clone());
            return res;
        })
        .catch(() => null);
    return cached || (await fetchPromise) || Response.error();
}

async function networkFirstHtml(request) {
    const cache = await caches.open(PAGES_CACHE);
    // Race network against a 2.5s timeout.
    const timeout = new Promise((resolve) =>
        setTimeout(() => resolve(null), 2500),
    );
    const network = fetch(request)
        .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
        })
        .catch(() => null);
    const winner = await Promise.race([network, timeout]);
    if (winner && winner.ok) return winner;
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort: maybe network finishes after timeout
    const late = await network;
    if (late && late.ok) return late;
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
