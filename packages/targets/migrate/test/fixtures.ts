/**
 * An invented version step for the engine's tests: `mc-98.0` to `mc-99.0`, with made-up
 * registries, formats and blocks (no real Minecraft version is named here).
 */
import type { Element, Json, Project, Target, TargetChangeSet } from '@msm/plugin-api';
import type { CuratedChangeSet } from '../src/index';

export const FROM = 'mc-98.0';
export const TO = 'mc-99.0';
export const VERSION = '99.0-test-1';

/** A stand-in target: only `id` matters to a hook. */
export function targetWithId(id: string): Target {
  return { id } as Target;
}

export function element(id: string, kind: string, data: Json): Element {
  return {
    formatVersion: 1,
    id: id as Element['id'],
    kind,
    data,
    meta: { createdAt: '2026-11-25T00:00:00.000Z' },
  } as Element;
}

export function project(elements: Element[], targets: string[] = [FROM]): Project {
  return {
    formatVersion: 1,
    name: 'Test',
    namespaces: [{ name: 'test', elements, assets: [] }],
    targets,
    plugins: [],
    settings: {},
  };
}

/** The generated half of the invented step. */
export const generated: TargetChangeSet = {
  from: FROM,
  to: TO,
  refs: { from: { mcdoc: 'a', mcmeta: '98.0' }, to: { mcdoc: 'b', mcmeta: '99.0' } },
  additions: { 'ids:gadget_type': 2 },
  changes: [
    {
      id: 'block-states:lamp#glow',
      area: 'block-states',
      what: 'property-removed',
      subject: 'lamp',
      field: 'glow',
      handling: 'manual',
      source: 'blocks',
    },
    {
      id: 'formats:minecraft:resource/gizmo#/colour',
      area: 'formats',
      what: 'field-removed',
      registry: 'minecraft:resource',
      subject: 'minecraft:resource/gizmo',
      field: '/colour',
      handling: 'manual',
      source: 'mcdoc',
    },
    {
      id: 'formats:minecraft:resource/gizmo#/size',
      area: 'formats',
      what: 'field-addedRequired',
      registry: 'minecraft:resource',
      subject: 'minecraft:resource/gizmo',
      field: '/size',
      handling: 'manual',
      source: 'mcdoc',
    },
    {
      id: 'formats:minecraft:resource/gizmo#/speed',
      area: 'formats',
      what: 'field-removed',
      registry: 'minecraft:resource',
      subject: 'minecraft:resource/gizmo',
      field: '/speed',
      handling: 'manual',
      source: 'mcdoc',
      candidate: { kind: 'field-move', to: '/motion/speed', name: 1, shape: 'same' },
    },
    {
      id: 'ids:gadget_type/old_cog',
      area: 'ids',
      what: 'member-removed',
      registry: 'gadget_type',
      subject: 'gadget_type/old_cog',
      from: 'old_cog',
      handling: 'manual',
      source: 'registries',
      candidate: { kind: 'rename', to: 'new_cog', name: 0.5, shape: 'same' },
    },
    {
      id: 'ids:gadget_type/spring',
      area: 'ids',
      what: 'member-removed',
      registry: 'gadget_type',
      subject: 'gadget_type/spring',
      from: 'spring',
      stillIn: ['gadget'],
      handling: 'manual',
      source: 'registries',
      candidate: { kind: 'rename', to: 'coil', name: 0.2, shape: 'superset' },
    },
    {
      id: 'ids:sound_event/old_beep',
      area: 'ids',
      what: 'member-removed',
      registry: 'sound_event',
      subject: 'sound_event/old_beep',
      from: 'old_beep',
      handling: 'manual',
      source: 'registries',
    },
    {
      id: 'ids:tag/gadget/shiny',
      area: 'ids',
      what: 'member-removed',
      registry: 'tag/gadget',
      subject: 'tag/gadget/shiny',
      from: 'shiny',
      handling: 'manual',
      source: 'registries',
    },
    {
      id: 'ids:widget_test',
      area: 'ids',
      what: 'registry-moved',
      subject: 'widget_test',
      from: 'widget_test',
      to: 'widget_test_type',
      handling: 'none',
      source: 'registries',
    },
  ],
};

/** The curated half of the invented step. */
export const curated: CuratedChangeSet = {
  from: FROM,
  to: TO,
  changes: [
    {
      id: 'formats:minecraft:resource/gizmo#/colour',
      handling: 'auto',
      sentence: 'Gizmos have no colour any more.',
      inGameCheck: 'Look at each gizmo.',
      steps: [
        {
          op: 'drop',
          places: [
            { kind: 'test:gizmo', at: '' },
            { kind: 'test:machine', at: '/parts/*/gizmo' },
          ],
          field: 'colour',
          because: 'which gizmos no longer have',
        },
      ],
    },
    {
      id: 'formats:minecraft:resource/gizmo#/speed',
      handling: 'auto',
      steps: [
        {
          op: 'move',
          places: [{ kind: 'test:gizmo', at: '' }],
          from: '/speed',
          to: '/motion/speed',
        },
      ],
    },
    {
      id: 'formats:minecraft:resource/gizmo#/size',
      handling: 'auto',
      steps: [{ op: 'set', places: [{ kind: 'test:gizmo', at: '' }], field: 'size', value: 1 }],
    },
    {
      id: 'block-states:lamp#glow',
      handling: 'auto',
      steps: [
        {
          op: 'block-state',
          block: 'lamp',
          property: 'glow',
          renameTo: 'lit',
          values: { yes: 'true', no: 'false' },
        },
      ],
    },
    {
      id: 'ids:gadget_type/old_cog',
      rename: { to: 'new_cog', shape: 'same', dispatcher: 'minecraft:gadget_config' },
      sentence: 'The old cog is now the new cog.',
      inGameCheck: 'Turn each cog.',
    },
    {
      id: 'ids:gadget_type/spring',
      rename: { to: 'coil', shape: 'superset', dispatcher: 'minecraft:gadget_config' },
      hint: 'use minecraft:coil and give it a length',
    },
    {
      id: 'players:loader',
      change: { area: 'players', what: 'value-changed', subject: 'loader', from: '1', to: '2' },
      sentence: 'Players need the newer loader.',
    },
  ],
};
