/**
 * The mechanic `hearts` of `msm:game` (ADR 0132 D2): kill and death scores, most health set by
 * `attribute` through a macro function, the Heart item, withdraw by `/trigger` and the revive
 * item. B721 stub, filled by B725.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `hearts` mechanic; no files until B725. */
export const lowerHearts: MechanicLowering = (): OutputFile[] => [];
