/**
 * `@msm/plugin-controls`: built-in MSM plugin for project key binds (`msm:key_bind`, ADR 0088)
 * and HUD elements (`msm:hud`, ADR 0089): the two kinds and their lowering to runtime
 * definitions and language keys, the `controls.*` validators and the "Controls and HUD"
 * templates (ADR 0091 D3). Lowering helpers and the problem codes are exported for the Key bind
 * and HUD Studios (B420).
 */
import { definePlugin } from '@msm/plugin-api';
import { controlsKinds } from './kinds';
import { controlsTemplates } from './templates';
import { controlsValidators } from './validators';

export * from './kinds';
export * from './lowering';
export { controlsTemplates } from './templates';
export * from './validators';

export default definePlugin({
  id: 'msm.controls',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [...controlsKinds],
    elementTemplates: [...controlsTemplates],
    validators: [...controlsValidators],
    searchData: () => import('./search').then((m) => m.SEARCH),
  },
});
