/**
 * `minecraft:function`: an mcfunction source stored as `{ "lines": string[] }`, one entry per
 * line, and lowered to `data/<ns>/<function>/<path>.mcfunction` (ADR 0015).
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerFunction } from '../lowering/function';

export const functionKind: ElementKind = {
  id: 'minecraft:function',
  schema: 'msm:function',
  folder: 'function',
  defaultData: { lines: ['# Written with MCSuperMods'] },
  lower: (element, target) => lowerFunction(element, target),
};
