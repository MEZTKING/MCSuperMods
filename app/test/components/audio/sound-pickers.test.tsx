// @vitest-environment happy-dom
/**
 * Every sound picker has a Play button (ADR 0121 D2; B622). The walk reads the renderer's source:
 * a file that picks a sound (`SOUND_PICKER_MARKERS`) must be in `SOUND_PICKERS`, and every listed
 * file must use the part that carries the button. Then each part is drawn with a fake player and
 * the button is found: the shared id field (Easy and Very easy), the ThingPicker's sound tiles
 * (Rules, Very easy), the schema form's sound fields, the Block Studio's How it sounds, the
 * Creator's and the starter wizard's song fields and the sounds live view.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Element, ResourceLocation } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PART_USES,
  SOUND_PICKER_EXEMPT,
  SOUND_PICKER_MARKERS,
  SOUND_PICKERS,
} from '../../../src/renderer/src/audio/sound-pickers';
import { CreatorAudioField } from '../../../src/renderer/src/components/creator/CreatorAudioField';
import {
  ThingPicker,
  thingSections,
} from '../../../src/renderer/src/components/thing-picker/ThingPicker';
import { PlainContext } from '../../../src/renderer/src/components/ui/MoreOptions';
import { ParameterField } from '../../../src/renderer/src/components/wizard/ParameterField';
import { oggDataUrl } from '../../../src/renderer/src/components/wizard/wizard-model';
import { FormContext, type FormContextValue } from '../../../src/renderer/src/forms/context';
import { StringControl } from '../../../src/renderer/src/forms/scalars';
import BundleLiveView from '../../../src/renderer/src/liveviews/BundleLiveView';
import SoundsView from '../../../src/renderer/src/liveviews/looks/sounds/SoundsView';
import { NOT_SET_UP_VANILLA_DATA } from '../../../src/renderer/src/liveviews/vanilla-data';
import { DEFAULT_PREFS } from '../../../src/renderer/src/liveviews/view-prefs';
import { SoundsSection } from '../../../src/renderer/src/studios/blocks-items/SoundsSection';
import { THING_SLOTS } from '../../../src/renderer/src/studios/rules/slot-words';
import { IdField } from '../../../src/renderer/src/studios/structures/pickers';
import { element } from '../fixtures';
import {
  fakePlayer,
  fakeVanilla,
  oggOf,
  projectReader,
  SoundHarness,
  soundProject,
} from './fake-player';

afterEach(() => {
  window.msmMoreOptionsOpen = true;
  cleanup();
});

const RENDERER = join(import.meta.dirname, '../../../src/renderer/src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(RENDERER, path).split(sep).join('/'));
  }
  return out;
}

describe('the sound picker registry', () => {
  const files = sourceFiles(RENDERER).filter((file) => !file.startsWith('audio/'));
  const listed = new Map(SOUND_PICKERS.map((place) => [place.file, place]));

  it('lists every file that picks a sound', () => {
    const pickers = files.filter((file) => {
      const text = readFileSync(join(RENDERER, file), 'utf8');
      return SOUND_PICKER_MARKERS.some(
        (marker) => (!marker.componentsOnly || file.endsWith('.tsx')) && marker.pattern.test(text),
      );
    });
    expect(pickers.length).toBeGreaterThan(15);
    const missing = pickers.filter((file) => !listed.has(file) && !(file in SOUND_PICKER_EXEMPT));
    expect(missing, 'add these sound pickers to SOUND_PICKERS with a Play button').toEqual([]);
  });

  it('has each listed file use the part that carries the button', () => {
    for (const place of SOUND_PICKERS) {
      const text = readFileSync(join(RENDERER, place.file), 'utf8');
      expect(PART_USES[place.via].test(text), `${place.file} uses ${place.via}`).toBe(true);
    }
  });

  it('has the button in each part', () => {
    const parts = {
      IdField: 'studios/structures/pickers.tsx',
      ThingPicker: 'components/thing-picker/ThingPicker.tsx',
      StringControl: 'forms/scalars.tsx',
    };
    for (const file of Object.values(parts)) {
      expect(readFileSync(join(RENDERER, file), 'utf8')).toMatch(/<SoundPlayButton\b/);
    }
  });

  it("puts Rules' sound slots in the ThingPicker", () => {
    expect(THING_SLOTS.sound).toBe('sound');
  });
});

const OWN = { hum: { subtitle: 'Hums', sounds: ['demo:hum', { name: 'demo:buzz', weight: 2 }] } };

function harness() {
  const project = soundProject(OWN, ['sounds/hum.ogg', 'sounds/buzz.ogg']);
  const fake = fakePlayer();
  const sources = {
    project,
    sounds: fakeVanilla({}),
    readProjectAsset: projectReader(project).read,
    random: () => 0,
  };
  const wrap = (children: React.ReactNode) => (
    <SoundHarness player={fake.player} sources={sources}>
      {children}
    </SoundHarness>
  );
  return { project, wrap, ...fake };
}

const press = async (button: HTMLElement) => {
  await act(async () => {
    fireEvent.click(button);
  });
};

describe('every place has the button', () => {
  it('the shared id field, plain and under More options', async () => {
    // The default view (ADR 0130): the plain field has the button, the id under More options too.
    window.msmMoreOptionsOpen = false;
    const { wrap, played } = harness();
    const field = (
      <IdField label="Sound" value="demo:hum" registry="sound_event" onCommit={() => {}} />
    );
    render(wrap(field));
    await press(screen.getByTestId('sound-play-button'));
    expect(played[0]?.bytes).toEqual(oggOf('demo:sounds/hum.ogg'));
    cleanup();
    render(wrap(<PlainContext.Provider value={false}>{field}</PlainContext.Provider>));
    expect(screen.getByTestId('sound-play-button')).toBeTruthy();
    cleanup();
    // An id field of another registry has none; an empty sound has none.
    render(
      wrap(
        <>
          <IdField label="Item" value="demo:ruby" registry="item" onCommit={() => {}} />
          <IdField label="Sound" value="" registry="sound_event" onCommit={() => {}} />
        </>,
      ),
    );
    expect(screen.queryByTestId('sound-play-button')).toBeNull();
  });

  it("the ThingPicker's sound tiles", () => {
    const { wrap, project } = harness();
    const sections = thingSections({
      project,
      registries: {
        ids: (registry) => (registry === 'sound_event' ? ['minecraft:block.made_up'] : []),
      },
      sort: 'sound',
      texturesFolder: 'textures',
    });
    render(
      wrap(
        <ThingPicker
          title="Pick a sound"
          sort="sound"
          sections={sections}
          onPick={() => {}}
          onCancel={() => {}}
        />,
      ),
    );
    const tile = screen.getByTestId('thing-sound-minecraft:block.made_up');
    expect(within(tile).getByTestId('sound-play-button')).toBeTruthy();
    expect(within(tile).getByTestId('sound-play-button').tabIndex).toBe(-1);
  });

  it("the schema form's sound event and sound file fields", () => {
    const { wrap } = harness();
    const form: FormContextValue = {
      onChange: () => {},
      problems: new Map(),
      hidden: new Set(),
      completions: undefined,
      maxDepth: 8,
    };
    const node = (idRegistry: string) =>
      ({ kind: 'string', idRegistry }) as SchemaNode & { kind: 'string' };
    render(
      wrap(
        <FormContext.Provider value={form}>
          <StringControl
            node={node('sound_event')}
            value="demo:hum"
            pointer="/a"
            label="A"
            invalid={false}
          />
          <StringControl
            node={node('sound')}
            value="demo:hum"
            pointer="/b"
            label="B"
            invalid={false}
          />
          <StringControl
            node={node('item')}
            value="demo:hum"
            pointer="/c"
            label="C"
            invalid={false}
          />
        </FormContext.Provider>,
      ),
    );
    expect(screen.getAllByTestId('sound-play-button')).toHaveLength(2);
  });

  it('the Block Studio: How it sounds, at the block volume and pitch', async () => {
    const { wrap, played, project } = harness();
    const target = builtInTargets[0]?.target;
    if (target === undefined) throw new Error('no target');
    const block: Element = element('demo:thing' as ResourceLocation, 'msm:block', {
      format: 1,
      sound_type: 'stone',
      block_sounds: { break: 'demo:hum', volume: 0.5, pitch: 1.5 },
    });
    const props = {
      project,
      element: block,
      target,
      problems: [],
      suggest: () => [],
      set: () => {},
    };
    window.msmMoreOptionsOpen = false;
    render(wrap(<SoundsSection {...props} />));
    await press(screen.getByTestId('sound-play-button'));
    expect(played[0]).toMatchObject({ volume: 0.5, pitch: 1.5 });
    cleanup();
    render(wrap(<SoundsSection {...props} />));
    expect(screen.getAllByTestId('sound-play-button')).toHaveLength(1);
  });

  it("the Creator's and the starter wizard's song fields", async () => {
    const { wrap, played } = harness();
    const song = oggDataUrl(oggOf('song'));
    const parameter = {
      id: 'song_file',
      label: 'Song file',
      type: 'audio',
      default: null,
    } as const;
    render(
      wrap(
        <>
          <CreatorAudioField
            parameter={parameter}
            value={song}
            error={null}
            pickAudio={async () => []}
            onChange={() => {}}
          />
          <ParameterField parameter={parameter} value={song} error={null} onChange={() => {}} />
        </>,
      ),
    );
    await press(screen.getAllByTestId('param-song_file-play')[0] as HTMLElement);
    expect(played[0]?.bytes).toEqual(oggOf('song'));
    expect(played[0]?.stream).toBe(true);
    expect(screen.getAllByTestId('param-song_file-play')).toHaveLength(2);
  });

  it('the sounds live view: each event and file, and the file a press picked', async () => {
    const { wrap, played, project } = harness();
    const view = soundProject(OWN).namespaces[0]?.elements[0] as Element;
    render(
      wrap(
        <SoundsView
          project={project}
          element={view}
          vanilla={NOT_SET_UP_VANILLA_DATA}
          vanillaAssets={null}
          sounds={null}
          readProject={async (path: string) =>
            path.startsWith('assets/demo/sounds/') ? oggOf(path) : null
          }
          preferences={DEFAULT_PREFS}
          onPreferences={() => {}}
          onSetup={() => {}}
        />,
      ),
    );
    expect(screen.getByTestId('live-view')).toBeTruthy();
    expect(screen.getAllByTestId('sounds-view-entry')).toHaveLength(2);
    expect(screen.getAllByTestId('sound-play-button')).toHaveLength(2);
    expect(screen.getByText(/picked 33.3%/)).toBeTruthy();
    expect(screen.getByText(/picked 66.7%/)).toBeTruthy();
    await press(screen.getByTestId('sounds-view-play-hum'));
    expect(played[0]?.bytes).toEqual(oggOf('assets/demo/sounds/hum.ogg'));
    expect(screen.getByTestId('sounds-view-picked-hum').textContent).toBe(
      'Picked Hum at volume 1, pitch 1.',
    );
  });
});

describe('the live view hosts', () => {
  it("give the views a reader of the user's own Minecraft sounds", async () => {
    const readAssetObject = vi.fn(async () => ({
      ok: false as const,
      reason: 'not_set_up' as const,
    }));
    (window as unknown as { msm: unknown }).msm = { minecraft: { readAssetObject } };
    try {
      const { wrap, project } = harness();
      const sounds = element('minecraft:sounds' as ResourceLocation, 'minecraft:sounds', {
        'entity.made_up.hum': { sounds: ['mob/made_up/hum1'] },
      });
      render(
        wrap(
          <BundleLiveView project={project} element={sounds} mcVersion="9.9" onSetup={() => {}} />,
        ),
      );
      const buttons = () => [
        screen.getByTestId('sounds-view-play-entity.made_up.hum'),
        screen.getByTestId('sound-play-button'),
      ];
      await waitFor(() => expect(buttons()).toHaveLength(2), { timeout: 10_000 });
      await waitFor(() =>
        expect(readAssetObject).toHaveBeenCalledWith('9.9', 'minecraft/sounds.json'),
      );
      await waitFor(() =>
        expect(buttons().map((button) => button.dataset.state)).toEqual(['off', 'off']),
      );
    } finally {
      delete (window as unknown as { msm?: unknown }).msm;
    }
  });
});
