/**
 * The **Draw…** button of picture fields (ADR 0092 D10 (b)), beside **Make with AI**: it opens
 * the Draw dialog, which draws the picture on this machine (no key, no internet), so it is
 * shown without an AI host too. It reads "Draw it for me" (ADR 0130 D5).
 * The dialog and the drawing code load lazily on the first click, so the renderer's main chunk
 * does not carry them (ADR 0092 D17).
 *
 * Given `ai` (what Make with AI would make here), the **Draw it for me** dialog offers
 * **Make it with AI instead** when the chosen image service has a key (ADR 0093, 2026-11-22);
 * without a key nothing changes, so drawing stays the free route.
 *
 * @packageDocumentation
 */

import { Palette } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import type { AiPictureStyle } from '../../../../shared/ai-pictures';
import { aiPicturesReady, useAiPictures } from '../ai-pictures/ai-pictures-host';
import { MakeWithAiDialog } from '../ai-pictures/MakeWithAiDialog';
import type { AiPictureShape } from '../ai-pictures/shapes';
import { Button } from '../ui/Button';
import type { DrawField, DrawnPicture } from './draw-model';

/** The Draw dialog, loaded on first use (for callers that open it without the button). */
export const LazyDrawPictureDialog = lazy(() => import('./DrawPictureDialog'));
const DrawPictureDialog = LazyDrawPictureDialog;

/** The button's words. */
export const DRAW = 'Draw…';
export const DRAW_IT_FOR_ME_BUTTON = 'Draw it for me';
export const MAKE_IT_WITH_AI_INSTEAD = 'Make it with AI instead';

/** What Make with AI would make in place of a drawing (Very easy's offer). */
export interface DrawAiOffer {
  defaultPrompt: string;
  defaultStyle: AiPictureStyle;
  size: number;
  maxSize?: number;
  shape?: AiPictureShape;
  colour?: readonly [number, number, number];
  /** Writes the AI picture (one undo step). */
  onPick(bytes: Uint8Array): Promise<void> | void;
}

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
  disabled?: boolean;
  /** A tooltip, for example why the button is disabled. */
  title?: string;
  className?: string;
  /** The offer of Make with AI in the Draw dialog, when a key is set. */
  ai?: DrawAiOffer;
}

export function DrawButton(props: DrawButtonProps) {
  const [open, setOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const host = useAiPictures();
  const offer = props.ai !== undefined && host !== null && aiPicturesReady(host.status);
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
        {DRAW_IT_FOR_ME_BUTTON}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <DrawPictureDialog
            field={props.field}
            target={props.target}
            onPick={props.onPick}
            onClose={() => setOpen(false)}
            {...(offer
              ? {
                  alternative: {
                    label: MAKE_IT_WITH_AI_INSTEAD,
                    testId: `${props.testId}-ai-instead`,
                    onChoose: () => {
                      setOpen(false);
                      setAiOpen(true);
                    },
                  },
                }
              : {})}
          />
        </Suspense>
      )}
      {aiOpen && host !== null && props.ai !== undefined && (
        <MakeWithAiDialog
          host={host}
          target={props.target}
          defaultPrompt={props.ai.defaultPrompt}
          defaultStyle={props.ai.defaultStyle}
          size={props.ai.size}
          {...(props.ai.maxSize === undefined ? {} : { maxSize: props.ai.maxSize })}
          {...(props.ai.shape === undefined ? {} : { shape: props.ai.shape })}
          {...(props.ai.colour === undefined ? {} : { colour: props.ai.colour })}
          onPick={props.ai.onPick}
          onClose={() => setAiOpen(false)}
        />
      )}
    </>
  );
}
