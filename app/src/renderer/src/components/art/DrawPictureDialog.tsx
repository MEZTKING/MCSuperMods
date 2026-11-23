/**
 * The Draw dialog (ADR 0092 D9): **What is it?** (tiles of the recipes that fit the field, in
 * words with a thumbnail), **Colour** (a colour well, the ten Surprise me theme colours and
 * "The thing's colour" when the field knows it), **Second colour** where the recipe takes one,
 * **Finish**, **Detail** (Smooth, Normal, Rough) and six variations, with **New looks** for six
 * more and **Use this picture**. Plain by default (ADR 0130; title "Draw it for me"): Colour and
 * the variations, drawing what the field's name points at; What is it?, Second colour, Finish,
 * Detail and where the picture is saved are under **More options**. Everything is drawn on this
 * machine by MSM's own generator: no key, no internet. The picked picture goes to the field's
 * `onPick`, which writes it as one undo step; nothing but the PNG is kept.
 *
 * This module is a lazy chunk: `DrawButton` imports it with `lazy()`.
 *
 * Test ids: `draw-dialog`, `draw-option-<id>`, `draw-colour`, `draw-swatch-<word>`,
 * `draw-swatch-thing`, `draw-accent`, `draw-accent-reset`, `draw-finish`,
 * `draw-detail-<level>`, `draw-variation-<n>`, `draw-new-looks`, `draw-use`, `draw-cancel`,
 * `draw-empty`, `draw-error`.
 *
 * @packageDocumentation
 */

import type { ArtDetail } from '@msm/plugin-library';
import { Dialog } from 'radix-ui';
import { useId, useMemo, useReducer, useState } from 'react';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import { MoreOptions } from '../ui/MoreOptions';
import {
  DETAIL_LABELS,
  type DrawField,
  type DrawnPicture,
  type DrawOption,
  type DrawState,
  drawOptions,
  drawPicture,
  drawReducer,
  finishLabel,
  hexToRgb,
  initialDrawState,
  pageSeeds,
  pngUrl,
  rgbToHex,
  selectedSeed,
  THEME_SWATCHES,
} from './draw-model';

/** The dialog's titles. */
export const DRAW_A_PICTURE = 'Draw a picture';
export const DRAW_IT_FOR_ME = 'Draw it for me';

/** Props of {@link DrawPictureDialog}. */
export interface DrawPictureDialogProps {
  /** What the field wants. */
  field: DrawField;
  /** What is being drawn, after the title: "ruby_mod:textures/item/ruby.png". */
  target: string;
  /** Writes the picked picture (one undo step); rejects with a message when it cannot. */
  onPick(picture: DrawnPicture): Promise<void> | void;
  onClose(): void;
  /** The title in place of "Draw a picture" / "Draw it for me" (the Mob Studio's skins). */
  title?: string;
  /** The pick button's words in place of "Use this picture". */
  useLabel?: string;
  /**
   * Another way to make the picture, offered in the footer: **Draw it for me**
   * offers **Make it with AI instead** when an image service has a key (ADR 0093, 2026-11-22).
   */
  alternative?: { label: string; testId: string; onChoose(): void };
}

const DETAILS: readonly ArtDetail[] = ['smooth', 'normal', 'rough'];

const CHECKER =
  'bg-[repeating-conic-gradient(#d8d8d8_0_25%,#b8b8b8_0_50%)] bg-[length:8px_8px] [image-rendering:pixelated]';

export function DrawPictureDialog(props: DrawPictureDialogProps) {
  const { field } = props;
  const options = useMemo(() => drawOptions(field), [field]);
  const [state, dispatch] = useReducer(drawReducer, field.colour, (colour) =>
    initialDrawState(options, colour),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colourId = useId();
  const accentId = useId();
  const finishId = useId();
  const option = options.find((entry) => entry.id === state.option) ?? options[0];
  const { colour, detail } = state;

  const variations = useMemo(
    () =>
      option === undefined
        ? []
        : pageSeeds(state.page).map((seed) => {
            const picture = drawPicture(option, state, seed);
            return { seed, picture, url: pngUrl(picture.pngs[0] as Uint8Array) };
          }),
    [option, state],
  );

  const use = async (): Promise<void> => {
    if (option === undefined) return;
    setSaving(true);
    setError(null);
    try {
      await props.onPick(drawPicture(option, state, selectedSeed(state)));
      props.onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  };

  const title = props.title ?? DRAW_IT_FOR_ME;
  const thing = field.colour;
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
          data-testid="draw-dialog"
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-[70] flex max-h-[92vh] w-[min(94vw,820px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <p className="text-xs text-muted">
            MCSuperMods draws it here in a Minecraft-like style, without a key or the internet. You
            can paint over it afterwards.
          </p>
          {option === undefined ? (
            <p className="text-sm" data-testid="draw-empty">
              Nothing can be drawn at {field.width} by {field.height} pixels yet. Paint it or choose
              a picture instead.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor={colourId} className="text-sm font-medium">
                  Colour
                </label>
                <input
                  id={colourId}
                  type="color"
                  data-testid="draw-colour"
                  value={rgbToHex(state.colour)}
                  onChange={(event) => {
                    const next = hexToRgb(event.target.value);
                    if (next !== null) dispatch({ type: 'colour', colour: next });
                  }}
                />
                {thing !== undefined && (
                  <Button
                    data-testid="draw-swatch-thing"
                    aria-pressed={rgbToHex(state.colour) === rgbToHex(thing)}
                    onClick={() => dispatch({ type: 'colour', colour: thing })}
                  >
                    <span
                      aria-hidden
                      className="size-3 rounded-sm border border-border"
                      style={{ backgroundColor: rgbToHex(thing) }}
                    />
                    The thing's colour
                  </Button>
                )}
                {THEME_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.word}
                    type="button"
                    aria-label={swatch.word}
                    title={swatch.word}
                    aria-pressed={rgbToHex(state.colour) === swatch.hex}
                    data-testid={`draw-swatch-${swatch.word.toLowerCase()}`}
                    className="size-5 cursor-pointer rounded border border-border"
                    style={{ backgroundColor: swatch.hex }}
                    onClick={() => {
                      const next = hexToRgb(swatch.hex);
                      if (next !== null) dispatch({ type: 'colour', colour: next });
                    }}
                  />
                ))}
              </div>
              <div
                className="grid grid-cols-3 gap-2 sm:grid-cols-6"
                role="listbox"
                aria-label="Variations"
              >
                {variations.map(({ seed, url, picture }, index) => (
                  <button
                    key={seed}
                    type="button"
                    role="option"
                    aria-selected={state.selected === index}
                    aria-label={`Variation ${index + 1}`}
                    data-testid={`draw-variation-${index}`}
                    data-seed={seed}
                    className={`flex flex-col items-center gap-1 rounded border p-1.5 ${state.selected === index ? 'border-accent' : 'border-border'}`}
                    onClick={() => dispatch({ type: 'select', index })}
                  >
                    <img
                      alt=""
                      src={url}
                      className={`size-20 object-contain ${CHECKER}`}
                      style={{ aspectRatio: `${picture.width} / ${picture.height}` }}
                    />
                    {picture.pngs.length > 1 && (
                      <span className="text-[10px] text-muted">{picture.pngs.length} frames</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          {option !== undefined && (
            <MoreOptions storageKey="draw-picture">
              <WhatIsIt
                options={options}
                option={option}
                colour={colour}
                detail={detail}
                onPick={(id) => dispatch({ type: 'option', option: id })}
              />
              {option.colours === 2 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <label htmlFor={accentId} className="text-sm font-medium">
                    Second colour
                  </label>
                  <input
                    id={accentId}
                    type="color"
                    data-testid="draw-accent"
                    value={state.accent === undefined ? '#808080' : rgbToHex(state.accent)}
                    onChange={(event) => {
                      const next = hexToRgb(event.target.value);
                      if (next !== null) dispatch({ type: 'accent', accent: next });
                    }}
                  />
                  {state.accent === undefined ? (
                    <span className="text-xs text-muted">Its own colour until you pick one.</span>
                  ) : (
                    <Button
                      data-testid="draw-accent-reset"
                      onClick={() => dispatch({ type: 'accent', accent: undefined })}
                    >
                      Its own colour
                    </Button>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                {option.finishes.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <label htmlFor={finishId} className="text-sm font-medium">
                      Finish
                    </label>
                    <select
                      id={finishId}
                      data-testid="draw-finish"
                      className={fieldClass}
                      value={state.finish ?? option.finishes[0]}
                      onChange={(event) => dispatch({ type: 'finish', finish: event.target.value })}
                    >
                      {option.finishes.map((finish) => (
                        <option key={finish} value={finish}>
                          {finishLabel(finish)}
                        </option>
                      ))}
                    </select>
                  </span>
                )}
                <span className="flex items-center gap-1.5" role="radiogroup" aria-label="Detail">
                  <span className="text-sm font-medium">Detail</span>
                  {DETAILS.map((detail) => (
                    <label key={detail} className="flex items-center gap-1 text-sm">
                      <input
                        type="radio"
                        name="draw-detail"
                        data-testid={`draw-detail-${detail}`}
                        checked={state.detail === detail}
                        onChange={() => dispatch({ type: 'detail', detail })}
                      />
                      {DETAIL_LABELS[detail]}
                    </label>
                  ))}
                </span>
              </div>
              <p className="text-xs text-muted" data-testid="draw-target">
                Saved as {props.target}
              </p>
            </MoreOptions>
          )}
          {error !== null && (
            <p role="alert" className="text-sm text-error" data-testid="draw-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-1.5">
            {option !== undefined && (
              <Button
                data-testid="draw-new-looks"
                className="mr-auto"
                disabled={saving}
                onClick={() => dispatch({ type: 'new-looks' })}
              >
                New looks
              </Button>
            )}
            {props.alternative !== undefined && (
              <Button
                data-testid={props.alternative.testId}
                disabled={saving}
                onClick={props.alternative.onChoose}
              >
                {props.alternative.label}
              </Button>
            )}
            <Button
              data-testid="draw-use"
              disabled={option === undefined || saving}
              onClick={() => void use()}
            >
              {saving ? 'Saving…' : (props.useLabel ?? 'Use this picture')}
            </Button>
            <Button data-testid="draw-cancel" disabled={saving} onClick={props.onClose}>
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default DrawPictureDialog;

/** **What is it?**: a tile per recipe that fits the field (drawn while More options is open). */
function WhatIsIt(props: {
  options: readonly DrawOption[];
  option: DrawOption;
  colour: DrawState['colour'];
  detail: DrawState['detail'];
  onPick(id: string): void;
}) {
  const { options, colour, detail } = props;
  // Tiles follow the colour and detail only (seed 0, each recipe's own finish and second colour).
  const tiles = useMemo(
    () =>
      options.map((entry) => {
        const look = { ...initialDrawState([entry]), colour, detail };
        return {
          option: entry,
          url: pngUrl(drawPicture(entry, look, 0).pngs[0] as Uint8Array),
        };
      }),
    [options, colour, detail],
  );
  const option = props.option;
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">What is it?</legend>
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-1"
        role="listbox"
        aria-label="What is it?"
      >
        {tiles.map(({ option: entry, url }) => (
          <button
            key={entry.id}
            type="button"
            role="option"
            aria-selected={entry.id === option.id}
            data-testid={`draw-option-${entry.id}`}
            className={`flex items-center gap-1.5 rounded border p-1 text-left text-xs ${entry.id === option.id ? 'border-accent' : 'border-border'}`}
            onClick={() => props.onPick(entry.id)}
          >
            <img alt="" src={url} className={`size-8 shrink-0 ${CHECKER}`} />
            {entry.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
