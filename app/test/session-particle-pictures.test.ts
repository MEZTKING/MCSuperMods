/**
 * The session side of the Particle Studio's pictures (B353, ADR 0081 D1): a project frame
 * without its picture is reported as `blocks-items.particle-texture-missing` (vanilla sprites
 * never are), and "Split a strip into frames" (new frame pictures, rewritten ones and the
 * particle's `textures`) is one undo step that Undo takes back with the old bytes.
 */
import { createMemoryFileSystem, type ResourceLocation } from '@msm/core';
import { placeholderPng } from '@msm/plugin-library';
import { describe, expect, it } from 'vitest';
import { newSession } from './session-fixture';

const ID = 'demo:spark' as ResourceLocation;
const MISSING = 'blocks-items.particle-texture-missing';

async function openProject() {
  const fs = createMemoryFileSystem();
  const { session } = newSession(fs);
  await session.newProject();
  return { session, fs };
}

const missing = (session: Awaited<ReturnType<typeof openProject>>['session']) =>
  session.snapshot.problems.filter((problem) => problem.code === MISSING);

const particleData = (session: Awaited<ReturnType<typeof openProject>>['session']) =>
  session.snapshot.project?.namespaces
    .flatMap((namespace) => namespace.elements)
    .find((element) => element.id === ID)?.data;

describe('particle pictures in the session', () => {
  it('warns about project frames without a picture until the picture is added', async () => {
    const { session } = await openProject();
    session.addElement({
      id: ID,
      kind: 'msm:particle',
      data: { format: 1, textures: ['demo:spark_0', 'minecraft:glow'] },
    });
    expect(missing(session)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        elementId: ID,
        path: '/textures/0',
      }),
    ]);
    await session.importAssets(
      'demo',
      [{ name: 'spark_0.png', data: placeholderPng('gem') }],
      'textures/particle',
    );
    expect(missing(session)).toEqual([]);
  });

  it('applies a split as one undo step and Undo restores the frames and bytes', async () => {
    const { session, fs } = await openProject();
    const old = placeholderPng('gem');
    await session.importAssets('demo', [{ name: 'spark_0.png', data: old }], 'textures/particle');
    session.addElement({
      id: ID,
      kind: 'msm:particle',
      data: { format: 1, textures: ['demo:spark_0'] },
    });
    const first = placeholderPng('gem', { colour: [200, 40, 40] });
    const second = placeholderPng('gem', { colour: [40, 200, 40] });
    const before = particleData(session) ?? null;
    await session.applyChangeset(
      [
        {
          itemId: 'frames',
          op: 'update',
          elementId: ID,
          kind: 'msm:particle',
          before,
          after: { format: 1, textures: ['demo:spark_0', 'demo:spark_1'] },
          accepted: true,
          problems: [],
        },
        {
          itemId: 'frame-1',
          op: 'asset',
          asset: { namespace: 'demo', path: 'textures/particle/spark_1.png', bytes: second },
          accepted: true,
          problems: [],
        },
      ],
      'Split strip.png into frames',
      { writes: [{ namespace: 'demo', path: 'textures/particle/spark_0.png', bytes: first }] },
    );
    expect(session.snapshot.undoLabel).toBe('Split strip.png into frames');
    expect(particleData(session)).toEqual({
      format: 1,
      textures: ['demo:spark_0', 'demo:spark_1'],
    });
    expect(await fs.readFile('assets/demo/textures/particle/spark_0.png')).toEqual(first);
    expect(await fs.readFile('assets/demo/textures/particle/spark_1.png')).toEqual(second);
    expect(missing(session)).toEqual([]);

    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(particleData(session)).toEqual({ format: 1, textures: ['demo:spark_0'] });
    expect(await fs.readFile('assets/demo/textures/particle/spark_0.png')).toEqual(old);
    expect(await fs.exists('assets/demo/textures/particle/spark_1.png')).toBe(false);
  });
});
