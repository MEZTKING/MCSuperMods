/**
 * "Make with AI" (ADR 0093 D5): a description prefilled from the thing's name, kind and theme
 * (editable), the style ("Minecraft block texture", "Item icon", "Tool"), the size, and
 * "Make 4": four pictures from the chosen service, each shown before and after the clean-up.
 * Picking one hands its cleaned-up PNG to the host, which writes it as one undoable step. A
 * running request can be cancelled.
 *
 * Since 2026-11-22 (the user's "be more exact"):
 * - The prompt is never the bare description: MSM reads what the thing is (its slot: helmet,
 *   chestplate, sword, ore, planks…; `prompt.ts`) and adds the Minecraft view, the silhouette
 *   and what the picture must only be, and the main colour's words. The exact words sent are
 *   shown under the description.
 * - MSM's own drawing of the slot in the main colour (the art generator, ADR 0092) is the
 *   reference the service starts from and the shape every picture is checked against, with the
 *   colour and, for block faces, the seams (`checks.ts`). Pictures that fail are left out; when
 *   all fail, one more round with stronger words; when those fail too, MSM's drawing is shown
 *   with a plain line. **Use MSM's drawing** is always beside **Try again**.
 * - The price of the round is asked before every request (Retro Diffusion's free `check_cost`).
 * - A field made for something other than a square texture (a mob skin, a painting, a pattern,
 *   a particle) passes its `shape`, which fixes the style and size and lays the picture out.
 *
 * Test ids: `ai-pictures-dialog`, `ai-pictures-prompt`, `ai-pictures-sent`,
 * `ai-pictures-colour`, `ai-pictures-style-<style>`, `ai-pictures-size`,
 * `ai-pictures-generate`, `ai-pictures-cancel`, `ai-pictures-status`, `ai-pictures-error`,
 * `ai-pictures-note`, `ai-pictures-result-<n>`, `ai-pictures-before-<n>`,
 * `ai-pictures-after-<n>`, `ai-pictures-seam-<n>`, `ai-pictures-use`,
 * `ai-pictures-use-drawing`, `ai-pictures-close`, `ai-pictures-cost`, `ai-pictures-shape`.
 *
 * @packageDocumentation
 */

import { Sparkles } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AI_PICTURE_SERVICE_INFO,
  AI_PICTURE_STYLE_LABELS,
  AI_PICTURE_STYLES,
  AI_PICTURES_MAX_COUNT,
  AI_PICTURES_PROMPT_MAX,
  type AiPictureCost,
  type AiPictureStyle,
  isSquareStyle,
} from '../../../../shared/ai-pictures';
import { fieldClass } from '../NewElementDialog';
import { imageDataUrl } from '../texture-editor/png-canvas';
import { Button } from '../ui/Button';
import type { AiPicturesHost } from './ai-pictures-host';
import {
  type AiCandidate,
  type AiGuard,
  type AiRound,
  AiRoundError,
  canvasCodec,
  costWords,
  paletteRaster,
  roundCost,
  runCheckedRound,
  runRound,
} from './generate';
import { colourWords, slotOf, slotPromptParts, wordsOf } from './prompt';
import type { DrawnReference } from './reference';
import type { AiPictureShape } from './shapes';

/** Props of {@link MakeWithAiDialog}. */
export interface MakeWithAiDialogProps {
  host: AiPicturesHost;
  /** What is being made, for the title: "ruby_mod:textures/item/ruby.png". */
  target: string;
  defaultPrompt: string;
  defaultStyle: AiPictureStyle;
  /** The texture's edge (16 or 32). */
  size: number;
  /** The largest edge allowed (smaller sizes only); absent: 16 and 32. */
  maxSize?: number;
  /**
   * What the picture is made for when it is not a square texture of 16 or 32 (`shapes.ts`):
   * fixes the style and the size, and lays the cleaned picture out.
   */
  shape?: AiPictureShape;
  /** The thing's main colour when the field knows it (the flow's colour). */
  colour?: readonly [number, number, number];
  /** Writes the picked picture; rejects with a message when it cannot. */
  onPick(bytes: Uint8Array): Promise<void> | void;
  onClose(): void;
}

const SIZES = [16, 32] as const;

/** The main colour when the field gives none: a plain iron grey. */
export const DEFAULT_AI_COLOUR: readonly [number, number, number] = Object.freeze([
  190, 190, 196,
]) as readonly [number, number, number];

/** The sizes offered: 16 and 32, those up to `maxSize`, or `maxSize` itself when smaller. */
export function sizesUpTo(maxSize: number | undefined, size: number): number[] {
  if (maxSize === undefined) return [...SIZES];
  const allowed = SIZES.filter((value) => value <= maxSize);
  return allowed.length > 0 ? allowed : [Math.max(1, Math.min(size, maxSize))];
}

function paletteProps(palette: AiGuard['palette']): Pick<AiGuard, 'palette'> {
  return palette === undefined ? {} : { palette };
}

function toHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function fromHex(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const value = Number.parseInt(match[1] as string, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * The prompt the dialog sends: the colour's words and the description, then, when MSM knows
 * the slot, the slot's Minecraft words (`slotPromptParts`); the slot's noun is added when the
 * description does not name it.
 */
export function dialogPrompt(
  description: string,
  slotName: string,
  style: AiPictureStyle,
  colour: readonly [number, number, number] | undefined,
  strong = false,
): string {
  const slot = slotOf(slotName, style) ?? slotOf(description, style);
  const words = description.trim();
  const colourWord = colour === undefined ? '' : colourWords(colour);
  const subject = [
    colourWord !== '' && !words.toLowerCase().includes(colourWord) ? colourWord : '',
    words,
    slot !== undefined && !wordsOf(words).includes(slot.noun) ? slot.noun : '',
  ]
    .filter((part) => part !== '')
    .join(' ');
  if (slot === undefined) return subject.slice(0, AI_PICTURES_PROMPT_MAX);
  return [subject, ...slotPromptParts(slot, strong)].join(', ').slice(0, AI_PICTURES_PROMPT_MAX);
}

export function MakeWithAiDialog(props: MakeWithAiDialogProps) {
  const { host } = props;
  const codec = host.codec ?? canvasCodec;
  const [prompt, setPrompt] = useState(props.defaultPrompt);
  const [style, setStyle] = useState<AiPictureStyle>(props.defaultStyle);
  const sizes = sizesUpTo(props.maxSize, props.size);
  const [size, setSize] = useState(sizes.includes(props.size) ? props.size : (sizes[0] as number));
  const [colour, setColour] = useState<readonly [number, number, number]>(
    props.colour ?? DEFAULT_AI_COLOUR,
  );
  // The colour counts (words, palette, check) once the field gave one or the user chose one.
  const [colourChosen, setColourChosen] = useState(props.colour !== undefined);
  const askedColour = colourChosen ? colour : undefined;
  const [results, setResults] = useState<AiCandidate[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reference, setReference] = useState<DrawnReference | null>(null);
  const requestRef = useRef<string | null>(null);
  const liveRef = useRef(true);
  const promptId = useId();
  const sizeId = useId();
  const colourId = useId();
  const service = host.status === null ? null : AI_PICTURE_SERVICE_INFO[host.status.service];
  const shape = props.shape;
  const fixed = shape !== undefined && !isSquareStyle(shape.style);
  const checked = !fixed || shape?.style === 'particle';
  const slotName = `${wordsOf(props.target)} ${props.defaultPrompt}`;
  const slot = checked ? slotOf(slotName, style) : undefined;
  const sent = dialogPrompt(prompt, slotName, style, checked ? askedColour : undefined);
  const [cost, setCost] = useState<AiPictureCost | null | undefined>(undefined);
  const round = (text: string): AiRound => ({
    prompt: text,
    style,
    size,
    count: AI_PICTURES_MAX_COUNT,
    ...(fixed ? { shape } : {}),
  });
  const costKey = `${style}|${size}|${fixed ? `${shape.style}${shape.width}x${shape.height}` : ''}`;
  const referenceKey = `${slot?.id ?? ''}|${toHex(colour)}`;

  // The price of the next round, asked again whenever the style or size changes (free).
  useEffect(() => {
    let live = true;
    setCost(undefined);
    void roundCost(host.platform, round(sent || props.defaultPrompt)).then((answer) => {
      if (live) setCost(answer);
    });
    return () => {
      live = false;
    };
  }, [host.platform, costKey]);

  // MSM's drawing of the slot in the main colour, from the lazily loaded drawing code.
  useEffect(() => {
    let live = true;
    if (slot === undefined) {
      setReference(null);
      return;
    }
    void import('./reference')
      .then(({ drawnReference }) => drawnReference(slot, colour))
      .then(
        (drawn) => {
          if (live) setReference(drawn);
        },
        () => {
          if (live) setReference(null);
        },
      );
    return () => {
      live = false;
    };
  }, [referenceKey]);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      if (requestRef.current !== null) void host.platform.cancel(requestRef.current);
    };
  }, [host.platform]);

  const generate = async (): Promise<void> => {
    if (prompt.trim() === '' || running) return;
    setRunning(true);
    setError(null);
    setNote(null);
    setChosen(null);
    const onRequest = (requestId: string) => {
      requestRef.current = requestId;
    };
    try {
      if (checked && slot !== undefined) {
        const guard: AiGuard = {
          noun: slot.noun,
          ...(askedColour === undefined
            ? {}
            : { colour: askedColour, colourName: colourWords(askedColour) }),
          face: slot.face === true,
          strongPrompt: dialogPrompt(prompt, slotName, style, askedColour, true),
          ...(reference === null
            ? {}
            : {
                reference: reference.image,
                referencePng: reference.png,
                // The drawing's colours only when the colour was asked: a grey default would
                // hold the picture to greys.
                ...(askedColour === undefined
                  ? {}
                  : paletteProps(paletteRaster([reference.image]))),
              }),
        };
        const made = await runCheckedRound(host.platform, codec, round(sent), guard, onRequest);
        if (!liveRef.current) return;
        const shown = made.fallback === undefined ? made.candidates : [made.fallback];
        setResults(shown);
        setChosen(shown.length > 0 ? 0 : null);
        setNote(made.note);
      } else {
        const made = await runRound(host.platform, codec, round(sent), onRequest);
        if (!liveRef.current) return;
        setResults(made);
        setChosen(0);
      }
    } catch (caught) {
      if (!liveRef.current) return;
      if (caught instanceof AiRoundError && caught.errorClass === 'cancelled') {
        setError('Cancelled.');
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      requestRef.current = null;
      if (liveRef.current) setRunning(false);
    }
  };

  const cancel = (): void => {
    if (requestRef.current !== null) void host.platform.cancel(requestRef.current);
  };

  const pick = async (bytes: Uint8Array): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      await props.onPick(bytes);
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setSaving(false);
    }
  };

  const use = async (): Promise<void> => {
    const picked = chosen === null ? undefined : results[chosen];
    if (picked !== undefined) await pick(picked.cleaned);
  };

  const urls = useMemo(
    () =>
      results.map((result) => ({
        before: imageDataUrl(result.raw),
        after: imageDataUrl(result.cleaned),
      })),
    [results],
  );

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !saving) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Dialog.Content
          data-testid="ai-pictures-dialog"
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-[70] flex max-h-[92vh] w-[min(94vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">Make it with AI</Dialog.Title>
          <p className="text-xs text-muted">
            Only the words below{slot !== undefined ? " and MSM's own drawing of the shape" : ''}{' '}
            are sent to {service?.label ?? 'the image service'}, never your project files. Each
            picture costs a little on your own account.
          </p>
          <label htmlFor={promptId} className="text-sm">
            Description
          </label>
          <textarea
            id={promptId}
            data-testid="ai-pictures-prompt"
            className={`${fieldClass} min-h-16`}
            maxLength={AI_PICTURES_PROMPT_MAX}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <p className="text-xs text-muted" data-testid="ai-pictures-sent">
            Sent: {sent}
          </p>
          {fixed ? (
            <p className="text-sm" data-testid="ai-pictures-shape">
              {AI_PICTURE_STYLE_LABELS[shape.style]}: {shape.words}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Style">
              {AI_PICTURE_STYLES.filter(isSquareStyle).map((id) => (
                <label key={id} className="flex items-center gap-1 text-sm">
                  <input
                    type="radio"
                    name="ai-pictures-style"
                    data-testid={`ai-pictures-style-${id}`}
                    checked={style === id}
                    onChange={() => setStyle(id)}
                  />
                  {AI_PICTURE_STYLE_LABELS[id]}
                </label>
              ))}
              <label htmlFor={sizeId} className="ml-auto text-sm">
                Size
              </label>
              <select
                id={sizeId}
                data-testid="ai-pictures-size"
                className={fieldClass}
                value={size}
                onChange={(event) => setSize(Number(event.target.value))}
              >
                {sizes.map((value) => (
                  <option key={value} value={value}>
                    {value} × {value}
                  </option>
                ))}
              </select>
            </div>
          )}
          {checked && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor={colourId}>Main colour</label>
              <input
                id={colourId}
                type="color"
                data-testid="ai-pictures-colour"
                value={toHex(colour)}
                onChange={(event) => {
                  const next = fromHex(event.target.value);
                  if (next !== null) {
                    setColour(next);
                    setColourChosen(true);
                  }
                }}
              />
              {reference !== null && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <img
                    alt="MSM's drawing"
                    src={imageDataUrl(reference.png)}
                    className="size-8 [image-rendering:pixelated]"
                    data-testid="ai-pictures-reference"
                  />
                  MSM's drawing: the shape every picture is checked against.
                </span>
              )}
            </div>
          )}
          <p className="text-xs" data-testid="ai-pictures-cost">
            {cost === undefined
              ? 'Checking the price…'
              : costWords(cost, AI_PICTURES_MAX_COUNT, host.status?.service ?? null)}
            {checked && slot !== undefined
              ? ' If every picture fails its check, MSM tries once more for the same price.'
              : ''}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              data-testid="ai-pictures-generate"
              disabled={running || saving || prompt.trim() === ''}
              onClick={() => void generate()}
            >
              <Sparkles size={14} aria-hidden />
              {results.length === 0 ? 'Make 4' : 'Try again'}
            </Button>
            {running && (
              <Button data-testid="ai-pictures-cancel" onClick={cancel}>
                Cancel
              </Button>
            )}
            <span role="status" className="text-xs text-muted" data-testid="ai-pictures-status">
              {running
                ? 'Making pictures… this can take up to a minute.'
                : results.length > 0
                  ? 'Pick one. Left: what the service drew. Right: cleaned up for Minecraft.'
                  : ''}
            </span>
          </div>
          {note !== null && (
            <p className="text-sm text-warning" data-testid="ai-pictures-note">
              {note}
            </p>
          )}
          {error !== null && (
            <p role="alert" className="text-sm text-error" data-testid="ai-pictures-error">
              {error}
            </p>
          )}
          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-2" role="listbox" aria-label="Pictures">
              {results.map((result, index) => (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={chosen === index}
                  data-testid={`ai-pictures-result-${index}`}
                  className={`flex items-center gap-2 rounded border p-2 ${chosen === index ? 'border-accent' : 'border-border'}`}
                  onClick={() => setChosen(index)}
                >
                  <img
                    alt={`Number ${index + 1} as drawn`}
                    src={urls[index]?.before}
                    data-testid={`ai-pictures-before-${index}`}
                    className="size-24 object-contain [image-rendering:pixelated]"
                  />
                  <img
                    alt={`Number ${index + 1} cleaned up`}
                    src={urls[index]?.after}
                    data-testid={`ai-pictures-after-${index}`}
                    className="size-24 bg-[repeating-conic-gradient(#d8d8d8_0_25%,#b8b8b8_0_50%)] bg-[length:12px_12px] [image-rendering:pixelated]"
                  />
                  <span className="flex flex-col text-xs text-muted">
                    <span>
                      {result.image.width} × {result.image.height}
                    </span>
                    {result.seam !== undefined && (
                      <span data-testid={`ai-pictures-seam-${index}`}>
                        {result.seam.tiles ? 'Tiles without a seam' : 'Shows a seam when tiled'}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-1.5">
            {reference !== null && (
              <Button
                data-testid="ai-pictures-use-drawing"
                className="mr-auto"
                disabled={running || saving}
                onClick={() => void pick(reference.png)}
              >
                Use MSM's drawing
              </Button>
            )}
            <Button
              data-testid="ai-pictures-use"
              disabled={chosen === null || running || saving}
              onClick={() => void use()}
            >
              {saving ? 'Saving…' : 'Use this picture'}
            </Button>
            <Button data-testid="ai-pictures-close" disabled={saving} onClick={props.onClose}>
              Close
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
