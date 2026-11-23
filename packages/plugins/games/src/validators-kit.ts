/**
 * `games.*` project validators of `msm:kit` (ADR 0132 D3): items and effects the target does
 * not have, slots used twice. B721 stub, filled by B724; listed by `validators.ts` once
 * `KIT_KIND_LISTED` is `true`.
 */
import type { Problem, ProjectValidator } from '@msm/plugin-api';
import { kitKind } from './kinds/kit';

/** The kit validator; it finds nothing until B724. */
export const kitValidator: ProjectValidator = {
  id: 'msm.games.kit',
  kinds: [kitKind.id],
  validate: (): Problem[] => [],
};
