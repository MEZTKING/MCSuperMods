import { Bot, CircleAlert, Info, User, Wrench } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { AiDisplayMessage } from '../../store/ai-store';
import { Markdown } from '../Markdown';
import { Button } from '../ui/Button';
import type { AiStatusAction } from './ai-status';
import {
  type AiActionWords,
  forbiddenIn,
  noticeWords,
  toolLine,
  type UiMode,
  wordsFor,
} from './ai-words';

type ToolMessage = Extract<AiDisplayMessage, { role: 'tool' }>;

function pretty(value: unknown): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2) ?? '';
}

/** The words of a tool entry's state after its line. */
function toolStatus(status: ToolMessage['status']): string {
  return status === 'running' ? ' …' : status === 'error' ? ' (failed)' : '';
}

/**
 * A tool entry: in Advanced the line with its details (input and result), in Very easy and Easy
 * the plain line only, with nothing to open.
 */
function ToolEntry({ message, mode }: { message: ToolMessage; mode: UiMode }) {
  const line = toolLine(message, mode);
  if (line === null) return null;
  if (mode !== 'advanced') {
    return (
      <p className="flex items-center gap-1 text-xs text-muted" data-status={message.status}>
        <Wrench size={12} aria-hidden />
        <span>
          {line}
          {toolStatus(message.status)}
        </span>
      </p>
    );
  }
  return (
    <details className="text-xs" data-status={message.status}>
      <summary className="flex cursor-pointer items-center gap-1 text-muted">
        <Wrench size={12} aria-hidden />
        <span className="[&_p]:inline">
          <Markdown source={`${line}${toolStatus(message.status)}`} />
        </span>
      </summary>
      <div className="mt-1 flex flex-col gap-1 pl-4">
        <span className="font-semibold">Input</span>
        <pre className="max-h-48 overflow-auto rounded bg-black/10 p-1.5 font-mono whitespace-pre-wrap">
          {pretty(message.input)}
        </pre>
        {message.result !== undefined && (
          <>
            <span className="font-semibold">Result</span>
            <pre className="max-h-48 overflow-auto rounded bg-black/10 p-1.5 font-mono whitespace-pre-wrap">
              {pretty(message.result)}
            </pre>
          </>
        )}
      </div>
    </details>
  );
}

/** The words of a context block sent with a message, outside Advanced (ADR 0125 D11). */
export const SENT_CONTEXT_WORDS = Object.freeze({
  /** The label of a block whose chip label is not known or is not plain. */
  unknown: 'Something from your mod went with this message.',
  /** Opens the block as it was sent. */
  show: 'See exactly what was sent',
  hide: 'Hide what was sent',
  /** Advanced's summary, as before. */
  advanced: 'Context sent with this message',
});

/** The chip labels of the context blocks the panel has sent, by block (the most kept). */
const sentLabels = new Map<string, string>();
const SENT_LABELS_MAX = 200;

/**
 * Remembers the chip's label of a context block as it is sent, so the transcript can show the
 * plain label in Very easy and Easy (the store keeps only the block).
 */
export function rememberContextLabel(block: string, label: string): void {
  sentLabels.delete(block);
  sentLabels.set(block, label);
  while (sentLabels.size > SENT_LABELS_MAX) {
    const oldest = sentLabels.keys().next().value;
    if (oldest === undefined) break;
    sentLabels.delete(oldest);
  }
}

/**
 * The plain label of a sent context block: the chip's label it was sent with when that holds no
 * id and none of Very easy's forbidden words, else {@link SENT_CONTEXT_WORDS}' `unknown`.
 */
export function sentContextLabel(block: string): string {
  const label = sentLabels.get(block);
  return label !== undefined && label.trim() !== '' && forbiddenIn(label).length === 0
    ? label
    : SENT_CONTEXT_WORDS.unknown;
}

/**
 * A context block sent with a user message: in Advanced the block behind "Context sent with this
 * message" as before; in Very easy and Easy the chip's plain label, and the exact block only
 * after **See exactly what was sent** (not in the page until then, so no id shows unasked).
 */
function SentContext({ block, mode, testId }: { block: string; mode: UiMode; testId: string }) {
  const [open, setOpen] = useState(false);
  if (mode === 'advanced') {
    return (
      <details className="text-xs text-muted" data-testid={testId}>
        <summary className="cursor-pointer">{SENT_CONTEXT_WORDS.advanced}</summary>
        <pre className="mt-1 max-h-40 overflow-auto font-mono whitespace-pre-wrap">{block}</pre>
      </details>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-xs text-muted" data-testid={testId}>
      <span className="flex flex-wrap items-center gap-1.5">
        <span data-testid={`${testId}-label`}>{sentContextLabel(block)}</span>
        <button
          type="button"
          className="cursor-pointer text-accent underline"
          aria-expanded={open}
          data-testid={`${testId}-show`}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? SENT_CONTEXT_WORDS.hide : SENT_CONTEXT_WORDS.show}
        </button>
      </span>
      {open && (
        <pre
          className="max-h-40 overflow-auto font-mono whitespace-pre-wrap"
          data-testid={`${testId}-block`}
        >
          {block}
        </pre>
      )}
    </div>
  );
}

type NoticeMessage = Extract<AiDisplayMessage, { role: 'notice' }>;
type PlanMessage = Extract<AiDisplayMessage, { role: 'plan' }>;

/** Whether a notice tells of a failure (drawn in the error colour). */
function isFailure(kind: NoticeMessage['kind']): boolean {
  return kind === 'error' || kind === 'refusal';
}

/**
 * The transcript (ADR 0125 D1, D13): user messages (with their context blocks), the helper's
 * answers through the safe Markdown renderer (re-parsed as it streams) with a closed "Thinking"
 * line where the mode shows it, tool lines by mode (Very easy and Easy hide most), plans where
 * they were proposed (drawn by `renderPlan`), and notices in the mode's words with their
 * buttons. The list is an `aria-live` region; every entry carries `data-entry` so the panel can
 * keep the newest one in view.
 */
export function AiTranscript(props: {
  messages: readonly AiDisplayMessage[];
  mode: UiMode;
  /** Draws a plan entry (B686's plan, or its closed line). */
  renderPlan(message: PlanMessage): ReactNode;
  /**
   * The buttons a notice offers here: the panel leaves out what it cannot do and what the
   * state line already offers. Default: none.
   */
  noticeActions?(message: NoticeMessage, actions: readonly AiActionWords[]): AiActionWords[];
  onNoticeAction?(message: NoticeMessage, action: AiStatusAction): void;
}) {
  const { mode } = props;
  const words = wordsFor(mode);
  return (
    <ol
      className="m-0 flex list-none flex-col gap-2 p-0"
      aria-live="polite"
      aria-label="Conversation"
      data-testid="ai-transcript"
    >
      {props.messages.map((message) => {
        const testId = `ai-message-${message.seq}`;
        switch (message.role) {
          case 'user':
            return (
              <li
                key={message.seq}
                data-testid={testId}
                data-role="user"
                data-entry=""
                className="flex gap-1.5 rounded bg-bg p-2 text-sm"
              >
                <User size={14} aria-label="You" className="mt-0.5 shrink-0" />
                <div className="flex min-w-0 flex-col gap-1">
                  {message.contextBlocks.map((block, index) => (
                    <SentContext
                      key={index}
                      block={block}
                      mode={mode}
                      testId={`${testId}-context-${index}`}
                    />
                  ))}
                  {message.images !== undefined && (
                    <div className="flex flex-wrap gap-1" data-testid={`${testId}-pictures`}>
                      {message.images.map((url, index) => (
                        <img
                          key={index}
                          src={url}
                          alt={`Attachment ${index + 1} of this message`}
                          className="max-h-24 max-w-40 rounded border border-border object-contain"
                        />
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{message.text}</p>
                </div>
              </li>
            );
          case 'assistant': {
            const thinking = words.showThinking && message.thinking !== '';
            if (!thinking && message.text === '') return null;
            return (
              <li
                key={message.seq}
                data-testid={testId}
                data-role="assistant"
                data-entry=""
                className="flex gap-1.5 text-sm"
              >
                <Bot size={14} aria-label="AI helper" className="mt-0.5 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1 [overflow-wrap:anywhere]">
                  {thinking && (
                    <details
                      className="text-xs text-muted"
                      data-testid={`ai-thinking-${message.seq}`}
                    >
                      <summary className="cursor-pointer">{words.thinking}</summary>
                      <p className="mt-1 whitespace-pre-wrap">{message.thinking}</p>
                    </details>
                  )}
                  {message.text !== '' && <Markdown source={message.text} />}
                </div>
              </li>
            );
          }
          case 'tool': {
            if (toolLine(message, mode) === null) return null;
            return (
              <li key={message.seq} data-testid={testId} data-role="tool" data-entry="">
                <ToolEntry message={message} mode={mode} />
              </li>
            );
          }
          case 'plan':
            return (
              <li
                key={message.seq}
                data-testid={testId}
                data-role="plan"
                data-entry=""
                data-closed={message.closed ? 'true' : 'false'}
              >
                {props.renderPlan(message)}
              </li>
            );
          case 'notice': {
            const said = noticeWords(message, mode);
            const actions = props.noticeActions?.(message, said.actions) ?? [];
            return (
              <li
                key={message.seq}
                data-testid={testId}
                data-role="notice"
                data-kind={message.kind}
                data-entry=""
                className={`flex flex-col gap-1 rounded border border-border px-2 py-1 text-xs ${
                  isFailure(message.kind) ? 'text-error' : ''
                }`}
              >
                <span className="flex items-start gap-1.5">
                  {isFailure(message.kind) ? (
                    <CircleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
                  ) : (
                    <Info size={12} aria-hidden className="mt-0.5 shrink-0" />
                  )}
                  <span data-testid={`${testId}-text`}>{said.text}</span>
                </span>
                {actions.length > 0 && (
                  <span className="flex flex-wrap gap-1.5 pl-4">
                    {actions.map((action) => (
                      <Button
                        key={action.id}
                        className="px-2 py-0.5 text-xs"
                        data-testid={`${testId}-${action.id}`}
                        data-action={action.id}
                        onClick={() => props.onNoticeAction?.(message, action.id)}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </span>
                )}
              </li>
            );
          }
        }
        return null;
      })}
    </ol>
  );
}
