import { describe, expect, it } from 'vitest';
import {
  CommandStack,
  commands,
  createElement,
  createEmptyProject,
  ElementNotFoundError,
  type Json,
  type Project,
  parseJsonPointer,
} from '../src/index';
import { fixedNow } from './helpers/kinds';

function projectWith(data: Json): Project {
  const project = createEmptyProject('P');
  project.namespaces.push({
    name: 'ns',
    elements: [createElement({ id: 'ns:a', kind: 'test:thing', data, now: fixedNow })],
    assets: [{ path: 'textures/b.png', mediaType: 'image/png' }],
  });
  return project;
}

const dataOf = (stack: CommandStack): Json | undefined =>
  stack.state.namespaces[0]?.elements[0]?.data;

describe('parseJsonPointer', () => {
  it('splits and unescapes', () => {
    expect(parseJsonPointer('')).toEqual([]);
    expect(parseJsonPointer('/')).toEqual(['']);
    expect(parseJsonPointer('/a~1b/~0c/0')).toEqual(['a/b', '~c', '0']);
    expect(parseJsonPointer('/~01')).toEqual(['~1']);
  });

  it('rejects malformed pointers', () => {
    expect(() => parseJsonPointer('a')).toThrow();
    expect(() => parseJsonPointer('/a~2')).toThrow();
    expect(() => parseJsonPointer('/a~')).toThrow();
  });
});

describe('commands.setElementValue', () => {
  it('sets, replaces and deletes object members', () => {
    const stack = new CommandStack(projectWith({ a: 1, b: { c: 2 } }));
    stack.execute(commands.setElementValue('ns:a', '/a', 5));
    stack.execute(commands.setElementValue('ns:a', '/b/c', 'x'));
    stack.execute(commands.setElementValue('ns:a', '/b/d', [1]));
    expect(dataOf(stack)).toEqual({ a: 5, b: { c: 'x', d: [1] } });
    stack.execute(commands.setElementValue('ns:a', '/b/c', undefined));
    expect(dataOf(stack)).toEqual({ a: 5, b: { d: [1] } });
  });

  it('creates intermediate objects and arrays', () => {
    const stack = new CommandStack(projectWith({}));
    const patches = stack.execute(commands.setElementValue('ns:a', '/textures/all', 'ns:block/a'));
    expect(patches).toEqual([
      {
        op: 'add',
        path: '/namespaces/0/elements/0/data/textures',
        value: { all: 'ns:block/a' },
      },
    ]);
    stack.execute(commands.setElementValue('ns:a', '/elements/-/from', [0, 0, 0]));
    stack.execute(commands.setElementValue('ns:a', '/list/0/0', true));
    expect(dataOf(stack)).toEqual({
      textures: { all: 'ns:block/a' },
      elements: [{ from: [0, 0, 0] }],
      list: [[true]],
    });
  });

  it('replaces, appends and splices array items', () => {
    const stack = new CommandStack(projectWith({ l: ['a', 'b', 'c'] }));
    stack.execute(commands.setElementValue('ns:a', '/l/1', 'B'));
    stack.execute(commands.setElementValue('ns:a', '/l/-', 'd'));
    stack.execute(commands.setElementValue('ns:a', '/l/4', 'e'));
    expect(dataOf(stack)).toEqual({ l: ['a', 'B', 'c', 'd', 'e'] });
    stack.execute(commands.setElementValue('ns:a', '/l/0', undefined));
    expect(dataOf(stack)).toEqual({ l: ['B', 'c', 'd', 'e'] });
  });

  it('treats deleting something missing as no change', () => {
    const stack = new CommandStack(projectWith({ a: 1, l: [] }));
    expect(stack.execute(commands.setElementValue('ns:a', '/x/y', undefined))).toEqual([]);
    expect(stack.execute(commands.setElementValue('ns:a', '/b', undefined))).toEqual([]);
    expect(stack.execute(commands.setElementValue('ns:a', '/l/0', undefined))).toEqual([]);
    expect(stack.canUndo).toBe(false);
  });

  it('replaces the whole data for the empty pointer', () => {
    const stack = new CommandStack(projectWith({ a: 1 }));
    stack.execute(commands.setElementValue('ns:a', '', { b: 2 }));
    expect(dataOf(stack)).toEqual({ b: 2 });
    expect(() => stack.execute(commands.setElementValue('ns:a', '', undefined))).toThrow();
  });

  it('rejects impossible paths and leaves the state unchanged', () => {
    const stack = new CommandStack(projectWith({ a: 1, l: [1] }));
    const before = stack.state;
    expect(() => stack.execute(commands.setElementValue('ns:a', '/a/b', 1))).toThrow(/"\/a"/);
    expect(() => stack.execute(commands.setElementValue('ns:a', '/l/x', 1))).toThrow(/index/);
    expect(() => stack.execute(commands.setElementValue('ns:a', '/l/5', 1))).toThrow(/beyond/);
    expect(() => stack.execute(commands.setElementValue('ns:missing', '/a', 1))).toThrow(
      ElementNotFoundError,
    );
    expect(() => commands.setElementValue('ns:a', 'bad', 1)).toThrow();
    expect(stack.state).toBe(before);
  });

  it('copies the value so later mutation does not leak in', () => {
    const value = { x: 1 };
    const command = commands.setElementValue('ns:a', '/v', value);
    value.x = 2;
    const stack = new CommandStack(projectWith({}));
    stack.execute(command);
    expect(dataOf(stack)).toEqual({ v: { x: 1 } });
  });
});

describe('asset commands', () => {
  it('adds asset records sorted by path and removes them', () => {
    const stack = new CommandStack(projectWith({}));
    stack.execute(commands.addAsset('ns', { path: 'textures/c.png', mediaType: 'image/png' }));
    stack.execute(commands.addAsset('ns', { path: 'sounds/a.ogg', mediaType: 'audio/ogg' }));
    expect(stack.state.namespaces[0]?.assets.map((asset) => asset.path)).toEqual([
      'sounds/a.ogg',
      'textures/b.png',
      'textures/c.png',
    ]);
    expect(stack.undoLabel()).toBe('Add asset ns:sounds/a.ogg');
    stack.execute(commands.removeAsset('ns', 'textures/b.png'));
    expect(stack.state.namespaces[0]?.assets.map((asset) => asset.path)).toEqual([
      'sounds/a.ogg',
      'textures/c.png',
    ]);
    stack.undo();
    expect(stack.state.namespaces[0]?.assets).toHaveLength(3);
  });

  it('rejects bad paths, duplicates and missing namespaces or assets', () => {
    const stack = new CommandStack(projectWith({}));
    expect(() => commands.addAsset('ns', { path: '../x.png', mediaType: 'image/png' })).toThrow();
    expect(() =>
      stack.execute(commands.addAsset('ns', { path: 'textures/b.png', mediaType: 'image/png' })),
    ).toThrow(/already/);
    expect(() =>
      stack.execute(commands.addAsset('zz', { path: 'a.png', mediaType: 'image/png' })),
    ).toThrow(/does not exist/);
    expect(() => stack.execute(commands.removeAsset('ns', 'nope.png'))).toThrow(/no asset/);
    expect(() => stack.execute(commands.removeAsset('zz', 'a.png'))).toThrow(/does not exist/);
  });
});

describe('command coalescing', () => {
  function clockedStack(data: Json = { name: '' }, window = 800) {
    let time = 1000;
    const stack = new CommandStack(projectWith(data), {
      coalesceWindowMs: window,
      now: () => time,
    });
    return {
      stack,
      advance: (ms: number) => {
        time += ms;
      },
    };
  }

  it('merges consecutive commands with the same key into one undo step', () => {
    const { stack, advance } = clockedStack();
    const events: string[] = [];
    stack.subscribe((event) => events.push(`${event.type}:${event.patches.length}`));
    for (const text of ['r', 'ru', 'rub', 'ruby']) {
      stack.execute(commands.setElementValue('ns:a', '/name', text, { coalesce: 'typing:/name' }));
      advance(300);
    }
    expect(dataOf(stack)).toEqual({ name: 'ruby' });
    expect(events).toEqual(['execute:1', 'execute:1', 'execute:1', 'execute:1']);
    expect(stack.undoLabel()).toBe('Edit ns:a');
    expect(stack.undo()).toBe(true);
    expect(dataOf(stack)).toEqual({ name: '' });
    expect(stack.canUndo).toBe(false);
    expect(stack.redo()).toBe(true);
    expect(dataOf(stack)).toEqual({ name: 'ruby' });
  });

  it('starts a new step once the window has passed', () => {
    const { stack, advance } = clockedStack();
    stack.execute(commands.setElementValue('ns:a', '/name', 'a', { coalesce: 'k' }));
    advance(800);
    stack.execute(commands.setElementValue('ns:a', '/name', 'ab', { coalesce: 'k' }));
    stack.undo();
    expect(dataOf(stack)).toEqual({ name: 'a' });
    stack.undo();
    expect(dataOf(stack)).toEqual({ name: '' });
  });

  it('does not merge different keys, keyless commands, or across undo and save', () => {
    const { stack } = clockedStack();
    stack.execute(commands.setElementValue('ns:a', '/name', 'a', { coalesce: 'k' }));
    stack.execute(commands.setElementValue('ns:a', '/other', 1, { coalesce: 'j' }));
    stack.execute(commands.setElementValue('ns:a', '/other', 2));
    stack.execute(commands.setElementValue('ns:a', '/other', 3));
    expect(countUndos(stack)).toBe(4);

    const second = clockedStack().stack;
    second.execute(commands.setElementValue('ns:a', '/name', 'a', { coalesce: 'k' }));
    second.execute(commands.setElementValue('ns:a', '/name', 'b', { coalesce: 'k' }));
    second.undo();
    second.redo();
    second.execute(commands.setElementValue('ns:a', '/name', 'c', { coalesce: 'k' }));
    second.markSaved();
    second.execute(commands.setElementValue('ns:a', '/name', 'd', { coalesce: 'k' }));
    expect(second.isDirty).toBe(true);
    expect(countUndos(second)).toBe(3);
  });

  it('keeps dirty tracking right for merged entries', () => {
    const { stack } = clockedStack();
    stack.execute(commands.setElementValue('ns:a', '/name', 'a', { coalesce: 'k' }));
    expect(stack.isDirty).toBe(true);
    stack.execute(commands.setElementValue('ns:a', '/name', '', { coalesce: 'k' }));
    expect(dataOf(stack)).toEqual({ name: '' });
    expect(stack.isDirty).toBe(true);
    stack.undo();
    expect(stack.isDirty).toBe(false);
  });

  it('coalesces setElementData too', () => {
    const { stack } = clockedStack({ v: 0 });
    stack.execute(commands.setElementData('ns:a', { v: 1 }, { coalesce: 'raw' }));
    stack.execute(commands.setElementData('ns:a', { v: 2 }, { coalesce: 'raw' }));
    expect(countUndos(stack)).toBe(1);
    expect(dataOf(stack)).toEqual({ v: 0 });
  });

  it('rejects a negative window', () => {
    expect(() => new CommandStack(createEmptyProject('P'), { coalesceWindowMs: -1 })).toThrow(
      RangeError,
    );
  });
});

function countUndos(stack: CommandStack): number {
  let count = 0;
  while (stack.undo()) count++;
  return count;
}
