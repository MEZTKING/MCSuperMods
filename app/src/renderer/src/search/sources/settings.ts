/**
 * The settings source (ADR 0124 D3; B660): one entry per line of the settings catalogue
 * (`components/settings-catalogue.ts`, filled by B662), with its section and extra words. Settings
 * are available everywhere; the action opens Settings at the line.
 *
 * @packageDocumentation
 */

import type { SearchEntry } from '@msm/search';
import type { SettingsCatalogueEntry } from '../../components/settings-catalogue';
import { asAction, asPreview, entryIds, sentenceField, wordsField } from './shared';

/** The setting entries of a settings catalogue; the first line with an id wins. */
export function settingEntries(catalogue: readonly SettingsCatalogueEntry[]): SearchEntry[] {
  const seen = new Set<string>();
  const out: SearchEntry[] = [];
  for (const line of catalogue) {
    if (seen.has(line.id)) continue;
    seen.add(line.id);
    const action = { type: 'setting', setting: line.id } as const;
    out.push({
      id: entryIds.setting(line.id),
      source: 'setting',
      title: line.title,
      ...sentenceField(line.sentence),
      ...wordsField(['setting', line.section, ...(line.words ?? [])]),
      available: true,
      action: asAction(action),
      preview: asPreview(action),
    });
  }
  return out;
}
