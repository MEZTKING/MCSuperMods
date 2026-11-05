import { createMemoryFileSystem, type Json, type Project } from '@msm/core';
import type { ProjectStarter } from '@msm/plugin-api';
import { placeholderPng } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import {
  applyCreatorPlan,
  creatorChanges,
  creatorLabel,
  creatorValues,
  planCreate,
  reopenPlan,
} from '../src/renderer/src/changeset/creator-sets';
import { toValues } from '../src/renderer/src/components/wizard/wizard-model';
import { ASSET_TRASH_DIR, ASSET_UNDO_DIR } from '../src/renderer/src/session/project-session';
import { newSession } from './session-fixture';

const SET_ID = '00000000-0000-4000-8000-000000000045';
const RUBY = 'assets/demo/textures/item/ruby.png';

async function openProject() {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  return { session, fs };
}

const elementIds = (project: Project | null) =>
  (project?.namespaces ?? []).flatMap((namespace) => namespace.elements.map((entry) => entry.id));

const undoFiles = (fs: { list(): string[] }) =>
  fs.list().filter((file) => file.startsWith(`${ASSET_UNDO_DIR}/`));

describe('ProjectSession.applyChangeset asset writes (ADR 0045)', () => {
  it('replaces bytes in the same undo step; undo restores them and redo writes them again', async () => {
    const { session, fs } = await openProject();
    const old = placeholderPng('gem');
    await session.importAssets('demo', [{ name: 'ruby.png', data: old }], 'textures/item');
    const next = placeholderPng('gem', { colour: [32, 80, 224] });
    expect(next).not.toEqual(old);
    const items = new PendingChangeset().add({
      op: 'create',
      elementId: 'demo:greet',
      kind: 'minecraft:function',
      after: { lines: ['say hi'] },
    });

    const result = await session.applyChangeset(items, 'Paint ruby', {
      writes: [
        { namespace: 'demo', path: 'textures/item/ruby.png', bytes: next },
        // A file that did not exist: undo removes it.
        { namespace: 'demo', path: 'textures/item/extra.png', bytes: next },
      ],
    });
    expect(result.written).toEqual(['demo:textures/item/ruby.png', 'demo:textures/item/extra.png']);
    expect(session.snapshot.undoLabel).toBe('Paint ruby');
    expect(await fs.readFile(RUBY)).toEqual(next);
    expect(await fs.readFile('assets/demo/textures/item/extra.png')).toEqual(next);

    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(elementIds(session.snapshot.project)).not.toContain('demo:greet');
    expect(await fs.readFile(RUBY)).toEqual(old);
    expect(await fs.exists('assets/demo/textures/item/extra.png')).toBe(false);
    // The import before it is still its own step.
    expect(session.snapshot.undoLabel).toBe('Add asset demo:textures/item/ruby.png');

    expect(session.redo()).toBe(true);
    await session.flushAssetFiles();
    expect(elementIds(session.snapshot.project)).toContain('demo:greet');
    expect(await fs.readFile(RUBY)).toEqual(next);
    expect(await fs.readFile('assets/demo/textures/item/extra.png')).toEqual(next);
  });

  it('records a write-only change as an undo step and leaves out writes that change nothing', async () => {
    const { session, fs } = await openProject();
    const old = placeholderPng('gem');
    await session.importAssets('demo', [{ name: 'ruby.png', data: old }], 'textures/item');
    const same = await session.applyChangeset([], 'Same bytes', {
      writes: [{ namespace: 'demo', path: 'textures/item/ruby.png', bytes: old }],
    });
    expect(same.written).toEqual([]);
    expect(session.snapshot.undoLabel).toBe('Add asset demo:textures/item/ruby.png');

    const next = placeholderPng('ingot');
    await session.applyChangeset([], 'Only bytes', {
      writes: [{ namespace: 'demo', path: 'textures/item/ruby.png', bytes: next }],
    });
    expect(session.snapshot.undoLabel).toBe('Only bytes');
    expect(await fs.readFile(RUBY)).toEqual(next);
    session.undo();
    await session.flushAssetFiles();
    expect(await fs.readFile(RUBY)).toEqual(old);
  });

  it('refuses an invalid write before applying anything', async () => {
    const { session, fs } = await openProject();
    const items = new PendingChangeset().add({
      op: 'create',
      elementId: 'demo:greet',
      kind: 'minecraft:function',
      after: { lines: ['say hi'] },
    });
    await expect(
      session.applyChangeset(items, 'Bad', {
        writes: [{ namespace: 'demo', path: 'textures/item/bad.png', bytes: new Uint8Array(4) }],
      }),
    ).rejects.toThrow(/bad\.png/);
    expect(elementIds(session.snapshot.project)).not.toContain('demo:greet');
    expect(session.snapshot.canUndo).toBe(false);
    expect(undoFiles(fs)).toEqual([]);
  });

  it('empties the stored bytes when a project is created', async () => {
    const { session, fs } = await openProject();
    await session.importAssets(
      'demo',
      [{ name: 'ruby.png', data: placeholderPng('gem') }],
      'textures/item',
    );
    await session.applyChangeset([], 'Paint', {
      writes: [
        { namespace: 'demo', path: 'textures/item/ruby.png', bytes: placeholderPng('ingot') },
      ],
    });
    expect(undoFiles(fs).length).toBeGreaterThan(0);
    await session.newProject();
    expect(undoFiles(fs)).toEqual([]);
  });

  it('AI helper apply: undo trashes a created texture and redo brings the same bytes back', async () => {
    const { session, fs } = await openProject();
    const bytes = placeholderPng('gem');
    const items = new PendingChangeset().add({
      op: 'asset',
      asset: { namespace: 'demo', path: 'textures/item/ruby.png', bytes },
    });
    const result = await session.applyChangeset(items);
    expect(result.applied).toHaveLength(1);
    expect(await fs.readFile(RUBY)).toEqual(bytes);
    session.undo();
    await session.flushAssetFiles();
    expect(await fs.exists(RUBY)).toBe(false);
    expect(await fs.readFile(`${ASSET_TRASH_DIR}/demo/textures/item/ruby.png`)).toEqual(bytes);
    session.redo();
    await session.flushAssetFiles();
    expect(await fs.readFile(RUBY)).toEqual(bytes);
  });
});

describe('Creator Update undo restores texture bytes (ADR 0043 D4, ADR 0045)', () => {
  it('one Undo restores the elements and the old texture bytes; Redo writes the new ones', async () => {
    const { session, fs } = await openProject();
    const flow = session.library.starters.find(
      (entry) => entry.id === 'gear-set',
    ) as ProjectStarter;
    const project = () => session.snapshot.project as Project;
    const valuesOf = (overrides: Record<string, Json>) => ({
      ...toValues(flow.parameters, {}),
      ...overrides,
    });
    const isKnownKind = (kind: string) => session.registry.get(kind) !== undefined;

    const stored = valuesOf({});
    const bundle = await flow.build({
      namespace: 'demo',
      projectName: project().name,
      target: session.target,
      values: stored,
    });
    const created = planCreate(
      bundle,
      project(),
      { flowId: flow.id, setId: SET_ID, values: creatorValues(stored) },
      isKnownKind,
    );
    await applyCreatorPlan(session, creatorChanges(created), creatorLabel(created, flow.title));
    const helmet = 'assets/demo/textures/item/ruby_helmet.png';
    const boots = 'assets/demo/textures/item/ruby_boots.png';
    const oldHelmet = await fs.readFile(helmet);
    const afterCreate = project();
    const hadBoots = await fs.exists(boots);

    const next = valuesOf({ colour: '#2050e0' });
    const plan = await reopenPlan({
      project: project(),
      flow,
      setId: SET_ID,
      namespace: 'demo',
      storedValues: stored,
      newValues: next,
      target: session.target,
      isKnownKind,
      readAsset: (namespace, path) => session.readAsset(namespace, path).catch(() => null),
    });
    const changes = creatorChanges(plan);
    expect(changes.writes.length).toBeGreaterThan(0);
    const result = await applyCreatorPlan(session, changes, creatorLabel(plan, flow.title));
    expect(result.written).toBe(changes.writes.length);
    expect(session.snapshot.undoLabel).toBe('Update Gear set');
    const newHelmet = await fs.readFile(helmet);
    expect(newHelmet).not.toEqual(oldHelmet);
    const writtenBytes = new Map(
      changes.writes.map((write) => [`assets/${write.namespace}/${write.path}`, write.bytes]),
    );
    for (const [file, bytes] of writtenBytes) expect(await fs.readFile(file)).toEqual(bytes);

    // One Undo: elements and every replaced file back as they were after the Create.
    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(session.snapshot.undoLabel).toBe('Create Gear set');
    expect(project()).toEqual(afterCreate);
    expect(await fs.readFile(helmet)).toEqual(oldHelmet);
    expect(await fs.exists(boots)).toBe(hadBoots);

    // Redo writes the new bytes again.
    expect(session.redo()).toBe(true);
    await session.flushAssetFiles();
    for (const [file, bytes] of writtenBytes) expect(await fs.readFile(file)).toEqual(bytes);

    // Undo twice: back to the empty project, the Create's textures in the trash.
    session.undo();
    session.undo();
    await session.flushAssetFiles();
    expect(await fs.exists(helmet)).toBe(false);
    expect(await fs.readFile(`${ASSET_TRASH_DIR}/demo/textures/item/ruby_helmet.png`)).toEqual(
      oldHelmet,
    );
  });
});
