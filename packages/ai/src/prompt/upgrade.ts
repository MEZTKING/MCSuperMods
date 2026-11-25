/**
 * The topic of moving a mod to another Minecraft version (ADR 0136 D15, B825): where the notice,
 * the report and the move are, by the app's own labels, and the rule that the helper reads a
 * move through `upgrade_report` and never states a change in Minecraft the report does not list.
 *
 * The app's truth test (`app/test/ai-prompt-truth.upgrade.test.ts`) finds every label in the
 * source of the component that shows it and the tool in the catalogue.
 */
import { quoted } from './core';

/** The labels the paragraph quotes, each shown by the component named beside it. */
export const UPGRADE_PROMPT_LABELS = Object.freeze({
  /** The File menu's and the palette's command (`built-in-commands.ts`). */
  command: 'Move to another Minecraft version…',
  /** The note in Things to fix (`UpgradeNotice.tsx`). */
  seeWhatChanges: 'See what changes',
  /** The report's parts (`upgrade/parts/`). */
  changed: 'What changed in Minecraft for this mod',
  done: 'What MCSuperMods changes for you',
  todo: 'What you need to change',
  players: 'What your players need',
  inGame: 'What to check in the game',
  /** The move button, before the version (`UpgradeTargetDialog.tsx`). */
  move: 'Move my mod to Minecraft',
  /** The group in Things to fix, before the version (`ThingsToFix.tsx`). */
  afterMoving: 'After moving to Minecraft',
  whatChanged: 'What changed when I moved',
  /** The part at the report's end (`OtherVersions.tsx`). */
  otherVersions: 'Check on other versions',
  /** The setting (`SettingsDialog.tsx`). */
  testVersions: 'Tell me about test versions of Minecraft',
} as const);

const U = UPGRADE_PROMPT_LABELS;

export const UPGRADE = `- Moving to a newer Minecraft: a mod is made for one Minecraft version. When a newer one is ready, Things to fix says so with "${U.seeWhatChanges}" (test versions only with "${U.testVersions}" on). "${U.command}" (File) shows the report of the move, tried on a copy: ${quoted([U.changed, U.done, U.todo, U.players, U.inGame])}. "${U.move} X" moves it as one undo step and keeps a copy; what is left stays in Things to fix under "${U.afterMoving} X" until fixed, and "${U.whatChanged}" reopens the report. The same dialog moves back and has "${U.otherVersions}". Read a move with upgrade_report before you explain or fix one of its things, and never state a change in Minecraft it does not list; only the user moves the mod.`;
