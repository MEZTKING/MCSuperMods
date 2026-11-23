// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * B627's villager looks in the Studios' Pictures (the plan's "Where" column: the Villager look and
 * Profession Studio pictures): each loaded lazily and following an edit made in the Studio on a
 * `CommandStack` at once.
 */

import { createElement, type Element, type Json, type ResourceLocation } from '@msm/core';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { schemaIndex } from '../../forms/schemas';
import { PRELOAD_TIMEOUT_MS, preloadChunks } from '../../lazy-chunks';
import { renderOnStack, schemaState } from '../../studios/blocks-items/harness';

const bundle = builtInTargets[0] as (typeof builtInTargets)[number];
let schema: SchemaContextState;

beforeAll(async () => {
  schema = schemaState(bundle, await schemaIndex());
  await preloadChunks(
    () => import('../../../../src/renderer/src/studios/entities/VillagerTypeStudio'),
    () => import('../../../../src/renderer/src/studios/entities/ProfessionStudio'),
    () => import('../../../../src/renderer/src/liveviews/looks/villager/VillagerTypeView'),
    () => import('../../../../src/renderer/src/liveviews/looks/villager/ProfessionLook'),
  );
}, PRELOAD_TIMEOUT_MS);
afterEach(cleanup);

const el = (id: string, kind: string, data: Json): Element =>
  createElement({ id: id as ResourceLocation, kind, data });

describe('the Villager look Studio’s Pictures', () => {
  it('dresses the villager in the look and follows a new picture at once', async () => {
    const look = el('demo:blossom', 'msm:villager_type', { format: 1, biomes: [] });
    renderOnStack(look, schema);
    const words = await screen.findByTestId('villager-type-look-words', {}, { timeout: 10_000 });
    expect(words.textContent).toContain('no picture yet');
    const field = await screen.findByTestId('villager-type-picture-villager');
    fireEvent.change(field, { target: { value: 'demo:entity/villager/type/blossom' } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(screen.getByTestId('villager-type-look-body').getAttribute('data-paths')).toContain(
        'assets/demo/textures/entity/villager/type/blossom.png',
      ),
    );
    expect(screen.getByTestId('villager-type-look-words').textContent).toBe(
      'Blossom: the look’s clothes on a villager.',
    );
  });
});

describe('the Profession Studio’s Pictures', () => {
  it('dresses the villager in the job’s clothes and follows its name and level', async () => {
    const job = el('demo:tinker', 'msm:villager_profession', {
      format: 1,
      display_name: 'Tinker',
      textures: { villager: 'demo:entity/villager/profession/tinker' },
    });
    renderOnStack(job, schema);
    const words = await screen.findByTestId('profession-look-words', {}, { timeout: 10_000 });
    expect(words.textContent).toContain('Tinker: the job’s clothes at Novice level');
    fireEvent.click(screen.getByTestId('profession-look-level-3'));
    await waitFor(() =>
      expect(screen.getByTestId('profession-look-body').getAttribute('data-paths')).toContain(
        'profession_level/gold.png',
      ),
    );
    const name = screen.getByTestId('profession-name');
    fireEvent.change(name, { target: { value: 'Smith' } });
    fireEvent.blur(name);
    await waitFor(() =>
      expect(screen.getByTestId('profession-look-words').textContent).toContain('Smith:'),
    );
  });
});
