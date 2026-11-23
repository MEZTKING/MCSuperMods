/**
 * **More options** (ADR 0130 D3): the one disclosure that holds the rarer settings of a section,
 * its ids and raw values. It sits at the bottom of a section, opens in place, remembers its
 * state per section on this computer (local storage, `msm.more-options.v1`) and is a plain
 * button with `aria-expanded` over a labelled region, so keyboards and screen readers reach it.
 *
 * The app is plain by default (D2): {@link PlainContext} is `true` everywhere but inside an
 * open More options, where fields may show ids (an id field shows the id itself, a rule its
 * key). {@link InMore} sends a part of a section (an id field's raw id, a field only experts
 * need) into the More options of the section it sits in, through {@link MoreSlotContext}.
 *
 * @packageDocumentation
 */

import { ChevronDown, ChevronRight } from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Whether the view around a component is plain (ADR 0130 D2): `true` everywhere but inside an
 * open More options, where ids and raw values may show.
 */
export const PlainContext = createContext(true);

/** Whether the view here is plain (no ids, no raw values). */
export function usePlain(): boolean {
  return useContext(PlainContext);
}

const STORAGE_KEY = 'msm.more-options.v1';

/** The remembered states, by section key. */
function readStates(): Record<string, boolean> {
  try {
    const text = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (text === null || text === undefined) return {};
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

/** Remembers whether the More options of `key` is open (ignored when storage fails). */
export function rememberMoreOptions(key: string, open: boolean): void {
  try {
    const states = readStates();
    states[key] = open;
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    // Storage is unavailable: the state lasts while the section is shown.
  }
}

/** The remembered state of `key`, or `undefined` when it was never opened or closed. */
export function rememberedMoreOptions(key: string): boolean | undefined {
  const value = readStates()[key];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Whether a More options never opened or closed starts open: only in end-to-end runs that ask
 * for it (`MSM_E2E_MORE_OPTIONS=open`, through the preload's `moreOptionsOpen`), so the tests
 * written before ADR 0130 find every field; people always start with it closed.
 */
function startsOpen(): boolean {
  return typeof window !== 'undefined' && window.msmMoreOptionsOpen === true;
}

/** Props of {@link MoreOptions}. */
export interface MoreOptionsProps {
  /** The key its state is remembered by (a section's test id); also names its test ids. */
  storageKey: string;
  children?: ReactNode;
  /** The button's words; "More options" by default. */
  label?: string;
  /**
   * Whether an end-to-end run that opens every More options opens this one too (default
   * `true`); `false` for heavy contents (the whole raw text, every setting).
   */
  autoOpen?: boolean;
  /** Holds it open while `true` (a command asked for what it holds); else it is the user's. */
  open?: boolean;
  /** Called with each new state the user picks. */
  onOpenChange?(open: boolean): void;
}

/**
 * The More options disclosure: a button, then its contents while open (not rendered while
 * closed). Test ids: `more-options-<key>` (the button), `more-options-<key>-content`.
 */
export function MoreOptions({
  storageKey,
  children,
  label = 'More options',
  autoOpen = true,
  open: held,
  onOpenChange,
}: MoreOptionsProps) {
  const [own, setOwn] = useState(
    () => rememberedMoreOptions(storageKey) ?? (autoOpen && startsOpen()),
  );
  const open = held === true || own;
  const contentId = useId();
  const toggle = (): void => {
    const next = !open;
    setOwn(next);
    rememberMoreOptions(storageKey, next);
    onOpenChange?.(next);
  };
  return (
    <div className="flex flex-col gap-2" data-more-options={storageKey}>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-1 self-start rounded px-1 py-0.5 font-medium text-accent text-xs underline-offset-2 hover:underline"
        aria-expanded={open}
        aria-controls={contentId}
        data-testid={`more-options-${storageKey}`}
        onClick={toggle}
      >
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        {label}
      </button>
      <section
        id={contentId}
        aria-label={label}
        hidden={!open}
        data-testid={`more-options-${storageKey}-content`}
        className="flex flex-col gap-2 border-border border-l-2 border-dashed pl-2"
      >
        {open && <PlainContext.Provider value={false}>{children}</PlainContext.Provider>}
      </section>
    </div>
  );
}

/** What a section hands {@link InMore}: where its More options shows, and a counter. */
export interface MoreSlot {
  /** The element inside the open More options; `null` while it is closed. */
  readonly slot: HTMLElement | null;
  /** Counts one part waiting for the More options (so the section shows it); returns the undo. */
  register(): () => void;
}

/** The More options of the section around a component; `null` outside a section. */
export const MoreSlotContext = createContext<MoreSlot | null>(null);

/**
 * Puts `children` in the More options of the section it sits in (ADR 0130 D3): shown only while
 * that More options is open, with ids allowed. Inside a More options already it renders in
 * place; outside any section it gets a More options of its own (`fallbackKey`), so it is never
 * hidden for good.
 */
export function InMore({ children, fallbackKey }: { children: ReactNode; fallbackKey?: string }) {
  const plain = usePlain();
  const more = useContext(MoreSlotContext);
  const register = more?.register;
  useEffect(() => {
    if (!plain || register === undefined) return undefined;
    return register();
  }, [plain, register]);
  if (!plain) return <>{children}</>;
  if (more === null) {
    return <MoreOptions storageKey={fallbackKey ?? 'more'}>{children}</MoreOptions>;
  }
  if (more.slot === null) return null;
  return createPortal(
    <PlainContext.Provider value={false}>{children}</PlainContext.Provider>,
    more.slot,
  );
}
