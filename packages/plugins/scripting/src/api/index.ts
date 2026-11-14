/**
 * The script API v1 description and its generated typings (ADR 0032 D1).
 *
 * `SCRIPT_API` is `api/script-api-v1.json`, imported as JSON and checked by
 * {@link parseScriptApi}. `MSM_RUNTIME_TYPINGS` is the text of `api/msm-runtime.d.ts`: it is
 * generated from `SCRIPT_API` when this module loads (plugin code reads no files), and
 * `test/typings.test.ts` pins it byte for byte to the checked-in file.
 */
import raw from '../../api/script-api-v1.json' with { type: 'json' };
import { generateTypings } from './generate';
import { parseScriptApi, type ScriptApi } from './types';

export { checkScriptApi, generateTypings } from './generate';
export type {
  ScriptApi,
  ScriptApiAlias,
  ScriptApiEvent,
  ScriptApiGlobal,
  ScriptApiMember,
  ScriptApiMethod,
  ScriptApiNamespace,
  ScriptApiParam,
  ScriptApiProperty,
  ScriptApiSignature,
  ScriptApiType,
} from './types';
export { parseScriptApi, ScriptApiError } from './types';

/** The script API v1 description, `api/script-api-v1.json`. */
export const SCRIPT_API: ScriptApi = parseScriptApi(raw);

/** The text of `msm-runtime.d.ts`, the typings of {@link SCRIPT_API}. */
export const MSM_RUNTIME_TYPINGS: string = generateTypings(SCRIPT_API);
