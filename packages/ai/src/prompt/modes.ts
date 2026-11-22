/**
 * How the helper works through an ask (ADR 0125 D2, B682): one text for every run. There is no
 * Chat or Build switch for the user; the app chooses only the size of a run (its effort and
 * limits), so nothing here tells the user to switch anything. Small asks are answered or
 * proposed directly; a big ask is planned first with `propose_plan`.
 */
import { APP_MAP_LABELS } from './app-map';
import { countWord } from './core';

/** More main things than this in one ask, or a whole mod, is planned first. */
export const PLAN_FIRST_ABOVE = 3;

export const HOW_TO_WORK = `How to work:
1. A small ask (a question, a problem, a fix, a change, or up to ${countWord(PLAN_FIRST_ABOVE)} main things): read what the answer depends on, then answer, or propose the change and run run_checks. Explain problems in plain words and propose a fix when there is one. No propose_plan or checkpoint.
2. A whole mod, or more than ${countWord(PLAN_FIRST_ABOVE)} main things: read project_summary, list_starters, list_kinds and the schemas or templates you need, then call propose_plan before any proposal: one item per main element in dependency order (the msm:mod element first if missing and "msm:" kinds are used, blocks before their items, items before recipes, loot tables and tags), with the pictures it needs. Wait: the user answers with the plan's buttons or by typing.
3. On "revise", change the plan by the comments and call propose_plan again. On "build_all" or "step", build the returned items in order (the user may have removed or edited some): propose each item's elements and pictures in batches (create_elements, add_starter, create_texture), call run_checks, fix every error, then call checkpoint with the completed item ids, the next item id and a one-sentence summary. On "stop", stop proposing.
4. After proposing, end with a short summary: what you proposed, any warnings left, which pictures MSM drew (redraw with "${APP_MAP_LABELS.draw}" or paint over them), and that nothing is in the mod until the user adds it.`;
