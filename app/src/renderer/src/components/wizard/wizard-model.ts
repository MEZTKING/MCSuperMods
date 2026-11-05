/**
 * The pure model of the starter wizard (ADR 0040 D1): steps from a starter's `parameters`,
 * default and editing values, validation per parameter and the id preview of name fields.
 * The host validates every parameter from its declaration only (ADR 0040 D3); the starter's
 * `build` receives the converted values in `BundleContext.values`.
 *
 * @packageDocumentation
 */

import type { Json, ProjectStarter, StarterParameter, TargetFacts } from '@msm/plugin-api';

/** The title of the step that holds parameters without a `group`. */
export const UNGROUPED_STEP_TITLE = 'Options';

/** The title of the wizard's first step, the starter list. */
export const CHOOSE_STARTER_TITLE = 'Choose a starter';

/** The title of the wizard's last step, and the label of its button. */
export const CREATE_STEP_TITLE = 'Choose folder and create';

/** One step of parameters: a group in declaration order. */
export interface WizardStep {
  title: string;
  parameters: readonly StarterParameter[];
}

/**
 * The parameter steps of a starter: one per distinct `group` in the order the groups first
 * appear, parameters in declaration order; parameters without a group share the step
 * {@link UNGROUPED_STEP_TITLE}, placed where the first of them appears. Empty for a starter
 * without parameters.
 */
export function wizardSteps(parameters: readonly StarterParameter[] | undefined): WizardStep[] {
  const steps: { title: string; parameters: StarterParameter[] }[] = [];
  for (const parameter of parameters ?? []) {
    const title = parameter.group ?? UNGROUPED_STEP_TITLE;
    let step = steps.find((entry) => entry.title === title);
    if (step === undefined) {
      step = { title, parameters: [] };
      steps.push(step);
    }
    step.parameters.push(parameter);
  }
  return steps;
}

/** Whether a starter asks questions (has at least one parameter). */
export function hasParameters(starter: ProjectStarter | null | undefined): boolean {
  return (starter?.parameters ?? []).length > 0;
}

/**
 * The editing value of one parameter: text for string, number, colour and choice parameters
 * (a number field may hold text that is not a number yet), a boolean for boolean parameters
 * and the ticked values for set parameters.
 */
export type RawValue = string | boolean | readonly string[];

/** What the form holds while the user edits, keyed by parameter id. */
export type RawValues = Readonly<Record<string, RawValue>>;

/** The editing value of a parameter's default. */
export function defaultRawValue(parameter: StarterParameter): RawValue {
  switch (parameter.type) {
    case 'boolean':
      return parameter.default;
    case 'number':
      return String(parameter.default);
    case 'set':
      return [...parameter.default];
    default:
      return parameter.default;
  }
}

/**
 * The ticked values of a set parameter after ticking (`checked`) or unticking `value`, in the
 * order of the parameter's choices.
 */
export function toggleSetValue(
  parameter: StarterParameter & { type: 'set' },
  raw: RawValue | undefined,
  value: string,
  checked: boolean,
): string[] {
  const current = Array.isArray(raw) ? raw : [];
  return parameter.choices
    .map((choice) => choice.value)
    .filter((choice) => (choice === value ? checked : current.includes(choice)));
}

/** The editing values of every parameter's default. */
export function defaultRawValues(parameters: readonly StarterParameter[] | undefined): RawValues {
  return Object.fromEntries(
    (parameters ?? []).map((parameter) => [parameter.id, defaultRawValue(parameter)]),
  );
}

/**
 * The value `build` receives for one parameter: numbers parsed, colours in lower case. Falls
 * back to the default for a value that does not validate.
 */
export function toValue(parameter: StarterParameter, raw: RawValue | undefined): Json {
  if (raw === undefined || validateParameter(parameter, raw) !== null) {
    return parameter.type === 'set' ? [...parameter.default] : parameter.default;
  }
  switch (parameter.type) {
    case 'boolean':
      return raw === true;
    case 'number':
      return Number(String(raw).trim());
    case 'colour':
      return String(raw).toLowerCase();
    case 'string':
      return String(raw);
    case 'choice':
      return String(raw);
    case 'set': {
      const chosen = Array.isArray(raw) ? raw : [];
      return parameter.choices
        .map((choice) => choice.value)
        .filter((choice) => chosen.includes(choice));
    }
  }
}

/**
 * `BundleContext.values`: every declared parameter present, defaults filled in for missing or
 * invalid values (ADR 0036 D5).
 */
export function toValues(
  parameters: readonly StarterParameter[] | undefined,
  raw: RawValues,
): Record<string, Json> {
  return Object.fromEntries(
    (parameters ?? []).map((parameter) => [parameter.id, toValue(parameter, raw[parameter.id])]),
  );
}

/** Formats a number for a message without a trailing `.0`. */
const show = (value: number): string => String(value);

/**
 * Checks one value against its parameter's declaration (ADR 0040 D1: pattern, length, range,
 * step, choices, non-empty; for a set, known values and at least `min` of them, ADR 0043 D1).
 *
 * @returns An error message in British English, or `null` when the value is valid.
 */
export function validateParameter(
  parameter: StarterParameter,
  raw: RawValue | undefined,
): string | null {
  if (Array.isArray(raw) && parameter.type !== 'set') return 'Enter a value.';
  switch (parameter.type) {
    case 'boolean':
      return typeof raw === 'boolean' ? null : 'Choose yes or no.';
    case 'string': {
      const value = typeof raw === 'string' ? raw : '';
      if (value.trim() === '') return 'Enter a value.';
      if (parameter.maxLength !== undefined && value.length > parameter.maxLength) {
        return `Use at most ${parameter.maxLength} characters.`;
      }
      if (parameter.pattern !== undefined && !matchesWhole(parameter.pattern, value)) {
        return 'This value does not have the expected form.';
      }
      return null;
    }
    case 'number': {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text === '') return 'Enter a number.';
      const value = Number(text);
      if (!Number.isFinite(value)) return 'Enter a number.';
      if (parameter.min !== undefined && value < parameter.min) {
        return `Enter at least ${show(parameter.min)}.`;
      }
      if (parameter.max !== undefined && value > parameter.max) {
        return `Enter at most ${show(parameter.max)}.`;
      }
      if (parameter.step !== undefined && parameter.step > 0) {
        const steps = (value - (parameter.min ?? 0)) / parameter.step;
        if (Math.abs(steps - Math.round(steps)) > 1e-9) {
          return parameter.step === 1
            ? 'Enter a whole number.'
            : `Use steps of ${show(parameter.step)}.`;
        }
      }
      return null;
    }
    case 'colour':
      return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw)
        ? null
        : 'Enter a colour as #rrggbb.';
    case 'choice':
      return typeof raw === 'string' && parameter.choices.some((choice) => choice.value === raw)
        ? null
        : 'Choose one of the options.';
    case 'set': {
      if (!Array.isArray(raw)) return 'Choose from the options.';
      const values: readonly string[] = raw;
      if (values.some((value) => !parameter.choices.some((choice) => choice.value === value))) {
        return 'Choose from the options.';
      }
      const min = parameter.min ?? 0;
      const chosen = new Set(values).size;
      if (chosen < min) return min === 1 ? 'Choose at least one.' : `Choose at least ${min}.`;
      return null;
    }
  }
}

/** Whether `value` matches the whole of `pattern`; an invalid pattern accepts everything. */
function matchesWhole(pattern: string, value: string): boolean {
  let regex: RegExp;
  try {
    regex = new RegExp(`^(?:${pattern})$`, 'u');
  } catch {
    return true;
  }
  return regex.test(value);
}

/** The errors of the given parameters, keyed by parameter id; only invalid ones appear. */
export function stepErrors(
  parameters: readonly StarterParameter[],
  raw: RawValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const parameter of parameters) {
    const error = validateParameter(parameter, raw[parameter.id]);
    if (error !== null) errors[parameter.id] = error;
  }
  return errors;
}

/**
 * Whether the wizard shows an id preview under a string parameter: its id is `name` or ends
 * in `_name` (the library's `ore_name`, `sword_name`, `mob_name`), the convention for names
 * that ids derive from.
 */
export function showsIdPreview(parameter: StarterParameter): boolean {
  return parameter.type === 'string' && (parameter.id === 'name' || parameter.id.endsWith('_name'));
}

/**
 * The id a name derives (ADR 0040 D2), as the library's starters derive it: lower case,
 * runs of spaces to one `_`, characters outside `[a-z0-9_]` dropped. `Ruby` gives `ruby`,
 * `Ruby Golem` gives `ruby_golem`. Empty for a name with no usable characters.
 */
export function derivedId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** The targets a starter can be created for (`supports`, ADR 0036 D4); all for `null`. */
export function targetsFor(
  starter: ProjectStarter | null,
  targets: readonly TargetFacts[],
): TargetFacts[] {
  return targets.filter((target) => starter?.supports?.(target) ?? true);
}

/**
 * The target to preselect: `preferred` when it is offered, else the first offered release
 * target, else the first offered target, else `preferred` (no targets to choose from).
 */
export function pickTargetId(offered: readonly TargetFacts[], preferred: string): string {
  if (offered.some((target) => target.id === preferred)) return preferred;
  return offered.find((target) => target.channel === 'release')?.id ?? offered[0]?.id ?? preferred;
}

/** The text of a target option: its Minecraft version, marked when it is a snapshot. */
export function targetLabel(target: TargetFacts): string {
  return target.channel === 'snapshot'
    ? `Minecraft ${target.mcVersion} (snapshot)`
    : `Minecraft ${target.mcVersion}`;
}
