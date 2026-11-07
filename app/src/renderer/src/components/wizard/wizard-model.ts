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
 * (a number field may hold text that is not a number yet), a boolean for boolean parameters,
 * the ticked values for set parameters and, for image parameters, the PNG `data:` URL or `''`
 * when no image is chosen.
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
    case 'image':
    case 'audio':
      return '';
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
  if (parameter.type === 'image' || parameter.type === 'audio') {
    return raw === '' ? null : String(raw);
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
    default:
      return null;
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
    case 'audio': {
      if (typeof raw !== 'string') return NOT_OGG;
      if (raw === '') return null;
      const bytes = bytesOfOggDataUrl(raw);
      return bytes === null ? NOT_OGG : checkOggBytes(parameter, bytes);
    }
    case 'image': {
      if (typeof raw !== 'string') return NOT_A_PNG;
      if (raw === '') return null;
      const bytes = bytesOfPngDataUrl(raw);
      return bytes === null ? NOT_A_PNG : checkPngBytes(parameter, bytes);
    }
  }
}

// Image parameters (ADR 0044 D7) ------------------------------------------------------------

/** The largest image file when an image parameter sets no `maxBytes`: 1 MB. */
export const DEFAULT_IMAGE_MAX_BYTES = 1_048_576;

/** The prefix of an image parameter's value. */
export const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

const NOT_A_PNG = 'Choose a PNG image.';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The width and height in pixels of PNG bytes (from `IHDR`), or `null` when they are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 33 || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width === 0 || height === 0 ? null : { width, height };
}

/** Formats a byte count for a message: `1 MB`, `512 KB` or `300 bytes`. */
function showBytes(bytes: number): string {
  if (bytes >= 1_048_576 && bytes % 1_048_576 === 0) return `${bytes / 1_048_576} MB`;
  if (bytes >= 1024) return `${Math.floor(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

/**
 * Checks a picked file's bytes against an image parameter (ADR 0044 D7): the PNG signature and
 * a readable size, at most `maxBytes` (1 MB by default) and at most `maxSize` pixels wide and
 * high.
 *
 * @returns An error message in British English, or `null` when the image is accepted.
 */
export function checkPngBytes(
  parameter: StarterParameter & { type: 'image' },
  bytes: Uint8Array,
): string | null {
  const size = pngSize(bytes);
  if (size === null) return NOT_A_PNG;
  const maxBytes = parameter.maxBytes ?? DEFAULT_IMAGE_MAX_BYTES;
  if (bytes.length > maxBytes) return `Choose an image of at most ${showBytes(maxBytes)}.`;
  const maxSize = parameter.maxSize;
  if (maxSize !== undefined && (size.width > maxSize || size.height > maxSize)) {
    return `Choose an image of at most ${maxSize} by ${maxSize} pixels.`;
  }
  return null;
}

/** PNG bytes as an image parameter's value, a `data:image/png;base64,` URL. */
export function pngDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return `${PNG_DATA_URL_PREFIX}${btoa(binary)}`;
}

/** The bytes of a `data:image/png;base64,` URL, or `null` for anything else. */
export function bytesOfPngDataUrl(value: string): Uint8Array | null {
  if (!value.startsWith(PNG_DATA_URL_PREFIX)) return null;
  try {
    return Uint8Array.from(atob(value.slice(PNG_DATA_URL_PREFIX.length)), (char) =>
      char.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

/**
 * Reads a picked file for an image parameter: its bytes checked with {@link checkPngBytes}, then
 * turned into the parameter's value.
 *
 * @returns The value, or the error to show (the field keeps its previous value).
 */
export async function readImageFile(
  parameter: StarterParameter & { type: 'image' },
  file: Blob,
): Promise<{ value: string } | { error: string }> {
  const maxBytes = parameter.maxBytes ?? DEFAULT_IMAGE_MAX_BYTES;
  if (file.size > maxBytes) return { error: `Choose an image of at most ${showBytes(maxBytes)}.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const error = checkPngBytes(parameter, bytes);
  return error === null ? { value: pngDataUrl(bytes) } : { error };
}

/** The summary text of an image parameter's value: its size in pixels, or `None`. */
export function imageSummary(value: Json): string {
  const bytes = typeof value === 'string' ? bytesOfPngDataUrl(value) : null;
  const size = bytes === null ? null : pngSize(bytes);
  return size === null ? 'None' : `PNG image, ${size.width} by ${size.height} pixels`;
}

// Audio parameters (ADR 0049) ---------------------------------------------------------------

/** The largest sound file when an audio parameter sets no `maxBytes`: 8 MB. */
export const DEFAULT_AUDIO_MAX_BYTES = 8_388_608;

/** The prefix of an audio parameter's value. */
export const OGG_DATA_URL_PREFIX = 'data:audio/ogg;base64,';

const NOT_OGG = 'Choose an Ogg Vorbis sound (.ogg).';
const OGG_CAPTURE = [0x4f, 0x67, 0x67, 0x53];
const VORBIS_ID = [0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73];

/**
 * The sample rate, channels and length of Ogg Vorbis bytes, read from the container (the
 * Vorbis identification header and the last page's granule position), or `null` when they
 * are not Ogg Vorbis.
 */
export function oggInfo(
  bytes: Uint8Array,
): { sampleRate: number; channels: number; seconds: number } | null {
  const isPage = (at: number): boolean => OGG_CAPTURE.every((byte, i) => bytes[at + i] === byte);
  if (bytes.length < 58 || !isPage(0)) return null;
  const packet = 27 + (bytes[26] ?? 0);
  if (packet + 16 > bytes.length || !VORBIS_ID.every((byte, i) => bytes[packet + i] === byte)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = bytes[packet + 11] ?? 0;
  const sampleRate = view.getUint32(packet + 12, true);
  if (channels === 0 || sampleRate === 0) return null;
  for (let at = bytes.length - 27; at >= 0; at -= 1) {
    if (!isPage(at)) continue;
    const high = view.getUint32(at + 10, true);
    if (high === 0xffffffff) continue;
    const samples = high * 2 ** 32 + view.getUint32(at + 6, true);
    return { sampleRate, channels, seconds: samples / sampleRate };
  }
  return null;
}

/**
 * Checks a picked file's bytes against an audio parameter (ADR 0049): Ogg Vorbis with a
 * readable length, at most `maxBytes` (8 MB by default).
 *
 * @returns An error message, or `null` when the sound is accepted.
 */
export function checkOggBytes(
  parameter: StarterParameter & { type: 'audio' },
  bytes: Uint8Array,
): string | null {
  const maxBytes = parameter.maxBytes ?? DEFAULT_AUDIO_MAX_BYTES;
  if (bytes.length > maxBytes) return `Choose a sound of at most ${showBytes(maxBytes)}.`;
  return oggInfo(bytes) === null ? NOT_OGG : null;
}

/** Ogg bytes as an audio parameter's value, a `data:audio/ogg;base64,` URL. */
export function oggDataUrl(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return `${OGG_DATA_URL_PREFIX}${btoa(binary)}`;
}

/** The bytes of a `data:audio/ogg;base64,` URL, or `null` for anything else. */
export function bytesOfOggDataUrl(value: string): Uint8Array | null {
  if (!value.startsWith(OGG_DATA_URL_PREFIX)) return null;
  try {
    return Uint8Array.from(atob(value.slice(OGG_DATA_URL_PREFIX.length)), (char) =>
      char.charCodeAt(0),
    );
  } catch {
    return null;
  }
}

/** Reads a picked file for an audio parameter; the value, or the error to show. */
export async function readAudioFile(
  parameter: StarterParameter & { type: 'audio' },
  file: Blob,
): Promise<{ value: string } | { error: string }> {
  const maxBytes = parameter.maxBytes ?? DEFAULT_AUDIO_MAX_BYTES;
  if (file.size > maxBytes) return { error: `Choose a sound of at most ${showBytes(maxBytes)}.` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const error = checkOggBytes(parameter, bytes);
  return error === null ? { value: oggDataUrl(bytes) } : { error };
}

/** The summary of an audio parameter's value: `Ogg Vorbis, 2:05, mono`, or `None`. */
export function audioSummary(value: Json): string {
  const bytes = typeof value === 'string' ? bytesOfOggDataUrl(value) : null;
  const info = bytes === null ? null : oggInfo(bytes);
  if (info === null) return 'None';
  const total = Math.ceil(info.seconds);
  const time = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return `Ogg Vorbis, ${time}, ${info.channels === 1 ? 'mono' : info.channels === 2 ? 'stereo' : `${info.channels} channels`}`;
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
