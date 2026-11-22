/**
 * `@msm/plugin-scripting`: built-in MSM plugin for runtime scripts (ADRs 0031, 0032): the
 * `msm:script` kind and its lowering to `msm/<ns>/script/<path>.ts`, the `msm:command` kind
 * (ADR 0096 D1) and its lowering to `msm/<ns>/command/<path>.json`, the `scripting.*` and
 * `commands.*` project validators, the "New element" templates, and the script API description
 * with its typings generator.
 */
import { definePlugin } from '@msm/plugin-api';
import { scriptingKinds } from './kinds';
import { commandTemplates, scriptingTemplates } from './templates';
import { scriptingValidators } from './validators';
import { commandValidators } from './validators-commands';

export { GAME_RULE_PROBLEM_CODES, gameRuleValidators } from './validators-game-rules';

import { gameRuleValidators } from './validators-game-rules';

export * from './api/index';
export * from './kinds';
export * from './lowering';
export { commandTemplates, scriptingTemplates } from './templates';
export {
  findHandlerDefinitions,
  type HandlerDefinition,
  RUN_SCRIPT_OWNER_KINDS,
  SCRIPTING_PROBLEM_CODES,
  scriptingValidators,
} from './validators';
export {
  COMMAND_NAME_PATTERN,
  COMMAND_PROBLEM_CODES,
  type CommandLiteral,
  commandLiterals,
  commandValidators,
  RANGED_ARGUMENT_TYPES,
} from './validators-commands';

export default definePlugin({
  id: 'msm.scripting',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...scriptingKinds],
    elementTemplates: [...scriptingTemplates, ...commandTemplates],
    validators: [...scriptingValidators, ...commandValidators, ...gameRuleValidators],
  },
});
