import raw from '../../mcdoc/msm/symbols.json' with { type: 'json' };
import { parseVanillaMcdocSymbols, type VanillaMcdocSymbols } from '../symbols/parse';

/**
 * Schema references for MSM's own types (ADR 0025 D7), compiled from
 * `packages/schemas/mcdoc/msm/*.mcdoc` by `tools/build-msm-mcdoc`. They resolve through
 * `SchemaIndex.resolveSchemaRef` (and the type paths through `SchemaIndex.resolve`) on every
 * index, whatever the target: the MSM types are version-independent.
 *
 * - `block` / `item`: element data of the `msm:block` / `msm:item` kinds (definition plus the
 *   editor fields `model`, `display_name`, `loot`, and `tool` / `min_tier` on `msm:breakable`).
 * - `blockDefinition` / `itemDefinition`: the runtime definitions written to
 *   `msm/<ns>/block/<path>.json` and `msm/<ns>/item/<path>.json`.
 * - `mod`: element data of the singleton `msm:mod` kind.
 */
export const MSM_SCHEMA_REFS = {
  block: 'msm:block',
  item: 'msm:item',
  mod: 'msm:mod',
  blockDefinition: 'msm:block_definition',
  itemDefinition: 'msm:item_definition',
} as const;

/** The mcdoc type path behind each MSM schema reference. */
export const MSM_TYPE_PATHS = {
  block: '::msm::element::Block',
  item: '::msm::element::Item',
  mod: '::msm::Mod',
  blockDefinition: '::msm::definition::Block',
  itemDefinition: '::msm::definition::Item',
  action: '::msm::action::Action',
} as const;

/** `resolveSchemaRef` aliases: MSM schema reference -> mcdoc type path. */
export const MSM_SCHEMA_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  [MSM_SCHEMA_REFS.block]: MSM_TYPE_PATHS.block,
  [MSM_SCHEMA_REFS.item]: MSM_TYPE_PATHS.item,
  [MSM_SCHEMA_REFS.mod]: MSM_TYPE_PATHS.mod,
  [MSM_SCHEMA_REFS.blockDefinition]: MSM_TYPE_PATHS.blockDefinition,
  [MSM_SCHEMA_REFS.itemDefinition]: MSM_TYPE_PATHS.itemDefinition,
});

let parsed: VanillaMcdocSymbols | undefined;

/**
 * The compiled MSM mcdoc export, validated once. Its `ref` is a hash of the sources
 * (`msm-mcdoc:sha256:...`), not a git commit.
 */
export function msmMcdocSymbols(): VanillaMcdocSymbols {
  parsed ??= parseVanillaMcdocSymbols(raw);
  return parsed;
}

/**
 * `vanilla` with the MSM types and dispatchers added. MSM type paths live under `::msm` and
 * dispatchers under `msm:`, so nothing vanilla is replaced; on a clash the vanilla entry wins.
 */
export function mergeMsmSymbols(vanilla: VanillaMcdocSymbols): VanillaMcdocSymbols {
  const msm = msmMcdocSymbols();
  const dispatchers: VanillaMcdocSymbols['dispatchers'] = { ...msm.dispatchers };
  for (const [registry, members] of Object.entries(vanilla.dispatchers)) {
    dispatchers[registry] = Object.hasOwn(msm.dispatchers, registry)
      ? { ...msm.dispatchers[registry], ...members }
      : members;
  }
  return {
    ref: vanilla.ref,
    mcdoc: { ...msm.mcdoc, ...vanilla.mcdoc },
    dispatchers,
  };
}
