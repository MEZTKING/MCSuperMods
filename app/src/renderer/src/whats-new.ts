/**
 * "What's new": the bundled `CHANGELOG.md` (repository root, loaded lazily as a separate
 * renderer chunk) and the section for one version.
 *
 * @packageDocumentation
 */

/** Where every release and its notes are listed. */
export const RELEASES_URL = 'https://github.com/MEZTKING/MCSuperMods/releases';

/** Loads the bundled changelog text (a lazy `?raw` chunk, so the start-up bundle stays small). */
export async function loadChangelog(): Promise<string> {
  const module = await import('../../../../CHANGELOG.md?raw');
  return module.default;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The body of the changelog section for `version` (`## [0.6.0] - 2026-11-05`, also without
 * brackets, a leading `v` or a date), up to the next `## ` heading; `null` when there is no
 * such section or it is empty. Link reference definitions at the end are left out.
 */
export function changelogSection(changelog: string, version: string): string | null {
  const wanted = escapeRegExp(version.replace(/^v/, ''));
  const heading = new RegExp(`^##\\s+\\[?v?${wanted}\\]?(?:\\s+-\\s+.*)?\\s*$`);
  const lines = changelog.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return null;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (/^\[[^\]]+\]:\s*\S+/.test(line)) continue;
    body.push(line);
  }
  const text = body.join('\n').trim();
  return text === '' ? null : text;
}
