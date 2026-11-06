import type { Element, MaybePromise, OutputFile } from '@msm/plugin-api';

/**
 * Lowers one element for render-time checks (which layers a project has content for, which
 * problems belong to which export). `lower` runs the element's kind.
 */
export type RenderLowering = (
  element: Element,
  lower: () => MaybePromise<OutputFile[]>,
) => readonly OutputFile[];

/**
 * A lowering function for render-time checks that copes with kinds lowering asynchronously
 * (a sandboxed third-party plugin, ADR 0035). A synchronous result is returned as is. A
 * Promise is started once per element object (elements are replaced, never mutated, on
 * every edit), counts as no files while it runs, and its settled result is kept: files are
 * returned on later calls, a failure is thrown so the checks count the element as content
 * and its errors surface when the export runs. `onSettled` is called when a Promise settles,
 * so the caller can run its checks again. Make a new one when the target changes.
 *
 * @param onSettled - Called after each asynchronous lowering settles.
 */
export function createRenderLowering(onSettled: () => void): RenderLowering {
  const settled = new WeakMap<Element, readonly OutputFile[] | Error | 'pending'>();
  return (element, lower) => {
    const known = settled.get(element);
    if (known === 'pending') return [];
    if (known instanceof Error) throw known;
    if (known !== undefined) return known;
    const files = lower();
    if (Array.isArray(files)) return files;
    settled.set(element, 'pending');
    Promise.resolve(files).then(
      (result) => {
        settled.set(element, Array.isArray(result) ? result : []);
        onSettled();
      },
      (error: unknown) => {
        settled.set(element, error instanceof Error ? error : new Error(String(error)));
        onSettled();
      },
    );
    return [];
  };
}
