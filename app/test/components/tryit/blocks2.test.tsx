// @vitest-environment happy-dom
/**
 * Vanilla parity 2 in the Try it view (B463): the sign editor and plaque, the bag screen, the
 * chat box and the side panel, over a real area of a small lowered project, and MSM's fallback
 * parents for the twenty types' vanilla templates.
 */
import type { SimFiles } from '@msm/sim';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BagScreen } from '../../../src/renderer/src/tryit/blocks2/BagScreen';
import {
  Blocks2Overlay,
  Blocks2Panel,
} from '../../../src/renderer/src/tryit/blocks2/Blocks2Overlay';
import { usageHints } from '../../../src/renderer/src/tryit/blocks2/ChatBox';
import {
  BLOCKS2_FALLBACK_PARENTS,
  TRYIT_FALLBACK_MODELS,
} from '../../../src/renderer/src/tryit/blocks2/fallback-parents';
import { bagThings } from '../../../src/renderer/src/tryit/blocks2/things';
import { TryItArea } from '../../../src/renderer/src/tryit/session-source';
import { NS, TARGET } from './tryit-fixture';

afterEach(cleanup);

const folders = TARGET.folders.resource;

function files(): SimFiles {
  const entries: Record<string, unknown> = {
    [`msm/${NS}/block/oak_board.json`]: { format: 1, type: 'sign', wood_type: 'oak' },
    [`msm/${NS}/block/lamp.json`]: { format: 1, type: 'lantern' },
    [`msm/${NS}/item/satchel.json`]: {
      format: 1,
      max_stack_size: 1,
      components: { 'msm:item_inventory': { layout: 'chest', rows: 3 } },
    },
    [`msm/${NS}/item/pouch.json`]: {
      format: 1,
      max_stack_size: 1,
      components: { 'msm:item_inventory': { layout: 'hopper' } },
    },
    [`msm/${NS}/command/hello.json`]: {
      format: 1,
      name: 'hello',
      arguments: [{ name: 'times', type: 'integer', min: 1, max: 3, optional: true }],
      event: 'wave',
      events: {
        wave: { actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.chime' }] },
      },
    },
    [`assets/${NS}/${folders.lang}/en_us.json`]: {
      [`block.${NS}.oak_board`]: 'Oak Board',
      [`item.${NS}.satchel`]: 'Satchel',
      [`command.${NS}.hello.feedback`]: 'Hello there!',
    },
  };
  return new Map(Object.entries(entries).map(([path, json]) => [path, JSON.stringify(json)]));
}

const area = (): TryItArea => new TryItArea({ files: files(), target: TARGET, seed: 2 });

describe('Try it, vanilla parity 2', () => {
  it('has a fallback parent for every vanilla template the twenty types name', () => {
    for (const path of [
      'block/template_torch',
      'block/template_torch_wall',
      'block/template_lantern',
      'block/template_hanging_lantern',
      'block/template_sign_rot_0',
      'block/template_sign_rot_3',
      'block/template_wall_sign',
      'block/template_hanging_sign_rot_2',
      'block/template_attached_hanging_sign_rot_1',
      'block/template_wall_hanging_sign',
      'block/template_bed_head',
      'block/template_bed_foot',
      'block/template_chain',
      'block/template_candle',
      'block/template_four_candles',
      'block/cake',
      'block/cake_slice6',
      'block/carpet',
      'block/cocoa_stage2',
      'block/sea_pickle',
      'block/four_dead_sea_pickles',
      'block/end_rod',
      'block/flower_pot_cross',
      'block/ladder',
      'block/scaffolding_stable',
      'block/scaffolding_unstable',
      'block/snow_height14',
      'block/stem_growth7',
      'block/stem_fruit',
      'block/vine',
    ]) {
      expect(BLOCKS2_FALLBACK_PARENTS[path], path).toBeDefined();
      expect(TRYIT_FALLBACK_MODELS[path]).toBe(BLOCKS2_FALLBACK_PARENTS[path]);
    }
    expect(TRYIT_FALLBACK_MODELS['block/cube_all']).toBeDefined();
  });

  it('offers bags in the hotbar', () => {
    const tryIt = area();
    const things = bagThings(
      tryIt.source.parity2.bagItems,
      (id) => tryIt.source.itemName(id),
      tryIt.files,
      folders,
    );
    expect(things.map((thing) => [thing.id, thing.kind, thing.name])).toEqual([
      [`${NS}:pouch`, 'bag', 'Pouch'],
      [`${NS}:satchel`, 'bag', 'Satchel'],
    ]);
  });

  it('draws the bag screen with the slots of the game screen it stands for', () => {
    const tryIt = area();
    tryIt.source.useItem(`${NS}:satchel`);
    const bag = tryIt.source.parity2.bag;
    if (bag === null) throw new Error('no bag');
    const onClose = vi.fn();
    render(<BagScreen bag={bag} heldSlot={2} onClose={onClose} />);
    expect(screen.getByTestId('tryit-bag-screen').dataset.screen).toBe('shulker_box');
    expect(screen.getAllByTestId('tryit-bag-slot')).toHaveLength(27);
    expect(screen.getAllByTestId('tryit-bag-own-slot')).toHaveLength(1);
    expect(screen.getByTestId('tryit-bag-words').textContent).toContain(
      'shulker box screen, 27 slots',
    );
    fireEvent.keyDown(screen.getByTestId('tryit-bag-screen'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('writes on a placed sign and shows the text on the plaque', () => {
    const tryIt = area();
    // The player looks south (yaw 0) from the middle; the sign goes in front of them.
    tryIt.act({
      type: 'place',
      pos: { x: 24, y: -1, z: 26 },
      face: 'up',
      hit: { x: 0.5, y: 1, z: 0.5 },
      block: `${NS}:oak_board`,
    });
    const pos = { x: 24, y: 0, z: 26 };
    const onChanged = vi.fn();
    const props = {
      area: tryIt,
      pointed: pos,
      heldSlot: 0,
      chat: null,
      onCloseChat: () => {},
      onChanged,
      onFocusBack: () => {},
    };
    const { rerender } = render(<Blocks2Overlay {...props} />);
    expect(screen.getByTestId('tryit-sign-editor').dataset.side).toBe('front');
    fireEvent.change(screen.getByTestId('tryit-sign-line-1'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByTestId('tryit-sign-line-2'), { target: { value: 'world' } });
    fireEvent.change(screen.getByTestId('tryit-sign-colour'), { target: { value: 'blue' } });
    fireEvent.click(screen.getByTestId('tryit-sign-done'));
    expect(onChanged).toHaveBeenCalled();
    expect(tryIt.source.parity2.signText(pos).front.lines.slice(0, 2)).toEqual(['Hello', 'world']);
    rerender(<Blocks2Overlay {...props} />);
    expect(screen.queryByTestId('tryit-sign-editor')).toBeNull();
    const lines = screen.getAllByTestId('tryit-sign-plaque-line').map((one) => one.textContent);
    expect(lines.slice(0, 2)).toEqual(['Hello', 'world']);
    expect(screen.getByTestId('tryit-sign-plaque').textContent).toContain('Blue');
  });

  it('runs a command from the chat box and shows its answer', () => {
    const tryIt = area();
    expect(usageHints('/he', tryIt.source.parity2.commands.commands)).toEqual(['/hello [<times>]']);
    const props = {
      area: tryIt,
      pointed: null,
      heldSlot: 0,
      chat: { start: '/' },
      onCloseChat: vi.fn(),
      onChanged: () => {},
      onFocusBack: () => {},
    };
    const { rerender } = render(<Blocks2Overlay {...props} />);
    const input = screen.getByTestId('tryit-chat-input');
    fireEvent.change(input, { target: { value: '/hello 2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    rerender(<Blocks2Overlay {...props} />);
    expect(screen.getAllByTestId('tryit-chat-line').at(-1)?.textContent).toContain('Hello there!');
    fireEvent.change(input, { target: { value: '/hello 9' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    rerender(<Blocks2Overlay {...props} />);
    const last = screen.getAllByTestId('tryit-chat-line').at(-1);
    expect(last?.dataset.result).toBe('error');
    expect(last?.textContent).toContain('Integer must not be more than 3, found 9');
    expect(tryIt.source.trace.some((entry) => entry.text.includes('so its event "wave" ran'))).toBe(
      true,
    );
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.onCloseChat).toHaveBeenCalled();
  });

  it('runs the time-lapse from the side panel and lists the commands', () => {
    const tryIt = area();
    render(<Blocks2Panel area={tryIt} onOpenChat={() => {}} onChanged={() => {}} />);
    expect(screen.getByTestId('tryit-commands').textContent).toContain('/hello [<times>]');
    fireEvent.click(screen.getByTestId('tryit-timelapse'));
    expect(tryIt.lines.at(-1)?.text).toContain('place a block that weathers first');
  });
});
