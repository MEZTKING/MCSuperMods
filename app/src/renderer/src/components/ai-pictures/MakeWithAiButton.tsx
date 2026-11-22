/**
 * The "Make with AI" button of picture fields and the texture painter (ADR 0093 D6). Without
 * a host it is not shown; without a key for the chosen service it reads "Set up AI pictures in
 * Settings" and opens Settings; in Very easy mode it reads "Make it with AI".
 *
 * @packageDocumentation
 */

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { AiPictureStyle } from '../../../../shared/ai-pictures';
import { usePreferences } from '../../store/preferences';
import { Button } from '../ui/Button';
import { aiPicturesReady, useAiPictures } from './ai-pictures-host';
import { MakeWithAiDialog } from './MakeWithAiDialog';
import type { AiPictureShape } from './shapes';

/** The button's words. */
export const MAKE_WITH_AI = 'Make with AI';
export const MAKE_IT_WITH_AI = 'Make it with AI';
export const SET_UP_AI_PICTURES = 'Set up AI pictures in Settings';

/** Props of {@link MakeWithAiButton}. */
export interface MakeWithAiButtonProps {
  /** The button's test id (the dialog keeps its own). */
  testId: string;
  /** What is being made, for the dialog's title. */
  target: string;
  defaultPrompt: string;
  defaultStyle: AiPictureStyle;
  size: number;
  /** The largest edge allowed. */
  maxSize?: number;
  /** What the picture is for when not a square texture (a skin, a painting, a pattern). */
  shape?: AiPictureShape;
  /** The thing's main colour, when the field knows it. */
  colour?: readonly [number, number, number];
  /** The button's words outside Very easy mode (default "Make with AI"). */
  label?: string;
  /** A tooltip, for example why the button is disabled. */
  title?: string;
  /** Writes the picked picture (one undo step). */
  onPick(bytes: Uint8Array): Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

export function MakeWithAiButton(props: MakeWithAiButtonProps) {
  const host = useAiPictures();
  const veryEasy = usePreferences((state) => state.mode) === 'very-easy';
  const [open, setOpen] = useState(false);
  if (host === null) return null;
  if (!aiPicturesReady(host.status)) {
    return (
      <Button
        data-testid={`${props.testId}-setup`}
        className={props.className}
        title="AI pictures need a key for an image service"
        onClick={host.openSettings}
      >
        <Sparkles size={12} aria-hidden />
        {SET_UP_AI_PICTURES}
      </Button>
    );
  }
  return (
    <>
      <Button
        data-testid={props.testId}
        className={props.className}
        disabled={props.disabled}
        {...(props.title === undefined ? {} : { title: props.title })}
        onClick={() => setOpen(true)}
      >
        <Sparkles size={12} aria-hidden />
        {veryEasy ? MAKE_IT_WITH_AI : (props.label ?? MAKE_WITH_AI)}
      </Button>
      {open && (
        <MakeWithAiDialog
          host={host}
          target={props.target}
          defaultPrompt={props.defaultPrompt}
          defaultStyle={props.defaultStyle}
          size={props.size}
          {...(props.maxSize === undefined ? {} : { maxSize: props.maxSize })}
          {...(props.shape === undefined ? {} : { shape: props.shape })}
          {...(props.colour === undefined ? {} : { colour: props.colour })}
          veryEasy={veryEasy}
          onPick={props.onPick}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
