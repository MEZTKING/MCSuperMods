/**
 * The Vehicle Studio's bone pickers (B419, ADR 0091 D1): a single bone (the turret, its barrel, a
 * muzzle) and a list of bones (wheels, steering, rotors, propellers), both over the bones of the
 * vehicle's geometry. A bone the geometry does not have stays listed, marked "not in the model",
 * so the picker never hides a value. Without a project geometry the single picker is a text field
 * and the list picker says so (bones are then typed under Advanced).
 *
 * @packageDocumentation
 */

import { useId } from 'react';
import { inputClass } from '../../../forms';
import { boneChoices, boneListChoices, toggledBone } from './vehicle-model';

/** The note a picker shows for a bone the geometry lacks. */
export const NOT_IN_MODEL = 'not in the model';

/** A single bone: a select over the geometry's bones, or a text field without a geometry. */
export function BoneSelect(props: {
  label: string;
  /** The geometry's bones, or `null` when the geometry is not a project element. */
  bones: readonly string[] | null;
  value: string | undefined;
  onChange(bone: string | undefined): void;
  testId: string;
  /** The empty choice's words; defaults to "(none)". */
  emptyLabel?: string;
}) {
  const id = useId();
  const current = props.value ?? '';
  if (props.bones === null) {
    return (
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        <label htmlFor={id} className="text-muted">
          {props.label}
        </label>
        <input
          id={id}
          type="text"
          className={`${inputClass} w-36 font-mono`}
          data-testid={props.testId}
          value={current}
          placeholder="bone name"
          onChange={(event) =>
            props.onChange(event.target.value === '' ? undefined : event.target.value)
          }
        />
      </div>
    );
  }
  const choices = boneChoices(props.bones, current);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <select
        id={id}
        className={inputClass}
        data-testid={props.testId}
        value={current}
        onChange={(event) =>
          props.onChange(event.target.value === '' ? undefined : event.target.value)
        }
      >
        <option value="">{props.emptyLabel ?? '(none)'}</option>
        {choices.map((choice) => (
          <option key={choice.bone} value={choice.bone}>
            {choice.known ? choice.bone : `${choice.bone} (${NOT_IN_MODEL})`}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A list of bones: one checkbox per bone of the geometry, in file order. */
export function BoneListPicker(props: {
  label: string;
  bones: readonly string[] | null;
  value: readonly string[];
  onChange(bones: string[]): void;
  testId: string;
}) {
  const { bones } = props;
  if (bones === null) {
    return (
      <fieldset className="flex flex-col gap-1 text-xs" data-testid={props.testId}>
        <legend className="text-muted">{props.label}</legend>
        <p className="text-muted">
          {props.value.length === 0 ? 'None.' : props.value.join(', ')} Pick a geo model of this
          project to choose bones here.
        </p>
      </fieldset>
    );
  }
  const choices = boneListChoices(bones, props.value);
  return (
    <fieldset className="flex flex-col gap-1 text-xs" data-testid={props.testId}>
      <legend className="text-muted">{props.label}</legend>
      {choices.length === 0 && <p className="text-muted">The model has no bones.</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {choices.map((choice) => (
          <label key={choice.bone} className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid={`${props.testId}-${choice.bone}`}
              checked={props.value.includes(choice.bone)}
              onChange={(event) =>
                props.onChange(toggledBone(bones, props.value, choice.bone, event.target.checked))
              }
            />
            <span className="font-mono">{choice.bone}</span>
            {!choice.known && <span className="text-warning">({NOT_IN_MODEL})</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
