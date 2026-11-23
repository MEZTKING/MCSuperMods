/**
 * The mechanic `fall_out` of `msm:game` (ADR 0132 D2): a player who falls out of the arena, found
 * by a selector. B721 stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `fall_out` mechanic; no files until B726. */
export const lowerFallOut: MechanicLowering = (): OutputFile[] => [];
