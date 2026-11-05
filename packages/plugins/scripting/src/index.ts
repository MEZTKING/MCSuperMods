/**
 * `@msm/plugin-scripting`: built-in MSM plugin for runtime scripts (ADRs 0031, 0032). The
 * kind, lowering and validators follow in B134; this package already holds the script API
 * description and its typings generator.
 */
import { definePlugin } from '@msm/plugin-api';

export * from './api/index';

export default definePlugin({
  id: 'msm.scripting',
  apiVersion: '^0.8.0',
  contributes: {},
});
