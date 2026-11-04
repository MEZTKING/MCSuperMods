import type { Element, Json, ResourceLocation } from '@msm/core';
import { Braces, FormInput } from 'lucide-react';
import { ScrollArea, Tabs } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { RawJsonPanel } from './RawJsonPanel';
import { tabTriggerClass } from './ui/Button';

/** The editor tabs. */
export type EditorTab = 'form' | 'json';

/** Props of {@link EditorArea}. */
export interface EditorAreaProps {
  element: Element | null;
  onApply(id: ResourceLocation, data: Json): void;
  /** The Form tab's content for the selected element. */
  form?: ReactNode;
  /** The selected tab when controlled. */
  tab?: EditorTab;
  onTabChange?(tab: EditorTab): void;
}

/**
 * The centre editor area: Form and Raw JSON tabs over the selected element, with the
 * element's `meta.notes` (a copied example's explanation) in a collapsible, read-only Notes
 * callout above them.
 */
export function EditorArea({ element, onApply, form, tab, onTabChange }: EditorAreaProps) {
  const [ownTab, setOwnTab] = useState<EditorTab>('form');
  const current = tab ?? ownTab;

  if (element === null) {
    return (
      <section aria-label="Editor" className="flex min-h-0 items-center justify-center p-4">
        <p className="text-muted">Select an element to edit it, or add one with Add element.</p>
      </section>
    );
  }

  const notes = element.meta.notes;

  return (
    <Tabs.Root
      value={current}
      onValueChange={(value) => {
        const next: EditorTab = value === 'json' ? 'json' : 'form';
        setOwnTab(next);
        onTabChange?.(next);
      }}
      className="flex min-h-0 min-w-0 flex-col"
    >
      <div className="flex items-center gap-3 border-b border-border px-2">
        <Tabs.List aria-label="Editor views" className="flex">
          <Tabs.Trigger value="form" className={tabTriggerClass} data-testid="editor-tab-form">
            <FormInput size={14} aria-hidden />
            Form
          </Tabs.Trigger>
          <Tabs.Trigger value="json" className={tabTriggerClass} data-testid="editor-tab-json">
            <Braces size={14} aria-hidden />
            Raw JSON
          </Tabs.Trigger>
        </Tabs.List>
        <span className="ml-auto truncate text-xs text-muted">
          <code className="font-mono">{element.id}</code> ({element.kind})
        </span>
      </div>
      {notes !== undefined && notes.trim() !== '' && (
        <details
          open
          data-testid="element-notes"
          className="mx-2 mt-2 rounded border border-border bg-bg px-2 py-1 text-sm"
        >
          <summary className="cursor-pointer font-medium" data-testid="element-notes-toggle">
            Notes
          </summary>
          <p
            className="mt-1 max-h-40 overflow-auto whitespace-pre-line"
            data-testid="element-notes-text"
          >
            {notes}
          </p>
        </details>
      )}
      <Tabs.Content value="form" className="min-h-0 flex-1">
        <ScrollArea.Root className="size-full overflow-hidden">
          <ScrollArea.Viewport className="size-full">
            <div className="p-2">
              {form ?? <p className="text-muted">No form is available for this element.</p>}
            </div>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            className="flex w-2 touch-none p-0.5 select-none"
          >
            <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </Tabs.Content>
      <Tabs.Content value="json" className="min-h-0 flex-1">
        <RawJsonPanel key={element.id} element={element} onApply={onApply} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
