import { DEFAULT_AI_SETTINGS, modelInfo } from '@msm/ai';
import { ChevronDown, ChevronRight, ImagePlus, MessageSquarePlus, Send, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { AiPlatform } from '../../../../shared/platform';
import {
  type AiAppliedStep,
  type AiConversation,
  type AiDisplayMessage,
  isRunning,
  latestPlan,
  limitsFor,
  useAiStore,
} from '../../store/ai-store';
import { usePreferences } from '../../store/preferences';
import { useUiStore } from '../../store/ui-store';
import { ConfirmDialog } from '../ConfirmDialog';
import { fieldClass } from '../NewElementDialog';
import { Button, iconButtonClass } from '../ui/Button';
import { AiChangesetReview, canApply } from './AiChangesetReview';
import { AiKeyMissing } from './AiKeyMissing';
import { AiLimitsPopover } from './AiLimitsPopover';
import { AiPlanView } from './AiPlanView';
import { AiStatusLine, PRIMARY_BUTTON_CLASS, useStatusClock } from './AiStatusLine';
import { AiTranscript, rememberContextLabel } from './AiTranscript';
import { AiUsageLine } from './AiUsageLine';
import {
  type AiContextDraft,
  type AiController,
  EMPTY_DRAFT,
  useAiPanelStore,
} from './ai-controller';
import { AI_PICTURES_MAX, pictureFilesOf, readPictures } from './ai-pictures';
import {
  type AiStatus,
  type AiStatusAction,
  conversationStatus,
  WORKING_STATES,
} from './ai-status';
import { type AiActionWords, count, reviewHeading, type UiMode, wordsFor } from './ai-words';

/**
 * The panel's own words beside `ai-words.ts`, per mode (ADR 0125 D13): the parts of the panel
 * that are not the conversation's (the message box's helpers, New chat's question, the tray's
 * toggle and Throw away's question). `ai-plain-words.test.tsx` sweeps them with the rest.
 */
export interface AiPanelWords {
  readonly inputLabel: string;
  /** The message box's hint while a plan waits ("go" makes it). */
  readonly answerPlan: string;
  /** The message box's hint while a step waits. */
  readonly answerStep: string;
  readonly picture: string;
  readonly pictureTip: string;
  readonly newBelow: string;
  readonly newChatTitle: string;
  newChatQuestion(changes: number): string;
  readonly newChatConfirm: string;
  /** The tray's heading when its changes hold no thing of their own. */
  changesHeading(changes: number): string;
  readonly throwAwayTitle: string;
  throwAwayQuestion(changes: number): string;
}

const PLAIN_PANEL: AiPanelWords = Object.freeze({
  inputLabel: 'Message to the helper',
  answerPlan: 'Type go to make all of it, or say what should be different',
  answerStep: 'Type stop to stop here, or anything else to keep going',
  picture: 'Picture',
  pictureTip: 'Add a screenshot or picture (or paste one into the message)',
  newBelow: 'New below',
  newChatTitle: 'New chat',
  newChatQuestion: () => 'Start a new chat? What is waiting to be added is thrown away.',
  newChatConfirm: 'Start a new chat',
  changesHeading: (changes: number) => `Ready to add: ${count(changes, 'change')}`,
  throwAwayTitle: 'Throw away',
  throwAwayQuestion: () => 'Throw all of it away? Nothing has been added to your mod.',
});

const PANEL_WORDS: Readonly<Record<UiMode, AiPanelWords>> = Object.freeze({
  'very-easy': PLAIN_PANEL,
  easy: PLAIN_PANEL,
  advanced: Object.freeze({
    ...PLAIN_PANEL,
    inputLabel: 'Message to the AI helper',
    pictureTip: 'Attach a screenshot or picture (or paste one into the message)',
    newChatQuestion: (changes: number) =>
      `Start a new conversation? The ${count(changes, 'proposed change')} ${changes === 1 ? 'is' : 'are'} discarded.`,
    newChatConfirm: 'Start new conversation',
    changesHeading: (changes: number) => `Proposed changes (${count(changes, 'change')})`,
    throwAwayTitle: 'Discard proposed changes',
    throwAwayQuestion: (changes: number) =>
      `Discard all ${count(changes, 'proposed change')}? Nothing has been applied to the project.`,
  }),
});

/** The panel's own words in `mode`. */
export function panelWordsFor(mode: UiMode): AiPanelWords {
  return PANEL_WORDS[mode];
}

/** Which part of the panel holds the one primary button (ADR 0125 D1). */
export type AiPrimary = 'status' | 'tray' | 'send' | 'plan';

/**
 * The one primary button: a waiting plan or step owns it (the plan's own buttons, B686); with
 * the tray open the tray's **Add to my mod**; else the state line's action when it shows one;
 * else **Send**.
 */
export function primaryOf(status: AiStatus, trayOpen: boolean, actionShown: boolean): AiPrimary {
  if (status.state === 'your-turn-plan' || status.state === 'your-turn-step') return 'plan';
  if (status.state === 'ready' && trayOpen) return 'tray';
  return actionShown ? 'status' : 'send';
}

/** The changes do something other than add (Make these changes rather than Add to my mod). */
function changesExisting(items: AiConversation['changesetItems']): boolean {
  return items.some((item) => item.op === 'update' || item.op === 'delete' || item.op === 'rename');
}

/** The words of the context chip (ADR 0125 D11). */
export const CONTEXT_CHIP_WORDS = Object.freeze({
  remove: 'Remove the context',
  show: 'See exactly what is sent',
  hide: 'Hide what is sent',
});

/**
 * The context waiting in the input area: its label, a remove button and the block that goes with
 * the message. In Advanced the block shows as before; in Very easy and Easy it is folded under
 * **See exactly what is sent** and is not in the page until opened.
 */
function ContextChip(props: { context: AiContextDraft; mode: UiMode; onRemove(): void }) {
  const { context, mode } = props;
  const [open, setOpen] = useState(false);
  const shown = mode === 'advanced' || open;
  return (
    <div
      className="flex flex-col gap-1 rounded border border-border bg-bg p-1.5 text-xs"
      data-testid="ai-context"
    >
      <span className="flex items-center gap-1">
        <span className="font-medium" data-testid="ai-context-label">
          {context.label}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={iconButtonClass}
          aria-label={CONTEXT_CHIP_WORDS.remove}
          data-testid="ai-context-remove"
          onClick={props.onRemove}
        >
          <X size={12} aria-hidden />
        </button>
      </span>
      {mode !== 'advanced' && (
        <button
          type="button"
          className="cursor-pointer self-start text-accent underline"
          aria-expanded={open}
          data-testid="ai-context-show"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? CONTEXT_CHIP_WORDS.hide : CONTEXT_CHIP_WORDS.show}
        </button>
      )}
      {shown && (
        <blockquote
          className="max-h-32 overflow-auto border-l-2 border-border pl-1.5 font-mono whitespace-pre-wrap text-muted"
          data-testid="ai-context-block"
        >
          {context.block}
        </blockquote>
      )}
    </div>
  );
}

type PlanMessage = Extract<AiDisplayMessage, { role: 'plan' }>;
type NoticeMessage = Extract<AiDisplayMessage, { role: 'notice' }>;

/**
 * How often the state line's clock is read while the helper works. The seconds count from the
 * turn's start, which comes after the run's: read once a second from the run's start, the line
 * could stay at "0 s" for almost two seconds (B690's walk). A quarter second keeps each new
 * second within 250 ms of when it begins.
 */
const STATUS_TICK_MS = 250;

/** How far from the newest entry the user may scroll and still be followed, in pixels. */
const FOLLOW_SLACK = 24;

/**
 * Where the conversation is scrolled to show its newest entry: the bottom, or the newest
 * entry's top when it is taller than the view (so its start stays in view; ADR 0125 F1).
 */
function newestTop(scroller: HTMLElement): number {
  const entries = scroller.querySelectorAll<HTMLElement>('[data-entry]');
  const bottom = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const last = entries[entries.length - 1];
  if (last === undefined) return bottom;
  const top =
    last.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  return Math.max(0, Math.min(bottom, top - 4));
}

/**
 * The AI helper panel (ADR 0125 D1, D2, D13; ADR 0041 D8): a New chat button, the conversation
 * (the empty state with four example asks, then the transcript with each plan where it was
 * proposed), the tray of waiting changes fixed between the conversation and the message box
 * (closed to its heading and two buttons, opened by **Look**), the state line saying what is
 * happening and whose turn it is, the cost line and the message box, which stays usable while a
 * plan or step waits (typing answers it). Without a key it shows the set-up card. The words
 * follow the view mode of the preferences store; there is no Chat or Build switch.
 *
 * Show me, Undo and Put back are offered only when the host passes their handlers (B689).
 */
export function AiPanel(props: {
  controller: AiController;
  onOpenSettings(): void;
  /** Main's AI services for the set-up card; default the preload bridge's. */
  ai?: AiPlatform | undefined;
  /** Shows what an Apply made (B689); without it Show me is not offered. */
  onShowMe?(step: AiAppliedStep): void;
  /** The session's Undo (B689); without it Undo is not offered on a notice. */
  onUndo?(): void;
  /** The session's Redo (B689); without it Put back is not offered. */
  onRedo?(): void;
}) {
  const { controller } = props;
  const mode = usePreferences((state) => state.mode);
  const words = wordsFor(mode);
  const panelWords = panelWordsFor(mode);
  const root = useUiStore((state) => state.snapshot?.root ?? null) ?? controller.root;
  const project = useUiStore((state) => state.snapshot?.project ?? null);
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
  const [confirmThrow, setConfirmThrow] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Whether the conversation follows its newest entry (until the user scrolls up). */
  const follow = useRef(true);
  /** Where the panel last scrolled to itself (a scroll event there must not stop following). */
  const ownTop = useRef<number | null>(null);
  const signature = useRef('');
  const [pictureError, setPictureError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  const working =
    conversation !== undefined && WORKING_STATES.has(conversationStatus(conversation).state);
  const now = useStatusClock(working, STATUS_TICK_MS);

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

  const itemCount = conversation?.changesetItems.length ?? 0;
  useEffect(() => {
    if (itemCount === 0) setTrayOpen(false);
  }, [itemCount]);

  const scrollToNewest = () => {
    const scroller = scrollRef.current;
    follow.current = true;
    setNewBelow(false);
    if (scroller === null) return;
    const top = newestTop(scroller);
    if (Math.abs(scroller.scrollTop - top) > 1) {
      ownTop.current = top;
      scroller.scrollTop = top;
    }
  };

  // Follows the newest entry (a new answer, a plan, a notice) unless the user has scrolled up;
  // then "New below" says there is more (ADR 0125 F1).
  const messages = conversation?.messages ?? [];
  const last = messages[messages.length - 1];
  const nextSignature = [
    messages.length,
    last === undefined ? '' : last.role,
    last?.role === 'assistant' ? last.text.length + last.thinking.length : '',
    last?.role === 'tool' ? last.status : '',
    messages
      .filter((message) => message.role === 'plan')
      .map((message) => `${message.state.status}${message.closed ? 'c' : ''}`)
      .join(''),
    itemCount,
    trayOpen,
  ].join(':');
  useLayoutEffect(() => {
    if (signature.current === nextSignature) return;
    const sent = last?.role === 'user';
    signature.current = nextSignature;
    if (follow.current || sent) scrollToNewest();
    else setNewBelow(true);
  });

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
        <AiKeyMissing
          onOpenSettings={props.onOpenSettings}
          ai={props.ai}
          onReady={() => void controller.refresh()}
        />
      </div>
    );
  }
  if (conversation === undefined) {
    return <div data-testid="ai-panel" />;
  }

  const status = conversationStatus(conversation, now);
  const running = isRunning(conversation);
  const awaiting = controller.awaitsAnswer();
  const size = draft.size ?? 'chat';
  const limits = limitsFor(conversation, size);
  const items = conversation.changesetItems;
  const usedModel = model ?? settings.model;
  const pictures = draft.pictures ?? [];
  const canSend = awaiting
    ? draft.text.trim() !== ''
    : !running && (draft.text.trim() !== '' || pictures.length > 0);

  /** Actions this panel cannot carry out, or that another place shows. */
  const hidden = new Set<AiStatusAction>();
  if (props.onShowMe === undefined) hidden.add('show-me');
  if (props.onUndo === undefined) hidden.add('undo');
  if (props.onRedo === undefined) hidden.add('put-back');
  if (trayOpen) hidden.add('look');
  const actionShown = status.action !== null && !hidden.has(status.action);
  const primary = primaryOf(status, trayOpen, actionShown);

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
    if (!canSend) return;
    follow.current = true;
    if (draft.context !== null) rememberContextLabel(draft.context.block, draft.context.label);
    void controller.sendDraft();
  };

  const newChat = () => {
    if (conversation.changeset.isEmpty) void controller.newConversation();
    else setConfirmNew(true);
  };

  const showPlan = () => {
    const scroller = scrollRef.current;
    const entries = scroller?.querySelectorAll<HTMLElement>(
      '[data-role="plan"][data-closed="false"]',
    );
    const entry = entries?.[entries.length - 1];
    if (scroller == null || entry === undefined) return;
    scroller.scrollTop =
      entry.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  };

  /** Carries out a state line's or a notice's action; `step` is the notice's Apply step. */
  const act = (action: AiStatusAction, step: AiAppliedStep | undefined) => {
    switch (action) {
      case 'stop':
        void controller.stop();
        return;
      case 'show-plan':
        showPlan();
        return;
      case 'look':
        setTrayOpen(true);
        return;
      case 'keep-going':
        follow.current = true;
        void controller.keepGoing();
        return;
      case 'try-again':
        follow.current = true;
        void controller.tryAgain();
        return;
      case 'check-key':
        props.onOpenSettings();
        return;
      case 'new-chat':
        newChat();
        return;
      case 'show-me':
        if (step !== undefined) props.onShowMe?.(step);
        return;
      case 'undo':
        props.onUndo?.();
        return;
      case 'put-back':
        props.onRedo?.();
        return;
    }
  };

  /** A notice's buttons: what the panel can do, less what the state line offers already. */
  const noticeActions = (notice: NoticeMessage, actions: readonly AiActionWords[]) => {
    if (notice.applied === undefined) return [];
    const current = status.applied === notice.applied ? status.action : null;
    return actions.filter((action) => !hidden.has(action.id) && action.id !== current);
  };

  const renderPlan = (message: PlanMessage) => {
    const plan = message.state;
    const latest = latestPlan(conversation) === plan;
    return (
      <AiPlanView
        plan={plan}
        checkpoint={latest && !message.closed ? conversation.checkpoint : null}
        mode={mode}
        conversation={conversation}
        project={project}
        closed={message.closed}
        onDecide={(decision) => useAiStore.getState().resolvePlan(root, decision)}
        onCheckpoint={(decision) => useAiStore.getState().resolveCheckpoint(root, decision)}
      />
    );
  };

  const things = status.things;
  const trayHeading =
    mode !== 'advanced' && things === 0
      ? panelWords.changesHeading(items.length)
      : reviewHeading(
          {
            things,
            files: items.length,
            kept: items.filter((item) => item.accepted).length,
            total: items.length,
          },
          mode,
        );
  const addLabel = changesExisting(items) ? words.review.makeChanges : words.review.add;

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="AI helper" data-testid="ai-panel">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-2">
        <span className="flex-1" />
        {mode === 'advanced' && (
          <AiLimitsPopover
            limits={limits}
            overridden={conversation.runLimits !== null}
            disabled={running}
            onChange={(next) => useAiStore.getState().setRunLimits(root, next)}
            onReset={() => useAiStore.getState().setRunLimits(root, null)}
            mode={mode}
          />
        )}
        <Button data-testid="ai-new-conversation" disabled={applying} onClick={newChat}>
          <MessageSquarePlus size={14} aria-hidden />
          {words.newChat}
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2"
        data-testid="ai-conversation"
        onScroll={() => {
          const scroller = scrollRef.current;
          if (scroller === null) return;
          const own = ownTop.current;
          ownTop.current = null;
          if (own !== null && Math.abs(scroller.scrollTop - own) <= 1) return;
          follow.current = scroller.scrollTop >= newestTop(scroller) - FOLLOW_SLACK;
          if (follow.current) setNewBelow(false);
        }}
      >
        {conversation.messages.length === 0 && (
          <div className="flex flex-col gap-2 text-sm" data-testid="ai-empty">
            <p className="font-semibold">{words.emptyTitle}</p>
            <p className="text-muted">{words.emptyBody}</p>
            {words.emptyExtra !== null && <p className="text-muted">{words.emptyExtra}</p>}
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {words.examples.map((example, index) => (
                <li key={example.text}>
                  <button
                    type="button"
                    className="w-full cursor-pointer rounded border border-border px-2 py-1 text-left hover:border-accent"
                    data-testid={`ai-example-${index}`}
                    onClick={() => {
                      controller.setDraft({ ...draft, text: example.text, size: example.size });
                      inputRef.current?.focus();
                    }}
                  >
                    {example.text}
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted" data-testid="ai-not-saved">
              {words.notSaved}
            </p>
          </div>
        )}
        <AiTranscript
          messages={conversation.messages}
          mode={mode}
          renderPlan={renderPlan}
          noticeActions={noticeActions}
          onNoticeAction={(notice, action) => act(action, notice.applied)}
        />
        {newBelow && (
          <div className="sticky bottom-0 flex justify-center">
            <Button data-testid="ai-new-below" className="shadow" onClick={scrollToNewest}>
              <ChevronDown size={14} aria-hidden />
              {panelWords.newBelow}
            </Button>
          </div>
        )}
      </div>
      {items.length > 0 && (
        <div
          className="flex max-h-[50%] min-h-0 flex-col gap-1.5 overflow-y-auto border-t border-border p-2"
          data-testid="ai-tray"
          data-open={trayOpen ? 'true' : 'false'}
        >
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1 text-left text-sm font-semibold"
            aria-expanded={trayOpen}
            data-testid="ai-tray-toggle"
            onClick={() => setTrayOpen((open) => !open)}
          >
            {trayOpen ? (
              <ChevronDown size={14} aria-hidden />
            ) : (
              <ChevronRight size={14} aria-hidden />
            )}
            {trayHeading}
          </button>
          {trayOpen ? (
            <AiChangesetReview
              items={items}
              running={running}
              applying={applying}
              primary={primary === 'tray'}
              onToggle={(itemId, accepted) => {
                conversation.changeset.setAccepted(itemId, accepted);
                controller.markConflicts();
              }}
              onApply={() => void controller.apply()}
              onDiscard={() => controller.discard()}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <Button
                data-testid="ai-apply"
                data-primary="false"
                disabled={!canApply(items) || running || applying}
                onClick={() => void controller.apply()}
              >
                {addLabel}
              </Button>
              <Button
                data-testid="ai-discard"
                disabled={applying}
                onClick={() => setConfirmThrow(true)}
              >
                {words.review.throwAway}
              </Button>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-1.5 border-t border-border p-2">
        <AiStatusLine
          status={status}
          mode={mode}
          primary={primary === 'status'}
          hidden={hidden}
          onAction={(action) => act(action, status.applied)}
        />
        {draft.context !== null && (
          <ContextChip
            key={draft.context.block}
            context={draft.context}
            mode={mode}
            onRemove={() => controller.setDraft({ ...draft, context: null })}
          />
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
          {panelWords.inputLabel}
        </label>
        <textarea
          id={inputId}
          ref={inputRef}
          className={`${fieldClass} min-h-16 resize-y`}
          data-testid="ai-input"
          placeholder={
            status.state === 'your-turn-plan'
              ? panelWords.answerPlan
              : status.state === 'your-turn-step'
                ? panelWords.answerStep
                : words.inputPlaceholder
          }
          value={draft.text}
          onChange={(event) => {
            const text = event.target.value;
            const { size: _size, ...rest } = draft;
            controller.setDraft(text === '' ? { ...rest, text } : { ...draft, text });
          }}
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
        <div className="flex items-center gap-1.5">
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
            title={panelWords.pictureTip}
            disabled={running || pictures.length >= AI_PICTURES_MAX}
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={14} aria-hidden />
            {panelWords.picture}
          </Button>
          <span className="flex-1" />
          <Button
            data-testid="ai-send"
            data-primary={primary === 'send' ? 'true' : 'false'}
            className={primary === 'send' ? PRIMARY_BUTTON_CLASS : undefined}
            disabled={!canSend}
            onClick={send}
          >
            <Send size={14} aria-hidden />
            {words.send}
          </Button>
        </div>
        <AiUsageLine
          usage={conversation.usage}
          model={usedModel}
          checkedOn={modelInfo(usedModel).pricing.checkedOn}
          mode={mode}
        />
      </div>
      {confirmNew && (
        <ConfirmDialog
          title={panelWords.newChatTitle}
          message={panelWords.newChatQuestion(items.length)}
          confirmLabel={panelWords.newChatConfirm}
          onCancel={() => setConfirmNew(false)}
          onConfirm={() => {
            setConfirmNew(false);
            void controller.newConversation();
          }}
        />
      )}
      {confirmThrow && (
        <ConfirmDialog
          title={panelWords.throwAwayTitle}
          message={panelWords.throwAwayQuestion(items.length)}
          confirmLabel={words.review.throwAway}
          onCancel={() => setConfirmThrow(false)}
          onConfirm={() => {
            setConfirmThrow(false);
            controller.discard();
          }}
        />
      )}
    </section>
  );
}
