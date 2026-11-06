/**
 * Scenario tests of the Creator (ADR 0043, ADR 0044; briefs B185 and B191) through the real
 * session, the library's flows and `changeset/creator-sets.ts`, as the Creator dialog drives
 * them:
 *
 * - a Gear set with defaults applies as one undo step ("Create Gear set") and the project
 *   exports the resource pack, the data pack and the Fabric content jar (stub runtime) with no
 *   blocking problems;
 * - reopening the set with another colour replaces the untouched pieces (and their texture
 *   bytes) and keeps a piece edited by hand; one Undo restores the records and the bytes;
 * - the AI helper's `add_starter('gear-set', …)` produces items with `meta.creator` that reopen
 *   in the Creator;
 * - each 0.8.0 flow (Weapon as spear and bow, Consumable as drink and charm, Totem,
 *   Enchantment, Painting with a picked PNG, Music disc) creates in a blank project and exports
 *   with no blocking problems.
 */

import { createMemoryFileSystem, type Element, type Json, type Project } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import type { ProjectStarter } from '@msm/plugin-api';
import { paintingPng } from '@msm/plugin-library';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createToolExecutor, type DecisionHost } from '../src/renderer/src/ai/tool-executor';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import {
  applyCreatorPlan,
  type CreatorPlan,
  creatorChanges,
  creatorLabel,
  creatorSetElements,
  creatorValues,
  planCreate,
  reopenPlan,
} from '../src/renderer/src/changeset/creator-sets';
import { pngDataUrl, toValues } from '../src/renderer/src/components/wizard/wizard-model';
import type { ProjectSession } from '../src/renderer/src/session/project-session';
import { newSession } from './session-fixture';

const NAMESPACE = 'demo';
const SET_ID = '00000000-0000-4000-8000-0000000000b5';
const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);
const geckolibBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 9, 9, 9]);

async function openSession() {
  const fs = createMemoryFileSystem();
  const { session, platform, calls } = newSession(fs);
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => runtimeBytes,
    geckolibJar: async () => geckolibBytes,
  };
  await session.newProject();
  await session.schemas();
  await session.flushValidation();
  return { session, calls, fs };
}

function flowOf(session: ProjectSession, id: string): ProjectStarter {
  const flow = session.library.starters.find((entry) => entry.id === id);
  if (flow?.creator === undefined) throw new Error(`${id} is not a Creator flow.`);
  return flow;
}

/** The flow's default values with `overrides`, as the dialog converts them. */
function valuesOf(
  flow: ProjectStarter,
  overrides: Record<string, Json> = {},
): Record<string, Json> {
  return { ...(toValues(flow.parameters, {}) as Record<string, Json>), ...overrides };
}

const project = (session: ProjectSession) => session.snapshot.project as Project;

function elementOf(session: ProjectSession, id: string): Element | undefined {
  return project(session)
    .namespaces.flatMap((namespace) => namespace.elements)
    .find((entry) => entry.id === id);
}

const isKnownKind = (session: ProjectSession) => (kind: string) =>
  session.registry.get(kind) !== undefined;

/** Builds and applies a Create, as the dialog's "Create" button does. */
async function create(session: ProjectSession, flow: ProjectStarter, values: Record<string, Json>) {
  const bundle = await flow.build({
    namespace: NAMESPACE,
    projectName: project(session).name,
    target: session.target,
    values,
  });
  const plan = planCreate(
    bundle,
    project(session),
    { flowId: flow.id, setId: SET_ID, values: creatorValues(values) },
    isKnownKind(session),
  );
  const label = creatorLabel(plan, flow.title);
  const result = await applyCreatorPlan(session, creatorChanges(plan), label);
  return { bundle, plan, label, result };
}

/** Plans an "Edit in Creator" of a set from an element's stored `meta.creator`. */
function reopen(
  session: ProjectSession,
  flow: ProjectStarter,
  elementId: string,
  overrides: Record<string, Json>,
): Promise<CreatorPlan> {
  const meta = elementOf(session, elementId)?.meta.creator;
  if (meta === undefined) throw new Error(`${elementId} has no meta.creator.`);
  // The stored values over the flow's defaults (the dialog reads them the same way).
  const stored = valuesOf(flow, meta.values as Record<string, Json>);
  return reopenPlan({
    project: project(session),
    flow,
    setId: meta.setId,
    namespace: NAMESPACE,
    storedValues: stored,
    newValues: { ...stored, ...overrides },
    target: session.target,
    isKnownKind: isKnownKind(session),
    readAsset: (namespace, path) => session.readAsset(namespace, path).catch(() => null),
  });
}

const statusOf = (plan: CreatorPlan, key: string) =>
  plan.entries.find((entry) => entry.key === key)?.status;

async function errorsAfterValidation(session: ProjectSession): Promise<string[]> {
  await session.flushValidation();
  return session.snapshot.problems
    .filter((problem) => problem.severity === 'error')
    .map((problem) => `${problem.elementId ?? ''}: ${problem.code} ${problem.message}`);
}

const errorsOf = (result: { problems: readonly { severity: string; message: string }[] }) =>
  result.problems.filter((problem) => problem.severity === 'error').map((p) => p.message);

const GEAR_PIECES = [
  'sword',
  'pickaxe',
  'axe',
  'shovel',
  'hoe',
  'helmet',
  'chestplate',
  'leggings',
  'boots',
];

describe('Creator scenario: Gear set', () => {
  it('creates a default Gear set as one undo step and exports packs and the content jar', async () => {
    const { session, calls } = await openSession();
    const before = session.snapshot.project;
    const flow = flowOf(session, 'gear-set');
    const { label, result } = await create(session, flow, valuesOf(flow));
    expect(label).toBe('Create Gear set');
    expect(result.skipped).toBe(0);
    expect(session.snapshot.undoLabel).toBe('Create Gear set');
    for (const piece of GEAR_PIECES) {
      expect(elementOf(session, `${NAMESPACE}:ruby_${piece}`)?.meta.creator).toMatchObject({
        flowId: 'gear-set',
        setId: SET_ID,
        generatedId: `${NAMESPACE}:ruby_${piece}`,
      });
    }
    expect(elementOf(session, `${NAMESPACE}:ruby_armor`)?.kind).toBe('minecraft:equipment');
    expect(await errorsAfterValidation(session)).toEqual([]);

    const resource = await session.exportPack('resource', 'zip');
    expect(errorsOf(resource)).toEqual([]);
    const data = await session.exportPack('data', 'zip');
    expect(errorsOf(data)).toEqual([]);
    const jar = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: false });
    expect(errorsOf(jar)).toEqual([]);
    expect(calls.saved).toHaveLength(3);
    const [resourceZip, dataZip, modJar] = calls.saved.map((saved) => unzipSync(saved.data));
    expect(Object.keys(resourceZip ?? {})).toEqual(
      expect.arrayContaining([
        `assets/${NAMESPACE}/equipment/ruby_armor.json`,
        `assets/${NAMESPACE}/textures/entity/equipment/humanoid/ruby.png`,
        `assets/${NAMESPACE}/textures/entity/equipment/humanoid_leggings/ruby.png`,
        `assets/${NAMESPACE}/models/item/ruby_helmet.json`,
        `assets/${NAMESPACE}/textures/item/ruby_sword.png`,
      ]),
    );
    expect(Object.keys(dataZip ?? {})).toEqual(
      expect.arrayContaining([
        `data/${NAMESPACE}/recipe/ruby_sword_from_ruby.json`,
        'data/minecraft/tags/item/swords.json',
        'data/minecraft/tags/item/head_armor.json',
      ]),
    );
    expect(Object.keys(modJar ?? {})).toEqual(
      expect.arrayContaining([
        'fabric.mod.json',
        `msm/${NAMESPACE}/item/ruby_helmet.json`,
        `msm/${NAMESPACE}/item/ruby_sword.json`,
        `assets/${NAMESPACE}/equipment/ruby_armor.json`,
      ]),
    );

    expect(session.undo()).toBe(true);
    expect(session.snapshot.project).toEqual(before);
  });

  it('reopens with another colour: replaces untouched pieces, keeps an edited one, one Undo restores', async () => {
    const { session, fs } = await openSession();
    const flow = flowOf(session, 'gear-set');
    await create(session, flow, valuesOf(flow, { material_name: 'Sapphire' }));
    const swordId = `${NAMESPACE}:sapphire_sword`;
    const helmetId = `${NAMESPACE}:sapphire_helmet`;
    const helmetPath = `assets/${NAMESPACE}/textures/item/sapphire_helmet.png`;
    const layerPath = `assets/${NAMESPACE}/textures/entity/equipment/humanoid/sapphire.png`;

    // Edit the sword by hand, as through Raw JSON.
    const sword = elementOf(session, swordId) as Element;
    const edited = structuredClone(sword.data) as { components: Record<string, Json> };
    (edited.components['msm:tool'] as Record<string, Json>).attack_damage = 9;
    session.setElementData(swordId, edited as unknown as Json);
    const helmetBefore = await fs.readFile(helmetPath);
    const layerBefore = await fs.readFile(layerPath);
    const recordsBefore = structuredClone(project(session));

    // "Edit in Creator" on the helmet; change the colour.
    const plan = await reopen(session, flow, helmetId, { colour: '#2050e0' });
    expect(plan.mode).toBe('update');
    expect(statusOf(plan, swordId)).toBe('keep');
    expect(statusOf(plan, `${NAMESPACE}:textures/item/sapphire_helmet.png`)).toBe('replace');
    expect(statusOf(plan, `${NAMESPACE}:textures/entity/equipment/humanoid/sapphire.png`)).toBe(
      'replace',
    );
    expect(statusOf(plan, helmetId)).toBe('unchanged');

    const label = creatorLabel(plan, flow.title);
    expect(label).toBe('Update Gear set');
    await applyCreatorPlan(session, creatorChanges(plan), label);
    expect(session.snapshot.undoLabel).toBe('Update Gear set');
    // The sword keeps 9, the helmet and armour layer textures changed.
    expect(elementOf(session, swordId)?.data).toEqual(edited);
    expect(elementOf(session, swordId)?.meta.creator?.values.colour).not.toBe('#2050e0');
    expect(elementOf(session, helmetId)?.meta.creator?.values.colour).toBe('#2050e0');
    expect(await fs.readFile(helmetPath)).not.toEqual(helmetBefore);
    expect(await fs.readFile(layerPath)).not.toEqual(layerBefore);
    expect(await errorsAfterValidation(session)).toEqual([]);

    // One Undo restores the element records and the replaced texture bytes (ADR 0045).
    expect(session.undo()).toBe(true);
    await session.flushAssetFiles();
    expect(project(session)).toEqual(recordsBefore);
    expect(await fs.readFile(helmetPath)).toEqual(helmetBefore);
    expect(await fs.readFile(layerPath)).toEqual(layerBefore);
  });

  it("the AI helper's add_starter('gear-set') items carry meta.creator and reopen in the Creator", async () => {
    const { session } = await openSession();
    const changeset = new PendingChangeset();
    const decisions: DecisionHost = {
      proposePlan: async (plan) => ({ decision: 'build_all', items: plan.items, comments: '' }),
      checkpoint: async () => 'continue',
    };
    const execute = createToolExecutor(session, changeset, decisions);
    const answer = await execute(
      {
        requestId: 'r1',
        toolUseId: 'toolu_1',
        name: 'add_starter',
        input: {
          starterId: 'gear-set',
          namespace: NAMESPACE,
          values: { material_name: 'Topaz', colour: '#e0a020' },
        },
      },
      new AbortController().signal,
    );
    expect(answer.isError, answer.content).toBe(false);
    await session.applyChangeset(changeset.items);
    expect(await errorsAfterValidation(session)).toEqual([]);

    const helmet = elementOf(session, `${NAMESPACE}:topaz_helmet`);
    const meta = helmet?.meta.creator;
    expect(meta).toMatchObject({ flowId: 'gear-set', generatedId: `${NAMESPACE}:topaz_helmet` });
    expect(meta?.values.material_name).toBe('Topaz');
    const set = creatorSetElements(project(session), 'gear-set', meta?.setId ?? '');
    expect(set.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(GEAR_PIECES.map((piece) => `${NAMESPACE}:topaz_${piece}`)),
    );

    // Reopened with the same values nothing changes; another colour replaces the textures.
    const same = await reopen(
      session,
      flowOf(session, 'gear-set'),
      `${NAMESPACE}:topaz_helmet`,
      {},
    );
    expect(same.mode).toBe('update');
    // Every piece is untouched and unchanged (its change only re-stamps the stored values);
    // the project's own pack.mcmeta stays a conflict, as at Create.
    expect(
      same.entries
        .filter((entry) => entry.status !== 'unchanged')
        .map((entry) => `${entry.key} ${entry.status}`),
    ).toEqual([`${NAMESPACE}:pack conflict`]);
    expect(creatorChanges(same).writes).toEqual([]);
    const recoloured = await reopen(
      session,
      flowOf(session, 'gear-set'),
      `${NAMESPACE}:topaz_helmet`,
      { colour: '#20e0a0' },
    );
    expect(statusOf(recoloured, `${NAMESPACE}:topaz_helmet`)).toBe('unchanged');
    expect(statusOf(recoloured, `${NAMESPACE}:textures/item/topaz_helmet.png`)).toBe('replace');
    expect(recoloured.entries.some((entry) => entry.status === 'keep')).toBe(false);
  });
});

/** The 0.8.0 flows (ADR 0044), each created in a blank project and exported. */
const FLOWS_080: {
  flowId: string;
  title: string;
  overrides: () => Record<string, Json>;
  /** Element ids the Create must add. */
  creates: string[];
  /** Files the resource pack, data pack or jar must hold. */
  files: string[];
}[] = [
  {
    flowId: 'weapon',
    title: 'spear',
    overrides: () => ({}),
    creates: ['demo:ruby_spear', 'demo:item/ruby_spear'],
    files: ['msm/demo/item/ruby_spear.json', 'assets/demo/models/item/ruby_spear.json'],
  },
  {
    flowId: 'weapon',
    title: 'bow',
    overrides: () => ({ weapon_name: 'Ruby Bow', weapon_type: 'bow' }),
    creates: ['demo:ruby_bow'],
    files: ['msm/demo/item/ruby_bow.json'],
  },
  {
    flowId: 'consumable',
    title: 'drink',
    overrides: () => ({}),
    creates: ['demo:ruby_tonic'],
    files: ['msm/demo/item/ruby_tonic.json', 'assets/demo/textures/item/ruby_tonic.png'],
  },
  {
    flowId: 'consumable',
    title: 'charm',
    overrides: () => ({ consumable_name: 'Ruby Charm', kind: 'charm', cooldown_seconds: 5 }),
    creates: ['demo:ruby_charm'],
    files: ['msm/demo/item/ruby_charm.json'],
  },
  {
    flowId: 'totem',
    title: 'totem',
    overrides: () => ({}),
    creates: ['demo:ruby_totem'],
    files: ['msm/demo/item/ruby_totem.json'],
  },
  {
    flowId: 'enchantment',
    title: 'enchantment',
    overrides: () => ({}),
    creates: ['demo:ruby_edge'],
    files: ['data/demo/enchantment/ruby_edge.json'],
  },
  {
    flowId: 'painting',
    title: 'painting with a picked PNG',
    overrides: () => ({ image: pngDataUrl(paintingPng(2, 1, [200, 60, 40])) }),
    creates: ['demo:ruby_sunset', 'minecraft:placeable'],
    files: [
      'data/demo/painting_variant/ruby_sunset.json',
      'assets/demo/textures/painting/ruby_sunset.png',
    ],
  },
  {
    flowId: 'music-disc-item',
    title: 'music disc',
    overrides: () => ({}),
    creates: ['demo:ruby_waltz', 'demo:ruby_waltz_disc'],
    files: ['msm/demo/item/ruby_waltz_disc.json', 'data/demo/jukebox_song/ruby_waltz.json'],
  },
];

describe('Creator scenario: 0.8.0 flows', () => {
  for (const entry of FLOWS_080) {
    it(`${entry.flowId} (${entry.title}): Create in one undo step, export with no errors`, async () => {
      const { session, calls } = await openSession();
      const before = session.snapshot.project;
      const flow = flowOf(session, entry.flowId);
      const values = valuesOf(flow, entry.overrides());
      const { bundle, label } = await create(session, flow, values);
      expect(session.snapshot.undoLabel).toBe(label);
      expect(label).toBe(`Create ${flow.title}`);
      for (const id of entry.creates) {
        expect(elementOf(session, id), id).toBeDefined();
      }
      expect(elementOf(session, entry.creates[0] ?? '')?.meta.creator?.flowId).toBe(entry.flowId);
      expect(await errorsAfterValidation(session)).toEqual([]);

      const resource = await session.exportPack('resource', 'zip');
      expect(errorsOf(resource)).toEqual([]);
      const data = await session.exportPack('data', 'zip');
      expect(errorsOf(data)).toEqual([]);
      const hasMod = bundle.elements.some((element) => element.kind.startsWith('msm:'));
      if (hasMod) {
        const jar = await session.exportFabricJar({ [SEPARATE_RUNTIME_OPTION]: false });
        expect(errorsOf(jar)).toEqual([]);
      }
      const names = calls.saved.flatMap((saved) => Object.keys(unzipSync(saved.data)));
      expect(names).toEqual(expect.arrayContaining(entry.files));

      if (entry.flowId === 'painting') {
        // The picked picture is written unchanged.
        const picture = calls.saved
          .map((saved) => unzipSync(saved.data))
          .find((zip) => zip['assets/demo/textures/painting/ruby_sunset.png'] !== undefined);
        expect(picture?.['assets/demo/textures/painting/ruby_sunset.png']).toEqual(
          paintingPng(2, 1, [200, 60, 40]),
        );
      }

      expect(session.undo()).toBe(true);
      expect(session.snapshot.project).toEqual(before);
    });
  }
});
