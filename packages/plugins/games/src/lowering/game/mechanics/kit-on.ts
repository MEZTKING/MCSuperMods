/**
 * The mechanic `kit_on` of `msm:game` (ADR 0132 D2): which kit a player gets at the start and at a
 * respawn. B721 stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `kit_on` mechanic; no files until B726. */
export const lowerKitOn: MechanicLowering = (): OutputFile[] => [];
