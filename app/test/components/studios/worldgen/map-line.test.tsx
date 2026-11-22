// @vitest-environment happy-dom
/**
 * The worldgen Studios' map line (B587): See it on the map opens the live map of a world that
 * uses the element, Walk in it opens Try it with its ground picker on My world generation on
 * that world (or on the first world that names the element), keeping the project's view.
 */
import type { Element, Project, Target } from '@msm/plugin-api';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '../../../../src/renderer/src/store/ui-store';
import { MapLine, worldNaming } from '../../../../src/renderer/src/studios/worldgen/MapLine';
import { useTerrainView } from '../../../../src/renderer/src/terrain/view-store';
import { viewKeyOf, walkIn } from '../../../../src/renderer/src/terrain/walk-in';
import { useTryItStore } from '../../../../src/renderer/src/tryit/tryit-store';

const shown: Record<string, unknown>[] = [];

vi.mock('../../../../src/renderer/src/terrain/LiveMap', async () => {
  const { useEffect } = await import('react');
  return {
    default: (props: Record<string, unknown> & { onHost?(key: string | null): void }) => {
      shown.push(props);
      const { onHost } = props;
      useEffect(() => onHost?.('dimension:demo:other'), [onHost]);
      return <div data-testid="studio-map-stub">{String(props.mode)}</div>;
    },
  };
});

function element(id: string, kind: string, data: unknown): Element {
  return { id, kind, data, formatVersion: 1, meta: { createdAt: '' } } as Element;
}

const MOOR = element('demo:moor', 'minecraft:worldgen/biome', {});
const WORLD = element('demo:world', 'minecraft:dimension', {
  type: 'minecraft:overworld',
  generator: { type: 'minecraft:noise', biome_source: { type: 'minecraft:fixed', biome: 'x' } },
});
const PRESET = element('demo:isles', 'minecraft:worldgen/world_preset', {
  dimensions: {
    'minecraft:overworld': {
      type: 'minecraft:overworld',
      generator: {
        type: 'minecraft:noise',
        settings: 'demo:isles/terrain',
        biome_source: { type: 'minecraft:fixed', biome: 'demo:moor' },
      },
    },
  },
});

function project(elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    namespaces: [{ name: 'demo', elements, assets: [] }],
    plugins: [],
    settings: {},
    targets: ['mc-26.3'],
  } as unknown as Project;
}

const TARGET = { id: 'mc-26.3' } as unknown as Target;

beforeEach(() => {
  shown.length = 0;
  useTryItStore.getState().reset();
  useTerrainView.getState().reset();
  useUiStore.setState({ snapshot: null, selectedId: null });
});
afterEach(cleanup);

describe('worldNaming', () => {
  it('finds a dimension or a world preset dimension that names the element', () => {
    expect(worldNaming(project([MOOR, PRESET]), 'demo:moor')).toBe(
      'preset:demo:isles:minecraft:overworld',
    );
    expect(worldNaming(project([PRESET]), 'demo:isles/terrain')).toBe(
      'preset:demo:isles:minecraft:overworld',
    );
    const own = element('demo:own', 'minecraft:dimension', { type: 'demo:moon_type' });
    expect(worldNaming(project([PRESET, own]), 'demo:moon_type')).toBe('dimension:demo:own');
    expect(worldNaming(project([WORLD]), 'demo:moor')).toBeNull();
  });
});

describe('walkIn', () => {
  it('leaves the element, keeps the view and asks Try it for the generated ground', () => {
    useUiStore.setState({ selectedId: 'demo:moor' as never });
    const p = project([MOOR, PRESET]);
    walkIn('/projects/demo', p, 'preset:demo:isles:minecraft:overworld');
    expect(useUiStore.getState().selectedId).toBeNull();
    const tryIt = useTryItStore.getState();
    expect(tryIt.open).toBe(true);
    expect(tryIt.groundRequest).toEqual({
      kind: 'generated',
      sourceKey: 'preset:demo:isles:minecraft:overworld',
    });
    expect(useTerrainView.getState().views.get('/projects/demo')?.seed).toBeTypeOf('string');
    tryIt.clearGroundRequest();
    expect(useTryItStore.getState().groundRequest).toBeNull();
    expect(viewKeyOf(null, p)).toBe('unsaved:Demo');
  });
});

describe('MapLine', () => {
  it('opens the live map and walks in the world it shows', async () => {
    const p = project([MOOR, PRESET]);
    render(
      <MapLine project={p} target={TARGET} element={MOOR} mode="element" words="Where it lies." />,
    );
    expect(screen.queryByTestId('studio-map-stub')).toBeNull();
    // Closed: Walk in it goes to the first world that names the biome.
    fireEvent.click(screen.getByTestId('studio-walk-in-it'));
    expect(useTryItStore.getState().groundRequest?.sourceKey).toBe(
      'preset:demo:isles:minecraft:overworld',
    );
    useTryItStore.getState().reset();
    fireEvent.click(screen.getByTestId('studio-see-map'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(await screen.findByTestId('studio-map-stub')).toBeTruthy();
    expect(screen.getByTestId('studio-see-map').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('studio-see-map').textContent).toBe('Hide the map');
    const props = shown.at(-1) as Record<string, unknown>;
    expect(props.owner).toBe('studio');
    expect(props.element).toBe(MOOR);
    expect(props.mode).toBe('element');
    // Open: Walk in it goes to the world the map shows.
    fireEvent.click(screen.getByTestId('studio-walk-in-it'));
    expect(useTryItStore.getState().groundRequest?.sourceKey).toBe('dimension:demo:other');
  });
});
