import { type AiMode, DEFAULT_AI_SETTINGS, modelInfo } from '@msm/ai';
import { ImagePlus, MessageSquarePlus, Send, Square, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { isRunning, limitsFor, useAiStore } from '../../store/ai-store';
import { useUiStore } from '../../store/ui-store';
import { ConfirmDialog } from '../ConfirmDialog';
import { fieldClass } from '../NewElementDialog';
import { Button, iconButtonClass } from '../ui/Button';
import { AiChangesetReview } from './AiChangesetReview';
import { AiKeyMissing } from './AiKeyMissing';
import { AiLimitsPopover } from './AiLimitsPopover';
import { AiPlanView } from './AiPlanView';
import { AiTranscript } from './AiTranscript';
import { AiUsageLine } from './AiUsageLine';
import { type AiController, EMPTY_DRAFT, useAiPanelStore } from './ai-controller';
import { AI_PICTURES_MAX, pictureFilesOf, readPictures } from './ai-pictures';

const MODES: readonly { mode: AiMode; label: string; tip: string }[] = [
  { mode: 'chat', label: 'Chat', tip: 'Ask questions and propose small edits' },
  { mode: 'build', label: 'Build', tip: 'Plan and build whole content from one prompt' },
];

const modeClass =
  'cursor-pointer px-2.5 py-1 text-sm disabled:cursor-default disabled:opacity-50 ' +
  'aria-pressed:bg-accent aria-pressed:text-white';

/**
 * The AI helper panel (ADR 0041 D8): mode switch, transcript, plan, changeset review, usage,
 * run limits and the input area. Without a key it shows the privacy notice and "Open
 * Settings".
 */
export function AiPanel(props: { controller: AiController; onOpenSettings(): void }) {
  const { controller } = props;
  const root = useUiStore((state) => state.snapshot?.root ?? null) ?? controller.root;
  const conversation = useAiStore((state) =>
    root === null ? undefined : state.conversations[root],
  );
  const keyStatus = useAiPanelStore((state) => state.keyStatus);
  const settings = useAiPanelStore((state) => state.settings) ?? DEFAULT_AI_SETTINGS;
  const model = useAiPanelStore((state) => (root === null ? undefined : state.models[root]));
  const draft = useAiPanelStore((state) =>
    root === null ? EMPTY_DRAFT : (state.drafts[root] ?? EMPTY_DRAFT),
  );
  const applying = useAiPanelStore((state) => state.applying);
  const focusRequest = useAiPanelStore((state) => state.focusRequest);
  const [confirmNew, setConfirmNew] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  useEffect(() => {
    void controller.refresh();
  }, [controller]);

  const keySet = keyStatus?.set === true;
  useEffect(() => {
    if (root !== null && keySet) controller.conversation();
  }, [controller, root, keySet]);

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  const messageCount = conversation?.messages.length ?? 0;
  const lastLength = (() => {
    const last = conversation?.messages[messageCount - 1];
    return last?.role === 'assistant' ? last.text.length + last.thinking.length : 0;
  })();
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messageCount, lastLength]);

  if (!controller.available) {
    return (
      <p className="p-3 text-sm text-muted" data-testid="ai-panel">
        The AI helper is not available in this window.
      </p>
    );
  }
  if (root === null) {
    return (
      <p className="p-3 text-sm text-muted" data-testid="ai-panel">
        Open a project to use the AI helper.
      </p>
    );
  }
  if (keyStatus === null) {
    return (
      <p className="p-3 text-sm text-muted" data-testid="ai-panel">
        Checking for an API key…
      </p>
    );
  }
  if (!keyStatus.set) {
    return (
      <div data-testid="ai-panel">
        <AiKeyMissing onOpenSettings={props.onOpenSettings} />
      </div>
    );
  }
  if (conversation === undefined) {
    return <div data-testid="ai-panel" />;
  }

  const running = isRunning(conversation);
  const limits = limitsFor(conversation);
  const items = conversation.changesetItems;
  const usedModel = model ?? settings.model;
  const pictures = draft.pictures ?? [];
  const canSend = !running && (draft.text.trim() !== '' || pictures.length > 0);
  /** Adds pictures to the draft, up to the most one message carries. */
  const addPictures = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    const room = AI_PICTURES_MAX - pictures.length;
    const { pictures: read, errors } = await readPictures(files.slice(0, Math.max(0, room)));
    const current = controller.draft();
    controller.setDraft({ ...current, pictures: [...(current.pictures ?? []), ...read] });
    setPictureError(
      errors.length > 0
        ? errors.join(' ')
        : files.length > room
          ? `At most ${AI_PICTURES_MAX} pictures go with one message.`
          : null,
    );
  };

  const send = () => {
    if (canSend) void controller.sendDraft();
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="AI helper" data-testid="ai-panel">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
        <fieldset className="m-0 inline-flex overflow-hidden rounded border border-border p-0">
          <legend className="sr-only">Mode</legend>
          {MODES.map((entry) => (
            <button
              key={entry.mode}
              type="button"
              className={modeClass}
              aria-pressed={conversation.mode === entry.mode}
              data-testid={`ai-mode-${entry.mode}`}
              title={entry.tip}
              disabled={running}
              onClick={() => controller.setMode(entry.mode)}
            >
              {entry.label}
            </button>
          ))}
        </fieldset>
        <span className="flex-1" />
        <AiLimitsPopover
          limits={limits}
          overridden={conversation.runLimits !== null}
          disabled={running}
          onChange={(next) => useAiStore.getState().setRunLimits(root, next)}
          onReset={() => useAiStore.getState().setRunLimits(root, null)}
        />
        <Button
          data-testid="ai-new-conversation"
          title="New conversation"
          aria-label="New conversation"
          disabled={applying}
          onClick={() => {
            if (conversation.changeset.isEmpty) void controller.newConversation();
            else setConfirmNew(true);
          }}
        >
          <MessageSquarePlus size={14} aria-hidden />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {conversation.messages.length === 0 && (
          <p className="text-sm text-muted" data-testid="ai-empty">
            {conversation.mode === 'build'
              ? 'Describe what to build, for example "a ruby tools mod with ore, ingot, tools and a storage block". The helper proposes a plan first; nothing changes until you apply.'
              : 'Ask about your project, a problem or an element. Proposed edits wait for your review; nothing changes until you apply.'}
          </p>
        )}
        <AiTranscript messages={conversation.messages} />
        {conversation.plan !== null && (
          <AiPlanView
            plan={conversation.plan}
            checkpoint={conversation.checkpoint}
            onDecide={(decision) => useAiStore.getState().resolvePlan(root, decision)}
            onCheckpoint={(decision) => useAiStore.getState().resolveCheckpoint(root, decision)}
          />
        )}
        {items.length > 0 && (
          <AiChangesetReview
            items={items}
            running={running}
            applying={applying}
            onToggle={(itemId, accepted) => {
              conversation.changeset.setAccepted(itemId, accepted);
              controller.markConflicts();
            }}
            onApply={() => void controller.apply()}
            onDiscard={() => controller.discard()}
          />
        )}
        <div ref={endRef} />
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border p-2">
        <AiUsageLine
          usage={conversation.usage}
          model={usedModel}
          checkedOn={modelInfo(usedModel).pricing.checkedOn}
        />
        {draft.context !== null && (
          <div
            className="flex flex-col gap-1 rounded border border-border bg-bg p-1.5 text-xs"
            data-testid="ai-context"
          >
            <span className="flex items-center gap-1">
              <span className="font-medium" data-testid="ai-context-label">
                {draft.context.label}
              </span>
              <span className="flex-1" />
              <button
                type="button"
                className={iconButtonClass}
                aria-label="Remove the context"
                data-testid="ai-context-remove"
                onClick={() => controller.setDraft({ ...draft, context: null })}
              >
                <X size={12} aria-hidden />
              </button>
            </span>
            <blockquote className="max-h-32 overflow-auto border-l-2 border-border pl-1.5 font-mono whitespace-pre-wrap text-muted">
              {draft.context.block}
            </blockquote>
          </div>
        )}
        {pictures.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="ai-pictures">
            {pictures.map((picture, index) => (
              <span
                key={`${picture.name}-${index}`}
                className="relative"
                data-testid={`ai-picture-${index}`}
              >
                <img
                  src={picture.url}
                  alt={`To send: ${picture.name}`}
                  className="h-14 max-w-24 rounded border border-border object-contain"
                />
                <button
                  type="button"
                  className={`${iconButtonClass} absolute -top-1 -right-1 bg-panel`}
                  aria-label={`Remove ${picture.name}`}
                  data-testid={`ai-picture-remove-${index}`}
                  onClick={() =>
                    controller.setDraft({
                      ...draft,
                      pictures: pictures.filter((_, other) => other !== index),
                    })
                  }
                >
                  <X size={10} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        {pictureError !== null && (
          <p role="alert" className="text-xs text-red-500">
            {pictureError}
          </p>
        )}
        <label htmlFor={inputId} className="sr-only">
          Message to the AI helper
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          className={`${fieldClass} min-h-16 resize-y`}
          data-testid="ai-input"
          placeholder={
            conversation.mode === 'build'
              ? 'What should the helper build?'
              : 'Ask the AI helper (Enter sends, Shift+Enter for a new line)'
          }
          value={draft.text}
          onChange={(event) => controller.setDraft({ ...draft, text: event.target.value })}
          onPaste={(event) => {
            const files = pictureFilesOf(event.clipboardData.files);
            if (files.length === 0) return;
            event.preventDefault();
            void addPictures(files);
          }}
          onDrop={(event) => {
            const files = pictureFilesOf(event.dataTransfer.files);
            if (files.length === 0) return;
            event.preventDefault();
            void addPictures(files);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="flex justify-end gap-1.5">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
            multiple
            hidden
            data-testid="ai-attach-input"
            onChange={(event) => {
              void addPictures(pictureFilesOf(event.target.files));
              event.target.value = '';
            }}
          />
          <Button
            data-testid="ai-attach"
            title="Attach a screenshot or picture (or paste one into the message)"
            disabled={running || pictures.length >= AI_PICTURES_MAX}
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={14} aria-hidden />
            Picture
          </Button>
          <span className="flex-1" />
          {running ? (
            <Button data-testid="ai-stop" onClick={() => void controller.stop()}>
              <Square size={14} aria-hidden />
              Stop
            </Button>
          ) : null}
          <Button data-testid="ai-send" disabled={!canSend} onClick={send}>
            <Send size={14} aria-hidden />
            Send
          </Button>
        </div>
      </div>
      {confirmNew && (
        <ConfirmDialog
          title="New conversation"
          message={`Start a new conversation? The ${items.length} proposed change${items.length === 1 ? ' is' : 's are'} discarded.`}
          confirmLabel="Start new conversation"
          onCancel={() => setConfirmNew(false)}
          onConfirm={() => {
            setConfirmNew(false);
            void controller.newConversation();
          }}
        />
      )}
    </section>
  );
}
