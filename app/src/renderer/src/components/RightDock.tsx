import type { Problem } from '@msm/core';
import { Box, ListChecks } from 'lucide-react';
import { ScrollArea, Tabs } from 'radix-ui';
import { useState } from 'react';
import { ProblemsPanel } from './ProblemsPanel';
import { tabTriggerClass } from './ui/Button';

/** The right dock's tabs. */
export type DockTab = 'preview' | 'problems';

/** The right dock: Preview (placeholder until the 3D preview lands) and Problems. */
export function RightDock({ problems }: { problems: readonly Problem[] }) {
  const [tab, setTab] = useState<DockTab>('problems');
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => setTab(value === 'preview' ? 'preview' : 'problems')}
      className="flex min-h-0 min-w-0 flex-col border-l border-border"
    >
      <Tabs.List aria-label="Dock" className="flex border-b border-border px-2">
        <Tabs.Trigger value="preview" className={tabTriggerClass}>
          <Box size={14} aria-hidden />
          Preview
        </Tabs.Trigger>
        <Tabs.Trigger value="problems" className={tabTriggerClass}>
          <ListChecks size={14} aria-hidden />
          Problems ({problems.length})
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="preview" className="min-h-0 flex-1 p-4">
        <p className="text-muted">The 3D preview arrives in a later update.</p>
      </Tabs.Content>
      <Tabs.Content value="problems" className="min-h-0 flex-1">
        <ScrollArea.Root className="size-full overflow-hidden">
          <ScrollArea.Viewport className="size-full">
            <ProblemsPanel problems={problems} />
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar
            orientation="vertical"
            className="flex w-2 touch-none p-0.5 select-none"
          >
            <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </Tabs.Content>
    </Tabs.Root>
  );
}
