/**
 * Try it's area over `fixtures/sample-rules` (B398): the source's effects reach the chips,
 * captions, particles and mob field, and every trace entry kind becomes a "What happened" line
 * with its kind and a link into the project.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  lowerProject,
  type Project,
  type ProjectFileSystem,
  registerPlugin,
} from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import { ruleBooksOf, TryItArea, toSimFiles } from '../../../src/renderer/src/tryit/session-source';
import { linkFor } from '../../../src/renderer/src/tryit/WhatHappened';

const FIXTURE = fileURLToPath(new URL('../../../../fixtures/sample-rules/', import.meta.url));
const NS = 'msm_sample_rules';

function readOnlyFs(root: string): ProjectFileSystem {
  const resolve = (path: string): string => join(root, ...path.split('/'));
  const refuse = async (): Promise<never> => {
    throw new Error('read-only');
  };
  return {
    readFile: async (path) => new Uint8Array(await readFile(resolve(path))),
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map(
          (entry): DirEntry => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'directory' : 'file',
          }),
        );
    },
    async exists(path) {
      try {
        await stat(resolve(path));
        return true;
      } catch {
        return false;
      }
    },
    writeFile: refuse,
    mkdirp: refuse,
    remove: refuse,
  };
}

let project: Project;
let target: Target;
let files: ReturnType<typeof toSimFiles>;

beforeAll(async () => {
  const header = JSON.parse(await readFile(join(FIXTURE, 'msm.project.json'), 'utf8')) as {
    targets: string[];
  };
  target = (
    builtInTargets.find((bundle) => bundle.target.id === header.targets[0]) as {
      target: Target;
    }
  ).target;
  const registry = new ElementKindRegistry();
  for (const plugin of builtInPlugins) registerPlugin(registry, plugin);
  const loaded = await loadProject(readOnlyFs(FIXTURE), registry);
  project = loaded.project;
  const lowered = lowerProject(project, registry, target, { plugins: [...builtInPlugins] });
  files = toSimFiles(lowered.files);
}, 60_000);

const floor = (x: number, z: number) => ({ x, y: -1, z });
const up = { x: 0.5, y: 1, z: 0.5 };

function area(): TryItArea {
  return new TryItArea({ files, target, seed: 3, ruleBooks: ruleBooksOf(project) });
}

describe('Try it over the sample rules', () => {
  it('names the rule, plays the chime as a caption and fills the inventory', () => {
    const made = area();
    made.act({
      type: 'place',
      pos: floor(10, 10),
      face: 'up',
      hit: up,
      block: `${NS}:chime_block`,
    });
    made.act({ type: 'use', pos: { x: 10, y: 0, z: 10 }, face: 'up', hit: up });
    const lines = made.whatHappened.slice(-3);
    expect(lines.map((line) => [line.kind, line.text])).toEqual([
      ['trigger', 'You used Chime Block, so rule "Ring the chime" ran.'],
      ['action', 'Played sound Chime.'],
      ['action', 'Gave you 1 Ruby.'],
    ]);
    expect(linkFor(lines[0]?.origin, project)).toEqual({
      label: 'Rule',
      elementId: `${NS}:chime_block_rules`,
      pointer: '/rules/0',
    });
    expect(made.source.inventory.count(`${NS}:ruby`)).toBe(1);
    expect(made.source.itemName(`${NS}:ruby`)).toBe('Ruby');
    // A Minecraft sound: a caption, never played.
    expect(made.effects.captions).toEqual([
      expect.objectContaining({ id: 'minecraft:block.note_block.chime', played: false }),
    ]);
  });

  it('says a script rule with its key, visible as "Only in Minecraft"', () => {
    const made = area();
    made.act({
      type: 'place',
      pos: floor(12, 12),
      face: 'up',
      hit: up,
      block: `${NS}:lucky_block`,
    });
    made.act({ type: 'use', pos: { x: 12, y: 0, z: 12 }, face: 'up', hit: up });
    const texts = made.whatHappened.map((line) => [line.kind, line.text]);
    // With the rule books the rule is named by its own name.
    expect(texts).toContainEqual([
      'trigger',
      'You used Lucky Block, which starts rule "Try your luck".',
    ]);
    expect(texts).toContainEqual(['onlyInMinecraft', 'rule "Try your luck" (it needs a script)']);
  });

  it("shows the Sentinel's sparkles, its Glowing chip and the bell when its timer comes round", () => {
    const made = area();
    made.act({
      type: 'use',
      pos: floor(20, 20),
      face: 'up',
      hit: up,
      item: `${NS}:sentinel_spawn_egg`,
    });
    expect(made.source.entities.count).toBe(1);
    made.setRunEveryTime(true);
    expect(made.runEveryTime).toBe(true);
    for (let i = 0; i < 101; i += 1) made.clock.step();
    expect(made.whatHappened.map((line) => line.text)).toContainEqual(
      expect.stringContaining('so rule "Keep watch" ran.'),
    );
    expect(made.effects.chips).toEqual([
      expect.objectContaining({
        text: expect.stringContaining('Glowing'),
        target: expect.any(Number),
      }),
    ]);
    expect(made.particles.size).toBeGreaterThan(0);
    expect(made.effects.captions.map((caption) => caption.id)).toContain(
      'minecraft:block.note_block.bell',
    );
  });
});
