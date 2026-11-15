/**
 * The sign editor mock-up (B463, ADR 0101 D5 "sign text as a mock-up"): opens when a sign is
 * placed or used, as the game's edit screen does, with four lines for the side the player looks
 * at, the dye colour, glowing ink and wax (honeycomb). Done writes the text into the simulation;
 * Esc closes it unchanged. The game draws its own screen and the text on the board; the preview
 * keeps the words and shows them on a plaque ({@link SignPlaque}).
 *
 * Part of the lazy Try it chunk.
 */

import { SIGN_LINE_LENGTH, SIGN_LINES, type SignEditing, type SignText } from '@msm/sim';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';

/** The dye colours a sign's text takes (the game's sixteen). */
export const SIGN_COLOURS = Object.freeze([
  'black',
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
] as const);

/** A dye colour in plain words: `light_blue` to "Light blue". */
export const colourWords = (colour: string): string => {
  const words = colour.replaceAll('_', ' ');
  return (words[0] ?? '').toUpperCase() + words.slice(1);
};

/** What the editor hands back. */
export interface SignWrite {
  readonly lines: readonly string[];
  readonly colour: string;
  readonly glowing: boolean;
  readonly wax: boolean;
}

/** Props of {@link SignEditor}. */
export interface SignEditorProps {
  readonly editing: SignEditing;
  readonly text: SignText;
  onDone(write: SignWrite): void;
  onClose(): void;
}

/** The editor; see the module comment. */
export function SignEditor({ editing, text, onDone, onClose }: SignEditorProps) {
  const face = text[editing.side];
  const [lines, setLines] = useState<string[]>(() =>
    Array.from({ length: SIGN_LINES }, (_, i) => face.lines[i] ?? ''),
  );
  const [colour, setColour] = useState(face.colour);
  const [glowing, setGlowing] = useState(face.glowing);
  const [wax, setWax] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  const done = (): void => onDone({ lines, colour, glowing, wax });
  return (
    <div
      role="dialog"
      aria-label={`Write on ${editing.displayName}`}
      data-testid="tryit-sign-editor"
      data-side={editing.side}
      className="absolute top-1/2 left-1/2 z-30 flex w-80 -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded border border-border bg-panel p-3 text-sm shadow-lg"
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-2">
        <strong>{editing.displayName}</strong>
        <span className="rounded border border-warning px-1 text-xs text-warning">Mock-up</span>
        <span className="text-xs text-muted">
          {editing.side === 'front' ? 'Front' : 'Back'}
          {editing.hanging ? ', hanging sign' : ''}
        </span>
        <span className="ml-auto" />
        <button
          type="button"
          aria-label="Close"
          data-testid="tryit-sign-close"
          className="cursor-pointer text-muted hover:text-text"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <form
        className="flex flex-col gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          done();
        }}
      >
        {lines.map((line, index) => (
          <input
            // The four lines keep their places.
            key={index}
            ref={index === 0 ? first : undefined}
            aria-label={`Line ${index + 1}`}
            data-testid={`tryit-sign-line-${index + 1}`}
            value={line}
            maxLength={SIGN_LINE_LENGTH}
            className="rounded border border-border bg-bg px-2 py-1 text-center"
            onChange={(event) => {
              const next = [...lines];
              next[index] = event.target.value;
              setLines(next);
            }}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="flex items-center gap-1">
            Colour
            <select
              data-testid="tryit-sign-colour"
              value={colour}
              className="rounded border border-border bg-bg px-1"
              onChange={(event) => setColour(event.target.value)}
            >
              {SIGN_COLOURS.map((one) => (
                <option key={one} value={one}>
                  {colourWords(one)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="tryit-sign-glow"
              checked={glowing}
              onChange={(event) => setGlowing(event.target.checked)}
            />
            Glowing
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid="tryit-sign-wax"
              checked={wax}
              onChange={(event) => setWax(event.target.checked)}
            />
            Wax it
          </label>
        </div>
        <p className="text-xs text-muted">
          The game opens its own screen and draws the words on the board.
        </p>
        <div className="flex justify-end">
          <Button type="submit" data-testid="tryit-sign-done">
            Done
          </Button>
        </div>
      </form>
    </div>
  );
}
