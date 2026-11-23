/**
 * The guide source (ADR 0124 D3, D14; B660; B656's note): one entry per heading of the guide's
 * index from main (`guide:index`): a page's `#` title (level 1) and its `##` to `####` headings,
 * each with its first sentence (which can be empty) and its page's title as words. Deeper
 * headings say less, so `####` sections carry their parent page only. A page's own entry carries
 * its subject (its title before a colon) as words, so the page about fluids comes before another
 * page's section titled Fluids (the follow-ups after ADR 0124's close). The action opens the guide
 * reader at the heading's anchor.
 *
 * @packageDocumentation
 */

import type { SearchEntry } from '@msm/search';
import type { GuideIndex } from '../../../../shared/platform';
import { asAction, asPreview, entryIds, sentenceField, wordsField } from './shared';

/** A page's subject: its title before a colon (`Rules: make things happen` is about rules). */
function subjectOf(heading: string): string {
  const colon = heading.indexOf(':');
  return (colon > 0 ? heading.slice(0, colon) : heading).trim();
}

/** The guide entries of an index; the first heading with a page and anchor wins. */
export function guideEntries(index: GuideIndex | null | undefined): SearchEntry[] {
  if (index === null || index === undefined || !Array.isArray(index.sections)) return [];
  const titles = new Map<string, string>();
  for (const page of index.pages ?? []) titles.set(page.page, page.title);
  const seen = new Set<string>();
  const out: SearchEntry[] = [];
  for (const section of index.sections) {
    if (typeof section?.page !== 'string' || typeof section.heading !== 'string') continue;
    const anchor = typeof section.anchor === 'string' ? section.anchor : '';
    const id = entryIds.guide(section.page, anchor);
    if (seen.has(id) || section.heading.trim() === '') continue;
    seen.add(id);
    const pageTitle = titles.get(section.page) ?? section.page;
    const action = { type: 'guide', page: section.page, anchor } as const;
    out.push({
      id,
      source: 'guide',
      title: section.heading,
      ...sentenceField(section.sentence),
      ...wordsField([
        'guide',
        'how to',
        section.level === 1 ? subjectOf(section.heading) : pageTitle,
      ]),
      available: true,
      action: asAction(action),
      preview: asPreview(action),
    });
  }
  return out;
}
