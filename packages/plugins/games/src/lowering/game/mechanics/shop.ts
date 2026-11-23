/**
 * The mechanic `shop` of `msm:game` (ADR 0132 D2): a still trader with offers, or a dialog with
 * buy buttons. B721 stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `shop` mechanic; no files until B726. */
export const lowerShop: MechanicLowering = (): OutputFile[] => [];
