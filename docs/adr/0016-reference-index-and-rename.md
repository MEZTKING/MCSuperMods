# ADR 0016: Reference index and rename refactor

## Context

DESIGN [References and renames](../DESIGN.md#4-core-project-model-ir) promises a reference index in `@msm/core` built from the fields the schema marks as references, and a rename that rewrites every referencing field as one undoable command. Phase 1 has the pieces this needs but not the index: `validateJson` already walks values with their `SchemaNode` and checks strings typed with an id registry (`idRegistry`) against vanilla and project ids ([ADR 0009](0009-phase1-validation-gate.md)), and save already moves an element's file when its id changes. Phase 2 adds functions, whose references sit inside mcfunction text rather than JSON fields ([ADR 0015](0015-data-pack-element-model.md)).

## Decision

**Collection in `@msm/schemas`.** `collectReferences(value, node)` walks a value with its `SchemaNode` exactly as `validateJson` does (one shared walker) and returns `{ path, registry, id }` for every string whose node has `idRegistry`. Tag references keep their `#`. It is pure and version-neutral.

**Index in `@msm/core`** (`src/refs/`, using the new `@msm/core` → `@msm/schemas` dependency, which the layer map already allows):

- `buildReferenceIndex(project, resolveSchema, textReferences?)` returns `{ referencesTo(id, registry?), referencesFrom(elementId), all() }`. Each `Reference` is `{ from, path, registry, to, range? }`; `to` is normalised to `namespace:path` with the `minecraft:` default and without `#`, while `registry` keeps `tag/<registry>` for tag references.
- Function bodies are indexed by `collectTextReferences(element, lines, knownIds)`: exact `namespace:path` tokens of known ids, bounded by characters that cannot occur in an id, with path `/lines/<n>` and a `range` within the line. Renames therefore reach mcfunction text.
- The app session rebuilds the index lazily from the command stack's state, memoised on the state object, so it costs nothing until it is read after a change.

**Rename is one command.** `commands.renameElement(oldId, newId, references)` changes `element.id` (save moves the file through the manifest), rewrites every referencing string in place, keeps a `#` prefix, writes the namespace when the old reference omitted it unless the new id is in `minecraft`, and replaces text references by their recorded range. It is one undoable step and leaves `meta` untouched. A rename onto an existing id fails; the session reports it as the problem `refs.rename-conflict` instead of throwing.

**Dangling references are not a second problem class.** `validateJson` already reports `schema.unknown-id` warnings against vanilla plus project ids, and the mcfunction checker reports undeclared ids as warnings ([ADR 0014](0014-mcfunction-diagnostics-with-spyglass.md)). "Go to definition" and "Find usages" use the index.

## Consequences

- References are exactly what the schema marks: a string the schema does not type with an id registry is neither indexed nor renamed.
- Text references are found by token match against known ids, not by parsing commands; a known id that appears inside a comment or a string literal is rewritten too. This is deliberate: it is predictable, and the result is visible in the undoable diff.
- The rename toast reports how many references were rewritten, so a user can undo a surprising rename at once.
- Dangling references stay warnings and never block save or export, as DESIGN [Error surfacing](../DESIGN.md#8-editors-and-ux) states.

## Status

Accepted (2026-11-04). Implemented in Phase 2, with these details settled during implementation:

- `Reference.key`: a map entry whose key is an id (a map-like struct keyed by `#[id]`) is a reference with `key: true` at the entry's path; rename renames the key and keeps the key order.
- Text references from function lines have the empty registry (`registry: ''`), because a token match in command text is not typed; `referencesTo(id)` without a registry includes them.
- `collectReferences` reports `id` with any `#[id(path=...)]` prefix applied (`minecraft:entity/banner/creeper` for `creeper`) and adds `written`, the string as written, only when it differs.
- The app offers Find usages, Go to definition and F2 rename with a reference count.
