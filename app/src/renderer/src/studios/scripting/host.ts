/**
 * What the Script Studio asks of the host beyond `StudioProps`: the `msm-runtime.d.ts` text
 * (`session.scriptTypings`), which the Monaco TypeScript service takes as an extra lib. `App`
 * provides it around the Form tab; without a provider the typings `@msm/plugin-scripting`
 * generates are used.
 *
 * @packageDocumentation
 */

import { MSM_RUNTIME_TYPINGS } from '@msm/plugin-scripting';
import { createContext, useContext } from 'react';

/** The host values of the Script Studio. */
export interface ScriptStudioHost {
  /** The runtime typings (`msm-runtime.d.ts`). */
  typings: string;
}

/** The default host: the plugin's generated typings. */
export const DEFAULT_SCRIPT_STUDIO_HOST: ScriptStudioHost = Object.freeze({
  typings: MSM_RUNTIME_TYPINGS,
});

/** Provided by `App`. */
export const ScriptStudioHostContext = createContext<ScriptStudioHost>(DEFAULT_SCRIPT_STUDIO_HOST);

/** The Script Studio host. */
export function useScriptStudioHost(): ScriptStudioHost {
  return useContext(ScriptStudioHostContext);
}
