/**
 * Known schema gaps between the built-in targets that no shared data can bridge (B153).
 *
 * `minecraft:worldgen/noise_settings` requires `default_block` on targets whose vanilla-mcdoc
 * still has the field and rejects it on targets where the field is gated out (the snapshot
 * line after the current release). The worldgen plugin's default data and the library's
 * noise settings example carry the field, so on a target without it the schema check reports
 * exactly one `schema.unknown-field` at `/default_block`. Tests assert exactly that problem
 * (instead of none) only when the target's own schema lacks the field, so the gap stays
 * visible and the test fails once the data becomes per target.
 */
import type { SchemaIndex } from '@msm/schemas';

export const NOISE_SETTINGS_KIND = 'minecraft:worldgen/noise_settings';
const NOISE_SETTINGS_PATH = '::java::data::worldgen::noise_settings::NoiseGeneratorSettings';

/** Whether the target's noise settings schema has the `default_block` field. */
export function noiseSettingsHasDefaultBlock(schemaIndex: SchemaIndex): boolean {
  const node = schemaIndex.resolve(NOISE_SETTINGS_PATH);
  return node.kind === 'struct' && node.fields.some((field) => field.key === 'default_block');
}
