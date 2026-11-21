/**
 * Place, explosion and command rules with the scripts running (B400): B463 reads the generated
 * Rules script's text when scripts run only in the game; with the scripts running, the scripts'
 * own answer decides, and it agrees with what the text reading decides for the same fixture.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import { LocalWorldSource, type SimFiles } from '../../src/index.js';
import { builtInTargets, lowerFixture } from '../lower-fixture.js';
import { scriptedArea } from './helpers.js';

const NS = 'msm_sample_vanilla_blocks';
const UP = { x: 0.5, y: 1, z: 0.5 };
const floorAt = (x: number, z: number) => ({ x, y: -1, z });

let target: Target;
let files: SimFiles;

beforeAll(async () => {
  target = (await builtInTargets())[0] as Target;
  const lowered = await lowerFixture('sample-vanilla-blocks', target);
  files = lowered.files;
}, 60_000);

/** Both areas: the scripts read as text (B463) and the scripts running (B400). */
function both() {
  const read = new LocalWorldSource({ files, target, seed: 3, chance: 'always' });
  const { source: run, texts } = scriptedArea(files, target, 3);
  return { read, run, texts };
}

describe('sample-vanilla-blocks with its scripts running', () => {
  it("stops a cobweb as the rule says, and says the rule's message by the rule (B401)", () => {
    const { read, run, texts } = both();
    for (const source of [read, run]) {
      source.act({
        type: 'place',
        pos: floorAt(3, 3),
        face: 'up',
        hit: UP,
        block: 'minecraft:cobweb',
      });
      expect(source.world.get({ x: 3, y: 0, z: 3 })).toBeNull();
    }
    expect(texts()).toContain('Rule "no_cobwebs" says to you: "Cobwebs are not welcome here."');
    expect(
      run.lines.some(
        (line) => line.text === 'Cobweb was not placed: a script stopped the placing.',
      ),
    ).toBe(true);
  });

  it('stops bedrock by the hand-written script, which the text reading can only say', () => {
    const { read, run, texts } = both();
    read.act({
      type: 'place',
      pos: floorAt(5, 5),
      face: 'up',
      hit: UP,
      block: 'minecraft:bedrock',
    });
    run.act({ type: 'place', pos: floorAt(5, 5), face: 'up', hit: UP, block: 'minecraft:bedrock' });
    // Read as text, a hand-written script only runs in the game; running, it stops the placing.
    expect(read.world.get({ x: 5, y: 0, z: 5 })?.name).toBe('minecraft:bedrock');
    expect(run.world.get({ x: 5, y: 0, z: 5 })).toBeNull();
    expect(texts()).toContain(
      `The script ${NS}:script_api_1_6 says to you: "Bedrock stays where the world put it."`,
    );
  });

  it('lets the Explode tool break blocks in both: the creeper rule does not apply to a block', () => {
    const { read, run } = both();
    for (const source of [read, run]) {
      source.act({ type: 'place', pos: floorAt(10, 10), face: 'up', hit: UP, block: `${NS}:tin` });
      source.act({ type: 'place', pos: floorAt(11, 10), face: 'up', hit: UP, block: `${NS}:tin` });
      source.act({ type: 'tool', tool: 'explode', pos: { x: 10, y: 0, z: 10 } });
      expect(source.world.get({ x: 11, y: 0, z: 10 })).toBeNull();
    }
  });

  it('keeps the blocks when a script says so', () => {
    const extra = new Map(files);
    extra.set(
      `msm/${NS}/script/keep.ts`,
      'import { msm } from "msm:runtime";\nmsm.events.on("world.explosion", (e) => { if (e.cause === "block") e.keepBlocks(); });',
    );
    const { source } = scriptedArea(extra, target, 3);
    source.act({ type: 'place', pos: floorAt(10, 10), face: 'up', hit: UP, block: `${NS}:tin` });
    source.act({ type: 'tool', tool: 'explode', pos: { x: 10, y: 0, z: 10 } });
    expect(source.world.get({ x: 10, y: 0, z: 10 })).not.toBeNull();
    expect(
      source.lines.some((line) => line.text === 'The blocks were kept safe; nothing broke.'),
    ).toBe(true);
  });

  it("runs the command listeners: the chat answer stays the command's own", () => {
    const { run, texts } = both();
    const greet = run.chat('/greet');
    expect(greet.answer).toEqual(['Hello from the vanilla blocks sample!']);
    expect(texts()).toContain(
      `The script ${NS}:script_api_1_6 says to you: "The script heard /greet."`,
    );
    run.chat('/kit Player 5');
    expect(texts()).toContain('Rule "kit_note" says to you: "Kit handed out."');
  });
});
