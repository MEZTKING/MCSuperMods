// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Mob Studio "Sounds" section (B217, ADR 0057 D3 and D6): four sound pickers over the
 * kind-aware registry view, the project's own sounds first, and the ambient interval.
 */
import {
  CommandStack,
  commands,
  type Element,
  type Json,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import entitiesPlugin from '@msm/plugin-entities';
import { createRegistryIndex, type RegistryIndex } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useReducer } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  projectRegistryIds,
  soundAwareRegistryIds,
  takesProjectSoundEvents,
} from '../../../../src/renderer/src/session/schema-context';
import { ElementForm } from '../../../../src/renderer/src/studios/ElementForm';
import type { SchemaContextState } from '../../../../src/renderer/src/studios/use-schema-context';
import { element } from '../../fixtures';
import { schemaIndex } from '../../forms/schemas';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;
const KEY = 'demo:gloom.growl';
const VANILLA = {
  sound_event: ['entity.zombie.ambient', 'entity.zombie.hurt'],
  weighed_sound_event: ['entity.zombie.ambient', 'entity.zombie.hurt'],
};

let schema: SchemaContextState;
const registryCalls = vi.fn<(kindId: string | undefined) => void>();

beforeAll(async () => {
  const index = await schemaIndex();
  schema = {
    status: 'ready',
    context: {
      target,
      schemaIndex: index,
      vanillaRegistries: VANILLA,
      registries: (project: Project, kindId?: string): RegistryIndex => {
        registryCalls(kindId);
        const ids = projectRegistryIds(project);
        return createRegistryIndex({
          vanilla: VANILLA,
          project:
            kindId !== undefined && takesProjectSoundEvents(kindId)
              ? soundAwareRegistryIds(ids)
              : ids,
        });
      },
    },
  };
});
afterEach(() => {
  cleanup();
  registryCalls.mockClear();
});

const entityKind: ElementKind = (() => {
  const kind = entitiesPlugin.contributes.elementKinds?.find((entry) => entry.id === 'msm:entity');
  if (kind === undefined) throw new Error('No msm:entity kind.');
  return kind;
})();

const SOUNDS = element('demo:sounds', 'minecraft:sounds', {
  'gloom.growl': { sounds: ['demo:gloom/growl'] },
});

function projectOf(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements: [...elements, SOUNDS], assets: [] }],
  };
}

const MOB: Json = {
  format: 1,
  display_name: 'Gloom',
  category: 'monster',
  size: { width: 0.6, height: 1.8 },
  components: { 'msm:animated_model': { model: 'demo:entity/gloom' } },
};

function StackHarness({ stack, id }: { stack: CommandStack; id: ResourceLocation }) {
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  useEffect(() => stack.subscribe(() => rerender()), [stack]);
  const subject = stack.state.namespaces[0]?.elements.find((entry) => entry.id === id);
  if (subject === undefined) return null;
  return (
    <ElementForm
      project={stack.state}
      element={subject}
      kind={entityKind}
      problems={[]}
      schema={schema}
      onChange={(pointer, value, options) =>
        stack.execute(commands.setElementValue(id, pointer, value, options ?? {}))
      }
      focusPointer={null}
      onFocused={vi.fn()}
    />
  );
}

function renderStack(data: Json) {
  const id = 'demo:gloom' as ResourceLocation;
  const stack = new CommandStack(projectOf(element(id, 'msm:entity', data)));
  render(<StackHarness stack={stack} id={id} />);
  const dataOf = () =>
    stack.state.namespaces[0]?.elements.find((entry) => entry.id === id)?.data as {
      sounds?: Record<string, Json>;
    };
  return { stack, data: dataOf };
}

/** The datalist options offered by an id input. */
function offered(input: HTMLElement): string[] {
  const listId = input.getAttribute('list');
  if (listId === null) return [];
  const list = document.getElementById(listId);
  return [...(list?.querySelectorAll('option') ?? [])].map((option) => option.value);
}

describe('Mob Studio sounds', () => {
  it('shows four sound pickers and the ambient interval, reading the kind-aware view', () => {
    renderStack(MOB);
    expect(registryCalls).toHaveBeenCalledWith('msm:entity');
    for (const key of ['ambient', 'hurt', 'death', 'step']) {
      expect(screen.getByTestId(`entity-sound-${key}`)).toBeTruthy();
    }
    expect(screen.getByTestId('entity-sound-ambient-interval')).toBeTruthy();
  });

  it('lists the project sounds first', () => {
    renderStack(MOB);
    const hurt = screen.getByTestId('entity-sound-hurt');
    expect(offered(hurt)).toEqual([
      KEY,
      'minecraft:entity.zombie.ambient',
      'minecraft:entity.zombie.hurt',
    ]);
  });

  it('writes a picked sound and removes sounds when the last field is cleared', () => {
    const { stack, data } = renderStack(MOB);
    const hurt = screen.getByTestId('entity-sound-hurt');
    fireEvent.change(hurt, { target: { value: KEY } });
    fireEvent.blur(hurt);
    expect(data().sounds).toEqual({ hurt: KEY });

    const interval = screen.getByTestId('entity-sound-ambient-interval');
    fireEvent.change(interval, { target: { value: '120' } });
    expect(data().sounds).toEqual({ hurt: KEY, ambient_interval_ticks: 120 });
    fireEvent.change(interval, { target: { value: '' } });
    expect(data().sounds).toEqual({ hurt: KEY });

    fireEvent.change(hurt, { target: { value: '' } });
    fireEvent.blur(hurt);
    expect(data().sounds).toBeUndefined();
    stack.undo();
    expect(data().sounds).toEqual({ hurt: KEY });
  });
});
