/**
 * The Examples gallery (ADR 0020): the examples the registered plugins contribute, with a
 * search box (title, kind, category and tags), a kind filter and a detail pane that shows
 * what the example adds and its notes. "Open as new project" hands the example to the host,
 * which builds it into a new folder; "Copy into my project" adds it to the open project under
 * a chosen namespace and shows what was added and what was skipped.
 *
 * @packageDocumentation
 */

import type { ContentBundle, ExampleProject, TargetFacts } from '@msm/plugin-api';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useMemo, useState } from 'react';
import { categorySlug, fieldClass } from './NewElementDialog';
import { Button } from './ui/Button';

/** What copying an example added and skipped (the session's `addBundle` result). */
export interface CopyExampleResult {
  added: readonly string[];
  duplicates: readonly string[];
  assets: readonly string[];
  skippedAssets: readonly string[];
}

/** Props of {@link ExamplesDialog}. */
export interface ExamplesDialogProps {
  /** The examples to offer (`session.library.examples`: already limited to registered kinds). */
  examples: readonly ExampleProject[];
  /** The open project's namespaces, or `null` when no project is open. */
  namespaces: readonly string[] | null;
  /** The facts of the target examples are previewed for, or `null` when none is available. */
  target: TargetFacts | null;
  onClose(): void;
  /** Builds the example into a new project (the host asks for a folder). */
  onOpenAsProject(example: ExampleProject): void;
  /** Adds the example to the open project under `namespace`. */
  onCopy(example: ExampleProject, namespace: string): Promise<CopyExampleResult>;
}

/** Whether an example matches a search text: title, kind, category or a tag contains it. */
export function exampleMatches(example: ExampleProject, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return [example.title, example.kind, example.category, ...(example.tags ?? [])].some((field) =>
    field.toLowerCase().includes(needle),
  );
}

/** The namespaces an example can be copied into: the project's own, not `minecraft`. */
export function copyNamespaces(namespaces: readonly string[] | null): string[] {
  return (namespaces ?? []).filter((name) => name !== 'minecraft');
}

/** Why "Copy into my project" is unavailable, or `null` when it is available. */
export function copyDisabledReason(namespaces: readonly string[] | null): string | null {
  if (namespaces === null) return 'Open or create a project first.';
  if (copyNamespaces(namespaces).length === 0) {
    return 'The project has no namespace of its own; add one first.';
  }
  return null;
}

/** The namespace the detail pane previews with when no project namespace is known. */
const PREVIEW_NAMESPACE = 'my_project';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The bundle an example builds for the preview, or why it cannot be built. A built-in
 * example answers at once; a third-party plugin's resolves through its worker (ADR 0035 D3),
 * so the result may be a Promise.
 */
function previewBundle(
  example: ExampleProject,
  namespace: string,
  target: TargetFacts | null,
): ContentBundle | string | Promise<ContentBundle | string> {
  try {
    if (target === null) throw new Error('No Minecraft target is available.');
    const built = example.build({ namespace, projectName: namespace, target, values: {} });
    return built instanceof Promise ? built.catch(errorMessage) : built;
  } catch (error) {
    return errorMessage(error);
  }
}

/** Groups examples by category, keeping first-appearance order. */
function byCategory(examples: readonly ExampleProject[]): [string, ExampleProject[]][] {
  const groups = new Map<string, ExampleProject[]>();
  for (const example of examples) {
    const list = groups.get(example.category) ?? [];
    list.push(example);
    groups.set(example.category, list);
  }
  return [...groups];
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The summary sentence of a copy result. */
export function copySummary(result: CopyExampleResult, namespace: string): string {
  if (result.added.length === 0 && result.assets.length === 0) {
    return `Nothing was added to ${namespace}: the project already has everything in this example.`;
  }
  return `Added ${plural(result.added.length, 'element')} and ${plural(result.assets.length, 'asset')} to ${namespace}.`;
}

/** The gallery dialog. */
export function ExamplesDialog(props: ExamplesDialogProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const kinds = useMemo(
    () => [...new Set(props.examples.map((example) => example.kind))].sort(),
    [props.examples],
  );
  const visible = props.examples.filter(
    (example) => (kind === '' || example.kind === kind) && exampleMatches(example, query),
  );
  const [chosenId, setChosenId] = useState<string | null>(null);
  // The selection follows the filters: a hidden example gives way to the first visible one.
  const selected = visible.find((example) => example.id === chosenId) ?? visible[0];

  const targets = copyNamespaces(props.namespaces);
  const [namespaceChoice, setNamespaceChoice] = useState<string | null>(null);
  const namespace =
    namespaceChoice !== null && targets.includes(namespaceChoice) ? namespaceChoice : targets[0];
  const copyReason = copyDisabledReason(props.namespaces);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    exampleId: string;
    namespace: string;
    value: CopyExampleResult;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const built = useMemo(
    () =>
      selected === undefined
        ? undefined
        : previewBundle(selected, namespace ?? PREVIEW_NAMESPACE, props.target),
    [selected, namespace, props.target],
  );
  const [resolved, setResolved] = useState<{
    from: Promise<ContentBundle | string>;
    value: ContentBundle | string;
  } | null>(null);
  useEffect(() => {
    if (!(built instanceof Promise)) return;
    let live = true;
    void built.then((value) => {
      if (live) setResolved({ from: built, value });
    });
    return () => {
      live = false;
    };
  }, [built]);
  const bundle =
    built instanceof Promise
      ? resolved !== null && resolved.from === built
        ? resolved.value
        : undefined
      : built;

  const searchId = useId();
  const kindId = useId();
  const namespaceId = useId();
  const copyReasonId = useId();

  const choose = (id: string): void => {
    setChosenId(id);
    setResult(null);
    setError(null);
  };

  const copy = async (): Promise<void> => {
    if (selected === undefined || namespace === undefined) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const value = await props.onCopy(selected, namespace);
      setResult({ exampleId: selected.id, namespace, value });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const shownResult = result !== null && result.exampleId === selected?.id ? result : null;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="examples-dialog"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(94vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-x-hidden overflow-y-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">Examples</Dialog.Title>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-0.5">
              <label htmlFor={searchId} className="text-sm">
                Search
              </label>
              <input
                id={searchId}
                type="search"
                data-testid="examples-search"
                className={fieldClass}
                value={query}
                placeholder="Title, kind, category or tag"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor={kindId} className="text-sm">
                Kind
              </label>
              <select
                id={kindId}
                data-testid="examples-kind-filter"
                className={fieldClass}
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="">All kinds</option>
                {kinds.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted" aria-live="polite" data-testid="examples-count">
            {visible.length === props.examples.length
              ? plural(props.examples.length, 'example')
              : `${visible.length} of ${plural(props.examples.length, 'example')}`}
          </p>
          <div className="grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <div
              role="radiogroup"
              aria-label="Examples"
              data-testid="examples-list"
              className="flex max-h-[55vh] min-w-0 flex-col gap-2 overflow-auto"
            >
              {visible.length === 0 && (
                <p className="text-sm text-muted" data-testid="examples-empty">
                  {props.examples.length === 0
                    ? 'No examples are available.'
                    : 'No example matches the search.'}
                </p>
              )}
              {byCategory(visible).map(([category, entries]) => {
                return (
                  <fieldset
                    key={category}
                    data-testid={`examples-group-${categorySlug(category)}`}
                    className="m-0 min-w-0 border-0 p-0 flex flex-col gap-0.5"
                  >
                    <legend className="text-xs font-semibold tracking-wide text-muted uppercase">
                      {category}
                    </legend>
                    {entries.map((example) => (
                      <label
                        key={example.id}
                        className={
                          'flex cursor-pointer items-start gap-2 rounded border px-2 py-1 ' +
                          (example.id === selected?.id ? 'border-accent bg-bg' : 'border-border')
                        }
                      >
                        <input
                          type="radio"
                          name="example"
                          value={example.id}
                          className="mt-1"
                          data-testid={`example-${example.id}`}
                          checked={example.id === selected?.id}
                          onChange={() => choose(example.id)}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-sm font-medium">{example.title}</span>
                          <code className="truncate font-mono text-xs text-muted">
                            {example.kind}
                          </code>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                );
              })}
            </div>
            <section
              aria-label="Example details"
              data-testid="example-detail"
              className="flex min-w-0 flex-col gap-2"
            >
              {selected === undefined ? (
                <p className="text-sm text-muted">Choose an example to see what it contains.</p>
              ) : (
                <>
                  <h3 className="text-base font-semibold" data-testid="example-detail-title">
                    {selected.title}
                  </h3>
                  <p className="text-sm">{selected.description}</p>
                  <p className="text-xs text-muted">
                    <code className="font-mono">{selected.kind}</code> · {selected.category}
                    {(selected.tags ?? []).length > 0 && ` · ${(selected.tags ?? []).join(', ')}`}
                  </p>
                  {typeof bundle === 'string' ? (
                    <p className="text-sm text-error" role="alert">
                      This example could not be built: {bundle}
                    </p>
                  ) : (
                    bundle !== undefined && (
                      <ul
                        className="flex max-h-[40vh] flex-col gap-1.5 overflow-auto"
                        data-testid="example-contents"
                      >
                        {bundle.elements.map((element) => (
                          <li key={element.id} className="rounded border border-border px-2 py-1">
                            <code className="font-mono text-xs break-all">{element.id}</code>{' '}
                            <span className="text-xs text-muted">({element.kind})</span>
                            {element.notes !== undefined && element.notes !== '' && (
                              <p
                                className="mt-0.5 text-sm whitespace-pre-line"
                                data-testid="example-notes"
                              >
                                {element.notes}
                              </p>
                            )}
                          </li>
                        ))}
                        {bundle.assets.map((asset) => (
                          <li
                            key={`${asset.namespace}:${asset.path}`}
                            className="rounded border border-border px-2 py-1"
                          >
                            <code className="font-mono text-xs break-all">
                              assets/{asset.namespace}/{asset.path}
                            </code>{' '}
                            <span className="text-xs text-muted">(generated placeholder)</span>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </>
              )}
            </section>
          </div>
          {shownResult !== null && (
            <div
              role="status"
              data-testid="examples-copy-result"
              className="flex flex-col gap-1 rounded border border-border bg-bg p-2 text-sm"
            >
              <p>{copySummary(shownResult.value, shownResult.namespace)}</p>
              {shownResult.value.duplicates.length > 0 && (
                <div data-testid="examples-copy-duplicates">
                  <p className="text-warning">
                    Skipped {plural(shownResult.value.duplicates.length, 'element')} the project
                    already has:
                  </p>
                  <ul className="ml-4 list-disc">
                    {shownResult.value.duplicates.map((id) => (
                      <li key={id}>
                        <code className="font-mono text-xs">{id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {shownResult.value.skippedAssets.length > 0 && (
                <div data-testid="examples-copy-skipped-assets">
                  <p className="text-warning">
                    Skipped {plural(shownResult.value.skippedAssets.length, 'asset')} the project
                    already has:
                  </p>
                  <ul className="ml-4 list-disc">
                    {shownResult.value.skippedAssets.map((path) => (
                      <li key={path}>
                        <code className="font-mono text-xs">{path}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {error !== null && (
            <p className="whitespace-pre-line text-error" role="alert" data-testid="examples-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
            <Button
              data-testid="examples-open-new"
              disabled={selected === undefined || busy}
              onClick={() => {
                if (selected !== undefined) props.onOpenAsProject(selected);
              }}
            >
              Open as new project…
            </Button>
            <div className="flex flex-col gap-0.5">
              <label htmlFor={namespaceId} className="text-xs text-muted">
                Copy into namespace
              </label>
              <select
                id={namespaceId}
                data-testid="examples-namespace"
                className={fieldClass}
                disabled={copyReason !== null}
                value={namespace ?? ''}
                onChange={(event) => setNamespaceChoice(event.target.value)}
              >
                {targets.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>
            <Button
              data-testid="examples-copy"
              aria-describedby={copyReason === null ? undefined : copyReasonId}
              disabled={copyReason !== null || selected === undefined || busy}
              onClick={() => void copy()}
            >
              Copy into my project
            </Button>
            <Dialog.Close asChild>
              <Button className="ml-auto" data-testid="examples-close">
                Close
              </Button>
            </Dialog.Close>
          </div>
          {copyReason !== null && (
            <p id={copyReasonId} className="text-xs text-muted" data-testid="examples-copy-reason">
              {copyReason}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
