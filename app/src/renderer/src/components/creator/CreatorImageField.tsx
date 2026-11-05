/**
 * The Creator's `image` field (ADR 0044 D7): "Choose picture…" opens the host's file picker
 * (`platform.dialogs.pickFiles`, PNG filter), checks the bytes with the wizard's helpers
 * (`checkPngBytes`: the PNG signature, `maxBytes`, `maxSize`) and stores the PNG as a `data:`
 * URL; a thumbnail and its size in pixels, or "No image", and "Remove image". A refused file
 * shows its error under the field and keeps the previous value.
 *
 * Test ids as the wizard's image field: `param-<id>` (the choose button), `param-<id>-field`,
 * `param-<id>-thumbnail`, `param-<id>-empty`, `param-<id>-summary`, `param-<id>-clear`,
 * `param-<id>-error`.
 *
 * @packageDocumentation
 */

import type { StarterParameter } from '@msm/plugin-api';
import { useId, useState } from 'react';
import { Button } from '../ui/Button';
import { checkPngBytes, imageSummary, pngDataUrl } from '../wizard/wizard-model';

/** One file the host's picker returns. */
export interface PickedImage {
  name: string;
  data: Uint8Array;
}

/** Opens the host's file picker for a PNG; an empty list when the user cancels. */
export type PickImage = (title: string) => Promise<readonly PickedImage[]>;

/** Props of {@link CreatorImageField}. */
export interface CreatorImageFieldProps {
  parameter: StarterParameter & { type: 'image' };
  /** The `data:` URL, or `''` for no image. */
  value: string;
  error: string | null;
  pickImage: PickImage;
  onChange(value: string): void;
}

/** A picked PNG for an image parameter, through the host's file picker. */
export function CreatorImageField({
  parameter,
  value,
  error,
  pickImage,
  onChange,
}: CreatorImageFieldProps) {
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
      const files = await pickImage(`Choose ${parameter.label.toLowerCase()}`);
      const file = files[0];
      if (file === undefined) return;
      const problem = checkPngBytes(parameter, file.data);
      if (problem !== null) {
        setPickError(`${file.name}: ${problem}`);
        return;
      }
      setPickError(null);
      onChange(pngDataUrl(file.data));
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
        {value === '' ? (
          <span
            className="flex h-12 w-12 items-center justify-center rounded border border-border text-center text-[10px] text-muted"
            data-testid={`${testId}-empty`}
          >
            No image
          </span>
        ) : (
          <img
            src={value}
            alt={`${parameter.label} preview`}
            className="h-12 w-12 rounded border border-border object-contain [image-rendering:pixelated]"
            data-testid={`${testId}-thumbnail`}
          />
        )}
        <span className="flex flex-col items-start gap-1">
          <span className="flex flex-wrap gap-1">
            <Button
              data-testid={testId}
              aria-labelledby={`${labelId} ${chooseId}`}
              aria-describedby={describedBy}
              aria-invalid={shownError !== null}
              disabled={picking}
              onClick={() => void choose()}
            >
              <span id={chooseId}>{value === '' ? 'Choose picture…' : 'Replace…'}</span>
            </Button>
            {value !== '' && (
              <Button
                data-testid={`${testId}-clear`}
                onClick={() => {
                  setPickError(null);
                  onChange('');
                }}
              >
                Remove image
              </Button>
            )}
          </span>
          <span className="text-xs text-muted" data-testid={`${testId}-summary`}>
            {imageSummary(value === '' ? null : value)}
          </span>
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
