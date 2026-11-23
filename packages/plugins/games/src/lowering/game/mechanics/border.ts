/**
 * The mechanic `border` of `msm:game` (ADR 0132 D2): the world border and how it shrinks. B721
 * stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `border` mechanic; no files until B726. */
export const lowerBorder: MechanicLowering = (): OutputFile[] => [];
