/**
 * `@msm/plugin-scripting`: built-in MSM plugin for runtime scripts (ADRs 0031, 0032): the
 * `msm:script` kind and its lowering to `msm/<ns>/script/<path>.ts`, the `scripting.*` project
 * validators, the "New element" templates, and the script API description with its typings
 * generator.
 */
import { definePlugin } from '@msm/plugin-api';
import { scriptingKinds } from './kinds';
import { scriptingTemplates } from './templates';
import { scriptingValidators } from './validators';

export * from './api/index';
export * from './kinds';
export * from './lowering';
export { scriptingTemplates } from './templates';
export {
  findHandlerDefinitions,
  type HandlerDefinition,
  RUN_SCRIPT_OWNER_KINDS,
  SCRIPTING_PROBLEM_CODES,
  scriptingValidators,
} from './validators';

export default definePlugin({
  id: 'msm.scripting',
  apiVersion: '^0.8.0',
  contributes: {
    elementKinds: [...scriptingKinds],
    elementTemplates: [...scriptingTemplates],
    validators: [...scriptingValidators],
  },
});
