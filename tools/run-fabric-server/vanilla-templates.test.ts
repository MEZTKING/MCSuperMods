import { describe, expect, it } from 'vitest';
import {
  ANY_ANSWER,
  BLOCK_TEST,
  checkTemplatesRun,
  GAP,
  layout,
  PLACE_Y,
  PLACED,
  parseTemplatesArgs,
  type TemplateFact,
  templateCommands,
} from './vanilla-templates.ts';

const ZIP = 'msm-sample-worldgen-x.zip';
const ENABLED = `[01:30:22] [Server thread/INFO]: System chat: There are 2 data pack(s) enabled: [vanilla (built-in)], [file/${ZIP} (world)]`;
const HUT: TemplateFact = {
  id: 'ex:hut',
  size: [2, 2, 1],
  blocks: [
    [0, 0, 0, 'minecraft:cobblestone'],
    [1, 0, 0, 'minecraft:oak_log[axis=x]'],
    [0, 1, 0, 'minecraft:air'],
  ],
};
const LAMP: TemplateFact = {
  id: 'ex:lamp',
  size: [1, 3, 3],
  blocks: [[0, 2, 1, 'minecraft:glowstone']],
};

describe('parseTemplatesArgs', () => {
  it('takes the version, the zip beside the facts file and the templates', () => {
    const options = parseTemplatesArgs(
      ['--facts', '/out/template-facts.json'],
      { minecraft: '1.0', zip: ZIP, templates: [HUT] },
      '/out/template-facts.json',
      { JAVA_HOME: '/jdk' },
    );
    expect(options).toMatchObject({ minecraft: '1.0', templates: [HUT], timeoutSeconds: 600 });
    expect(options.zip.replaceAll('\\', '/')).toBe(`/out/${ZIP}`);
    expect(options.java.replaceAll('\\', '/')).toBe('/jdk/bin/java');
  });

  it('rejects missing, unknown and bad options and facts without templates', () => {
    const facts = { minecraft: '1.0', zip: ZIP, templates: [HUT] };
    expect(() => parseTemplatesArgs([], { zip: ZIP, templates: [HUT] }, '/f.json')).toThrow(
      /--minecraft/,
    );
    expect(() => parseTemplatesArgs([], { minecraft: '1.0', templates: [HUT] }, '/f.json')).toThrow(
      /--zip/,
    );
    expect(() => parseTemplatesArgs([], { minecraft: '1.0', zip: ZIP }, '/f.json')).toThrow(
      /no templates/,
    );
    expect(() => parseTemplatesArgs(['--villagers', '2'], facts, '/f.json')).toThrow(
      /Unknown option --villagers/,
    );
    expect(() => parseTemplatesArgs(['--timeout', '0'], facts, '/f.json')).toThrow(/1 or more/);
  });
});

describe('templateCommands', () => {
  it('places templates side by side in the air and checks every block at its place', () => {
    expect(layout([HUT, LAMP])).toEqual([
      [0, PLACE_Y, 0],
      [2 + GAP, PLACE_Y, 0],
    ]);
    const { forceload, place, checks } = templateCommands([HUT, LAMP]);
    expect(forceload).toBe(`forceload add 0 0 ${2 + GAP} 2`);
    expect(place).toEqual([
      `place template ex:hut 0 ${PLACE_Y} 0`,
      `place template ex:lamp ${2 + GAP} ${PLACE_Y} 0`,
    ]);
    expect(checks.map((check) => check.command)).toEqual([
      `execute if block 0 ${PLACE_Y} 0 minecraft:cobblestone`,
      `execute if block 1 ${PLACE_Y} 0 minecraft:oak_log[axis=x]`,
      `execute if block 0 ${PLACE_Y + 1} 0 minecraft:air`,
      `execute if block ${2 + GAP} ${PLACE_Y + 2} 1 minecraft:glowstone`,
    ]);
  });
});

describe('answers', () => {
  it('knows the place, block test and error lines of the server console', () => {
    const loaded =
      '[21:22:01] [Server thread/INFO]: System chat: Loaded template "ex:hut" at 0, 200, 0';
    expect(PLACED.test(loaded)).toBe(true);
    expect(ANY_ANSWER.test(loaded)).toBe(true);
    expect(PLACED.test('[21:22:01] [Server thread/INFO]: That position is not loaded')).toBe(false);
    expect(ANY_ANSWER.test('[21:22:01] [Server thread/INFO]: That position is not loaded')).toBe(
      true,
    );
    expect(BLOCK_TEST.test('[21:22:02] [Server thread/INFO]: System chat: Test passed')).toBe(true);
    expect(BLOCK_TEST.test('[21:22:02] [Server thread/INFO]: System chat: Test failed')).toBe(true);
  });
});

describe('checkTemplatesRun', () => {
  const { place, checks } = templateCommands([HUT]);
  const placed = place.map((command) => ({
    command,
    answer: '[t] [Server thread/INFO]: System chat: Loaded template "ex:hut" at 0, 200, 0',
  }));
  const passed = checks.map((check) => ({ ...check, answer: 'System chat: Test passed' }));

  it('passes when the pack is enabled, every template placed and every block read back', () => {
    const outcome = checkTemplatesRun([ENABLED], ZIP, placed, passed);
    expect(outcome).toEqual({ ok: true, failures: [], placed: 1, passed: 3, checked: 3 });
  });

  it('fails on air where a block should be, as before the B547 fix', () => {
    const air = checks.map((check) => ({
      ...check,
      answer: check.state === 'minecraft:air' ? 'Test passed' : 'Test failed',
    }));
    const outcome = checkTemplatesRun([ENABLED], ZIP, placed, air);
    expect(outcome.ok).toBe(false);
    expect(outcome.passed).toBe(1);
    expect(outcome.failures).toEqual([
      '2 of 3 blocks did not read back as placed, such as ex:hut block minecraft:cobblestone at 0 200 0: not there; ex:hut block minecraft:oak_log[axis=x] at 1 200 0: not there',
    ]);
  });

  it('fails on a missing pack, a template not placed, no answer and a load error', () => {
    const outcome = checkTemplatesRun(
      ['[t] [Server thread/ERROR]: Failed to load structure ex:hut'],
      ZIP,
      [{ command: place[0] as string, answer: undefined }],
      [{ ...(checks[0] as (typeof checks)[number]), answer: undefined }],
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.failures).toEqual([
      `the data pack file/${ZIP} is not listed as enabled`,
      'log: [t] [Server thread/ERROR]: Failed to load structure ex:hut',
      `${place[0]}: no answer`,
      '1 of 1 blocks did not read back as placed, such as ex:hut block minecraft:cobblestone at 0 200 0: no answer',
    ]);
  });
});
