import { Box, ListChecks, Sparkles } from 'lucide-react';
import { ScrollArea, Tabs } from 'radix-ui';
import { type ReactNode, useState } from 'react';
import { ProblemsPanel, type ProblemsPanelProps } from './ProblemsPanel';
import { tabTriggerClass } from './ui/Button';

/** The right dock's tabs. */
export type DockTab = 'preview' | 'problems' | 'assistant';

/** Props of {@link RightDock}. */
export interface RightDockProps extends ProblemsPanelProps {
  /** The Preview tab's content; a placeholder without it. */
  preview?: ReactNode;
  /** The AI helper tab's content (ADR 0041 D8); the tab is left out without it. */
  assistant?: ReactNode;
  /** The selected tab when controlled. */
  tab?: DockTab;
  onTabChange?(tab: DockTab): void;
}

function Scrolling({ children }: { children: ReactNode }) {
  return (
    <ScrollArea.Root className="size-full overflow-hidden">
      <ScrollArea.Viewport className="size-full">{children}</ScrollArea.Viewport>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none p-0.5 select-none"
      >
        <ScrollArea.Thumb className="relative flex-1 rounded-full bg-border" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

function dockTab(value: string, hasAssistant: boolean): DockTab {
  if (value === 'preview') return 'preview';
  if (value === 'assistant' && hasAssistant) return 'assistant';
  return 'problems';
}

/** The right dock: Preview, Problems and (when given) the AI helper. */
export function RightDock(props: RightDockProps) {
  const { preview, assistant, onTabChange, tab: controlled, ...problems } = props;
  const [ownTab, setOwnTab] = useState<DockTab>('problems');
  const hasAssistant = assistant !== undefined;
  const tab = dockTab(controlled ?? ownTab, hasAssistant);
  const count = props.problems.length + (props.exportProblems?.length ?? 0);
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => {
        const next = dockTab(value, hasAssistant);
        setOwnTab(next);
        onTabChange?.(next);
      }}
      className="flex min-h-0 min-w-0 flex-col border-l border-border"
    >
      <Tabs.List aria-label="Dock" className="flex border-b border-border px-2">
        <Tabs.Trigger value="preview" className={tabTriggerClass} data-testid="dock-tab-preview">
          <Box size={14} aria-hidden />
          Preview
        </Tabs.Trigger>
        <Tabs.Trigger value="problems" className={tabTriggerClass} data-testid="dock-tab-problems">
          <ListChecks size={14} aria-hidden />
          Problems ({count})
        </Tabs.Trigger>
        {hasAssistant && (
          <Tabs.Trigger
            value="assistant"
            className={tabTriggerClass}
            data-testid="dock-tab-assistant"
          >
            <Sparkles size={14} aria-hidden />
            AI helper
          </Tabs.Trigger>
        )}
      </Tabs.List>
      <Tabs.Content value="preview" className="min-h-0 flex-1" data-testid="preview-panel">
        <Scrolling>
          <div className="p-3">
            {preview ?? <p className="text-muted">Open a project to preview its models.</p>}
          </div>
        </Scrolling>
      </Tabs.Content>
      <Tabs.Content value="problems" className="min-h-0 flex-1">
        <Scrolling>
          <ProblemsPanel {...problems} />
        </Scrolling>
      </Tabs.Content>
      {hasAssistant && (
        <Tabs.Content
          value="assistant"
          className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          {assistant}
        </Tabs.Content>
      )}
    </Tabs.Root>
  );
}
