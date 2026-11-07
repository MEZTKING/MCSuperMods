import { Bot, CircleAlert, Info, User, Wrench } from 'lucide-react';
import type { AiDisplayMessage } from '../../store/ai-store';
import { Markdown } from '../Markdown';

type ToolMessage = Extract<AiDisplayMessage, { role: 'tool' }>;

function field(input: unknown, name: string): string | undefined {
  if (typeof input !== 'object' || input === null) return undefined;
  const value = (input as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The problem count of a `run_checks` result, or `undefined` while unknown. */
function checkedCount(result: string | undefined): number | undefined {
  if (result === undefined) return undefined;
  try {
    const parsed = JSON.parse(result) as { counts?: Record<string, number> };
    if (parsed.counts === undefined) return undefined;
    return Object.values(parsed.counts).reduce((sum, count) => sum + count, 0);
  } catch {
    return undefined;
  }
}

/**
 * A tool entry's one-line summary: "Read `ruby:ruby_ore`", "Proposed 4 elements",
 * "Checked: 2 problems" and so on. Code spans use Markdown backticks.
 */
export function toolSummary(message: Pick<ToolMessage, 'name' | 'input' | 'result'>): string {
  const { input } = message;
  const code = (name: string) => {
    const value = field(input, name);
    return value === undefined ? '' : ` \`${value}\``;
  };
  switch (message.name) {
    case 'project_summary':
      return 'Read the project summary';
    case 'list_kinds':
      return 'Listed the element kinds';
    case 'kind_schema':
      return `Read the schema of${code('kind')}`;
    case 'list_elements':
      return 'Listed elements';
    case 'read_element':
      return `Read${code('id')}`;
    case 'list_problems':
      return 'Listed problems';
    case 'list_templates':
      return 'Listed templates';
    case 'template_data':
      return `Read template${code('templateId')}`;
    case 'list_starters':
      return 'Listed starters';
    case 'target_facts':
      return "Read the target's facts";
    case 'script_api_typings':
      return 'Read the script API typings';
    case 'pending_changes':
      return 'Read the pending changes';
    case 'create_elements': {
      const elements = (input as { elements?: unknown[] } | null)?.elements;
      return `Proposed ${plural(Array.isArray(elements) ? elements.length : 0, 'element')}`;
    }
    case 'update_element':
      return `Proposed a change to${code('id')}`;
    case 'delete_element':
      return `Proposed deleting${code('id')}`;
    case 'rename_element':
      return `Proposed renaming${code('from')} to${code('to')}`;
    case 'create_texture': {
      const namespace = field(input, 'namespace');
      const path = field(input, 'path');
      return namespace === undefined || path === undefined
        ? 'Proposed a texture'
        : `Proposed the texture \`${namespace}:${path}\``;
    }
    case 'add_starter':
      return `Proposed the starter${code('starterId')}`;
    case 'run_checks': {
      const count = checkedCount(message.result);
      return count === undefined ? 'Checking' : `Checked: ${plural(count, 'problem')}`;
    }
    case 'propose_plan':
      return `Proposed a plan${field(input, 'title') === undefined ? '' : `: ${field(input, 'title')}`}`;
    case 'checkpoint':
      return 'Checkpoint';
    default:
      return `Used ${message.name}`;
  }
}

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

function ToolEntry({ message }: { message: ToolMessage }) {
  const status =
    message.status === 'running' ? ' …' : message.status === 'error' ? ' (failed)' : '';
  return (
    <details className="text-xs" data-status={message.status}>
      <summary className="flex cursor-pointer items-center gap-1 text-muted">
        <Wrench size={12} aria-hidden />
        <span className="[&_p]:inline">
          <Markdown source={`${toolSummary(message)}${status}`} />
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

/**
 * The transcript: user messages (with their context blocks), assistant text through the safe
 * Markdown renderer (re-parsed as it streams) with a collapsed "Thinking" line, one-line tool
 * entries with a disclosure, and notices. The list is an `aria-live` region.
 */
export function AiTranscript(props: { messages: readonly AiDisplayMessage[] }) {
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
                className="flex gap-1.5 rounded bg-bg p-2 text-sm"
              >
                <User size={14} aria-label="You" className="mt-0.5 shrink-0" />
                <div className="flex min-w-0 flex-col gap-1">
                  {message.contextBlocks.map((block, index) => (
                    <details key={index} className="text-xs text-muted">
                      <summary className="cursor-pointer">Context sent with this message</summary>
                      <pre className="mt-1 max-h-40 overflow-auto font-mono whitespace-pre-wrap">
                        {block}
                      </pre>
                    </details>
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
          case 'assistant':
            return (
              <li
                key={message.seq}
                data-testid={testId}
                data-role="assistant"
                className="flex gap-1.5 text-sm"
              >
                <Bot size={14} aria-label="AI helper" className="mt-0.5 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-1 [overflow-wrap:anywhere]">
                  {message.thinking !== '' && (
                    <details
                      className="text-xs text-muted"
                      data-testid={`ai-thinking-${message.seq}`}
                    >
                      <summary className="cursor-pointer">Thinking</summary>
                      <p className="mt-1 whitespace-pre-wrap">{message.thinking}</p>
                    </details>
                  )}
                  {message.text !== '' && <Markdown source={message.text} />}
                </div>
              </li>
            );
          case 'tool':
            return (
              <li key={message.seq} data-testid={testId} data-role="tool">
                <ToolEntry message={message} />
              </li>
            );
          case 'notice':
            return (
              <li
                key={message.seq}
                data-testid={testId}
                data-role="notice"
                data-kind={message.kind}
                className={`flex items-start gap-1.5 rounded border border-border px-2 py-1 text-xs ${
                  message.kind === 'error' || message.kind === 'refusal' ? 'text-error' : ''
                }`}
              >
                {message.kind === 'error' || message.kind === 'refusal' ? (
                  <CircleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
                ) : (
                  <Info size={12} aria-hidden className="mt-0.5 shrink-0" />
                )}
                <span>{message.text}</span>
              </li>
            );
        }
        return null;
      })}
    </ol>
  );
}
