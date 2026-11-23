import type { Element, Json, ResourceLocation } from '@msm/core';
import { Eye, EyeOff, Pencil, Sparkles, WandSparkles, X } from 'lucide-react';
import { ScrollArea } from 'radix-ui';
import { type ReactNode, useEffect, useState } from 'react';
import { displayNameOf } from '../session/plain-problems';
import { plainNotes } from '../studios/plain-things';
import { Section } from '../studios/worldgen/parts';
import { useTextureDrop } from '../textures/texture-drop';
import { newHereTip } from './new-here';
import { RawJsonPanel } from './RawJsonPanel';
import { Button } from './ui/Button';
import { MoreOptions } from './ui/MoreOptions';

/**
 * What the store's editor tab says (`ui-store.ts`): `'json'` opens "Edit as raw text" under
 * Where it goes (ADR 0130 D4), `'form'` is the Studio alone.
 */
export type EditorTab = 'form' | 'json';

/** A thing that uses the open one (Where it goes, ADR 0130 D4). */
export interface UsedByEntry {
  readonly id: string;
  readonly name: string;
}

/** Props of {@link EditorArea}. */
export interface EditorAreaProps {
  element: Element | null;
  onApply(id: ResourceLocation, data: Json): void;
  /** The Studio (or form) for the selected element. */
  form?: ReactNode;
  /** `'json'` opens "Edit as raw text" (the palette's Edit as raw text). */
  tab?: EditorTab;
  onTabChange?(tab: EditorTab): void;
  /**
   * Asks the AI helper about the element (ADR 0041 D8); the header then has an "Ask AI" button
   * (`editor-ask-ai`). Hidden when absent.
   */
  onAskAi?(id: ResourceLocation): void;
  /**
   * Reopens the element's Creator set (ADR 0043 D4); the header then has an "Edit in Creator"
   * button (`editor-edit-in-creator`) for elements with `meta.creator`. Hidden when absent.
   */
  onEditInCreator?(element: Element): void;
  /** The live preview of the selected element, shown beside the form (ADR 0047 D4). */
  preview?: ReactNode;
  /** Whether the preview pane is shown (default true when a preview is given). */
  previewShown?: boolean;
  /** Shows or hides the preview pane. */
  onTogglePreview?(): void;
  /** Home (ADR 0083 D2, ADR 0129), shown when no element is selected. */
  home?: ReactNode;
  /**
   * Try it's view (ADR 0085 D13): when given, it fills the editor area instead of the element
   * or Home, as Home does.
   */
  tryIt?: ReactNode;
  /** The Name section's **Rename…** (the shown name); hidden when absent. */
  onRename?(element: Element): void;
  /** The Name section's More options **Change id…** (rewrites what uses it); hidden when absent. */
  onChangeId?(id: ResourceLocation): void;
  /** What uses the element, for Where it goes; absent shows nothing. */
  usedBy?(id: ResourceLocation): readonly UsedByEntry[];
  /** The files the element becomes, for Where it goes' More options; absent hides it. */
  filesOf?(id: ResourceLocation): Promise<readonly string[]>;
  /** Opens another element (a Used by row). */
  onOpenElement?(id: ResourceLocation): void;
}

/** The Studio header's name (ADR 0130 D2: a name, never an id). */
function nameOf(element: Element): string {
  return displayNameOf(element);
}

/**
 * The centre editor area (ADR 0130 D2–D4): the open thing's name and buttons, a first-time
 * **New here?** tip for its kind, its Notes (a copied example's explanation, in plain words), the
 * **Name** section (id and Change id in its More options), the Studio, and **Where it goes**
 * (what uses it, and in its More options the files it becomes and "Edit as raw text"), with the
 * live preview beside them. With nothing open it shows Home.
 */
export function EditorArea({
  element,
  onApply,
  form,
  tab,
  onTabChange,
  onAskAi,
  onEditInCreator,
  preview,
  previewShown = true,
  onTogglePreview,
  home,
  tryIt,
  onRename,
  onChangeId,
  usedBy,
  filesOf,
  onOpenElement,
}: EditorAreaProps) {
  const previewDrop = useTextureDrop(element?.id ?? null);

  if (tryIt !== undefined) return tryIt;
  if (element === null) {
    return (
      home ?? (
        <section
          aria-label="Editor"
          className="flex min-h-0 flex-col items-center justify-center gap-1 p-4"
        >
          <p className="text-muted">Pick something on the left to change it.</p>
        </section>
      )
    );
  }

  // A note says its ids in words, and leaves out sentences of code (ADR 0083 D3, ADR 0130 D2).
  const notes =
    element.meta.notes === undefined ? undefined : (plainNotes(element.meta.notes) ?? undefined);
  // The note as written, when the plain one left something out: under its More options.
  const spaced = (text: string | undefined) => text?.replace(/\s+/g, ' ').trim() ?? '';
  const fullNotes =
    element.meta.notes !== undefined &&
    spaced(element.meta.notes) !== '' &&
    spaced(element.meta.notes) !== spaced(notes)
      ? element.meta.notes
      : undefined;
  const name = nameOf(element);

  return (
    <section aria-label="Editor" className="flex min-h-0 min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border px-2 py-1">
        <h2 className="truncate font-semibold text-sm" data-testid="editor-name">
          {name}
        </h2>
        <span className="ml-auto" />
        {onEditInCreator !== undefined && element.meta.creator !== undefined && (
          <button
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-bg hover:text-text"
            data-testid="editor-edit-in-creator"
            title="Reopen the set this belongs to in the Creator"
            onClick={() => onEditInCreator(element)}
          >
            <WandSparkles size={12} aria-hidden />
            Edit in Creator
          </button>
        )}
        {preview !== undefined && onTogglePreview !== undefined && (
          <button
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-bg hover:text-text"
            data-testid="editor-toggle-preview"
            aria-pressed={previewShown}
            title={previewShown ? 'Hide the live preview' : 'Show the live preview beside the form'}
            onClick={onTogglePreview}
          >
            {previewShown ? <EyeOff size={12} aria-hidden /> : <Eye size={12} aria-hidden />}
            Preview
          </button>
        )}
        {onAskAi !== undefined && (
          <button
            type="button"
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-bg hover:text-text"
            data-testid="editor-ask-ai"
            title="Ask the AI helper about this"
            onClick={() => onAskAi(element.id)}
          >
            <Sparkles size={12} aria-hidden />
            Ask AI
          </button>
        )}
      </div>
      <div
        className={
          preview !== undefined && previewShown
            ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
            : 'flex min-h-0 flex-1 flex-col'
        }
      >
        <ScrollArea.Root className="size-full min-h-0 overflow-hidden">
          <ScrollArea.Viewport className="size-full">
            <div className="flex flex-col gap-3 p-2" data-testid="editor-form">
              <NewHereTip kind={element.kind} />
              {((notes !== undefined && notes.trim() !== '') || fullNotes !== undefined) && (
                <details
                  open
                  data-testid="element-notes"
                  className="rounded border border-border bg-bg px-2 py-1 text-sm"
                >
                  <summary
                    className="cursor-pointer font-medium"
                    data-testid="element-notes-toggle"
                  >
                    Notes
                  </summary>
                  <p
                    className="mt-1 max-h-40 overflow-auto whitespace-pre-line"
                    data-testid="element-notes-text"
                  >
                    {notes ?? ''}
                  </p>
                  {fullNotes !== undefined && (
                    <MoreOptions storageKey="element-notes" autoOpen={false}>
                      <p
                        className="max-h-40 overflow-auto whitespace-pre-line text-muted text-xs"
                        data-testid="element-notes-full"
                      >
                        {fullNotes}
                      </p>
                    </MoreOptions>
                  )}
                </details>
              )}
              <NameSection element={element} onRename={onRename} onChangeId={onChangeId} />
              <div data-testid="editor-studio">
                {form ?? <p className="text-muted">There is nothing to change here.</p>}
              </div>
              <WhereItGoes
                element={element}
                onApply={onApply}
                tab={tab}
                onTabChange={onTabChange}
                usedBy={usedBy}
                filesOf={filesOf}
                onOpenElement={onOpenElement}
              />
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            className="flex w-2 touch-none p-0.5 select-none"
          >
            <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
        {preview !== undefined && previewShown && (
          <aside
            aria-label="Live preview"
            data-testid="editor-preview"
            className={`min-h-0 overflow-auto border-l border-border p-2 ${previewDrop.over ? 'outline-2 outline-accent' : ''}`}
            {...previewDrop.dropProps}
          >
            {preview}
          </aside>
        )}
      </div>
    </section>
  );
}

const NEW_HERE_KEY = 'msm.new-here.v1';

/** The kinds whose New here? tip was dismissed. */
function dismissedKinds(): Set<string> {
  try {
    const text = globalThis.localStorage?.getItem(NEW_HERE_KEY);
    const parsed = text === null || text === undefined ? [] : (JSON.parse(text) as unknown);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

/**
 * **New here?** (ADR 0130 D2): what a thing of this kind needs and how to try it, once per kind
 * until dismissed with **Got it** (remembered on this computer).
 */
function NewHereTip({ kind }: { kind: string }) {
  const [dismissed, setDismissed] = useState(() => dismissedKinds().has(kind));
  useEffect(() => setDismissed(dismissedKinds().has(kind)), [kind]);
  if (dismissed) return null;
  const dismiss = (): void => {
    setDismissed(true);
    try {
      const kinds = dismissedKinds();
      kinds.add(kind);
      globalThis.localStorage?.setItem(NEW_HERE_KEY, JSON.stringify([...kinds].sort()));
    } catch {
      // Storage is unavailable: the tip comes back next time.
    }
  };
  return (
    <aside
      aria-label="New here?"
      data-testid="new-here"
      className="flex items-start gap-2 rounded border border-accent/40 bg-accent/10 px-2 py-1.5 text-sm"
    >
      <b className="shrink-0">New here?</b>
      <span className="flex-1" data-testid="new-here-text">
        {newHereTip(kind)}
      </span>
      <button
        type="button"
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-bg hover:text-text"
        data-testid="new-here-dismiss"
        onClick={dismiss}
      >
        <X size={12} aria-hidden />
        Got it
      </button>
    </aside>
  );
}

/** The **Name** section: the name, Rename, and in More options the id and Change id. */
function NameSection(props: {
  element: Element;
  onRename: ((element: Element) => void) | undefined;
  onChangeId: ((id: ResourceLocation) => void) | undefined;
}) {
  const { element } = props;
  return (
    <Section
      title="Name"
      testId="thing-name"
      why="What this is called in your mod and in the game."
      more={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Id:</span>
          <code className="font-mono" data-testid="element-id">
            {element.id}
          </code>
          <span className="text-muted" data-testid="element-kind">
            ({element.kind})
          </span>
          {props.onChangeId !== undefined && (
            <Button
              className="text-xs"
              data-testid="thing-change-id"
              onClick={() => props.onChangeId?.(element.id)}
            >
              Change id…
            </Button>
          )}
          <p className="w-full text-muted">
            The name Minecraft uses inside. Change it only if you know you need to: worlds that
            already have this thing lose it.
          </p>
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm" data-testid="thing-name-text">
          {displayNameOf(element)}
        </span>
        {props.onRename !== undefined && (
          <Button
            className="text-xs"
            data-testid="thing-rename"
            onClick={() => props.onRename?.(element)}
          >
            <Pencil size={12} aria-hidden />
            Rename…
          </Button>
        )}
      </div>
    </Section>
  );
}

/**
 * **Where it goes** (ADR 0130 D4): what uses the thing, and in its More options the files it
 * becomes and the whole thing as raw text.
 */
function WhereItGoes(props: {
  element: Element;
  onApply(id: ResourceLocation, data: Json): void;
  tab: EditorTab | undefined;
  onTabChange: ((tab: EditorTab) => void) | undefined;
  usedBy: ((id: ResourceLocation) => readonly UsedByEntry[]) | undefined;
  filesOf: ((id: ResourceLocation) => Promise<readonly string[]>) | undefined;
  onOpenElement: ((id: ResourceLocation) => void) | undefined;
}) {
  const { element } = props;
  const users = props.usedBy?.(element.id) ?? [];
  const raw = props.tab === 'json';
  return (
    <section
      aria-label="Where it goes"
      data-testid="where-it-goes"
      className="flex flex-col gap-2 border-border border-t pt-2"
    >
      <h3 className="font-medium text-sm">Where it goes</h3>
      <p className="text-muted text-xs">
        Your mod carries it when you play or share it. Here is what uses it.
      </p>
      <p className="pl-2 text-sm" data-testid="where-used-by-words">
        {users.length === 0
          ? 'Nothing else in your mod uses it.'
          : `Used by ${users.map((entry) => entry.name).join(', ')}.`}
      </p>
      <div className="pl-2">
        <MoreOptions storageKey="where-it-goes" autoOpen={false} {...(raw ? { open: true } : {})}>
          {users.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs" data-testid="where-used-by">
              {users.map((entry) => (
                <li key={entry.id} className="flex items-center gap-2">
                  <code className="font-mono">{entry.id}</code>
                  <span className="text-muted">{entry.name}</span>
                  {props.onOpenElement !== undefined && (
                    <button
                      type="button"
                      className="cursor-pointer text-accent underline-offset-2 hover:underline"
                      onClick={() => props.onOpenElement?.(entry.id as ResourceLocation)}
                    >
                      Open
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {props.filesOf !== undefined && <FilesItMakes id={element.id} filesOf={props.filesOf} />}
          <MoreOptions
            storageKey="where-raw-text"
            label="Edit as raw text"
            autoOpen={false}
            {...(raw ? { open: true } : {})}
            onOpenChange={(open) => props.onTabChange?.(open ? 'json' : 'form')}
          >
            <div className="h-96 min-h-0" data-testid="where-raw-text">
              <RawJsonPanel key={element.id} element={element} onApply={props.onApply} />
            </div>
          </MoreOptions>
        </MoreOptions>
      </div>
    </section>
  );
}

/** The files a thing becomes, worked out when asked (lowering runs off the edit path). */
function FilesItMakes(props: {
  id: ResourceLocation;
  filesOf(id: ResourceLocation): Promise<readonly string[]>;
}) {
  const [files, setFiles] = useState<readonly string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A new thing forgets the last list.
  useEffect(() => {
    setFiles(null);
    setError(null);
  }, [props.id]);
  const show = (): void => {
    setBusy(true);
    setError(null);
    props.filesOf(props.id).then(
      (next) => {
        setBusy(false);
        setFiles(next);
      },
      (failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
  };
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="where-files">
      <span className="font-medium">Files it makes</span>
      {files === null ? (
        <Button
          className="self-start text-xs"
          data-testid="where-files-show"
          disabled={busy}
          onClick={show}
        >
          {busy ? 'Working them out…' : 'Show the files'}
        </Button>
      ) : files.length === 0 ? (
        <p className="text-muted">It makes no files of its own.</p>
      ) : (
        <ul className="flex flex-col gap-0.5" data-testid="where-files-list">
          {files.map((path) => (
            <li key={path}>
              <code className="font-mono [overflow-wrap:anywhere]">{path}</code>
            </li>
          ))}
        </ul>
      )}
      {error !== null && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </div>
  );
}
