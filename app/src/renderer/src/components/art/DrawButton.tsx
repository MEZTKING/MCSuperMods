/**
 * The **Draw…** button of picture fields (ADR 0092 D10 (b)), beside **Make with AI**: it opens
 * the Draw dialog, which draws the picture on this machine (no key, no internet), so it is
 * shown in every mode and without an AI host. In Very easy mode it reads "Draw it for me".
 * The dialog and the drawing code load lazily on the first click, so the renderer's main chunk
 * does not carry them (ADR 0092 D17).
 *
 * @packageDocumentation
 */

import { Palette } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { usePreferences } from '../../store/preferences';
import { Button } from '../ui/Button';
import type { DrawField, DrawnPicture } from './draw-model';

/** The Draw dialog, loaded on first use (for callers that open it without the button). */
export const LazyDrawPictureDialog = lazy(() => import('./DrawPictureDialog'));
const DrawPictureDialog = LazyDrawPictureDialog;

/** The button's words. */
export const DRAW = 'Draw…';
export const DRAW_IT_FOR_ME_BUTTON = 'Draw it for me';

/**
 * What the Draw dialog draws for a texture at `name` (`ns:textures/block/ruby_ore.png` or a
 * bare path) of `width` by `height`: the picture kind from its folder (`block`, `item`,
 * `particle`, `mob_effect` an icon, `entity` worn and mob pictures), and a humanoid box skin
 * for a 64 by 64 picture under `textures/entity` outside the equipment folders.
 */
export function drawFieldForTexture(name: string, width: number, height: number): DrawField {
  const path = name.slice(name.indexOf(':') + 1);
  const folder = /(?:^|\/)textures\/([^/]+)\//.exec(path)?.[1];
  const base = { width, height, name: path };
  switch (folder) {
    case 'block':
      return { ...base, kinds: ['block', 'item'] };
    case 'item':
      return { ...base, kinds: ['item', 'block'] };
    case 'particle':
      return { ...base, kinds: ['particle'] };
    case 'mob_effect':
      return { ...base, kinds: ['icon'] };
    case 'entity':
      if (width === 64 && height === 64 && !path.includes('/equipment/')) {
        return { ...base, kinds: ['entity'], skin: true };
      }
      return { ...base, kinds: ['entity'] };
    default:
      return { ...base, kinds: ['block', 'item'] };
  }
}

/** Props of {@link DrawButton}. */
export interface DrawButtonProps {
  /** The button's test id (the dialog keeps its own). */
  testId: string;
  /** What the field wants drawn. */
  field: DrawField;
  /** What is being drawn, for the dialog's title. */
  target: string;
  /** Writes the picked picture (one undo step); rejects with a message when it cannot. */
  onPick(picture: DrawnPicture): Promise<void> | void;
  /** The button's words outside Very easy mode (default "Draw…"). */
  label?: string;
  disabled?: boolean;
  /** A tooltip, for example why the button is disabled. */
  title?: string;
  className?: string;
}

export function DrawButton(props: DrawButtonProps) {
  const veryEasy = usePreferences((state) => state.mode) === 'very-easy';
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        data-testid={props.testId}
        className={props.className}
        disabled={props.disabled}
        title={props.title ?? 'Draw a picture in a Minecraft-like style'}
        onClick={() => setOpen(true)}
      >
        <Palette size={12} aria-hidden />
        {veryEasy ? DRAW_IT_FOR_ME_BUTTON : (props.label ?? DRAW)}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <DrawPictureDialog
            field={props.field}
            target={props.target}
            veryEasy={veryEasy}
            onPick={props.onPick}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
