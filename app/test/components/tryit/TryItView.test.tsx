// @vitest-environment happy-dom

import type { OutputFile } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TryItView, { CARD_LINES, STRIP_TEXT } from '../../../src/renderer/src/tryit/TryItView';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';
import { demoOutputs, fakeSession, NS } from './tryit-fixture';

beforeEach(() => {
  useTryItStore.getState().reset();
  useTryItStore.setState({ cardSeen: false, smaller: null });
});

afterEach(() => {
  cleanup();
  useTryItStore.getState().reset();
});

function view(options: { playAvailable?: boolean } = {}) {
  const fake = fakeSession();
  const onPlay = vi.fn();
  const onTest = vi.fn();
  const result = render(
    <TryItView
      session={fake.session}
      root="/projects/demo"
      vanilla={null}
      readProjectAsset={async () => null}
      playAvailable={options.playAvailable ?? true}
      onPlay={onPlay}
      onTestInMinecraft={onTest}
      webgl={false}
    />,
  );
  return { fake, onPlay, onTest, ...result };
}

const readout = () => screen.getByTestId('tryit-state');
const press = (code: string) =>
  act(() => {
    fireEvent.keyDown(screen.getByTestId('tryit-canvas'), { code });
    fireEvent.keyUp(screen.getByTestId('tryit-canvas'), { code });
  });

async function ready(): Promise<void> {
  await waitFor(() => expect(screen.getByTestId('tryit-state')).toBeTruthy());
}

describe('Try it view', () => {
  it('always shows the strip with Play, and no way to close it', async () => {
    const { onPlay } = view();
    await ready();
    const strip = screen.getByTestId('tryit-strip');
    expect(strip.textContent).toContain(STRIP_TEXT);
    expect(strip.querySelectorAll('button')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('tryit-play'));
    expect(onPlay).toHaveBeenCalledOnce();
    // Without WebGL the picture's place also offers Play.
    expect(screen.getByTestId('tryit-play-no-webgl').textContent).toContain('Play in Minecraft');
  });

  it('offers Test in Minecraft when Play is not available', async () => {
    const { onTest } = view({ playAvailable: false });
    await ready();
    expect(screen.getByTestId('tryit-play').textContent).toContain('Test in Minecraft…');
    fireEvent.click(screen.getByTestId('tryit-play'));
    expect(onTest).toHaveBeenCalledOnce();
  });

  it('shows the first-run card once', async () => {
    view();
    await ready();
    expect(screen.getByTestId('tryit-card').textContent).toContain(CARD_LINES[0]);
    fireEvent.click(screen.getByTestId('tryit-card-close'));
    expect(screen.queryByTestId('tryit-card')).toBeNull();
    cleanup();
    view();
    await ready();
    expect(screen.queryByTestId('tryit-card')).toBeNull();
  });

  it('places, breaks, spawns and hits by keys, with the readout following', async () => {
    view();
    await ready();
    // Look down at 45 degrees: the floor 1.6 blocks ahead.
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect(readout().dataset.pointed).toBe('the floor');
    // Slot 3 is the Ruby Block (berry, door, ruby block, then the egg).
    press('Digit3');
    expect(readout().dataset.selected).toBe(`${NS}:ruby_block`);
    press('KeyC');
    await waitFor(() => expect(readout().dataset.blocks).toBe('1'));
    expect(readout().dataset.pointed).toBe(`${NS}:ruby_block`);
    press('KeyX');
    await waitFor(() => expect(readout().dataset.blocks).toBe('0'));
    press('Digit4');
    press('KeyC');
    await waitFor(() => expect(readout().dataset.entities).toBe('1'));
    expect(readout().dataset.pointed).toBe(`mob ${NS}:golem`);
    press('KeyX');
    await waitFor(() => expect(readout().dataset.entities).toBe('0'));
    expect(screen.getByTestId('tryit-log').textContent).toContain('You hit Golem');
  });

  it('shows "Only in Minecraft" lines in the log and clears the area', async () => {
    view();
    await ready();
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('Digit3');
    press('KeyC');
    await waitFor(() => expect(readout().dataset.blocks).toBe('1'));
    // Power on a block without a powered picture says so out loud.
    press('KeyP');
    await waitFor(() =>
      expect(screen.getAllByTestId('tryit-log-only').map((line) => line.textContent)).toContain(
        'Only in Minecraft: Ruby Block has no powered or lit picture; what a redstone signal does to it shows only in the game',
      ),
    );
    fireEvent.click(screen.getByTestId('tryit-clear'));
    await waitFor(() => expect(readout().dataset.blocks).toBe('0'));
  });

  it('keeps the area when the view is closed and opened again, and follows edits', async () => {
    const { fake } = view();
    await ready();
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('Digit3');
    press('KeyC');
    await waitFor(() => expect(readout().dataset.blocks).toBe('1'));
    cleanup();
    fake.edit(demoOutputs({ names: { [`block.${NS}.ruby_block`]: 'Red Block' } }));
    render(
      <TryItView
        session={fake.session}
        root="/projects/demo"
        vanilla={null}
        readProjectAsset={async () => null}
        playAvailable
        onPlay={() => {}}
        onTestInMinecraft={() => {}}
        webgl={false}
      />,
    );
    await ready();
    expect(readout().dataset.blocks).toBe('1');
    await waitFor(() =>
      expect(screen.getByTestId('tryit-slot-3').getAttribute('aria-label')).toBe(
        'Slot 3: Red Block',
      ),
    );
  });

  it('pauses and steps the clock', async () => {
    view();
    await ready();
    fireEvent.click(screen.getByTestId('tryit-clock-pause'));
    await waitFor(() => expect(readout().dataset.paused).toBe('true'));
    fireEvent.click(screen.getByTestId('tryit-clock-step'));
    await waitFor(() => expect(readout().dataset.tick).toBe('1'));
    fireEvent.change(screen.getByTestId('tryit-clock-speed'), { target: { value: '2' } });
    await waitFor(() => expect(readout().dataset.speed).toBe('2'));
  });

  it('lists the keys and opens the picker without the client jar', async () => {
    view();
    await ready();
    expect(screen.getByTestId('tryit-keys').textContent).toContain('Right click or C');
    press('KeyE');
    expect(screen.getByTestId('tryit-picker')).toBeTruthy();
    expect(screen.getByTestId('tryit-picker-no-vanilla')).toBeTruthy();
    fireEvent.click(screen.getByTestId(`tryit-picker-item-${NS}:golem_spawn_egg`));
    expect(screen.queryByTestId('tryit-picker')).toBeNull();
    expect(readout().dataset.selected).toBe(`${NS}:golem_spawn_egg`);
    expect(screen.getAllByTestId('tryit-egg-icon').length).toBeGreaterThan(0);
  });
});

/** The demo project with a Crate (a chest of 2 rows that gives 2 Ruby on use) and a Ruby item. */
function crateOutputs(): OutputFile[] {
  const json = (path: string, contents: unknown) =>
    ({ path, contents, layer: 'resourcepack' }) as OutputFile;
  return [
    ...demoOutputs(),
    json(`msm/${NS}/block/crate.json`, {
      format: 1,
      components: {
        'msm:container': { rows: 2, on_open: 'opened' },
      },
      events: {
        opened: {
          actions: [
            { type: 'give_item', item: `${NS}:ruby`, count: 2 },
            { type: 'play_sound', sound: 'minecraft:block.barrel.open' },
            { type: 'apply_effect', effect: 'minecraft:glowing', duration: 60, target: 'self' },
          ],
        },
      },
    }),
    json(`msm/${NS}/item/ruby.json`, { format: 1 }),
  ];
}

describe('Try it view: what happened, items, chips and screens (B398)', () => {
  function crateView(onOpenElement = vi.fn()) {
    const fake = fakeSession(crateOutputs());
    render(
      <TryItView
        session={fake.session}
        root="/projects/demo"
        vanilla={null}
        readProjectAsset={async () => null}
        playAvailable
        onPlay={() => {}}
        onTestInMinecraft={() => {}}
        onOpenElement={onOpenElement}
        webgl={false}
      />,
    );
    return { onOpenElement };
  }

  it('opens the mock-up screen of a container, fills the items row and closes it', async () => {
    crateView();
    await ready();
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    // Slots: berry, crate, door, ruby block, then the egg.
    press('Digit2');
    expect(readout().dataset.selected).toBe(`${NS}:crate`);
    expect(screen.getByTestId('tryit-inventory-empty')).toBeTruthy();
    press('KeyC');
    await waitFor(() => expect(readout().dataset.blocks).toBe('1'));
    // Using the crate with the crate in hand opens it; nothing is placed on it.
    press('KeyC');
    await waitFor(() => expect(screen.getByTestId('tryit-screen')).toBeTruthy());
    expect(readout().dataset.blocks).toBe('1');
    expect(screen.getByTestId('tryit-screen-label').textContent).toBe('Mock-up');
    expect(screen.getAllByTestId('tryit-screen-slot')).toHaveLength(18);
    const slot = await screen.findByTestId('tryit-inventory-slot');
    expect(slot.dataset.item).toBe(`${NS}:ruby`);
    expect(slot.dataset.count).toBe('2');
    // The barrel sound is a caption; the chip says the effect.
    expect(screen.getByTestId('tryit-caption').textContent).toContain('Open');
    expect(screen.getByTestId('tryit-chip').textContent).toContain('Glowing');
    const log = screen.getByTestId('tryit-log');
    expect(log.textContent).toContain('You opened Crate, so its event "opened" ran.');
    expect(log.textContent).toContain('Gave you 2 Ruby.');
    expect(screen.getAllByTestId('tryit-log-only').map((line) => line.textContent)).toContain(
      'Only in Minecraft: the screen of Crate with items you can move (the preview shows a mock-up of its slots)',
    );
    fireEvent.click(screen.getByTestId('tryit-screen-close'));
    await waitFor(() => expect(screen.queryByTestId('tryit-screen')).toBeNull());
  });

  it('uses a mob by hand and turns "Run every time" on', async () => {
    crateView();
    await ready();
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    press('Digit5');
    press('KeyC');
    await waitFor(() => expect(readout().dataset.entities).toBe('1'));
    press('KeyC');
    await waitFor(() =>
      expect(screen.getByTestId('tryit-log').textContent).toContain(
        'You used Golem; nothing happens in the preview.',
      ),
    );
    const always = screen.getByTestId('tryit-always') as HTMLInputElement;
    expect(always.checked).toBe(false);
    fireEvent.click(always);
    await waitFor(() => expect(always.checked).toBe(true));
    expect(useTryItStore.getState().area?.source.chance).toBe('always');
  });
});
