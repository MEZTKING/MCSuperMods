/**
 * The steps of a parameterised starter (ADR 0040 D1): one step per parameter group, then the
 * step "Choose folder and create" with a summary and the target select. Every step validates
 * its fields before "Next"; "Back" keeps the values. The values and the target are controlled
 * by the host (the New project dialog), so they survive a trip back to the starter list.
 *
 * Test ids: step containers `wizard-step-<n>` (numbered from {@link StarterWizardProps.firstStep}),
 * fields `param-<id>`, buttons `wizard-back`, `wizard-next` and the create button
 * ({@link StarterWizardProps.createTestId}), the target select `new-project-target`.
 *
 * @packageDocumentation
 */

import type { ProjectStarter, TargetFacts } from '@msm/plugin-api';
import { type FormEvent, useId, useState } from 'react';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import { ParameterField } from './ParameterField';
import {
  CREATE_STEP_TITLE,
  pickTargetId,
  type RawValues,
  stepErrors,
  targetLabel,
  targetsFor,
  toValue,
  wizardSteps,
} from './wizard-model';

/** Props of {@link TargetSelect}. */
export interface TargetSelectProps {
  /** The targets to offer, already limited to the chosen starter's. */
  targets: readonly TargetFacts[];
  targetId: string;
  onChange(targetId: string): void;
}

/**
 * The target select of the last step (`data-testid="new-project-target"`), with a "snapshot"
 * badge when the chosen target is a snapshot. Renders nothing without targets.
 */
export function TargetSelect({ targets, targetId, onChange }: TargetSelectProps) {
  const id = useId();
  const hintId = useId();
  if (targets.length === 0) return null;
  const chosen = targets.find((target) => target.id === targetId);
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id}>Minecraft version</label>
      <span className="flex items-center gap-2">
        <select
          id={id}
          className={fieldClass}
          data-testid="new-project-target"
          aria-describedby={hintId}
          value={targetId}
          onChange={(event) => onChange(event.target.value)}
        >
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {targetLabel(target)}
            </option>
          ))}
        </select>
        {chosen?.channel === 'snapshot' && (
          <span
            className="rounded border border-border px-1 text-[0.7rem] text-muted"
            data-testid="new-project-target-snapshot"
          >
            snapshot
          </span>
        )}
      </span>
      <p id={hintId} className="text-xs text-muted">
        {chosen?.channel === 'snapshot'
          ? 'A snapshot target follows a Minecraft version that is not released yet; its facts may change when it is re-pinned.'
          : 'The project exports for this version. You can upgrade it later with File > Upgrade Project Target.'}
      </p>
    </div>
  );
}

/** Props of {@link StarterWizard}. */
export interface StarterWizardProps {
  /** A starter with parameters. */
  starter: ProjectStarter;
  /** Every target the host offers; the wizard offers those the starter supports. */
  targets: readonly TargetFacts[];
  targetId: string;
  onTargetChange(targetId: string): void;
  values: RawValues;
  onValuesChange(values: RawValues): void;
  /** The number of the first parameter step in test ids and the progress text; default 2. */
  firstStep?: number;
  /** Leaves the first parameter step (back to the starter list); without it Back is hidden there. */
  onBack?(): void;
  onCancel(): void;
  /** Called on the last step once every value is valid. */
  onCreate(): void;
  /** The create button's test id; default `wizard-create`. */
  createTestId?: string;
}

/** The parameter steps and the create step of one starter. */
export function StarterWizard(props: StarterWizardProps) {
  const steps = wizardSteps(props.starter.parameters);
  const firstStep = props.firstStep ?? 2;
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const headingId = useId();
  const isLast = index >= steps.length;
  const current = steps[index];
  const offered = targetsFor(props.starter, props.targets);
  const total = firstStep - 1 + steps.length + 1;

  const change = (id: string, value: string | boolean): void => {
    const next = { ...props.values, [id]: value };
    props.onValuesChange(next);
    if (errors[id] !== undefined && current !== undefined) {
      setErrors(stepErrors(current.parameters, next));
    }
  };

  const next = (): void => {
    if (current === undefined) return;
    const found = stepErrors(current.parameters, props.values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setIndex(index + 1);
  };

  const back = (): void => {
    setErrors({});
    if (index === 0) props.onBack?.();
    else setIndex(index - 1);
  };

  const create = (): void => {
    // Every step was validated on Next; check all again in case values changed elsewhere.
    for (const [stepIndex, step] of steps.entries()) {
      const found = stepErrors(step.parameters, props.values);
      if (Object.keys(found).length > 0) {
        setIndex(stepIndex);
        setErrors(found);
        return;
      }
    }
    props.onCreate();
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (isLast) create();
    else next();
  };

  const title = isLast ? CREATE_STEP_TITLE : (current?.title ?? CREATE_STEP_TITLE);
  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" aria-labelledby={headingId}>
      <p className="text-xs text-muted" data-testid="wizard-progress">
        Step {firstStep + index} of {total}
      </p>
      <h3 id={headingId} className="m-0 text-sm font-semibold">
        {props.starter.title}: {title}
      </h3>
      <div
        className="flex max-h-[55vh] flex-col gap-2 overflow-auto"
        data-testid={`wizard-step-${firstStep + index}`}
      >
        {current !== undefined && !isLast
          ? current.parameters.map((parameter, position) => (
              <ParameterField
                key={parameter.id}
                parameter={parameter}
                value={props.values[parameter.id] ?? ''}
                error={errors[parameter.id] ?? null}
                autoFocus={position === 0}
                onChange={(value) => change(parameter.id, value)}
              />
            ))
          : null}
        {isLast && (
          <>
            <dl
              className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs"
              data-testid="wizard-summary"
            >
              {(props.starter.parameters ?? []).map((parameter) => {
                const value = toValue(parameter, props.values[parameter.id]);
                const shown =
                  parameter.type === 'boolean'
                    ? value === true
                      ? 'Yes'
                      : 'No'
                    : parameter.type === 'choice'
                      ? (parameter.choices.find((choice) => choice.value === value)?.label ??
                        String(value))
                      : String(value);
                return [
                  <dt key={`${parameter.id}-label`} className="text-muted">
                    {parameter.label}
                  </dt>,
                  <dd key={`${parameter.id}-value`} className="m-0">
                    {shown}
                  </dd>,
                ];
              })}
            </dl>
            <TargetSelect
              targets={offered}
              targetId={pickTargetId(offered, props.targetId)}
              onChange={props.onTargetChange}
            />
            <p className="text-xs text-muted">
              Next you choose an empty folder; its name becomes the project's namespace.
            </p>
          </>
        )}
      </div>
      <div className="mt-2 flex gap-1.5">
        {(index > 0 || props.onBack !== undefined) && (
          <Button onClick={back} data-testid="wizard-back">
            Back
          </Button>
        )}
        {isLast ? (
          <Button type="submit" data-testid={props.createTestId ?? 'wizard-create'}>
            {CREATE_STEP_TITLE}
          </Button>
        ) : (
          <Button type="submit" data-testid="wizard-next">
            Next
          </Button>
        )}
        <Button onClick={props.onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
