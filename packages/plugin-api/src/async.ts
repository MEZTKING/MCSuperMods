/**
 * The `MaybePromise` helper type (ADR 0036).
 *
 * @packageDocumentation
 */

/**
 * A value or a Promise of it. The contribution functions that built-in plugins implement
 * synchronously ({@link ElementKind.lower}, {@link ElementTemplate.data},
 * {@link ProjectStarter.build}, {@link ExampleProject.build} and
 * {@link ProjectValidator.validate}) return a `MaybePromise`, so that a sandboxed third-party
 * plugin, whose functions resolve through a worker, can return a Promise. Hosts always await
 * the result. Since 1.0.0.
 *
 * @example
 * ```ts
 * const lower = (element: Element): MaybePromise<OutputFile[]> => [];
 * const files = await lower(element);
 * ```
 *
 * @typeParam T - The value type.
 */
export type MaybePromise<T> = T | Promise<T>;
