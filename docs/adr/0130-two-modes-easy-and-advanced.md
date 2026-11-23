# ADR 0130: Two modes, Easy and Advanced

## Context

MCSuperMods has three modes (`UiMode` `'very-easy' | 'easy' | 'advanced'`): Easy and Advanced since ADR 0047, and Very easy since ADR 0083 (Home with Make something tiles and My things, Things to fix in plain words, the name-only New mod dialog, no ids anywhere, a sweep test `forbiddenIn`). On 2026-11-23, while choosing Home's layout (ADR 0129, layout A "Store rows"), the user said "easy and advanced is all we need", and chose "Drop Very easy" when asked what they meant: keep only Easy and Advanced; Easy takes over Very easy's Home and its plain words; existing Very easy users move to Easy; the mode switch shows two buttons.

## Decision

**D1 Two modes.** The mode switch, View menu, Settings and the first-run choice offer **Easy** and **Advanced** only. `UiMode` becomes `'easy' | 'advanced'`; a stored `'very-easy'` reads as `'easy'` (preferences migration, once, silent).

**D2 Easy is the beginner mode.** Easy takes everything Very easy had: Home (the gallery of ADR 0129 with Your mods and More ideas), Make something, My things, Things to fix in plain words, the name-only New mod dialog, Draw it for me, Ask the helper on a problem, words without ids. Easy keeps what it has today that Very easy hid: the element list, the Studios and their sections, Try it, Play and Share. Where the two disagreed, Easy follows Very easy's words (no ids, plain labels) and Easy's reach (all Studios and sections Easy showed). Advanced is unchanged.

**D3 One rule for ids.** No id, path or namespace appears in Easy's text, labels, tooltips or placeholders (Very easy's `forbiddenIn` sweep now runs over Easy); Advanced shows ids as today.

**D4 Words per mode.** Strings that had three forms (`ai-words.ts`, Home, the search panel's wording, plain problems) keep two: Very easy's form becomes Easy's where it was plainer, Easy's form where it named more. Tests that ran per mode run over the two.

**D5 Docs.** The guide's `very-easy.md` becomes the Easy page (`easy.md`, with the old anchors redirected by a line at the top of a kept stub); every guide page, the AI helper's prompt topic files (within the 104,000-character budget; re-pin the hash), DESIGN section 8 and the e2e specs say Easy. ADR 0083 is superseded in part (its Very easy mode), its Home, Things to fix and plain words live on in Easy.

## Consequences

- One beginner mode to keep right instead of two; fewer strings and tests.
- Users who liked Very easy's sparser screens get Easy's element list and Studios beside Home; Home stays the first thing they see.
- A large change across the app: done in one brief after ADR 0129's Home work merges, so the two do not conflict.

## Status

Accepted (2026-11-23, the user's choice). Supersedes ADR 0083's three-mode switch; amends ADR 0047.
