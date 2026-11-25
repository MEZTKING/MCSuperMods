/**
 * The prompt's truth test for moving to a newer Minecraft (B825; ADR 0125 D7, ADR 0136 D15): a
 * sibling of `ai-prompt-truth.looks.test.ts`. Every label the paragraph quotes is a constant of
 * `UPGRADE_PROMPT_LABELS`, and each constant is in the source of the component that shows it;
 * the tool it names is a read tool of the catalogue; the rule against stating changes the report
 * does not list is said. Each check returns what it finds false, so the mutation cases prove
 * that it bites.
 */

import { systemPrompt, TOOL_CATALOGUE, UPGRADE_PROMPT_LABELS } from '@msm/ai';
import { describe, expect, it } from 'vitest';
import { labelInSource, readRepoFile } from './ai-prompt-truth-sources';

const RENDERER = 'app/src/renderer/src';

/** The files the labels are shown by. */
const FILES = Object.freeze({
  commands: `${RENDERER}/commands/built-in-commands.ts`,
  notice: `${RENDERER}/components/upgrade/UpgradeNotice.tsx`,
  changed: `${RENDERER}/components/upgrade/parts/ChangedPart.tsx`,
  done: `${RENDERER}/components/upgrade/parts/DonePart.tsx`,
  todo: `${RENDERER}/components/upgrade/parts/TodoPart.tsx`,
  players: `${RENDERER}/components/upgrade/parts/PlayersPart.tsx`,
  inGame: `${RENDERER}/components/upgrade/parts/InGamePart.tsx`,
  dialog: `${RENDERER}/components/UpgradeTargetDialog.tsx`,
  thingsToFix: `${RENDERER}/components/ThingsToFix.tsx`,
  otherVersions: `${RENDERER}/components/upgrade/OtherVersions.tsx`,
  settings: `${RENDERER}/components/SettingsDialog.tsx`,
});

type FileKey = keyof typeof FILES;
type LabelKey = keyof typeof UPGRADE_PROMPT_LABELS;

/** Where each label is shown. */
const LABEL_FILES: Readonly<Record<LabelKey, FileKey>> = Object.freeze({
  command: 'commands',
  seeWhatChanges: 'notice',
  changed: 'changed',
  done: 'done',
  todo: 'todo',
  players: 'players',
  inGame: 'inGame',
  move: 'dialog',
  afterMoving: 'thingsToFix',
  whatChanged: 'thingsToFix',
  otherVersions: 'otherVersions',
  testVersions: 'settings',
});

const HEAD = '- Moving to a newer Minecraft:';

/** The topic's paragraph. */
function topicText(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.startsWith(HEAD));
  if (line === undefined) throw new Error(`No paragraph starts with ${JSON.stringify(HEAD)}.`);
  return line;
}

function sources(): Record<FileKey, string> {
  return Object.fromEntries(
    Object.entries(FILES).map(([key, path]) => [key, readRepoFile(path)]),
  ) as Record<FileKey, string>;
}

/** Every quoted label is a constant's ("... X" for one ending in a version), each shown. */
function checkLabels(text: string, files: Record<FileKey, string>): string[] {
  const problems: string[] = [];
  const labels = new Set<string>(Object.values(UPGRADE_PROMPT_LABELS));
  for (const match of text.matchAll(/"([^"]+)"/g)) {
    const label = (match[1] as string).replace(/ X$/, '');
    if (!labels.has(label)) {
      problems.push(`the paragraph quotes "${label}", which no constant lists`);
    }
  }
  for (const [key, label] of Object.entries(UPGRADE_PROMPT_LABELS) as [LabelKey, string][]) {
    const file = LABEL_FILES[key];
    if (!labelInSource(files[file], label))
      problems.push(`"${label}" is not shown by ${FILES[file]}`);
    if (!text.includes(`"${label}`)) problems.push(`the paragraph does not quote "${label}"`);
  }
  return problems;
}

/** The tool the paragraph names is a read tool of the catalogue. */
function checkTool(text: string, catalogue: readonly { name: string; group: string }[]): string[] {
  const named = [...text.matchAll(/\b([a-z]+_[a-z_]+)\b/g)].map((match) => match[1] as string);
  const problems: string[] = [];
  if (!named.includes('upgrade_report'))
    problems.push('the paragraph does not name upgrade_report');
  for (const name of named) {
    const tool = catalogue.find((entry) => entry.name === name);
    if (tool === undefined) problems.push(`the paragraph names ${name}, which is no tool`);
    else if (tool.group !== 'read') problems.push(`${name} is not a read tool`);
  }
  return problems;
}

describe('the moving to a newer Minecraft topic against the code (B825)', () => {
  const text = topicText(systemPrompt());
  const files = sources();

  it('quotes labels the components show', () => {
    expect(checkLabels(text, files)).toEqual([]);
  });

  it('names the read tool and the rule of ADR 0136 D15', () => {
    expect(checkTool(text, TOOL_CATALOGUE)).toEqual([]);
    expect(text).toContain('never state a change in Minecraft it does not list');
    expect(text).toContain('only the user moves the mod');
  });
});

describe('the checks bite (B825)', () => {
  const text = topicText(systemPrompt());
  const files = sources();

  it('a label the component no longer shows', () => {
    const changed = {
      ...files,
      otherVersions: files.otherVersions.replace(
        "'Check on other versions'",
        "'Try other versions'",
      ),
    };
    expect(checkLabels(text, changed)).toEqual([
      `"Check on other versions" is not shown by ${FILES.otherVersions}`,
    ]);
  });

  it('a quoted label no constant lists', () => {
    expect(checkLabels(`${text} "Upgrade project target"`, files)).toEqual([
      'the paragraph quotes "Upgrade project target", which no constant lists',
    ]);
  });

  it('a tool that is gone or not read-only', () => {
    const catalogue = TOOL_CATALOGUE.filter((tool) => tool.name !== 'upgrade_report');
    expect(checkTool(text, catalogue)).toEqual([
      'the paragraph names upgrade_report, which is no tool',
    ]);
    const writing = TOOL_CATALOGUE.map((tool) =>
      tool.name === 'upgrade_report' ? { ...tool, group: 'propose' } : tool,
    );
    expect(checkTool(text, writing)).toEqual(['upgrade_report is not a read tool']);
  });
});
