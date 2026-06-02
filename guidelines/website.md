# Website specification — working guidelines

A focused, project-specific reading of the [Website Specification
Checklist](https://specification.website/checklist/) — Foundations, SEO,
Accessibility, Security, Performance, Resilience, Privacy,
Internationalisation, Well-Known URIs, Agent Readiness.

This document is the **policy companion** to [css_and_some_js.md](css_and_some_js.md)
(layout, typography, scrolling, responsive design) and [animations.md](animations.md)
(motion craft). Those cover *how to build a page*. This covers *what every
page must ship with*: the doctype, the meta tags, the headers, the manifest,
the icons, the error pages, the security posture, the indexing controls.

## How to use this document

- **Scan once** to load the mental model of what a complete page-or-site needs.
- **Re-read a section** before adding a new top-level page or HTTP route.
- **Items are tagged** `[Required]` (ship-blocker), `[Recommended]` (do it
  unless there's a reason not to), `[Skipped]` (deliberately not applicable
  here — the *why* is recorded so we don't reintroduce it by accident).
- The **Skipped** entries are load-bearing. Every item the upstream checklist
  flags as a best practice and we choose **not** to do has its reason
  documented here.

## Project shape — the assumptions this doc rests on

- **Audience**: children practising elementary-school exercises with a
  parent/teacher present.
- **Architecture**: server-rendered HTML (Rama `html!`) plus vanilla JS;
  no build step, no bundler, no third-party scripts.
- **Storage**: IndexedDB on the device. No accounts, no server-side
  per-user data, no cookies, no analytics, no ads.
- **Reach**: mobile-first, fully offline once cached (PWA + service worker).
- **Language**: Dutch (`nl-BE`) only for now. Other locales are on the
  roadmap but not near-term.
- **Surface**: a small set of stable URLs at `elementary.training`.

Most "do not apply" decisions trace back to one of those.

## Contributing

Living document. When a new page, header, or external surface is added,
update the matching section. Keep entries dense and link to MDN, WHATWG,
or IETF RFCs for canonical references. Prefer one short reason per item
over a paragraph.

---

## Foundations

The HTML, head, and document basics every page must include.

- **`<!doctype html>`** `[Required]` — first line of every document.
  Without it the browser falls into quirks mode and box-model math breaks.
- **`<html lang="nl-BE">`** `[Required]` — set the primary language as a
  valid [BCP 47](https://www.rfc-editor.org/rfc/rfc5646) tag. Screen
  readers, translators, and search engines all key off this.
- **`<meta charset="utf-8">`** `[Required]` — within the first 1024 bytes
  of `<head>`. Anything else mangles non-ASCII text including the Dutch
  diacritics and the math glyphs used in exercises.
- **`<meta name="viewport" content="width=device-width, initial-scale=1">`**
  `[Required]` — never disable user scaling (no `user-scalable=no`,
  no `maximum-scale=1`). Disabling zoom is a WCAG SC 1.4.4 failure and
  blocks low-vision parents helping a child.
- **`<title>`** `[Required]` — exactly one non-empty title per page,
  written for humans first. Used by tabs, history, screen readers, social
  previews, and search results.
- **`<meta name="description">`** `[Recommended]` — short, unique summary
  per page. Don't repeat the title verbatim.
- **`<link rel="canonical">`** `[Recommended]` — point at the canonical
  URL when the same page can be reached via multiple paths (e.g. trailing
  slash, query strings, future locale prefixes).
- **Favicons & app icons** `[Required]` — the PWA install path needs
  these. Ship at least an SVG favicon, an ICO fallback, an
  `apple-touch-icon`, and a maskable PNG for the manifest. See the
  [Web app manifest](#resilience) section.
- **`<meta name="theme-color">`** `[Recommended]` — tints the browser
  chrome (Android, iOS PWA, macOS Safari tab bar). Provide both light
  and dark via `media="(prefers-color-scheme: ...)"` if the app has
  separate palettes.
- **`<meta name="color-scheme" content="light dark">`** `[Recommended]`
  — declare which schemes the page is designed for. Prevents the white
  flash dark-mode users see before CSS loads.
- **Open Graph** `[Recommended]` — at minimum `og:title`, `og:description`,
  `og:image`, `og:url`, `og:type="website"`. The site URL gets shared by
  parents in messaging apps; the unfurl is the first impression.
- **Popover API & `<dialog>`** `[Recommended]` — prefer the native
  top-layer primitives (`popover` attribute, `<dialog>` with
  `showModal()`) over hand-rolled JS modals. They handle focus trap,
  inert background, and Escape-to-close for free. See also "Native
  interactive elements" under Accessibility.
- **Feed discovery (`rel="alternate"` RSS/Atom/JSON Feed)** `[Skipped —
  no feed-style content]`. We have no blog, changelog, or update stream.

References: [MDN — meta](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta),
[HTML Standard — the head element](https://html.spec.whatwg.org/multipage/semantics.html#the-head-element).

---

## SEO

Search visibility — most of these matter even for a small, single-purpose
site. We want parents Googling "online oefenen klok lager onderwijs" to
find us.

- **`robots.txt` at the site root** `[Recommended]` — `User-agent: *` /
  `Allow: /` for the public pages, `Disallow:` for anything we don't
  want indexed. Reference the sitemap. See also
  [Agent Readiness — AI crawlers](#agent-readiness).
- **XML sitemap** `[Recommended]` — generated from the route registry,
  one entry per public exercise/page, `<lastmod>` from the build date or
  content hash. Submit via Google Search Console / Bing Webmaster.
- **Sitemap index files** `[Skipped — under 50k URLs]`. We have under a
  hundred public routes; a single sitemap is fine.
- **URL structure** `[Required]` — lowercase, hyphenated, descriptive,
  shallow. URLs are public API: `/oefeningen/klok-aflezen` is fine to
  link to forever; `?id=42&v=2` is not. Avoid trailing-slash flip-flops.
- **Redirects (301/302/308)** `[Required]` — when a URL changes,
  permanent redirect (301 or 308) from the old path. Never let a public
  URL 404 silently. Don't chain redirects more than once.
- **Avoid "soft 404"** `[Required]` — a missing exercise must return HTTP
  `404`, not a friendly 200 page with "not found" text. Search engines
  treat the latter as a quality problem.
- **`<meta name="robots">` / `X-Robots-Tag`** `[Required]` — every page
  must declare its indexing policy explicitly. Public pages: `index, follow`.
  Internal/work-in-progress pages: `noindex`. Header form is preferable
  for non-HTML assets.
- **Heading hierarchy** `[Required]` — `<h1>` once per page; `<h2>`/`<h3>`
  form a nested outline. Never pick a heading level for its visual size
  (use CSS for that). Critical for screen readers and search.
- **Internal linking** `[Recommended]` — link related exercises to each
  other where it helps a child or parent navigate. The exercise index
  page is the hub.
- **Structured data (JSON-LD)** `[Required]` — at the site root,
  schema.org `WebSite` plus `EducationalOrganization` or
  `LearningResource` per exercise. Embed as `<script type="application/ld+json">`.
  Validates with [Schema Markup Validator](https://validator.schema.org/).
  Tightened from `[Recommended]` because the rich-snippet eligibility and
  the CSP hash-bookkeeping cost are both zero — every exercise must ship
  its `.jsonld` body and an e2e test asserts it renders.
- **Breadcrumbs** `[Required]` — for exercises grouped by topic, a
  `BreadcrumbList` JSON-LD plus a visible breadcrumb nav helps SEO and
  navigation alike. Tightened from `[Recommended]` because the visible
  breadcrumb doubles as the in-page `<h1>` carrier on exercise pages
  (no separate title bar), so dropping it would regress both SEO and UX.
- **IndexNow** `[Skipped — content rarely changes]`. The push-notification
  protocol is overkill for a site whose URL set evolves on the scale of
  weeks, not minutes.

References: [Google Search Central — SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
[RFC 9309 — Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309).

---

## Accessibility

WCAG-aligned rules so a child of any ability — or a parent supporting
one — can use the site. This is the section with the highest density
of `[Required]` items, and the smallest acceptable failure budget.

- **Colour contrast** `[Required]` — text and meaningful non-text
  elements meet WCAG AA at minimum (4.5:1 normal text, 3:1 large), AAA
  where reasonable. Test the *resting* state, the *hover/focus* state,
  *and* the disabled state. The exercise UI uses muted colours;
  re-check whenever a palette changes.
- **Image `alt` text** `[Required]` — every `<img>` has `alt`. Decorative
  images get `alt=""` (not omitted). Don't put "image of" — the AT
  already says that. Mascots (the panda) need a short label
  ("panda probeert opnieuw"), not their file name.
- **Form labels** `[Required]` — every input has a programmatically
  associated label. Use `<label for="id">` or wrap the input. Placeholder
  text is **not** a label; it disappears on focus and often fails
  contrast.
- **Keyboard navigation** `[Required]` — every interactive element
  reachable and operable via Tab/Shift+Tab/Enter/Space/Arrow keys, in a
  logical order. No drag-only or hover-only interactions.
- **Visible focus indicators** `[Required]` — `:focus-visible` styles
  on every focusable element. Never `outline: none` without a
  high-contrast replacement (offset + thick outline, or `box-shadow`
  ring). See [css_and_some_js.md — Selectors](css_and_some_js.md#selectors).
- **Skip links** `[Recommended]` — first focusable element is "Skip to
  main content" pointing at `#main`. Visually hidden until focused.
- **Semantic HTML & landmarks** `[Required]` — `<header>`, `<nav>`,
  `<main>`, `<footer>`, `<section>` with names. Each page has exactly one
  `<main>`. Screen reader rotor users navigate by landmark; div soup
  defeats them.
- **First rule of ARIA — don't** `[Recommended]` — prefer a real
  `<button>` over `<div role="button">`. ARIA only when the platform
  doesn't have a primitive (e.g. `aria-live` for the answer feedback
  region, `aria-pressed` on a custom toggle).
- **Descriptive link text** `[Required]` — never "klik hier" or "lees
  meer". Each link reads sensibly out of context (screen readers list
  them out of context).
- **No empty links/buttons** `[Required]` — icon-only controls need
  `aria-label` (or visually hidden text). An icon `<button>` with no
  accessible name is invisible to AT.
- **Accessible form errors** `[Required]` — errors are identified in
  text (not colour alone), associated with the input via
  `aria-describedby`, and announced (e.g. `aria-live="polite"` on the
  feedback region used for "probeer het nog eens").
- **Document and inline language** `[Required]` — `lang="nl-BE"` on
  `<html>`; mark inline non-Dutch passages with `lang="..."`. Example:
  English source-code samples in any developer-facing docs.
- **Reduced motion** `[Required]` — respect `prefers-reduced-motion`.
  Decorative motion is gated; functional motion has a no-motion
  equivalent. See [animations.md — Motion accessibility](animations.md).
- **Accessibility overlays** `[Avoid]` — never ship a third-party
  "accessibility widget". They do not make a site WCAG-compliant; they
  often regress it. Fix the underlying markup instead.
- **Captions & transcripts** `[Required, when applicable]` — any
  instructional video gets synchronised captions; audio-only content
  gets a transcript. The current exercises have no video; this is the
  rule when we add some.
- **Accessible data tables** `[Required, when applicable]` — use real
  `<table>` markup with `<caption>`, `<th scope="col|row">`, no
  layout tables.
- **Touch target size** `[Required]` — minimum 24×24 CSS px (WCAG 2.2
  SC 2.5.8), 44×44 enhanced — and 44×44 is what we actually ship for
  primary controls, given the child-on-tablet use case. See also
  the `(pointer: coarse)` block in [css_and_some_js.md](css_and_some_js.md).
- **`hidden="until-found"`** `[Recommended]` — for collapsible content
  (e.g. "show steps") that should still be findable via in-page search
  and indexable.
- **Native interactive elements** `[Required]` — `<button>` for
  buttons, `<a href>` for navigation, `<details>` for disclosure,
  `<dialog>` for modals. Re-implementing these in JS almost always
  regresses keyboard handling, focus, and AT exposure.
- **`:has`, `:user-invalid`, `:focus-within`, `:placeholder-shown`**
  `[Recommended]` — CSS state selectors let us reflect form/UI state
  without JS. `:user-invalid` is preferable to `:invalid` because it
  only matches after the user has interacted.

Tests we run: keyboard-only run-through of one exercise per category;
VoiceOver/TalkBack pass on the same; axe-core/Lighthouse a11y audit
on representative pages.

References: [WCAG 2.2 Understanding Docs](https://www.w3.org/WAI/WCAG22/Understanding/),
[WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/).

---

## Security

Headers, transport, and policies that keep visitors safe.

- **HTTPS everywhere, TLS 1.2/1.3** `[Required]` — Rama terminates TLS;
  verify the certificate auto-renews, and that plain HTTP redirects to HTTPS.
- **HSTS (`Strict-Transport-Security`)** `[Required]` — once we're
  confident in the cert pipeline:
  `max-age=63072000; includeSubDomains; preload`. Submission to the
  preload list is irreversible; do it deliberately after a soak period.
- **Content Security Policy** `[Required]` — strict policy is achievable
  since we have no third-party scripts. Baseline shipped today:
  `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  with per-page SHA-256 hashes (auto-generated by `build.rs`) for every
  inline `<script>`/`<style>`/`<script type="application/ld+json">` and
  the importmap. Tightened from `[Recommended]` to `[Required]` because the
  pipeline now refuses any `'unsafe-inline'` carve-out — drift would break
  CI (`tests/e2e/security_pwa.rs::csp_shape_locked_no_unsafe_inline`).
  Use a nonce or hash for any inline scripts; never `'unsafe-inline'`
  in production.
- **`/.well-known/security.txt`** `[Recommended]` — minimal file with
  `Contact:`, `Expires:`, `Preferred-Languages:`. See [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116).
- **`X-Content-Type-Options: nosniff`** `[Required]` — stops the
  browser from MIME-sniffing a response and reinterpreting (e.g.) JSON
  as HTML.
- **Clickjacking protection** `[Required]` — `CSP frame-ancestors 'none'`
  (preferred, modern) or `X-Frame-Options: DENY`. We never want the app
  embedded in someone else's iframe.
- **`Referrer-Policy: strict-origin-when-cross-origin`** `[Recommended]`
  — sensible default. Don't leak full URLs to third parties on outbound
  link clicks.
- **`Permissions-Policy`** `[Recommended]` — explicitly turn off
  features we don't use: `camera=(), microphone=(), geolocation=(),
  payment=(), usb=(), interest-cohort=()`.
- **Subresource Integrity (SRI)** `[Skipped — no third-party scripts]`.
  We self-host every asset; there is no off-domain script/stylesheet to
  pin a hash to. If a CDN-hosted dependency is ever added, SRI is
  mandatory.
- **Cookie attributes** `[Skipped — no cookies]`. The app stores
  everything in IndexedDB on the device. If a server-side cookie ever
  appears, ship it as
  `__Host-…=…; Secure; HttpOnly; SameSite=Lax; Path=/`.
- **DNS CAA records** `[Recommended]` — restrict which CAs can issue
  certificates for `elementary.training`. Even one record (`0 issue
  "letsencrypt.org"` or whichever issuer we use) prevents
  miss-issuance.
- **DNSSEC** `[Optional]` — nice to have; depends on registrar/registry
  support and adds key-rollover ops complexity.

References: [OWASP Secure Headers](https://owasp.org/www-project-secure-headers/),
[MDN — HTTP headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers).

---

## Performance

Core Web Vitals, caching, images, fonts, network behaviour. The PWA
shell must load fast on a school 3G connection; once cached it must
load instantly.

- **Core Web Vitals targets** `[Required]` — LCP ≤ 2.5s, INP ≤ 200ms,
  CLS ≤ 0.1 at p75. Measure with Lighthouse + field data when
  available.
- **Image optimisation** `[Required]` — WebP/AVIF with a PNG/JPG
  fallback only if needed; serve at the correct intrinsic size for the
  viewport via `srcset` / `<picture>`; always set `width` and `height`
  attributes to reserve space (prevents CLS). See
  [css_and_some_js.md — Aspect Ratio](css_and_some_js.md#aspect-ratio).
- **Lazy loading** `[Recommended]` — `loading="lazy"` on below-the-fold
  images, iframes, and posters. Never on the LCP element (e.g. the
  hero illustration of an exercise).
- **`preload` / `prefetch` / `preconnect`** `[Recommended]` — preload
  the web font(s) and the LCP image. Prefetch the next likely route
  (e.g. the exercise index → first exercise). Preconnect only to
  origins we'll definitely hit.
- **`Cache-Control` headers** `[Required]`
  - Fingerprinted assets (CSS/JS/fonts with content hash in URL):
    `public, max-age=31536000, immutable`.
  - HTML: `no-cache` or `max-age=0, must-revalidate` — the service
    worker handles the offline path; HTTP cache must not pin stale HTML.
  - Service worker itself: `no-cache` so registration always sees the
    current bytes.
- **`No-Vary-Search`** `[Recommended]` — for routes where query
  parameters don't affect the response, declare it so the browser cache
  and BFCache treat them as equivalent.
- **Compression** `[Required]` — Brotli (or zstd) on text responses
  (HTML, CSS, JS, SVG, JSON). Skip on already-compressed media (PNG,
  WebP, AVIF, WOFF2).
- **Web font loading** `[Recommended]` — self-host WOFF2, subset to the
  glyphs actually used (Latin + diacritics + math glyphs), preload the
  critical face, `font-display: swap`. See
  [css_and_some_js.md — Typography](css_and_some_js.md).
- **Critical CSS / render-blocking** `[Recommended]` — inline the
  above-the-fold CSS in `<head>` when feasible. With no build step
  this trades complexity for one fewer round-trip; revisit if Lighthouse
  flags it.
- **Script loading: `defer`, `async`, `type=module`** `[Recommended]`
  — app JS uses `defer` (preserves order, runs after parse).
  Independent third-party (we have none right now) would use `async`.
  ES modules can rely on `type=module` + `<link rel="modulepreload">`.
- **HTTP/2 and HTTP/3** `[Recommended]` — both are enabled at the
  hosting layer. HTTP/3 (QUIC) removes head-of-line blocking on lossy
  mobile networks, which is the school-wifi scenario.
- **Speculation Rules** `[Recommended]` — `<script type="speculationrules">`
  to prefetch/prerender likely next routes (e.g. from the index to
  exercise pages). Keep the list small; over-eager prerendering wastes
  bandwidth on metered connections.
- **View Transitions** `[Recommended]` — cross-document View
  Transitions on same-origin navigations give the PWA an app-like
  feel. See [animations.md — View Transitions](animations.md).
- **Back/forward cache (BFCache)** `[Recommended]` — preserve it. No
  `Cache-Control: no-store` on HTML, no `unload` event handlers, no
  open IndexedDB transactions during pagehide. Test in Chrome DevTools
  → Application → Back/forward cache.
- **`content-visibility` + `contain-intrinsic-size`** `[Recommended]`
  — for long lists (e.g. exercise history) where most rows are
  off-screen.
- **CSS containment (`contain: layout paint`)** `[Optional]` — apply
  to widget-level components when measured perf gains warrant it. Don't
  scatter it preemptively.
- **Scroll-driven animations** `[Optional]` — see
  [animations.md](animations.md). Cheap when used; not core.
- **`scrollbar-gutter: stable`** `[Recommended]` — on long pages, to
  prevent the layout from shifting when content grows past one screen
  and the vertical scrollbar appears.

References: [web.dev — Core Web Vitals](https://web.dev/articles/vitals),
[MDN — HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching).

---

## Resilience

Graceful failure: error pages, offline, the PWA shell.

- **Custom error pages** `[Required]` — `404` (route not found) and
  `5xx` pages return the correct status, explain in plain Dutch what
  happened, and link back to the index. No stack traces, no framework
  branding.
- **Maintenance pages and `503`** `[Recommended]` — when deploying or
  in scheduled downtime, return `HTTP 503` with a `Retry-After` header.
  Search engines treat a 200 "we're down" page as broken content.
- **Offline support & service worker** `[Required for this project]` —
  the PWA pre-caches the shell and uses *network-first-with-timeout*
  for HTML (so updates are picked up online, but a flaky connection
  doesn't block practice). Asset caches use stale-while-revalidate.
  IndexedDB stores per-child progress.
- **Web app manifest** `[Required]` — `manifest.webmanifest` with:
  `name`, `short_name`, `start_url`, `scope`, `display`, `theme_color`,
  `background_color`, `lang="nl-BE"`, `dir="ltr"`, `categories`, and
  the icon set (including a maskable 512×512 PNG and an SVG). Validate
  with Chrome DevTools → Application → Manifest.
- **Monitoring and uptime** `[Recommended]` — at minimum an external
  synthetic check (hit `/healthz` or the index, expect 200) every few
  minutes from a region the audience uses (Belgium / EU). A separate
  status page is optional given the scale.

References: [MDN — PWA best practices](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Best_practices),
[web.dev — PWA checklist](https://web.dev/articles/pwa-checklist).

---

## Privacy

What we collect, why, and what we explicitly don't.

- **Privacy policy** `[Required]` — a short page in plain Dutch saying:
  no account, no tracking, no analytics, no cookies, all practice data
  lives in the child's browser; what the server logs are (request line,
  status, no IP retained beyond 24h) and the retention period; how to
  contact us. Linked from the footer of every page.
- **Cookie consent** `[Skipped — no cookies]`. The site sets no
  cookies, so the EU/UK ePrivacy + GDPR consent requirement doesn't
  apply. The privacy policy still spells this out. If a session
  cookie is ever introduced, consent flow becomes required.
- **Global Privacy Control (GPC)** `[Skipped — nothing to opt out of]`.
  We don't sell or share data; there is no signal to honour.
- **Third-party scripts** `[Avoid]` — none. Every script we ship is
  first-party. If a service (form widget, video player) is ever
  embedded, it gets its own privacy-impact note in the policy and
  comes in via `<iframe>` with `Permissions-Policy`, not direct script.
- **Analytics** `[Skipped — explicit project rule]`. No client-side
  analytics, no funnels, no event pixels. Server-side log aggregates
  (request counts per route) are the only telemetry.
- **Data minimisation** `[Required]` — already enforced: no personal
  data is collected. Re-validate when introducing any new field or log
  line.

References: [EDPB — guidelines on cookies and trackers](https://edpb.europa.eu/),
[ICO — Cookies and similar technologies](https://ico.org.uk/).

---

## Internationalisation

The project is `nl-BE` only today, but the structural choices matter
now so we don't dig a hole.

- **Document language** `[Required]` — `<html lang="nl-BE">`.
- **Inline language switches** `[Required]` — wrap non-Dutch passages
  (e.g. an English exercise name, a French word) in
  `<span lang="...">`.
- **Locale-aware formatting** `[Required]` — dates, numbers, currency,
  units rendered for `nl-BE`. Use `Intl.NumberFormat` /
  `Intl.DateTimeFormat` with the `'nl-BE'` locale (e.g. comma as decimal
  separator, day/month/year order, "uur" for hours).
- **Plural rules** `[Recommended]` — `Intl.PluralRules('nl-BE')` for
  count-dependent strings ("1 oefening" vs "2 oefeningen"). Don't
  hand-roll branching on `n === 1`.
- **International URL structure** `[Recommended, when we localise]` —
  pick *one* pattern (likely `/<lang>/...` subdirectory) and apply it
  consistently. ccTLDs and subdomains are also legitimate; the worst
  choice is mixing them.
- **`hreflang`** `[Recommended, when we localise]` — reciprocal
  `<link rel="alternate" hreflang="...">` between language variants.
  Include `x-default` for the fallback locale. Mirror in the sitemap
  via `xhtml:link`.
- **Localised metadata** `[Recommended, when we localise]` — translate
  every visible string in `<head>` *and* in JSON-LD, not just the
  body.
- **No automatic IP-based language redirect** `[Avoid]` — when we ship
  other languages, never auto-redirect based on geolocation. Offer a
  language switcher, honour `Accept-Language` on the *first* visit
  only as a default selection, and persist the user's explicit choice.
- **Language switcher** `[Recommended, when we localise]` — list each
  locale in its own language ("Nederlands", "English", "Français"),
  each `<a lang="...">`.
- **RTL & bidirectional text** `[Skipped — no RTL locales planned]`.
  CSS logical properties (`margin-inline`, etc.) are already used
  throughout (see [css_and_some_js.md](css_and_some_js.md#block-vs-inline-directions-and-logical-properties)),
  so the day RTL is added, it's mostly free.
- **CJK writing modes** `[Skipped]`. Not on the roadmap.
- **Internationalised Domain Names (IDN)** `[Skipped]`. The domain is
  ASCII.

References: [W3C i18n — Language tags](https://www.w3.org/International/articles/language-tags/),
[MDN — Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl).

---

## Well-Known URIs

Standard agreed paths under `/.well-known/`. Most aren't relevant; the
exceptions are.

- **`/.well-known/security.txt`** `[Recommended]` — see Security above.
- **`/.well-known/change-password`** `[Skipped — no user accounts]`.
- **`/.well-known/openid-configuration`** `[Skipped — no OIDC]`.
- **`/.well-known/apple-app-site-association`**, **`assetlinks.json`**
  `[Skipped — no native apps]`.
- **`/.well-known/webfinger`**, **`nodeinfo`** `[Skipped — not
  federated]`.
- **`/.well-known/api-catalog`**, **`/.well-known/traffic-advice`**
  `[Skipped — no APIs, no prefetch-proxy story]`.

Registry: [IANA Well-Known URIs](https://www.iana.org/assignments/well-known-uris/).

---

## Agent Readiness

Things that make the site legible to AI crawlers and assistants.
For a small, child-focused, single-language site this is mostly a
"keep the basics right" story, not a heavy build-out.

- **Stable URLs** `[Required]` — once published, a URL keeps working.
  This is also a hard requirement for the offline cache (the SW keys
  on URL) and for parents who bookmark exercises.
- **Structured data** `[Recommended]` — see SEO above. Schema.org
  `LearningResource` / `Course` types on exercise pages give agents
  typed facts they can quote correctly.
- **`robots.txt` for AI crawlers** `[Recommended]` — explicit
  allow/disallow per named user-agent (`GPTBot`, `Google-Extended`,
  `ClaudeBot`, `PerplexityBot`, etc.). We're a public educational
  resource; default is "allow", but we record the decision so we can
  reverse it per vendor later.
- **`/llms.txt`** `[Optional]` — short, curated index of the most
  important pages. Worth adding once the site has a stable shape.
- **`/llms-full.txt`** `[Optional]` — full Markdown of key pages
  concatenated. Defer; not free to maintain.
- **Per-page Markdown source** `[Optional]` — `Accept: text/markdown`
  or `.md` suffix. Defer; nice if/when the docs corpus grows.
- **MCP, A2A, NLWeb, WebMCP, DNS-AID, Web Bot Auth, Schemamap, Agent
  Skills** `[Skipped — out of scope]`. The site exposes no APIs or
  tools to agents; nothing to discover. Revisit only if the project
  ever ships a programmatic surface.

References: [llmstxt.org](https://llmstxt.org/),
[schema.org/LearningResource](https://schema.org/LearningResource).
