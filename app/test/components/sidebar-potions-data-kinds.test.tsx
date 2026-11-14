// @vitest-environment happy-dom
/**
 * Sidebar headings of the potion kind (ADR 0063) and the data kinds of the sweep (ADR 0064):
 * every new kind of the built-in plugins has a friendly group label.
 */
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import datapackPlugin from '@msm/plugin-datapack';
import resourcepackPlugin from '@msm/plugin-resourcepack';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElementSidebar, GROUP_LABELS } from '../../src/renderer/src/components/ElementSidebar';
import { element, sampleProject } from './fixtures';

afterEach(cleanup);

const NEW_KINDS = [
  'msm:potion',
  'minecraft:wolf_variant',
  'minecraft:cat_variant',
  'minecraft:pig_variant',
  'minecraft:cow_variant',
  'minecraft:chicken_variant',
  'minecraft:frog_variant',
  'minecraft:zombie_nautilus_variant',
  'minecraft:cat_sound_variant',
  'minecraft:pig_sound_variant',
  'minecraft:cow_sound_variant',
  'minecraft:chicken_sound_variant',
  'minecraft:instrument',
  'minecraft:enchantment_provider',
  'minecraft:timeline',
  'minecraft:world_clock',
  'minecraft:atlas',
  'minecraft:font',
];

describe('ElementSidebar labels for potions and the data kinds sweep', () => {
  it('labels every new kind, and each is a registered built-in kind', () => {
    const registered = new Set(
      [blocksItemsPlugin, datapackPlugin, resourcepackPlugin].flatMap((plugin) =>
        (plugin.contributes.elementKinds ?? []).map((kind) => kind.id),
      ),
    );
    for (const kind of NEW_KINDS) {
      expect(registered.has(kind), kind).toBe(true);
      expect(GROUP_LABELS[kind], kind).toBeTruthy();
    }
  });

  it('groups msm:potion elements under Potions', () => {
    const project = sampleProject();
    const demo = project.namespaces[0];
    if (demo === undefined) throw new Error('no namespace');
    demo.elements.push(element('demo:frost_potion', 'msm:potion'));
    demo.elements.push(element('demo:snowy', 'minecraft:wolf_variant'));
    render(
      <ElementSidebar project={project} selectedId={null} onSelect={vi.fn()} onRemove={vi.fn()} />,
    );
    const region = screen.getByRole('region', { name: 'Namespace demo' });
    const potions = within(region).getByRole('region', { name: 'demo msm:potion' });
    expect(within(potions).getByRole('heading', { level: 3 }).textContent).toContain('Potions');
    const wolves = within(region).getByRole('region', { name: 'demo minecraft:wolf_variant' });
    expect(within(wolves).getByRole('heading', { level: 3 }).textContent).toContain('Wolf skins');
  });
});
