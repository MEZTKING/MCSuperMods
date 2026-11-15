// @vitest-environment happy-dom
/**
 * "Show a HUD element", "Hide a HUD element", "Set a HUD element's value" and "Explode" in the
 * Events editor (B420a, ADR 0089 D6, ADR 0090 D6): each is listed by its plain label, creates
 * data the schema accepts on both targets, offers the project's HUD elements in a picker, and
 * the session warns about a HUD picture the project does not have (`controls.hud-picture-missing`).
 */
import type { Element, Json, ResourceLocation } from '@msm/core';
import { createSchemaIndex, MSM_SCHEMA_REFS, validateJson } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { parsePointer } from '../../../../src/renderer/src/forms/pointer';
import {
  HUD_PICTURE_MISSING_CODE,
  hudPictureProblems,
} from '../../../../src/renderer/src/session/hud-pictures';
import { PLAIN_PROBLEMS } from '../../../../src/renderer/src/session/plain-problems';
import {
  ACTIONS,
  ENTITY_ACTIONS,
  newAction,
} from '../../../../src/renderer/src/studios/blocks-items/blocks-items-model';
import {
  actionTypeLabel,
  EventsEditor,
} from '../../../../src/renderer/src/studios/blocks-items/EventsEditor';
import { projectHudIds } from '../../../../src/renderer/src/studios/controls/controls-model';
import { element } from '../../fixtures';
import { projectOf } from './harness';

afterEach(cleanup);

const NEW_TYPES = ['explode', 'show_hud', 'hide_hud', 'set_hud'] as const;
const LABELS: Record<string, string> = {
  explode: 'Explode',
  show_hud: 'Show a HUD element',
  hide_hud: 'Hide a HUD element',
  set_hud: "Set a HUD element's value",
};

const hud = (id: string, data: Record<string, Json> = {}): Element =>
  element(id as ResourceLocation, 'msm:hud', {
    format: 1,
    type: 'bar',
    value: { source: 'set' },
    ...data,
  });

describe('new actions in the table', () => {
  it('are listed for blocks, items and entities by plain labels', () => {
    for (const type of NEW_TYPES) {
      const spec = ACTIONS.find((entry) => entry.type === type);
      expect(spec, type).toBeDefined();
      expect(actionTypeLabel(spec as (typeof ACTIONS)[number])).toBe(`${LABELS[type]} (${type})`);
      expect(ENTITY_ACTIONS.some((entry) => entry.type === type)).toBe(true);
    }
  });

  it.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    'create valid data on %s',
    (_id, bundle) => {
      const index = createSchemaIndex(
        { ref: 'empty', mcdoc: {}, dispatchers: {} },
        { mcVersion: bundle.target.mcVersion },
      );
      const node = index.resolveSchemaRef(MSM_SCHEMA_REFS.blockDefinition);
      for (const type of NEW_TYPES) {
        const action = newAction(type, [], undefined, ['demo:fuel']);
        const data = {
          format: 1,
          sound_type: 'stone',
          events: { on_use: { actions: [action] } },
        };
        expect(validateJson(data, node), type).toEqual([]);
      }
    },
  );

  it('start a HUD action on the first HUD element, and Explode like a TNT', () => {
    expect(newAction('show_hud', [], undefined, ['demo:a', 'demo:b'])).toEqual({
      type: 'show_hud',
      hud: 'demo:a',
    });
    expect(newAction('set_hud', [])).toEqual({ type: 'set_hud', hud: '', value: 0 });
    expect(newAction('explode', [])).toEqual({ type: 'explode', power: 4 });
  });
});

let latest: Json = null;

/** `value` with `next` written at `pointer` (objects and arrays; `undefined` removes). */
function setAtPointer(value: Json, pointer: string, next: Json | undefined): Json {
  const tokens = parsePointer(pointer);
  if (tokens.length === 0) return next ?? null;
  const write = (current: Json | undefined, at: number): Json => {
    const token = tokens[at] as string;
    const last = at === tokens.length - 1;
    if (Array.isArray(current)) {
      const copy = [...current];
      const index = Number(token);
      if (last) {
        if (next === undefined) copy.splice(index, 1);
        else copy[index] = next;
      } else copy[index] = write(copy[index], at + 1);
      return copy;
    }
    const object = { ...((current ?? {}) as Record<string, Json>) };
    if (last) {
      if (next === undefined) delete object[token];
      else object[token] = next;
    } else object[token] = write(object[token], at + 1);
    return object;
  };
  return write(value, 0);
}

function Harness(props: { actions: Json[]; huds?: string[] }) {
  const [data, setData] = useState<Json>({ events: { on_use: { actions: props.actions } } });
  latest = data;
  return (
    <EventsEditor
      element={element('demo:wand' as ResourceLocation, 'msm:item', data)}
      problems={[]}
      suggest={() => []}
      huds={props.huds}
      onChange={(pointer, value) =>
        setData((current) => {
          const next = setAtPointer(current, pointer, value);
          latest = next;
          return next;
        })
      }
    />
  );
}

describe('HUD picker in the Events editor', () => {
  it('offers the project HUD elements, sorted', () => {
    const project = projectOf(hud('demo:fuel'), hud('demo:ammo'));
    expect(projectHudIds(project)).toEqual(['demo:ammo', 'demo:fuel']);
    expect(projectHudIds(null)).toEqual([]);
  });

  it('picks the element of a show_hud action from a list', () => {
    render(<Harness actions={[{ type: 'show_hud', hud: '' }]} huds={['demo:ammo', 'demo:fuel']} />);
    const select = screen.getByLabelText(/hud element/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'demo:fuel' } });
    expect(latest).toEqual({
      events: { on_use: { actions: [{ type: 'show_hud', hud: 'demo:fuel' }] } },
    });
  });

  it('says so when the project has no HUD element', () => {
    render(<Harness actions={[{ type: 'hide_hud', hud: '' }]} huds={[]} />);
    expect(screen.getByText(/No HUD elements yet/)).toBeTruthy();
  });
});

describe('controls.hud-picture-missing', () => {
  const bundle = builtInTargets[0] as (typeof builtInTargets)[number];

  it('warns once for each project picture a HUD element names that is not there', () => {
    const project = projectOf(
      hud('demo:mana', { sprite: 'demo:hud/mana', back_sprite: 'minecraft:hud/x' }),
      hud('demo:other', { type: 'icons', icon: 'demo:hud/heart' }),
    );
    const problems = hudPictureProblems(project, bundle.target);
    expect(problems.map((p) => [p.elementId, p.path, p.severity, p.code])).toEqual([
      ['demo:mana', '/sprite', 'warning', HUD_PICTURE_MISSING_CODE],
      ['demo:other', '/icon', 'warning', HUD_PICTURE_MISSING_CODE],
    ]);
    const folder = bundle.target.folders.resource.textures;
    project.namespaces[0]?.assets.push({
      path: `${folder}/gui/sprites/hud/mana.png`,
      mediaType: 'image/png',
    } as never);
    expect(hudPictureProblems(project, bundle.target).map((p) => p.path)).toEqual(['/icon']);
    expect(hudPictureProblems(project, undefined)).toEqual([]);
  });

  it('has plain words', () => {
    expect(PLAIN_PROBLEMS[HUD_PICTURE_MISSING_CODE]?.words('Mana bar')).toContain('Mana bar');
  });
});
