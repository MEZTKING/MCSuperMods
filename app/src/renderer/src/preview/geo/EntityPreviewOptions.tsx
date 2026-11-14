/**
 * The entity preview's switcher (B297, ADR 0073 D5): a variant picker for mobs with
 * `msm:variants` and a baby toggle for mobs with `msm:breedable`. It sits above the geo canvas
 * and holds no project state: the choice is passed to `resolveGeoScene` as
 * {@link GeoSceneOptions}. Light (no gl-matrix), so it stays in the panel's chunk.
 *
 * @packageDocumentation
 */

import { useId } from 'react';
import { inputClass } from '../../forms';
import type { EntityPreviewChoices, GeoSceneOptions } from './subject';

/** Props of {@link EntityPreviewOptions}. */
export interface EntityPreviewOptionsProps {
  choices: EntityPreviewChoices;
  value: GeoSceneOptions;
  onChange(next: GeoSceneOptions): void;
}

/** The variant picker and baby toggle; renders nothing when the entity has neither. */
export function EntityPreviewOptions({ choices, value, onChange }: EntityPreviewOptionsProps) {
  const id = useId();
  if (choices.variants.length === 0 && choices.babyScale === null) return null;
  const variant =
    value.variant !== undefined && choices.variants.some((entry) => entry.id === value.variant)
      ? value.variant
      : '';
  return (
    <div className="flex flex-wrap items-end gap-3 text-xs" data-testid="preview-entity-options">
      {choices.variants.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <label htmlFor={id} className="text-muted">
            Variant
          </label>
          <select
            id={id}
            className={inputClass}
            data-testid="preview-entity-variant"
            value={variant}
            onChange={(event) =>
              onChange({
                ...value,
                variant: event.target.value === '' ? undefined : event.target.value,
              })
            }
          >
            <option value="">(base texture)</option>
            {choices.variants.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id}
              </option>
            ))}
          </select>
        </div>
      )}
      {choices.babyScale !== null && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            data-testid="preview-entity-baby"
            checked={value.baby === true}
            onChange={(event) => onChange({ ...value, baby: event.target.checked })}
          />
          Show as a baby
        </label>
      )}
    </div>
  );
}
