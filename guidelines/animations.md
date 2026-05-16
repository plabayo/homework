# Animations — working guidelines

Companion to [css_and_some_js.md](css_and_some_js.md). That document covers the *language* of CSS animation — transforms, transitions, keyframes, scroll-driven primitives, focus rings, reduced-motion gates. **This** document is about the *craft*: which animation to pick, how to make it feel alive, how to keep it accessible and fast, and which platform APIs (CSS, Web Animations API, View Transitions, SVG, Canvas) earn their place in which situations.

The whole document assumes **vanilla HTML/CSS/JS** — no frameworks, no JS animation libraries. The web platform is rich enough on its own.

Cross-references to the CSS doc are deliberately dense — when a concept is already explained there, we link instead of re-stating. Read both, but lean on this one when you're deciding *what to build*.

## How to use this document

- Skim the top sections (principles, design tricks, accessibility) before designing any motion.
- Use the SVG / Canvas / Scroll / View-Transition sections as deep-dive references when you actually reach for that primitive.
- The **gotcha** call-outs are the high-value parts. Most polished animations are 10% concept and 90% small-bug avoidance.
- Code is recipe form: a working snippet stripped of distractions. Copy-paste, then trim further for your scenario.

## Guiding principles

- **Motion serves the user, not the designer.** Every animation should answer a question the user has, mark a state change they caused, or reinforce that a system is responsive. If you can't articulate the reason, cut it.
- **Progressive enhancement.** Motion is decoration. Build the un-animated page first; layer motion on top. Old browsers, reduced-motion users, and motion-skipping return visitors should all reach the destination — they just take a quieter route.
- **Default to no motion.** `prefers-reduced-motion: no-preference` is the *only* gate we trust. The opposite of "I want motion" is the safe default. (See [Motion accessibility](#motion-accessibility).)
- **Tokenize.** Durations, easings, and springs are design tokens, not free-form values. Three or four well-tuned curves cover most products.
- **Cohesion over novelty.** A site with three repeating motion concepts feels designed. A site with thirty bespoke animations feels random. (Inspired by Josh Comeau's "the big mistake.")
- **Off-main-thread by default.** CSS keyframes, transitions, and the Web Animations API run on the compositor. `requestAnimationFrame` and most JS libraries don't. Choose accordingly. (More: [CSS vs JS](#css-vs-js-when-to-reach-for-what).)

## Contributing

Same rules as the sibling CSS doc — be opinionated, be terse, prefer code recipes over prose, and call out gotchas explicitly. If a section gets long, split it.

---

## Animation categories

Sorting an animation into a category before building it forces you to answer "why is this here". Four useful buckets:

1. **Tangible** — make the UI feel like a physical surface. Cards lift on hover, buttons press in, drawers slide. Subtle. Often subconscious. Users notice their absence more than their presence.
2. **Informative** — show how a system works. Diagrams that animate to explain a flow, progress indicators, expanding/collapsing detail. The animation *is* the content. Must have a static fallback because reduced-motion users still need the information.
3. **Attention-focusing** — direct the eye to a change. Error shake, badge bounce, "new message" pulse. Powerful and easily abused. Use sparingly; the more often you signal urgency, the less urgent each one feels.
4. **Joyful** — exist purely for delight. Confetti, mascots, gradient sweeps. The business case is differentiation; the failure mode is feeling try-hard. Match your product's voice.

Categories overlap. The point isn't taxonomy — it's that every animation should belong to at least one bucket, on purpose.

---

## A small grammar of motion

Most polished animations are stacks of these primitives. Internalize the vocabulary and the rest is composition.

| Primitive | What it is | Where it lives |
|---|---|---|
| Transform | `translate` / `scale` / `rotate` / `skew` applied post-layout | [CSS doc — Transforms](css_and_some_js.md#1-transforms) |
| Transition | Interpolate property changes over time | [CSS doc — Transitions](css_and_some_js.md#2-transitions) |
| Keyframes | Multi-stop animation, replayable, independent of state change | [CSS doc — Keyframe animations](css_and_some_js.md#3-keyframe-animations) |
| Timing function | Maps progress→time (built-ins, `cubic-bezier`, `linear()`, `steps`) | [CSS doc — Timing functions](css_and_some_js.md#timing-functions) |
| Spring | Physics-based settle: stiffness/damping/mass, no fixed duration | This doc — [Springs](#springs-physics-as-an-easing-language) |
| Web Animations API (WAAPI) | `element.animate(keyframes, options)` — JS interface to the same compositor that runs CSS | This doc — [CSS vs JS](#css-vs-js-when-to-reach-for-what) |
| View Transition | Snapshot-and-tween over DOM mutations | This doc — [View Transitions](#view-transitions) |
| Scroll-driven animation | Drive any of the above off scroll progress | [CSS doc — Scrolling](css_and_some_js.md#6-scrolling) + this doc |
| Canvas / WebGL | Per-frame raster painting | This doc — [Canvas](#canvas) |

---

## Animation design tricks

The handful of micro-patterns that distinguish "moves on screen" from "feels good to use".

### Asymmetrical in vs out

In and out should rarely use the same duration, easing, or even direction. The press is snappy; the release is luxurious. Or the opposite. Sameness reads as cheap.

```css
.btn {
  transition: background 400ms; /* slow on revert */
}
.btn:hover {
  transition: background 100ms; /* snappy on hover */
  background: var(--accent);
}
```

Push further with different easing curves per direction — a stiff spring in, a `cubic-bezier(0.65, 0, 0.35, 1)` out. Watch out: if hover-out is slow + dramatic, rapid mouse-passes leave a trail of half-formed states. Mitigation: make the resting state cheap (matches background), so an interrupted return looks intentional.

### Boops (overshoot + revert)

Plain hover-rotate looks lopsided because rotation only ever goes one way. Apply the transform on enter, then *remove* it after ~150ms via JS. The element wobbles past the resting state and returns — like booping a dog's nose.

```js
btn.addEventListener('mouseenter', () => {
  if (!matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  target.classList.add('is-booped');
  setTimeout(() => target.classList.remove('is-booped'), 150);
});
```

```css
.target { transition: transform var(--spring-bounce) 1500ms; }
.is-booped { transform: rotate(20deg); }
```

The spring is intentionally long-running (~1500ms) but the boop ends much sooner. CSS spring interrupts are *distance-based*, not time-based — the snap-back uses the remaining curve, which by then is almost all settle.

### Squash and stretch

Disney's first principle. Objects deform along their axis of motion to sell weight. Subtle (10–30%) reads as solid material; exaggerated (50%+) reads as cartoon.

The trick that makes this clean is using the standalone `translate:` and `scale:` properties so multiple keyframes don't fight inside one `transform` declaration:

```css
@keyframes bounce {
  0%   { translate: 0 0; }
  45%  { translate: 0 -200px; }
  50%  { translate: 0 0; }
  55%  { translate: 0 -200px; }
  100% { translate: 0 0; }
}
@keyframes squash {
  0%, 50%, 100% { scale: 1 1; }
  5%, 55%       { scale: 1.2 0.7; } /* impact frames */
}
.ball { animation: bounce 1s ease-out infinite, squash 1s ease-out infinite; }
```

(Standalone `translate`/`scale`/`rotate` properties get their order *fixed* by the spec — scale → rotate → translate — regardless of declaration order. Prefer them when you want independent animation tracks; prefer `transform` when you need explicit composition order.)

### Button scaling — scale the chrome, not the text

Scaling a whole `<button>` blurs the text and triggers GPU↔CPU font snapping. Scale a pseudo-element instead:

```css
.btn {
  position: relative;
  isolation: isolate;
  border: none;
  background: transparent;
}
.btn::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border: 1px solid currentColor;
  border-radius: 4px;
  transition: transform 200ms;
}
.btn:hover::before { transform: scale(1.1); }
```

`isolation: isolate` is load-bearing — without it, `z-index: -1` falls behind the page background. (Stacking context refresher: [CSS doc](css_and_some_js.md#stacking-contexts--z-index).)

For *symmetric* (fixed-pixel) growth instead of proportional, animate `width`/`height` with `calc(100% + Npx)` and counter-offset with `inset: calc(-N/2)`. Costs you a reflow but balances tall/long buttons.

### Stagger

Animating a parent and its children together creates a "moment of chaos" where half-revealed scaffolding overlaps half-revealed content. Offset the child by 30–70% of the parent's duration:

```css
.dialog { transition: transform 300ms; }
.dialog .content { transition: opacity 200ms; transition-delay: 150ms; }
```

On exit, reverse the order — child fades first, then parent collapses. Keep the perceived total under ~500ms; users start to feel waiting after that.

### Nested transforms — secondary motion for free

Wrap a child element with its own `transform-origin` inside an animating parent. The child inherits the parent's motion, but its independent transform pivots around itself — instant follow-through.

Example: a bomb body rotates while the fuse on top flops at its own pivot point.

```css
.bomb { transform-origin: 50% 100%; transition: rotate var(--spring) 600ms; }
.bomb .fuse { transform-origin: 50% 100%; transition: rotate var(--spring) 600ms; }
.bomb:hover { rotate: 15deg; }
.bomb:hover .fuse { rotate: 30deg; } /* over-rotates beyond parent */
```

Cascading durations across nested children (250ms, 500ms, 750ms…) make multi-joint chains wave like a finger uncurling.

Polished motion sometimes needs a small `setTimeout` to delay the child kick-off by ~100ms after the parent — the child *gets flung*, not towed. Don't refactor that to `animationend`; it's flaky in practice.

### Action-driven animations

State transitions are too coarse. `open` ↔ `closed` doesn't distinguish "user cancelled" from "user confirmed." Model the *action* instead:

```html
<dialog data-action="confirm">…</dialog>
```

```css
.dialog[data-action="open"]    { transform: translateY(0); }
.dialog[data-action="cancel"]  { transform: translateY(100%) rotate(-20deg);
                                  filter: blur(10px); opacity: 0; }
.dialog[data-action="confirm"] { transform: translateY(100%);
                                  transition: transform 600ms cubic-bezier(0.54, -0.8, 1, 0.9); }
```

The animation now tells the user *which button they pressed* — a genuinely informative micro-interaction.

Gotcha: leaving the attribute set means reopening starts from the exit pose. Either clear it via `setTimeout` after the exit duration, or use standalone `rotate:`/`scale:`/`translate:` so each can have its own transition and the "open" state just snaps back. Always clear pending timeouts when a new action fires mid-animation.

### Pattern: animation tokens

Treat curves and durations as design tokens, declared once at the root.

```css
:root {
  --ease-smooth: cubic-bezier(0.33, 1, 0.68, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-quick: 150ms;
  --dur-default: 300ms;
  --dur-slow: 600ms;

  --spring-smooth: var(--ease-smooth);
  --spring-smooth-time: var(--dur-default);

  @supports (animation-timing-function: linear(0, 1)) {
    --spring-smooth: linear(/* generated curve */);
    --spring-smooth-time: 900ms;
  }
}

.elem { transition: transform var(--spring-smooth-time) var(--spring-smooth); }
```

Springs deserve a paired duration token because spring generators bake the curve to a specific duration — running it faster or slower distorts the physics. (More in [Springs](#springs-physics-as-an-easing-language).)

The CSS-variable fallback trick (declare twice, browser picks the one it understands) **does not work for `linear()` inside variables** — browsers validate variables syntactically, not by resolved value. Use `@supports` blocks instead.

### The "Big Mistake"

Treating each animation as a one-off. Cohesion comes from a small set of repeated motion concepts, applied consistently — not from one shared component.

Examples that work: "everything brightens on hover" (Linear), "all interactive arrows stretch" (Comeau's blog), "all entrances slide up + fade in." If you can't articulate a motion concept yet, pick 2–3 arbitrary rules and apply them consistently. Cohesion first, sophistication later.

### Juice

The polish layer that turns a working feature into something users want to share. Sound, particles, squash, easing nuance, surprise-but-not-randomness. Worth watching: Jonasson & Purho's "Juice it or lose it" GDC talk.

A non-negotiable rule: **whimsy can't be `npm install`-ed**. The default `canvas-confetti` no longer sparks joy because it's been on a thousand sites. Build bespoke. The novelty *is* the value.

---

## Motion accessibility

Many users have a documented reason to limit motion: vestibular disorders, migraines, dyslexia, ADHD, autism, photosensitive epilepsy, traumatic brain injury, motion sickness. The OS-level "Reduce motion" setting surfaces through `prefers-reduced-motion`. Honoring it is non-negotiable.

The CSS-doc primer is here: [Reduced motion](css_and_some_js.md#reduced-motion). Repeating the load-bearing rule:

```css
/* default = no motion */
.thing { /* static styles */ }

@media (prefers-reduced-motion: no-preference) {
  .thing { transition: transform 300ms; }
}
```

The query is `no-preference`, not `reduce`. Wrapping motion in `no-preference` means *older browsers that don't understand the query also get the static experience by default* — a safer fail-state than the inverse.

### What counts as "motion"

Not just translation. Fades that read as motion (a scanning marquee fade-in across cells) should also be disabled. The user's nervous system doesn't care about the underlying CSS property. If in doubt, disable.

### Reading the preference from JS

```js
const reduced = !window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

// respond to runtime changes:
matchMedia('(prefers-reduced-motion: no-preference)')
  .addEventListener('change', e => updateMotion(e.matches));
```

Don't take a single snapshot at load — users can toggle the OS setting without reloading. Always listen for the `change` event.

### The media query has to be wired up

The OS setting alone doesn't disable anything on a web page. Every CSS animation must sit inside `@media (prefers-reduced-motion: no-preference)`, and every JS-driven motion must check `matchMedia(...).matches` before doing work. Easy to forget when adding a one-off effect later — make it a code-review checklist item.

### Override UI

Where motion *is* the experience (a marketing site full of scroll-driven choreography), offer an in-page toggle in addition to honoring the OS setting. The OS setting is global and may be too coarse — a user might want reduced motion in their email client but not on your site, or vice-versa.

### Photosensitive epilepsy

Hard cap: never produce more than 3 flashes per second across more than ~25% of the viewport. This is a WCAG criterion, not an aesthetic preference. A common way to produce accidental flashing: feedback loops in cursor interactions where the element being scaled is also the element being measured. (See [Cursor interactions](#cursor-interactions).)

### Auto-play and sound

Anything that plays sound or autoplays motion at page load is hostile in addition to inaccessible. Gate behind explicit interaction.

---

## CSS vs JS: when to reach for what

A pragmatic decision tree, ordered by cost-of-reaching-for-it.

1. **Pure state change you can model with `:hover`, `:focus-visible`, `:checked`, `:has()`, attribute selectors, etc.** → CSS transition.
2. **Looping or scripted multi-step animation with no external input** → CSS `@keyframes`.
3. **DOM mutation** (reorder, insert, remove, swap layout) **that you want to look continuous** → View Transitions (same- or cross-document).
4. **JS-orchestrated multi-step sequences** (toggle classes, swap CSS custom properties, run programmatic timelines) → WAAPI (`element.animate(...)`) or class/variable toggling that triggers a CSS transition.
5. **High-frequency JS-driven motion** (pointermove, gyroscope, audio analysers) → vanilla `requestAnimationFrame` writing to CSS custom properties or transforms; a small hand-rolled spring if you want physics.
6. **Per-frame physics, particle systems, generative art, >1000 moving shapes** → Canvas.
7. **3D, shaders, fluid sims** → WebGL / WebGPU. Separate discipline.

The CSS↔JS divide isn't about complexity, it's about *thread*. CSS animations, CSS transitions, and the Web Animations API all run on the compositor thread; they keep playing smoothly even when JS is busy. `requestAnimationFrame` runs on the main thread; it hitches under load.

CSS keyframes also guarantee that a 1000ms animation finishes 1000ms after it started — they track wall-clock, not frame count. That makes them safer than hand-rolled RAF loops for sequencing logic and cleanup timeouts (RAF callbacks pile up if frames run long).

### Web Animations API in two minutes

`element.animate()` is CSS keyframes from JavaScript — same compositor, same off-main-thread guarantees, but with a real `Animation` object you can pause, reverse, listen to (`finished` is a Promise), and compose.

```js
const anim = el.animate(
  [{ transform: 'translateY(0)' }, { transform: 'translateY(-200px)' }],
  { duration: 600, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', fill: 'forwards' }
);
await anim.finished;
```

Useful when CSS gets clumsy: dynamically computed end states, orchestrated chains, cancel-and-replay on user input. Anything you'd reach for a JS animation library for, WAAPI usually covers without adding a dependency.

---

## Timing functions & easing

The CSS doc covers built-ins, `cubic-bezier()`, the cheap/expensive property table, and the doom-flicker trap: [Timing functions](css_and_some_js.md#timing-functions). Add to those notes:

### Which built-in for which feel

- `linear` — almost never for movement (feels mechanical). Perfect for endless rotation (spinners). Default for scroll-driven animations.
- `ease-in` — starts slow, snaps off. Things *leaving* the screen.
- `ease-out` — opposite. Things *entering* from offscreen.
- `ease-in-out` — symmetric. Best with `alternate iteration-count: infinite` for oscillation. Easy to overdo.
- `ease` (default) — asymmetric fast-out / slow-stop. The most broadly useful generic curve.

The built-ins are *subtle*. For impactful motion, write a custom `cubic-bezier`. Generators like Easing Wizard help you visualise.

### Going past 0–1

`cubic-bezier()` can extend its handles past 1.0 (`cubic-bezier(0.5, 1.5, 0.5, 1)`) to overshoot for a small bounce. Past about 0.3 of overshoot it starts looking unnatural — switch to `linear()` springs.

### `linear()` — springs in pure CSS

`linear(p0, p1, ..., pN)` defines an easing curve as a polyline through control points, evenly distributed by default. Add explicit `%` positions to cluster points around interesting bends:

```css
transition: transform 500ms linear(
  0, 0.55, 0.93, 1.13, 1.16, 1.10, 1.02, 0.98, 0.99, 1
);
```

This is how you bake spring physics into pure CSS. Three things to know:

- **Never hand-author.** Use a generator (Linear() Easing Generator, Easing Wizard) — 25–50 strategically placed points beat any number of evenly-spaced ones.
- **Always tokenize** as a CSS variable so the next person doesn't paste the polyline into ten places.
- **Always pair with a duration token.** Spring generators derive the curve from physics + a target duration; running at a different duration distorts the physics. A `--spring-smooth` variable should always travel with a `--spring-smooth-time` partner.

### `linear()` limitations

- **Time-bound.** Real springs settle when energy runs out; CSS needs a `duration`. Zero-damping infinite springs are impossible to model.
- **Interrupts compress the rebound.** CSS applies a "reversing shortening factor" — interrupt at 50% and the reverse runs over 50% of the original duration. The same polyline data gets squeezed in time, making it feel artificially tight. No fix at the CSS level. For high-traffic interruptible animations, drive a [hand-rolled spring](#a-hand-rolled-spring-for-high-frequency-input) instead.
- **Performance is fine.** Even very large polylines add only ~1KB gzipped each.

A native `spring()` timing function has been proposed for a decade and may still ship. Safari had one in 2017; nobody followed.

---

## Springs (physics as an easing language)

A spring simulation has three knobs:

- **Stiffness** (a.k.a. tension) — how tightly coiled. High = energetic and boingy. Low = smooth glide.
- **Damping** (a.k.a. friction) — environmental resistance. 0 = oscillate forever (vacuum). High = molasses.
- **Mass** — leave at 1; rarely earns its keep.

A spring has *no fixed duration*. It runs until it settles.

### Tuning order (rule of thumb)

1. Set damping ≈ 20 as neutral.
2. Tune stiffness until the speed (A→B) feels right. Ignore bounciness for now.
3. Tune damping for vibe. Low = bouncy. High = lush.
4. Touch mass only if everything else is dialled in and you need finer control.

### Springs aren't a replacement for every Bézier

A loose spring looks similar to an exaggerated `ease-out`, but you can't model `ease-in` with one — springs always read as "ease"-style with an optional overshoot. Don't replace all your Béziers; reach for springs when motion represents a physical object or responds to direct user input.

### Springs in pure CSS

For most "state A → state B" cases, the cleanest spring is a precomputed `linear()` curve tokenised as a CSS variable (see [`linear()`](#linear--springs-in-pure-css) above). One generator pass, one transition, no JS:

```css
.target { transition: transform var(--spring-smooth-time) var(--spring-smooth); }
```

The trade-off is the interrupt problem: precomputed curves get time-compressed when interrupted mid-flight. For state-toggle UI (open/close, hover/unhover) that's almost always fine.

### A hand-rolled spring for high-frequency input

When you need true carry-over velocity — e.g. a pupil that smoothly chases the cursor wherever it goes — drive a small per-frame integrator yourself. ~20 lines, no dependency:

```js
function makeSpring({ stiffness = 200, damping = 20, mass = 1 } = {}) {
  let value = 0, velocity = 0, target = 0;
  let raf = null, last = 0;

  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.064); // clamp to ~4 frames at 60Hz
    last = now;
    const force = -stiffness * (value - target);
    const drag = -damping * velocity;
    const accel = (force + drag) / mass;
    velocity += accel * dt;
    value += velocity * dt;

    onChange(value);

    if (Math.abs(velocity) > 0.01 || Math.abs(value - target) > 0.01) {
      raf = requestAnimationFrame(tick);
    } else {
      value = target;
      onChange(value);
      raf = null;
    }
  }

  let onChange = () => {};
  return {
    set(next) {
      target = next;
      if (raf == null) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    get: () => value,
    onChange(fn) { onChange = fn; },
  };
}

const sx = makeSpring({ stiffness: 200, damping: 20 });
const sy = makeSpring({ stiffness: 200, damping: 20 });
sx.onChange(x => pupil.style.setProperty('--x', x + 'px'));
sy.onChange(y => pupil.style.setProperty('--y', y + 'px'));

window.addEventListener('pointermove', e => {
  if (!matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
  sx.set(e.clientX - centerX);
  sy.set(e.clientY - centerY);
});
```

```css
.pupil { transform: translate(var(--x, 0), var(--y, 0)); }
```

Writing values to CSS custom properties (read by a CSS `transform`) is cheaper than rewriting `style.transform` per-frame, and it keeps the spring code agnostic about which property it drives.

The RAF auto-stops when the spring settles, then restarts when `set()` is called with a new target — no idle frame work.

### Standalone `translate` / `scale` / `rotate` properties

CSS now has standalone properties (no `transform:` prefix). The killer feature: **independent animation tracks**. Two keyframes can target `translate` and `scale` simultaneously without overwriting each other.

```css
@keyframes bounce { 0%, 100% { translate: 0 0; } 50% { translate: 0 -200px; } }
@keyframes squash { 0%, 100% { scale: 1 1; } 50% { scale: 1.1 0.85; } }
.ball { animation: bounce 1s ease-out, squash 1s ease-out; }
```

Trade-offs:

- No `skew`, no 3D variants, no single-axis shortcuts (must pad: `scale: 1 0.5`).
- ~95% support; slightly less than `transform`.
- **Built-in compositing order is fixed** — scale → rotate → translate, regardless of declaration order. With `transform:` you control order.

Default to `transform`; reach for standalone properties when you actively need independent tracks.

---

## Layout animations — the FLIP technique

CSS transitions can't bridge layout changes: flexbox reorder, swapping `display: flex → grid`, inserting/removing children, items moving between containers. The web platform's answer to most of this is now [View Transitions](#view-transitions). When VT isn't a fit (you need fine control over the tween, or you want carry-over velocity), reach for the classic **FLIP** technique — pure DOM, no dependencies.

**FLIP = First, Last, Invert, Play:**

1. **First** — measure the element's current rect with `getBoundingClientRect()`.
2. **Last** — mutate the DOM into its new state; measure again.
3. **Invert** — apply a counter-transform that makes the element *look* like it's still in its old position.
4. **Play** — remove the counter-transform with a transition, so the element animates into its real new position.

```js
function flipMove(el, mutate) {
  const first = el.getBoundingClientRect();
  mutate();
  const last = el.getBoundingClientRect();

  const dx = first.left - last.left;
  const dy = first.top  - last.top;
  const sx = first.width  / last.width;
  const sy = first.height / last.height;

  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
      { transform: 'none' },
    ],
    { duration: 400, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' }
  );
}
```

Works for siblings reordering inside a flex container, items being added/removed, or any other layout-affecting mutation. Combine with WAAPI (as above) for clean cancellation and chaining.

**Gotchas:**

- **Text warps under non-uniform scale.** If the box's aspect ratio changes, scaled text looks stretched. Either keep the inner content's box from changing shape (use shrinkwrap + flex centering inside) or counter-scale a nested element.
- **`display: inline` can't be transformed** — switch to `inline-block` or `block`.
- **Rounded corners distort under non-uniform scale.** Either animate `border-radius` separately, or commit to uniform scaling.
- **Don't run FLIP on every layout change.** It's noise for the user. Reserve it for state changes the user caused.

---

## View Transitions

The View Transition API animates DOM mutations (reorders, swaps, navigations) that CSS transitions can't reach. The browser takes a "before" snapshot, runs your callback, takes an "after" snapshot, and tweens between them with auto-generated pseudo-elements.

### Same-document

```js
document.startViewTransition(() => {
  // mutate DOM however you want
  shuffledItems.forEach(el => grid.appendChild(el));
});
```

Default behaviour is a cross-fade. For per-element morphing (tiles sliding to new positions), give each element a unique `view-transition-name`:

```html
<label class="tile" style="view-transition-name: tile-A">…</label>
```

Wrap calls in `if (document.startViewTransition)` to feature-detect; without it, the mutation just happens instantly (the graceful fallback).

### View-transition classes (bulk styling)

When many elements share a transition style, `view-transition-class` lets you target them all without listing each name:

```css
.tile { view-transition-class: connections-tile; }
::view-transition-group(.connections-tile) { animation-duration: 500ms; }
```

You still need unique `view-transition-name` per element. Classes are a CSS-selector helper on top.

`view-transition-name: match-element` (newer) auto-generates a unique name per node — works when each element only needs to morph "in place," not across pages.

Mental model:

- **Group** — pseudo-element wrapping a transitioning bit of UI.
- **Name** — unique ID that creates a group.
- **Class** — bulk selector across groups.

### Cross-document transitions

Replace the JS trigger with a CSS at-rule. Browser auto-runs the transition on same-origin navigation:

```css
@view-transition { navigation: auto; }
.site-header  { view-transition-name: site-header; }
.main-content { view-transition-name: main-content; }
```

**Limitations:**

- **Same-origin only.** No subdomains, no different sites.
- **Put `@view-transition` in an inline `<style>` per page**, not a shared stylesheet. Ad-blockers occasionally strip remote CSS in transit and break ~30–40% of cross-doc transitions.
- **The target must be in the initial HTML** of the new page. Async-loaded content can't match in time.
- ~80% support as of early 2026; Firefox lags. Graceful fallback = no transition.

### Gotchas — the hard parts

**1. Transforms on `::view-transition-group` get clobbered.**

The browser internally positions each group via `transform: matrix(...)` to align it with the original element. Your `transform: translateY(100%)` keyframe *replaces* that matrix → the element animates from the wrong starting point.

Two fixes:

- **(Preferred) Animate a descendant.** The pseudo-tree is `::view-transition-group` → `::view-transition-image-pair` → `::view-transition-old` / `::view-transition-new`. Apply your custom animation to `::view-transition-image-pair` or the old/new pair — they don't carry the positioning matrix.
- **`animation-composition: add`.** Sums keyframe values onto the existing transform instead of overwriting.
```css
::view-transition-group(dialog) {
  animation: slide-in 300ms;
  animation-composition: add;
}
```

**2. Lethargic scrolling during a transition.**

If the user scrolls mid-transition, the element lags. The positioning matrix needs to update with scroll, but it's already being interpolated — scroll's instant update gets folded into the easing curve. Considered working-as-intended. Mostly invisible at ≤500ms durations.

**3. Clipped elements escape `overflow: hidden`.**

Transition pseudo-elements paint on a top-layer, so a parent's `overflow: hidden` no longer applies. Use nested view-transition groups:

```css
.clipper {
  view-transition-name: clipper;
  view-transition-group: contain;
  overflow: hidden;
  border-radius: 16px;
}
::view-transition-group(clipper) { overflow: hidden; border-radius: 16px; }
```

`view-transition-group: contain` is Chromium-only as of early 2026; gate with `@supports`. Don't merge selectors across the real element and its pseudo — if a browser doesn't understand the pseudo, the *entire rule* is discarded.

**4. Asymmetric size / aspect-ratio / text changes look bad.**

VT cross-fades between two visually-different UIs. If proportions or content differ wildly, the fade looks wrong. Ask: do you actually need VT here? For a single numeric CSS change (e.g. `width: 200px → 400px`), a plain CSS transition is better. Reach for VT when the change is a true *layout reshape*.

### Interrupts and view transitions

VT can't be interrupted gracefully by re-triggering the same action. Two underlying reasons:

- The pseudo-element covers the real button → fix with `::view-transition { pointer-events: none; }`.
- The browser *moves* (not copies) painting and hit-testing onto the pseudo during the transition. Even with pointer-events disabled, the underlying button can't receive clicks. Keyboard still works.

Mitigations:

- Keep transitions short (≤250ms) so realistic click rates never overlap.
- Design an exaggerated `ease-out` where 80–90% of motion happens in the first 10–20% of the duration — by the time an interrupt arrives, the element is near its destination and fast-forwarding is invisible.
- Disable the root: `:root { view-transition-name: none; }` keeps the rest of the page interactive.

If you need *truly* interruptible animation, fall back to FLIP + WAAPI as shown in [Layout animations](#layout-animations--the-flip-technique) — WAAPI animations can be cancelled, reversed, or have new ones layered over them without the View Transition restrictions.

---

## Scroll-driven & scroll-triggered animations

Two distinct techniques:

- **Scroll-driven** — animation progress is bound to scroll progress. Scrubbed by the user's wheel/swipe/keyboard. Reading-progress bars, parallax, scrollytelling.
- **Scroll-triggered** — a normal time-based animation that *fires once* when scroll passes a threshold. The trigger is the scroll; the playback is its own clock.

### Scroll-driven — `animation-timeline`

The CSS doc has the `scroll-margin-top` / sticky / smooth-scroll basics: [Scrolling](css_and_some_js.md#6-scrolling). The new primitive is `animation-timeline`:

```css
.box {
  animation: spin linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 150%;
}
```

- `animation-timeline: scroll()` — total page scroll progress. Reading indicators.
- `animation-timeline: view()` — element's travel through the viewport.
- `animation-range`: `cover` (default — first pixel in to last pixel out), `contain` (only while fully visible), `entry`, `exit`. Custom `%` ranges allowed.

**Always pair with `animation-fill-mode: both`.** Outside the active range, keyframe styles aren't applied — a `fadeIn` with `entry` range would show as fully opaque before activating. `both` pins the start state before entry and the end state after exit, eliminating the one-frame flicker.

```css
animation: fadeIn linear both;
animation-timeline: view();
animation-range: entry 0% entry 100%;
```

**Forced scroll root.** Scroll timelines default to the nearest scroll *ancestor* — which inside a flex layout might be unexpected. Force the document viewport:

```css
animation-timeline: scroll(root block);
```

`block` = vertical, `inline` = horizontal.

**Support.** ~85% as of mid-2026. No Firefox yet. Polyfill exists but struggles with advanced cases — import the submodule directly. Graceful fallback: animation just doesn't play (the element stays at its rest state, which `both` pins for us).

### Linked timelines (`timeline-scope`)

Drive element A's animation from element B's view-progress — for scrollytelling where a sidebar visualisation responds to text scrolling past.

```css
main { timeline-scope: --content; }
.content { view-timeline: --content; }
.diagram {
  animation: explain both;
  animation-timeline: --content;
  animation-range: contain;
}
```

`timeline-scope` on a common ancestor hoists the timeline name so sibling/cousin elements can reference it. The polyfill doesn't support `timeline-scope`.

### Parallax — the canonical example

```css
@keyframes parallax {
  from { transform: translateY(var(--from)); }
}

@media (prefers-reduced-motion: no-preference) {
  .wrapper img {
    animation: parallax linear;
    animation-timeline: scroll();
  }
}
```

```html
<img src="sky.png" />
<img src="far-mountains.png"  style="--from: 10px" />
<img src="near-mountains.png" style="--from: 60px" />
```

Each layer reads its own `--from` offset. At scroll-bottom every layer settles to `translateY(0)`. The polyfill handles CSS variables in keyframes poorly — assume the parallax just won't run there.

**Parallax is the canonical motion-sickness trigger.** This is not a grey-area; always gate behind `prefers-reduced-motion: no-preference`.

### Scroll-triggered — `IntersectionObserver`

Today's tool until `animation-trigger` lands (~2027):

```js
const obs = new IntersectionObserver(([entry]) => {
  el.classList.toggle('visible', entry.isIntersecting);
}, {
  threshold: 0.5,        // 50% visible
  rootMargin: '-32px',    // fires 32px later
});
obs.observe(el);
```

- "Intersecting" means the bounding box overlaps the viewport at all — `threshold: 0` triggers on a single pixel.
- `threshold: 1` triggers only when fully contained.
- `rootMargin` (CSS-shorthand syntax) grows/shrinks the comparison rect. Negative inset → fires *later* (after deeper scrolling). The only way to delay past full containment.
- Inside an iframe, set `root: document` explicitly.

### Scroll-driven vs scroll-triggered — picking

- Use **driven** when the animation *is* the readout of scroll progress (reading bars, parallax, scrubbed scrollytelling).
- Use **triggered** when the animation has its own choreography that shouldn't be paused mid-flight (a mascot slide-in with rotation + speech bubble).
- When in doubt, either works.

### Don't override native scrolling

Smooth-scroll libraries (Lenis, etc.) intercept native scroll input and apply physics. They hijack the user's chosen input device — paper-precise trackpad gestures become lethargic and blurred. They typically ignore `prefers-reduced-motion` and can trigger vestibular symptoms.

**Default rule: no smooth-scroll wrappers.** Push back if asked. Sticky / fixed pinning is fine — the user can still scroll normally. The litmus test: *can the user still scroll the way they would on any other site?*

### Sticky-blocker trick

A clean pure-CSS handoff between hero and main content under a transparent sticky header. Each section ships its own sticky "blocker" div that matches the section's background. The blocker is contained by its parent, so it stops following at the section boundary.

```css
html { --header-height: 4rem; }
header { position: fixed; top: 0; height: var(--header-height); z-index: 1; }
.blocker { position: sticky; top: 0; height: var(--header-height); }
.hero .blocker { background: var(--blue); }
.main .blocker { background: white; }
```

```html
<header>…</header>
<section class="hero"><div class="blocker"></div>…</section>
<section class="main"><div class="blocker"></div>…</section>
```

Trade-off: each section needs enough vertical room below the visible content to "stash" its blocker. If the design is tight, fall back to `IntersectionObserver` toggling the header's background.

---

## Performance

### The frame budget

60Hz monitors give you **16.66ms** per frame. 120Hz halves that. Your animation's total work — script + style + layout + paint + composite — must fit inside, with headroom for the rest of the page. Healthy animations spend well under 1ms of that budget. (See also: [Animatable property cheat-sheet](css_and_some_js.md#animatable-property-cheat-sheet).)

### Measuring

Chrome DevTools → Performance panel. Workflow:

1. Comment out the suspicious code; record 5s as baseline.
2. Re-enable; record again.
3. Compare frame durations.

Reading the timeline:

- **Frames row** — one block per painted frame. Target ≈ 16.66ms.
- **Main task colours**: yellow = scripting, purple = rendering (style + layout), green = painting, grey = system.
- Red corner flags on tasks = long task warning.

Profile on the *lowest-end device* you can find. Cheap Windows laptop, mid-aged Android phone. CPU throttling in DevTools is a smell test, not a replacement (it doesn't throttle GPU).

Use Chrome/Chromium for honest numbers — Firefox's engine is faster than the average user's, Safari's tools are too thin.

### `getBoundingClientRect` is expensive

`getBoundingClientRect()` forces a layout flush; on a slow CPU it can be 1–3ms per call. Called on every `pointermove` (60×/s), that's a huge chunk of frame budget.

**Three strategies, in order of correctness:**

1. **Measure once at load.** Cache the bbox at startup. Breaks when the page scrolls or resizes — the bbox is viewport-relative.
2. **Recompute on `scroll` + `resize`.** Fixes correctness but `scroll` fires as often as `pointermove`, so the savings evaporate. Also misses non-scroll invalidations (accordion expands).
3. **Throttle the bbox read itself.** Run the pointermove handler every frame; cache the bbox for 200–500ms:

```js
function throttle(fn, ms) {
  let last = 0, cached;
  return (...args) => {
    const now = performance.now();
    if (now - last > ms) { last = now; cached = fn(...args); }
    return cached;
  };
}

const getBox = throttle(() => socket.getBoundingClientRect(), 500);

window.addEventListener('pointermove', e => {
  const bbox = getBox(); // first call runs, then cached for 500ms
  /* ... */
});
```

**Never throttle the pointermove itself** — even modest input throttling feels laggy. Throttle the *slow sub-operation*.

### What to animate

Cheap (compositor only): `transform`, `opacity`, `filter`, `backdrop-filter` (mostly).

Expensive (triggers layout): `width`, `height`, `top`, `left`, `margin`, `padding`, font-size.

Animate cheap properties unless content requires otherwise. The CSS doc has the full table: [Animatable property cheat-sheet](css_and_some_js.md#animatable-property-cheat-sheet).

### Sub-pixel rendering

Chromium sub-pixel-renders 2D transforms — even at low DPI, motion can be visually smoother than the integer pixel grid suggests. Firefox enables it as a side effect of `rotateZ(0.001deg)`. Test on cheap displays where it matters.

### Object pooling and OffscreenCanvas — usually skip

- **Object pooling** (recycling DOM nodes instead of recreating) — modern GC handles this fine. Pool brings real bug surface (stale state) for negligible gain.
- **OffscreenCanvas** (drawing in a Web Worker) — only worth it when a Canvas draw loop is meaningfully competing with main-thread work. The transfer-of-control plumbing is real complexity.

Default to *don't*. Profile first.

### Will-change

Promotes an element to its own compositor layer. Useful for: an element you're about to animate and want GPU-promoted ahead of time. Harmful when applied indiscriminately: each layer costs memory and produces edge-case rendering bugs. (See [GPU promotion: `will-change`](css_and_some_js.md#gpu-promotion-will-change).)

### Memory & garbage collection

`element.remove()` detaches from the DOM but doesn't free memory — the GC runs on its own schedule. Modern V8 splits GC across frames; brief stop-the-world pauses are mostly history. Don't pre-emptively design around GC unless your animations are visibly hitching.

If you `setInterval` cleanup of particle nodes (filter out anything older than N seconds), it's fine — the per-cleanup cost is ~20µs in our measurements. With 50+ simultaneous particles the cumulative cost starts to matter; batch the removals.

---

## SVG animation

SVG sits in a sweet spot: declarative, accessible, animatable via CSS, and infinitely scalable. Most icon-scale UI animation belongs here, not Canvas.

### Why SVG, when

- **Crisp at any size** — vector, not raster.
- **Stylable from CSS** — most SVG attributes are also CSS properties; transitions and pseudo-classes work.
- **Accessible** — `<text>` is read by screen readers; `<title>` and `<desc>` give context.
- **Capped at ~3000 moving shapes** on average hardware. Past that, switch to Canvas.

### Basic shapes

`<line>`, `<rect>`, `<circle>`, `<ellipse>`, `<polyline>`, `<polygon>`, `<text>`, `<path>`. Each has geometry attributes:

- `<rect x y width height rx ry>` — positioned by top-left.
- `<circle cx cy r>`, `<ellipse cx cy rx ry>` — center-based.
- `<polyline points="x,y x,y …">` — open chain.
- `<polygon points="…">` — auto-closes.

Stylable: `stroke`, `stroke-width`, `fill`, `opacity`, `stroke-dasharray`, `stroke-linecap`, `stroke-linejoin`, etc. All animatable via CSS transitions.

### `viewBox` — the secret sauce

`viewBox="x y width height"` defines an internal coordinate system. Children draw inside it. The rendered pixel size is controlled separately by CSS or `width`/`height` attributes. That decoupling is *why* SVG scales.

```svg
<svg viewBox="0 0 24 24" width="48" height="48">…</svg>
```

Pick a viewBox convention per design system (often `0 0 24 24` for icons), stay inside it, scale the rendered size via CSS.

### `preserveAspectRatio` and stretchy SVGs

By default, SVG preserves aspect ratio — like `object-fit: contain`. For decorative dividers that should stretch to fill any width:

```svg
<svg viewBox="0 0 1440 300" preserveAspectRatio="none">…</svg>
```

Pair with `vector-effect: non-scaling-stroke` so the stretch doesn't deform stroke thickness:

```css
.swoop * { vector-effect: non-scaling-stroke; }
```

Trade-off: `non-scaling-stroke` keeps strokes at literal CSS pixels regardless of the SVG's rendered size. Great for stretchy decorative shapes; wrong for icons that *should* scale uniformly (a 24×24 icon's 2px stroke should become 4px at 48×48).

### Stroke dashes — the self-drawing trick

`stroke-dasharray` defines a repeating dash/gap pattern. `stroke-dashoffset` slides the pattern along the path. Together → self-drawing animation:

```css
.scribble {
  stroke-dasharray: 100 1000;
  stroke-dashoffset: 100px;
  stroke-linecap: round;
  transition: stroke-dashoffset 1000ms;
}
button:hover .scribble { stroke-dashoffset: 0px; }
```

Two viable methods:

- **Grow the dash** — animate `stroke-dasharray` from `0,1000` to `length,1000`. Quirk: with rounded caps, a 0-length dash renders as a tiny circle that never goes away.
- **Slide the offset** (preferred) — keep dasharray constant; animate `stroke-dashoffset` from `pathLength → 0`. Works with rounded caps and is the canonical technique.

Path length: `path.getTotalLength()` from JS, or set `pathLength="100"` on the path to redefine the scale.

**Always suffix `px`** in CSS for SVG values (`stroke-dashoffset: 100px`, not `100`). Firefox sometimes requires it.

### Path morphing

CSS `d` transitions work in Chromium and Firefox:

```css
path { transition: d 300ms; }
button:hover path { d: path("M 20,50 C 80,0 140,100 180,50"); }
```

**Safari doesn't implement this** as of early 2026. Fallback for Safari: WAAPI on the `d` attribute (treats the path string as a discrete keyframe — works, but no smooth interpolation), or a JS-driven tween that builds the intermediate `d` string yourself by lerping each numeric token. SMIL (`<animate>`) is the legacy option but is effectively deprecated; skip it.

Two hard rules for morphing:

- **Same command sequence in both states.** Both `d` values must use the same letters (M, C, L) in the same order; only the numeric values may differ.
- **Strings on one line** in CSS — escape newlines with `\`.

### Transforms in SVG — the big gotcha

CSS transforms apply to SVG nodes, but **`transform-origin`'s reference box is the entire viewBox, not the element's own bounding box**. `transform-origin: center` rotates around the SVG center, not the shape center.

Fix: use pixel values that match the shape's own coordinates:

```css
.gear { transform-origin: 150px 100px; transition: rotate 600ms; }
```

For dynamic content, derive both shape attributes and `transform-origin` from the same variables so they can't drift.

For multiple shapes that should share a pivot, wrap them in `<g>` (SVG's `<div>`) and transform the group.

### Masks

A `<mask>` is a black/white/grayscale image. White = visible, black = hidden, gray = semi-transparent. Apply via `mask="url(#id)"`.

```svg
<defs>
  <mask id="moon">
    <rect width="32" height="32" fill="white"/>
    <circle cx="24" cy="8" r="12" fill="black"/>
  </mask>
</defs>
<circle cx="16" cy="16" r="12" fill="hotpink" mask="url(#moon)"/>
```

Default state is *nothing visible*. A white shape grants visibility; black shapes subtract.

Mask shapes can themselves animate via CSS, unlocking reveal/wipe effects without touching the masked content.

**Mask gotchas:**

- **Masks apply before transforms.** Animating `transform` on a masked element slides the result *after* the mask was applied — so the visible portion appears to track with the transform. Fix: lift the mask to a `<g>` wrapper, leave the transform on the child.
- **Masks apply before strokes** too. Stroking a masked crescent isn't straightforward; either reconstruct the crescent as a single stroked path (no mask), or build a mask that includes everything you want shown.
- **Degenerate (perfectly horizontal/vertical) lines can vanish inside a mask.** The internal 0–1 coordinate system mishandles zero-width/height shapes. Fix: `<mask maskUnits="userSpaceOnUse">`.

### Wipe effects with `clip-path`

CSS `clip-path` reveals pixels inside a defined shape. Animating between two `polygon()` shapes with the same vertex count interpolates each vertex:

```css
.reveal {
  clip-path: polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%); /* hidden */
  transition: clip-path 1000ms;
}
button:hover .reveal {
  clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); /* full */
}
```

**Pointer-events trap.** Hidden clip-path regions don't receive pointer events — including the `:hover` that's meant to reveal them. Put `:hover` on a permanent parent (a `<button>` wrapping the clipped element), not on the clipped element itself. Add `:focus-visible` for keyboards.

**Filter ordering.** `filter: drop-shadow()` applies *before* clip-path, so the shadow gets clipped. Move the filter to a parent wrapper while keeping clip-path on the child.

### Outlined text

Stroking `<text>` directly looks cramped — the stroke is centered on each glyph edge, eating into the letterform. Fix with `paint-order: stroke fill`:

```css
text {
  fill: var(--page-bg);
  stroke: hotpink;
  stroke-width: 5px;
  paint-order: stroke fill;
  stroke-linejoin: round;
}
```

Works in HTML too via `-webkit-text-stroke`, though HTML support is ~88% and there's no feature query to distinguish the two. Pick a stroke width that's tolerable in both states.

### Reusable path data — `<defs>` + `<use>`

Define once, instantiate many:

```svg
<defs>
  <path id="tmpl" d="M 20,100 A 40,40 0 0 1 180,100 Z"/>
</defs>
<use href="#tmpl" stroke="yellow"   stroke-dasharray="100,100"/>
<use href="#tmpl" stroke="cornflower" stroke-dasharray="80,100"/>
```

**Attribute merging rules:**

- Geometry attributes (`d`, `cx`, `cy`, `r`, `points`) must live on the *template*.
- Presentational and `class` attributes go on each `<use>`.
- `class` on the template is unreliable in Safari.

For varying size/position per instance, apply `transform` (with `transform-origin` in pixels) on each `<use>`.

### Other SVG gotchas

- **`z-index` does nothing inside SVG.** Stacking is DOM order — later siblings paint on top.
- **`document.createElement('circle')` makes an HTML element**, not an SVG one (invisible). Use `document.createElementNS('http://www.w3.org/2000/svg', 'circle')`.
- **Cursor coordinates need normalising to viewBox.** When tracking pointers over a stretchy SVG, scale screen coords into viewBox units. Either use `normalize(relativeX, 0, bbox.width, 0, VIEWBOX_SIZE)`, or use the built-in matrix transform: `svg.createSVGPoint().matrixTransform(svg.getScreenCTM().inverse())`.
- **Stroke is always centered** on the path — no inside/outside option. Set `overflow: visible` on the `<svg>` so wide strokes don't get clipped by the viewport (opposite of HTML's default).

---

## Canvas

Use Canvas when SVG hits a wall: more than a few thousand moving shapes, complex per-pixel effects, generative art, particle systems with their own physics.

### Mental model

Canvas is **immediate-mode**: every frame, clear the surface and repaint everything from scratch. The DOM is *retained-mode* (elements persist). The mental model from CSS animation does not transfer.

A `<canvas>` is closer to `<img>` than to `<svg>` — once painted, you have pixels, not shapes. Scaling a canvas via `transform: scale()` blurs.

### The setup ritual

Three pieces every canvas needs:

```js
function setupCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const dims = { width: 0, height: 0 };

  function update() {
    const dpr = window.devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    canvas.setAttribute('width',  rect.width  * dpr);
    canvas.setAttribute('height', rect.height * dpr);
    ctx.scale(dpr, dpr);
    dims.width  = rect.width;
    dims.height = rect.height;
  }

  update();
  window.addEventListener('resize', update);
  return { ctx, dims };
}
```

- **CSS sizes the canvas; JS upscales the bitmap.** Layout in software pixels; render in hardware pixels.
- **`devicePixelRatio` reflects zoom too**, so 125% browser zoom can give `dpr` = 2.5.
- **Return an object, not numbers.** Numbers captured by closures go stale on resize. A mutated object stays fresh for every consumer.

### The frame loop

```js
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 250) / 1000;
  last = now;

  ctx.clearRect(0, 0, dims.width, dims.height);
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    drawParticle(p);
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Three rules:

- **Always `requestAnimationFrame`**, never `setInterval` — RAF matches the display's refresh rate (60/90/120Hz) and pauses when the tab is hidden.
- **Always multiply velocities by `deltaTime`** — frame rates vary. Velocity-per-second is correct; velocity-per-frame is a bug.
- **Clamp `deltaTime` to ~250ms.** If the tab is backgrounded for an hour, RAF resumes with a massive delta — your physics will explode.

### Drawing API basics

Stateful, paint-and-state-mutation style:

```js
ctx.beginPath();
ctx.moveTo(40, 120);
ctx.lineTo(80, 160);
ctx.lineTo(160, 40);
ctx.strokeStyle = 'green';
ctx.lineWidth = 8;
ctx.lineCap = 'round';
ctx.stroke();
```

- **`beginPath()` before every shape**, or subsequent strokes repaint the *whole* accumulated path.
- **`closePath()` is not `beginPath()`'s partner** — it's sugar for `lineTo(start)`, like SVG's `Z`. Don't call it on shapes you don't want closed.
- **Wrap repeated shapes in your own helpers**: `function circle(ctx, x, y, r) { ctx.arc(x, y, r, 0, Math.PI*2); }` reads better than `ctx.arc(...)` everywhere.

Useful commands beyond lines:

- `fillRect` / `strokeRect` / `clearRect` (genuinely transparent — not black).
- `arc(cx, cy, r, startRad, endRad)` — full circle: `0 → Math.PI * 2`. Angles go clockwise from 3 o'clock.
- `ellipse(cx, cy, rx, ry, rotation, startRad, endRad)`.
- `fillText(str, x, y)` after setting `ctx.font`, `ctx.textAlign`, `ctx.textBaseline`. Not accessible.

### Trails

Replace `clearRect` with a semi-transparent fill of the background colour. Previous frames stay slightly visible and decay over many fills:

```js
ctx.fillStyle = `hsl(0deg 0% 0% / ${TRAIL_FADE * dt})`;
ctx.fillRect(0, 0, dims.width, dims.height);
```

Tying opacity to `deltaTime` keeps the fade rate consistent across refresh rates.

Residual ghosting plateaus — sub-pixel rounding means the canvas never quite reaches true black. Fine for fireworks (reads as smoke); bad for clean UIs. Alternative: keep a ring buffer of past positions per object and redraw with decreasing lightness.

### Connecting dots — the motion-blur trick

Fast-moving particles painted as discrete circles look like discrete dots. Draw a rounded *line* from the previous frame's position to the current one — at slow speeds it shrinks to its caps and reads as a circle:

```js
ctx.moveTo(p.xPrev, p.yPrev);
ctx.lineTo(p.x, p.y + 0.01); // Safari workaround for 0-length lines
ctx.lineCap = 'round';
ctx.lineWidth = p.r * 2;
ctx.stroke();
p.xPrev = p.x; p.yPrev = p.y;
```

Safari doesn't paint zero-length line caps — add `+ 0.01` to one coordinate.

### Air resistance — the right math

Naive linear drag (`v *= 1 - DRAG * dt`) goes negative at large `dt`. Mathematically correct:

```js
const drag = Math.exp(-AIR_RESISTANCE * dt);
p.vx *= drag;
p.vy *= drag;
```

Stays correct at any frame rate.

### Color cycling — use `filter: hue-rotate`

Animating between two HSL colors via CSS transition goes through *RGB space*, producing a grey dead zone. A 360° hue rotation animates nothing (start and end are the same RGB color).

Fix: animate `filter: hue-rotate()` instead. The browser tints existing pixels — vibrant, performant, and skips the dead zone.

```css
@keyframes hueRotate { to { filter: hue-rotate(var(--hue-rotation)); } }
.particle { animation: hueRotate 1000ms; }
```

`hue-rotate()` darkens colors slightly; start a touch lighter/less saturated than the target.

### Pooling, OffscreenCanvas — usually skip

Already covered in [Performance](#performance). Defaults: don't pool nodes, don't use OffscreenCanvas. Profile first; reach only if you have a real bottleneck.

---

## Math toolkit

A handful of math primitives keep coming up. Worth memorising the utilities.

### Linear interpolation (`lerp` / `normalize`)

Map a value from one range to another:

```js
const normalize = (val, srcMin, srcMax, dstMin, dstMax) =>
  ((val - srcMin) / (srcMax - srcMin)) * (dstMax - dstMin) + dstMin;

const clampedNormalize = (...args) => {
  const [, srcMin, srcMax, dstMin, dstMax] = args;
  return Math.min(Math.max(normalize(...args), Math.min(dstMin, dstMax)), Math.max(dstMin, dstMax));
};
```

Use `clampedNormalize` when feeding into things that misbehave outside a range (line widths, opacities, scale factors that can't be negative).

### Polar coordinates

Pick random `(angle, distance)` for circular/donut distributions, convert to cartesian:

```js
const polarToCartesian = (angleDeg, distance) => {
  const r = (angleDeg * Math.PI) / 180;
  return [Math.cos(r) * distance, Math.sin(r) * distance];
};

const cartesianToPolar = (x, y) => {
  let angle = (Math.atan2(y, x) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return [angle, Math.sqrt(x * x + y * y)];
};
```

Use polar when particles explode out from a center — cartesian random gives ugly square fields. Use cartesian-to-polar (then back) to clamp distances without producing artifacts (the googly-eyes pattern).

CSS now supports polar directly:

```css
transform: translate(
  calc(cos(var(--angle)) * var(--distance)),
  calc(sin(var(--angle)) * var(--distance))
);
```

### Slot + jitter for "naturally random"

Pure random clusters. With 5 particles in 360°, there's ~30% chance they all sit within a 180° band. Slot the field into equal wedges by index, then add per-particle jitter inside the wedge:

```js
const angle = (360 / N) * index + random(-JITTER, JITTER);
```

Feels *more* random than true random. Standard trick for particle distribution.

### Sine motion

`Math.sin(t)` returns -1..1 with smooth organic acceleration around the extremes — better than any Bézier for oscillating motion:

```js
const t = (performance.now() - start) / 1000;
const x = normalize(Math.sin(t * 2 * Math.PI), -1, 1, leftBound, rightBound);
```

- Multiply input by `2π` for one full oscillation per second.
- Use `Math.cos(t)` for `y` → trace circles/ellipses.
- Asymmetric multipliers (`sin(t * 1.5)` for x, `cos(t * 7.5)` for y) trace Lissajous figures.
- Per-particle phase offsets create staggered chains.

### Noise (Perlin / simplex)

True random is jagged. Noise produces *coherent* random — neighbouring inputs give similar outputs. Use simplex (not Perlin; same idea, fewer artifacts, patent expired in 2022):

```js
const { simplex2 } = createNoiseGenerator(seed);
const y = normalize(simplex2(x / 100, time / 1000), -1, 1, 0, height);
```

Two rules:

- **Inputs must be close together.** Big steps give random-looking output. Divide your `x` by ~100 (tunable).
- **Pass time as a second/third dimension** for smoothly morphing animation: `simplex3(x / 100, y / 100, t)` is animated 2D terrain.

### `atan2` — the cartesian-to-angle workhorse

`Math.atan2(dy, dx)` returns the angle from origin to `(dx, dy)`. Use whenever you need "point at this thing":

```js
const dx = mouse.x - center.x;
const dy = mouse.y - center.y;
const angle = Math.atan2(dy, dx);
ctx.translate(center.x, center.y); // pivot at center
ctx.rotate(angle);
```

Always `translate` *before* `rotate` — otherwise rotation pivots around the canvas origin.

---

## Cursor interactions

The pattern that keeps coming up:

```js
const reduced = !matchMedia('(prefers-reduced-motion: no-preference)').matches;

const getBox = throttle(() => socket.getBoundingClientRect(), 500);

window.addEventListener('pointermove', e => {
  if (reduced) return;
  const bb = getBox();
  const cx = bb.left + bb.width / 2;
  const cy = bb.top + bb.height / 2;
  const distance = Math.hypot(e.clientX - cx, e.clientY - cy);
  ball.style.scale = clampedNormalize(distance, 10, 100, 1, 0);
});
```

Rules of thumb baked in:

- **Listen on `window`**, not the trigger element — motion should continue when the cursor leaves.
- **Throttle the bbox read, not the event.** Cache the rect for 200–500ms.
- **Don't measure what you change.** Pick a *stable parent* (the socket) to compute distance from. Measuring the moving element creates a feedback loop and, in the worst case, a 30Hz flicker — a photosensitive-epilepsy hazard.
- **Use `clampedNormalize`** for any distance→property mapping, so out-of-range cursor positions don't produce negative scales or hue-flips.
- **Gate the whole interaction** behind reduced-motion at the top of the handler.

### Direction + magnitude — googly eyes

For "point at the cursor but stay within a radius" (pupil tracking), naive translate-by-scaled-coords traps the pupil in a square. Convert to polar (angle + distance), scale and clamp the distance only, convert back:

```js
const [angle, distance] = cartesianToPolar(dx, dy);
const constrained = clampedNormalize(distance, 0, 600, 0, 15);
const [x, y] = polarToCartesian(angle, constrained);
pupil.style.transform = `translate(${x}px, ${y}px)`;
```

The pupil now moves on a circular boundary — natural for an eye, weird for a square.

### Multiple cursor-aware elements

For many independent eyes/widgets, two patterns:

1. **One listener per element** — `forEach` and attach inside the loop. Simple. Up to ~10 elements is fine.
2. **One global listener, elements-as-data** — initialise once: `eyes = nodes.map(node => ({ node, getBox }))`, iterate in one global pointermove. Each element keeps its own throttled bbox getter (sharing one cache across many elements is wrong).

For dozens, switch to Canvas.

Note: `querySelectorAll` returns a `NodeList`, not an `Array`. Has `.forEach` but no `.map`/`.filter`. Spread: `[...document.querySelectorAll('.eye')]`.

---

## Sound

Native apps still feel better than the web partly because they make noise on touch. The web's bad reputation for sound is earned (autoplay MIDI, video ads) but doesn't extend to *subtle, deliberate sound on direct user actions*.

### When sound is okay

- **Direct response** to a user-initiated action — click, key, deliberate input.
- **Short** — under 1 second.
- **Quiet** — 10–30% volume. Compare against a random YouTube video at the same system volume; your sound should be noticeably quieter.
- **Mutable** — global toggle in the header, or per-feature speaker icon.
- **Never ambient, never looped, never autoplay.**

### When sound is hostile

- Background music.
- Notification sound for things the user didn't ask for.
- Long or attention-grabbing.
- No way to disable.

Also remember: users may have sensory sensitivities, may be on a call, may be in a quiet office. The default of "off until I ask" is not pessimistic — it's the polite read.

### Playing sounds

Pre-create the audio at module scope. Constructing `new Audio()` inside the click handler delays the first play by an HTTP round-trip:

```js
// at module scope
const tink = new Audio('/sounds/tink.mp3');

btn.addEventListener('click', () => {
  if (!soundEnabled) return;
  tink.currentTime = 0; // reset for rapid clicks
  tink.play();
});
```

Native `Audio` can't overlap itself. For overlapping playback (a fast-fire button), reach for the Web Audio API and decode the file once into an `AudioBuffer`, then fire fresh `BufferSource` nodes per click:

```js
const ctx = new AudioContext();
let buffer;

fetch('/sounds/tink.mp3')
  .then(r => r.arrayBuffer())
  .then(b => ctx.decodeAudioData(b))
  .then(decoded => { buffer = decoded; });

function play(volume = 0.25) {
  if (!buffer) return;
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.value = volume;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

btn.addEventListener('click', () => play());
```

Each `BufferSource` is single-use and disposable — overlap, pitch shift (`src.playbackRate.value = 1.5`), and per-trigger volume all fall out for free.

### Auto-play is blocked

The first sound must come from a synchronous handler on a strong user gesture — `click`, `keydown`, `input`. Not from `setTimeout`, `Promise.resolve().then`, `scroll`, `mousemove`. Once one sound plays successfully, the browser's Media Engagement Index relaxes things — but iOS Safari is still erratic.

### Sound design tips

- **Multiple samples.** Record several takes per sound; store them as separate `AudioBuffer`s (or as one buffer with known offsets, then `src.start(0, offset, duration)` to play a slice); pick one at random per trigger. Eliminates the "fake repeat" feel.
- **Pitch via playback rate.** `src.playbackRate.value = 1.5` plays 1.5× speed, raising pitch. Random rate per trigger (`random(0.75, 1.5)`) is the cheap way to fake variety from one sample.
- **Separate on/off sounds.** Different sprites for `pointerdown` vs `pointerup` makes buttons feel tactile.
- **Use the `input` event**, not `change`, on sliders for continuous feedback.

### Sourcing sounds

- **Free**: freesound.org. Mixed quality, slow UI; read each clip's licence carefully (CC0 vs attribution vs non-commercial).
- **Paid**: Splice and similar subscription libraries. Higher quality, more permissive licences.
- **Record your own.** Best results; uniqueness is the point. A USB condenser mic or a portable recorder (Zoom H series) is enough.

---

## Personalised animations

"Never make users wait for an animation" is too coarse. **Personalise**: show the lavish first-time animation, then skip it on return.

```js
const visitCount = Number(localStorage.getItem('visit-count') || '0');
localStorage.setItem('visit-count', String(visitCount + 1));

if (visitCount === 0) showLavishIntro();
else showQuietIntro();
```

Caveats:

- GDPR implications — for EU traffic, this is tracking. Consider whether it falls under your consent strategy.
- LocalStorage is per-device, can be cleared, may be disabled.
- For products with accounts, store the preference server-side so it follows the user across devices.

---

## Containment & positioning of decorative effects

When scattering N particles with `top: rand%; left: rand%`, you're positioning their top-left corner against the parent. Elements anchor at 0,0 of *themselves*, so they spill off the right and bottom but never the left or top. Three regimes for fixing this:

### 1. Default (top-left anchor)

Asymmetric overflow. Often visible at edges.

### 2. Center-anchor (symmetric overflow)

```css
.particle { position: absolute; transform: translate(-50%, -50%); }
```

Particles overflow by half their size on every edge — usually fine for "starry sky" aesthetics.

### 3. Perfect containment (never overflow)

Translate by exactly the inverse of the percentage you used to position:

```css
.particle {
  --top: 0%; --left: 100%;
  position: absolute;
  top: var(--top); left: var(--left);
  transform: translate(calc(var(--left) * -1), calc(var(--top) * -1));
}
```

At `left: 100%`, translate by -100% pulls it flush with the right edge. At `left: 0%`, translate by 0% leaves it flush left. Because `top`/`left` percentages are *container-relative* and `transform` percentages are *element-relative*, the compensation cancels the spill exactly.

This is "the most common positioning bug": percentage units on different properties measure different things.

### Auto-margin centering (an alternative for fixed-size particles)

```css
.particle {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 12px; height: 12px;
}
```

Then `transform: translate(±N px, ±N px)` from the center. Drops the `translate(-50%, -50%)` hack and keeps keyframes starting from `(0,0)`. Pleasantly simple when sizes are known.

---

## No animation runtime libraries

This guideline deliberately avoids JS animation runtimes (Motion, GSAP, Anime, etc.). Two reasons:

1. **The platform is enough.** CSS transitions, CSS keyframes, WAAPI, View Transitions, scroll-driven timelines, and a hand-rolled spring cover ~99% of what those libraries do — without the bundle cost, the lock-in, or the main-thread tax of RAF-based libraries.
2. **Bespoke beats off-the-shelf.** The interesting motion in any product is the part you'd never get from a default preset. Once you're not constrained by a library's API, the curves and timings become *yours*.

Default rules:

- **Smooth-scroll wrappers (Lenis, etc.)** — see [Don't override native scrolling](#dont-override-native-scrolling). Don't.
- **Off-the-shelf confetti / particles** — works fine but seen everywhere, so the whimsy evaporates. Build bespoke (the [Canvas](#canvas) section has everything you need).
- **FLIP libraries** — superseded by View Transitions for most cases, and a 20-line FLIP helper covers the rest.
- **3D (WebGL/WebGPU)** — if your project genuinely needs 3D, that's a separate discipline and a real engine is appropriate. Out of scope here.

Two *tools* (not runtimes) we do use:

- **Easing Wizard / Linear() Easing Generator** — web-based generators that emit the `linear()` polyline you'd never want to write by hand. Output is plain CSS; nothing to install.
- **Audacity** — free desktop editor for trimming and exporting the audio files you'll feed to the Web Audio API.

---

## Closing checklist — before shipping motion

Run through this for every animation that affects layout, takes >150ms, or repeats:

- [ ] Wrapped in `@media (prefers-reduced-motion: no-preference)` (or the JS equivalent gates the call).
- [ ] Animates `transform` / `opacity` / `filter` — or you've measured the alternative.
- [ ] Has a documented category: tangible / informative / attention / joyful.
- [ ] Doesn't fight an asymmetric in/out direction.
- [ ] Duration sits in the 100–500ms "alive" range (or has a deliberate reason to be longer).
- [ ] Uses a tokenised easing curve, not a one-off.
- [ ] Doesn't rely on hover alone for any non-decorative information.
- [ ] Doesn't measure-and-change the same element (no feedback loops).
- [ ] No `outline: none` without a replacement focus ring. (See [Focus indicators](css_and_some_js.md#focus-indicators--dont-kill-them).)
- [ ] Tested on cheap hardware with CPU throttling.
- [ ] Doesn't autoplay sound. If it does play sound on action, has a mute control.
- [ ] No `Lenis`-style smooth-scroll wrapper.
- [ ] If using View Transitions: descendants animate, not the group itself; clipping handled if needed.
- [ ] If using Canvas: `setupCanvas` handles DPR + resize; per-frame physics multiply by `deltaTime` clamped to 250ms.
- [ ] If using SVG: `transform-origin` in pixels matching shape coords, not `center`.
- [ ] First-time vs return-visitor experience considered (skip lavish intros on revisit).
- [ ] No color-only signalling.
