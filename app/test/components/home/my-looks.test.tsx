// @vitest-environment happy-dom
/**
 * My things' "Particles and sounds" (B630, ADR 0121; the audit's note): a card per particle and
 * per sound event, Play on a sound card, each card opening its live view in a window; Very easy
 * draws no ids on the cards. Made-up sound bytes only.
 */
import type { Element, Project, ResourceLocation } from '@msm/core';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { forbiddenIn } from '../../../src/renderer/src/components/ai/ai-words';
import {
  LookCards,
  lookCards,
  MyThings,
  soundEventWords,
} from '../../../src/renderer/src/components/home/MyThings';
import { usePreferences } from '../../../src/renderer/src/store/preferences';
import { fakePlayer, fakeVanilla, projectReader, SoundHarness } from '../audio/fake-player';
import { element } from '../fixtures';

const SOUNDS = {
  'block.ruby.hum': { subtitle: 'subtitles.demo.hum', sounds: ['demo:hum'] },
  'music_disc.waltz': { sounds: [{ name: 'demo:waltz', stream: true }] },
};

function looksProject(extra: Element[] = []): Project {
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
          element('demo:sounds' as ResourceLocation, 'minecraft:sounds', SOUNDS),
          element('demo:spark' as ResourceLocation, 'minecraft:particle', {
            textures: ['demo:spark_0', 'demo:spark_1'],
          }),
          element('demo:glow_orb' as ResourceLocation, 'msm:particle', {
            name: 'Glow orb',
            textures: ['demo:particle/glow_orb_0'],
            lifetime: 20,
          }),
          ...extra,
        ],
        assets: [
          { path: 'sounds/hum.ogg', mediaType: 'audio/ogg' },
          { path: 'sounds/waltz.ogg', mediaType: 'audio/ogg' },
        ],
      },
    ],
  };
}

beforeAll(async () => {
  await import('../../../src/renderer/src/liveviews/BundleLiveView');
  await import('../../../src/renderer/src/liveviews/looks/sounds/SoundsView');
  await import('../../../src/renderer/src/liveviews/looks/particle/ParticleSprites');
});

afterEach(() => {
  cleanup();
  usePreferences.setState({ mode: 'easy' as never });
});

function harness(project: Project) {
  const fake = fakePlayer();
  const sources = {
    project,
    sounds: fakeVanilla({}),
    readProjectAsset: projectReader(project).read,
    random: () => 0,
  };
  return { ...fake, sources };
}

describe('lookCards', () => {
  it('makes a card per particle and per sound event, in words', () => {
    const cards = lookCards(looksProject());
    expect(cards.map((card) => [card.what, card.name])).toEqual([
      ['Particle', 'Glow orb'],
      ['Particle', 'Spark'],
      ['Sound', 'Block ruby hum'],
      ['Sound', 'Music disc waltz'],
    ]);
    expect(cards[2]?.event).toBe('demo:block.ruby.hum');
    expect(lookCards(null)).toEqual([]);
    expect(soundEventWords('entity.ruby_golem.step')).toBe('Entity ruby golem step');
  });
});

describe('My things: particles and sounds', () => {
  it('shows the cards under My things with no ids in Very easy, and plays a sound card', async () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    const project = looksProject();
    const { player, played, sources } = harness(project);
    render(
      <SoundHarness player={player} sources={sources}>
        <MyThings
          project={project}
          cards={[]}
          texturesFolder="textures"
          onOpen={vi.fn()}
          onRename={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
        />
      </SoundHarness>,
    );
    const grid = screen.getByTestId('my-looks');
    expect(within(grid).getAllByRole('listitem')).toHaveLength(4);
    const section = grid.closest('section') as HTMLElement;
    expect(forbiddenIn(section.textContent ?? '')).toEqual([]);
    for (const button of within(section).getAllByRole('button')) {
      expect(forbiddenIn(button.getAttribute('aria-label') ?? '')).toEqual([]);
      expect(forbiddenIn(button.getAttribute('title') ?? '')).toEqual([]);
    }
    await act(async () => {
      fireEvent.click(screen.getByTestId('my-look-play-3'));
    });
    await waitFor(() => expect(played).toHaveLength(1));
    expect(played[0]?.key).toBe('project:demo:hum');
  });

  it("opens a particle's view and a sound's view in a window", async () => {
    const project = looksProject();
    const { player, sources } = harness(project);
    render(
      <SoundHarness player={player} sources={sources}>
        <LookCards project={project} />
      </SoundHarness>,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('my-look-open-2'));
    });
    const window = await screen.findByTestId('my-look-window');
    await waitFor(() => expect(within(window).getByTestId('live-view')).toBeTruthy(), {
      timeout: 4000,
    });
    expect(within(window).getByRole('heading', { name: 'Spark' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByTestId('my-look-close'));
    });
    expect(screen.queryByTestId('my-look-window')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('my-look-open-3'));
    });
    const sound = await screen.findByTestId('my-look-window');
    await waitFor(
      () => expect(within(sound).getByTestId('sounds-view-event-block.ruby.hum')).toBeTruthy(),
      { timeout: 4000 },
    );
  });

  it('draws no ids in the windows in Very easy', async () => {
    usePreferences.setState({ mode: 'very-easy' as never });
    const project = looksProject();
    const { player, sources } = harness(project);
    for (const n of [1, 2, 3]) {
      const view = render(
        <SoundHarness player={player} sources={sources}>
          <LookCards project={project} />
        </SoundHarness>,
      );
      await act(async () => {
        fireEvent.click(screen.getByTestId(`my-look-open-${n}`));
      });
      const window = await screen.findByTestId('my-look-window');
      await waitFor(() => expect(within(window).getByTestId('live-view')).toBeTruthy(), {
        timeout: 4000,
      });
      if (n === 3) {
        await act(async () => {
          fireEvent.click(within(window).getByTestId('sounds-view-play-block.ruby.hum'));
        });
        await waitFor(() =>
          expect(within(window).getByTestId('sounds-view-picked-block.ruby.hum')).toBeTruthy(),
        );
      }
      expect(forbiddenIn(window.textContent ?? ''), `window ${n}`).toEqual([]);
      view.unmount();
    }
  });

  it('shows no section without particles or sounds', () => {
    const empty: Project = { ...looksProject(), namespaces: [] };
    const { player, sources } = harness(empty);
    render(
      <SoundHarness player={player} sources={sources}>
        <LookCards project={empty} />
      </SoundHarness>,
    );
    expect(screen.queryByTestId('my-looks')).toBeNull();
  });
});
