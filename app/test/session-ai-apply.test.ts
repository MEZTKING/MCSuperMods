import { createMemoryFileSystem, type Project } from '@msm/core';
import { placeholderPng } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import { APPLY_CHANGESET_LABEL } from '../src/renderer/src/session/project-session';
import { newSession } from './session-fixture';

async function openDemo() {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  session.addElement({ id: 'demo:greet', kind: 'minecraft:function', data: { lines: ['say hi'] } });
  session.addElement({
    id: 'minecraft:load',
    kind: 'minecraft:tag/function',
    data: { values: ['demo:greet'] },
  });
  await session.schemas();
  await session.flushValidation();
  return { session, fs };
}

const elementIds = (project: Project | null) =>
  (project?.namespaces ?? []).flatMap((namespace) => namespace.elements.map((entry) => entry.id));

describe('ProjectSession.applyChangeset (ADR 0041 D5)', () => {
  it('applies every accepted item as one undo step; undo restores the project and trashes the asset', async () => {
    const { session, fs } = await openDemo();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    const bytes = placeholderPng('gem');
    const [, , rejected] = changeset.add(
      {
        op: 'create',
        elementId: 'ruby:item/ruby',
        kind: 'minecraft:model',
        after: { parent: 'minecraft:item/generated', textures: { layer0: 'ruby:item/ruby' } },
      },
      {
        op: 'update',
        elementId: 'demo:greet',
        kind: 'minecraft:function',
        before: { lines: ['say hi'] },
        after: { lines: ['say hello'] },
      },
      {
        op: 'create',
        elementId: 'demo:rejected',
        kind: 'minecraft:function',
        after: { lines: [] },
      },
      { op: 'asset', asset: { namespace: 'ruby', path: 'textures/item/ruby.png', bytes } },
    );
    changeset.setAccepted(rejected?.itemId ?? '', false);

    const result = await session.applyChangeset(changeset.items);
    expect(result.applied).toHaveLength(3);
    expect(result.skipped).toEqual([]);
    const after = session.snapshot;
    expect(after.undoLabel).toBe(APPLY_CHANGESET_LABEL);
    expect(elementIds(after.project)).toContain('ruby:item/ruby');
    expect(elementIds(after.project)).not.toContain('demo:rejected');
    expect(after.project?.namespaces.find((entry) => entry.name === 'ruby')?.assets).toEqual([
      { mediaType: 'image/png', path: 'textures/item/ruby.png' },
    ]);
    expect(await fs.readFile('assets/ruby/textures/item/ruby.png')).toEqual(bytes);

    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
    expect(session.snapshot.canUndo).toBe(true);
    expect(session.snapshot.undoLabel).not.toBe(APPLY_CHANGESET_LABEL);
    await session.flushAssetFiles();
    expect(await fs.exists('assets/ruby/textures/item/ruby.png')).toBe(false);
    expect(await fs.readFile('.msm/trash/ruby/textures/item/ruby.png')).toEqual(bytes);

    expect(session.redo()).toBe(true);
    await session.flushAssetFiles();
    expect(await fs.readFile('assets/ruby/textures/item/ruby.png')).toEqual(bytes);
  });

  it('skips items that no longer fit the live project and applies the rest', async () => {
    const { session, fs } = await openDemo();
    const changeset = new PendingChangeset();
    const [stale, , duplicate, asset] = changeset.add(
      {
        op: 'update',
        elementId: 'demo:greet',
        kind: 'minecraft:function',
        before: { lines: ['say hi'] },
        after: { lines: ['say proposed'] },
      },
      { op: 'create', elementId: 'demo:fresh', kind: 'minecraft:function', after: { lines: [] } },
      { op: 'create', elementId: 'demo:greet', kind: 'minecraft:function', after: { lines: [] } },
      { op: 'asset', asset: { namespace: 'demo', path: 'textures/item/x.png', bytes: placeholderPng('gem') } },
    );
    // The user edits the element by hand after the proposal, and a file appears at the path.
    session.setElementData('demo:greet', { lines: ['say edited'] });
    await fs.mkdirp('assets/demo/textures/item');
    await fs.writeFile('assets/demo/textures/item/x.png', new Uint8Array([1, 2, 3]));
    const result = await session.applyChangeset(changeset.items, 'Custom label');
    expect(result.skipped).toEqual([stale?.itemId, duplicate?.itemId, asset?.itemId]);
    expect(result.applied).toHaveLength(1);
    expect(session.snapshot.undoLabel).toBe('Custom label');
    expect(elementIds(session.snapshot.project)).toContain('demo:fresh');
    expect(await fs.readFile('assets/demo/textures/item/x.png')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('applies nothing (and adds no undo step) when every item conflicts', async () => {
    const { session } = await openDemo();
    const label = session.snapshot.undoLabel;
    const changeset = new PendingChangeset();
    changeset.add({ op: 'delete', elementId: 'demo:none', kind: 'minecraft:function', before: {} });
    const result = await session.applyChangeset(changeset.items);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(1);
    expect(session.snapshot.undoLabel).toBe(label);
  });

  it('renames with the F2 rename reference updates, then undoes in one step', async () => {
    const { session } = await openDemo();
    const before = session.snapshot.project;
    const changeset = new PendingChangeset();
    changeset.add(
      {
        op: 'rename',
        elementId: 'other:hello',
        kind: 'minecraft:function',
        from: 'demo:greet',
        to: 'other:hello',
        before: { lines: ['say hi'] },
      },
      { op: 'delete', elementId: 'demo:pack', kind: 'minecraft:pack_mcmeta' },
    );
    expect(session.referencesForRename(session.snapshot.project as Project, 'demo:greet')).toHaveLength(1);
    const result = await session.applyChangeset(changeset.items);
    expect(result.skipped).toEqual([]);
    const project = session.snapshot.project as Project;
    expect(elementIds(project)).toContain('other:hello');
    expect(elementIds(project)).not.toContain('demo:greet');
    expect(elementIds(project)).not.toContain('demo:pack');
    const load = project.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((entry) => entry.id === 'minecraft:load');
    expect(load?.data).toEqual({ values: ['other:hello'] });
    session.undo();
    expect(session.snapshot.project).toEqual(before);
  });
});
