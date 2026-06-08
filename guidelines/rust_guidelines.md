# Rust Guidelines

Compact working notes on writing idiomatic, predictable, hard-to-misuse Rust:
API design, the type system, ownership, polymorphism, errors, and docs.

These are **heuristics, not laws.** Every item has exceptions; the goal is to
know the default and the reason behind it so you can decide when to break it.
Optimize for the reader at the *call site* — code is read far more than written,
and call sites outnumber declarations.

---

## 0. First principles

- **Clarity at the call site wins.** A slightly more verbose declaration that
  makes every call obvious is usually the right trade.
- **Prefer compile-time guarantees** when the cost is reasonable: push checks to
  boundaries, then trust the result everywhere downstream.
- **Know the standard vocabulary.** Before inventing a type/trait/algorithm,
  check `std` — reuse its names, traits, and conventions so your API feels native.
- **Make illegal states unrepresentable**, or at least unconstructable, rather
  than relying on documentation and discipline.

---

## 1. Naming

### Casing
| Construct | Style |
|---|---|
| Types, traits, enum variants | `UpperCamelCase` |
| Functions, methods, vars, modules | `snake_case` |
| Constants, statics | `SCREAMING_SNAKE_CASE` |
| Macros | `snake_case!` |
| Type params | short `UpperCamelCase` (`T`, `K`, `V`) |
| Lifetimes | short lowercase (`'a`, `'de`, `'src`) |

- Acronyms/contractions are **one word**: `Uuid`/`Stdin` (not `UUID`/`StdIn`);
  lowercased in snake_case (`is_xid_start`).
- A single-letter "word" only allowed as the last word: `btree_map`, but `PI_2`.
- Don't suffix/prefix crate names with `-rs`/`-rust`; everything here is Rust.

### Conversion method prefixes — encode cost and ownership
- `as_` — **free**, borrowed → borrowed (a cheap view into the representation).
- `to_` — **expensive**, borrowed → owned (may allocate / do real work; for
  `Copy` types it may take `self` by value).
- `into_` — **variable cost**, owned → owned, consumes `self`; may rearrange,
  reallocate, or even discard information. Not a reinterpret cast.
- `as_`/`into_` lower the level of abstraction (expose/deconstruct the
  representation); `to_` stays at the same level but transforms.
- `mut` in a name mirrors its position in the return type: `as_mut_slice`, not
  `as_slice_mut`.
- Unwrap a single-value wrapper (buffering, encoding, atomics) with `into_inner()`.

### Getters
- No `get_` prefix: `fn field(&self) -> &T` and `fn field_mut(&mut self) -> &mut T`.
- Reserve bare `get` for the one obvious thing a type holds (e.g. a cell).
- For bounds-checked access, pair with `unsafe fn *_unchecked` variants.
- Rust can't be generic over mutability, so write paired methods: the immutable
  one gets the short name, the mutable one the `_mut` suffix.

### Iterators
- Collections expose three: `iter(&self) -> Iter` (`&T`),
  `iter_mut(&mut self) -> IterMut` (`&mut T`),
  `into_iter(self) -> IntoIter` (`T`).
- Only for conceptually homogeneous collections; nuanced types offer named
  iterators instead (e.g. bytes vs chars over text).
- The iterator **type name matches the producing method** (`IntoIter`, `Iter`,
  `Keys`, `Values`), ideally read with its module prefix (`vec::IntoIter`).

### Other name components
- `new` — the conventional primary constructor (Rust has no `new` keyword); may
  take args. `Default` and `new` should agree if both exist.
- `from`/`from_*` — conversion constructor; transformation flavor; may take extra
  disambiguating args and may be `unsafe` (unlike a `From` impl).
- `into`/`into_*` — consumes `self`, yields another owned type.
- `is_*` — boolean predicate. Prefer `!x.is_foo()` over an `is_not_foo`.
- `try_*` — fallible, returns `Result`. (Use plain `get` returning `Option` when
  there's a single, info-free failure mode like "out of bounds".)
- `by` / `*_by` / `*_by_key` — takes a custom comparator or projection closure.
- `with` — three uses: "do X **with** this closure" (`resize_with`); a
  constructor variant (`with_capacity`); copy-and-set ("like this, but with …").
- `_ref` suffix to disambiguate when several reference getters exist.

### Cargo features
- No placeholder words: name it `abc`, not `use-abc`/`with-abc`. Match Cargo's
  implicit optional-dependency feature names (`serde`, not `use-serde`).
- Features must be **additive**; negative names like `no-foo` are almost always
  wrong. Canonical `no_std` opt-out: `default = ["std"]`, `std = []`.

### Word order
- Pick one word order and apply it consistently; align with `std`
  (e.g. verb-object-error → `ParseAddrError`, not `AddrParseError`).

---

## 2. Documentation

### Shape of a doc comment
1. One-line summary (used in search and module index — keep it tight).
2. Prose: the *why* and *what*, in Markdown.
3. Sections as needed: `# Examples`, `# Panics`, `# Errors`, `# Safety`.

- `# Panics` — document every condition under which you panic; that's a caller
  contract. Libraries shouldn't panic unless a caller broke a contract.
- `# Errors` — for `Result`-returning fns, what errors occur and when.
- `# Safety` — for `unsafe` fns, every precondition the caller must uphold to
  avoid UB.

### What is worth documenting
- **Names and signatures are already part of the docs.** Don't restate them; a
  comment that just respells the function name adds nothing and rots when the
  signature changes.
- Document what the signature *can't* show: surprising/nuanced behavior, side
  effects, invariants, possible data loss, deferred/async semantics,
  "succeeds-but-may-still-fail-later".
- Document the **contract (why/what), not the implementation (how/where)** —
  internals and usage sites go stale fastest. Lead with purpose, not the item's
  own name.
- Assume an intermediate reader; don't teach Rust or `std` basics.
- Name-drop keywords **early** in a paragraph (people skim). Signpost
  domain/specialist terms with just enough context for a novice to go research —
  without over-explaining.
- Mind the *curse of knowledge*: write for someone less expert than you, but
  don't bury the key detail in a wall of text.
- **Library vs application docs:** libraries (many users, stable, broad) justify
  elaborate docs; application code (few users, changes often) should stay lean —
  boilerplate docs rot and rarely earn their keep. Enable `missing_docs` lints
  only where the team can sustain them (usually libs).

### Crate hygiene
- Thorough crate-level docs with examples; every public item gets a rustdoc
  example showing **why you'd use it**, not just how. (Linking one shared example
  can suffice.)
- Examples use `?`, never `unwrap`/`try!` — users copy them verbatim. Hide
  boilerplate setup lines with a leading `#` so they compile but don't render.
- Hyperlink types and related items in prose.
- `Cargo.toml` metadata: `authors`, `description`, `license`, `repository`,
  `keywords`, `categories` (optionally `documentation`, `homepage`).
- Maintain release notes for all significant changes; flag breaking changes; tag
  releases (annotated tags).
- Hide irrelevant impls/details from rustdoc with `#[doc(hidden)]`; use
  `pub(crate)` to keep internals out of the public API.

---

## 3. Common traits — implement eagerly

The orphan rule means downstream crates **cannot** add these to your types, so
you must. Derive whenever possible.

Workhorses: `Copy`, `Clone`, `Eq`, `PartialEq`, `Ord`, `PartialOrd`, `Hash`,
`Debug`, `Display`, `Default`.

Conversions: implement `From`, `TryFrom`, `AsRef`, `AsMut`. **Never** implement
`Into`/`TryInto` directly — they come free from `From`/`TryFrom`. `Into` is the
better *bound* (`T: Into<String>` reads clearer than `String: From<T>`).

Collections: `FromIterator` + `Extend` (enable `collect`/`partition`/`unzip`;
`Extend` appends onto an existing collection).

Serde `Serialize`/`Deserialize` for data-structure-like types; gate behind an
optional `serde` feature if you don't already depend on it. Skip for marker
types that can't meaningfully serialize, and for sensitive data.

`Send`/`Sync`: auto-derived; with raw pointers verify they reflect real thread
safety, and lock it in with `assert_send::<T>()`-style tests.

Numeric/bitflag types: implement `UpperHex`/`LowerHex`/`Octal`/`Binary` when
bitwise ops make sense — not for plain quantity newtypes.

Per-trait notes:
- **Clone** — deep copy, or clone of a shared pointer (`Rc`/`Arc` clones the
  pointer + bumps the count, not the data). Skip if duplication breaks an
  invariant.
- **Copy** — implicit bitwise copy; only "plain data" that should behave like a
  primitive. Can't coexist with `Drop` or non-`Copy` fields. **Always derive
  `Copy` and `Clone` together** and never hand-write `Clone` alongside `Copy`
  (a copy doesn't call `clone`; keep them identical). Heap-owning types can't be
  `Copy` — it would silently alias an owned pointer.
- **Debug** — programmer-facing (`{:?}`/`{:#?}`). Hand-implement to redact
  secrets. Its output is never empty even for empty values (`""` → `"\"\""`,
  empty vec → `[]`).
- **Display** — user-facing; not derivable in `std`; prerequisite for `Error`;
  gives `ToString` for free; same secrecy concerns as `Debug`.
- **Hash** — feeds fields into a `Hasher` (algorithm-agnostic); enables map keys.
  Keep consistent with `Eq`.
- **PartialEq/Eq** — `==`/`!=`. "Partial" = some values misbehave (`NaN != NaN`);
  `Eq` asserts total equality. Cross-type `PartialEq` is mainly for ref/smart
  pointers.
- **PartialOrd/Ord** — comparison operators; `Ord` adds `min`/`max`/`clamp`.
  Derived comparison runs in declaration order (fields/variants top-to-bottom).
  Chain: `PartialEq → Eq`, `PartialEq → PartialOrd → Ord`.

---

## 4. Predictable behavior

- **Smart pointers add no inherent methods** — they'd shadow/confuse the deref
  target's methods. Use associated functions instead (`Box::into_raw(b)`).
- **Only smart pointers implement `Deref`/`DerefMut`.** Deref drives method
  resolution; abusing it surprises readers. For a validating newtype, exposing
  `DerefMut` can hand out a `&mut` that breaks the invariant.
- **Conversions live on the more specific type** (the one with the extra
  invariant/interpretation). When undecided, prefer `to_`/`as_`/`into_` over
  `from_` — they chain and read better.
- **A clear receiver → a method** (autoborrow, discoverable via rustdoc, `self`
  conveys ownership).
- **No out-parameters.** Return tuples/structs (cheap, no heap). Exception: a
  caller-owned buffer to reuse (`read(&mut self, buf: &mut [u8])`).
- **Operator overloads must be unsurprising** — implement `Mul`/`Add`/… only when
  the semantics genuinely match (associativity, etc.).
- **Constructors are static inherent methods.** `new` is primary; `*_with_*` for
  secondary; `from_*` for conversion constructors (may be `unsafe` / take extra
  args, unlike `From`); domain names for I/O resources (`open`/`connect`/`bind`).

---

## 5. Flexibility

- **Expose intermediate results** callers may want: a binary search returns the
  insertion index on miss; a UTF-8 parse error hands back the valid prefix and
  the input bytes; an insert returns the displaced value.
- **Let the caller control copies/placement.** Take ownership if you need it
  (don't borrow-then-clone); borrow if you don't (don't take-then-drop). Don't
  use a `Copy` bound just to signal "this is cheap".
- **Minimize assumptions with generics:** accept `impl IntoIterator`,
  `AsRef<Path>`, `R: Read` rather than a concrete container.
  - Generics buy: reuse, static dispatch + inlining, inline layout (no
    indirection), inference, precise types (same `T` in and out).
  - Generics cost: code size (monomorphization), force homogeneity, signature
    noise.
- **Make a trait dyn-compatible if it's useful as an object:** its methods should
  take/return trait objects, not generics. Exclude an offending method from the
  vtable with `where Self: Sized`.
  - Trait objects buy heterogeneity and smaller code; cost dynamic dispatch + fat
    pointers, no generic methods, no `Self`.

---

## 6. Type-safety patterns

### Newtype
A wrapper (often over a primitive). Unlike a type alias it is **not**
interchangeable with the inner type, and inherits **no** methods/operators —
forward only what makes sense (comparing IDs: yes; adding IDs: no).

- **Static distinctions:** distinct types for distinct concepts
  (miles vs kilometers, username vs password) turn argument-swap bugs into
  compile errors. For several same-typed args, a named-field struct parameter
  makes call sites self-documenting too.
- **Parse, don't validate:** validate once at construction
  (`fn new(..) -> Result<Self, Err>`), keep the inner field private behind a
  module boundary. The invariant then holds everywhere — no defensive re-checks.
- **Audit the whole surface** for invariant leaks: any mutable access
  (`DerefMut`, public field, `&mut` getter), plus `Deserialize`, `FromStr`,
  `Default`, and same-module code (privacy stops at the module). Put the newtype
  in its own module to shrink the audit.
- **Encapsulate implementation detail / return types:** wrap a complex concrete
  return (e.g. an iterator adaptor stack) so it can change without breaking
  callers. `impl Trait` returns are more concise but limit which extra traits you
  can promise.
- **Convey meaning through types, not `bool`/`Option`/`u8`** at call sites
  (`new(Small, Round)` beats `new(true, false)`); also easier to extend later.

### Flags
Sets of flags → the `bitflags` crate, not enums. An `enum` models *exactly one*
choice; explicit discriminants are for wire/integer compatibility.

### Builder
For values that are complex to construct (many inputs, optional config, compound
data, variant choice).

- Separate builder type (well-named, e.g. a command builder); its constructor
  takes only the **required** data; chainable config methods; one or more
  terminal build methods. Especially apt when building has side effects.
- **Non-consuming (preferred):** config methods take `&mut self` and return
  `&mut Self`; terminal takes `&self`. Works for both one-liners and incremental
  configuration.
- **Consuming:** when the terminal step needs ownership, *all* methods take and
  return owned `self` (reassign at each step for complex flows) so one-liners
  still work.

---

## 7. Dependability / correctness

- **Validate arguments** — don't "be liberal in what you accept". Preference order:
  1. **Static** — choose a type that rules out bad input; cost paid once at the
     boundary, errors caught at compile time.
  2. **Dynamic** — check at runtime (runtime cost, late detection, introduces
     panic/`Result`). Use `debug_assert!` for expensive checks you can drop in
     release; offer `_unchecked`/`raw::` opt-out siblings for hot paths where the
     caller guarantees validity.
- **Destructors never fail.** A panic in `Drop` while unwinding aborts the
  process. Provide a `close() -> Result` for clean teardown; `Drop` does
  best-effort cleanup and logs/ignores errors.
- **Destructors that may block** need a non-blocking alternative method.
- **All public types implement `Debug`** (rare exceptions), and its
  representation is never empty.

---

## 8. Future-proofing / SemVer hygiene

- **Sealed traits:** a trait you want implemented only inside your crate gets a
  private supertrait (`mod private { pub trait Sealed {} }`) that downstream
  can't name. You can then add methods / change private signatures without a
  breaking release. (Removing or changing public methods is still breaking.)
  Document that it's sealed.
- **Private struct fields.** A public field pins the representation and forbids
  invariants (clients mutate freely). Public fields suit only passive,
  C-struct-style data; otherwise use getters/setters.
- **Don't duplicate derivable bounds on the type itself** — put them on the
  impls. Adding a bound to a data structure is breaking; deriving more traits is
  not. Never bound a type on `Clone`/`PartialEq`/`PartialOrd`/`Debug`/`Display`/
  `Default`/`Error`/`Serialize`/`Deserialize`. Exceptions: the bound names an
  associated type, is `?Sized`, or is required by a `Drop` impl.
- **A stable (≥1.0) crate's public deps must be stable.** Watch for sneaky public
  deps — e.g. a `From<OtherCrate::Error>` impl pulls another crate's type into
  your public API.
- **Licensing:** permissive (dual `MIT OR Apache-2.0` is the ecosystem default);
  a permissive crate should depend only on permissive crates.

---

## 9. Macros (declarative, public)

- **Input evocative of output:** mirror Rust keywords and punctuation (precede a
  generated type with `struct`, end const-like items with `;`).
- **Compose with attributes:** allow `#[cfg]`/`#[derive]`/doc on generated items.
- **Work anywhere items are allowed** (module *and* function scope) — test both;
  beware `super::` paths that only resolve at module scope.
- **Support visibility specifiers** (private by default, `pub` if given).
- **Flexible type fragments:** a `$t:ty` must accept primitives, relative/
  absolute/`super` paths, and generics — test all of them.
- Reach for macros to DRY only when traits aren't enough or get too complex.

---

## 10. Leveraging the type system for compile-time guarantees

### The borrow checker as a modeling tool
Its rules (one `&mut` XOR many `&`; an owned `T` is consumed when moved) encode
*operation ordering and state*, not just memory safety.

- **Consume to forbid reuse / encode transitions:** take an owned value and
  return a different state type. A failed transition can hand the value back via
  `Err`, so nothing is lost.
- **Aliasing XOR mutability as a lock:** store a `&mut` to a resource inside a
  wrapper so the resource is unusable until the wrapper is consumed (e.g. a
  transaction holding `&mut Connection`; results sit behind a getter so the
  "no access while active" rule can't be bypassed).
- Three ways to take a value: owned `T` (dropped at scope end unless moved out),
  `&T` (aliasable, no mutation while shared), `&mut T` (unique, can reborrow `&`).
  Lifetimes are elided most of the time.

### Single-use values
Force "use exactly once" with: owned argument + private constructor + no
`Clone`/`Copy` + opaque inner (newtype behind a module). Classic case: a
cryptographic nonce. (It prevents accidental reuse of a *value*, not logic bugs
like a non-random generator.)

### PhantomData and marker/tag types
- Zero-sized tag types (`struct AdminTag;`) plus a type parameter let you give
  the same-shaped data different capabilities without rewriting impls — gate
  methods/traits per tag via bounds on the tag.
- An unused type/lifetime parameter won't compile; `PhantomData<T>` carries it at
  zero size (construct with `PhantomData`).
- `PhantomData<&'a T>` ties a struct to an external resource's lifetime without
  storing a real reference (smaller than a stored `&`). The borrowed-handle /
  owned-handle pair is the canonical example: the owned one frees the resource on
  `Drop`, the borrowed one doesn't, and its lifetime guarantees the resource
  outlives it.
- **Variance matters.** To make two lifetimes refuse to unify (needed for
  branding), pick an *invariant* representation such as `PhantomData<*mut &'id ()>`.

### Branded types (advanced)
Tie a token to one specific value/scope using a unique invariant lifetime: a
constructor of the form `fn new<T>(.., f: impl for<'a> FnOnce(Branded<'a>) -> T)`
brands each instance with a lifetime the *caller can't choose*. Tokens (e.g. a
proven, in-bounds index) then can't cross between instances, enabling provably
safe elision of bounds checks. Highly restrictive, but unlocks things like safe
cyclic/self-referential structures (the technique behind GhostCell).

### Token types
A public type with a **private field** (`struct Token { _proof: () }`) behind a
module: only your crate can mint it, so holding one proves a precondition was met.

- Use as a permission proof (an admin token gates privileged functions), or carry
  data + permission together (a mutex guard).
- Beware accidental constructors — `Deserialize`/`FromStr`/`Default` can let users
  forge tokens.
- Contrast with C++: a Rust guard *is* the only path to the protected data (via
  `Deref`/`DerefMut`), not merely an advisory flag you must remember to check.

### RAII / `Drop`
- Tie resource lifetime to value lifetime; `Drop` runs on scope exit and during
  unwinding — don't depend on a manual `close()` being called on every path.
- `Drop::drop` takes `&mut self`, can't return `Result`, and isn't `async` —
  handle/log errors internally.
- **Move-out-of-field trick:** to consume an owned field in `drop`, wrap it in
  `Option` and `take()` it (or use `ManuallyDrop` + a state flag).
- **Drop guard:** a value whose `Drop` does cleanup (a lock guard unlocking).
- **Scope guard** (à la `defer`): run cleanup on scope exit; *defuse* on the
  success path; some implementations support run-on-unwind-only or success-only.
  Ideal for "clean up on failure".
- **Drop bomb:** panic in `drop` if the value wasn't finalized (when the finalizer
  must return `Result` or be `async`). Either track an `active` flag cleared by
  the consuming finalizer, or finalize via `mem::forget(self)` to defuse — noting
  `forget` leaks any heap/handles the value owned. Consider a debug-only panic
  depending on stakes.
- **`Drop` can be skipped** — `process::exit`, `panic = "abort"`, a double panic,
  `mem::forget`, leaks. So `Drop` is fine for *process-local* cleanup (unlocking a
  mutex) but **not** a hard guarantee for *external* effects (files on disk,
  remote services) — keep an external reaper. Avoid panicking in `drop` outside
  the drop-bomb pattern.
- `mem::forget(t)` and `mem::drop(t)` share the signature `fn(T)` but do the
  opposite: `forget` suppresses the destructor (`ManuallyDrop`), `drop` runs it
  immediately by taking ownership.

### Typestate
Encode runtime state in the type; each state exposes only valid operations;
transition by **consuming** the value and returning the next state. Forgetting a
required step becomes a compile error (or simply drops the incomplete output
rather than leaking it).

- Replaces hand-rolled state flags and "return `Result` on misuse" — the latter
  the type system can't enforce and it burdens callers with errors for what are
  really source-code bugs.
- **Generics over the parent state** (`Serializer<Struct<S>>`, with marker states
  as ZSTs) model recursive/nested flows without an explosion of concrete types;
  finishing a nested state returns control to its parent `S`.
- Powerful but not always ergonomic — reserve it for *critical* invariants
  (real-world example: staged TLS-config builders). Combine with newtypes (valid
  field values) and `Result` (recoverable validation that returns the builder in
  the error).

---

## 11. Extension traits

You can't add inherent methods to foreign types (coherence/orphan rules prevent
cross-crate ambiguity). Instead define a **local** trait and implement it for the
foreign type — or, with a blanket impl, for all implementors of a foreign trait.

- Convention: name it `FooExt`. The impl must live in the same crate as the
  trait. The trait must be **in scope** to call its methods; import it with
  `use path::FooExt as _;` (an underscore import — methods become callable but
  the name stays private, which is fine since you won't use an ext trait in a
  `where` clause).
- **Blanket extension:** `impl<T: Display> DisplayExt for T { .. }` adds a method
  to every `Display` type; the body may only use the bound's capabilities. (This
  is how ecosystem crates extend `Iterator`, `Future`, etc.)
- **Method-resolution priority** on name clashes:
  `&self` inherent > `&self` trait > `&mut self` inherent > `&mut self` trait.
  Force a choice with `(&x).m()` / `(&mut x).m()`. Two trait methods of the same
  name are ambiguous → disambiguate with `Trait::m(x)` or `<Type as Trait>::m(x)`.
  Prefer avoiding clashes to relying on these rules.
- **When to use an ext trait over a free fn:** discoverability (`.`-completion),
  method chaining, usability as a bound / in `dyn`, API cohesion. Overkill for a
  single trivial function (both need an import anyway).
- Handy for splitting a dyn-incompatible trait into a dyn-compatible core + an
  extension trait holding the generic/`Self` methods; and for offering
  experimental methods separately from a stable core.

---

## 12. Polymorphism (Rust has no inheritance)

### Composition over inheritance
- Inheritance's downsides: implicit heterogeneity (interchangeable subclasses
  make equality/comparison unsound), multiple sources of truth (fields and method
  overrides scattered across a hierarchy), and dynamic dispatch by default
  (vtable cost you didn't ask for).
- Rust deliberately separates **data** (struct/enum) from **behavior** (trait). A
  "class" conflates data + behavior + overrides, which obscures concrete-vs-
  generic reasoning.
- **Compose with fields**, not mixins (`struct User { id: Uuid, address: Address }`).
  You trade flat field-access ergonomics for control and clarity.
- The inheritance-shaped tool is the **supertrait** (`trait Mammal: Animal`): it
  shares *behavior* only — no fields, no overriding. "Multiple inheritance" is
  just bounding a generic by several traits. When deriving, every field/variant
  must already implement the derived trait.

### Generics fundamentals
- Traits are compile-time-checked duck typing — or propositions, where an `impl`
  is a proof a type provides the behavior. Bounds (`T: Display`) give generic code
  access to behavior; a bound needn't reference the parameter (`where Self: Sized`).
- **Monomorphization:** each concrete instantiation generates its own code — fast
  and optimizable, at the cost of binary size and compile time. You pay only for
  instantiations you use; mind it for wasm/embedded.
- **Deriving** mechanically generates impls (requires all fields/variants to
  implement the trait).
- **Default methods:** provide a body written in terms of the required methods /
  supertrait (the broad method is required; conveniences default off it). Derives
  may override defaults.
- **Blanket impls:** implement a trait for all `T` (usually conditional on a
  bound). Careful — a blanket impl can block downstream more-specific impls; don't
  blanket over `Debug` as a stand-in for `Display`.
- **Conditional methods:** put the bound on the impl block / a method
  `where`-clause, **not** the type definition, so the type stays unconstrained
  everywhere it's named while gated methods appear only when the bound holds.
- **Orphan rule / coherence:** you may implement a trait only if the trait *or*
  the type is local — guaranteeing at most one impl ecosystem-wide.
- **`Sized` / `?Sized`:** `Sized` is auto for compile-time-known sizes and
  auto-added to type params; opt out with `T: ?Sized`. DSTs (`[T]`, `str`,
  `dyn Trait`) carry their size in a wide reference.

### Static vs dynamic dispatch
- Generic param → monomorphized, static, inlinable, homogeneous, zero runtime
  cost (only code size). `dyn Trait` → one shared function, heterogeneous, runtime
  vtable.
- `dyn Trait` is **opt-in** dynamic dispatch ("trait objects"): the type is
  unknown at compile time, the behavior is known. Use `&dyn`/`Box<dyn>` for
  genuinely heterogeneous collections (`Vec<Box<dyn Trait>>`).
- **Dyn-compatible** (formerly "object-safe"): all supertraits dyn-compatible, no
  associated consts/types, no generic methods, no method returning `Self` (so
  `Clone` isn't dyn-compatible). Generic methods can be excused with
  `where Self: Sized`.
- Trait objects are **wide pointers** (data ptr + vtable ptr; 16 bytes on 64-bit),
  are DSTs usable only behind a reference/pointer, and carry deref + dispatch
  overhead.
- **`Any`:** downcast a `dyn` back to a concrete type (`downcast_ref`, `is::<T>()`,
  `type_id()`); auto-implemented for `'static` types; to downcast a custom trait
  object, add `Any` as a supertrait (then cast `dyn MyTrait` → `dyn Any`). It is
  not reflection.
- **Pitfall:** reaching for `dyn` too early (OOP reflex) throws away type info you
  and the compiler had, forces boxing/downcasting, and hurts performance and
  clarity. Watch for the XY problem — be sure trait objects are what you need.

### Choosing the right tool
- Try **enums or generics+traits first.** A fixed, known set of types → an enum
  (an algebraic data type; users see the valid inputs and branch on them). Caring
  about behavior, not the concrete type → a trait/generic. If a `std` trait fits,
  use it.
- **Seal with an enum** when the API is over a fixed list users shouldn't extend
  (if variant inner types have guarded constructors, inputs keep their invariants;
  otherwise sanitize).
- **Seal with a trait** (private supertrait) when you want trait-driven dispatch
  users shouldn't implement (unstable, or a high-risk domain like crypto) — keeps
  per-type monomorphized dispatch, hides the type list, and avoids forcing
  downstream `match` updates.
- **Open trait** (public, implementable) when downstream *should* extend the API
  for their own types (serialization, hardware abstraction, …).
- Further choices: generic param vs trait object as an argument; in a trait, a
  generic parameter vs an associated type (associated type when there's one impl
  per type; generic when many). Macros are a last resort to DRY.

---

## 13. Working with the borrow checker (ownership ergonomics)

- **Owned / view type pairs:** `String`/`&str`, `PathBuf`/`Path`, `Vec<T>`/`&[T]`,
  `OsString`/`OsStr`. Accept the view, store the owned form.
- **Don't hide ownership costs:** avoid surprise `.clone()`; keep clones visible;
  learn `Cow` (borrow until a mutation forces ownership).
- **Split types along ownership boundaries**, and structure ownership like a
  **tree** — a single owner, borrows pointing downward.
- **Circular references:** use `Rc`/`Arc` (+ `Weak` to break cycles), or replace
  references with indices/IDs into a central collection (arena/slotmap style).
- **Interior mutability:** `Cell` (move values in/out), `RefCell` (runtime-checked
  borrows, single-threaded), `Mutex`/`RwLock` (threaded). These allow mutation
  through `&self` — that's how `lock()` can take `&self` yet hand out `&mut`.
- **Generic reader/writer args by value** (`R: Read`, `W: Write`): `std`
  implements the traits for `&mut R`/`&mut W`, so callers can pass `&mut f` to
  reuse a reader/writer across calls — document this; it trips up newcomers.
- Lifetime parameters on your own data types tie a struct's validity to the
  borrowed data it holds.

---

## 14. Error handling

- **Know the purpose:** recovery vs reporting — design the error for whichever it
  serves.
- **`Result` vs `Option`:** `Result` for expected failures that carry a reason;
  `Option` for a single, info-free absence (indexing/lookup misses → `Option`,
  not `Result`). Reserve panics for unrecoverable programmer-contract violations;
  libraries shouldn't panic otherwise, and must document the panics they do have.
- **Error types** implement `std::error::Error` (+ `Display` + `Debug`), are
  `Send + Sync` (+ `'static` for trait objects / `downcast`). **Never use `()`**
  as an error type (no `Error`/`Display`, useless `Debug`, can't be a `?` target);
  even an info-less error should be a named unit struct. `Display` messages are
  lowercase, concise, no trailing punctuation. Don't implement the deprecated
  `Error::description`.
- **Build a chain:** determine the error's scope; capture extra context as it
  crosses scope boundaries; expose the underlying cause through `Error::source`.
- **Tooling:** `thiserror` to cut boilerplate on defined (library) error enums;
  `anyhow` for application-level boxed/contextual errors.
- **Separate fatal from recoverable**, e.g. `Result<Result<T, Recoverable>, Fatal>`,
  so callers handle each at the right level.
