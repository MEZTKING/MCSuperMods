import { describe, expect, it } from 'vitest';
import {
  type CommandEvent,
  CommandStack,
  commands,
  createElement,
  createEmptyProject,
  DuplicateElementError,
  ElementNotFoundError,
  immerPatchesToJsonPatch,
  type Project,
  type ProjectCommand,
  toJsonPointer,
} from '../src/index';
import { fixedNow } from './helpers/kinds';

function projectWithElement(): Project {
  const project = createEmptyProject('P');
  project.namespaces.push({
    name: 'ns',
    elements: [createElement({ id: 'ns:a', kind: 'test:thing', data: { x: 1 }, now: fixedNow })],
    assets: [],
  });
  return project;
}

const setX = (value: number): ProjectCommand => ({
  id: 'test.set-x',
  label: `Set x to ${value}`,
  apply(draft) {
    const data = draft.namespaces[0]?.elements[0]?.data as { x: number };
    data.x = value;
  },
});

describe('toJsonPointer', () => {
  it('escapes ~ and / per RFC 6901', () => {
    expect(toJsonPointer([])).toBe('');
    expect(toJsonPointer(['a', 0, 'b'])).toBe('/a/0/b');
    expect(toJsonPointer(['a/b', '~c', '~/'])).toBe('/a~1b/~0c/~0~1');
    expect(toJsonPointer([''])).toBe('/');
  });

  it('converts Immer patches', () => {
    expect(
      immerPatchesToJsonPatch([
        { op: 'replace', path: ['a', 1], value: 2 },
        { op: 'remove', path: ['b/c'] },
        { op: 'add', path: ['d'], value: { e: null } },
      ]),
    ).toEqual([
      { op: 'replace', path: '/a/1', value: 2 },
      { op: 'remove', path: '/b~1c' },
      { op: 'add', path: '/d', value: { e: null } },
    ]);
  });
});

describe('CommandStack', () => {
  it('emits RFC 6902 patches and undoes and redoes them', () => {
    const initial = projectWithElement();
    const snapshot = structuredClone(initial);
    const stack = new CommandStack(initial);
    const patches = stack.execute(setX(5));
    expect(patches).toEqual([{ op: 'replace', path: '/namespaces/0/elements/0/data/x', value: 5 }]);
    expect(stack.canUndo).toBe(true);
    expect(stack.undoLabel()).toBe('Set x to 5');
    const after = structuredClone(stack.state);

    expect(stack.undo()).toBe(true);
    expect(stack.state).toEqual(snapshot);
    expect(stack.canRedo).toBe(true);
    expect(stack.redoLabel()).toBe('Set x to 5');

    expect(stack.redo()).toBe(true);
    expect(stack.state).toEqual(after);
    expect(stack.redo()).toBe(false);
  });

  it('returns false when there is nothing to undo or redo', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    expect(stack.undo()).toBe(false);
    expect(stack.redo()).toBe(false);
    expect(stack.undoLabel()).toBeUndefined();
    expect(stack.redoLabel()).toBeUndefined();
  });

  it('freezes states', () => {
    const stack = new CommandStack(projectWithElement());
    expect(Object.isFrozen(stack.state)).toBe(true);
    stack.execute(setX(2));
    expect(Object.isFrozen(stack.state.namespaces[0]?.elements[0]?.data)).toBe(true);
  });

  it('tracks the dirty state against the saved version', () => {
    const stack = new CommandStack(projectWithElement());
    expect(stack.isDirty).toBe(false);
    stack.execute(setX(2));
    expect(stack.isDirty).toBe(true);
    stack.markSaved();
    expect(stack.isDirty).toBe(false);
    stack.execute(setX(3));
    expect(stack.isDirty).toBe(true);
    stack.undo();
    expect(stack.isDirty).toBe(false);
    stack.undo();
    expect(stack.isDirty).toBe(true);
    stack.redo();
    expect(stack.isDirty).toBe(false);
  });

  it('stays dirty when the saved state is discarded from the redo history', () => {
    const stack = new CommandStack(projectWithElement());
    stack.execute(setX(2));
    stack.markSaved();
    stack.undo();
    stack.execute(setX(2));
    expect(stack.isDirty).toBe(true);
  });

  it('drops the oldest entries beyond the limit', () => {
    const stack = new CommandStack(projectWithElement(), { limit: 2 });
    stack.execute(setX(2));
    stack.execute(setX(3));
    stack.execute(setX(4));
    expect(stack.undo()).toBe(true);
    expect(stack.undo()).toBe(true);
    expect(stack.undo()).toBe(false);
    expect(stack.state.namespaces[0]?.elements[0]?.data).toEqual({ x: 2 });
    expect(stack.isDirty).toBe(true);
  });

  it('rejects an invalid limit', () => {
    expect(() => new CommandStack(createEmptyProject('P'), { limit: 0 })).toThrow(RangeError);
  });

  it('reset clears history and marks the new state as saved', () => {
    const stack = new CommandStack(projectWithElement());
    stack.execute(setX(2));
    stack.reset(createEmptyProject('Other'));
    expect(stack.canUndo).toBe(false);
    expect(stack.canRedo).toBe(false);
    expect(stack.isDirty).toBe(false);
    expect(stack.state.name).toBe('Other');
  });

  it('escapes keys containing / and ~ in patches', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    expect(stack.execute(commands.setSetting('a/b~c', 1))).toEqual([
      { op: 'add', path: '/settings/a~1b~0c', value: 1 },
    ]);
  });

  it('does not record commands that change nothing', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    expect(stack.execute(commands.renameProject('P'))).toEqual([]);
    expect(stack.canUndo).toBe(false);
    expect(stack.isDirty).toBe(false);
  });

  it('leaves state unchanged when a command throws', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    const before = stack.state;
    expect(() =>
      stack.execute({
        id: 'test.fail',
        label: 'Fail',
        apply(draft) {
          draft.name = 'changed';
          throw new Error('boom');
        },
      }),
    ).toThrow('boom');
    expect(stack.state).toBe(before);
    expect(stack.canUndo).toBe(false);
  });

  it('notifies subscribers and supports unsubscribing', () => {
    const stack = new CommandStack(projectWithElement());
    const events: CommandEvent[] = [];
    const unsubscribe = stack.subscribe((event) => events.push(event));
    stack.execute(setX(7));
    stack.undo();
    stack.redo();
    stack.reset(createEmptyProject('R'));
    unsubscribe();
    stack.execute(commands.renameProject('S'));
    expect(events.map((event) => [event.type, event.label])).toEqual([
      ['execute', 'Set x to 7'],
      ['undo', 'Set x to 7'],
      ['redo', 'Set x to 7'],
      ['reset', undefined],
    ]);
    expect(events[1]?.patches).toEqual([
      { op: 'replace', path: '/namespaces/0/elements/0/data/x', value: 1 },
    ]);
    expect(events[3]?.state.name).toBe('R');
    expect(events[3]?.patches).toEqual([]);
  });
});

describe('commands', () => {
  const element = (id: `${string}:${string}`) =>
    createElement({ id, kind: 'test:thing', data: { v: 1 }, now: fixedNow });

  it('adds and removes namespaces in sorted order', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    stack.execute(commands.addNamespace('b'));
    stack.execute(commands.addNamespace('a'));
    expect(stack.state.namespaces.map((namespace) => namespace.name)).toEqual(['a', 'b']);
    expect(() => stack.execute(commands.addNamespace('a'))).toThrow(/already exists/);
    expect(() => commands.addNamespace('Bad')).toThrow(/Invalid namespace/);
    stack.execute(commands.removeNamespace('a'));
    expect(stack.state.namespaces.map((namespace) => namespace.name)).toEqual(['b']);
    expect(() => stack.execute(commands.removeNamespace('a'))).toThrow(/does not exist/);
  });

  it('adds elements sorted by id and rejects duplicates and missing namespaces', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    stack.execute(commands.addNamespace('ns'));
    stack.execute(commands.addElement(element('ns:b')));
    stack.execute(commands.addElement(element('ns:a')));
    expect(stack.state.namespaces[0]?.elements.map((e) => e.id)).toEqual(['ns:a', 'ns:b']);
    expect(() => stack.execute(commands.addElement(element('ns:a')))).toThrow(
      DuplicateElementError,
    );
    expect(() => stack.execute(commands.addElement(element('other:a')))).toThrow(/does not exist/);
  });

  it('does not freeze or share the caller element', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    stack.execute(commands.addNamespace('ns'));
    const mine = element('ns:a');
    stack.execute(commands.addElement(mine));
    expect(Object.isFrozen(mine)).toBe(false);
    expect(stack.state.namespaces[0]?.elements[0]).not.toBe(mine);
  });

  it('removes elements and edits data and notes', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    stack.execute(commands.addNamespace('ns'));
    stack.execute(commands.addElement(element('ns:a')));
    stack.execute(commands.setElementData('ns:a', { v: 2 }));
    stack.execute(commands.setElementNotes('ns:a', 'Hello'));
    const loaded = stack.state.namespaces[0]?.elements[0];
    expect(loaded?.data).toEqual({ v: 2 });
    expect(loaded?.meta.notes).toBe('Hello');
    stack.execute(commands.setElementNotes('ns:a', undefined));
    expect('notes' in (stack.state.namespaces[0]?.elements[0]?.meta ?? {})).toBe(false);
    expect(() => stack.execute(commands.setElementData('ns:zz', 1))).toThrow(ElementNotFoundError);
    stack.execute(commands.removeElement('ns:a'));
    expect(stack.state.namespaces[0]?.elements).toEqual([]);
    expect(() => stack.execute(commands.removeElement('ns:a'))).toThrow(ElementNotFoundError);
  });

  it('renames the project and sets settings, undoably', () => {
    const stack = new CommandStack(createEmptyProject('P'));
    stack.execute(commands.renameProject('Q'));
    stack.execute(commands.setSetting('k', { a: [1] }));
    expect(stack.state.name).toBe('Q');
    expect(stack.state.settings).toEqual({ k: { a: [1] } });
    stack.undo();
    stack.undo();
    expect(stack.state).toEqual(createEmptyProject('P'));
  });
});
