/**
 * The mechanic `generators` of `msm:game` (ADR 0132 D2): items summoned every few seconds up to a
 * cap. B721 stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `generators` mechanic; no files until B726. */
export const lowerGenerators: MechanicLowering = (): OutputFile[] => [];
