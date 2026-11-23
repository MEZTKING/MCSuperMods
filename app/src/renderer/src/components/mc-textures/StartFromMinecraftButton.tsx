/**
 * **Start from a Minecraft texture** (ADR 0129 D4) beside **Draw…** in the painter and the
 * Studios' picture fields: it opens the picker of the user's own Minecraft textures, and the
 * picked picture becomes the start of the user's own (one undo step, written by `onPick`). Hidden
 * without a host (tests, previews); shown without the Minecraft folder set up, where the picker
 * says so and offers the set-up. The picker loads lazily on the first click.
 *
 * @packageDocumentation
 */

import { Boxes } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Button } from '../ui/Button';
import type { McTextureFolder } from './catalogue';
import { type McTexturePick, useMinecraftTextures } from './host';

/** The picker, loaded on first use. */
export const LazyMinecraftTexturePicker = lazy(() => import('./MinecraftTexturePicker'));

/** The button's words. */
export const START_FROM_MINECRAFT = 'Start from a Minecraft texture…';

/** Props of {@link StartFromMinecraftButton}. */
export interface StartFromMinecraftButtonProps {
  testId: string;
  /** What the picture is for, in the picker's title. */
  target: string;
  /** The folder shown first. */
  folder?: McTextureFolder;
  /** Writes the picked picture (one undo step); rejects with a message when it cannot. */
  onPick(pick: McTexturePick): Promise<void> | void;
  className?: string;
  disabled?: boolean;
}

export function StartFromMinecraftButton(props: StartFromMinecraftButtonProps) {
  const host = useMinecraftTextures();
  const [open, setOpen] = useState(false);
  if (host === null) return null;
  return (
    <>
      <Button
        data-testid={props.testId}
        className={props.className}
        disabled={props.disabled}
        title="Start from one of the textures of your own Minecraft"
        onClick={() => setOpen(true)}
      >
        <Boxes size={12} aria-hidden />
        {START_FROM_MINECRAFT}
      </Button>
      {open && (
        <Suspense fallback={null}>
          <LazyMinecraftTexturePicker
            host={host}
            title={`Start ${props.target} from a Minecraft texture`}
            {...(props.folder === undefined ? {} : { folder: props.folder })}
            onPick={props.onPick}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
