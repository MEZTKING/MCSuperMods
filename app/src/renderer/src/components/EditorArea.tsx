import type { Element, Json, ResourceLocation } from '@msm/core';
import { Braces, FormInput } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { RawJsonPanel } from './RawJsonPanel';
import { tabTriggerClass } from './ui/Button';

/** The editor tabs. */
export type EditorTab = 'form' | 'raw';

/** Props of {@link EditorArea}. */
export interface EditorAreaProps {
  element: Element | null;
  onApply(id: ResourceLocation, data: Json): void;
}

/** The centre editor area: Form and Raw JSON tabs over the selected element. */
export function EditorArea({ element, onApply }: EditorAreaProps) {
  const [tab, setTab] = useState<EditorTab>('raw');

  if (element === null) {
    return (
      <section aria-label="Editor" className="flex min-h-0 items-center justify-center p-4">
        <p className="text-muted">Select an element to edit it.</p>
      </section>
    );
  }

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => setTab(value === 'form' ? 'form' : 'raw')}
      className="flex min-h-0 min-w-0 flex-col"
    >
      <div className="flex items-center gap-3 border-b border-border px-2">
        <Tabs.List aria-label="Editor views" className="flex">
          <Tabs.Trigger value="form" className={tabTriggerClass}>
            <FormInput size={14} aria-hidden />
            Form
          </Tabs.Trigger>
          <Tabs.Trigger value="raw" className={tabTriggerClass}>
            <Braces size={14} aria-hidden />
            Raw JSON
          </Tabs.Trigger>
        </Tabs.List>
        <span className="ml-auto truncate text-xs text-muted">
          <code className="font-mono">{element.id}</code> ({element.kind})
        </span>
      </div>
      <Tabs.Content value="form" className="min-h-0 flex-1 overflow-auto p-4">
        <p className="text-muted">Form editor arrives with the schema form generator.</p>
      </Tabs.Content>
      <Tabs.Content value="raw" className="min-h-0 flex-1">
        <RawJsonPanel key={element.id} element={element} onApply={onApply} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
