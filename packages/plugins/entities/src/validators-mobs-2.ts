/**
 * `entities.*` project validators of buckets, the second shoulder, flight and the five habits
 * (ADR 0109 D1 to D4: bucketable only on `swim`, `dash` only with `msm:rideable`, `barter` naming
 * a loot table, a work site naming a block). A stub from B526: no validators yet; B530 fills it
 * in and lists the codes.
 */
import type { ProjectValidator } from '@msm/plugin-api';

/** Every code these validators report. */
export const ENTITIES_MOB2_PROBLEM_CODES: readonly string[] = Object.freeze([]);

export const entitiesMob2Validators: readonly ProjectValidator[] = Object.freeze([]);
