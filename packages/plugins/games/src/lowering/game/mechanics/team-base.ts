/**
 * The mechanic `team_base` of `msm:game` (ADR 0132 D2): a team's base: its bed, its spawn point
 * and "no bed, out". B721 stub, filled by B726.
 */
import type { OutputFile } from '@msm/plugin-api';
import type { MechanicLowering } from './index';

/** Lowers the `team_base` mechanic; no files until B726. */
export const lowerTeamBase: MechanicLowering = (): OutputFile[] => [];
