/**
 * A colour picker bound to an integer RGB field (plan D6): shows `#rrggbb` with a swatch and
 * writes the integer the game reads. Integer, `#rrggbb` and 0–1 float list values are shown;
 * any other form (an attribute modifier or keyframes) is left to the Advanced form.
 */

import type { Json } from '@msm/core';
import { X } from 'lucide-react';
import { useId } from 'react';
import { iconButtonClass } from '../../components/ui/Button';
import { colourToHex, hexToColour } from './worldgen-model';

export interface ColourFieldProps {
  /** Visible and accessible name, for example "Sky colour". */
  label: string;
  value: Json | undefined;
  /** Called with the new integer RGB, or `undefined` when cleared. */
  onChange(value: number | undefined): void;
  /** `data-testid` of the field's wrapper. */
  testId?: string;
  /** Whether the field may be removed (optional fields). */
  clearable?: boolean;
}

/** The colour shown before an absent field is set. */
const UNSET = '#000000';

export function ColourField({ label, value, onChange, testId, clearable }: ColourFieldProps) {
  const id = useId();
  const hex = colourToHex(value);
  const other = value !== undefined && hex === null;
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <label htmlFor={id} className="w-36 shrink-0 text-sm">
        {label}
      </label>
      {other ? (
        <span className="text-muted text-xs">Set by a modifier; edit it under Advanced.</span>
      ) : (
        <>
          <input
            id={id}
            type="color"
            className="h-7 w-10 cursor-pointer rounded border border-border bg-bg p-0.5"
            value={hex ?? UNSET}
            onChange={(event) => onChange(hexToColour(event.target.value))}
          />
          <span
            aria-hidden
            className="inline-block h-4 w-4 rounded border border-border"
            style={{ background: hex ?? 'transparent' }}
          />
          <code className="font-mono text-xs">{hex ?? 'not set'}</code>
          {clearable === true && value !== undefined && (
            <button
              type="button"
              aria-label={`Clear ${label}`}
              className={iconButtonClass}
              onClick={() => onChange(undefined)}
            >
              <X size={12} aria-hidden />
            </button>
          )}
        </>
      )}
    </div>
  );
}
