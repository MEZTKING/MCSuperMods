/**
 * One wizard question (ADR 0040): a labelled control for a {@link StarterParameter}, its
 * description, the id preview of a name field and the validation error under it. The control
 * carries `data-testid="param-<id>"`; a `set` parameter is a fieldset of checkboxes
 * (`param-<id>` on the fieldset, `param-<id>-<value>` on each box, ADR 0043 D1); an `image`
 * parameter is a PNG file picker (`param-<id>`) with a thumbnail (`param-<id>-thumbnail`) or
 * "No image" (`param-<id>-empty`) and a "Remove image" button (`param-<id>-clear`), ADR 0044 D7.
 *
 * @packageDocumentation
 */

import type { StarterParameter } from '@msm/plugin-api';
import { type ReactNode, useId, useState } from 'react';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import {
  audioSummary,
  derivedId,
  type RawValue,
  readAudioFile,
  readImageFile,
  showsIdPreview,
  toggleSetValue,
} from './wizard-model';

/** Props of {@link ParameterField}. */
export interface ParameterFieldProps {
  parameter: StarterParameter;
  /** The editing value (text, a boolean for a boolean parameter, the ticked values for a set). */
  value: RawValue;
  /** The error shown under the control, or `null`. */
  error: string | null;
  /** Focuses the control when it mounts (the first field of a step). */
  autoFocus?: boolean;
  onChange(value: RawValue): void;
}

/** A labelled control for one starter parameter. */
export function ParameterField({
  parameter,
  value,
  error,
  autoFocus,
  onChange,
}: ParameterFieldProps) {
  const inputId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [fileError, setFileError] = useState<string | null>(null);
  const shownError = fileError ?? error;
  const testId = `param-${parameter.id}`;
  const describedBy =
    [
      parameter.description === undefined ? null : descriptionId,
      shownError === null ? null : errorId,
    ]
      .filter((entry) => entry !== null)
      .join(' ') || undefined;
  const common = {
    id: inputId,
    'data-testid': testId,
    'aria-invalid': shownError !== null,
    'aria-describedby': describedBy,
    autoFocus,
  };
  const text = typeof value === 'string' ? value : '';

  let control: ReactNode;
  switch (parameter.type) {
    case 'boolean':
      control = (
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      );
      break;
    case 'number':
      control = (
        <input
          {...common}
          type="number"
          inputMode="decimal"
          className={fieldClass}
          value={text}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step ?? 'any'}
          onChange={(event) => onChange(event.target.value)}
        />
      );
      break;
    case 'colour':
      control = (
        <span className="flex items-center gap-2">
          <input
            {...common}
            type="color"
            className="h-7 w-10 rounded border border-border bg-bg p-0"
            value={/^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : '#000000'}
            onChange={(event) => onChange(event.target.value)}
          />
          <span className="font-mono text-xs text-muted" data-testid={`${testId}-hex`}>
            {text.toLowerCase()}
          </span>
        </span>
      );
      break;
    case 'choice':
      control = (
        <select
          {...common}
          className={fieldClass}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        >
          {parameter.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'set': {
      const ticked: readonly string[] = Array.isArray(value) ? value : [];
      control = (
        <fieldset
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error !== null}
          data-testid={testId}
          className="m-0 flex flex-wrap gap-x-3 gap-y-0.5 border-0 p-0"
        >
          <legend className="mb-0.5 w-full p-0">{parameter.label}</legend>
          {parameter.choices.map((choice, position) => (
            <label key={choice.value} className="flex items-center gap-1">
              <input
                type="checkbox"
                data-testid={`${testId}-${choice.value}`}
                checked={ticked.includes(choice.value)}
                {...{ autoFocus: autoFocus === true && position === 0 }}
                onChange={(event) =>
                  onChange(toggleSetValue(parameter, value, choice.value, event.target.checked))
                }
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </fieldset>
      );
      break;
    }
    case 'image':
      control = (
        <span className="flex flex-wrap items-center gap-2">
          {text === '' ? (
            <span
              className="flex h-12 w-12 items-center justify-center rounded border border-border text-center text-[10px] text-muted"
              data-testid={`${testId}-empty`}
            >
              No image
            </span>
          ) : (
            <img
              src={text}
              alt={`${parameter.label} preview`}
              className="h-12 w-12 rounded border border-border object-contain [image-rendering:pixelated]"
              data-testid={`${testId}-thumbnail`}
            />
          )}
          <input
            {...common}
            type="file"
            accept="image/png"
            className="text-xs"
            onChange={(event) => {
              const input = event.target;
              const file = input.files?.[0];
              if (file === undefined) return;
              void readImageFile(parameter, file).then((result) => {
                if ('error' in result) {
                  setFileError(result.error);
                } else {
                  setFileError(null);
                  onChange(result.value);
                }
                input.value = '';
              });
            }}
          />
          {text !== '' && (
            <Button
              data-testid={`${testId}-clear`}
              onClick={() => {
                setFileError(null);
                onChange('');
              }}
            >
              Remove image
            </Button>
          )}
        </span>
      );
      break;
    case 'audio':
      control = (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted" data-testid={`${testId}-summary`}>
            {audioSummary(text === '' ? null : text)}
          </span>
          <input
            {...common}
            type="file"
            accept=".ogg,audio/ogg"
            className="text-xs"
            onChange={(event) => {
              const input = event.target;
              const file = input.files?.[0];
              if (file === undefined) return;
              void readAudioFile(parameter, file).then((result) => {
                if ('error' in result) {
                  setFileError(result.error);
                } else {
                  setFileError(null);
                  onChange(result.value);
                }
                input.value = '';
              });
            }}
          />
          {text !== '' && (
            <Button
              data-testid={`${testId}-clear`}
              onClick={() => {
                setFileError(null);
                onChange('');
              }}
            >
              Remove sound
            </Button>
          )}
        </span>
      );
      break;
    case 'string':
      control = (
        <input
          {...common}
          type="text"
          className={fieldClass}
          value={text}
          maxLength={parameter.maxLength}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
      );
      break;
  }

  const preview = showsIdPreview(parameter) ? derivedId(text) : '';
  return (
    <div className="flex flex-col gap-0.5" data-testid={`${testId}-field`}>
      {parameter.type === 'boolean' ? (
        <label htmlFor={inputId} className="flex items-center gap-2">
          {control}
          <span>{parameter.label}</span>
        </label>
      ) : parameter.type === 'set' ? (
        control
      ) : (
        <>
          <label htmlFor={inputId}>{parameter.label}</label>
          {control}
        </>
      )}
      {parameter.description !== undefined && (
        <p id={descriptionId} className="text-xs text-muted">
          {parameter.description}
        </p>
      )}
      {showsIdPreview(parameter) && shownError === null && preview !== '' && (
        <p className="text-xs text-muted" data-testid={`${testId}-id`}>
          Ids start with <code>{preview}</code>
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
