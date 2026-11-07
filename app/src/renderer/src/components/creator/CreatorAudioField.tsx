/**
 * The Creator's `audio` field (ADR 0049): "Choose song…" opens the host's file picker
 * (`platform.dialogs.pickFiles`, Ogg filter), checks the bytes with the wizard's helpers
 * (`checkOggBytes`: Ogg Vorbis with a readable length, `maxBytes`) and stores the sound as a
 * `data:` URL; the summary shows its length and channels, or "None"; "Remove sound" clears it.
 * A refused file shows its error under the field and keeps the previous value.
 *
 * Test ids: `param-<id>` (the choose button), `param-<id>-field`, `param-<id>-summary`,
 * `param-<id>-clear`, `param-<id>-error`.
 *
 * @packageDocumentation
 */

import type { StarterParameter } from '@msm/plugin-api';
import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import { audioSummary, checkOggBytes, oggDataUrl } from '../wizard/wizard-model';
import type { PickImage } from './CreatorImageField';

/** Opens the host's file picker for an Ogg file; an empty list when the user cancels. */
export type PickAudio = PickImage;

/** Props of {@link CreatorAudioField}. */
export interface CreatorAudioFieldProps {
  parameter: StarterParameter & { type: 'audio' };
  /** The `data:` URL, or `''` for no sound. */
  value: string;
  error: string | null;
  pickAudio: PickAudio;
  onChange(value: string): void;
}

/** A picked Ogg Vorbis sound for an audio parameter, through the host's file picker. */
export function CreatorAudioField({
  parameter,
  value,
  error,
  pickAudio,
  onChange,
}: CreatorAudioFieldProps) {
  const labelId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const chooseId = useId();
  const [pickError, setPickError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const shownError = pickError ?? error;
  const testId = `param-${parameter.id}`;
  const describedBy =
    [
      parameter.description === undefined ? null : descriptionId,
      shownError === null ? null : errorId,
    ]
      .filter((entry) => entry !== null)
      .join(' ') || undefined;

  const choose = async (): Promise<void> => {
    setPicking(true);
    try {
      const files = await pickAudio(`Choose ${parameter.label.toLowerCase()}`);
      const file = files[0];
      if (file === undefined) return;
      const problem = checkOggBytes(parameter, file.data);
      if (problem !== null) {
        setPickError(`${file.name}: ${problem}`);
        return;
      }
      setPickError(null);
      onChange(oggDataUrl(file.data));
    } catch (cause) {
      setPickError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5" data-testid={`${testId}-field`}>
      <span id={labelId}>{parameter.label}</span>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          data-testid={testId}
          aria-labelledby={`${labelId} ${chooseId}`}
          aria-describedby={describedBy}
          aria-invalid={shownError !== null}
          disabled={picking}
          onClick={() => void choose()}
        >
          <span id={chooseId}>{value === '' ? 'Choose song…' : 'Replace…'}</span>
        </Button>
        {value !== '' && (
          <Button
            data-testid={`${testId}-clear`}
            onClick={() => {
              setPickError(null);
              onChange('');
            }}
          >
            Remove sound
          </Button>
        )}
        <span className="text-xs text-muted" data-testid={`${testId}-summary`}>
          {audioSummary(value === '' ? null : value)}
        </span>
      </span>
      {parameter.description !== undefined && (
        <p id={descriptionId} className="text-xs text-muted">
          {parameter.description}
        </p>
      )}
      {shownError !== null && (
        <p id={errorId} className="text-xs text-error" role="alert" data-testid={`${testId}-error`}>
          {shownError}
        </p>
      )}
    </div>
  );
}
