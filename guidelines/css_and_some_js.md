# CSS & vanilla JS — working guidelines

A living reference for building web pages and exercises in this repo with **vanilla CSS and vanilla JavaScript only** — no React, no styled-components, no JS framework. The web platform is rich enough on its own; this document captures the mental models, rules, and gotchas that make it pleasant to work with.

## How to use this document

- **Read top-to-bottom once** to load the mental models. Re-read sections as reference when a specific topic comes up.
- **Section 1 (Fundamentals)** is load-bearing for everything else — selectors, the cascade, units, custom properties.
- **Sections 2–3** cover layout: the box model and positioning, then Flexbox and Grid. Most layout questions live here.
- **Section 4** is everything responsive — media/container queries, fluid scaling, type, web fonts, mobile UX.
- **Section 5** is "how to make it look good" — colour, gradients, shadows, filters, images, radii, clip-path.
- **Section 6** covers motion (transforms, transitions, keyframes), scroll behaviour, and accessibility — grouped together because they overlap constantly.

## Guiding principles

- **Lean on the platform.** If CSS can do it, do not reach for JS. If HTML semantics can do it, do not reach for ARIA.
- **Mobile-first.** Default styles target small screens; `min-width` media queries layer on larger-screen refinements.
- **Progressive enhancement.** Use `@supports` to opt into newer features without breaking older browsers. Fallbacks first, modern features as upgrades.
- **Accessibility is not optional.** Visible focus states, sufficient contrast, semantic HTML, reduced-motion support — these are baseline, not extras.
- **Animate cheap properties only** (`transform`, `opacity`, `filter`). Animating layout-triggering properties (`width`, `top`, `margin`) is a performance trap.
- **Choose the right layout primitive.** Flow for documents, Flexbox for 1D distribution, Grid for 2D structure. Positioned layout is for overlays and pinning, not general structure.
- **Use logical properties** (`margin-block`, `inline-size`, `padding-inline`) when writing direction matters or might change.
- **Custom properties are your design system.** Define tokens at `:root`, override per component, mutate per state.

## Contributing to this document

This is a **living document**. When you learn something new, run into a non-obvious gotcha, or find a pattern that works well — add it. Keep entries dense, factual, and grouped under the right section. Code snippets should teach something non-obvious; skip the trivial. Link to MDN for canonical references.

---

## Fundamentals

A condensed reference for selectors, the cascade, inheritance, custom properties, math/length functions, units, feature queries, logical directions, and the pitfalls that bite most often.

### Terminology of a Rule

```css
.error-text { color: red; }
/* ^^^^^^^^   ^^^^^^^^^^^   */
/* selector   declaration   */
/*            ^^^^^ ^^^      */
/*            prop  value    */
```

A *rule* (or *ruleset*) is the selector plus its declaration block. A *declaration* is one `property: value` pair. Multiple declarations are separated by `;`. The final `;` is optional but always include it: appending a new declaration without it is a common source of silent failure.

Reference: [MDN: Syntax](https://developer.mozilla.org/en-US/docs/Web/CSS/Syntax)

---

### Selectors

The core selector types, roughly in order of growing specificity:

| Selector | Example | Notes |
|---|---|---|
| Universal | `*` | Matches everything, lowest weight |
| Type/tag | `a`, `h1` | Targets element type |
| Class | `.btn` | Workhorse selector |
| Attribute | `[type="text"]`, `[data-state="open"]` | Same weight as class |
| Pseudo-class | `:hover`, `:focus`, `:nth-child(n)` | State / structural |
| ID | `#main` | Avoid in app CSS — high specificity, single-use |
| Pseudo-element | `::before`, `::placeholder` | Targets sub-parts (double colon) |

`:` vs `::`: single colon = pseudo-class (a state of an existing element). Double colon = pseudo-element (a sub-part the browser synthesises). Some pseudo-elements (`:before`, `:after`, `:first-line`) accept legacy single-colon for IE compatibility; prefer `::`.

Reference: [MDN: CSS selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors)

#### Combinators

```css
nav a        { }  /* descendant — any depth */
nav > a      { }  /* direct child only */
h2 + p       { }  /* p that is the immediately-following sibling of h2 */
h2 ~ p       { }  /* every following sibling p */
```

The descendant combinator (space) matches at any depth — a common surprise when authoring `.list li` and finding it cascading into deeply nested lists. Use `>` to scope to one level.

Reference: [MDN: Combinators](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors#combinators)

#### Useful pseudo-classes

- `:hover`, `:focus`, `:focus-visible`, `:active` — interaction states.
- `:focus-visible` only matches when the browser thinks a visible focus indicator is warranted (usually keyboard, not mouse). Prefer it to `:focus` when styling focus rings.
- `:checked` — radios / checkboxes that are on; enables CSS-only toggles.
- `:disabled`, `:required`, `:invalid` — form state.
- `:first-child` / `:last-child` — first/last among **all** siblings.
- `:first-of-type` / `:last-of-type` — first/last among siblings **of the same tag**.
- `:nth-child(n)`, `:nth-of-type(n)` — `2n`, `2n+1`, `odd`, `even`, or literal indexes (1-based).
- `:not(selector)` — negation.
- `:is(a, b, c)` / `:where(a, b, c)` — grouping. `:where` has **zero** specificity, useful for low-priority resets.

The classic `:first-child` vs `:first-of-type` trap:

```css
/* Won't match anything if the first sibling is a <h1>, even though
   there are <p>s in the container. */
section p:first-child { color: red; }

/* This works: the first <p>, regardless of preceding <h1> etc. */
section p:first-of-type { color: red; }
```

Never set `outline: none` on `:focus` without an equivalent replacement — you remove a critical accessibility affordance for keyboard users.

Reference: [MDN: Pseudo-classes](https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-classes)

#### Pseudo-elements

```css
input::placeholder { color: goldenrod; }
p::first-line      { font-variant: small-caps; }
p::before          { content: '→ '; }   /* requires `content` */
p::after           { content: ''; display: inline-block; width: 32px; height: 32px; }
```

`::before` / `::after` need a `content` property — without it they don't render. They are conceptually "secret spans" inserted *inside* the element, before/after its real content. In a component world they are mostly redundant; reach for them mainly for purely decorative shapes (`content: ''` + sized background). Be cautious with text inside `content` — screen reader handling is inconsistent.

Reference: [MDN: Pseudo-elements](https://developer.mozilla.org/en-US/docs/Web/CSS/Pseudo-elements)

#### `:has()` — the parent / contextual selector

`:has()` flips selection direction: select an element based on its descendants, following siblings, or any other matchable relation. Supported in all major engines since late 2023 (~94% globally).

```css
/* Parent based on child */
figure:has(figcaption) { padding-bottom: 0.5rem; }

/* Style siblings in either direction */
p:has(+ figure)  { font-weight: bold; }   /* paragraph before a figure  */
figure + p       { font-weight: bold; }   /* paragraph after a figure   */

/* Move focus ring onto the wrapping card when an inner button is focused */
.card:has(button:focus-visible) { outline: 2px solid var(--accent); }
.card button { outline: none; }
```

Two non-obvious uses:

1. **Global state via the `<html>` element.** Toggle a data attribute anywhere in the DOM and react globally — no JS needed to manipulate `documentElement.style`:

   ```css
   html:has([data-disable-scroll="true"]) { overflow: hidden; }
   ```

2. **Specificity:** `:has()` itself does not add specificity, but the most specific selector inside it does. `:has(.foo)` weighs as a class.

`:has()` vs `:focus-within`: `:focus-within` matches any focus including mouse clicks and triggers on any focused descendant. `:has(x:focus-visible)` lets you scope to keyboard focus and to specific descendants.

Wrap behind `@supports selector(:has(*))` for fallbacks. The cheapest valid `:has` selector for the support test is `:has(*)`.

Reference: [MDN: `:has`](https://developer.mozilla.org/en-US/docs/Web/CSS/:has)

---

### The Cascade and Specificity

When multiple declarations target the same property on the same element, the browser resolves the conflict by:

1. **Origin & importance**: user-agent < user < author < author-`!important` < user-`!important` < transition styles.
2. **Specificity** (within the same origin/importance bucket).
3. **Source order** — last one wins.

A useful mental model: think of the cascade as object spread, in order of increasing weight:

```js
const applied = {
  ...inheritedStyles,
  ...tagStyles,
  ...classStyles,
  ...idStyles,
  ...inlineStyles,
  ...importantStyles,
};
```

#### Specificity scoring

Conceptually a tuple `(IDs, classes/attrs/pseudo-classes, types/pseudo-elements)`. Compare left-to-right:

- `a` → `(0,0,1)`
- `.nav a` → `(0,1,1)`
- `nav a.active` → `(0,1,2)`
- `#header .nav a` → `(1,1,1)` — beats any selector without an ID
- Inline `style=""` → effectively `(1,0,0,0)` above all selectors
- `!important` jumps to a higher tier above specificity entirely

`:where(...)` contributes **zero** specificity (great for base resets). `:is(...)` and `:not(...)` contribute the specificity of their most specific argument.

Avoid `!important` in regular code — it makes overrides exponentially harder. Reserve it for utility classes that must always win (e.g., `.hidden { display: none !important; }`).

Reference: [MDN: Specificity](https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity), [MDN: Cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/Cascade)

---

### Inheritance

Some properties propagate from parent to descendants; most do not. Inheritable: typography (`color`, `font-*`, `line-height`, `letter-spacing`, `text-align`, `visibility`, `cursor`), plus all custom properties (`--*`). Non-inheritable: box-model / layout properties (`margin`, `padding`, `border`, `width`, `background`, `display`, etc.).

Mental model: it behaves like prototypal lookup — if no rule sets the property on the element directly, the browser walks up the tree until it finds one, otherwise falls back to the property's initial value.

Special keywords:

- `inherit` — explicitly take the computed value from the parent. Use for `<a>` color etc. (anchor tags have `color: -webkit-link` baked in by the UA stylesheet, which blocks normal inheritance):
  ```css
  a { color: inherit; }
  ```
- `initial` — the property's spec-defined initial value (not the UA stylesheet value!).
- `unset` — `inherit` if the property is normally inheritable, else `initial`.
- `revert` — roll back to the UA stylesheet value.
- `revert-layer` — roll back to the previous cascade layer.

Reference: [MDN: Inheritance](https://developer.mozilla.org/en-US/docs/Web/CSS/Inheritance), [MDN: `inherit`](https://developer.mozilla.org/en-US/docs/Web/CSS/inherit)

---

### Custom Properties (CSS Variables)

Variables in CSS are actual properties named `--something`. They participate in the cascade and inherit through the DOM, scoped to the element they're set on:

```css
:root {
  --color-primary: hsl(220 90% 56%);
  --space: 8px;
}

.card {
  --space: 16px;          /* override locally; cascades down to descendants */
  padding: var(--space);
  background: var(--color-primary);
}

button {
  padding: var(--btn-padding, 8px 12px);   /* second arg = fallback */
}
```

Key properties:

- **Scoped, not global.** A `--foo` set on `.card` is only visible inside `.card`. They feel global only because most projects hang them off `:root` (alias for `<html>`).
- **Reactive.** Unlike Sass variables (resolved at build time), CSS variables are resolved at render. Updating one via JS (`el.style.setProperty('--x', ...)`) live-updates every property that references it.
- **Inherit by default.** Disable per-element with `@property` and `inherits: false`.
- **Untyped by default.** Anything is permitted as text. To get type-checking, transitions, and a registered default, use `@property`:
  ```css
  @property --angle {
    syntax: '<angle>';
    initial-value: 0deg;
    inherits: false;
  }
  ```

Patterns:

- **Responsive without per-component media queries** — define a variable inside a media query, components consume it:
  ```css
  @media (pointer: coarse) { html { --min-tap: 44px; } }
  button, input { min-height: var(--min-tap, 32px); }
  ```
- **Scaling with one knob** — drive padding/gap/radius from one `--scale`, with `calc` deriving secondary values:
  ```css
  article { padding: var(--scale); border-radius: calc(var(--scale) / 2 + 2px); }
  ```
- **Theming** — swap a bundle of variables on `[data-theme="dark"]` or via `:has()`.

Reference: [MDN: Custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties), [MDN: `@property`](https://developer.mozilla.org/en-US/docs/Web/CSS/@property)

---

### Math Functions: `calc`, `min`, `max`, `clamp`

All four are values, not properties, so they work anywhere a `<length>`, `<number>`, `<angle>`, etc. is accepted.

#### `calc()`

```css
.bleed { margin-inline: -16px; width: calc(100% + 32px); }
h2     { font-size: calc(24 / 16 * 1rem); }   /* px → rem, "show the work" */
```

- Operators: `+ - * /`. Around `+` and `-` you **must** have whitespace on both sides (`calc(100% - 16px)`, not `calc(100%-16px)`); `*` and `/` don't require it.
- Can mix units freely: `calc(100% - 32px)`, `calc(50vw + 2rem)`.
- Combines beautifully with custom properties: `calc(var(--scale) * 1.5)`.
- Can be used on `<angle>` values too, including in `hsl()`: `hsl(calc(var(--hue) + 20deg) 80% 50%)`.

#### `min()` / `max()`

```css
padding: min(32px, 5vw);    /* whichever is smaller */
width:   max(50%, 400px);   /* whichever is larger */
```

These work like a one-sided constraint and can be nested. Use `max(0px, ...)` to floor a calc that could otherwise go negative.

#### `clamp(MIN, IDEAL, MAX)`

```css
width:     clamp(500px, 65%, 800px);   /* same as min-width + width + max-width */
font-size: clamp(1rem, 2vw + 0.5rem, 2rem);  /* fluid typography */
```

- Replaces the `min-width` + `width` + `max-width` trio with a single value.
- Because it's a value, you can clamp **any** length: `padding`, `border-width`, `font-size`, `gap`, etc. There is no `min-padding`, but `padding: clamp(...)` works.
- For fluid typography, the middle argument typically combines a `vw`/`vh` term with a `rem` base so the value scales with viewport while remaining accessible.

References: [MDN: `calc`](https://developer.mozilla.org/en-US/docs/Web/CSS/calc), [MDN: `clamp`](https://developer.mozilla.org/en-US/docs/Web/CSS/clamp), [MDN: `min`](https://developer.mozilla.org/en-US/docs/Web/CSS/min), [MDN: `max`](https://developer.mozilla.org/en-US/docs/Web/CSS/max)

---

### Units

CSS values have **types** (`<length>`, `<color>`, `<angle>`, `<percentage>`, `<number>`, ...) and each property accepts specific types. `padding` accepts `<length>` or `<percentage>`; `background-color` accepts `<color>`; etc.

#### Absolute lengths

- `px` — CSS pixel. Not a literal device pixel; abstracted by the browser so it stays roughly consistent across DPI.
- `pt`, `cm`, `mm`, `in` — print units. Rare on screen.

#### Font-relative lengths

- `em` — relative to the **current element's** `font-size`. Compounds through nesting: nested `font-size: 0.8em` inside another `0.8em` becomes `0.64em` of the grandparent. Surprising in component-based UIs.
- `rem` — relative to the **root** `<html>` element's `font-size` (default 16px). Predictable, respects user-preference font-size changes. Preferred for typography.
- `ch` — width of the `0` glyph in the current font. Handy for line-length constraints: `max-width: 65ch`.
- `ex` — x-height of the current font. Rarely useful.
- `lh`, `rlh` — current/root line-height. Useful for rhythm.

Never hardcode `html { font-size: 16px }` — it overrides user accessibility settings. To scale rems globally, use a percentage: `html { font-size: 112.5%; } /* 1rem = 18px */`.

#### Percentages

Percentage means different things per property:
- `width: 50%` → 50% of the **containing block's** width.
- `height: 50%` → 50% of the containing block's height, **only if the parent has a definite height**, otherwise the element collapses or behaves as `auto`.
- `padding: 50%` and `margin: 50%` → 50% of the containing block's **width** (yes, even for top/bottom). This is the classic aspect-ratio hack source.
- `translate: 50%` / `transform: translateX(50%)` → 50% of the **element's own** size.
- `line-height: 1.5` (unitless) is preferred over `150%` — unitless inherits as a factor, percentages inherit as a computed length.

#### Viewport units

- `vw` / `vh` — 1% of viewport width / height.
- `vmin` / `vmax` — 1% of the shorter / longer viewport dimension. `border-radius: 100vmax` is a handy way to make pill shapes regardless of size.
- `svh`, `lvh`, `dvh` (and `svw`/`lvw`/`dvw`, `svmin`/`lvmax`, etc.) — small, large, dynamic. On mobile, `vh` always equals the **largest** viewport height (browser chrome retracted). `svh` is the small height (chrome shown). `dvh` updates dynamically as chrome animates. Use a fallback:
  ```css
  .hero { min-height: 100vh; min-height: 100dvh; }
  ```
- **Desktop `vw` gotcha**: `100vw` does **not** account for the vertical scrollbar on platforms that reserve space for it (most non-macOS desktops). `width: 100vw` produces ~15px of horizontal overflow on a scrolled page. Prefer `width: 100%` on a block-level element when possible.

References: [MDN: length](https://developer.mozilla.org/en-US/docs/Web/CSS/length), [MDN: viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths)

---

### Block vs Inline Directions and Logical Properties

CSS terminology inherits from print. Documents have two axes:

- **Block axis** — direction in which block boxes stack (vertical in English: top→bottom). Mnemonic: lego *blocks* stack.
- **Inline axis** — direction along which inline content flows (horizontal in English: left→right). Mnemonic: people standing *in line*.

The names `display: block` / `display: inline` derive from these axes.

Logical properties replace the directional ones so they auto-flip under `writing-mode` and `direction`:

| Physical | Logical |
|---|---|
| `margin-top` | `margin-block-start` |
| `margin-bottom` | `margin-block-end` |
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `padding-top`/`-bottom` | `padding-block` |
| `padding-left`/`-right` | `padding-inline` |
| `width` | `inline-size` |
| `height` | `block-size` |
| `max-width` | `max-inline-size` |
| `top`/`bottom` | `inset-block-start`/`-end` |
| `border-top-left-radius` | `border-start-start-radius` |

The browser's UA stylesheet already uses logical properties (`p` has `margin-block-start: 1em`, not `margin-top`). For new projects with i18n in mind, prefer the logical forms. Browser support is ~98%.

Reference: [MDN: Logical Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties_and_Values)

---

### Feature Queries (`@supports`)

`@supports` lets you conditionally apply CSS based on whether the browser recognises a given declaration or selector.

```css
/* Property/value support */
@supports (display: grid) {
  .grid { display: grid; grid-template-columns: 1fr 1fr; }
}

/* Selector support (note the `selector()` wrapper) */
@supports selector(:has(*)) {
  .card:has(button:focus-visible) { outline: 2px solid var(--accent); }
}

/* Negation */
@supports not (aspect-ratio: 1) {
  .square::before { content: ''; padding-top: 100%; }
}

/* Combined */
@supports (display: grid) and (gap: 1rem) { /* ... */ }
@supports (display: grid) or (display: flex) { /* ... */ }
```

Why use it: a simple duplicate-declaration fallback covers single-property support, but not *grouped* support. To switch between flexbox and grid layouts (where you also need to change `align-content`, add `grid-template-*`, etc.), wrap the modern path in `@supports`.

If `@supports` itself isn't supported (extremely rare in 2025 — ~99.5% support), the entire block is ignored — which is exactly the correct fallback, since such ancient browsers won't support the feature being tested for anyway.

Tip: when probing selector support, use the cheapest selector that exercises the syntax — e.g. `selector(:has(*))` rather than the full selector you intend to ship. The browser parses syntax, not semantics.

Reference: [MDN: `@supports`](https://developer.mozilla.org/en-US/docs/Web/CSS/@supports)

---

### Common Gotchas

#### Margin collapse (Flow layout only)

Adjacent vertical margins in normal flow **collapse** into one. The result is the larger value, not the sum. Critical rules:

1. **Only vertical margins collapse**, never horizontal.
2. **Only in Flow layout.** Inside `display: flex` / `display: grid`, margins never collapse.
3. **Only when touching.** A border, padding, gap (height taller than content), or a scroll container (`overflow: auto/hidden`) between margins blocks the collapse.
4. **Nesting doesn't block collapse.** A child's `margin-top` will collapse with its parent's `margin-top` — appearing to "leak out" of the parent. Margin's job is to space *siblings*; if there's no padding/border in the way, it transfers.
5. **Bigger margin wins.** `72px` next to `24px` → `72px` gap, not `96px`.
6. **More than two can collapse.** Up through any chain of touching margins.
7. **Negative margins**: largest absolute-value negative wins among negatives; mixed positive+negative are *added* (`50px + -30px = 20px`).
8. **`0px` is still a collapsible margin** — wrapping content in a `<section>` with no margin won't prevent its child's margin from collapsing through.

Fix when unwanted: add 1px padding, set `display: flow-root` on the parent, or switch to flex/grid.

Reference: [MDN: Mastering margin collapsing](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Mastering_margin_collapsing)

#### `flex` shorthand overrides `width`

The shorthand `flex: 1` expands to `flex: 1 1 0%` — `flex-basis: 0` then overrides any `width` you also set:

```css
.item { flex: 1; width: 200px; }   /* width is ignored in a row flex container */
```

If you want both flexible sizing and a basis, put the basis in the shorthand:

```css
.item { flex: 1 1 200px; }   /* grow:1 shrink:1 basis:200px */
```

#### Other shorthand traps

Shorthands **reset** every longhand they cover, even ones you didn't mention. `background: red` clears any prior `background-image`, `background-position`, etc. `font: 16px/1.5 sans-serif` resets `font-weight`, `font-variant`, `font-style`, etc. Author longhands when patching one facet of a previously-set shorthand.

#### 3D / transform context fragility

- `transform-style: preserve-3d` is **not inheritable**. To pass a 3D context through intermediate elements between the ancestor with `perspective` and the descendant being transformed, every middle element needs `transform-style: preserve-3d` (or `: inherit`).
- The element that owns the 3D rendering context loses it if you also set any of: `overflow`, `clip-path`, `opacity` (anything other than 1), `filter`, `mix-blend-mode`. If you need those styles, apply them to a different (outer) wrapper.
- Animate transforms on a **child** of the hovered element, not the hovered element itself — otherwise tilting the element away from the cursor cancels `:hover`, producing a "doom flicker".

#### Color on links

The UA stylesheet sets `a { color: -webkit-link }`, which is a concrete value that overrides inheritance. To make link color follow surrounding text: `a { color: inherit; }`.

#### Percentages and unsized parents

`height: 100%` does nothing if the parent has no definite height. Either set the parent's height, or use flex/grid layout, or use `100dvh` if you want viewport-relative.

#### `100vw` overflow on desktop

See viewport units section. Prefer `width: 100%` on block elements.

---

### Debugging Strategies

- **Inspect element**: `Cmd+Opt+I` (mac), `Ctrl+Shift+I` (win/linux). The Styles panel shows the cascade from most-to-least specific; struck-through declarations were overridden — you can see which rule won.
- **Computed tab**: shows the final value the browser used for each property, with a trail back to the source declaration.
- **Layout / Box-model diagram**: shows margin / border / padding / content sizes. Hover individual margin slots to see which margins are collapsing.
- **"Inactive CSS" warnings**: Firefox (and now Chrome 108+) flag declarations that have no effect because of unmet preconditions — e.g. `align-items` on a non-flex parent, `width` on an inline element, `gap` outside a flex/grid container. Always check for these dim icons next to declarations.
- **Toggle classes / pseudo-states**: the `:hov` button in the Styles panel forces `:hover` / `:focus` / `:focus-visible` / `:active`, letting you inspect state-dependent rules without juggling the cursor.
- **`outline: 1px solid red` on `*`**: a quick visual structure dump — every element gets a red box.
- **`background: rgb(255 0 0 / 0.2)` on a suspect element**: easier to see than `outline` for overlap / overflow issues.
- **CSS variable values**: visible in the Computed tab, and in DevTools' "Show all" toggle. Hover a `var(--x)` reference to see the resolved value.
- **Selector Stats** (Chrome DevTools Performance): measures which selectors cost the most during style recalculation. Useful for diagnosing surprising perf on heavy `:has()` or attribute-selector usage. In practice, even `html:has(...)` on a 2500-node page resolves in ~0.1ms.
- **Search**: in DevTools' Sources / Styles panel, `Cmd/Ctrl+F` searches across all loaded stylesheets — useful to find where a property is set.

---

### Mental Models Worth Internalising

- **The cascade is conflict resolution between equally-applicable declarations.** Multiple selectors can match an element; specificity + source order picks one winner per property.
- **Inheritance walks the tree until it finds a defined value.** Most layout properties don't inherit; most typography ones do; all custom properties do.
- **`em` compounds, `rem` doesn't.** Use `rem` for sizing that should be predictable; use `em` deliberately when you *want* a child to scale with its parent's font size (e.g., a button's internal padding scaling with its own text).
- **Logical properties describe directions in terms of content flow, not screen geometry.** They make i18n trivial.
- **`@supports` lets you ship modern CSS without sacrificing fallbacks** — group everything that depends on a feature inside one block.
- **CSS variables are live values, not preprocessor variables.** They participate in the cascade and can be changed at runtime, including from JS (`el.style.setProperty('--x', value)`).
- **`clamp` replaces three properties with one value** — and works on properties that have no min/max counterparts.
- **`:has` is the missing combinator.** Anything you used to reach for JS to do (parent based on child, sibling looking backward, global flags) is probably expressible with it now.
## Box Model & Layout

### The four layers and `box-sizing`

Every element is a stack of four concentric rectangles: **content**, **padding**, **border**, **margin**. The `box-sizing` property controls which of these the declared `width`/`height` refers to.

- `content-box` (CSS default): `width` describes only the content area. Padding and border are added *on top*, so a `width: 100%; padding: 20px; border: 4px` element occupies `100% + 48px`. Almost never what you want — it makes layout math viral.
- `border-box`: `width` describes content + padding + border. Padding/border eat *into* the declared width instead of inflating the box.

Reset every element (including pseudo-elements, which `*` doesn't match):

```css
*, *::before, *::after { box-sizing: border-box; }
```

MDN: [box-sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/box-sizing).

### Padding

Inner space; receives the element's background. Sub-properties: `padding-top/right/bottom/left` (or logical `padding-block-start`, `padding-inline-end`, etc.). Shorthand follows TRBL (clock from 12), mirroring missing values: `padding: 10px 20px 30px` = top 10 / horizontal 20 / bottom 30.

Use pixels — `em`/`rem` padding scales with font size and produces surprises in nested components. (Pixels for font-size are an accessibility issue; for padding they aren't.)

**Percentage padding gotcha**: percentages on *any* padding side resolve against the containing block's *width* — including `padding-top`/`padding-bottom`. This is the basis of the legacy aspect-ratio hack (see below).

Long-hand overrides must come **after** shorthand in source order:

```css
.box {
  padding: 48px;
  padding-bottom: 0;  /* wins */
}
```

### Border

Three sub-axes: `border-width`, `border-style`, `border-color`. Only `border-style` is required for a border to render — `border: 2px pink` shows nothing; `border: solid` produces a 3px black border.

If `border-color` is omitted, it falls back to `currentColor` (the element's text color). Useful when you want the border to track a parent-set color.

`border-radius` is a misnomer — corners round even with no border. Per-corner shorthand follows TL → TR → BR → BL (clockwise from top-left). `50%` produces a circle/oval.

**Border vs outline**: outline doesn't affect layout; it sits outside the border like a box-shadow but with `outline-width`/`outline-style`/`outline-color` and an `outline-offset` for gap. Don't strip outlines on focusable elements without replacing them.

### Margin

Outer space — really the *gap* between elements, not a property of one element. Sub-properties match padding (`margin-block-start`, `margin-inline-end`, etc.).

**Negative margins** are legal (padding/border can't go negative). They:
- Pull the element outside its parent (`margin-top: -32px`).
- Pull a *following* sibling closer (negative `margin-bottom`).
- Shift *all subsequent siblings* — unlike `transform: translate`, which doesn't disturb neighbors.

```css
.lifted { margin-top: -24px; }  /* this element AND everything below moves up */
```

**`margin: auto`** for horizontal centering: when both `margin-left` and `margin-right` are `auto`, each tries to consume all leftover space; the tie distributes space equally → centered. Requirements:
- Only works on the horizontal axis. `margin-top: auto` resolves to `0` in flow layout (it *does* work in flex/grid).
- The element must have a constrained `width` — block elements default to filling the parent, leaving no leftover space.

Auto margins also let you escape a padded parent for "full-bleed" children (apply negative margin equal to the parent's padding).

### Margin Collapse (Flow layout only)

In Flow layout, vertical margins between adjacent block elements *merge* into a single gap equal to the **larger** of the two — like overlapping personal-space bubbles. This is a Flow-layout-only behavior; Flexbox, Grid, and Positioned layout do **not** collapse.

Detailed rules:

1. **Only vertical (block-direction) margins collapse.** Horizontal margins stack normally.
2. **Only adjacent siblings.** A gap-creating element between them (border, padding, inline content, scrollable parent) blocks it.
3. **Margins pass through parents.** A child's `margin-top` can escape and become the parent's effective top margin if there's nothing between them (no border, no padding, no `overflow` other than `visible`, no flex/grid context). Adding `padding: 1px` or `border: 1px solid transparent` to the parent stops it.
4. **Larger margin wins.** `margin-bottom: 30px` next to `margin-top: 50px` → 50px total gap, not 80.
5. **Negative margins** subtract from the positive one: 30px next to -20px → 10px. Two negatives → the most-negative wins.
6. **Empty blocks** collapse their own top and bottom margins together.
7. Margins on absolutely-positioned, fixed, floated, or flex/grid-item elements **never** collapse.

Practical implication: never set vertical margin and expect math to work. If two `<p>` siblings each have `margin: 16px 0`, the visible gap between them is 16px, not 32px.

### Effective margin usage

Margin is "glue applied before knowing what to stick to". Avoid it on the outer boundary of reusable components — they should be unopinionated about surrounding space. Strategies:

- Layout components like `<Stack>` that apply gaps to their children (`gap` in flex/grid is the modern version).
- Pass a `className` to let consumers add spacing per use site.
- Apply margin only at the call site (the page/feature using the component).

---

## Width Algorithms

`width: auto` (the default for block elements) is **not** the same as `width: 100%`. `auto` is "greedy but context-aware": fill the available horizontal space *after* accounting for margins. `100%` is mechanical: take 100% of the parent's content area *before* margins → adding `margin-left: 16px` pushes it 16px out of the parent.

Width values are split into two categories:

- **Extrinsic**: based on the parent's available space — `auto`, percentages, fixed measurements (e.g. `300px`, `50%`).
- **Intrinsic**: based on the element's children.
  - `min-content`: shrink to the narrowest size that still contains each unbreakable word. Aggressively line-wraps.
  - `max-content`: never wrap; size to the longest unbroken line. Ignores parent width — will overflow if too long.
  - `fit-content`: hybrid. Behaves like `max-content` when it fits, like `auto` when it would overflow. Equivalent to `min-width: min-content; max-width: max-content` on a `width: auto` element.

```css
h2 { width: fit-content; }  /* hugs the text, but wraps if narrower than the container */
```

**Replaced elements** (`<img>`, `<video>`, `<canvas>`, etc.) treat `width: auto` differently — it means "use intrinsic size", not "fill available space". To make an image span a container, set `width: 100%`.

### Constraints

`min-width` / `max-width` (and `min-height` / `max-height`) clamp the resolved width. They can mix units freely — common pattern:

```css
.box { width: 50%; min-width: 170px; max-width: 300px; margin: 0 auto; }
```

A frequent max-width-wrapper:

```css
.max-width-wrapper {
  max-width: 350px;
  padding-inline: 16px;
  margin-inline: auto;
}
```

With `border-box`, the `max-width` includes the 16px side padding, so the inner content tops out at `350 - 32 = 318px`. Don't try to "fix" this by switching to `content-box`; mixed box-sizing is worse than the cosmetic difference.

In Flexbox, `flex-basis` plays the role of `width` and `min-/max-width` still clamp it. The min/max also override the minimum content size, which is normally "the size of the widest child word".

MDN: [width](https://developer.mozilla.org/en-US/docs/Web/CSS/width), [min-content](https://developer.mozilla.org/en-US/docs/Web/CSS/min-content).

---

## Height Algorithms

**Width looks up the tree; height looks down.** A block element's default height is "as small as possible to contain children" — closer to `min-content` than to `auto`. This is why fixed pixel heights cause overflow, and percentage heights silently fail.

`height: 50%` resolves against the parent's height — but if the parent uses default (auto) height, there's no concrete number to take a percent of, and the rule has no effect. To make a full-viewport container, you must seed a concrete height at the root:

```css
html, body, #root { height: 100%; }   /* #__next for Next.js, #root for CRA */
.wrapper { min-height: 100%; }         /* can grow if content is taller */
```

Use `min-height` rather than `height` so content can push the container taller.

`100vh` is the obvious shortcut, but on mobile browsers the viewport height changes as URL bars hide/show, leading to layout jumps and cut-off content. Modern fallbacks: `100dvh` (dynamic), `100svh` (small), `100lvh` (large).

For the classic "sticky footer" pattern, use a flex column with `margin-top: auto` on the footer:

```css
html, body { height: 100%; }
.wrapper { display: flex; flex-direction: column; min-height: 100%; }
footer { margin-top: auto; }
```

---

## Aspect Ratio

`aspect-ratio: 4 / 3` (or any width/height ratio) automatically derives one dimension from the other. Works on any element — `<div>`, `<video>`, `<iframe>`, plain wrappers. Combined with `object-fit: cover` for images:

```css
img { width: 100%; aspect-ratio: 1 / 1; object-fit: cover; }
```

For IE or very old browsers, the **padding-bottom hack** abuses the fact that padding percentages resolve against width:

```css
.padding-hack { height: 0; padding-bottom: 56.25%; position: relative; }  /* 16:9 */
.padding-hack > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
```

Progressive enhancement using `@supports`:

```css
img { width: 100%; height: 200px; object-fit: cover; }
@supports (aspect-ratio: 1 / 1) {
  img { height: revert; aspect-ratio: 1 / 1; }
}
```

MDN: [aspect-ratio](https://developer.mozilla.org/en-US/docs/Web/CSS/aspect-ratio).

---

## Flow Layout

The default layout algorithm — essentially "Microsoft Word for the web". Two primary element types, controlled by `display`:

**Block** (`<div>`, `<header>`, `<p>`, headings):
- Stack in the block direction, one per line, regardless of intrinsic size. An `<h2>` that needs 150px of content still occupies the full row.
- Respect `width`, `height`, all four margins, padding, border.

**Inline** (`<a>`, `<span>`, `<strong>`):
- Flow in the inline direction; line-wrap as text. Treated as typography.
- `width` and `height` have **no effect**. Vertical margin is ignored; horizontal margin works.
- Can produce non-rectangular shapes when wrapping across lines (think sushi roll: one strip cut into pieces).
- **Replaced elements** (`<img>`, `<video>`, `<canvas>`) are technically inline but accept width/height — model them as a "foreign object inside an inline wrapper".

**`inline-block`**: a block "in inline's clothing". Externally laid out as inline (sits in a paragraph), internally a full block (accepts width/height/vertical margin). Trade-off: **does not line-wrap**. Apply to a long link and the whole link forces onto the next line.

### Inline quirks

- **Magic space**: inline images sit on a typographic baseline, leaving ~6px below for descenders. Fix with `img { display: block; }` or `line-height: 0` on the wrapper.
- **Whitespace gaps**: source-code whitespace between inline elements renders as a visible gap. Either switch the container to flex/grid (which ignore whitespace), or remove the whitespace in HTML.

---

## Floats (Modern Uses)

Floats are a legacy tool, but not obsolete. They were never designed for page layouts (that was a hack era); use Flexbox/Grid for that. Floats are still useful for:

- **Wrapping text around an image** — magazine/article style, the original use case.

```css
img { float: left; margin-right: 16px; }
```

- **Custom-shaped wrap regions** via `shape-outside`: `circle()`, polygons, SVG paths, or an image with an alpha channel:

```css
.floated {
  float: left;
  shape-outside: circle();
  margin-right: 24px;
  border-radius: 50%;
}
```

Pair with `shape-margin` for extra gap between the shape and surrounding text. Combine with `text-align: justify; hyphens: auto` for a true magazine feel.

**Clearfix**: floated children don't contribute to their parent's height (they're out-of-flow). If the parent has only floated children, it collapses. Fix with a clearing pseudo-element:

```css
.clearfix::after { content: ''; display: block; clear: both; }
```

`clear: left | right | both` on a sibling forces it to start below preceding floats on that side.

MDN: [float](https://developer.mozilla.org/en-US/docs/Web/CSS/float), [shape-outside](https://developer.mozilla.org/en-US/docs/Web/CSS/shape-outside).

---

## Overflow

When content exceeds a constrained box, the browser lets it spill out without disturbing surrounding layout. The `overflow` property controls this. `overflow` is shorthand for `overflow-x` and `overflow-y`.

- **`visible`** (default) — spill, no scrollbar, ignored by layout. Overflowing children paint over neighbors.
- **`scroll`** — *always* show scrollbars (or scrollbar gutter on macOS where they auto-hide). Reserves space for the bar even when not needed.
- **`auto`** — scrollbars appear only when needed. Almost always the right choice for "this *might* overflow".
- **`hidden`** — overflowing content is clipped and unreachable. Also creates a **scroll container** — programmatic scrolls and anchor navigation still work, just no UI. Required for ellipsis truncation and useful for decorative containment.
- **`clip`** — like `hidden` but does *not* create a scroll container. Use when you purely want visual clipping without scroll side effects.

Setting one axis turns the other into `auto` automatically (you can't have one axis `visible` while the other clips — the browser promotes the visible axis).

### Horizontal overflow (carousel pattern)

Inline children line-wrap by default. To force a single row with horizontal scroll:

```css
.row { overflow-x: auto; white-space: nowrap; }
.row img { width: 32%; }
```

`white-space: nowrap` disables line-wrapping; `overflow: auto` then scrolls.

### Text overflow

Browser line-wrapping breaks at "soft wrap opportunities" — whitespace, hyphens, certain Unicode break characters. A single very long word (`antidisestablishmentarianism`, URLs) has no opportunities and will overflow.

- **`overflow-wrap: break-word`** — permits breaking inside a word when nothing else fits. IE alias: `word-wrap`.
- **`hyphens: auto`** — adds proper hyphens at word boundaries. More aggressive than `break-word`. Requires `<html lang="...">`; quality varies by browser/language. Hyphens are not selectable (good for URL copy-paste). Combine both for best results.
- **Single-line ellipsis**:

```css
.truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

All three are required. Overflow management runs *after* line-breaking, so `nowrap` is the piece that prevents wrapping in the first place.

- **Multi-line ellipsis** (`-webkit-line-clamp`, supported everywhere despite the prefix):

```css
.clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
}
```

Works by capping the rendered height to N lines, then hiding overflow. Inside a flex container that stretches the child, the lines become visible again — fix with `align-self: flex-start`.

Truncation is a UX risk; only ellipsize when the user has another way to get the full value (familiarity, hover/expand, source data).

MDN: [overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow), [text-overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/text-overflow), [overflow-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap).

---

## Positioned Layout

Opt in with `position: relative | absolute | fixed | sticky`. Default is `static` (= "not positioned"). Positioned elements can overlap; non-positioned siblings still flow around the implied original position only for `relative` and `sticky`.

Once positioned, four offset properties become live: `top`, `right`, `bottom`, `left`. Each scheme interprets them differently. Modern shorthand: `inset: 0` sets all four; `inset: 25px` insets equally.

### Relative

Subtle. Effects:

1. Enables `top`/`left`/`right`/`bottom`/`z-index`.
2. Becomes the **containing block** for absolutely-positioned descendants.

Offsets shift the element *from its in-flow position*, **without** moving anything else. Compare with `margin-top: 20px` (everything below scoots) vs. `position: relative; top: 20px` (only the element moves, can overlap neighbors). Also unlike margin, `left` doesn't shrink the element when applied to an auto-width block.

Works on inline elements too — useful for nudging text without breaking line flow.

### Absolute

Removed from flow entirely — neighbors lay out as if it doesn't exist (parent may collapse if it has no other children).

Positioned against its **containing block**: the nearest *positioned ancestor* (relative, absolute, fixed, or sticky). If none, the **initial containing block** = viewport-sized rectangle at the top of the document. Absolute children **ignore parent padding** — they sit against the border edge.

Without anchor properties, an absolutely-positioned element sits at its in-flow position, but is still out-of-flow and layered on top of surrounding content.

Common uses: tooltips/dropdowns/modals, decorative graphics, stacking elements in the same spot (card deck).

**Absolute centering trick**:

```css
.box {
  position: absolute;
  inset: 0;
  width: 100px; height: 100px;
  margin: auto;
}
```

Requires: positioning + all four edges set equal + explicit width/height + `margin: auto`. The auto margins distribute leftover space equally on all four sides.

**Sizing**: an absolute element with no width set will shrink-to-fit its content (closer to `fit-content` than block-default auto fill).

### Fixed

Like absolute but the containing block is always the viewport (initial containing block). Immune to scrolling — stays put as the page scrolls. Useful for help buttons, persistent headers, modal overlays.

**Gotcha**: any ancestor with `transform`, `filter`, `perspective`, `backdrop-filter`, `contain: paint`, or `will-change: transform` (and a few others) becomes the containing block instead of the viewport. The fixed element then scrolls with that ancestor. This is one of the most baffling bugs in CSS.

Debug snippet:

```js
function findCulprits(elem) {
  let parent = elem.parentElement;
  while (parent) {
    const { transform, willChange, filter } = getComputedStyle(parent);
    if (transform !== 'none' || willChange === 'transform' || filter !== 'none') {
      console.warn('Culprit:', parent, { transform, willChange, filter });
    }
    parent = parent.parentElement;
  }
}
findCulprits(document.querySelector('.your-fixed-element'));
```

Fix by removing the property (replace `filter: drop-shadow` with `box-shadow`), or move the fixed element out via a portal.

### Sticky

Hybrid: flows in-place like `relative` until the scroll threshold (`top: 0`, `bottom: 16px`, etc.) is reached, then "sticks" like `fixed`. **Must specify at least one of `top/right/bottom/left`** — without it, sticky does nothing.

Distinctions from fixed:
- **In-flow**: takes real space, parent's height accounts for it. Siblings don't shift when it sticks.
- **Constrained to its parent**: sticky elements never leave their direct parent's box. Once you scroll past the parent, the sticky element leaves with it. This is why section-headers-that-stay-with-their-section "just works".

Common pitfall: a sticky element doesn't stick if any ancestor has `overflow: hidden | auto | scroll` (the scroll context the sticky uses is that ancestor's, not the page).

Browser support is solid across modern browsers including iOS Safari and table elements (Chrome 91+).

### Containing block rules (summary)

| Position type | Containing block |
|---|---|
| static / relative | Parent's content box |
| absolute | Nearest positioned ancestor's *padding* box; otherwise viewport |
| fixed | Viewport (unless a transformed/filtered ancestor exists) |
| sticky | Nearest scrolling ancestor |

### Overflow interaction with positioning

`overflow: hidden` on a parent **only clips children it contains**. An absolute child isn't contained unless the parent is positioned — so:

```css
.wrapper { overflow: hidden; }              /* doesn't clip absolute child */
.wrapper { position: relative; overflow: hidden; }  /* does clip */
```

`fixed` children are never contained by ordinary ancestors (they're contained by the viewport), so `overflow: hidden` on a parent has no effect on them — but a transformed ancestor will both contain them *and* clip them.

MDN: [position](https://developer.mozilla.org/en-US/docs/Web/CSS/position), [Containing block](https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block).

---

## Stacking Contexts & z-index

Painting order when elements overlap depends on layout mode.

**Flow layout**: backgrounds paint in DOM order, then content (text) floats on top of *all* backgrounds. So a later sibling's background can cover an earlier sibling's background, but the earlier sibling's text still renders above the later one's background.

**Positioned layout**: positioned elements always paint above non-positioned ones (regardless of DOM order). Among positioned siblings, DOM order wins by default — later = on top. Content does *not* float separately.

`z-index` overrides the default order — but only on positioned elements (also flex/grid items). Higher = closer to viewer. Default is `auto` (effectively 0). Negative values are legal but generally not worth the complexity.

### Stacking contexts

A stacking context is a self-contained painting bubble. Its children's `z-index` values only compete *within* it. From the outside, the whole context is treated as one layer based on the context's own z-index. This is what causes the classic "no matter how high I set the modal's z-index it's still behind the header" bug — the modal lives in a stacking context whose root is lower than the header's.

Triggers for a new stacking context (incomplete list):

- `position` + `z-index` (other than `auto`)
- `position: fixed` or `position: sticky` (no z-index needed)
- `opacity` < 1
- `transform`, `filter`, `clip-path`, `perspective`, `mask`, `backdrop-filter` (any value other than none)
- `mix-blend-mode` other than `normal`
- `will-change` naming any of the above
- `isolation: isolate` (its sole job)
- A `z-index` on a child of a `display: flex` or `display: grid` parent

### Managing z-index

Strategies to escape z-index inflation:

1. **Swap DOM order.** If the on-top element should logically come later in the DOM, just put it later — no z-index needed. Caveat: keyboard tab order follows DOM order, so don't reorder interactive elements.
2. **Isolate.** Wrap a group of layered elements in a parent with `isolation: isolate`. The group becomes a single context — internal z-index values stay internal and won't fight other parts of the page. This is the cleanest tool: doesn't require setting `position` or `z-index` on the parent.

```css
.pricing { isolation: isolate; }
.card { position: relative; z-index: 1; }
.primary.card { z-index: 2; }  /* won't fight the site header anymore */
```

3. **Use small consistent values** (`1`, `2`, `3`) inside each isolated context, rather than `9999`.

Debug with the [CSS Stacking Context Inspector](https://github.com/andreadev-it/stacking-contexts-inspector) extension — shows which context an element belongs to and whether its z-index is doing anything.

### 3D rendering contexts

`transform-style: preserve-3d` on a parent opts children into a 3D rendering context — they're positioned in 3D space rather than flat-stacked. `translateZ`, `rotateX`, etc., determine which element paints in front; `z-index` becomes a default that 3D transforms override. Combine with `perspective` on the same or ancestor element for the visual projection. Without `preserve-3d`, transforms still apply but stacking remains flat (z-index/DOM-order).

MDN: [Stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_positioned_layout/Stacking_context), [isolation](https://developer.mozilla.org/en-US/docs/Web/CSS/isolation).

---

## Hiding Content

There are many ways to "hide" — they differ on: takes space?, paintable?, focusable?, read by screen readers?, indexed by search engines?

| Technique | Takes space | Painted | Focusable / clickable | Screen reader |
|---|---|---|---|---|
| `display: none` | No | No | No | No |
| `visibility: hidden` | Yes | No | No | No |
| `opacity: 0` | Yes | No (invisible) | **Yes** | Yes |
| `aria-hidden="true"` | Yes | Yes | Yes (still tab-able!) | No |
| `inert` (HTML attribute) | Yes | Yes | No | No |
| `.visually-hidden` (sr-only) | ~No (1px) | No (clipped) | No | **Yes** |

### `display: none`

Removed from layout and paint entirely. Cannot receive focus, cannot be clicked, ignored by screen readers and (mostly) search engines. Common for responsive show/hide toggles between mobile/desktop variants:

```css
.desktop-header { display: none; }
@media (min-width: 1024px) {
  .desktop-header { display: block; }
  .mobile-header { display: none; }
}
```

In React, equivalent to conditionally not rendering — but DOM mounting/unmounting has perf and state-preservation implications. Choose between them deliberately.

### `visibility: hidden`

Keeps the element's box (holds space open) but skips painting and disables interaction. Unusual super-power: a child can override its hidden parent with `visibility: visible` — no other hiding mechanism allows selective child reveal. Useful for swap-in-place UI (Q&A where the answer reserves layout space before reveal).

### `opacity: 0`

Visually invisible but **still focusable, clickable, selectable, screen-reader-visible**. Don't use alone for hiding — keyboard users will tab into invisible interactive elements with no focus indicator visible. Reserve for fade animations or semi-transparent states.

### `.visually-hidden` / sr-only

Hide visually but expose to screen readers. Standard implementation:

```css
.visually-hidden {
  position: absolute;
  overflow: hidden;
  clip: rect(0 0 0 0);
  height: 1px;
  width: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
}
```

Used for icon-button labels:

```html
<button>
  <span class="visually-hidden">Contact support</span>
  <HelpCircleIcon />
</button>
```

Preferred over `aria-label` when possible: automatic translation services translate visible-but-clipped text, but ignore `aria-label`.

### `aria-hidden` and `inert`

`aria-hidden="true"` removes content from the accessibility tree — screen readers skip it. **It does NOT remove descendants from tab order.** A link inside an `aria-hidden` paragraph is still keyboard-focusable, which is a bad experience.

`inert` (HTML attribute, supported in all modern browsers since early 2023) properly removes a subtree from interaction *and* the accessibility tree. Often pair them:

```html
<div inert aria-hidden="true"> ... </div>
```

Use case: duplicate-text rising-link effects, off-screen modal content, decorative cloned nodes.

MDN: [display](https://developer.mozilla.org/en-US/docs/Web/CSS/display), [visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/visibility), [inert](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inert).

---

## Pointer Events

`pointer-events: none` makes an element "phantom" for pointer input — clicks/taps pass through to whatever's behind. The element is still painted and (usually) still keyboard-focusable; text may still be selectable depending on browser.

Killer feature: **descendants can restore it**. Mark a big wrapper as non-clickable, then re-enable interaction on specific children:

```css
.toast-wrapper { pointer-events: none; }  /* full-width invisible parent */
.toast        { pointer-events: auto; }   /* this child *is* clickable */
```

Use case: a centered floating notification needs a wide parent for layout (CSS Grid positioning) but the parent's empty space mustn't block clicks on the page below. Excellent for floating UIs (toasts, snackbars, focus rings, decorative overlays).

MDN: [pointer-events](https://developer.mozilla.org/en-US/docs/Web/CSS/pointer-events).

---

## Portals

A portal renders a component's children into a different DOM location than their React/Vue/Svelte parent — typically directly into `<body>` — while preserving the original logical parent for state/events/context. Available as:

- React: `ReactDOM.createPortal`
- Vue: `<Teleport>`
- Angular: `@angular/cdk/portal`
- Svelte: third-party libs

Why: keep modals/tooltips/dropdowns out of ancestors whose CSS (overflow, transform, z-index, stacking context) would constrain or clip them. Putting them at the document root sidesteps all the inheritance traps.

Most app authors won't write portals directly — pull them in via accessibility-first headless libraries like [Radix Primitives](https://www.radix-ui.com/primitives) or [Headless UI](https://headlessui.com/). The native [`<dialog>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog) element also covers many modal needs with the [top-layer](https://developer.mozilla.org/en-US/docs/Glossary/Top_layer) — escaping stacking contexts entirely.

---

## Centering Patterns

A reference of the techniques covered above:

**Horizontal only (block in flow)** — auto margins:

```css
.box { width: 50%; margin-inline: auto; }
```

Requires explicit width.

**Absolute centering (any direction)** — full-edge anchor + auto margins:

```css
.box {
  position: absolute;  /* or fixed for modals */
  inset: 0;
  width: 200px; height: 100px;
  margin: auto;
}
```

Requires fixed dimensions.

**Inset shortcut**: `inset: 0` replaces `top:0; left:0; right:0; bottom:0`. `inset: 25px` insets equally on all sides.

**Flexbox** (modern, no fixed dimensions needed):

```css
.parent { display: flex; justify-content: center; align-items: center; }
```

**Grid** (single child):

```css
.parent { display: grid; place-items: center; }
```

**Baseline alignment** (flexbox) — for logos beside nav links, labels beside inputs:

```css
.nav { display: flex; align-items: baseline; }
```

Lines up text baselines across elements of different sizes — the right tool for typographic alignment, where `center` would look subtly off.

**Per-child override** in flex: `align-self: flex-start | center | baseline | flex-end | stretch`. There is no `justify-self` in flexbox — primary-axis per-item control comes from `flex-grow`, `flex-shrink`, `flex-basis`, `order`, or auto margins. (`justify-self` exists in Grid.)

---

## Quick reference: load-bearing CSS-isms

- `position: relative` does nothing visible but enables `z-index`, contains absolute children, and creates a stacking context (with z-index).
- `transform`, `filter`, `will-change`, and friends silently turn an ancestor into a containing block for fixed descendants and create a new stacking context.
- Percentage padding/margin (any side) resolves against the parent's *width*, not height.
- Block elements with `width: auto` fill the parent; replaced elements with `width: auto` use intrinsic size.
- Default block height is "as small as possible"; percentage heights need a chain of concrete heights up to the root.
- Margin collapse happens only between block-direction margins of in-flow siblings/parent-child; flex/grid items never collapse.
- `overflow: hidden`/`auto`/`scroll` all create a scroll container; `overflow: clip` does not.
- `isolation: isolate` is the cleanest way to create a stacking context.
- `inset: 0; margin: auto` + fixed size = centered absolute element.
## Flexbox & Grid

Both are CSS **layout modes** — algorithms that reinterpret properties like `width`, `margin`, and `z-index`. Flexbox excels at distributing a group of items along a single axis; Grid is built for true two-dimensional layouts.

---

## Flexbox

Activate with `display: flex` on the **parent**. The parent itself still participates in Flow layout; only its direct children enter the flex formatting context.

```css
.row { display: flex; }
```

### The two axes

Everything in Flexbox is pegged to two perpendicular axes:

- **Primary axis** — the axis items line up along (defaults to horizontal).
- **Cross axis** — perpendicular to the primary axis.

`flex-direction` controls which physical direction the primary axis runs:

| value | primary axis | notes |
|---|---|---|
| `row` (default) | left → right | |
| `column` | top → bottom | |
| `row-reverse` | right → left | flips `flex-start`/`flex-end` |
| `column-reverse` | bottom → top | |

`*-reverse` only changes **visual** order. DOM order (and therefore tab/screen-reader order) is unchanged — a common a11y gotcha.

### Alignment: `justify-*` vs `align-*`, `*-content` vs `*-items`

Two orthogonal questions:

- **`justify`** = along the primary axis. **`align`** = along the cross axis.
- **`-content`** = how the *group* is distributed. **`-items`** = where each individual item sits within its track.

The asymmetry of available properties falls out of one observation: along the primary axis, items are skewered together like a kebab — you can only think of them as a group. Along the cross axis, each item is on its own skewer (a tray of cocktail wieners) and can move independently. That's why there is no `justify-self` or `justify-items` in Flexbox — they wouldn't make sense.

| property | axis | acts on | values |
|---|---|---|---|
| `justify-content` | primary | the group | `flex-start`, `flex-end`, `center`, `space-between`, `space-around`, `space-evenly` |
| `align-items` | cross | each item | `stretch` (default), `flex-start`, `flex-end`, `center`, `baseline` |
| `align-self` | cross | one item (override) | same as `align-items` |
| `align-content` | cross | the rows (group) | only meaningful when `flex-wrap: wrap` produces multiple lines |

`align-items` is essentially syntactic sugar for setting `align-self` on every child.

```css
.wrapper { display: flex; align-items: center; }
.wrapper > .pop-out { align-self: flex-start; }
```

The `space-*` values exist on `justify-content`/`align-content` (group-level) but not on `align-items` (per-item) — a single item has no "between" to distribute.

MDN: [justify-content](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content) · [align-items](https://developer.mozilla.org/en-US/docs/Web/CSS/align-items) · [align-content](https://developer.mozilla.org/en-US/docs/Web/CSS/align-content) · [align-self](https://developer.mozilla.org/en-US/docs/Web/CSS/align-self)

### Sizing: hypothetical size, minimum size, and `flex-basis`

There are **two** sizes the algorithm cares about for each child:

1. **Hypothetical size** — what `width`/`height`/`flex-basis` *requests*. A suggestion, not a guarantee.
2. **Minimum content size** — the smallest the item can shrink to without overflowing its content. By default, the algorithm will **not** shrink below this.

`flex-basis` does the same thing as `width` in a flex row (and `height` in a flex column) — it sets the hypothetical size along the primary axis. Differences:

- `flex-basis` wins if both are specified.
- `width` can shrink an element **below** its minimum content size; `flex-basis` cannot.
- `flex-basis` is axis-aware — it always points along the primary axis. `width` is always horizontal regardless of `flex-direction`.
- `width` and `flex-basis` affect replaced elements (images) differently — see image gotcha below.

### `flex-grow`, `flex-shrink`, and the `flex` shorthand

Two separate worlds:

- **`flex-grow`** (default `0`) — opt in to consuming **extra** space. Values are unitless ratios. Three children with `flex-grow: 1, 3, 1` share the leftover space 1/5, 3/5, 1/5.
- **`flex-shrink`** (default `1`) — controls how items give up space when there's a **deficit**. Also a ratio, but the algorithm *also* weighs by each child's hypothetical size, so two same-size items with the same `flex-shrink` shrink equally.

Only one is ever active. Extra space → grow. Deficit → shrink. There's no in-between.

**`flex-shrink: 0`** opts an item out of shrinking entirely — useful for SVG icons, avatar circles, and anything you don't want squashed. The algorithm then treats `flex-basis`/`width` as a hard floor.

The `flex` shorthand packs all three:

```css
/* flex: <grow> <shrink> <basis> */
.col { flex: 1 1 200px; }
```

Quirky single-value behavior — `flex: 1` is **not** `flex-grow: 1`. It expands to:

```css
flex-grow: 1;
flex-shrink: 1;
flex-basis: 0;   /* note: 0, not auto */
```

Because basis collapses to `0`, every `flex: 1` child has a hypothetical width of zero, then the *entire* row width is divvied up by `flex-grow`. This is what makes `flex: 1` produce equal-width columns even if their content differs — a very different result from `flex-grow: 1` alone (which divides only the *leftover* space after content is measured).

MDN: [flex](https://developer.mozilla.org/en-US/docs/Web/CSS/flex) · [flex-grow](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-grow) · [flex-shrink](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-shrink) · [flex-basis](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-basis)

### The minimum-size gotcha (and the `min-width: 0` trick)

The single most useful Flexbox debugging fact:

> The algorithm refuses to shrink a child below its minimum content size, **no matter how large `flex-shrink` is**. The content overflows instead.

Defaults that bite:

- `<input type="text">` has a default minimum width of ~170–200px (browser-dependent).
- A text-containing element's minimum width is the length of the longest unbreakable word.

The escape hatch: override the implicit minimum.

```css
.flex-child { min-width: 0; }   /* or min-height: 0 in a column */
```

This is *the* fix when a flex child with `overflow: hidden` or `text-overflow: ellipsis` refuses to clip and instead pushes its siblings off-screen. The default `min-width: auto` is what's holding it open; setting `min-width: 0` lets the algorithm shrink it freely. Use with care — the floor exists for a reason (prevents long words from punching holes in the layout).

### Wrapping

`flex-wrap: wrap` lets items break onto new lines when they don't fit at their hypothetical size:

```css
.deconstructed {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}
.deconstructed > * { flex: 1 1 150px; max-width: 250px; }
```

With wrapping enabled, items refuse to shrink below their hypothetical size when wrapping is an option — they prefer a new row over getting squashed. Each wrapped row becomes its own mini-flex context: `align-items` operates *within* a row, `align-content` distributes the rows as a group on the cross axis. `wrap-reverse` wraps upward.

The "deconstructed pancake" layout (3 items that go 3-up → 2-up + 1 → 1-up as width shrinks) is the canonical wrap demo — no media queries needed.

MDN: [flex-wrap](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-wrap)

### Gaps

`gap` puts space **between** children only (no leading/trailing). Replaces the old `margin` hack.

```css
.row { display: flex; gap: 16px; }          /* one value for both axes */
.row { display: flex; gap: 8px 16px; }      /* row-gap col-gap */
```

Safe to use in all modern browsers since 2021.

MDN: [gap](https://developer.mozilla.org/en-US/docs/Web/CSS/gap)

### Auto margins — the split-nav trick

`margin: auto` in Flexbox consumes **all remaining space** along the relevant axis, applying it as margin. This is the cleanest way to split a row:

```css
nav ul { display: flex; gap: 12px; }
nav ul .logo { margin-right: auto; }   /* logo left, everything else right */
```

You can apply auto margins on both sides (`margin-inline: auto`) to perfectly center one item while pushing siblings outward, or on cross-axis sides for vertical splits in a column.

### Order

`order` (default `0`) lets you re-shuffle items like `z-index`. Higher `order` comes later. Like `*-reverse`, this is **visual only** — DOM order and tab order are unchanged, so use sparingly. For complex reordering reach for Grid.

```css
aside { order: -1; }   /* render first regardless of DOM position */
```

MDN: [order](https://developer.mozilla.org/en-US/docs/Web/CSS/order)

### Flexbox interactions with other layout modes

- **Positioned children**: when a flex child has `position: absolute` or `fixed`, positioned layout wins outright. The flex parent ignores the child entirely. `position: relative` is the exception — the child is laid out by Flexbox first, then transposed.
- **No margin collapse**: adjacent flex children's margins never collapse (margin collapse is exclusive to Flow layout). Generally a relief.
- **`z-index` works without `position`**: Flexbox (and Grid) honor `z-index` on statically-positioned children. In plain Flow you'd need `position: relative` first.
- **Sticky in a flex container**: works, but the default `align-items: stretch` makes the sidebar fill the parent's height, leaving no slack for stickiness. Two fixes:

```css
/* Option A — let the Flexbox algorithm decide */
nav { align-self: flex-start; }

/* Option B — break the stretch via height */
nav { position: sticky; top: 0; height: fit-content; }
```

### Images and Flexbox

Images are replaced elements with intrinsic dimensions, and they interact oddly with Flexbox:

- An `<img>` with `flex: 1` will overflow when the container shrinks past its intrinsic width, even though `flex: 1` sets `flex-basis: 0`. The image's intrinsic size acts as a minimum it won't drop below.
- Two images with `flex: 1` and `flex: 2` don't scale 2:1 the way you'd expect — their intrinsic dimensions skew the ratio.

Fixes: wrap the image in a `<div>` and apply flex to the wrapper, or set `min-width: 0` on the image, or apply `width: 100%; height: auto` to the image with explicit flex sizing on a parent.

### Recipes

**Center anything** (the famous one-liner):

```css
.parent { display: flex; justify-content: center; align-items: center; }
```

**Split nav** (logo left, links right): give the first child `margin-right: auto` (or wrap the links in a flex container with their own gap).

**Stretch fill** (sidebar + main filling remaining width):

```css
section { display: flex; }
nav  { width: 220px; flex-shrink: 100000; }  /* shrinks aggressively when cramped */
main { flex-grow: 1; }                        /* eats remaining space */
```

**Holy Grail with Flexbox** (header / [nav, main, aside] / footer):

```css
.wrapper { display: flex; flex-direction: column; min-height: 100vh; }
.middle  { display: flex; flex: 1; }
nav, aside { flex: 1; }
main       { flex: 3; }
```

**Equal-width fluid columns** (the `flex: 1` trick): all children with `flex: 1` produce truly equal columns regardless of content length.

**Prevent icon squash** in an Alert: `flex-shrink: 0` on the icon wrapper. Preferred over `min-width` because it expresses intent ("don't shrink me") more directly.

**Overstuffed + centered**: when an item exceeds its container, `align-items: center` keeps it centered (positive *and* negative overflow), unlike `margin: 0 auto` which only centers when the item fits.

**Combining flex + sticky for matching-height columns** — let one column grow naturally while the other (with `height: 0`) only scrolls:

```css
section { display: flex; overflow: auto; gap: 32px; }
.col { flex: 1; }
.col:first-of-type  { position: sticky; top: 0; }
.col:last-of-type   { height: 0; }   /* scrolls past parent */
```

### Four-layouts-for-the-price-of-one form (no media queries)

```css
form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
.name  { flex-grow: 1; flex-basis: 120px; }
.email { flex-grow: 3; flex-basis: 170px; }
button { flex-grow: 1; flex-basis: 70px;  }
```

As the container shrinks, items wrap into 2 rows, then 3, then 4 — distributing extra space proportionally to `flex-grow` ratios. Pure flex.

---

## Grid

Activate with `display: grid` on the parent. The child layout is then governed by Grid; cousins still see the parent as Flow-block.

### Implicit vs explicit grids

With no template, Grid builds an **implicit** grid: 1 column × N rows (one row per child). Each cell stretches to fill its track.

Define an **explicit** grid via:

```css
.wrapper {
  display: grid;
  grid-template-columns: 250px 1fr;
  grid-template-rows: 64px 1fr 100px;
}
```

A single grid can mix both: if you specify columns but more children land than declared rows, Grid keeps generating **implicit rows** below. Implicit tracks default to `auto` (sized to content). Override with `grid-auto-rows` / `grid-auto-columns`:

```css
.wrapper { grid-auto-rows: 100px; }
```

### Tracks, lines, areas

- A **track** is a row or column.
- A **line** is the divider between (or at the edge of) tracks. An *n*-column grid has *n+1* column lines, numbered from 1.
- An **area** is a rectangular region you name.

### Track sizing: `fr`, `minmax`, `repeat`, `auto-fit` / `auto-fill`

`fr` ("fraction") distributes leftover space. Like `flex-grow` for columns:

```css
grid-template-columns: 200px 2fr 1fr;
/* First, reserve 200px. Then split the rest 2:1. */
```

Unlike Flexbox, fixed units (`px`, `%`, `rem`) are **hard limits** — columns won't grow to fit overflowing content. `fr` and `auto` are the flexible ones.

`minmax(min, max)` — a track that's at least `min`, at most `max`:

```css
grid-template-columns: minmax(200px, 1fr) 3fr;
```

`repeat(n, value)` — sugar for repetition:

```css
grid-template-columns: 250px repeat(5, 1fr);     /* sidebar + 5 equal columns */
grid-template-columns: repeat(3, minmax(0, 1fr));/* equal columns that may shrink below content */
```

`repeat(0, 1fr)` is a workhorse for content-overflow situations: `minmax(0, 1fr)` lets the track shrink below intrinsic content size (the grid version of Flex's `min-width: 0` trick).

**Responsive grids without media queries** — `auto-fit` and `auto-fill`:

```css
grid-template-columns: repeat(auto-fit,  minmax(200px, 1fr));
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
```

Both create as many ≥200px columns as fit, expanding remainder to `1fr`. Difference appears when there are fewer items than fit:

- **`auto-fit`** *collapses* empty tracks to 0 — existing items stretch to fill the row.
- **`auto-fill`** *preserves* empty tracks — items keep their min size and trailing space is left blank.

MDN: [grid-template-columns](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-columns) · [minmax()](https://developer.mozilla.org/en-US/docs/Web/CSS/minmax) · [repeat()](https://developer.mozilla.org/en-US/docs/Web/CSS/repeat)

### Placing items by line

`grid-column` / `grid-row` use line numbers (or `span N`):

```css
.featured { grid-column: 1 / 3; }   /* line 1 to line 3 = first two columns */
.featured { grid-column: 1 / -1; }  /* full width — -1 is the last line */
.featured { grid-column: span 2; }  /* span 2 tracks from current position */
.banner   { grid-row: 2 / span 3; }
```

### Named lines

Lines can be named in brackets within `grid-template-columns`:

```css
grid-template-columns:
  [full-start] 1fr
  [main-start] minmax(0, 65ch)
  [main-end]   1fr
  [full-end];

article { grid-column: main-start / main-end; }
.bleed  { grid-column: full-start / full-end; }
```

Multiple names per line are allowed: `[main-end content-start]`.

### Named template areas

The crown-jewel ergonomic API:

```css
.wrapper {
  display: grid;
  grid-template-areas:
    "sidebar header"
    "sidebar main";
  grid-template-columns: 250px 1fr;
  grid-template-rows: 80px 1fr;
}
aside  { grid-area: sidebar; }
header { grid-area: header; }
main   { grid-area: main; }
```

Use `.` for empty cells. Each row string must have the same number of cell tokens; areas must form rectangles. This is syntactic sugar that compiles to line-based placement — the algorithm still thinks in tracks and lines.

**Holy Grail with Grid**:

```css
body {
  display: grid;
  grid-template-areas:
    "header  header  header"
    "nav     main    aside"
    "footer  footer  footer";
  grid-template-columns: 200px 1fr 150px;
  grid-template-rows: 4rem 1fr 5rem;
  min-height: 100vh;
}
header { grid-area: header; }
nav    { grid-area: nav; }
main   { grid-area: main; }
aside  { grid-area: aside; }
footer { grid-area: footer; }
```

MDN: [grid-template-areas](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template-areas) · [grid-area](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-area)

### Auto-flow and `dense` packing

`grid-auto-flow` controls how unplaced items fill the grid:

- `row` (default) — fill left-to-right, top-to-bottom, generating new rows as needed.
- `column` — fill top-to-bottom, left-to-right, generating new columns.
- `row dense` / `column dense` — **backfill gaps**.

Without `dense`, if an item spans 2 columns but there's only 1 column left in the current row, the item pushes to the next row and leaves a hole. With `dense`, the algorithm pulls later items into the hole — but visual order no longer matches DOM order (a11y caveat).

```css
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-flow: row dense;
}
.featured { grid-column: span 2; }
```

Important conceptual note: Grid does **not** have a primary/cross axis. Rows always run along the block axis, columns along the inline axis. Changing `grid-auto-flow` doesn't flip them — it only changes how *unplaced* items are slotted in.

MDN: [grid-auto-flow](https://developer.mozilla.org/en-US/docs/Web/CSS/grid-auto-flow)

### Alignment in Grid

Grid has the full quartet — `justify-self` exists here (unlike Flexbox), because grid cells provide independent slots:

| property | axis | acts on |
|---|---|---|
| `justify-content` | inline (cols) | the **track structure** — moves columns within the grid |
| `align-content` | block (rows) | the **track structure** — moves rows |
| `justify-items` | inline | each **item** within its cell |
| `align-items` | block | each item within its cell |
| `justify-self` / `align-self` | per-item override | a single item within its cell |

`*-content` only does something when there's free space in the grid container (e.g., grid height exceeds row content, or columns don't fill width). `*-items` defaults to `stretch` — children fill their cell — but `center`, `start`, `end` change that.

`space-between`/`space-around`/`space-evenly` exist on `*-content` (group of tracks) but not on `*-items` (single item) — same reasoning as in Flexbox.

Shorthands: `place-content: <align> <justify>`, `place-items: ...`, `place-self: ...`.

### Gaps in Grid

Same `gap` property as Flexbox. `gap: row-gap column-gap` if asymmetric. Legacy: `grid-gap` (synonymous; needed only for IE).

### Auto-placement quirks worth knowing

- An item with `position: absolute` exits Grid layout entirely (parent ignores it). `position: relative` keeps it in grid but allows offset.
- `z-index` works in Grid without `position: relative`.
- `grid-template-columns: 100%` defines a single column that's exactly 100% wide — children can overflow. Use `1fr` or `minmax(0, 1fr)` to get truly flexible.

### Masonry layout — the `column-count` fallback

Native masonry (`grid-template-rows: masonry`) is still not broadly shipped. For now, the CSS-only approach uses CSS multi-column layout:

```css
ul {
  column-count: 3;
  column-gap: 16px;
}
ul li {
  break-inside: avoid;   /* don't split an item across columns */
  margin-bottom: 16px;
}
ul li img { width: 100%; display: block; }
```

Pros: trivially simple, content of varying heights packs naturally.

Cons:

- Reading order is **top-to-bottom within columns** (then next column), not left-to-right across rows. Tab order follows DOM, so the visual order can be jarring.
- Adding items dynamically (e.g., infinite scroll) re-flows everything across all columns rather than appending at the end.
- No per-item placement control.

For order-preserving masonry today, a JS library (Masonry.js) or a hand-rolled `order` + `:nth-child` Flexbox hack is required.

The future native syntax (currently behind flags or unshipped):

```css
.container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: masonry;
}
```

MDN: [column-count](https://developer.mozilla.org/en-US/docs/Web/CSS/column-count) · [break-inside](https://developer.mozilla.org/en-US/docs/Web/CSS/break-inside)

---

## Choosing between them

| Use Flexbox when… | Use Grid when… |
|---|---|
| Laying out items in a single row or column | Designing a 2D page-level structure |
| You want items to fluidly grow/shrink to fill available space | You want consistent column widths across rows |
| Content size should dictate item size | You want a fixed track grid regardless of content |
| Building components: nav bars, button rows, form fields, card internals | Building app shells, dashboards, photo galleries, card grids |
| Order of items should be content-driven | You need precise, named placement (`grid-area`) |
| You need axis flipping (`row` ↔ `column`) | You need overlapping items via z-index in cells |

Rule of thumb from the course: **Flexbox for content-driven 1D distributions; Grid for layout-driven 2D structures**. They compose freely — Grid for the page skeleton, Flexbox inside each region (e.g., a Grid-defined header containing a Flex nav).

### Quick decision examples

- **Centering a modal** → Flexbox (`justify-content: center; align-items: center;`) or Grid (`place-items: center;`). Either works; Grid is one declaration shorter.
- **Card with avatar + text** → Flexbox (1D, content sizes itself).
- **Photo gallery, varying widths** → Grid with `repeat(auto-fit, minmax(200px, 1fr))`.
- **Dashboard with header / sidebar / content / footer** → Grid with named areas.
- **Pinterest-style masonry** → CSS columns (or JS) — neither Flex nor Grid handles this natively yet.
- **Toolbar that wraps** → Flexbox with `flex-wrap: wrap`.
- **Form fields with proportional widths that re-flow** → Flexbox with `flex-grow` ratios + `flex-wrap`.

### MDN references

- [CSS Flexible Box Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout)
- [Basic concepts of Flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox)
- [CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout)
- [Basic concepts of grid layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout)
- [Realizing common layouts using grids](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Realizing_common_layouts_using_grids)
- [Auto-placement in CSS Grid](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Auto-placement_in_CSS_grid_layout)
## Responsive Design & Typography

A reference for adapting layouts, type, and assets across devices. Topics: media/container queries, fluid scaling, typography fundamentals, web font loading, responsive images, mobile UX, and print styles.

---

### Media Queries

Media queries conditionally merge CSS rules based on environment state (viewport size, user prefs, input device, media type). They behave like `if` blocks — they don't add specificity; ordering still wins.

```css
.signup-button { font-size: 1rem; }
@media (max-width: 400px) {
  .signup-button { font-size: 2rem; }
}
```

If the `@media` block comes *before* the unconditional rule, the unconditional rule overrides it. Specificity is unchanged by `@media`.

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_media_queries>

#### Mobile-first vs desktop-first

Two equivalent strategies; pick one and stick with it for a project.

```css
/* mobile-first: base styles target small, then grow up */
.thing { padding: 8px; }
@media (min-width: 550px)  { .thing { padding: 16px; } }
@media (min-width: 1100px) { .thing { padding: 24px; } }

/* desktop-first: base styles target large, override down */
.thing { padding: 24px; }
@media (max-width: 1099px) { .thing { padding: 16px; } }
@media (max-width: 549px)  { .thing { padding: 8px; } }
```

Avoid mixing both in the same project — it complicates the mental model and risks gaps from fractional viewport widths (e.g. 600.5px exists, especially in iframes).

When toggling between two elements (e.g. mobile vs desktop variants), prefer `display: revert` over mixing queries:

```css
.desktop-button { display: none; }
@media (min-width: 601px) {
  .desktop-button { display: revert; }
  .mobile-button  { display: none; }
}
```

`revert` restores the property to the browser default — a clean way to "undo" the base `display: none`.

#### Recommended breakpoints

Place breakpoints in *dead zones* between common device resolutions so similar devices share a layout (a 320px iPhone SE, 375px iPhone, and 414px iPhone all live in the same bucket):

| Range            | Bucket   |
|------------------|----------|
| 0 – 549px        | Mobile   |
| 550 – 1099px     | Tablet   |
| 1100 – 1499px    | Laptop   |
| 1500px+          | Desktop  |

Device names are convenience labels — a desktop user in a small window falls into the "mobile" bucket; a landscape tablet may match "laptop". Width queries describe *viewport size*, not device type.

A range query for tablet-only:

```css
@media (min-width: 550px) and (max-width: 1099.99px) { /* tablet only */ }
```

It's fine to use occasional one-off values, but if you reach for custom values often, your breakpoints are wrong.

#### Use rem, not px, for media queries

If a user bumps their browser's base font size up (e.g. for accessibility), pixel-based media queries don't react — the user gets a cramped desktop layout. Rem-based queries scale with their base font size and naturally drop them into a mobile layout when text gets big:

```css
/* Recommended */
@media (min-width: 34.375rem) { /* 550px at default 16px root */ }
```

Both `rem` and `em` behave identically inside media query conditions.

#### Boolean logic and media types

```css
@media screen and (min-width: 600px) { /* … */ }
@media (hover: hover) and (pointer: fine) { /* … */ }
```

`screen` and `print` are *media types*. Specifying `screen` has become uncommon; defaults are good. `and` is `&&`; `,` acts as `or` (rarely useful).

#### Hover & pointer queries

Don't gate `:hover` styles behind `min-width` — touchscreens come in large sizes, and desktop windows shrink. Gate them by *input capability*:

```css
@media (hover: hover) and (pointer: fine) {
  button:hover { text-decoration: underline; }
}
```

| Device            | `hover` | `pointer` |
|-------------------|---------|-----------|
| Mouse / trackpad  | hover   | fine      |
| Touchscreen       | none    | coarse    |
| Keyboard focus    | none    | none      |
| Stylus            | none    | fine      |

Why this matters: on iOS/Android, tapping an interactive element triggers `:hover` (and the state sticks until you tap elsewhere). Scrolling with a finger that grazes a button can fire hover unintentionally. Hover styles should be opt-in for fine pointers.

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover>

#### Preference-based queries

```css
@media (prefers-reduced-motion: no-preference) {
  .parallax { animation: drift 8s linear infinite; }
}

@media (prefers-color-scheme: dark) {
  :root { --bg: #111; --fg: #eee; }
}
```

`prefers-reduced-motion` is not just a "preference" — for vestibular-disorder users, runaway parallax can cause migraines or nausea. Gate animations behind `no-preference` so the default is *no animation*; that way users who haven't opted in are protected, and you avoid having to write `prefers-reduced-motion: reduce` overrides for every animation.

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion>, <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme>

#### Orientation

```css
@media (orientation: portrait)  { /* taller than wide */ }
@media (orientation: landscape) { /* wider than tall */ }
```

Rarely worth it in practice — conflicts with width queries and is less flexible. Reach for `min-width` first.

---

### Container Queries

Sometimes you need a layout to respond to its *container*'s size, not the viewport — e.g. a `ProfileCard` that switches between stacked and side-by-side based on the column it lands in.

```css
.card-wrapper { container-type: inline-size; }
.card         { /* narrow layout */ }
@container (min-width: 15rem) {
  .card { /* wide layout */ }
}
```

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_container_queries>

#### Why we need `container-type`

The "impossible problem" container queries had to solve: applying styles inside a query can change the container's size, which invalidates the query, which removes the styles, which restores the size — infinite flicker loop. The fix is the CSS Containment API: a container must opt out of dynamically responding to its content.

- `container-type: size` — both width *and* height are decoupled from content. The container collapses to 0 (plus padding/border) unless you give it explicit dimensions. Lets you query `min-width` *and* `min-height`.
- `container-type: inline-size` — only the *inline* dimension (width in LTR) is decoupled. Height still grows with content. Lets you query `min-width` / `max-width`. **This is almost always what you want.**

**Golden rule (Miriam Suzanne):** *you can't query a dimension that responds to content.* With `inline-size`, querying `min-height` won't work.

#### Named containers

```css
.sidebar  { container-type: inline-size; container-name: sidebar; }
.content  { container-type: inline-size; container-name: main; }

@container sidebar (min-width: 20rem) { /* … */ }
@container main    (min-width: 40rem) { /* … */ }
```

Without a name, the query matches the *nearest* ancestor container.

#### When to use container vs media

| Use media query              | Use container query                    |
|------------------------------|----------------------------------------|
| Page-wide layout shifts      | Reusable component adapts in any slot  |
| Global typography scale      | A card placed in sidebar vs main col   |
| Conditional nav / hero / chrome | A widget rendered in a grid of N cols |

Rule of thumb: if the component will be reused at different widths inside the same page, container queries; if you're restructuring the page itself, media queries.

---

### Fluid Design

Two strategies for adaptive sizing:
- **Responsive** — discrete breakpoints via media queries.
- **Fluid** — values change continuously with the viewport via `vw`/`%` and `clamp()`.

Neither is strictly better. Fluid is often simpler for typography and gap/spacing; responsive is simpler when whole sections rearrange.

#### Fluid layouts with Flexbox

A clean fluid pattern using `flex-wrap` and `min-width` — wraps automatically once children can't fit:

```css
.wrapper     { display: flex; flex-wrap: wrap; }
.description { flex: 1; min-width: 15rem; }
.bibliography{ flex: 1; min-width: 20rem; }
```

No media query needed — the layout reflows when the row can't fit the minimums.

#### Fluid type with `clamp()`

The naive approach is `font-size: 6vw` — but on very small screens text becomes too small, on very large screens too big, and (critically) **viewport units don't scale with user font-size preferences, which is a WCAG violation** (text must be scalable to 200%).

The robust pattern: clamp a `vw + rem` mix between two rem bounds.

```css
h1 {
  font-size: clamp(1.5rem, 4vw + 1rem, 3rem);
}
```

- The `rem` part is controlled by the user's root font size (preserves accessibility scaling).
- The `vw` part is controlled by viewport width (provides the fluid behavior).
- The outer bounds (also in `rem`) cap the size on tiny/huge screens.

Make sure the minimum value is at least `1rem` (or whatever your body text is) so that no zoom setting can shrink text below body size.

Inside `clamp()`, `min()`, and `max()`, arithmetic is allowed without `calc()`:

```css
font-size: clamp(1.5rem, 4vw + 1rem, 3rem); /* no calc() needed */
```

##### Linear interpolation between viewports

To pick the `vw` coefficient and `rem` offset for a target — e.g. "1.5rem at 700px, 3rem at 1000px" — solve:

```
size(v) = (vw_coef * v) + rem_offset
```

The differences give you the slope; substitute back for the intercept. Then clamp at the endpoints. Online "fluid type calculators" automate this.

##### Safari quirk

When `vw` and `clamp()` are combined, Safari may compute the value only at first paint and not recompute on resize. Workaround:

```css
h1 {
  font-size: clamp(1.5rem, 6vw, 3rem);
  min-height: 0vh; /* forces Safari to re-evaluate */
}
```

##### Don't fluid-size body text

Use fluid sizing for headings and other large display text. Body text should stay at a fixed `~1rem` — viewport units make body text uncomfortably small on phones.

#### Fluid spacing

The same `clamp(min, vw + rem, max)` trick works for `gap`, `padding`, `margin`, etc:

```css
ul { display: flex; gap: clamp(1rem, 6vw - 1rem, 5rem); }
```

---

### Typography Fundamentals

#### Font properties

```css
font-family: 'Lato', Futura, Helvetica, Arial, sans-serif;
font-weight: 400;       /* normal */
font-weight: 700;       /* bold; numeric 1–1000 */
font-style:  italic;
text-decoration: underline;
text-transform: uppercase;  /* keeps source HTML casing intact */
text-align: center;
```

Always end a font stack with a generic family (`serif`, `sans-serif`, `monospace`, `cursive`).

Use semantic HTML for meaning (`<strong>`, `<em>`) — assistive tech can convey emphasis. Use CSS for purely visual styling (e.g. bolding a form `<label>`).

#### Line length (`ch`)

Aim for ~50–75 characters per line for comfortable reading. The `ch` unit equals the width of the `0` glyph at the current font size — an imperfect proxy, but close enough:

```css
p { max-width: 50ch; }
```

#### Line height

`line-height` takes a unitless number that multiplies the element's `font-size`. **Always use unitless** so it scales with font-size changes:

```css
p { line-height: 1.5; } /* WCAG 1.4.12 minimum */
```

Browser defaults are around 1.15–1.2 — too tight for accessible body text.

#### Letter spacing & kerning

- `letter-spacing` — additive horizontal gap between characters; in display headings, slight negative values often look tighter and more polished.
- `font-kerning: normal | none` — toggles the font's built-in pair kerning. No fine-grained control; for custom kerning, set `font-kerning: none`, wrap each letter in a span, and tune `letter-spacing` per span.

```css
h1 { letter-spacing: -0.02em; }  /* tightens display text */
```

#### `font-feature-settings`

OpenType features (ligatures, tabular numerals, small caps, stylistic alternates):

```css
.amount { font-feature-settings: "tnum"; }       /* tabular numerals for tables */
.title  { font-feature-settings: "smcp", "liga"; } /* small caps + ligatures */
```

Prefer the higher-level properties when they exist (`font-variant-numeric: tabular-nums`, `font-variant-caps: small-caps`).

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/font-feature-settings>

#### `text-rendering` and font smoothing

Browsers and OSes rasterize vector fonts differently — Chrome and Safari kern differently, Windows uses colored anti-aliasing (ClearType), macOS doesn't. You don't have full control, but:

```css
* {
  -webkit-font-smoothing: antialiased;       /* macOS Chrome/Safari/Edge */
  -moz-osx-font-smoothing: grayscale;        /* macOS Firefox */
}
```

Since macOS Mojave (2018) Apple disabled subpixel-antialiasing system-wide because of retina displays; browsers don't inherit, so manually setting `antialiased` matches the OS default. On Windows there's no CSS hook — ClearType isn't exposed.

`text-rendering: optimizeLegibility` enables ligatures and kerning at the cost of perf on huge documents; for most pages it's a no-op or a tiny win.

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/text-rendering>

#### `text-align` vs Flexbox `align-items`

They look similar in trivial cases but differ once the text wraps:
- `text-align: center` centers each *line of text* within its block.
- `align-items: center` (in a Flex column) centers the *whole block* horizontally but lines inside still wrap left-aligned.

For paragraphs in a centered column, you usually want `align-items: center` on the container + `text-align: left` on the paragraph.

#### Form fields on iOS

iOS Safari zooms in on focused form fields if their text is smaller than 16px. Setting inputs to ≥1rem prevents the auto-zoom:

```css
input, select, textarea { font-size: 1rem; }
```

---

### Font Stacks

#### System font stack

Get the OS's default UI font on every platform — fast, native-feeling, zero download:

```css
:root {
  --font-sans:
    -apple-system, BlinkMacSystemFont,
    avenir next, avenir,
    segoe ui,
    helvetica neue, helvetica,
    Ubuntu, roboto, noto,
    arial, sans-serif;
}
body { font-family: var(--font-sans); }
```

- `-apple-system` / `BlinkMacSystemFont` — current macOS/iOS system font (SF Pro).
- `Segoe UI` — Windows.
- `Roboto` — Android / Chrome OS.

See <https://systemfontstack.com> for serif and mono variants.

#### Font stacks as fallback ladder

```css
font-family: 'Roboto', Arial, sans-serif;
```

Two reasons a custom font can be unavailable: not installed (manual web font) and not yet downloaded. Always quote web font names ('Roboto') as a convention — distinguishes them from local fonts at a glance.

---

### Web Fonts

#### `@font-face`

```css
@font-face {
  font-family: 'Wotfard';
  src: url('/fonts/wotfard-regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: fallback;
}
@font-face {
  font-family: 'Wotfard';
  src: url('/fonts/wotfard-bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: fallback;
}
```

One `@font-face` per (weight × style) file. The font file has no metadata — the descriptors *link* the file to a weight/style.

Inline `@font-face` declarations in the document `<head>` so the browser starts the download as early as possible.

#### Faux bold/italic

If you ask for `font-weight: 700` and there's no 700 file declared, the browser *fakes* it — thickening every stroke uniformly. Faux italics just slant the regular characters. Both look noticeably worse than real designed weights/italics. Either supply the real files or accept the fallback at the regular weight.

#### FOIT vs FOUT — `font-display`

While a web font is downloading, the browser can either:
- **FOIT** (Flash Of Invisible Text) — hide the text until the font loads.
- **FOUT** (Flash Of Unstyled Text) — show the fallback immediately and swap when the web font arrives.

Three timeline periods: **block** (invisible text, swap in if loaded), **swap** (fallback shown, swap in if loaded), **failure** (fallback locked in).

| Value      | Block | Swap | Failure | Best for                             |
|------------|-------|------|---------|--------------------------------------|
| `block`    | ~3s   | ∞    | —       | Icon fonts where text is meaningless without the font |
| `swap`     | ~0    | ∞    | —       | Google Fonts default; guarantees text always shows the web font eventually |
| `fallback` | ~100ms| ~3s  | yes     | Recommended default — best UX balance |
| `optional` | ~100ms| 0    | yes     | Web font as nice-to-have; first visit shows fallback, font cached for next visit |

`fallback` is a good default: fast connections avoid the FOUT (font loads inside the 100ms block window); slow connections never get a jarring late swap.

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display>

##### Ransom note effect

With `fallback`/`optional`, if (say) the regular weight loads in time but the bold weight doesn't, your bold text stays in the fallback font — mismatched families on the same page. Either use `swap`, use a variable font (one file for all weights), or live with the rare occurrence.

#### `preload` and `preconnect`

For self-hosted fonts, preload to start the download immediately:

```html
<link rel="preload" as="font" type="font/woff2"
      href="/fonts/wotfard-regular.woff2" crossorigin>
```

For third-party hosts (e.g. Google Fonts), `preconnect` opens the TCP/TLS connection early:

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap">
```

#### Fallback font matching (`size-adjust`, `ascent-override`)

To minimize the layout shift when the real font swaps in, define a tweaked fallback that approximates the web font's metrics:

```css
@font-face {
  font-family: "Fallback-Wotfard";
  size-adjust: 95%;
  ascent-override: 90%;
  descent-override: 20%;
  src: local("Arial");
}
body { font-family: "Wotfard", "Fallback-Wotfard", sans-serif; }
```

Tools: Fallback Font Generator, Fontaine, `next/font`.

#### Self-hosting vs Google Fonts

Self-hosting is faster (one fewer DNS lookup, no third-party connection) — measured savings of ~300ms desktop, ~1s on mobile 3G. It's also required for GDPR compliance (a 2022 German ruling fined a site for using Google Fonts directly because client IPs leak to Google).

---

### Font Optimization

- **woff2** — the modern format. ~30% smaller than woff, supported in every modern browser. Don't bother with `.ttf`/`.otf` for the web.
- **Subsetting** — strip glyphs you don't need (other scripts, rare symbols, unused weights). For an English-only site, removing Latin-Extended/Cyrillic/Greek can shrink a font 70–90%.
- Google Fonts auto-subsets and combines weights — when subsetting yourself with Glyphhanger or fontTools, you can match those gains.
- Self-hosted Google fonts via `google-webfonts-helper` for fixed weights, or the official `css2` URL for variable fonts.

Resources: Glyphhanger (Sara Soueidan), web.dev "Reduce Web Font Size".

---

### Variable Fonts

A single file containing a continuous range of styles along one or more *axes* — set arbitrary in-between values instead of picking from a fixed set of weight files.

```css
@font-face {
  font-family: 'Recursive';
  src: url('/fonts/recursive.woff2') format('woff2 supports variations'),
       url('/fonts/recursive.woff2') format('woff2-variations');
  font-weight: 300 1000;   /* range, not single value */
  font-display: fallback;
}

.headline { font-weight: 777; }    /* any value in range works */
```

Standardized axes (with their tags):
- `wght` (font-weight)
- `wdth` (font-stretch)
- `slnt` (font-style: oblique)
- `ital` (font-style: italic)
- `opsz` (optical sizing — different glyph designs for different sizes)

Custom axes use uppercase tags. Use `font-variation-settings` only for custom axes — for standard ones, prefer the high-level property:

```css
/* prefer this */
.h { font-weight: 725; font-stretch: 125%; font-style: oblique -10deg; }

/* over this (less readable, sometimes inconsistently implemented) */
.h { font-variation-settings: "wght" 725, "wdth" 125, "slnt" -10; }

/* but for custom axes you have no choice */
.casual { font-variation-settings: "CASL" 0.9, "CRSV" 1; }
```

Variable fonts shine when you need multiple weights — one file replaces 6+ separate weight/italic files, dramatically reducing FOUT risk and bandwidth.

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_fonts/Variable_fonts_guide>

---

### Responsive Images

#### Device pixel ratio

Modern phones have a 2x or 3x ratio between hardware and software (CSS) pixels — an iPhone with `devicePixelRatio = 3` maps each CSS px to a 3×3 grid of hardware pixels. A native-sized image is upscaled and looks fuzzy. Export 1x / 2x / 3x assets and let the browser pick.

#### `srcset` (density-based)

```html
<img alt="Diamond"
     src="/img/diamond.png"
     srcset="/img/diamond.png    1x,
             /img/diamond@2x.png 2x,
             /img/diamond@3x.png 3x">
```

`srcset` is the candidate list; the redundant `src` is the IE/legacy fallback. The browser picks the highest matching density it'll actually use (subject to bandwidth heuristics).

In JSX it's `srcSet` (camelCase).

#### `srcset` + `sizes` (width-based)

For images that scale fluidly with viewport width, describe each candidate by its intrinsic width and tell the browser how wide the image will *render*:

```html
<img alt=""
     src="hero-800.jpg"
     srcset="hero-400.jpg  400w,
             hero-800.jpg  800w,
             hero-1600.jpg 1600w"
     sizes="(min-width: 60rem) 50vw, 100vw">
```

`sizes` is a media-query → CSS length list; the browser picks the smallest candidate that's still ≥ the resolved size × DPR.

MDN: <https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#srcset>

#### `<picture>` for art direction & format fallbacks

`<picture>` is a wrapper that lets the `<img>` choose between multiple `<source>` candidates. Use it for:

1. **Modern format fallbacks** — serve AVIF/WebP with PNG fallback.
2. **Art direction** — different *crops* at different viewport sizes (not just different resolutions of the same image).

```html
<picture>
  <source type="image/avif" srcset="hero.avif 1x, hero@2x.avif 2x">
  <source type="image/webp" srcset="hero.webp 1x, hero@2x.webp 2x">
  <img alt="" src="hero.png">
</picture>
```

```html
<!-- art direction: portrait crop on phones, landscape on desktop -->
<picture>
  <source media="(max-width: 40rem)" srcset="hero-portrait.jpg">
  <source media="(min-width: 40rem)" srcset="hero-landscape.jpg">
  <img alt="" src="hero-landscape.jpg">
</picture>
```

Order matters — the browser picks the first matching `<source>`. Put smallest/most modern first.

The nested `<img>` is required and is what actually renders (and what you style and put `alt` on). `<picture>` itself behaves like an inline `<span>` wrapping the img. Ignore `<source>` for styling — they're metadata.

Frameworks (`next/image`, `gatsby-image`) automate srcset/picture generation; consider them before building this by hand.

MDN: <https://developer.mozilla.org/en-US/docs/Web/HTML/Element/picture>

---

### Responsive Typography

#### Body text stays the same size everywhere

Counter-intuitive but true: device manufacturers normalize perceived font size across screen DPI. A 16px paragraph "looks" about the same size on a phone held a foot from your face and a monitor three feet away. Don't shrink body text on mobile.

- Minimum body size: **1rem (16px)**.
- Content-heavy sites sometimes go up to ~21px on desktop.
- Use `rem`, not `px`, so users can scale.

#### Headings shrink on mobile

A 2.5rem (40px) headline is fine on desktop, claustrophobic on a 320px phone. Either step it down at a breakpoint or use a fluid clamp:

```css
/* responsive */
h1 { font-size: 2.5rem; }
@media (max-width: 34rem) { h1 { font-size: 1.75rem; } }

/* fluid */
h1 { font-size: clamp(1.75rem, 4vw + 1rem, 2.5rem); }
```

#### Captions and other small text

Tiny text (`figcaption`, footnotes) can be bumped to ~1rem on mobile if it carries real content. If it's purely cosmetic (copyright lines), leaving it small is fine.

---

### Mobile-Specific Concerns

#### The viewport meta tag

```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

Without it, iOS Safari pretends the viewport is 980px wide and zooms out to fit — every site looks like a desktop mini-map. `width=device-width` says "use the device's actual CSS pixel width"; `initial-scale=1` says "don't zoom by default". Don't set `maximum-scale` or `user-scalable=no` — that disables pinch-zoom, which is an accessibility regression.

#### Touch targets (44×44 minimum)

Apple's HIG recommends 44×44 CSS pixels as the *minimum* tap target. You can hit that without changing the visual size by expanding the hit area via a pseudo-element:

```css
button {
  position: relative;
  height: 32px;
}
button::after {
  content: '';
  position: absolute;
  inset: -8px;   /* extends hit area 8px in every direction */
}
```

`inset: -8px` is shorthand for `top: -8px; right: -8px; bottom: -8px; left: -8px`. Total tap rect: 48×(width+16).

#### Hover on touch devices

(Covered above.) Always wrap `:hover` styles in `@media (hover: hover) and (pointer: fine) { ... }` so a finger graze on scroll doesn't activate them.

#### Tap highlights & text selection

```css
button {
  -webkit-tap-highlight-color: transparent; /* removes flash rectangle on tap */
  user-select: none;                        /* prevents long-press text selection */
}
```

Use sparingly — these features exist for a reason. Disabling text selection on a button is reasonable; disabling it on body content is hostile.

#### Safe areas (notches, home bar)

Use the `env()` insets to keep content out from under iPhone notches/dynamic islands and home indicators:

```css
:root {
  padding-top:    env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left:   env(safe-area-inset-left);
  padding-right:  env(safe-area-inset-right);
}
```

Requires `viewport-fit=cover` on the meta tag to actually paint behind the safe areas:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/env()>

#### Mobile testing

- Test on real devices regularly. The author keeps both an iPhone and a low-end Android (Xiaomi Redmi 7A) — ad-heavy CMS sites can take 30+ seconds to load on budget hardware.
- BrowserStack is a paid option for accessing many real devices remotely; latency makes it imperfect for "feel" testing.
- **Accessing localhost from a phone:** `ngrok http 3000` exposes your dev server at a temporary public URL. Local IP (`http://192.168.0.7:3000`) sometimes works, but firewalls, router rules, and OS security frequently block it — tunnels are more reliable.
- **Remote debugging:**
  - iOS Safari from macOS Safari: enable Web Inspector on iPhone, plug in, then *Develop → [Device] → [Tab]*.
  - iOS from Windows: Inspect.dev (paid, $49/yr), or `chii` (free, open source).
  - Android: chrome://inspect on desktop Chrome — works across Win/macOS/Linux.
- On iOS, all browsers are Safari under the hood (WebKit is mandated). iOS Chrome can't be remote-debugged separately because it's just a Safari WebView wearing a Chrome wrapper.

---

### Print Stylesheets

Wrap print-only styles in a media-type query:

```css
@media print {
  nav, .ads, .comments { display: none; }
  a::after { content: " (" attr(href) ")"; } /* show URLs inline */
  body { font-family: Georgia, serif; color: #000; background: #fff; }
}
```

#### Multi-column layout

```css
.article { columns: 2; column-gap: 18px; }
p        { break-inside: avoid; } /* keep paragraphs in one column */
```

The columns layout mode auto-distributes content evenly across columns; only it can do this dynamically (Flexbox/Grid can't).

#### Floats for text wrap

Floats are still the only way to make text wrap *around* an inline image/figure:

```css
img { float: left; margin-right: 16px; }
```

Use floats specifically for this "boulder in a stream" effect — not for layout. Flex/Grid have replaced floats for layout work.

#### Print-style indentation

In books, paragraphs are differentiated by indenting the first line, not by extra space:

```css
p { text-indent: 2rem; margin-bottom: 0; }
p:first-of-type { text-indent: 0; }
```

`text-indent` is widely supported back to IE 6. The `::first-letter` pseudo-element is useful for drop caps:

```css
p:first-of-type::first-letter {
  font-size: 3em;
  float: left;
  line-height: 1;
  margin-right: 0.1em;
}
/* Future: initial-letter: 2; — not yet in Firefox */
```

#### Justified alignment

```css
p { text-align: justify; }
```

Bringhurst's guideline: use justified text only with serif fonts and adequate column width (~50ch+); narrow columns produce awkward word spacing or excessive hyphenation. For sans-serif body or narrow columns, leave it ragged (left-aligned).

#### Page breaks

```css
@media print {
  h2 { break-before: page; }   /* new page per chapter */
  figure { break-inside: avoid; }
  .keep-together { break-inside: avoid; }
}
```

MDN: <https://developer.mozilla.org/en-US/docs/Web/CSS/break-inside>, <https://developer.mozilla.org/en-US/docs/Web/CSS/@page>
## Visual Styling

A concept-organized cheat sheet for color, gradients, shadows, filters, images, radii, clipping, and scrollbars. Each section emphasizes the *why* and includes working snippets.

---

### Color

#### Picking a format

CSS offers many color formats. The practical short-list:

| Format | When to reach for it | Notes |
|---|---|---|
| `#rrggbb` (hex) | Legacy / copy-paste from designers | Hard to reason about; hard to derive variations |
| `rgb()` | Almost never directly | Channels aren't perceptually meaningful |
| `hsl()` | **Default choice.** Tweaking lightness/saturation manually. | Intuitive percentages; universal support |
| `oklch()` | Vibrant, wide-gamut designs; perceptually uniform interpolation | ~92% support (Nov 2025); supply HSL fallback for vivid palettes |

```css
.vibrant {
  /* HSL fallback */
  background: hsl(340deg 100% 50%);
  /* Modern wide-gamut override */
  background: oklch(0.65 0.25 3);
}
```

HSL hue is in degrees (0–360); saturation and lightness are percentages. OKLCH lightness is 0–1, chroma is unbounded (roughly 0–0.4), hue is degrees.

[MDN: `<color>`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value) · [MDN: `hsl()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/hsl) · [MDN: `oklch()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch)

#### Alpha (transparency) with the slash

Modern color functions use `/` as a *separator* (not division) to attach an alpha channel:

```css
.box {
  background: hsl(340deg 100% 50% / 0.5);   /* 50% opaque */
  background: oklch(0.7 0.2 30 / 0.25);
  background: rgb(255 0 0 / 0.75);
}
```

The `/` pattern recurs in CSS — `border-radius` (horizontal / vertical), grid (`row-start / row-end`).

#### `color` vs `background-color`

`color` sets the text (foreground) color and is the default source for `currentColor`, borders, SVG fills that reference it, etc. `background-color` paints the element's background box.

```css
em { background-color: hsl(50deg 100% 50%); }   /* highlighter */
```

#### `color-mix()` and manipulation strategies

Instead of hard-coding twelve hand-tuned shades, derive colors from a base:

```css
:root { --accent: hsl(220 80% 50%); }

.btn {
  background: var(--accent);
  /* Darken via color-mix: */
  border: 1px solid color-mix(in oklch, var(--accent), black 20%);
}
.btn:hover {
  background: color-mix(in oklch, var(--accent), white 15%);
}
```

Other manipulation strategies:

- **HSL surgery** — keep hue/saturation, drop lightness for a darker tone: `hsl(220deg 80% 30%)` from `hsl(220deg 80% 50%)`.
- **Relative color syntax** — `hsl(from var(--accent) h s calc(l - 20%))` (modern, growing support).
- **`filter` hover effects** — `filter: brightness(110%) contrast(105%)` on hover; works on gradients and images too, often more performant than recoloring.
- **`hue-rotate()`** — `filter: hue-rotate(60deg)` shifts every pixel's hue, including child gradients and even emoji.

[MDN: `color-mix()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/color-mix)

#### `accent-color`

Recolor native form controls (checkboxes, radios, range, progress) without rebuilding them:

```css
:root { accent-color: hsl(280deg 80% 50%); }
```

Supported across all major browsers since 2022. Exact rendering varies by OS, but this avoids the from-scratch `<button>` rebuild for the common case.

[MDN: `accent-color`](https://developer.mozilla.org/en-US/docs/Web/CSS/accent-color)

#### `::selection`

```css
::selection {
  color: hsl(25deg 100% 20%);
  background-color: hsl(55deg 100% 60%);
}
```

Gotcha: per spec, `::selection` should inherit, but Firefox and Safari don't (as of 2025). Workaround: have every `::selection` read from CSS variables, then override the variables on subtrees:

```css
::selection {
  color: var(--selection-color);
  background-color: var(--selection-background);
}
html {
  --selection-color: hsl(25deg 100% 20%);
  --selection-background: hsl(55deg 100% 60%);
}
figure {
  --selection-color: white;
  --selection-background: hsl(333deg 100% 50%);
}
```

Watch contrast ratios — selection styles still need to be legible. Don't override defaults purely for novelty; for products aimed at less technical users it can confuse.

[MDN: `::selection`](https://developer.mozilla.org/en-US/docs/Web/CSS/::selection)

---

### Gradients

All gradient functions are values for `background-image` (or anywhere an image is accepted, like `mask-image`).

#### Linear gradients

```css
.box {
  background-image: linear-gradient(45deg, deeppink, gold);
}
```

- Default angle is `180deg` (top → bottom). `0deg` runs bottom → top.
- Keyword sugar: `to right` ≡ `90deg`, `to bottom right`, etc.
- Multiple stops: `linear-gradient(90deg, deeppink, red, coral, gold, white)` — equidistant by default.
- Explicit positions: `linear-gradient(90deg, deeppink, red 10%, coral 20%, gold 30%, white)`.

**Hard stops** (sharp lines) — place two stops at nearly the same percentage:

```css
background-image: linear-gradient(
  90deg,
  deeppink 0%, deeppink 9.99%,
  red       10%, red      19.99%,
  coral     20%
);
```

**Gradient hints** shift the midpoint between two stops without adding a color:

```css
background-image: linear-gradient(deeppink, 20%, gold);  /* midpoint at 20% */
```

[MDN: `linear-gradient()`](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/linear-gradient)

#### Radial gradients

```css
.sunset {
  background-image: radial-gradient(
    circle at 50% 100%,
    white 0%, yellow 10%, gold 20%, coral 30%, skyblue
  );
}
```

Optional first argument combines shape, size, and position. Stick with `circle at <x> <y>`; the elliptical syntax gets baroque quickly.

[MDN: `radial-gradient()`](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/radial-gradient)

#### Conic gradients

A linear gradient wrapped around a center point. Syntax: `from <angle> at <position>`.

```css
.pie {
  border-radius: 50%;
  background-image: conic-gradient(
    deeppink 0%   33.3%,
    gold     33.4% 66.6%,
    slateblue 66.7% 100%
  );
}
```

Unlike linear/radial, conic doesn't auto-blend across the start/end seam — either repeat the start color at the end, or place a stop near 100% close to your start color.

Practical uses: pie charts, edge-glow effects (visible top half only), brushed-metal knobs via greyscale stops.

[MDN: `conic-gradient()`](https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/conic-gradient)

#### Gradient dead zones — interpolation space matters

Gradients interpolate in RGB by default, which routes through desaturated grey when the two endpoints are far apart on the color wheel:

```
red → green   in RGB:  red → muddy brown → grey → olive → green
red → green   in OKLCH: red → orange → yellow-green → green (saturated whole way)
```

Two fixes:

1. **Pick a saturated intermediate color** ("take the scenic route"):
   ```css
   background: linear-gradient(deeppink, orange, gold);   /* avoids grey midpoint */
   ```
2. **Use a perceptual color space** with the `in <space>` syntax:
   ```css
   background: linear-gradient(in oklch, deeppink, gold);
   background: linear-gradient(in oklch longer hue, red, green);
   ```

#### Easing gradients

A `linear` interpolation creates a visible hard line where an overlay gradient meets transparency. An eased gradient feels organic. CSS doesn't (yet) support `ease-in-out` directly in gradient syntax:

```css
/* Proposed, not yet supported: */
background: linear-gradient(to bottom, hsla(330,100%,45%,1), ease-in-out, hsla(210,100%,45%,1));
```

Simulate it today by generating many intermediate stops (15+ stops with hand-tuned positions). Tools like Andreas Larsen's [easing-gradients](https://larsenwork.com/easing-gradients/) generate these for you.

---

### Shadows

Three shadow tools:

| Property | Casts on | Special powers |
|---|---|---|
| `box-shadow` | The element's rectangular box | `inset`, `spread`, multiple layers |
| `filter: drop-shadow()` | The element's *opaque silhouette* (including child shapes, transparent PNGs) | Contours arbitrary shapes |
| `text-shadow` | Just the typography glyphs | Lightweight, useful for contrast on busy backgrounds |

#### `box-shadow` anatomy

```css
box-shadow: <offset-x> <offset-y> <blur-radius> <spread-radius> <color>;
box-shadow: 2px 4px 8px 0px hsl(0deg 0% 0% / 0.25);
box-shadow: inset 2px 2px 8px hsl(0deg 0% 0% / 0.33);   /* inner shadow */
```

- **Offset** — positive y pushes shadow downward; matches a light source above.
- **Blur** — softness. Uses a fast box-blur algorithm under the hood.
- **Spread** — grows (positive) or shrinks (negative) the shadow's footprint before blur.
- **Inset** — flips the shadow inside the element.

Use `hsl(... / α)`, not solid `black`; solid black is harsh and desaturates the background.

[MDN: `box-shadow`](https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow)

#### Designing realistic shadows

1. **One light source for the whole page.** All shadows on the page should share the same horizontal-to-vertical offset ratio (e.g. always 1:2). This sells the illusion of a consistent environment.
2. **Elevation scales four things in tandem:**
   - Offset increases
   - Blur radius increases
   - Opacity *decreases*
   - (Optionally, the element grows slightly)

   Intuition: press your hand on a desk, then lift it. The shadow drifts farther, gets fuzzier, fades.

3. **Layer multiple shadows** for organic softness (Tobias Ahlin's technique):

   ```css
   .layered {
     box-shadow:
       0  1px  1px hsl(0 0% 0% / 0.075),
       0  2px  2px hsl(0 0% 0% / 0.075),
       0  4px  4px hsl(0 0% 0% / 0.075),
       0  8px  8px hsl(0 0% 0% / 0.075),
       0 16px 16px hsl(0 0% 0% / 0.075);
   }
   ```

   Performance cost is linear in layer count — usually fine, but avoid animating a layered shadow.

4. **Color-match the shadow.** Pure black over a saturated background desaturates it ("washed-out grey shadow"). Match the background's hue, drop saturation a bit, drop lightness a lot. For a blue background `hsl(220deg 100% 80%)`, a good shadow color is `hsl(220deg 60% 50%)`.

5. **Design-token elevations:**

   ```css
   :root {
     --shadow-color: 220deg 60% 50%;
     --shadow-sm: 0.5px 1px 1px hsl(var(--shadow-color) / 0.7);
     --shadow-md:
       1px 2px 2px hsl(var(--shadow-color) / 0.333),
       2px 4px 4px hsl(var(--shadow-color) / 0.333),
       3px 6px 6px hsl(var(--shadow-color) / 0.333);
   }
   .card { box-shadow: var(--shadow-md); }
   ```

#### Single-sided shadows

Only `box-shadow` has `spread`. Negative spread shrinks the shadow before blur, so it can stay tucked to one side:

```css
.card {
  --blur: 8px;
  --spread: calc(var(--blur) * -1);   /* spread cancels blur growth */
  box-shadow: 0 12px var(--blur) var(--spread) hsl(0 0% 0% / 0.2);
}
```

Change the side by tweaking the offsets. `filter: drop-shadow()` has no `spread`, so this trick is `box-shadow`-only.

#### Inset shadows

```css
.well { box-shadow: inset 2px 2px 8px hsl(0deg 0% 0% / 0.33); }
```

The "moat" trick: an inset shadow on a parent plus a matching non-inset shadow on a child creates a sunken channel between them. Add `overflow: hidden` on the parent so the child's outer shadow doesn't escape.

#### Contoured shadows with `filter: drop-shadow()`

`box-shadow` always traces the rectangular box. `drop-shadow` traces the *visible silhouette* — transparent PNGs, SVGs, clipped shapes, even multi-element groups all get a unified shadow.

```css
/* Shadow respects the triangle, not its bounding box */
.wrapper { filter: drop-shadow(1px 2px 4px hsl(0 0% 0% / 0.5)); }
.wrapper .triangle { clip-path: polygon(0 100%, 50% 0, 100% 100%); }
```

Important: `filter` applies *before* `clip-path` on the same element. If you put both on the same node, the shadow gets clipped away. Lift the `drop-shadow` to the parent.

`drop-shadow` uses Gaussian blur (different math than `box-shadow`'s box blur) and produces softer, more diffuse shadows. Its third value is a "standard deviation," not a strict blur radius.

#### When to choose which

| Need | Use |
|---|---|
| Rectangular card, design-token system | `box-shadow` |
| Multi-layered realism | `box-shadow` (multiple) |
| `inset` or `spread` (single-sided) | `box-shadow` |
| Shadow following a `clip-path` polygon | `filter: drop-shadow()` on parent |
| Shadow on a transparent PNG/SVG icon | `filter: drop-shadow()` |
| Avoiding shadow-overlap among siblings (e.g. grid items) | `filter: drop-shadow()` on the grid parent |
| Text contrast on busy backgrounds | `text-shadow` |

Safari occasionally renders `filter: drop-shadow` glitchily — always test there.

[MDN: `filter: drop-shadow()`](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/drop-shadow)

---

### Filters

`filter` exposes a curated subset of SVG filter primitives with a clean function syntax. Filters are space-separated and applied in order.

```css
.image {
  filter: brightness(120%) contrast(110%) grayscale(50%);
}
```

Common functions:

| Function | Default | Typical use |
|---|---|---|
| `blur(<length>)` | `0` | Backdrop obfuscation, peekaboo reveals |
| `brightness(<%>)` | `100%` | Hover affordance on buttons, image dimming |
| `contrast(<%>)` | `100%` | Crank visual punch |
| `saturate(<%>)` | `100%` | Desaturate disabled UI |
| `grayscale(<%>)` | `0%` | Disabled / archived states |
| `sepia(<%>)` | `0%` | Vintage effect |
| `hue-rotate(<deg>)` | `0deg` | Shift entire color palette (works on emoji too) |
| `invert(<%>)` | `0%` | Quick dark-mode of an SVG icon |
| `drop-shadow(...)` | — | Contoured shadows (see Shadows) |

```css
.btn {
  background: linear-gradient(to top, hsl(260 80% 40%), hsl(260 80% 50%));
  transition: filter 600ms;
}
.btn:hover {
  transition: filter 250ms;
  filter: brightness(150%);
}
```

Animating `filter` is often more performant than animating `background-color` because filters are hardware-accelerated in many browsers. The same trick works on gradients and images, which can't be animated via `background-color`.

[MDN: `filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/filter)

#### `blur()` notes

- Soft edges bleed past the element. Constrain with `overflow: hidden` on the parent.
- Blurring is **purely cosmetic** — screen readers don't see it. If you're hiding content functionally (e.g. quiz answers), pair the blur with `aria-hidden="true"` and remove both together.
- Expensive on low-end devices even with hardware acceleration. Test on mid-tier Android.

Design trick: place a heavily blurred, scaled, rotated copy of an element behind itself for a colorful "glow" that respects the source palette:

```css
.glow-source { position: relative; }
.glow-source::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(deeppink, gold);
  filter: blur(40px);
  transform: scale(1.3) rotate(30deg);
  z-index: -1;
}
```

[MDN: `filter: blur()`](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/blur)

#### `backdrop-filter`

Applies a filter to whatever is *behind* the element, not to the element itself.

```css
.sticky-header {
  background: hsl(0 0% 100% / 0.5);   /* essential: gives the blur something to grab */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);   /* Safari still wants the prefix */
}
```

Always pair with a translucent `background` so text on the header remains legible. Supports the same filter functions as `filter`, and combinations (`backdrop-filter: brightness(150%) hue-rotate(30deg) blur(5px)`).

Common use: frosted-glass sticky headers, modal scrims, dialog backdrops over photography.

[MDN: `backdrop-filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter)

#### Performance summary

- `filter` and `backdrop-filter` create a new stacking context and a compositing layer; they can promote elements to the GPU.
- Animating `opacity`, `transform`, and `filter` is generally cheap; animating `box-shadow` is not (it's painted on the CPU each frame).
- `blur()` is the most expensive filter — large radii on large surfaces will tank low-end devices. `backdrop-filter: blur()` is *even more* expensive because it must sample everything behind.

---

### Background images

Background images are for *backgrounds* (decorative, tiled, hung-behind-content). Use `<img>` for semantically meaningful images — `background-image` can't carry alt text.

```css
body {
  background-image: url('/patterns/dots.png');
  background-size: 450px;          /* or cover / contain */
  background-position: center;
  background-repeat: repeat;       /* default; also no-repeat | space | round */
}
```

#### `background-size`

- `<length>` / `<percentage>` — explicit, e.g. `450px` or `100% 50%`.
- `cover` — fill the container, cropping overflow. Use when the box is decorative and aspect ratio is "whatever fits."
- `contain` — fit entirely inside the container, possibly leaving gaps.
- `auto` — natural size.

#### `background-position`

Same coordinate model as `object-position` — keywords (`left top`, `center`) or values (`0% 0%`, `50% 100%`). The first value is horizontal, the second vertical.

#### `background-repeat`

- `repeat` (default) — tiles edge-to-edge; the right/bottom edges may show partial tiles.
- `space` — keeps original size, distributes gaps between full tiles so neither edge is cut off.
- `round` — scales tiles slightly up or down so an integer number fits exactly.
- `no-repeat`, `repeat-x`, `repeat-y` — self-explanatory.

#### High-DPI patterns

Backgrounds at native size are blurry on 2x/3x displays. Swap higher-resolution assets via `min-resolution`, and set `background-size` to the 1x logical size:

```css
body {
  background-image: url('/dots.png');
  background-size: 450px;
}
@media (min-resolution: 2dppx) {
  body { background-image: url('/dots@2x.png'); }
}
@media (min-resolution: 3dppx) {
  body { background-image: url('/dots@3x.png'); }
}
```

For Safari < 16 also add `-webkit-min-device-pixel-ratio` fallback.

#### Multiple backgrounds

Comma-separate. First listed paints on *top*. Common pattern — gradient overlay on a photo:

```css
.hero {
  background-image:
    linear-gradient(hsl(0 0% 0% / 0.5), hsl(0 0% 0% / 0.5)),
    url('/hero.jpg');
  background-size: cover;
  background-position: center;
}
```

Each comma-separated background can have its own size, position, and repeat (also comma-separated lists).

[MDN: `background-image`](https://developer.mozilla.org/en-US/docs/Web/CSS/background-image) · [MDN: `background-size`](https://developer.mozilla.org/en-US/docs/Web/CSS/background-size)

---

### Images

`<img>` is a "replaced element" — the browser substitutes the source image for the DOM node. It has an intrinsic size and aspect ratio.

If you set only `width` *or* only `height`, the other scales to preserve the aspect ratio. If you set both and they conflict with the natural ratio, the image stretches *unless* you use `object-fit`.

#### `object-fit`

```css
img { width: 200px; height: 250px; object-fit: cover; }
```

| Value | Behavior |
|---|---|
| `fill` (default) | Stretch to box; distorts |
| `contain` | Fit entirely inside; may leave gaps |
| `cover` | Fill box, crop overflow |
| `none` | Natural size, may overflow or under-fill |
| `scale-down` | `none` or `contain`, whichever is smaller |

Also works on `<video>`.

#### `object-position`

Like `background-position`, but for replaced-element content inside its box. Defaults to `50% 50%` (center). Use keywords (`left top`) or pairs (`0% 0%`, `100% 25%`).

```css
.crop-top img { object-fit: cover; object-position: center top; }
```

[MDN: `object-fit`](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit) · [MDN: `object-position`](https://developer.mozilla.org/en-US/docs/Web/CSS/object-position)

#### `<img>` vs `background-image`

| | `<img>` | `background-image` |
|---|---|---|
| Semantic / has alt text | yes | no |
| Tilable / repeatable | no | yes |
| `object-fit`/`object-position` | yes | (use `background-size`/`background-position`) |
| Lazy loading / `srcset` | yes | clunky |

Rule of thumb: if the image conveys meaning, use `<img>` with thoughtful `alt` text. Reach for `background-image` only for pure decoration (wallpaper, repeating patterns).

#### Alt text strategy

The goal is to convey **semantic meaning in context**, not to describe pixels. Examples:

- Company logo in the corner that links home: `alt="Octo Analytics logo - Home"` (or just `"Octo Analytics"`).
- Decorative flourish: `alt=""` (empty, signaling "skip me" to assistive tech).
- Wikipedia-style supporting photo: describe the subject succinctly.

Do *not* include attribution in alt text — that belongs in `<figcaption>`.

#### Icons

Two implementation strategies; SVG wins on every axis:

| | Icon font | Inline SVG |
|---|---|---|
| Crispness | OK | Excellent |
| Sizing | `font-size` | `width`/`height` (more natural) |
| Multi-color | no | yes |
| Animation | limited | full |
| Screen-reader pitfalls | maps to random chars (need `aria-hidden`) | better |

Use `currentColor` so SVG fills inherit from the parent's `color`:

```html
<button style="color: hsl(220 80% 50%)">
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="..." fill="currentColor" />
  </svg>
  <span class="visually-hidden">Visit the help center</span>
</button>
```

Common gotcha: SVGs are `display: inline` by default, which leaves "magic space" below the baseline. Fix per-icon:

```css
button > svg { display: block; }
```

For accessibility, either give the SVG `<title>` text *or* hide it with `aria-hidden="true"` and provide a `.visually-hidden` text label nearby.

[MDN: `<img>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img) · [MDN: SVG](https://developer.mozilla.org/en-US/docs/Web/SVG)

---

### `border-radius`

`border-radius` is shorthand for *eight* values: four corners × (horizontal radius, vertical radius). When a corner specifies two values, it's drawn as a quarter-ellipse.

```css
.box { border-top-left-radius: 40px 20px; }   /* 40px horizontal, 20px vertical */

.box {
  /* Full shorthand: 4 horizontal radii, slash, 4 vertical radii (clockwise from top-left) */
  border-radius: 10% 20% 30% 40% / 50% 60% 70% 80%;
}
```

If only one set of four is given, it's reused for both axes. A single value applies to all 8.

#### Percentage radii

Percentages resolve against the element's *own* width (for horizontal radii) and *own* height (for vertical radii). So on a non-square box, `border-radius: 10%` is asymmetric.

`border-radius: 50%` on a square gives a circle; on a rectangle it gives an ellipse spanning the box.

#### Pill / circular corners on dynamic sizes

You don't need to know the height. The browser clamps when corners would collide:

```css
.pill { border-radius: 5000px; }    /* hacky but works */
.pill { border-radius: 100vmax; }   /* cleaner alternative */
```

Once corners would overlap, browsers clamp them proportionally — so even asymmetric large values like `border-radius: 5000px 5000px 1000px 1000px` produce a clean "fat top, narrow bottom" shape regardless of the element's actual size (the values are treated as ratios once they exceed the geometric limit).

#### Nested radius math

When a rounded child sits inside a rounded parent with padding, using the *same* radius makes the corners look "chunky" — the rings aren't concentric. Make the two corners share a center:

```
outer radius = inner radius + padding
```

```css
.card {
  --inner-radius: 16px;
  --padding: 8px;
  padding: var(--padding);
  border-radius: calc(var(--inner-radius) + var(--padding));
}
.card .avatar { border-radius: var(--inner-radius); }
```

If the outer radius is fixed: `inner = outer − padding`.

#### Blobby shapes

Use all 8 values to create asymmetric organic shapes (great for "blob" decorations). [9elements Fancy Border Radius](https://9elements.github.io/fancy-border-radius/) is a handy generator.

[MDN: `border-radius`](https://developer.mozilla.org/en-US/docs/Web/CSS/border-radius)

---

### `clip-path`

Trims an element to a specific shape. Like `transform`, it doesn't affect layout — the element still occupies its full box.

```css
.triangle { clip-path: polygon(0% 100%, 50% 0%, 100% 100%); }

.spotlight { clip-path: circle(80px at 100px 100px); }

.oval     { clip-path: ellipse(100px 80px at 50% 50%); }

.inset    { clip-path: inset(10% 20% 10% 20% round 12px); }
```

`polygon()` takes any number of `x y` vertex pairs. Coordinates run 0% (top/left) to 100% (bottom/right). Bennett Feely's [Clippy](https://bennettfeely.com/clippy/) is the standard tool for designing them.

#### Animating `clip-path`

`clip-path` can be transitioned and animated as long as the *shape function and vertex count match* between keyframes. Add/remove vertices and the animation fails.

```css
.img { clip-path: circle(80px at 100px 100px); transition: clip-path 400ms; }
.img:hover { clip-path: circle(120px at 100px 100px); }
```

For complex animations, keep an invisible "dummy" vertex if you'll need to morph to a higher-count shape later.

#### Shadow + `clip-path` gotcha

On the same element, `filter` runs *before* `clip-path`, so a drop-shadow gets clipped away. Move `filter: drop-shadow()` to a parent wrapper.

`box-shadow` can't help here either — it always traces the rectangular box, not the clipped silhouette.

[MDN: `clip-path`](https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path)

---

### Scrollbar styling

Two parallel APIs — use both:

```css
html {
  /* Standard (Firefox, modern Chromium) */
  scrollbar-color: var(--thumb) var(--track);
  scrollbar-width: thin;        /* auto | thin | none */
}

/* Legacy webkit pseudo-elements (Chrome, Safari) */
::-webkit-scrollbar       { width: 10px; background-color: var(--track); }
::-webkit-scrollbar-thumb { background-color: var(--thumb); border-radius: 1000px; }
::-webkit-scrollbar-thumb:hover { background-color: var(--thumb-hover); }
```

The moment you set custom colors on webkit, you lose the native chrome (rounded thumb, padding, etc.) and inherit a stark default. Rebuild manually:

- Use `border-radius: 1000px` to round the thumb.
- Fake padding around the thumb with a `border` in the *track's* color (real padding has no effect).
- Add a `:hover` rule on `::-webkit-scrollbar-thumb` for interaction feedback.

Wrap everything in `@media (pointer: fine)` so mobile users keep the native floating thumb:

```css
@media (pointer: fine) {
  html { scrollbar-color: var(--thumb) var(--track); }
  ::-webkit-scrollbar       { /* ... */ }
  ::-webkit-scrollbar-thumb { /* ... */ }
}
```

Philosophy: aim for "blends in," not "look at me." Wildly recolored scrollbars can confuse users who don't recognize them as functional. iOS Safari ignores these properties even though it claims support; Android honors them.

[MDN: `scrollbar-color`](https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-color) · [MDN: `::-webkit-scrollbar`](https://developer.mozilla.org/en-US/docs/Web/CSS/::-webkit-scrollbar)
## Animation, Scroll & Accessibility

A reference for motion (transforms, transitions, keyframes), scrolling behavior, and the accessibility concerns that touch all of it. Everything below is vanilla CSS + a small amount of vanilla JS — no React.

---

### 1. Transforms

`transform` warps an element after layout has been computed. Layout algorithms (Flow, Flexbox, Grid) do **not** see the result — siblings stay put. This is the same trick `position: relative` uses with `top`/`left`, except transforms also rasterize the element as a flat texture, which is why they're cheap to animate.

[MDN: transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)

#### Transform functions

```css
.box {
  /* movement — positive = right/down */
  transform: translate(20px, 40px);
  transform: translateX(20px);
  transform: translateY(40px);

  /* growth — unitless multiplier (like line-height) */
  transform: scale(1.5);           /* both axes */
  transform: scale(2, 0.5);        /* x, y */

  /* rotation */
  transform: rotate(45deg);
  transform: rotate(0.25turn);     /* 1turn = 360deg */

  /* shear */
  transform: skew(10deg);
  transform: skewX(15deg);
}
```

**Translate's superpower: percentages refer to the element's own size**, not the parent's. `transform: translateY(-100%)` lifts an element by exactly its own height, whatever that height happens to be. Mix units freely with `calc()`:

```css
transform: translateX(calc(-50% + 8px)); /* center, then nudge */
```

This is *unique in CSS*. Everywhere else (`left`, `width`, etc.), `%` is relative to the parent.

**Scale stretches contents.** Text inside a scaled box gets squashed too. Sometimes desirable (an "old TV" power-off effect), sometimes not. Libraries like Motion counter this by applying an inverse transform to children.

#### `transform-origin` — the pivot

```css
.box {
  transform: rotate(45deg);
  transform-origin: center;     /* default */
  transform-origin: left top;
  transform-origin: 0% 150%;    /* outside the element */
}
```

Affects rotate, scale, skew — anything anchored. Useful for "growing out of" effects.

#### Composition order matters

Functions apply **right-to-left**, like function composition.

```css
/* rotate, THEN translate -> the box moves along its rotated X axis */
transform: translateX(80px) rotate(45deg);

/* translate, THEN rotate -> spin around the original origin */
transform: rotate(45deg) translateX(80px);
```

Classic moon-orbits-planet trick (origin stays at the planet):

```css
@keyframes orbit {
  from { transform: rotate(0deg)   translateX(80px); }
  to   { transform: rotate(360deg) translateX(80px); }
}
```

#### Gotcha: inline elements

Transforms don't apply to inline elements in Flow layout. Switch to `display: inline-block`, or use Flex/Grid.

#### 3D transforms

CSS has a real 3D engine. By default it uses **isometric projection** (no perspective — distant things stay the same size). Switch to perspective projection on the parent:

```css
.scene {
  perspective: 600px;           /* "distance" from viewer */
}
.card {
  transform: rotateX(45deg) rotateY(20deg);
}
```

- `perspective` on the parent puts all children in **one shared 3D environment** (sibling boxes look correctly positioned relative to each other).
- `perspective(600px)` as a transform function gives each element its own private environment. Usually you want the property, not the function.
- Smaller perspective values = closer viewer = more dramatic effect.

Related properties:

```css
.scene  { transform-style: preserve-3d; } /* children live in 3D, not flattened */
.card   { backface-visibility: hidden;  } /* hide the back when rotated >90deg */
```

`preserve-3d` is critical for flip-card effects — without it, the inner faces get flattened into the parent's 2D plane.

[MDN: perspective](https://developer.mozilla.org/en-US/docs/Web/CSS/perspective) · [MDN: transform-style](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style) · [MDN: backface-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/backface-visibility)

---

### 2. Transitions

A transition smooths the change between two states. The browser interpolates between the old and new value over a duration.

```css
.btn {
  transition: transform 250ms ease-out;
}
.btn:hover {
  transform: translateY(-10px);
}
```

Required: **property name** and **duration**. Optional: timing function, delay.

#### Animating multiple properties

```css
.btn {
  transition:
    transform 250ms ease-out,
    opacity   400ms linear;
}
```

Avoid `transition: all`. It silently animates anything that changes — including properties added later by you or a teammate. Be explicit.

#### Timing functions

| Keyword       | Shape                                    | Good for                              |
|---------------|------------------------------------------|---------------------------------------|
| `linear`      | constant speed                           | spinners (rotation only)              |
| `ease`        | brief ramp + long deceleration (default) | most things                           |
| `ease-out`    | fast start, slow end                     | things entering the viewport          |
| `ease-in`     | slow start, fast end                     | things leaving the viewport           |
| `ease-in-out` | symmetrical                              | loops (fade in/out forever)           |

All of these are presets for `cubic-bezier(x1, y1, x2, y2)`:

```css
transition: transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1);
```

`linear` is `cubic-bezier(0, 0, 1, 1)`. A great curve picker: <https://cubic-bezier.com/>.

**Time is constant.** Timing functions describe *how* the value moves from 0 → 1, not how fast. A 1s `ease-in` and a 1s `linear` both take exactly 1 second.

[MDN: transition-timing-function](https://developer.mozilla.org/en-US/docs/Web/CSS/transition-timing-function) · [MDN: cubic-bezier()](https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function)

#### Delays

`transition-delay` holds status quo before kicking in. Classic use: forgiving dropdown menus.

```css
.dropdown {
  opacity: 0;
  transition: opacity 400ms;
  transition-delay: 300ms;  /* wait 300ms before fading out */
}
.dropdown-wrapper:hover .dropdown {
  opacity: 1;
  transition: opacity 100ms;
  transition-delay: 0ms;    /* but appear instantly */
}
```

If the cursor briefly leaves and returns within 300ms, nothing fades. I tend to keep `transition-delay` out of the shorthand — its value type clashes with duration and gets confusing.

#### What's cheap to animate

Only two properties can be animated by the compositor alone — no layout, no paint:

- `transform`
- `opacity`

Avoid animating `width`, `height`, `top`, `left`, `margin`, `padding` — they trigger layout. Use `transform: translate()` / `scale()` instead.

#### Pitfall: the "doom flicker"

If you transform the same element that listens for `:hover`, the element can slide out from under the cursor and trigger an oscillating flicker. **Separate the trigger from the effect:**

```html
<button class="btn">
  <span class="btn-contents">Hello</span>
</button>
```

```css
.btn-contents { transition: transform 250ms; }
.btn:hover .btn-contents { transform: translateY(-10px); }
```

The button (the hover target) never moves; the inner span does. Hover states bubble up, so hovering the span counts as hovering the button.

---

### 3. Keyframe animations

For looped, multi-step, or load-time animations, reach for `@keyframes`.

```css
@keyframes drop-in {
  from {
    transform: rotate(-30deg) translateY(-100%);
    opacity: 0;
  }
  to {
    transform: rotate(0deg) translateY(0%);
    opacity: 1;
  }
}

.box {
  animation: drop-in 1000ms ease-out;
}
```

`from` is sugar for `0%`, `to` for `100%`. Anything in between gets percentages:

```css
@keyframes fancy-spin {
  0%   { transform: rotate(0turn) scale(1);   }
  25%  { transform: rotate(1turn) scale(1);   }
  50%  { transform: rotate(1turn) scale(0.5); }
  75%  { transform: rotate(0turn) scale(1.5); }
  100% { transform: rotate(0turn) scale(1);   }
}
```

**The timing function applies to each step**, not the animation as a whole — every segment eases independently. (The Web Animations API can override this if you need a single curve.)

[MDN: @keyframes](https://developer.mozilla.org/en-US/docs/Web/CSS/@keyframes) · [MDN: animation](https://developer.mozilla.org/en-US/docs/Web/CSS/animation)

#### Sub-properties

```css
.box {
  animation-name: drop-in;
  animation-duration: 1000ms;
  animation-timing-function: ease-out;
  animation-delay: 200ms;
  animation-iteration-count: infinite;   /* or a number */
  animation-direction: alternate;        /* normal | reverse | alternate */
  animation-fill-mode: both;
  animation-play-state: running;         /* or paused */
}
```

`alternate` ping-pongs between normal and reverse, so a "breathe" animation only needs to describe half the motion:

```css
@keyframes breathe {
  0%   { transform: scale(1);   }
  100% { transform: scale(1.5); }
}
.box {
  animation: breathe 2000ms ease-in-out infinite alternate;
}
```

#### Fill modes — the most confusing part

While an animation is running, its declarations apply. Before and after, they vanish — the element snaps back to its default styles. Fill mode persists them outside that window.

```css
animation-fill-mode: forwards;   /* keep the "to" state after it ends */
animation-fill-mode: backwards;  /* apply the "from" state during the delay */
animation-fill-mode: both;       /* both of the above */
```

I default to `both`. I wish that were the default. Example showing the problem:

```css
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
.box {
  animation: fade-out 1000ms;
  /* without fill-mode, the box reappears at full opacity when done! */
}
```

Fix with either `animation-fill-mode: forwards` or by adding `opacity: 0` to `.box` directly.

#### Shorthand

```css
.box {
  animation: drop-in 1000ms ease-out both;
  /* name, duration, timing, fill-mode — order is flexible */
  animation-delay: 200ms;  /* but I keep delay separate, since it shares units with duration */
}
```

#### Animations vs. transitions — when to use which

Use **`@keyframes`** for:
- Loops, multi-step sequences, pausable animations
- Anything that should start on page load / mount
- Spinners, breathing effects, attention-grabbers

Use **`transition`** when:
- CSS changes in response to state or user action (`:hover`, toggled class)
- You want to smooth a value change that would otherwise be instant

#### Pausing and toggling from JS

```js
// Toggle the property on/off
el.style.animation = playing ? 'spin 1s linear infinite' : '';

// Or toggle the play state (smoother — no interruption)
el.style.animationPlayState = playing ? 'running' : 'paused';
```

`animation-play-state` is cleanly resumable. Removing the `animation` property entirely is "interruption" and snaps everything back to defaults.

---

### 4. Action-driven animation (CSS-only, JS-toggled classes)

Most devs think in **states**: open vs. closed. But the *action* of opening should often differ from the action of closing. Quick in, slow out. Or vice versa.

#### Pure CSS, with pseudo-classes

Different transitions for enter and exit, achieved by putting one transition on the resting state and another on `:hover`:

```css
.button {
  transition: transform 500ms ease-out;   /* used on EXIT */
}
.button:hover {
  transform: scale(1.1);
  transition: transform 150ms ease-out;   /* used on ENTER */
}
```

The hovered rule sets the `transition` for the transition *into* the hover state. The moment hover ends, we fall back to the base rule's 500ms transition for the way out.

Same pattern with `:focus`, `:active`, `:focus-visible`, `:focus-within`, `:checked`, etc.

#### JS-toggled state (no React)

Add or remove a class — or a `data-*` attribute — and let CSS handle the rest.

```html
<div class="modal" data-state="closed">…</div>
<button id="open">Open</button>
```

```css
.modal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 250ms ease-in, transform 250ms ease-in;
  pointer-events: none;
}
.modal[data-state="open"] {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 400ms ease-out, transform 400ms ease-out;
  pointer-events: auto;
}
```

```js
const modal = document.querySelector('.modal');
document.querySelector('#open').addEventListener('click', () => {
  modal.dataset.state = 'open';
});
```

This is the React-free version of the standard "use a state variable to pick a duration" pattern.

#### Orchestration: stagger the pieces

A modal that opens "all at once" feels mechanical. Stagger:

- Backdrop fades in immediately, over 1000ms
- Modal slides up after 250ms, over 400ms
- Close button fades in after 600ms, over 250ms

With CSS only, this is just different `transition-delay`s per child, with separate enter/exit values:

```css
.backdrop {
  opacity: 0;
  transition: opacity 500ms ease-in;
  transition-delay: 100ms;   /* exit: backdrop is last to leave */
}
[data-state="open"] .backdrop {
  opacity: 0.75;
  transition: opacity 1000ms ease-out;
  transition-delay: 0ms;     /* enter: backdrop is first to arrive */
}

.dialog {
  transform: translateY(100vh);
  transition: transform 250ms ease-in;
  transition-delay: 0ms;
}
[data-state="open"] .dialog {
  transform: translateY(0);
  transition: transform 400ms ease-out;
  transition-delay: 250ms;
}
```

Apple's site is full of this kind of detail — search inputs that staggered-fade-out the nav, then fade-in the dropdown, then slide in dropdown items. The "secret sauce" is sequencing.

You can also chain with the `transitionend` DOM event:

```js
backdrop.addEventListener('transitionend', () => {
  dialog.classList.add('visible');
});
```

Less flexible than delays (can't overlap), but easy to reason about for strict sequences.

#### Duration heuristics

- **200–500ms** covers 80% of cases.
- Bigger movements need more time; subtle button hovers can be 100–200ms.
- Quick-in / slow-out feels good for *attention-grabbing* effects (button press).
- Slow-in / quick-out feels good for *dismissable* effects (modal closing — get out of the way).

---

### 5. Performance

The browser renders in a pipeline:

1. **Style recalc** — figure out which rules apply.
2. **Layout** — figure out where everything sits.
3. **Paint** — fill in pixels.
4. **Compositing** — slide/transform already-painted layers around.

The earlier the stage you touch, the more work per frame. At 60fps, you have ~16ms.

- Animating `width`, `height`, `top`, `margin`, `padding` → layout → paint → composite. Slow.
- Animating `background-color`, `color`, `box-shadow` → paint → composite. Faster.
- Animating `transform`, `opacity` → composite only. Fast. (Also `filter` in Chrome.)

[MDN: will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)

#### GPU promotion: `will-change`

When `transform` / `opacity` animations are about to run, hint to the browser:

```css
.btn {
  will-change: transform;
  transition: transform 250ms;
}
```

This promotes the element to its own compositor layer so the GPU can transform it as a texture. Benefits:

- Eliminates the CPU→GPU "snap" that can happen on animation start/end.
- Enables sub-pixel rendering. `transform: translateY(0.5px)` works smoothly; `margin-top: 0.5px` rounds to integer pixels and looks janky.

Cost: extra video memory. **Don't apply `will-change` to everything.** Only to elements that will actually animate, and only when needed.

Legacy alternative (still works, sometimes works better):

```css
.btn { transform: translateZ(0); }   /* forces a 3D context = GPU layer */
/* or */
.btn { backface-visibility: hidden; }
```

#### Animatable property cheat-sheet

| Want to animate…   | Do this instead             |
|--------------------|-----------------------------|
| `width` / `height` | `transform: scale()`        |
| `top` / `left`     | `transform: translate()`    |
| `margin-top`       | `transform: translateY()`   |
| Showing/hiding     | `opacity`                   |

Caveat: not all repaints are equal. Animating `height` on an absolutely-positioned element can't shift siblings and is often fine. **Test on a low-end device** — if it holds up there, ship it.

#### Reduced motion

Some people get nauseous from motion. Every major OS has a "reduce motion" preference. Respect it.

```css
/* Default: NO animation */
.modal {
  transform: translateY(0);
}

/* Opt in if the user is OK with motion */
@media (prefers-reduced-motion: no-preference) {
  .modal {
    transition: transform 300ms;
  }
}
```

Why this direction? If `prefers-reduced-motion` is unsupported (very old browsers), the inner rules are ignored and animations stay off — fail-safe.

[MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)

In JavaScript:

```js
function getPrefersReducedMotion() {
  const mql = window.matchMedia('(prefers-reduced-motion: no-preference)');
  return !mql.matches;
}

// React to live changes
window
  .matchMedia('(prefers-reduced-motion: no-preference)')
  .addEventListener('change', (e) => {
    /* re-evaluate */
  });
```

Avoid the "nuke everything" global override:

```css
/* DON'T do this — backfires with JS spring physics, doesn't help unsupported browsers */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Better: write each animation with `prefers-reduced-motion: no-preference` as the enabling gate. Pure color fades and tiny (<4px) movements are usually fine to keep — the problematic cases are big translations, parallax, and page-wide transitions.

---

### 6. Scrolling

#### Smooth scroll

For anchor-link navigation:

```css
@media (prefers-reduced-motion: no-preference) {
  html { scroll-behavior: smooth; }
}
```

That's it. Clicking `<a href="#chapter-3">` glides instead of teleporting. Gate behind reduced-motion — the fast scroll animation is exactly the kind of motion that bothers people.

In JS, `scrollTo` and `scrollIntoView` inherit this, or take an explicit `behavior`:

```js
window.scrollTo({ top: 0, behavior: 'smooth' });
document.querySelector('#chapter-3')?.scrollIntoView({ behavior: 'smooth' });
```

`scroll-behavior` doesn't let you tweak duration or easing, and that's intentional — smooth scroll is a subconscious continuity cue, not a brand moment. Customizing it leads to **scroll-jacking**, which everyone hates and which is impossible to get right across mouse wheels, trackpads, and touch.

[MDN: scroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-behavior)

#### `scroll-margin-top` — sticky-header offset

When a fixed header would obscure the anchor target:

```css
h2 { scroll-margin-top: 6rem; }
```

The browser reserves that much space above the heading when scrolling it into view.

#### Scroll containers — the "hidden mechanism"

**Any element with `overflow: scroll`, `auto`, *or* `hidden` becomes a scroll container.** This is true on either axis — setting `overflow-x` alone still creates a scroll container, and that container manages overflow in *both* directions.

Consequence: this doesn't do what you think it does.

```css
.wrapper {
  overflow-x: hidden;
  overflow-y: visible;  /* ignored — once a scroll container, both axes are managed */
}
```

Children can never visually escape a scroll container. They're stuck inside.

Also surprising: `overflow: hidden` is "scroll container with the scrollbars removed". A tab-focused interactive element inside an `overflow: hidden` box will silently scroll the container to come into view.

#### `overflow: clip` — the new escape hatch

```css
.wrapper { overflow-x: clip; }
```

Trims overflow without creating a scroll container. Acts the way most developers always thought `overflow: hidden` worked. Wide browser support since late 2022.

Tradeoff: no built-in "scroll focused element into view" guardrail. If a focusable element is clipped, its focus ring becomes invisible. Test carefully.

[MDN: overflow](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow)

#### Legacy workaround (no `clip`)

Wrap everything in an outer container that hides overflow but isn't height-constrained:

```css
html, body { height: 100%; }
.outer-wrapper {
  overflow-x: hidden;
  min-height: 100%;
  /* no fixed height — it grows as content grows, so no vertical scrollbar */
}
```

A scroll container only actually scrolls when its inner content exceeds its outer size. If the outer size can grow indefinitely, no awkward inner scrollbar appears.

#### Scrollburglars

A *scrollburglar* is an accidental horizontal scrollbar — usually a few pixels wide, usually only on mobile. Common causes:

- An element with an explicit width too large for its parent.
- An unconstrained replaced element (image, video, iframe).
- A long unbroken word like "disestablishmentarianism".
- An element pushed outside its parent with negative margin or `right: -20px`.

Modern fix:

```css
html { overflow-x: clip; }
```

(Used to require the outer-wrapper workaround above; `overflow: clip` made it trivial.)

Debugging snippet — paste in DevTools console:

```js
function checkElemWidth(el) {
  if (el.clientWidth > window.innerWidth) {
    console.info('Element wider than viewport:', el);
  }
  [...el.children].forEach(checkElemWidth);
}
checkElemWidth(document.body);
```

Firefox and Polypane also have built-in tools to highlight scroll containers.

#### Avoiding layout shift from scrollbars

When the page grows tall enough to need a scrollbar, the scrollbar appears and shoves everything left by ~15px → CLS hit. Two fixes:

```css
/* Old way: force a scrollbar always */
body { overflow-y: scroll; }   /* makes body a scroll container — side effects */

/* New way: reserve the gutter, no scroll-container side effects */
html { scrollbar-gutter: stable; }
```

`scrollbar-gutter` is the modern win, available in all major browsers since ~2023.

[MDN: scrollbar-gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-gutter)

#### Scroll snapping

Snap-points for carousels and full-screen sections, in two lines of CSS:

```css
.carousel {
  overflow-x: auto;
  scroll-snap-type: x mandatory;   /* axis + precision */
  display: flex;
}
.slide {
  min-width: 100%;
  scroll-snap-align: start;        /* or center, or end */
}
```

- `scroll-snap-type` lives on the **container**. Direction (`x` / `y` / `both`) plus `mandatory` (always snap) or `proximity` (only snap if user stops near a snap point).
- `scroll-snap-align` lives on each **child**: which edge of the child snaps to the matching edge of the container.

Center alignment is great when you want to peek at siblings either side:

```css
.slide {
  scroll-snap-align: center;
  min-width: calc(100% - 32px);
}
```

[MDN: scroll-snap-type](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-snap-type) · [MDN: scroll-snap-align](https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-snap-align)

#### `position: sticky` inside scroll containers

Sticky positioning works *relative to its nearest scroll container*, not the viewport. If you stick something to the top but your wrapper is `overflow: hidden`, the element sticks to that wrapper — usually not what you want. Make sure the scroll container is the right one.

---

### 7. Accessibility

#### Focus indicators — don't kill them

When something is focused, the browser draws a focus ring. This is the **only** way keyboard, switch, and AT users know where they are. Yet for years the standard CSS reset has been:

```css
/* Almost always a bug. */
button { outline: none; }
```

Modern browsers already changed their UA stylesheet to apply focus rings to `:focus-visible` instead of `:focus`. That means the rings *only* show when the user is navigating without a pointer (keyboard / switch). Mouse-clicks no longer leave a lingering ring. **You don't need to remove anything anymore.**

```css
/* What browsers now do by default */
button:focus-visible {
  outline: 5px auto -webkit-focus-ring-color;
}
```

If the default ring clashes with your design, *replace* it with something equally visible:

```css
button:focus-visible {
  outline: 2px solid var(--brand-accent);
  outline-offset: 2px;
}
```

Changing only `outline-color` works in Chrome but not Firefox/Safari (those browsers' focus rings ignore it). Setting `outline-style: solid` overrides the native ring entirely, but you lose the recognizable look.

Quick distinction:
- `:focus` — matches whenever focused, including after a mouse click.
- `:focus-visible` — matches only when the browser thinks a focus indicator is warranted (keyboard/AT).

[MDN: :focus-visible](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible)

#### `:focus-within` — style a parent based on a child

```css
form {
  transition: transform 300ms, filter 300ms;
}
form:focus-within {
  transform: translateY(-4px);
  filter: drop-shadow(2px 4px 16px rgba(0,0,0,0.2));
}
```

Any focused descendant lights up the form. Great for highlighting active form sections, dropdowns, search containers. No JS needed. There's no `:hover-within` counterpart.

[MDN: :focus-within](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-within)

Debug focus from JS:

```js
console.log(document.activeElement);
// Or use Chrome DevTools "Live Expression" on the same.
```

#### Reading order: DOM vs. visual

Screen readers and tab order follow the **DOM order**, not the visual order. CSS Grid and Flex make it easy to rearrange visually:

```css
.wrapper { display: grid; }
.one   { grid-column: 5; grid-row: 3; }
.two   { grid-column: 2; grid-row: 5; }
.three { grid-column: 3; grid-row: 1; }
.four  { grid-column: 1; grid-row: 1; }
```

If the DOM is `<one><two><three><four>`, tabbing jumps all over the screen. Disorienting.

**First fix: rearrange the DOM to match the visual order.** Always preferable.

When that's impossible — responsive layouts that swap header/sidebar, `grid-auto-flow: dense`, etc. — there's a new property:

```css
.wrapper {
  display: grid;
  reading-flow: grid-rows;   /* left-to-right per row, top to bottom */
}
```

`reading-flow` accepts `grid-rows`, `grid-columns`, `flex-visual`, or `source-order` (combined with per-child `reading-order: <integer>`). It affects tab order *and* screen-reader announcement order. As of late 2025, supported only in Chromium browsers — treat as progressive enhancement.

#### Color contrast (WCAG)

A contrast ratio between text and background, computed from the two colors' luminances. Range: 1 (none) to 21 (max).

| Level | Normal text | Large text |
|-------|-------------|------------|
| AA    | 4.5         | 3          |
| AAA   | 7           | 4.5        |

Aim for AA as a *minimum*. For text on busy backgrounds (e.g. photos), aim higher — sample several "low-contrast" patches with a color-picker and check the worst case. Chrome DevTools shows contrast inline in the color picker.

[Color Review tool](https://color.review/) · [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/)

The WCAG formula is good but not perfect — it doesn't model human nonlinear perception (we read bright-on-bright better than dark-on-dark even at the same ratio). The replacement standard, **APCA**, addresses this and is being prepared for WCAG 3.

#### Color blindness

~5–10% of people have some form. Most common: red/green confusion. Never use color **alone** to convey meaning — pair it with text, icons, position, or shape. ("Red items have errors" fails for protanopes; "items with a ⚠ icon have errors, and are also red" works.)

Chrome and Firefox DevTools can simulate various forms of colorblindness.

#### Visually-hidden text (sr-only)

For text that should be announced but not seen — icon-only buttons, supplementary context for screen readers:

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

```html
<button>
  <svg aria-hidden="true">…</svg>
  <span class="visually-hidden">Access help center</span>
</button>
```

Avoid `display: none` (removes from accessibility tree) and `visibility: hidden` (same effect). Don't use `aria-label` if real text will do — translated content and copy-paste both work better with real DOM text.

#### Semantic HTML beats ARIA

Use `<button>` for buttons, `<a href>` for navigation, `<nav>` / `<main>` / `<aside>` / `<header>` / `<footer>` for landmarks, `<h1>`–`<h6>` in a sensible hierarchy. Each of these brings keyboard handling, screen-reader announcements, and default focus management for free. ARIA is the fallback when no semantic element fits.

#### Lists — pick by meaning, not by bullet style

HTML has five list-shaped elements. Choosing the right one is a semantic decision; CSS handles the visual question of whether you see bullets, numbers, or nothing. Don't pick `<ul>` "because I'll remove the dot anyway" — pick it because order doesn't change meaning. (Inspiration & deeper read: Frank M Taylor, ["You Don't Know HTML Lists"](https://blog.frankmtaylor.com/2026/05/13/you-dont-know-html-lists/).)

- **`<ul>`** — collection where reordering wouldn't change meaning (nav items, tag chips, a roster). The catch-all when nothing more specific fits.
- **`<ol>`** — order *is* the meaning (steps in a recipe, ranked results, an algorithm). Use `start` to continue numbering across a split list and `reversed` for descending.
- **`<dl>` / `<dt>` / `<dd>`** — name/value pairs: metadata blocks, profile field rows, glossary entries, debug dumps of an object. HTML5 allows a `<div>` wrapper around each `dt`+`dd` group, which makes Flex/Grid layout straightforward. Reach for this before building a two-column "label: value" grid out of `<p>`s.
- **`<menu>` + `<li>`** — a list of *commands* (a toolbar, a contextual action set). Semantically distinct from `<nav>`, which is a landmark for site navigation and can contain prose, not just links. Using `<menu>` removes the temptation to slap `role="menu"` on a `<ul>`.
- **`<select>` / `<option>` / `<datalist>`** — these are lists too. `<select>` for "must choose from this fixed set"; `<datalist>` for *suggested* completions on any `<input>` type (including `range`, where supported). Avoid `value` attributes on `<datalist>` options unless the label and value really need to differ — picking an option swaps the displayed text for the value, which surprises users.

CSS gotcha that follows from the above: don't assume `<li>` only appears inside `<ul>` / `<ol>`. A bare `li { list-style: none }` is fine, but a scoped reset needs every container:

```css
nav ul,
menu {
  list-style: none;
  padding-inline-start: 0;
}
```

Two more practical notes:

- Nesting an `<ol>` inside a `<ul>` (or vice-versa) is fine and often clearer than inventing a custom structure — e.g. an unordered list of recipes where each recipe contains an ordered list of steps.
- A `role="list"` on a `<ul>` is occasionally needed: Safari/VoiceOver drops list semantics when `list-style: none` is applied. If the list-ness matters for AT users, add the role back explicitly.

#### Optical alignment

A heading with `padding: 32px` on all four sides will *measure* symmetrical but *look* top-heavy. Text glyphs sit inside a "text selection box" that has built-in space above (and a touch more below, for descenders). Mathematical symmetry ≠ perceived symmetry.

Two paths:

1. **Bespoke spacing.** Accept that pure design-token values lie, and use slightly off-token values where it matters. Negative margin to claw back the extra top space:
   ```css
   .card h2 { margin-top: -6px; }
   ```
2. **Wait for `text-box-trim` / `text-box-edge`.** Drafted CSS properties that strip the extra vertical space; not yet implemented anywhere.

For small visual nudges, a tiny `transform: translate(x, y)` helper works well (badges, numeric counters). Use negative margin instead when you also need to reclaim space.

---

### Combined-concerns checklist

Before shipping an animated interface:

- [ ] All motion gated behind `@media (prefers-reduced-motion: no-preference)`.
- [ ] Animating only `transform` / `opacity` (or you've measured otherwise).
- [ ] `will-change: transform` on hot elements — and *only* those.
- [ ] Durations between 200–500ms unless there's a reason.
- [ ] Distinct enter and exit transitions where it matters.
- [ ] `:focus-visible` rings present and high-contrast.
- [ ] Tab order matches visual order, or `reading-flow` is set.
- [ ] No `outline: none` without a replacement.
- [ ] Text contrast hits AA minimum.
- [ ] No accidental horizontal scrollbars (`html { overflow-x: clip }` if needed).
- [ ] Color is never the *only* signal.
- [ ] Visually-hidden text where icons stand alone.
