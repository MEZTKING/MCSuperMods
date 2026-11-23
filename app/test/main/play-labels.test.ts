import { describe, expect, it } from 'vitest';
import {
  PLAY_STATE_LABELS,
  RESTART_NEEDED_LABEL,
  restartReasonText,
} from '../../src/main/platform/play';

// The Play controls' tests (`test/components/play-fixtures.ts`) copy main's chip words and
// restart texts, because the renderer project cannot import main code. These pin the copies.

const CHIP_LABELS = {
  'no-prism': 'Prism Launcher not found',
  'not-running': 'Game not running',
  starting: 'Starting…',
  'test-world': 'In the test world',
  'game-world': 'In my game',
  'other-world': 'In another world',
};

const REASONS = [
  [
    { reason: 'new-definition', path: 'msm/demo/block/ruby_lamp.json', kind: 'block' },
    'Ruby Lamp',
    'You added a new block: Ruby Lamp. New blocks are only read when Minecraft starts.',
  ],
  [
    { reason: 'definition-changed', path: 'msm/demo/item/ruby.json', kind: 'item' },
    'Ruby',
    'You changed more than what Ruby does when something happens. Changes like that are only read when Minecraft starts.',
  ],
  [
    {
      reason: 'definition-renamed',
      path: 'msm/demo/entity/goblin.json',
      from: 'msm/demo/entity/gob.json',
      kind: 'entity',
    },
    'Goblin',
    'You renamed the mob Goblin. New names are only read when Minecraft starts.',
  ],
  [
    { reason: 'file-removed', path: 'msm/demo/effect/glow.json', kind: 'effect' },
    'Glow',
    'You removed the effect Glow. Minecraft keeps it until it starts again.',
  ],
  [
    { reason: 'sound-events', path: 'assets/demo/sounds.json' },
    '',
    'You added or removed a sound. Sounds are only read when Minecraft starts.',
  ],
  [
    { reason: 'mod-file', path: 'fabric.mod.json' },
    '',
    "Your mod's details changed. They are only read when Minecraft starts.",
  ],
  [
    { reason: 'mod-id', path: 'fabric.mod.json' },
    '',
    "Your mod's id changed. It is only read when Minecraft starts.",
  ],
  [
    { reason: 'runtime-version', path: 'META-INF/jars/msm_runtime.jar' },
    '',
    'MCSuperMods has a new version of its runtime. It is only loaded when Minecraft starts.',
  ],
  [
    { reason: 'fabric-api-version', path: 'mods/fabric-api.jar' },
    '',
    'The Fabric API version changed. It is only loaded when Minecraft starts.',
  ],
] as const;

describe('Play words the renderer tests copy', () => {
  it('keeps the chip words', () => {
    expect(PLAY_STATE_LABELS).toEqual(CHIP_LABELS);
    expect(RESTART_NEEDED_LABEL).toBe('Restart needed');
  });

  it('keeps the nine restart reason texts', () => {
    for (const [reason, name, text] of REASONS) {
      expect(restartReasonText(reason as Parameters<typeof restartReasonText>[0], name)).toBe(text);
    }
    expect(new Set(REASONS.map(([reason]) => reason.reason)).size).toBe(9);
  });
});
