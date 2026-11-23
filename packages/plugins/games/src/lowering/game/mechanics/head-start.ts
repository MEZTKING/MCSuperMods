/**
 * The mechanic `head_start` of `msm:game` (ADR 0132 D2): hunters held for a head start by
 * attribute modifiers. B721 stub, filled by B725.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `head_start` mechanic; no files until B725. */
export const lowerHeadStart: MechanicLowering = (): OutputFile[] => [];
