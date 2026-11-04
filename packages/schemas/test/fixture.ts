import { readFileSync } from 'node:fs';

/** The raw (unparsed) fixture JSON; see `fixtures/README.md`. */
export function loadFixtureJson(): unknown {
  return JSON.parse(
    readFileSync(new URL('./fixtures/symbols.subset.json', import.meta.url), 'utf8'),
  ) as unknown;
}
