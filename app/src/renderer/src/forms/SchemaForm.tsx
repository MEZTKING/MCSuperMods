/**
 * `SchemaForm`: a form generated from a `SchemaNode` (DESIGN §6, "Schema to form
 * generation"). Purely presentational: it reads `value`, reports edits through `onChange`
 * with RFC 6901 pointers, and shows the problems it is given. No session or store imports.
 */
import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { Tooltip } from 'radix-ui';
import { type ReactElement, type Ref, useImperativeHandle, useMemo, useRef } from 'react';
import {
  type ChangeOptions,
  type CompletionSource,
  FormContext,
  type FormContextValue,
  type FormProblem,
} from './context';
import { NodeEditor, ProblemList } from './NodeEditor';
import { isWithin } from './pointer';

/** Default nesting limit; deeper subtrees fall back to inline JSON. */
export const DEFAULT_MAX_DEPTH = 24;

/** Imperative handle of a `SchemaForm`. */
export interface SchemaFormHandle {
  /**
   * Scrolls to and focuses the control for `pointer`, expanding collapsed sections on the
   * way; falls back to the nearest rendered ancestor. Resolves `true` on an exact match.
   */
  focusPointer(pointer: string): Promise<boolean>;
}

export interface SchemaFormProps {
  node: SchemaNode;
  value: Json | undefined;
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  problems?: readonly FormProblem[];
  /** Pointers (from `ElementKind.hiddenPaths`) whose fields are not rendered. */
  hiddenPaths?: readonly string[];
  completions?: CompletionSource;
  /** Accessible name of the root; default "Data". */
  rootLabel?: string;
  maxDepth?: number;
  ref?: Ref<SchemaFormHandle>;
}

const FOCUSABLE =
  'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]';

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Deepest element with a `data-pointer` at or above `pointer`. */
function closestRendered(root: HTMLElement, pointer: string): HTMLElement | undefined {
  let best: HTMLElement | undefined;
  let length = -1;
  for (const element of root.querySelectorAll<HTMLElement>('[data-pointer]')) {
    const candidate = element.dataset.pointer ?? '';
    if (isWithin(pointer, candidate) && candidate.length > length) {
      best = element;
      length = candidate.length;
    }
  }
  return best;
}

export function SchemaForm({
  node,
  value,
  onChange,
  problems,
  hiddenPaths,
  completions,
  rootLabel = 'Data',
  maxDepth = DEFAULT_MAX_DEPTH,
  ref,
}: SchemaFormProps): ReactElement {
  const container = useRef<HTMLFieldSetElement>(null);
  // Keep the latest callback without invalidating the context on every render.
  const change = useRef(onChange);
  change.current = onChange;

  const byPath = useMemo(() => {
    const map = new Map<string, FormProblem[]>();
    for (const problem of problems ?? []) {
      const list = map.get(problem.path);
      if (list === undefined) map.set(problem.path, [problem]);
      else list.push(problem);
    }
    return map;
  }, [problems]);

  const context = useMemo<FormContextValue>(
    () => ({
      onChange: (pointer, next, options) => {
        if (options === undefined) change.current(pointer, next);
        else change.current(pointer, next, options);
      },
      problems: byPath,
      hidden: new Set(hiddenPaths ?? []),
      completions,
      maxDepth,
    }),
    [byPath, hiddenPaths, completions, maxDepth],
  );

  useImperativeHandle(
    ref,
    () => ({
      async focusPointer(pointer: string): Promise<boolean> {
        for (let attempt = 0; attempt < 32; attempt++) {
          const root = container.current;
          if (root === null) return false;
          const target = closestRendered(root, pointer) ?? root;
          const exact = target.dataset.pointer === pointer;
          const toggle = target.querySelector<HTMLElement>('[data-collapse-toggle]');
          if (!exact && target.dataset.collapsed === 'true' && toggle !== null) {
            toggle.click();
            await nextTick();
            continue;
          }
          target.scrollIntoView?.({ block: 'nearest' });
          const candidates = [...target.querySelectorAll<HTMLElement>(FOCUSABLE)];
          // Prefer the value control over header controls (a map entry's key input, the
          // description tip, remove buttons) and union variant pickers; a pointer cannot say
          // whether a map key is at fault, so the value wins.
          const inValue = (element: HTMLElement) => element.closest('[data-field-header]') === null;
          const focusable =
            candidates.find(
              (element) => inValue(element) && !element.hasAttribute('data-variant-picker'),
            ) ??
            candidates.find(inValue) ??
            candidates.find((element) => !element.hasAttribute('data-collapse-toggle')) ??
            candidates[0];
          focusable?.focus();
          return exact;
        }
        return false;
      },
    }),
    [],
  );

  const rootProblems = byPath.get('') ?? [];
  return (
    <FormContext.Provider value={context}>
      <Tooltip.Provider delayDuration={400}>
        <fieldset
          ref={container}
          data-pointer=""
          aria-label={rootLabel}
          className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-2"
        >
          <ProblemList problems={rootProblems} />
          <NodeEditor node={node} value={value} pointer="" label={rootLabel} depth={0} />
        </fieldset>
      </Tooltip.Provider>
    </FormContext.Provider>
  );
}
