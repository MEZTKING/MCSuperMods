// @vitest-environment happy-dom
/**
 * The ThingPicker (B372, ADR 0082 D7): its sources (the project's things first, then the game's
 * by category, pictures from project thumbnails or the extracted client jar), search, keyboard
 * (arrows, Enter, Esc, type to search) and the generic icon without pictures.
 */
import type { Project } from '@msm/core';
import { createRegistryIndex } from '@msm/schemas';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  filterThings,
  ThingPicker,
  type ThingPictures,
  TILES_PER_SECTION,
  thingName,
  thingSections,
  thingWords,
  vanillaPicturePaths,
} from '../../src/renderer/src/components/thing-picker/ThingPicker';
import { element } from './fixtures';

afterEach(cleanup);

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function project(): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [
      {
        name: 'demo',
        elements: [
          element('demo:ruby', 'msm:item', { display_name: 'Ruby', model: 'demo:item/ruby' }),
          element('demo:item/ruby', 'minecraft:model', {
            parent: 'minecraft:item/generated',
            textures: { layer0: 'demo:item/ruby' },
          }),
          element('demo:ruby_block', 'msm:block', { display_name: 'Ruby Block' }),
          element('demo:goblin', 'msm:entity', { display_name: 'Goblin' }),
        ],
        assets: [
          { path: 'textures/item/ruby.png', mediaType: 'image/png' },
          { path: 'textures/block/ruby_block.png', mediaType: 'image/png' },
        ],
      },
    ],
  };
}

const registries = createRegistryIndex({
  vanilla: {
    item: ['stone', 'diamond_sword', 'apple', 'zombie_spawn_egg'],
    block: ['stone', 'dirt'],
    entity_type: ['zombie', 'pig'],
    sound_event: ['block.note_block.chime'],
    dimension_type: ['overworld', 'the_nether'],
  },
  project: {
    item: ['demo:ruby', 'demo:ruby_block'],
    block: ['demo:ruby_block'],
    entity_type: ['demo:goblin'],
  },
});

const input = { project: project(), registries, texturesFolder: 'textures' } as const;

describe('thing sources', () => {
  it('lists your things first, then the game things by category', () => {
    const sections = thingSections({ ...input, sort: 'item' });
    expect(sections.map((section) => section.label)).toEqual([
      'Your things',
      'Minecraft blocks',
      'Minecraft items',
      'Spawn eggs',
    ]);
    expect(sections[0]?.things.map((thing) => [thing.id, thing.name])).toEqual([
      ['demo:ruby', 'Ruby'],
      ['demo:ruby_block', 'Ruby Block'],
    ]);
    expect(sections[0]?.things[0]?.picture).toEqual({
      from: 'project',
      assetPath: 'assets/demo/textures/item/ruby.png',
    });
    expect(sections[0]?.things[1]?.picture).toEqual({
      from: 'project',
      assetPath: 'assets/demo/textures/block/ruby_block.png',
    });
    expect(sections[1]?.things.map((thing) => thing.id)).toEqual(['minecraft:stone']);
    expect(sections[2]?.things.map((thing) => thing.name)).toEqual(['Apple', 'Diamond sword']);
    expect(sections[2]?.things[0]?.picture).toEqual({
      from: 'vanilla',
      paths: [
        'assets/minecraft/textures/item/apple.png',
        'assets/minecraft/textures/block/apple.png',
      ],
    });
  });

  it('offers only project elements of the given kinds for a definition trigger', () => {
    const sections = thingSections({
      ...input,
      sort: 'block',
      projectOnly: true,
      kinds: ['msm:block'],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.things.map((thing) => thing.id)).toEqual(['demo:ruby_block']);
  });

  it('names mobs, sounds and dimensions in words, with spawn eggs as mob pictures', () => {
    const mobs = thingSections({ ...input, sort: 'mob' });
    expect(mobs.map((section) => section.label)).toEqual(['Your things', 'Minecraft mobs']);
    expect(mobs[1]?.things[1]?.picture).toEqual({
      from: 'vanilla',
      paths: ['assets/minecraft/textures/item/zombie_spawn_egg.png'],
    });
    const sounds = thingSections({ ...input, sort: 'sound' });
    expect(sounds[0]?.things[0]).toMatchObject({ name: 'Note block chime', picture: null });
    const dimensions = thingSections({ ...input, sort: 'dimension' });
    expect(dimensions[0]?.things.map((thing) => thing.name)).toEqual(['Overworld', 'The nether']);
    expect(thingWords('minecraft:block.note_block.chime')).toBe('Chime');
    expect(thingName(project(), 'demo:goblin')).toBe('Goblin');
    expect(thingName(project(), 'minecraft:diamond_sword')).toBe('Diamond sword');
    expect(vanillaPicturePaths('stone', 'block', 'textures')[0]).toBe(
      'assets/minecraft/textures/block/stone.png',
    );
  });

  it('filters by words of the name or the id', () => {
    const sections = thingSections({ ...input, sort: 'item' });
    expect(filterThings(sections, 'dia').flatMap((s) => s.things.map((t) => t.id))).toEqual([
      'minecraft:diamond_sword',
    ]);
    expect(filterThings(sections, 'ruby blo').flatMap((s) => s.things.map((t) => t.id))).toEqual([
      'demo:ruby_block',
    ]);
    expect(filterThings(sections, 'nothing here')).toEqual([]);
    expect(filterThings(sections, '  ')).toHaveLength(sections.length);
  });
});

function renderPicker(options: { pictures?: ThingPictures | null; noneLabel?: string } = {}) {
  const onPick = vi.fn<(id: string | null) => void>();
  const onCancel = vi.fn();
  render(
    <ThingPicker
      title="Pick an item"
      sort="item"
      sections={thingSections({ ...input, sort: 'item' })}
      value="minecraft:apple"
      pictures={options.pictures ?? null}
      noneLabel={options.noneLabel}
      onPick={onPick}
      onCancel={onCancel}
    />,
  );
  return { onPick, onCancel, dialog: screen.getByTestId('thing-picker') };
}

describe('ThingPicker', () => {
  it('shows sections with names, marks the chosen thing and picks on click', () => {
    const { onPick, dialog } = renderPicker();
    expect(within(dialog).getByRole('heading', { name: 'Pick an item' })).toBeTruthy();
    expect(within(dialog).getByRole('region', { name: 'Your things' })).toBeTruthy();
    const apple = within(dialog).getByRole('button', { name: 'Apple' });
    expect(apple.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ruby' }));
    expect(onPick).toHaveBeenCalledWith('demo:ruby');
  });

  it('searches as you type and picks the first match with Enter', () => {
    const { onPick } = renderPicker();
    const search = screen.getByTestId('thing-search');
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: 'sword' } });
    expect(screen.queryByRole('button', { name: 'Ruby' })).toBeNull();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith('minecraft:diamond_sword');
  });

  it('says when nothing matches', () => {
    renderPicker();
    fireEvent.change(screen.getByTestId('thing-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('thing-empty').textContent).toBe('No items match "zzz".');
  });

  it('moves between tiles with the arrow keys, picks with Enter and types to search', () => {
    const { onPick } = renderPicker();
    const search = screen.getByTestId('thing-search');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const first = screen.getByTestId('thing-demo:ruby');
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByTestId('thing-demo:ruby_block');
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('thing-minecraft:zombie_spawn_egg'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(first, { key: 'd' });
    expect(document.activeElement).toBe(search);
    expect((search as HTMLInputElement).value).toBe('d');
    fireEvent.click(screen.getByTestId('thing-minecraft:diamond_sword'));
    expect(onPick).toHaveBeenCalledWith('minecraft:diamond_sword');
  });

  it('closes with Esc', () => {
    const { onCancel } = renderPicker();
    fireEvent.keyDown(screen.getByTestId('thing-search'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('offers "nothing" first when asked', () => {
    const { onPick } = renderPicker({ noneLabel: 'Any item' });
    fireEvent.click(screen.getByRole('button', { name: 'Any item' }));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it('shows generic icons and a note without pictures', () => {
    renderPicker();
    expect(screen.getByTestId('thing-no-vanilla-pictures')).toBeTruthy();
    expect(screen.queryAllByTestId('thing-picture')).toHaveLength(0);
    expect(screen.getAllByTestId('thing-generic').length).toBeGreaterThan(0);
  });

  it('loads project thumbnails and tries vanilla paths in order', async () => {
    const project = vi.fn(async () => PNG);
    const vanilla = vi.fn(async (path: string) => (path.includes('/block/') ? PNG : null));
    renderPicker({ pictures: { project, vanilla } });
    await waitFor(() => expect(screen.getAllByTestId('thing-picture').length).toBeGreaterThan(2));
    expect(project).toHaveBeenCalledWith('assets/demo/textures/item/ruby.png', 32);
    expect(vanilla).toHaveBeenCalledWith('assets/minecraft/textures/item/apple.png');
    expect(vanilla).toHaveBeenCalledWith('assets/minecraft/textures/block/apple.png');
    expect(screen.queryByTestId('thing-no-vanilla-pictures')).toBeNull();
  });

  it('shows a long section in parts with "Show all"', () => {
    const many = Array.from({ length: TILES_PER_SECTION + 3 }, (_, index) => `item_${index}`);
    const big = createRegistryIndex({ vanilla: { item: many } });
    render(
      <ThingPicker
        title="Pick an item"
        sort="item"
        sections={thingSections({ ...input, registries: big, sort: 'item' })}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const region = screen.getByRole('region', { name: 'Minecraft items' });
    expect(within(region).getAllByRole('button')).toHaveLength(TILES_PER_SECTION + 1);
    act(() => {
      fireEvent.click(screen.getByTestId('thing-more-items'));
    });
    expect(within(region).getAllByRole('button')).toHaveLength(TILES_PER_SECTION + 3);
  });
});
