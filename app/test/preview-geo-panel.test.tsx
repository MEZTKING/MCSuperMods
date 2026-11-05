// @vitest-environment happy-dom
import type { Element, Project } from '@msm/plugin-api';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationTransport } from '../src/renderer/src/preview/geo/AnimationTransport';
import { parseAnimations } from '../src/renderer/src/preview/geo/keyframes';
import { isPreviewKind, PreviewPanel } from '../src/renderer/src/preview/PreviewPanel';

afterEach(cleanup);

const folders = {
  blockstates: 'blockstates',
  items: 'items',
  models: 'models',
  textures: 'textures',
} as unknown as Parameters<typeof PreviewPanel>[0]['folders'];

const model = {
  id: 'demo:entity/golem',
  kind: 'msm:geo_model',
  data: { format_version: '1.12.0', 'minecraft:geometry': [{ description: {}, bones: [] }] },
} as unknown as Element;

const project = {
  namespaces: [{ name: 'demo', elements: [model], assets: [] }],
} as unknown as Project;

const entity = (modelId: string) =>
  ({
    id: 'demo:golem',
    kind: 'msm:entity',
    data: { components: { 'msm:animated_model': { model: modelId, texture: '' } } },
  }) as unknown as Element;

function renderPanel(element: Element, previewKind: string) {
  return render(
    <PreviewPanel
      project={project}
      element={element}
      previewKind={previewKind}
      folders={folders}
      readProjectAsset={async () => null}
      vanilla={null}
      onSetup={vi.fn()}
      webgl={false}
    />,
  );
}

describe('PreviewPanel geo subjects', () => {
  it('accepts the geo preview kinds', () => {
    expect(['geo_model', 'animation', 'entity'].every(isPreviewKind)).toBe(true);
  });

  it('shows the message for an entity whose model is missing, without the vanilla banner', () => {
    renderPanel(entity('demo:entity/nothing'), 'entity');
    expect(screen.getByTestId('preview-geo-message').textContent).toBe(
      'Geo model demo:entity/nothing is not in the project.',
    );
    expect(screen.queryByText(/Vanilla assets not found/)).toBeNull();
    expect(screen.queryByText(/WebGL is disabled/)).toBeNull();
  });

  it('shows the WebGL message for a resolvable geo model when WebGL is disabled', () => {
    renderPanel(model, 'geo_model');
    expect(screen.getByText('Preview unavailable: WebGL is disabled.')).toBeTruthy();
    renderPanel(entity('demo:entity/golem'), 'entity');
    expect(screen.getAllByText('Preview unavailable: WebGL is disabled.')).toHaveLength(2);
  });
});

describe('AnimationTransport', () => {
  const animations = parseAnimations({
    animations: {
      idle: { loop: true, animation_length: 2, bones: {} },
      attack: { animation_length: 0.5, bones: {} },
    },
  });

  it('picks, plays and scrubs', () => {
    const onSelect = vi.fn();
    const onPlayingChange = vi.fn();
    const onScrub = vi.fn();
    render(
      <AnimationTransport
        animations={animations}
        selected="idle"
        current={animations[0]}
        elapsed={3}
        playing={false}
        onSelect={onSelect}
        onPlayingChange={onPlayingChange}
        onScrub={onScrub}
      />,
    );
    expect(screen.getByTestId('preview-geo-time').textContent).toBe(
      'idle: 1.00 s of 2.00 s (loops)',
    );
    const picker = screen.getByLabelText('Animation') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toEqual([
      'No animation (rest pose)',
      'idle',
      'attack',
    ]);
    fireEvent.change(picker, { target: { value: 'attack' } });
    expect(onSelect).toHaveBeenCalledWith('attack');
    fireEvent.change(picker, { target: { value: '' } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Play animation' }));
    expect(onPlayingChange).toHaveBeenCalledWith(true);
    fireEvent.change(screen.getByLabelText('Animation time'), { target: { value: '0.5' } });
    expect(onScrub).toHaveBeenCalledWith(0.5);
  });

  it('shows the rest pose and disables playback without an animation', () => {
    render(
      <AnimationTransport
        animations={animations}
        selected={null}
        current={undefined}
        elapsed={0}
        playing={false}
        onSelect={vi.fn()}
        onPlayingChange={vi.fn()}
        onScrub={vi.fn()}
      />,
    );
    expect(screen.getByTestId('preview-geo-time').textContent).toBe('Rest pose');
    expect((screen.getByTestId('preview-geo-play') as HTMLButtonElement).disabled).toBe(true);
  });
});
