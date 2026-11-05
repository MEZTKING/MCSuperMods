# docs/ — design docs, roadmap, devlog, ADRs

Active since Phase 0; Phases 2 and 3 code complete, awaiting the in-game checks; launcher and templates and samples library add-ons done; Phase 3 (Structures & Worldgen) delivered as briefs B70–B83 (ADRs 0001–0023, all accepted; B84 in reserve); Phase 4 in progress (`PHASE4-PLAN.md`, ADRs 0024–0027 proposed); user guide in `guide/`. This file describes conventions.

## Purpose

Holds the project's design record: the authoritative design, the delivery plan, the session log and architecture decision records (ADRs).

## Contents

- `DESIGN.md`: the authoritative design document. Everything else links here.
- `ROADMAP.md`: phased plan with checklists and the milestone log.
- `DEVLOG.md`: append-only session log, newest entry at the bottom.
- `HANDOFF.md`: where the project stands and how the work is run, for the next main session; rewritten (not appended) at each handover.
- `adr/NNNN-title.md`: one file per architecture decision, sections Context / Decision / Consequences / Status.
- `guide/`: the user guide (`README.md` index, `getting-started.md`, `structures.md`, `worldgen.md`, `templates-and-examples.md`, `blocks-and-items.md`); task-oriented, matches shipped UI labels.

## Conventions

- DESIGN.md section headings 1–19 are frozen: never renumber or rename them; add new sections at the end.
- British English spelling; no emojis; present tense.
- State decisions as decisions ("We use X because Y"), not as options.
- Link, don't duplicate: point to `DESIGN.md#<anchor>` instead of restating content.
- Unverified version numbers are written with "(verify at implementation)".
- ADR numbers are sequential and never reused; superseded ADRs keep their file and change Status.
- Every session appends a DEVLOG entry: `## YYYY-MM-DD — <agent> — <topic>` then What / Decisions / Next.

## Do / Don't

- Do update DESIGN.md (and ROADMAP.md if scope moves) when an ADR is accepted.
- Do tick ROADMAP checkboxes and add a Milestone Log row when a phase milestone lands.
- Don't put version numbers in DESIGN.md without "(verify at implementation)" unless verified.
- Don't put tutorials in DESIGN or ADRs; they belong in `guide/`. Update the guide when a UI label, menu entry or template list changes.
- Don't edit past DEVLOG entries; correct them in a new entry.

## Commands

None. Docs are plain Markdown and not linted. Before finishing, check by hand: 19 H2 headings in DESIGN.md, every `DESIGN.md#<anchor>` link resolves, no emojis, root CLAUDE.md at most 70 lines and scoped ones at most 55.

## Read next

- [Goals and Non-Goals](DESIGN.md#1-goals-and-non-goals)
- [Open Questions](DESIGN.md#18-open-questions)
- [ROADMAP.md](ROADMAP.md), current phase
