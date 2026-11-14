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
import { MakeWithAiButton } from '../ai-pictures/MakeWithAiButton';
import { defaultPrompt, styleForName, wordsOf } from '../ai-pictures/prompt';
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
  /** The thing's name so far (the flow's name field), for the AI description (ADR 0093). */
  nameHint?: string;
}

/** Whether "Make with AI" suits an image parameter: not a mob skin's 64 by 64 layout. */
export function takesAiPicture(parameter: StarterParameter & { type: 'image' }): boolean {
  return !/skin/i.test(`${parameter.id} ${parameter.label}`);
}

/** The AI style of an image parameter: a block texture or an item icon. */
function aiStyleOf(parameter: StarterParameter & { type: 'image' }, name: string) {
  const words = `${parameter.id} ${parameter.label}`.toLowerCase();
  const block =
    /block|planks|log|stone|bark|leaves|side|top|bottom|front|paint|crate|machine|texture/.test(
      words,
    );
  return styleForName(name, block ? 'block' : 'item');
}

/** A picked PNG for an image parameter, through the host's file picker. */
export function CreatorImageField({
  parameter,
  value,
  error,
  pickImage,
  onChange,
  nameHint,
}: CreatorImageFieldProps) {
  const labelId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const chooseId = useId();
  const [pickError, setPickError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const shownError = pickError ?? error;
  const testId = `param-${parameter.id}`;
  const aiName = nameHint === undefined || wordsOf(nameHint) === '' ? parameter.label : nameHint;
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
            {takesAiPicture(parameter) && (
              <MakeWithAiButton
                testId={`${testId}-ai`}
                target={parameter.label}
                defaultPrompt={defaultPrompt(aiName, aiStyleOf(parameter, aiName))}
                defaultStyle={aiStyleOf(parameter, aiName)}
                size={
                  parameter.maxSize !== undefined && parameter.maxSize < 16 ? parameter.maxSize : 16
                }
                {...(parameter.maxSize === undefined ? {} : { maxSize: parameter.maxSize })}
                onPick={(bytes) => {
                  setPickError(null);
                  onChange(pngDataUrl(bytes));
                }}
              />
            )}
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
