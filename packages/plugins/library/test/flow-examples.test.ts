/**
 * An example for every flow (ADR 0129 D2): every starter and Creator flow but the blank project
 * names an example in `FLOW_EXAMPLE_IDS`, the example is in the gallery and is offered on every
 * target its flow is, and each flow example is made by the flow it names.
 */
import type { ContentBundle, ExampleProject } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  FLOW_EXAMPLE_IDS,
  FLOW_EXAMPLE_PREFIX,
  flowExamples,
  libraryExamples,
  libraryStarters,
  STARTERS_WITHOUT_EXAMPLE,
} from '../src/index';

const TARGETS = builtInTargets.map((bundle) => bundle.target);
const examplesById = new Map(libraryExamples.map((example) => [example.id, example]));

describe('an example for every flow', () => {
  it('names an example for every starter and Creator flow but the blank project', () => {
    const missing = libraryStarters
      .filter((starter) => !STARTERS_WITHOUT_EXAMPLE.includes(starter.id))
      .filter((starter) => FLOW_EXAMPLE_IDS[starter.id] === undefined)
      .map((starter) => starter.id);
    expect(missing, 'starters and flows with no example').toEqual([]);
    expect(STARTERS_WITHOUT_EXAMPLE).toEqual(['blank']);
    const starterIds = new Set(libraryStarters.map((starter) => starter.id));
    for (const id of Object.keys(FLOW_EXAMPLE_IDS)) expect(starterIds.has(id), id).toBe(true);
    expect(libraryStarters.filter((starter) => starter.creator !== undefined)).toHaveLength(70);
  });

  it('names examples that are in the gallery and offered wherever their flow is', () => {
    for (const [flowId, exampleId] of Object.entries(FLOW_EXAMPLE_IDS)) {
      const example = examplesById.get(exampleId);
      expect(example, `${flowId}: ${exampleId}`).toBeDefined();
      const starter = libraryStarters.find((entry) => entry.id === flowId);
      for (const target of TARGETS) {
        if (starter?.supports?.(target) === false) continue;
        expect(example?.supports?.(target) ?? true, `${exampleId} on ${target.id}`).toBe(true);
      }
    }
  });

  it('shows each flow example on one flow card, made by that flow', () => {
    const shown = new Map<string, string>();
    for (const [flowId, exampleId] of Object.entries(FLOW_EXAMPLE_IDS)) {
      if (exampleId.startsWith(FLOW_EXAMPLE_PREFIX)) shown.set(exampleId, flowId);
    }
    expect([...shown.keys()].sort()).toEqual(flowExamples.map((example) => example.id).sort());
    for (const example of flowExamples) {
      const starter = libraryStarters.find((entry) => entry.id === shown.get(example.id));
      expect(example.description, example.id).toMatch(
        new RegExp(
          ` Made with the ${starter?.title} ${starter?.creator === undefined ? 'starter' : 'flow'}\\.$`,
        ),
      );
      expect(example.tags, example.id).toContain('flow');
    }
  });

  it('builds every flow example on every target it supports, with pictures and no pack or mod', async () => {
    for (const example of flowExamples) {
      for (const target of TARGETS) {
        if (example.supports?.(target) === false) continue;
        const bundle = (await (example as ExampleProject).build({
          namespace: 'demo',
          projectName: 'Demo',
          target,
          values: {},
        })) as ContentBundle;
        const kinds = bundle.elements.map((entry) => entry.kind);
        expect(kinds, example.id).not.toContain('minecraft:pack_mcmeta');
        expect(kinds, example.id).not.toContain('msm:mod');
        expect(kinds, example.id).toContain(example.kind);
        expect(bundle.elements.length, example.id).toBeGreaterThan(0);
      }
    }
  });
});
