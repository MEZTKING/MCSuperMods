# ADR 0130: One mode, with More options in each section

## Context

MCSuperMods has three modes (`UiMode` `'very-easy' | 'easy' | 'advanced'`): Easy and Advanced since ADR 0047, Very easy since ADR 0083 (Home, Make something, My things, Things to fix in plain words, the name-only New mod dialog, no ids, the `forbiddenIn` sweep). On 2026-11-23 the user first said "easy and advanced is all we need", then, asked for an opinion, chose **one mode**: "keep just one mode that explain everything properly and easy, and for advanced users you can find extra settings if you look for it and need it", and asked to see examples first. Three ways of tucking the extras away were shown (https://claude.ai/artifact/3bDds9SbjYbYm5MNc5qMW1: per-section More options, one Show technical details switch, an Expert menu); the user chose **More options in each section**.

## Decision

**D1 One mode.** The mode switch, View > Mode, Settings' mode choice and the first-run mode question go away. `UiMode` is removed from the UI; stored values (`very-easy`, `easy`, `advanced`) are read once and dropped. Code that branches on the mode takes the one path described below.

**D2 Plain by default, explained.** Every screen uses Very easy's words: no id, path or namespace in text, labels, tooltips or placeholders by default (the `forbiddenIn` sweep runs over the default view of every Studio, dialog and panel). Each Studio section opens with a one-line "why" in the subject's terms ("A diamond sword does 7 damage") and its common settings, each with a short help line. A first-time **New here?** tip per Studio says what the thing needs and how to try it, and is dismissed once.

**D3 More options in each section.** At the bottom of every Studio section, a **More options** disclosure holds everything else of that section: the rarer settings, ids and model or file references, raw values (the section's own JSON shown as editable text), and the fields Advanced showed. It opens in place, remembers its state per section, and its contents may show ids. Nothing Advanced could do is removed; each advanced thing sits in the section it changes.

**D4 Where the rest lives.** The things that were whole Advanced surfaces get a place by the same rule, next to what they act on:
- A thing's whole raw JSON: **More options** at the bottom of its Studio ("Edit as raw text").
- Its id and rename: the Name section's More options.
- Lowered files and Used by: the Studio's last section, **Where it goes**, under its More options.
- The element list shows names and groups; a thing's id appears in its own Name section's More options, and search still finds ids (`@`, `#` and typed ids, ADR 0124).
- Function and script editors are the Studios of those kinds, unchanged.
- Java project export, More exports and Plugins stay in the File and Help menus and Settings, with plain names.
- Command palette (Ctrl+Shift+P) and search (Ctrl+K) stay; their commands name the More options they open.

**D5 Home and the rest.** Home is ADR 0129's gallery (layout A) for everyone; Make something, My things, Things to fix in plain words, Ask the helper, Draw it for me and the name-only New mod dialog are the one way. The AI helper, search wording and plain problems keep one set of words (the plainest of the old ones), with ids only where a More options panel or search shows them.

**D6 Docs and tests.** The guide's mode pages (`very-easy.md`, the modes parts of `getting-started.md`) become one page on finding More options; every guide page drops mode wording. The AI prompt topic files lose mode words (re-pin the hash, within budget). Tests that ran per mode run once; the per-mode e2e specs (`modes-path`, `very-easy-path`) become one spec. ADR 0047 and ADR 0083 are superseded in their mode switch; their Home, plain words and Things to fix live on.

## Consequences

- One way to use the app, explained in place; experts find each extra in the section it belongs to.
- A wide change: about 20 renderer files branch on the mode today, plus many tests and guide pages. It runs as its own brief after ADR 0129's Home work merges.
- Sections must be split into common and More options settings, Studio by Studio; a Studio not yet split shows all its fields in the main area (never hidden), and the audit lists it.
- Vetoable defaults: the New here? tip, More options remembered per section, the element list without ids, the Where it goes section.

## Status

Accepted (2026-11-23, the user's choice of one mode with More options in each section). Supersedes the mode switch of ADRs 0047 and 0083.
