// @vitest-environment happy-dom
/**
 * The showcase gallery (B568, ADR 0118 D1, D6–D11) with a stand-in clip view, a fake
 * environment (reduced motion, window, in-view observer) and a stand-in picture codec: the
 * cards' words and buttons; never two live clips; hover, focus and the first card in view;
 * reduced motion, the setting, Pause clips, a hidden window and no WebGL never mount one by
 * themselves; the play button plays a clip once; taken stills replace drawn ones.
 */

import type { ExampleProject } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { builtInPlugins } from '../../../src/renderer/src/plugins/built-in';
import type { ClipViewProps } from '../../../src/renderer/src/showcase/ClipView';
import type { ShowcaseClip } from '../../../src/renderer/src/showcase/clip';
import { clearDrawnStills, type StillCodec } from '../../../src/renderer/src/showcase/drawn-still';
import type { LiveClipEnvironment } from '../../../src/renderer/src/showcase/live-clip';
import { NO_MOVING_PICTURES } from '../../../src/renderer/src/showcase/ShowcaseCard';
import {
  ShowcaseGallery,
  type ShowcaseGalleryProps,
} from '../../../src/renderer/src/showcase/ShowcaseGallery';
import { SHOWCASES } from '../../../src/renderer/src/showcase/showcases';
import { clearStills, keepStill, stillKey } from '../../../src/renderer/src/showcase/still-cache';
import { exampleById, TARGETS, theRegistry } from './showcase-fixture';

const woodSet = SHOWCASES[0] as ShowcaseClip;
const clips: ShowcaseClip[] = [
  woodSet,
  { ...woodSet, id: 'second', title: 'A second set', exampleId: 'example_msm_crop' },
  {
    ...woodSet,
    id: 'rules',
    title: 'Rules: a lucky block',
    sentence: 'Make things happen without code.',
    exampleId: 'example_msm_rules',
    make: { type: 'example' },
  },
];
const examples: ExampleProject[] = [
  exampleById('example_msm_wood_set'),
  exampleById('example_msm_crop'),
  exampleById('example_msm_rules'),
];
const target = TARGETS[0];
if (target === undefined) throw new Error('no target');

/** Every mounted stand-in clip view, live ones only. */
const mounted = new Set<string>();
const mounts: ClipViewProps[] = [];
function FakeClipView(props: ClipViewProps) {
  useEffect(() => {
    mounted.add(props.clip.id);
    mounts.push(props);
    return () => {
      mounted.delete(props.clip.id);
    };
  }, [props]);
  return <span data-testid={`live-${props.clip.id}`} />;
}

const codec: StillCodec = {
  decode: async () => ({ width: 1, height: 1, data: new Uint8ClampedArray([9, 9, 9, 255]) }),
  encode: () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
};

/** A controllable environment. */
function environment(start: { reducedMotion?: boolean; inView?: string[] } = {}) {
  let reduced = start.reducedMotion ?? false;
  let shown = true;
  const motion = new Set<() => void>();
  const windows = new Set<() => void>();
  let report: ((inView: ReadonlySet<string>) => void) | null = null;
  const env: LiveClipEnvironment = {
    reducedMotion: () => reduced,
    onReducedMotion: (listener) => {
      motion.add(listener);
      return () => motion.delete(listener);
    },
    windowShown: () => shown,
    onWindowShown: (listener) => {
      windows.add(listener);
      return () => windows.delete(listener);
    },
    watchInView: (elements, listener) => {
      report = listener;
      listener(new Set((start.inView ?? [...elements.keys()]).filter((id) => elements.has(id))));
      return () => {
        report = null;
      };
    },
  };
  return {
    env,
    setReduced(value: boolean) {
      reduced = value;
      act(() => {
        for (const listener of motion) listener();
      });
    },
    setShown(value: boolean) {
      shown = value;
      act(() => {
        for (const listener of windows) listener();
      });
    },
    inView(ids: string[]) {
      act(() => report?.(new Set(ids)));
    },
  };
}

function gallery(extra: Partial<ShowcaseGalleryProps> = {}, env = environment()) {
  const onMake = vi.fn();
  const onSeeExample = vi.fn();
  const utils = render(
    <ShowcaseGallery
      heading="See what you can make"
      clips={clips}
      examples={examples}
      target={target as NonNullable<typeof target>}
      deps={{ registry: theRegistry(), plugins: builtInPlugins }}
      onMake={onMake}
      onSeeExample={onSeeExample}
      environment={env.env}
      webgl
      clipView={FakeClipView}
      codec={codec}
      {...extra}
    />,
  );
  return { ...utils, onMake, onSeeExample, env };
}

const live = (): string[] => [...mounted];

afterEach(() => {
  cleanup();
  mounted.clear();
  mounts.length = 0;
  clearStills();
  clearDrawnStills();
});

describe('the showcase gallery', () => {
  it('shows a labelled section with each card’s words, the Preview tag and its buttons', async () => {
    const { onMake, onSeeExample } = gallery();
    const section = screen.getByRole('region', { name: 'See what you can make' });
    expect(section).toBeTruthy();
    expect(screen.getAllByText('Preview')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Clip: A set of wood' })).toBeTruthy();
    expect(screen.getByTestId('showcase-card-wood-set').textContent).toContain(woodSet.sentence);
    fireEvent.click(screen.getByTestId('showcase-make-wood-set'));
    expect(onMake).toHaveBeenCalledWith(woodSet);
    // The Rules card has no flow: See the example is its button.
    expect(screen.queryByTestId('showcase-make-rules')).toBeNull();
    fireEvent.click(screen.getByTestId('showcase-example-rules'));
    expect(onSeeExample).toHaveBeenCalledWith(clips[2]);
    // Drawn stills arrive from the examples' pictures.
    await waitFor(() => expect(screen.getByTestId('showcase-still-second')).toBeTruthy(), {
      timeout: 10_000,
    });
  });

  it('leaves out a clip whose example is not offered', () => {
    gallery({ examples: examples.slice(0, 1) });
    expect(screen.queryByTestId('showcase-card-second')).toBeNull();
    expect(screen.getByTestId('showcase-card-wood-set')).toBeTruthy();
  });

  it('plays the first card in view, then the hovered or focused one, never two', () => {
    const { env } = gallery({}, environment({ inView: ['second', 'rules'] }));
    expect(live()).toEqual(['second']);
    fireEvent.pointerEnter(screen.getByTestId('showcase-card-rules'));
    expect(live()).toEqual(['rules']);
    fireEvent.pointerLeave(screen.getByTestId('showcase-card-rules'));
    expect(live()).toEqual(['second']);
    fireEvent.focus(screen.getByTestId('showcase-make-wood-set'));
    expect(live()).toEqual(['wood-set']);
    env.inView([]);
    expect(live()).toEqual(['wood-set']);
    fireEvent.blur(screen.getByTestId('showcase-make-wood-set'));
    expect(live()).toEqual([]);
    expect(
      screen.getByRole('button', { name: 'Clip: A set of wood' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('pauses a card by its picture, and plays it again', () => {
    gallery({}, environment({ inView: ['wood-set'] }));
    const picture = screen.getByRole('button', { name: 'Clip: A set of wood' });
    expect(picture.getAttribute('aria-pressed')).toBe('true');
    expect(picture.textContent).toContain('Pause');
    fireEvent.click(picture);
    expect(live()).toEqual([]);
    expect(picture.textContent).toContain('Play');
    fireEvent.click(picture);
    expect(live()).toEqual(['wood-set']);
  });

  it('Pause clips stops every clip until a picture is played', () => {
    gallery();
    expect(live()).toEqual(['wood-set']);
    fireEvent.click(screen.getByTestId('showcase-pause'));
    expect(screen.getByTestId('showcase-pause').getAttribute('aria-pressed')).toBe('true');
    expect(live()).toEqual([]);
    fireEvent.pointerEnter(screen.getByTestId('showcase-card-second'));
    expect(live()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Clip: A second set' }));
    expect(live()).toEqual(['second']);
    expect(mounts.at(-1)?.once).toBe(true);
  });

  it('with reduced motion plays nothing by itself; the play button plays a clip once', () => {
    const env = environment({ reducedMotion: true });
    gallery({}, env);
    expect(live()).toEqual([]);
    fireEvent.pointerEnter(screen.getByTestId('showcase-card-wood-set'));
    fireEvent.focus(screen.getByTestId('showcase-make-wood-set'));
    expect(live()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Clip: A set of wood' }));
    expect(live()).toEqual(['wood-set']);
    const props = mounts.at(-1);
    expect(props?.once).toBe(true);
    act(() => props?.onEnd?.());
    expect(live()).toEqual([]);
    // Turning reduced motion off lets clips play by themselves again.
    env.setReduced(false);
    expect(live()).toEqual(['wood-set']);
    expect(mounts.at(-1)?.once).toBe(false);
  });

  it('with the setting off plays nothing by itself', () => {
    gallery({ playClips: false });
    fireEvent.pointerEnter(screen.getByTestId('showcase-card-second'));
    expect(live()).toEqual([]);
  });

  it('plays nothing while the window is hidden or another view covers the gallery', () => {
    const env = environment();
    const { rerender } = gallery({}, env);
    expect(live()).toEqual(['wood-set']);
    env.setShown(false);
    expect(live()).toEqual([]);
    env.setShown(true);
    expect(live()).toEqual(['wood-set']);
    rerender(
      <ShowcaseGallery
        heading="See what you can make"
        clips={clips}
        examples={examples}
        target={target as NonNullable<typeof target>}
        deps={{ registry: theRegistry(), plugins: builtInPlugins }}
        onMake={() => {}}
        onSeeExample={() => {}}
        environment={env.env}
        webgl
        clipView={FakeClipView}
        codec={codec}
        visible={false}
      />,
    );
    expect(live()).toEqual([]);
  });

  it('without WebGL never mounts a clip and says so on each card', () => {
    gallery({ webgl: false });
    expect(live()).toEqual([]);
    fireEvent.pointerEnter(screen.getByTestId('showcase-card-wood-set'));
    expect(screen.queryByRole('button', { name: 'Clip: A set of wood' })).toBeNull();
    fireEvent.click(screen.getByRole('img', { name: 'Clip: A set of wood' }));
    expect(live()).toEqual([]);
    expect(mounts).toHaveLength(0);
    expect(screen.getAllByText(NO_MOVING_PICTURES)).toHaveLength(3);
    expect(screen.queryByTestId('showcase-pause')).toBeNull();
    // Make this and See the example still work.
    expect(screen.getByTestId('showcase-make-wood-set')).toBeTruthy();
  });

  it('falls back to stills for good when the canvas loses WebGL', () => {
    gallery();
    expect(live()).toEqual(['wood-set']);
    act(() => mounts.at(-1)?.onWebGLUnavailable?.());
    expect(live()).toEqual([]);
    expect(screen.getAllByText(NO_MOVING_PICTURES)).toHaveLength(3);
  });

  it('shows a taken still in place of the drawn one, keyed by target and the jar', async () => {
    gallery({}, environment({ inView: [] }));
    await waitFor(() => expect(screen.getByTestId('showcase-still-second')).toBeTruthy(), {
      timeout: 10_000,
    });
    const drawn = screen.getByTestId('showcase-still-second').getAttribute('src');
    expect(drawn?.startsWith('data:image/png;base64,')).toBe(true);
    act(() => {
      keepStill(stillKey('second', 'other-target', false), 'data:image/png;base64,b3RoZXI=');
      keepStill(stillKey('second', target?.id ?? '', true), 'data:image/png;base64,amFy');
    });
    expect(screen.getByTestId('showcase-still-second').getAttribute('src')).toBe(drawn);
    act(() => {
      keepStill(stillKey('second', target?.id ?? '', false), 'data:image/png;base64,dGFrZW4=');
    });
    expect(screen.getByTestId('showcase-still-second').getAttribute('src')).toBe(
      'data:image/png;base64,dGFrZW4=',
    );
  });

  it('gives the live clip the still key, the still and the jar', () => {
    gallery();
    const props = mounts.at(-1);
    expect(props?.stillKey).toBe(stillKey('wood-set', target?.id ?? '', false));
    expect(props?.vanilla).toBeNull();
    expect(props?.once).toBe(false);
  });
});
