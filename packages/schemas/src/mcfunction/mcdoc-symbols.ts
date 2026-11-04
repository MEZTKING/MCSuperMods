/**
 * Loads a vanilla-mcdoc symbol export (`mcdoc-cli export symbols.json`) into a Spyglass
 * `SymbolUtil`, so the mcfunction checker can type JSON text components, SNBT and item
 * components inside commands (ADR 0014, B44).
 *
 * This replaces what Spyglass's `@vanilla-mcdoc` dependency provider does by downloading and
 * binding the `.mcdoc` sources: the export already holds the bound type definitions, keyed as
 * the mcdoc binder keys them (`mcdoc` by full path, `mcdoc/dispatcher` by dispatcher id and
 * member key, both with `data.typeDef`). Nothing is fetched or read here.
 */

import type * as core from '@spyglassmc/core';

/** Symbol contributor for the loaded export; cleared with `symbols.clear({ contributor })`. */
export const MCDOC_CONTRIBUTOR = 'msm-vanilla-mcdoc';
/** Pseudo URI the loaded symbols are declared at. */
export const MCDOC_URI = 'spyglass://msm/vanilla-mcdoc/symbols.json';

type TypeDefs = Readonly<Record<string, unknown>>;

/** The two categories of the export the service needs, validated shallowly. */
export interface McdocSymbolExport {
  mcdoc: TypeDefs;
  dispatchers: Readonly<Record<string, TypeDefs>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the parsed export: an object with `mcdoc` (path to type definition) and
 * `mcdoc/dispatcher` (dispatcher id to member key to type definition). Throws with a British
 * English message when the shape is wrong; type definitions themselves are passed through.
 */
export function readMcdocSymbolExport(value: unknown): McdocSymbolExport {
  if (!isRecord(value)) throw new Error('The mcdoc symbol export is not a JSON object.');
  const mcdoc = value.mcdoc;
  const dispatchers = value['mcdoc/dispatcher'];
  if (!isRecord(mcdoc)) throw new Error('The mcdoc symbol export has no "mcdoc" object.');
  if (!isRecord(dispatchers)) {
    throw new Error('The mcdoc symbol export has no "mcdoc/dispatcher" object.');
  }
  for (const [id, members] of Object.entries(dispatchers)) {
    if (!isRecord(members)) {
      throw new Error(`The mcdoc dispatcher ${JSON.stringify(id)} is not a JSON object.`);
    }
  }
  return { mcdoc, dispatchers: dispatchers as Record<string, TypeDefs> };
}

/** Declares every type and dispatcher member of the export in `symbols`. */
export function loadMcdocSymbols(symbols: core.SymbolUtil, exported: McdocSymbolExport): void {
  symbols.contributeAs(MCDOC_CONTRIBUTOR, () => {
    for (const [path, typeDef] of Object.entries(exported.mcdoc)) {
      symbols.query(MCDOC_URI, 'mcdoc', path).enter({
        data: { data: { typeDef } },
        usage: { type: 'declaration' },
      });
    }
    for (const [id, members] of Object.entries(exported.dispatchers)) {
      symbols.query(MCDOC_URI, 'mcdoc/dispatcher', id).enter({ usage: { type: 'declaration' } });
      for (const [key, typeDef] of Object.entries(members)) {
        symbols.query(MCDOC_URI, 'mcdoc/dispatcher', id, key).enter({
          data: { data: { typeDef } },
          usage: { type: 'declaration' },
        });
      }
    }
  });
}
