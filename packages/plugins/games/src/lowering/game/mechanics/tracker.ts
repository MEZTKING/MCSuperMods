/**
 * The mechanic `tracker` of `msm:game` (ADR 0132 D2): a tracking compass refreshed once a second
 * by one macro call. B721 stub, filled by B725.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `tracker` mechanic; no files until B725. */
export const lowerTracker: MechanicLowering = (): OutputFile[] => [];
