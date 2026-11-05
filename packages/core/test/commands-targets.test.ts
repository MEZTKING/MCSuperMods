import { describe, expect, it } from 'vitest';
import { CommandStack, commands, createEmptyProject } from '../src/index';

describe('commands.setTargets', () => {
  it('replaces /targets as one undoable step', () => {
    const initial = createEmptyProject('P', { targets: ['mc-old'] });
    const stack = new CommandStack(initial);
    const patches = stack.execute(commands.setTargets(['mc-new']));
    expect(stack.state.targets).toEqual(['mc-new']);
    expect(patches.every((patch) => patch.path.startsWith('/targets'))).toBe(true);
    expect(stack.undoLabel()).toBe('Change target to mc-new');
    expect(stack.undo()).toBe(true);
    expect(stack.state).toEqual(initial);
    expect(stack.redo()).toBe(true);
    expect(stack.state.targets).toEqual(['mc-new']);
  });

  it('never coalesces consecutive target changes', () => {
    const stack = new CommandStack(createEmptyProject('P', { targets: ['mc-a'] }), {
      coalesceWindowMs: 60_000,
    });
    const command = commands.setTargets(['mc-b']);
    expect(command.coalesce).toBeUndefined();
    stack.execute(command);
    stack.execute(commands.setTargets(['mc-c', 'mc-b']));
    expect(stack.state.targets).toEqual(['mc-c', 'mc-b']);
    stack.undo();
    expect(stack.state.targets).toEqual(['mc-b']);
    stack.undo();
    expect(stack.state.targets).toEqual(['mc-a']);
    expect(stack.canUndo).toBe(false);
  });

  it('copies its input', () => {
    const ids = ['mc-b'];
    const stack = new CommandStack(createEmptyProject('P', { targets: ['mc-a'] }));
    stack.execute(commands.setTargets(ids));
    ids.push('mc-c');
    expect(stack.state.targets).toEqual(['mc-b']);
  });

  it('rejects an empty list, empty ids and duplicates immediately', () => {
    expect(() => commands.setTargets([])).toThrow(/at least one target/);
    expect(() => commands.setTargets(['mc-a', ' '])).toThrow(/Invalid target id/);
    expect(() => commands.setTargets(['mc-a', 'mc-a'])).toThrow(/unique/);
  });
});
