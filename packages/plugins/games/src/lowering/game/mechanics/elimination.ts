/**
 * The mechanic `elimination` of `msm:game` (ADR 0132 D2): who is out of the round and where they
 * go. B721 stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `elimination` mechanic; no files until B726. */
export const lowerElimination: MechanicLowering = (): OutputFile[] => [];
