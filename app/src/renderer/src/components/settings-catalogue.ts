/**
 * The settings the search finds (title, sentence, section and words), one line per setting of the
 * Settings dialog. Empty until B660 fills it (ADR 0124 D1).
 */

export interface SettingsCatalogueEntry {
  readonly id: string;
  readonly title: string;
  readonly sentence: string;
  readonly section: string;
  readonly words?: readonly string[];
}

export const SETTINGS_CATALOGUE: readonly SettingsCatalogueEntry[] = [];
