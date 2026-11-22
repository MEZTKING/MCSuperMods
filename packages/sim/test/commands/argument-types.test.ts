/**
 * The 32 newer command argument types in Try it's chat box (B540, ADR 0111 D2 as amended after
 * B525): every type of the target's facts is read (none is dropped), `time` in ticks, `message`
 * to the end of the line, `rotation` as two coordinates, the rest one token, and what only the
 * game can check is said.
 */
import type { Json, Target } from '@msm/plugin-api';
import { expect, it } from 'vitest';
import {
  COMMAND_ARGUMENT_TYPES,
  parseCommandLine,
  readCommands,
  type SimCommand,
} from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';

const targets = await builtInTargets();
const ctx = { feet: { x: 1, y: 2, z: 3 }, knowsItem: () => true, knowsBlock: () => true };

function command(args: Json[]): SimCommand {
  const files = new Map([
    ['msm/cm/command/go.json', JSON.stringify({ format: 1, name: 'go', arguments: args })],
  ]);
  const [one] = readCommands(files, targets[0] as Target);
  if (one === undefined) throw new Error('no command');
  return one;
}

it('knows every argument type of every target', () => {
  for (const target of targets) {
    const names = Object.keys(target.commands?.argumentTypes ?? {});
    expect(names.length).toBe(44);
    expect([...COMMAND_ARGUMENT_TYPES].sort()).toEqual([...names].sort());
  }
});

it('reads the newer types by their shape', () => {
  const go = command([
    { name: 'when', type: 'time' },
    { name: 'look', type: 'rotation' },
    { name: 'team', type: 'team' },
    { name: 'data', type: 'nbt' },
    { name: 'range', type: 'int_range' },
    { name: 'note', type: 'message' },
  ]);
  expect(go.arguments).toHaveLength(6);
  const parsed = parseCommandLine('/go 2d ~ 10 red {a: "b c"} 1..5 hello @p there', [go], [], ctx);
  if (!parsed.ok) throw new Error(parsed.error);
  expect(parsed.args).toEqual({
    when: 48000,
    look: '~ 10',
    team: 'red',
    data: '{a: "b c"}',
    range: '1..5',
    note: 'hello @p there',
  });
  expect(parsed.unchecked).toContain('whether red is a team the game knows');
  const bad = parseCommandLine('/go 2x ~ 10 red {} 1 x', [go], [], ctx);
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.error).toBe("Invalid unit or time '2x'");
});
