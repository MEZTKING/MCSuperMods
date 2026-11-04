// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimationFrame } from '../../../src/renderer/src/preview/animation';
import { FrameScrubber } from '../../../src/renderer/src/preview/FrameScrubber';

const frames: AnimationFrame[] = [
  { index: 2, time: 2 },
  { index: 0, time: 5 },
  { index: 1, time: 1 },
];

function Harness(props: { onStep?: (step: number) => void }) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  return (
    <FrameScrubber
      textureId="demo:block/glow"
      frames={frames}
      step={step}
      playing={playing}
      onStepChange={(next) => {
        props.onStep?.(next);
        setStep(next);
      }}
      onPlayingChange={setPlaying}
    />
  );
}

const label = (): string => screen.getByTestId('preview-frame-label').textContent ?? '';

describe('FrameScrubber', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('labels the current frame with its strip index and time', () => {
    render(<Harness />);
    expect(label()).toBe('demo:block/glow: frame 1 of 3 (strip index 2, 2 ticks)');
    expect(screen.getByRole('group', { name: 'Animation of demo:block/glow' })).toBeTruthy();
  });

  it('steps with the previous and next buttons, wrapping around', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('preview-frame-previous'));
    expect(label()).toContain('frame 3 of 3 (strip index 1, 1 tick)');
    fireEvent.click(screen.getByTestId('preview-frame-next'));
    fireEvent.click(screen.getByTestId('preview-frame-next'));
    expect(label()).toContain('frame 2 of 3');
  });

  it('plays at each frame time × 50 ms and pauses', () => {
    const onStep = vi.fn();
    render(<Harness onStep={onStep} />);
    const play = screen.getByTestId('preview-frame-play');
    fireEvent.click(play);
    expect(play.getAttribute('aria-pressed')).toBe('true');
    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(onStep).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onStep).toHaveBeenLastCalledWith(1);
    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(onStep).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onStep).toHaveBeenLastCalledWith(2);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(onStep).toHaveBeenLastCalledWith(0);
    fireEvent.click(play);
    expect(play.getAttribute('aria-label')).toBe('Play animation');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onStep).toHaveBeenCalledTimes(3);
  });

  it('jumps with the slider and stops playing', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('preview-frame-play'));
    fireEvent.change(screen.getByTestId('preview-frame-slider'), { target: { value: '2' } });
    expect(label()).toContain('frame 3 of 3');
    expect(screen.getByTestId('preview-frame-play').getAttribute('aria-pressed')).toBe('false');
  });

  it('disables play for a single frame', () => {
    render(
      <FrameScrubber
        textureId="demo:block/one"
        frames={[{ index: 0, time: 1 }]}
        step={0}
        playing={false}
        onStepChange={vi.fn()}
        onPlayingChange={vi.fn()}
      />,
    );
    expect((screen.getByTestId('preview-frame-play') as HTMLButtonElement).disabled).toBe(true);
  });
});
