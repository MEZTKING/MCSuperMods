/**
 * The mock-up of a container's or machine's screen in Try it (ADR 0085 L11, B398). The game
 * opens vanilla's menus (ADR 0074 D1, ADR 0075 D4); the preview draws the same slots as plain
 * frames of its own (no Mojang picture), labelled "Mock-up": containers by their layout's rows
 * and columns, machines by the furnace's three slots. No item moves. Closing it (Close, Esc or
 * E) closes the screen in the simulation, which fires the container's `on_close`.
 *
 * Part of the lazy Try it chunk.
 */

import type { OpenScreen } from '@msm/sim';
import { ArrowRight, Flame, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** The label every mock-up screen carries (ADR 0085 L11). */
export const MOCK_UP_LABEL = 'Mock-up';
/** The line under the slots. */
export const MOCK_UP_NOTE = 'The game opens its own screen here. Items do not move in the preview.';

/** The words of a container layout. */
const LAYOUT_WORDS: Readonly<Record<string, string>> = {
  chest: 'chest screen',
  hopper: 'hopper screen',
  dispenser: 'dispenser screen',
};

/** The words of a machine menu. */
const MENU_WORDS: Readonly<Record<string, string>> = {
  furnace: 'furnace screen',
  blast_furnace: 'blast furnace screen',
  smoker: 'smoker screen',
};

/** What the screen stands for in words ("chest screen, 3 rows of 9"). */
export function screenWords(screen: Pick<OpenScreen, 'spec'>): string {
  const spec = screen.spec;
  if (spec.kind === 'machine') return MENU_WORDS[spec.menu] ?? `${spec.menu} screen`;
  if (spec.layout === 'chest') {
    const kind = spec.keepContents ? 'shulker box screen' : 'chest screen';
    return `${kind}, ${spec.rows} ${spec.rows === 1 ? 'row' : 'rows'} of 9`;
  }
  return LAYOUT_WORDS[spec.layout] ?? spec.layout;
}

function Slot(props: { label?: string; large?: boolean }) {
  return (
    <span
      data-testid="tryit-screen-slot"
      role="img"
      aria-label={props.label}
      title={props.label}
      className={`block rounded-sm border-2 border-t-black/50 border-r-white/40 border-b-white/40 border-l-black/50 bg-black/20 ${props.large === true ? 'size-11' : 'size-8'}`}
    />
  );
}

/** Props of {@link MockScreen}. */
export interface MockScreenProps {
  screen: OpenScreen;
  onClose(): void;
}

/** The mock-up screen; see the module comment. */
export function MockScreen({ screen, onClose }: MockScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  const spec = screen.spec;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${screen.displayName}: ${MOCK_UP_LABEL}`}
      data-testid="tryit-screen"
      data-screen={spec.kind === 'machine' ? 'machine' : spec.layout}
      tabIndex={-1}
      className="absolute top-1/2 left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded border border-border bg-panel p-3 text-sm shadow-lg outline-none"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' || event.code === 'KeyE') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <strong data-testid="tryit-screen-title">{screen.displayName}</strong>
        <span
          data-testid="tryit-screen-label"
          className="rounded border border-warning px-1 text-xs text-warning"
        >
          {MOCK_UP_LABEL}
        </span>
        <span className="ml-auto" />
        <button
          type="button"
          aria-label="Close"
          data-testid="tryit-screen-close"
          className="cursor-pointer text-muted hover:text-text"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted">Stands for the game's {screenWords(screen)}.</p>
      {spec.kind === 'container' ? (
        <div
          className="grid w-fit gap-0.5"
          style={{ gridTemplateColumns: `repeat(${spec.columns}, max-content)` }}
        >
          {Array.from({ length: spec.rows * spec.columns }, (_, index) => (
            <Slot key={index} label={`Slot ${index + 1}`} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center gap-1">
            <Slot label="Input" />
            <Flame
              size={16}
              aria-hidden
              className={spec.power === 'fuel' ? 'text-muted' : 'text-muted/40'}
            />
            <Slot label={spec.power === 'fuel' ? 'Fuel' : 'Fuel (not used)'} />
          </div>
          <ArrowRight size={22} aria-hidden className="text-muted" />
          <Slot label="Output" large />
          <ul className="text-xs text-muted">
            <li>Input, fuel and output</li>
            <li>
              {spec.power === 'fuel'
                ? 'Burns fuel'
                : spec.power === 'redstone'
                  ? 'Works with redstone power; no fuel'
                  : 'Always works; no fuel'}
            </li>
          </ul>
        </div>
      )}
      <p className="text-xs text-muted">{MOCK_UP_NOTE}</p>
    </div>
  );
}
