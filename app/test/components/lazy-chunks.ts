/**
 * Lazy chunks in component tests. A Studio, section or canvas behind `React.lazy` is a dynamic
 * `import()`, which Vitest transforms on first use: a second alone, but several seconds when the
 * whole monorepo's tests run at once, far past `findBy`'s one-second default. Tests load such a
 * module in `beforeAll` with {@link preloadChunks} (the component's own `import()` then resolves
 * from the module cache), and wait for what it renders with {@link LAZY_CHUNK_TIMEOUT_MS}.
 */

/** How long a `findBy` waits for a lazy component to appear. */
export const LAZY_CHUNK_TIMEOUT_MS = 10_000;

/** How long a `beforeAll` may take to load the lazy chunks a file renders. */
export const PRELOAD_TIMEOUT_MS = 60_000;

/** Loads every module of `loaders` (the same `import()` the component's `lazy` makes). */
export async function preloadChunks(...loaders: (() => Promise<unknown>)[]): Promise<void> {
  await Promise.all(loaders.map((load) => load()));
}
