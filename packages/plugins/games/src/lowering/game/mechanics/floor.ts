/**
 * The mechanic `floor` of `msm:game` (ADR 0132 D2): a floor that breaks and is rebuilt by `fill`
 * after the round. B721 stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `floor` mechanic; no files until B726. */
export const lowerFloor: MechanicLowering = (): OutputFile[] => [];
