// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * The Profession Studio (B480, ADR 0098 D2, ADR 0101 D1): the job site with the vanilla
 * workstation note, the five levels' trades through the trade editor (the level tags lowering's
 * default trade sets draw from), and choosing a picture stored elsewhere copying it to the fixed
 * place the game reads (`professionTexturePaths`) in the same undo step.
 */
import {
  type CommandStack,
  commands,
  type Element,
  type Json,
  type ResourceLocation,
} from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { planChangeItems } from '../../../../src/renderer/src/changeset/changeset';
import {
  type BlocksItemsStudioHost,
  BlocksItemsStudioHostContext,
} from '../../../../src/renderer/src/studios/blocks-items/host';
import {
  missingPictureCopies,
  pictureChange,
  professionPictureCopies,
  withPicture,
} from '../../../../src/renderer/src/studios/entities/profession-model';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';
import { LAZY_CHUNK_TIMEOUT_MS, PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { renderOnStack, schemaState } from '../blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
const target = bundle.target;
let schema: SchemaContextState;
beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  // The Studio is a lazy chunk: load it here, not inside the first findBy.
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/entities/ProfessionStudio'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const ID = 'demo:smith' as ResourceLocation;
const profession = (data: Record<string, Json> = {}): Element =>
  element(ID, 'msm:villager_profession', {
    format: 1,
    job_site: 'demo:smith_job_site',
    display_name: 'Smith',
    ...data,
  });
const SITE = element('demo:smith_job_site' as ResourceLocation, 'msm:block', {
  format: 1,
  model: 'minecraft:block/anvil',
});
const PNG = new Uint8Array([137, 80, 78, 71]);

function withHost(subject: Element, assets: string[] = []) {
  let current: CommandStack | undefined;
  const writes: { path: string; bytes: Uint8Array }[] = [];
  const labels: string[] = [];
  const host: BlocksItemsStudioHost = {
    thumbnail: async () => new Uint8Array(),
    revision: 0,
    paintTexture: () => undefined,
    modelPreview: {
      folders: target.folders.resource,
      readProjectAsset: async (_namespace, path) => (assets.includes(path) ? PNG : null),
      vanilla: null,
    },
    applyChanges: async (items, label, assetWrites) => {
      const stack = current as CommandStack;
      const plan = planChangeItems(stack.state, items);
      if (plan.skipped.length > 0) throw new Error('changed');
      labels.push(label);
      for (const write of assetWrites) writes.push({ path: write.path, bytes: write.bytes });
      stack.execute({
        id: 'test.apply',
        label,
        apply(draft) {
          for (const part of plan.commands) part.apply(draft);
        },
      });
    },
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BlocksItemsStudioHostContext.Provider value={host}>
      {children}
    </BlocksItemsStudioHostContext.Provider>
  );
  const rendered = renderOnStack(subject, schema, { wrapper, others: [SITE] });
  current = rendered.stack;
  // The project's own pictures, as recorded assets.
  for (const path of assets) {
    rendered.stack.execute(commands.addAsset('demo', { path, mediaType: 'image/png' }));
  }
  return { ...rendered, writes, labels };
}

const commitId = (testId: string, value: string) => {
  const input = screen.getByTestId(testId);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

describe('profession pictures', () => {
  it('copies pictures stored elsewhere to the fixed places, the zombie taking the villager’s', () => {
    const data = withPicture(profession().data, 'villager', 'demo:art/smith');
    const copies = professionPictureCopies(target, { ...profession(), data });
    expect(copies).toEqual([
      {
        from: { namespace: 'demo', path: 'textures/art/smith.png' },
        to: { namespace: 'demo', path: 'textures/entity/villager/profession/smith.png' },
      },
      {
        from: { namespace: 'demo', path: 'textures/art/smith.png' },
        to: { namespace: 'demo', path: 'textures/entity/zombie_villager/profession/smith.png' },
      },
    ]);
    // A picture already in place, and a vanilla one, need no copy.
    const inPlace = withPicture(
      withPicture(data, 'villager', 'demo:entity/villager/profession/smith'),
      'zombie_villager',
      'minecraft:entity/zombie_villager/profession/mason',
    );
    expect(professionPictureCopies(target, { ...profession(), data: inPlace })).toEqual([]);
    expect(withPicture(inPlace, 'villager', '')).not.toHaveProperty('textures.villager');
    const change = pictureChange(
      { formatVersion: 1, name: 'x', targets: [], plugins: [], settings: {}, namespaces: [] },
      profession(),
      data,
      copies.map((copy) => ({ copy, bytes: PNG })),
    );
    expect(change.items.map((item) => item.op)).toEqual(['update', 'asset', 'asset']);
  });

  it('copies a picked picture in one undo step and offers the copy for older pictures', async () => {
    const { stack, writes, labels, data } = withHost(profession(), ['textures/art/smith.png']);
    await screen.findByTestId('profession-studio', {}, { timeout: LAZY_CHUNK_TIMEOUT_MS });
    commitId('profession-picture-villager', 'demo:art/smith');
    await waitFor(() => expect(labels).toEqual(['Profession picture']));
    expect((data() as { textures?: Json }).textures).toEqual({ villager: 'demo:art/smith' });
    const assets = stack.state.namespaces[0]?.assets.map((asset) => asset.path) ?? [];
    expect(assets).toContain('textures/entity/villager/profession/smith.png');
    expect(assets).toContain('textures/entity/zombie_villager/profession/smith.png');
    expect(writes).toEqual([]);
    stack.undo();
    expect((data() as { textures?: Json }).textures).toBeUndefined();
    expect(
      missingPictureCopies(stack.state, target, {
        ...profession(),
        data: withPicture(profession().data, 'villager', 'demo:art/smith'),
      }),
    ).toHaveLength(2);
  });
});

describe('Profession Studio', () => {
  it('notes a vanilla workstation as the job site', async () => {
    withHost(profession({ job_site: 'minecraft:blast_furnace' }));
    expect(await screen.findByTestId('profession-job-site-taken')).toBeTruthy();
  });

  it("adds a trade to a level's tag", async () => {
    const { stack } = withHost(profession());
    fireEvent.click(await screen.findByTestId('profession-level-2'));
    commitId('trade-product-item', 'minecraft:iron_ingot');
    fireEvent.change(screen.getByTestId('trade-price-count'), { target: { value: '4' } });
    fireEvent.click(screen.getByTestId('trade-add'));
    const tag = () =>
      stack.state.namespaces[0]?.elements.find((entry) => entry.id === 'demo:smith/level_2');
    await waitFor(() => expect(tag()?.kind).toBe('minecraft:tag/villager_trade'));
    expect(tag()?.data).toEqual({ values: ['demo:smith/level_2/emerald_iron_ingot'] });
    const trade = stack.state.namespaces[0]?.elements.find(
      (entry) => entry.id === 'demo:smith/level_2/emerald_iron_ingot',
    );
    expect(trade?.data).toMatchObject({
      wants: { id: 'minecraft:emerald', count: 4 },
      gives: { id: 'minecraft:iron_ingot', count: 1 },
      max_uses: 12,
      xp: 2,
    });
  });

  it('edits named trade sets, and goes back to its own', async () => {
    const { data } = withHost(
      profession({
        trade_sets: [
          'minecraft:mason/level_1',
          'minecraft:mason/level_2',
          'minecraft:mason/level_3',
          'minecraft:mason/level_4',
          'minecraft:mason/level_5',
        ],
      }),
    );
    expect(await screen.findByTestId('profession-named-sets')).toBeTruthy();
    commitId('profession-trade-set-2', 'minecraft:toolsmith/level_2');
    expect((data() as { trade_sets: string[] }).trade_sets[1]).toBe('minecraft:toolsmith/level_2');
    fireEvent.click(screen.getByTestId('profession-own-trades'));
    expect(data()).not.toHaveProperty('trade_sets');
    expect(screen.getByTestId('profession-level-1')).toBeTruthy();
  });
});
