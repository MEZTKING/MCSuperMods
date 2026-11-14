import { describe, expect, it } from 'vitest';
import {
  applyTool,
  type BlockPos,
  GROW_TOOL,
  POWER_TOOL,
  placeBlock,
  SIM_TOOLS,
} from '../../src/index.js';
import { floor, id, placeOn, propsAt, setUp } from '../blocks/helpers.js';

const P = (x: number, y: number, z: number): BlockPos => ({ x, y, z });
const C = P(5, 0, 5);

describe('Grow', () => {
  it('steps a crop through every age to the last and then says it is grown', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('crop', floor(5, 5)));
    const ages: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      expect(applyTool(ctx.world, ctx.catalogue, ctx.log, GROW_TOOL, C).changed).toBe(true);
      ages.push(propsAt(ctx.world, C)?.age);
    }
    expect(ages).toEqual(['1', '2', '3']);
    expect(applyTool(ctx.world, ctx.catalogue, ctx.log, GROW_TOOL, C).changed).toBe(false);
    expect(propsAt(ctx.world, C)?.age).toBe('3');
    expect(ctx.log.lines.slice(-2)).toEqual(['Crop grew to stage 4 of 4', 'Crop is fully grown']);
  });

  it('steps a sapling once and logs the tree as only in Minecraft', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('sapling', floor(5, 5)));
    const first = applyTool(ctx.world, ctx.catalogue, ctx.log, GROW_TOOL, C);
    expect(first.changes).toEqual([{ pos: C, state: ctx.world.get(C) }]);
    expect(propsAt(ctx.world, C)?.stage).toBe('1');
    const only = ctx.log.only.length;
    applyTool(ctx.world, ctx.catalogue, ctx.log, GROW_TOOL, C);
    expect(propsAt(ctx.world, C)?.stage).toBe('1');
    expect(ctx.world.get(C)?.name).toBe(id('sapling'));
    expect(ctx.log.only.slice(only)).toEqual(['Sapling grows into a tree']);
  });

  it('says so for a block that does not grow, a vanilla prop and air', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('leaves', floor(5, 5)));
    ctx.world.set(P(6, 0, 5), { name: 'minecraft:wheat', properties: {} });
    applyTool(ctx.world, ctx.catalogue, ctx.log, GROW_TOOL, C);
    applyTool(ctx.world, ctx.catalogue, ctx.log, GROW_TOOL, P(6, 0, 5));
    applyTool(ctx.world, ctx.catalogue, ctx.log, GROW_TOOL, P(7, 0, 5));
    expect(ctx.log.lines).toContain('Leaves does not grow');
    expect(ctx.log.lines).toContain('There is no block here to grow');
    expect(ctx.log.only).toContain("Wheat grows only by the game's own rules");
  });
});

describe('Power', () => {
  it('toggles powered on a block that has it', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('powered', floor(5, 5)));
    expect(applyTool(ctx.world, ctx.catalogue, ctx.log, POWER_TOOL, C).changed).toBe(true);
    expect(propsAt(ctx.world, C)?.powered).toBe('true');
    applyTool(ctx.world, ctx.catalogue, ctx.log, POWER_TOOL, C);
    expect(propsAt(ctx.world, C)?.powered).toBe('false');
    expect(ctx.log.lines.slice(-2)).toEqual([
      'Powered is now powered',
      'Powered is no longer powered',
    ]);
  });

  it('toggles lit on a block without powered', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('furnace', floor(5, 5)));
    applyTool(ctx.world, ctx.catalogue, ctx.log, POWER_TOOL, C);
    expect(propsAt(ctx.world, C)?.lit).toBe('true');
    expect(ctx.log.lines.at(-1)).toBe('Furnace is now lit');
  });

  it('logs a block with neither as only in Minecraft and changes nothing', () => {
    const ctx = setUp();
    placeBlock(ctx.world, ctx.catalogue, placeOn('iron_door', floor(5, 5)));
    const before = ctx.world.get(C);
    const result = applyTool(ctx.world, ctx.catalogue, ctx.log, POWER_TOOL, C);
    expect(result).toEqual({ changed: false, changes: [] });
    expect(ctx.world.get(C)).toBe(before);
    expect(ctx.log.only.at(-1)).toBe(
      'Iron Door has no powered or lit picture; what a redstone signal does to it shows only in the game',
    );
  });

  it('logs an unknown tool and lists the tools', () => {
    const ctx = setUp();
    applyTool(ctx.world, ctx.catalogue, ctx.log, 'hammer', C);
    expect(ctx.log.lines.at(-1)).toBe('There is no tool called "hammer"');
    expect(SIM_TOOLS.map((tool) => tool.label)).toEqual(['Grow', 'Power']);
  });
});
