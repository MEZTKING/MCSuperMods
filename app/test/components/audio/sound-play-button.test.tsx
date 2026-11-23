// @vitest-environment happy-dom
/**
 * The Play button (ADR 0121 D2, D3; B622) with a fake player: a project event resolved through
 * the project's `sounds.json`, its file picked by weight and played at its volume and pitch; a
 * vanilla event through the user's own folder; off with the set-up link without that folder;
 * one sound at a time; the time from the press to the player under the budgets (200 ms for a
 * project sound, 300 ms for the first vanilla press). All bytes are made up.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoundPlayButton } from '../../../src/renderer/src/audio/SoundPlayButton';
import {
  fakePlayer,
  fakeVanilla,
  oggOf,
  projectReader,
  SoundHarness,
  soundProject,
} from './fake-player';

afterEach(cleanup);

const OWN = {
  thing: {
    subtitle: 'Thing hums',
    sounds: [
      { name: 'demo:hum_low', weight: 1, volume: 0.4, pitch: 0.8 },
      { name: 'demo:hum_high', weight: 3, volume: 0.9, pitch: 1.6 },
    ],
  },
  song: { sounds: [{ name: 'demo:song', stream: true }] },
};
const FILES = ['sounds/hum_low.ogg', 'sounds/hum_high.ogg', 'sounds/song.ogg'];
const VANILLA = { 'entity.made_up.hum': { sounds: ['mob/made_up/hum1'] } };

function setUp(options: { random?: () => number; vanilla?: boolean; onSetup?: () => void } = {}) {
  const project = soundProject(OWN, FILES);
  const fake = fakePlayer();
  const reader = projectReader(project);
  const setUpFolder = { value: options.vanilla ?? true };
  const vanilla = fakeVanilla(VANILLA, setUpFolder);
  const sources = {
    project,
    sounds: vanilla,
    readProjectAsset: reader.read,
    ...(options.random === undefined ? {} : { random: options.random }),
    ...(options.onSetup === undefined ? {} : { onSetup: options.onSetup }),
  };
  const wrap = (children: React.ReactNode) => (
    <SoundHarness player={fake.player} sources={sources}>
      {children}
    </SoundHarness>
  );
  return { ...fake, reader, vanilla, setUpFolder, wrap };
}

const press = async (testId = 'sound-play-button') => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
};

describe('SoundPlayButton', () => {
  it("plays a project event's file picked by weight, at its volume and pitch", async () => {
    // 0.1 of weight 4 is 0, the first entry; 0.5 is 2, the second (weight 3).
    const randoms = [0.1, 0.5];
    const { played, reader, wrap } = setUp({ random: () => randoms.shift() ?? 0 });
    render(wrap(<SoundPlayButton event="demo:thing" volume={0.5} />));
    await press();
    expect(played[0]).toMatchObject({ volume: 0.2, pitch: 0.8, stream: false });
    expect(played[0]?.bytes).toEqual(oggOf('demo:sounds/hum_low.ogg'));
    expect(reader.reads).toEqual(['demo:sounds/hum_low.ogg']);
    await waitFor(() =>
      expect(screen.getByTestId('sound-play-button').getAttribute('data-state')).toBe('playing'),
    );
    // A second press stops it.
    await press();
    await waitFor(() =>
      expect(screen.getByTestId('sound-play-button').getAttribute('data-state')).toBe('idle'),
    );
    expect(played).toHaveLength(1);
    await press();
    expect(played[1]).toMatchObject({ volume: 0.45, pitch: 1.6 });
    expect(played[1]?.bytes).toEqual(oggOf('demo:sounds/hum_high.ogg'));
  });

  it('honours the weights over many presses', async () => {
    let step = 0;
    const { played, player, wrap } = setUp({ random: () => (step++ % 40) / 40 });
    render(wrap(<SoundPlayButton event="demo:thing" />));
    for (let index = 0; index < 40; index += 1) {
      act(() => player.stopAll());
      await press();
    }
    const high = played.filter((request) => request.pitch === 1.6).length;
    expect(high).toBe(30);
    expect(played).toHaveLength(40);
  });

  it('streams an entry that says so', async () => {
    const { played, wrap } = setUp();
    render(wrap(<SoundPlayButton event="demo:song" />));
    await press();
    expect(played[0]?.stream).toBe(true);
  });

  it('plays one sound at a time: another button stops the first', async () => {
    const { played, stopped, wrap } = setUp({ random: () => 0 });
    render(
      wrap(
        <>
          <SoundPlayButton event="demo:thing" testId="one" />
          <SoundPlayButton event="demo:song" testId="two" />
        </>,
      ),
    );
    await press('one');
    await press('two');
    expect(played).toHaveLength(2);
    expect(stopped).toEqual([played[0]?.key]);
    await waitFor(() => expect(screen.getByTestId('one').getAttribute('data-state')).toBe('idle'));
    expect(screen.getByTestId('two').getAttribute('data-state')).toBe('playing');
  });

  it("reads a Minecraft event from the user's own folder", async () => {
    const { played, vanilla, wrap } = setUp();
    render(wrap(<SoundPlayButton event="minecraft:entity.made_up.hum" />));
    await waitFor(() =>
      expect(screen.getByTestId('sound-play-button').getAttribute('data-state')).toBe('idle'),
    );
    await press();
    expect(vanilla.files).toEqual(['minecraft/sounds/mob/made_up/hum1.ogg']);
    expect(played[0]?.bytes).toEqual(oggOf('minecraft/sounds/mob/made_up/hum1.ogg'));
  });

  it('is off for Minecraft ids without the folder, with the set-up link; project sounds play', async () => {
    const onSetup = vi.fn();
    const { played, wrap } = setUp({ vanilla: false, onSetup });
    render(
      wrap(
        <>
          <SoundPlayButton event="minecraft:entity.made_up.hum" testId="vanilla" />
          <SoundPlayButton event="demo:thing" testId="own" />
          <SoundPlayButton
            file={{ namespace: 'minecraft', path: 'mob/made_up/hum1' }}
            testId="file"
          />
        </>,
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('vanilla').getAttribute('data-state')).toBe('off'),
    );
    expect((screen.getByTestId('vanilla') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('file').getAttribute('data-state')).toBe('off');
    expect(screen.getAllByTestId('sound-setup')).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId('sound-setup')[0] as HTMLElement);
    expect(onSetup).toHaveBeenCalledOnce();
    expect(screen.getByTestId('own').getAttribute('data-state')).toBe('idle');
    await press('own');
    expect(played).toHaveLength(1);
  });

  it('is off without a player, and says when there is nothing to play', async () => {
    render(<SoundPlayButton event="demo:thing" />);
    expect(screen.getByTestId('sound-play-button').getAttribute('data-state')).toBe('off');
    cleanup();
    const { played, wrap } = setUp();
    render(wrap(<SoundPlayButton event="demo:not_defined" />));
    await press();
    expect(played).toHaveLength(0);
    expect(screen.getByTestId('sound-play-button').getAttribute('data-state')).toBe('missing');
    expect(screen.getByTestId('sound-missing')).toBeTruthy();
  });

  it('plays bytes as they are', async () => {
    const { played, wrap } = setUp();
    const bytes = oggOf('picked');
    render(wrap(<SoundPlayButton bytes={{ key: 'k', bytes }} stream />));
    await press();
    expect(played[0]).toMatchObject({ key: 'k', bytes, stream: true, volume: 1, pitch: 1 });
  });

  it('starts within the budgets: 200 ms for a project sound, 300 ms for the first vanilla press', async () => {
    const { wrap } = setUp();
    render(
      wrap(
        <>
          <SoundPlayButton event="demo:thing" testId="own" />
          <SoundPlayButton event="minecraft:entity.made_up.hum" testId="vanilla" />
        </>,
      ),
    );
    await press('own');
    await waitFor(() =>
      expect(screen.getByTestId('own').getAttribute('data-start-ms')).not.toBeNull(),
    );
    expect(Number(screen.getByTestId('own').getAttribute('data-start-ms'))).toBeLessThan(200);
    await waitFor(() =>
      expect(screen.getByTestId('vanilla').getAttribute('data-state')).toBe('idle'),
    );
    await press('vanilla');
    await waitFor(() =>
      expect(screen.getByTestId('vanilla').getAttribute('data-start-ms')).not.toBeNull(),
    );
    expect(Number(screen.getByTestId('vanilla').getAttribute('data-start-ms'))).toBeLessThan(300);
  });
});
