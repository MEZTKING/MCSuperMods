# Test fixtures of `@msm/search`

Both files were made once (B653, 2026-11-23) by the B650 spike's own method (`docs/reference/spikes/b650/spike-src/typos.ts`, SQ3 and SQ4), for the target mc-26.3, so that the typo and stemmer tests measure what B650 measured without the app, the plugins or the targets. They are regenerated only on purpose; the code never reads them.

- `dictionary.txt`: the 4,119 folded words of B650's static and vanilla layers, one per line as `word count [p]`. `count` is the number of entries the word was found in; `p` marks a protected word (a word of a vanilla id of four letters or more, or a vocabulary headword of the spike's draft `vocab.ts`). Where the words come from: MSM's own text (the built-in plugins' templates, starters, flows, examples, kinds and commands, the Rules catalogue, problems, Home tiles, Showcase cards, settings and the guide's sections, as `spike-src/app-test/collect.test.ts` collected them) and the words of the vanilla ids in `packages/targets/mc-26.3/vendor/mcmeta/registries.json` (ids split at `_` and `/`). No word list from elsewhere and no text from a game jar.
- `misspellings.json`: B650's 302 misspellings as `{ from, set, to }`: 59 flow titles with one seeded edit, 100 vanilla id words with edits by length (one for four to seven letters, two for eight or more), both from the spike's seeded generator (mulberry32, seed 650), and B650's hand list of 143 misspellings players type (written for the spike).

With the spike's own code the files give its SQ3 result for the trigram method: 277 right first, 4 wrong first, 21 none.
