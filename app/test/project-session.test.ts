import { createMemoryFileSystem, type MemoryFileSystem, type Problem } from '@msm/core';
import { describe, expect, it } from 'vitest';
import { phase0SamplePlugin } from '../src/renderer/src/plugins/phase0-sample';
import {
  ProjectSession,
  SaveBlockedError,
  saveBlockers,
} from '../src/renderer/src/session/project-session';
import type { PlatformAdapter } from '../src/shared/platform';

function fakePlatform(fs: MemoryFileSystem, options: { discard?: boolean } = {}) {
  const calls: string[] = [];
  const platform: PlatformAdapter = {
    app: { info: async () => ({ version: '0', electron: '0', platform: 'test' }) },
    dialogs: {
      pickDirectory: async () => '/projects/demo',
      confirmDiscard: async (message) => {
        calls.push(`confirm:${message}`);
        return options.discard ?? true;
      },
    },
    project: {
      openRoot: async () => ({ ok: true }),
      createRoot: async () => ({ ok: true }),
      closeRoot: async () => {},
      currentRoot: async () => '/projects/demo',
    },
    fs,
  };
  return { platform, calls };
}

const now = () => '2026-01-01T00:00:00.000Z';

function newSession(fs: MemoryFileSystem, options: { discard?: boolean } = {}) {
  const { platform, calls } = fakePlatform(fs, options);
  return { session: new ProjectSession(platform, { plugins: [phase0SamplePlugin], now }), calls };
}

describe('ProjectSession', () => {
  it('creates, edits, saves and reloads a project', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    expect(await session.newProject()).toEqual({ ok: true });
    expect(session.snapshot.project?.name).toBe('demo');
    expect(session.snapshot.dirty).toBe(false);

    session.addNamespace('demo');
    session.addElement({ id: 'demo:iron_block', kind: 'minecraft:recipe' });
    session.setElementData('demo:iron_block', { type: 'minecraft:crafting_shaped' });
    expect(session.snapshot.dirty).toBe(true);
    await session.save();
    expect(session.snapshot.dirty).toBe(false);
    expect(fs.list()).toContain('content/demo/recipe/iron_block.json');

    const { session: reloaded } = newSession(fs);
    expect(await reloaded.openProject()).toEqual({ ok: true });
    expect(reloaded.snapshot.problems).toEqual([]);
    expect(reloaded.snapshot.project).toEqual(session.snapshot.project);
  });

  it('tracks dirty state and labels through undo and redo', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    const seen: boolean[] = [];
    session.subscribe((snapshot) => seen.push(snapshot.dirty));

    session.addNamespace('demo');
    expect(session.snapshot.canUndo).toBe(true);
    expect(session.snapshot.undoLabel).toBe('Add namespace "demo"');
    expect(session.undo()).toBe(true);
    expect(session.snapshot.dirty).toBe(false);
    expect(session.snapshot.redoLabel).toBe('Add namespace "demo"');
    expect(session.redo()).toBe(true);
    expect(session.snapshot.dirty).toBe(true);
    expect(seen).toEqual([true, false, true]);
  });

  it('asks before discarding unsaved changes', async () => {
    const { session, calls } = newSession(createMemoryFileSystem(), { discard: false });
    await session.newProject();
    session.addNamespace('demo');
    expect(await session.openProject()).toEqual({ ok: false, cancelled: true });
    expect(calls).toHaveLength(1);
    expect(session.snapshot.project?.namespaces).toHaveLength(1);
  });

  it('rejects unknown kinds', async () => {
    const { session } = newSession(createMemoryFileSystem());
    await session.newProject();
    session.addNamespace('demo');
    expect(() => session.addElement({ id: 'demo:x', kind: 'demo:nope' })).toThrow(/Unknown/);
  });
});

describe('save guard', () => {
  const problem = (severity: Problem['severity']): Problem => ({
    severity,
    code: 'test',
    message: severity,
  });

  it('blocks only on error-severity problems', () => {
    expect(saveBlockers([problem('warning'), problem('info')])).toEqual([]);
    expect(saveBlockers([problem('warning'), problem('error')])).toEqual([problem('error')]);
  });

  it('refuses to save a project that loaded with errors and keeps the broken file', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs);
    await session.newProject();
    session.addNamespace('demo');
    await session.save();
    await fs.writeFile('content/demo/recipe/broken.json', new TextEncoder().encode('{ nope'));

    const { session: reloaded } = newSession(fs);
    await reloaded.openProject();
    expect(saveBlockers(reloaded.snapshot.problems).length).toBeGreaterThan(0);
    expect(reloaded.saveBlocked).toBe(true);
    reloaded.addElement({ id: 'demo:ok', kind: 'minecraft:recipe' });
    await expect(reloaded.save()).rejects.toBeInstanceOf(SaveBlockedError);
    expect(fs.list()).toContain('content/demo/recipe/broken.json');
    expect(fs.list()).not.toContain('content/demo/recipe/ok.json');
  });
});
