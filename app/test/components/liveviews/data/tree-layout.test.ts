/**
 * MSM's tidy tree against the positions the real game gave MSM's own fixture tab (B600 2S8,
 * `docs/reference/spikes/b600/results/`): the server's layout on both targets and the client's
 * after the whole tab was granted. Given the game's order of siblings (read from the game's own
 * rows) the layout matches every node; in MSM's order (by id) the columns still match and the
 * rows only partly (limit 2L5: about right).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  type AdvancementNode,
  ancestorsOf,
  byId,
  layoutTab,
  readAdvancement,
  tidyRows,
} from '../../../../src/renderer/src/liveviews/data/advancement/tree-layout';

const RESULTS = join(__dirname, '../../../../../docs/reference/spikes/b600/results');
const NS = 'msm_b600';

/** The spike's fixture tab (`spike-src/make_pack.py`, MSM's own files). */
function fixtureFiles(): Record<string, Json> {
  const files: Record<string, Json> = {};
  const adv = (
    path: string,
    parent: string | null,
    options: { frame?: string; hidden?: boolean; display?: boolean } = {},
  ) => {
    const file: Record<string, Json> = { criteria: { c0: { trigger: 'minecraft:impossible' } } };
    if (parent !== null) file.parent = `${NS}:${parent}`;
    if (options.display !== false) {
      file.display = {
        icon: { id: 'minecraft:stone' },
        title: { text: path },
        description: { text: 'd' },
        frame: options.frame ?? 'task',
        hidden: options.hidden ?? false,
      };
    }
    files[`${NS}:${path}`] = file;
  };
  adv('tab/root', null);
  adv('tab/a', 'tab/root');
  adv('tab/b', 'tab/root', { frame: 'goal' });
  adv('tab/c', 'tab/root', { frame: 'challenge' });
  adv('tab/a1', 'tab/a');
  adv('tab/a2', 'tab/a');
  adv('tab/a3', 'tab/a');
  adv('tab/a2x', 'tab/a2', { hidden: true });
  adv('tab/a2y', 'tab/a2');
  adv('tab/b1', 'tab/b');
  adv('tab/c1', 'tab/c');
  adv('tab/c1a', 'tab/c1');
  adv('tab/c1b', 'tab/c1');
  adv('tab/c1c', 'tab/c1');
  adv('tab/nodisplay', 'tab/c', { display: false });
  adv('tab/under_nodisplay', 'tab/nodisplay');
  adv('hidden_root/root', null, { hidden: true });
  adv('plain/root', null, { display: false });
  adv('plain/child', 'plain/root');
  return files;
}

function nodesOf(files: Record<string, Json>): Map<string, AdvancementNode> {
  return new Map(
    Object.entries(files).map(([id, json]) => [id, readAdvancement(id, json, 'project')]),
  );
}

/** The game's positions of the tab's shown nodes: `{ x, y }` by id. */
function serverPositions(version: string): Map<string, { x: number; y: number }> {
  const observed = JSON.parse(
    readFileSync(join(RESULTS, `server-${version}.json`), 'utf8'),
  ) as Record<string, Record<string, { x: number; y: number; display?: boolean; root: string }>>;
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, node] of Object.entries(observed['adv.ours'] ?? {})) {
    if (node.root === `${NS}:tab/root` && node.display !== false)
      out.set(id, { x: node.x, y: node.y });
  }
  return out;
}

function clientPositions(version: string): Map<string, { x: number; y: number }> {
  const observed = JSON.parse(
    readFileSync(join(RESULTS, `client-${version}.json`), 'utf8'),
  ) as Record<string, Record<string, string | string[]>>;
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, value] of Object.entries(observed['advancements.treeAllGranted'] ?? {})) {
    if (!id.startsWith(`${NS}:tab/`) || typeof value !== 'string') continue;
    if (id === `${NS}:tab/nodisplay`) continue;
    const [x, y] = value.split(',').map(Number) as [number, number];
    out.set(id, { x, y });
  }
  return out;
}

function score(
  positions: Map<string, { x: number; y: number }>,
  order: (a: string, b: string) => number,
): { nodes: number; xExact: number; yExact: number } {
  const layout = layoutTab(nodesOf(fixtureFiles()), `${NS}:tab/root`, order);
  if (layout === null) throw new Error('no tab');
  let xExact = 0;
  let yExact = 0;
  for (const node of layout.nodes) {
    const seen = positions.get(node.id);
    if (seen === undefined) continue;
    if (seen.x === node.x) xExact += 1;
    if (Math.abs(seen.y - node.y) < 1e-9) yExact += 1;
  }
  return { nodes: layout.nodes.length, xExact, yExact };
}

const gameOrder =
  (positions: Map<string, { y: number }>) =>
  (a: string, b: string): number =>
    (positions.get(a)?.y ?? 0) - (positions.get(b)?.y ?? 0);

describe('the advancement tab as a tidy tree (B611, against B600 2S8)', () => {
  for (const version of ['26.3', '26.4-alpha.7']) {
    it(`matches the server's tab on ${version} in the game's order, and partly in MSM's`, () => {
      const positions = serverPositions(version);
      expect(positions.size).toBe(15);
      expect(score(positions, gameOrder(positions))).toEqual({ nodes: 15, xExact: 15, yExact: 15 });
      const ours = score(positions, byId);
      expect(ours.xExact).toBe(15);
      expect(ours.yExact).toBeLessThan(15);
    });

    it(`matches the client's whole tab on ${version} in the client's order`, () => {
      const positions = clientPositions(version);
      expect(positions.size).toBe(15);
      expect(score(positions, gameOrder(positions))).toEqual({ nodes: 15, xExact: 15, yExact: 15 });
    });
  }

  it('skips an advancement without a display and hangs its children from the shown ancestor', () => {
    const layout = layoutTab(nodesOf(fixtureFiles()), `${NS}:tab/root`);
    const ids = layout?.nodes.map((node) => node.id) ?? [];
    expect(ids).not.toContain(`${NS}:tab/nodisplay`);
    expect(layout?.edges).toContainEqual({ from: `${NS}:tab/c`, to: `${NS}:tab/under_nodisplay` });
    expect(layout?.nodes.find((node) => node.id === `${NS}:tab/under_nodisplay`)?.x).toBe(2);
  });

  it('makes no tab of a root without a display', () => {
    expect(layoutTab(nodesOf(fixtureFiles()), `${NS}:plain/root`)).toBeNull();
  });

  it('puts a parent at the midpoint of its first and last child', () => {
    const rows = tidyRows('p', (id) => (id === 'p' ? ['a', 'b', 'c'] : []));
    expect(rows.get('a')).toBe(0);
    expect(rows.get('c')).toBe(2);
    expect(rows.get('p')).toBe(1);
  });

  it('follows parents to the root, and stops at a loop or a missing parent', () => {
    const nodes = nodesOf(fixtureFiles());
    expect(ancestorsOf(nodes, `${NS}:tab/a2x`).chain).toEqual([
      `${NS}:tab/a2`,
      `${NS}:tab/a`,
      `${NS}:tab/root`,
    ]);
    const looped = new Map(nodes);
    looped.set('x:a', readAdvancement('x:a', { parent: 'x:b' }, 'project'));
    looped.set('x:b', readAdvancement('x:b', { parent: 'x:a' }, 'project'));
    expect(ancestorsOf(looped, 'x:a').loop).toBe(true);
    looped.set('x:c', readAdvancement('x:c', { parent: 'story/root' }, 'project'));
    expect(ancestorsOf(looped, 'x:c').missing).toBe('minecraft:story/root');
  });
});
