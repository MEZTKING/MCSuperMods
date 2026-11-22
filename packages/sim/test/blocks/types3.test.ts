/**
 * Vanilla parity 3, batch 1 in Try it (B519) over `fixtures/sim-parity/project` lowered on every
 * built-in target: the five types of ADR 0103 and their companions are read, placed, grown with
 * Grow and used by hand with the runtime's states (B509 to B512 notes); double chests pair, split
 * and open one 54-slot screen; a big dripleaf tilts under the player; own sounds show as
 * captions; Lightning scrapes weathering blocks.
 */
import type { Target } from '@msm/plugin-api';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type BlockPos,
  bambooLeaves,
  earlierStages,
  LocalWorldSource,
  type SimEffect,
  type SimFiles,
  stopHeight,
  strikeLightning,
} from '../../src/index.js';
import { builtInTargets, lowerFixture } from '../lower-fixture.js';

const NS = 'sim_parity';
const id = (path: string): string => `${NS}:${path}`;
const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number): BlockPos => ({ x, y: -1, z });
const at = (x: number, y: number, z: number): BlockPos => ({ x, y, z });

const targets = await builtInTargets();

/** A weathering family and a chest with own sounds, added to the lowered files. */
const EXTRA: Record<string, string> = {
  'msm/sim_parity/block/tin.json': JSON.stringify({
    format: 1,
    components: { 'msm:weathering': { stage: 'unaffected', next: 'sim_parity:tin_exposed' } },
  }),
  'msm/sim_parity/block/tin_exposed.json': JSON.stringify({
    format: 1,
    components: { 'msm:weathering': { stage: 'exposed', next: 'sim_parity:tin_weathered' } },
  }),
  'msm/sim_parity/block/tin_weathered.json': JSON.stringify({
    format: 1,
    components: { 'msm:weathering': { stage: 'weathered' } },
  }),
  'msm/sim_parity/block/chime.json': JSON.stringify({
    format: 1,
    block_sounds: { place: 'sim_parity:block.chime.place', break: 'minecraft:block.glass.break' },
  }),
  'msm/sim_parity/block/chime_door.json': JSON.stringify({
    format: 1,
    type: 'door',
    set_type: { base: 'iron', can_open_by_hand: true, sounds: { open: 'sim_parity:door.open' } },
  }),
  'msm/sim_parity/block/void_chest.json': JSON.stringify({
    format: 1,
    type: 'horizontal',
    components: { 'msm:container': { per_player: true } },
  }),
};

describe.each(targets.map((target) => [target.id, target] as const))(
  'vanilla parity 3 on %s',
  (_, target: Target) => {
    let files: SimFiles;

    beforeAll(async () => {
      const lowered = await lowerFixture('sim-parity/project', target);
      expect(lowered.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
      files = lowered.files;
    }, 60_000);

    const look = (source: LocalWorldSource, yaw: number, sneak = false): void => {
      source.act({
        type: 'move',
        forward: 0,
        strafe: 0,
        jump: false,
        sneak,
        toggleFly: false,
        yaw,
        pitch: 0,
      });
      source.tick();
    };

    /** An area with the player looking north (yaw 180). */
    const area = (): LocalWorldSource => {
      const source = new LocalWorldSource({
        files: new Map([...files, ...Object.entries(EXTRA)]),
        target,
        seed: 5,
      });
      look(source, 180);
      return source;
    };

    const place = (
      source: LocalWorldSource,
      block: string,
      pos: BlockPos,
      face: 'up' | 'down' | 'north' | 'south' | 'west' | 'east' = 'up',
    ) => {
      source.act({
        type: 'place',
        pos,
        face,
        hit: UP,
        block: block.includes(':') ? block : id(block),
      });
    };
    const grow = (source: LocalWorldSource, pos: BlockPos) =>
      source.act({ type: 'tool', tool: 'grow', pos });
    const use = (source: LocalWorldSource, pos: BlockPos, item?: string) =>
      source.act({
        type: 'use',
        pos,
        face: 'up',
        hit: UP,
        ...(item === undefined ? {} : { item }),
      });
    const name = (source: LocalWorldSource, pos: BlockPos) => source.world.get(pos)?.name ?? null;
    const props = (source: LocalWorldSource, pos: BlockPos) => source.world.get(pos)?.properties;

    it('reads the five types and their companions, none as a prop', () => {
      const source = area();
      const catalogue = source.catalogue;
      expect(catalogue.get(id('ribbon'))?.type).toBe('growing_plant');
      expect(catalogue.get(id('ribbon_plant'))?.types3?.companion).toEqual({
        kind: 'plant',
        of: id('ribbon'),
      });
      expect(catalogue.get(id('reed_bamboo_shoot'))?.types3?.companion?.kind).toBe('shoot');
      expect(catalogue.get(id('big_leaf_stem'))?.types3?.companion?.kind).toBe('stem');
      expect(catalogue.get(id('clay_pot'))?.types3?.pot?.plants).toEqual({
        'minecraft:dandelion': id('clay_pot_dandelion'),
        'minecraft:oak_sapling': id('clay_pot_oak_sapling'),
      });
      expect(catalogue.pottedIn(id('clay_pot_dandelion'))).toEqual({
        pot: id('clay_pot'),
        plant: 'minecraft:dandelion',
      });
      // Companions are known but not offered on their own.
      for (const companion of [
        'ribbon_plant',
        'reed_bamboo_shoot',
        'big_leaf_stem',
        'clay_pot_dandelion',
      ]) {
        expect(catalogue.ids()).not.toContain(id(companion));
      }
      expect(catalogue.get(id('ribbon'))?.properties.age?.length).toBe(26);
      expect(catalogue.get(id('glow_strand'))?.defaultState.properties).toEqual({
        age: '0',
        berries: 'false',
      });
      expect(catalogue.get(id('crate'))?.defaultState.properties).toEqual({
        facing: 'north',
        type: 'single',
        waterlogged: 'false',
      });
      expect(catalogue.get(id('crate'))?.properties.open).toBeUndefined();
      expect(source.lines.filter((line) => line.text.includes('prop for looks'))).toEqual([]);
    });

    it('lengthens a strand placed on its tip, grows it with Grow and breaks it above a gap', () => {
      const source = area();
      place(source, 'ribbon', floor(3, 3));
      place(source, 'ribbon', at(3, 0, 3));
      expect(name(source, at(3, 0, 3))).toBe(id('ribbon_plant'));
      expect(name(source, at(3, 1, 3))).toBe(id('ribbon'));
      grow(source, at(3, 0, 3));
      // `bonemeal_growth` 2: two more blocks from the tip, one age older each.
      expect(name(source, at(3, 2, 3))).toBe(id('ribbon_plant'));
      expect(name(source, at(3, 3, 3))).toBe(id('ribbon'));
      expect(props(source, at(3, 3, 3))?.age).toBe('2');
      source.act({ type: 'break', pos: at(3, 1, 3) });
      expect(name(source, at(3, 0, 3))).toBe(id('ribbon'));
      expect(name(source, at(3, 2, 3))).toBeNull();
      expect(name(source, at(3, 3, 3))).toBeNull();
    });

    it('ripens berries with Grow and picks them by hand', () => {
      const source = area();
      place(source, 'base', floor(3, 3));
      place(source, 'base', at(3, 0, 3));
      place(source, 'base', at(3, 1, 3), 'east');
      place(source, 'glow_strand', at(4, 1, 3), 'down');
      expect(name(source, at(4, 0, 3))).toBe(id('glow_strand'));
      grow(source, at(4, 0, 3));
      expect(props(source, at(4, 0, 3))?.berries).toBe('true');
      use(source, at(4, 0, 3));
      expect(props(source, at(4, 0, 3))?.berries).toBe('false');
      expect(source.inventory.count('minecraft:glow_berries')).toBe(1);
      expect(source.lines.some((line) => line.text.includes('picked the berries'))).toBe(true);
    });

    it('stacks a cactus-like column that falls with its base, and grows it to its stop', () => {
      const source = area();
      place(source, 'spike', floor(2, 2));
      grow(source, at(2, 0, 2));
      grow(source, at(2, 0, 2));
      grow(source, at(2, 0, 2));
      // Three high (vanilla's default stop) and no more.
      expect(name(source, at(2, 2, 2))).toBe(id('spike'));
      expect(name(source, at(2, 3, 2))).toBeNull();
      expect(source.lines.some((line) => line.text.includes('as tall as it grows'))).toBe(true);
      source.act({ type: 'break', pos: at(2, 0, 2) });
      expect(name(source, at(2, 1, 2))).toBeNull();
      expect(name(source, at(2, 2, 2))).toBeNull();
    });

    it('plants a bamboo shoot that grows a stalk, thick from the fourth block', () => {
      const source = area();
      place(source, 'reed_bamboo', floor(4, 4));
      expect(name(source, at(4, 0, 4))).toBe(id('reed_bamboo_shoot'));
      grow(source, at(4, 0, 4));
      expect(name(source, at(4, 0, 4))).toBe(id('reed_bamboo'));
      expect(props(source, at(4, 1, 4))?.leaves).toBe('small');
      expect(props(source, at(4, 0, 4))?.leaves).toBe('none');
      for (let i = 0; i < 4; i++) grow(source, at(4, 0, 4));
      let height = 0;
      while (name(source, at(4, height, 4)) === id('reed_bamboo')) height += 1;
      expect(height).toBeGreaterThanOrEqual(4);
      expect(props(source, at(4, height - 1, 4))?.leaves).toBe('large');
      expect(props(source, at(4, height - 2, 4))?.leaves).toBe('large');
      expect(props(source, at(4, height - 3, 4))?.leaves).toBe('small');
      // Thickness passes down the column.
      expect(props(source, at(4, 0, 4))?.age).toBe('1');
    });

    it('covers faces with lichen, adds one into its own block and drops a face with its block', () => {
      const source = area();
      place(source, 'base', floor(3, 3));
      place(source, 'lichen', at(3, 0, 3), 'east');
      expect(props(source, at(4, 0, 3))?.west).toBe('true');
      place(source, 'lichen', floor(4, 3));
      expect(props(source, at(4, 0, 3))).toMatchObject({ down: 'true', west: 'true' });
      source.act({ type: 'break', pos: at(3, 0, 3) });
      expect(props(source, at(4, 0, 3))).toMatchObject({ down: 'true', west: 'false' });
      grow(source, at(4, 0, 3));
      expect(source.lines.at(-1)?.text).toContain('spread');
    });

    it('turns a lower big leaf into its stem, grows it taller and tilts it under the player', () => {
      const source = area();
      place(source, 'big_leaf', floor(5, 5));
      place(source, 'big_leaf', at(5, 0, 5));
      expect(name(source, at(5, 0, 5))).toBe(id('big_leaf_stem'));
      expect(props(source, at(5, 1, 5))?.facing).toBe('south');
      grow(source, at(5, 0, 5));
      expect(name(source, at(5, 1, 5))).toBe(id('big_leaf_stem'));
      expect(name(source, at(5, 2, 5))).toBe(id('big_leaf'));
      // The player stands on the leaf: unstable after 2 ticks, partial after 10 more, full after 10.
      const leaf = at(5, 2, 5);
      source.player.teleport({ x: 5.5, y: 2 + 15 / 16, z: 5.5 });
      const tilts: string[] = [];
      for (let i = 0; i < 25; i++) {
        source.tick();
        const tilt = props(source, leaf)?.tilt ?? '';
        if (tilts.at(-1) !== tilt) tilts.push(tilt);
      }
      expect(tilts.slice(0, 3)).toEqual(['none', 'unstable', 'partial']);
    });

    it('places a small dripleaf in two halves that go together, and grows it into its big leaf', () => {
      const source = area();
      place(source, 'small_leaf', floor(2, 5));
      expect(props(source, at(2, 0, 5))?.half).toBe('lower');
      expect(props(source, at(2, 1, 5))?.half).toBe('upper');
      grow(source, at(2, 1, 5));
      expect(name(source, at(2, 0, 5))).toBe(id('big_leaf_stem'));
      let top = 1;
      while (name(source, at(2, top, 5)) === id('big_leaf_stem')) top += 1;
      expect(name(source, at(2, top, 5))).toBe(id('big_leaf'));
      expect(top + 1).toBeGreaterThanOrEqual(2);
      expect(top + 1).toBeLessThanOrEqual(4);
      const other = area();
      place(other, 'small_leaf', floor(2, 5));
      other.act({ type: 'break', pos: at(2, 1, 5) });
      expect(name(other, at(2, 0, 5))).toBeNull();
    });

    it('puts a listed plant in a project pot, refuses others and gives it back', () => {
      const source = area();
      place(source, 'clay_pot', floor(3, 3));
      use(source, at(3, 0, 3), 'minecraft:poppy');
      expect(name(source, at(3, 0, 3))).toBe(id('clay_pot'));
      expect(source.lines.at(-1)?.text).toContain('takes only the plants it lists');
      use(source, at(3, 0, 3), 'minecraft:dandelion');
      expect(name(source, at(3, 0, 3))).toBe(id('clay_pot_dandelion'));
      use(source, at(3, 0, 3));
      expect(name(source, at(3, 0, 3))).toBe(id('clay_pot'));
      expect(source.inventory.count('minecraft:dandelion')).toBe(1);
      // A plant breaks out of its pot with a line on the drops.
      use(source, at(3, 0, 3), 'minecraft:oak_sapling');
      source.act({ type: 'break', pos: at(3, 0, 3) });
      expect(source.lines.some((line) => line.text.includes('drops the pot and the plant'))).toBe(
        true,
      );
    });

    it('pairs two chests into one, opens 54 slots and splits when a half goes', () => {
      const source = area();
      place(source, 'crate', floor(3, 3));
      place(source, 'crate', floor(4, 3));
      // Facing south (the player looks north): a `left` half has its other half clockwise (west).
      expect(props(source, at(3, 0, 3))).toMatchObject({ facing: 'south', type: 'right' });
      expect(props(source, at(4, 0, 3))).toMatchObject({ facing: 'south', type: 'left' });
      use(source, at(3, 0, 3));
      expect(source.screen?.spec).toMatchObject({ kind: 'container', rows: 6, columns: 9 });
      source.closeScreen();
      expect(source.catalogue.outline(source.world.get(at(4, 0, 3)) as never)).toEqual([
        [0, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16],
      ]);
      source.act({ type: 'break', pos: at(4, 0, 3) });
      expect(props(source, at(3, 0, 3))?.type).toBe('single');
      use(source, at(3, 0, 3));
      expect(source.screen?.spec).toMatchObject({ rows: 3 });
      // Sneaking places a single chest beside it.
      source.closeScreen();
      look(source, 180, true);
      source.act({ type: 'place', pos: floor(2, 3), face: 'up', hit: UP, block: id('crate') });
      expect(props(source, at(2, 0, 3))?.type).toBe('single');
    });

    it('says a per-player chest shows one store', () => {
      const source = area();
      place(source, 'void_chest', floor(3, 3));
      use(source, at(3, 0, 3));
      expect(source.lines.some((line) => line.text.includes('a store for each player'))).toBe(true);
    });

    it('shows own sounds as captions on placing, breaking and opening', () => {
      const source = area();
      const sounds: SimEffect[] = [];
      source.subscribe((event) => {
        if (event.type === 'effect' && event.effect.kind === 'sound') sounds.push(event.effect);
      });
      place(source, 'chime', floor(3, 3));
      source.act({ type: 'break', pos: at(3, 0, 3) });
      place(source, 'chime_door', floor(5, 3));
      use(source, at(5, 0, 3));
      expect(sounds.map((one) => one.id)).toEqual([
        'sim_parity:block.chime.place',
        'minecraft:block.glass.break',
        'sim_parity:door.open',
      ]);
      // An own set type opens by hand when it says so, though its base is iron.
      expect(props(source, at(5, 0, 3))?.open).toBe('true');
    });

    it('sends a struck block to its first stage and scrapes its neighbours back with Lightning', () => {
      const source = area();
      for (let x = 1; x <= 5; x++) {
        for (let z = 1; z <= 5; z++) place(source, 'tin_weathered', floor(x, z));
      }
      source.act({ type: 'tool', tool: 'lightning', pos: at(3, 0, 3) });
      expect(name(source, at(3, 0, 3))).toBe(id('tin'));
      const back = source.lines.find((line) => line.text.includes('scraped one stage back'));
      expect(back).toBeDefined();
      let scraped = 0;
      for (let x = 1; x <= 5; x++) {
        for (let z = 1; z <= 5; z++) {
          if (name(source, at(x, 0, z)) === id('tin_exposed')) scraped += 1;
        }
      }
      expect(scraped).toBeGreaterThan(0);
      expect(earlierStages(source.catalogue).get(id('tin_exposed'))).toBe(id('tin'));
    });
  },
);

describe('vanilla parity 3 helpers', () => {
  it('gives bamboo leaves by height from the top (B509)', () => {
    expect([0, 1, 2, 3].map((down) => bambooLeaves(down, 5))).toEqual([
      'large',
      'large',
      'small',
      'none',
    ]);
    expect([0, 1].map((down) => bambooLeaves(down, 2))).toEqual(['small', 'none']);
    expect(bambooLeaves(0, 1)).toBe('none');
  });

  it('fixes a column stop height within its range', () => {
    for (let x = 0; x < 20; x++) {
      const stop = stopHeight({ x, y: 0, z: 2 * x }, 12, 16);
      expect(stop).toBeGreaterThanOrEqual(12);
      expect(stop).toBeLessThanOrEqual(16);
    }
    expect(stopHeight({ x: 1, y: 0, z: 1 }, 3, 3)).toBe(3);
  });

  it('exports the bolt', () => {
    expect(typeof strikeLightning).toBe('function');
  });
});
