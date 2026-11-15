/**
 * The plain-language problems table (ADR 0083 D5): every code the Creator flows, Rules and the
 * Very easy Studios can raise has plain words, read from the plugins' own code lists; the
 * words name the thing by its display name and never show an id or a pointer; the fallback and
 * the one-step fixes.
 */

import type { Element, Problem, Project } from '@msm/core';
import { ExportProblemCodes } from '@msm/exporters';
import {
  BLOCK_TYPE_PROBLEM_CODES,
  BLOCKS_ITEMS_PROBLEM_CODES,
  CONTAINER_PROBLEM_CODES,
  INVENTORY_PROBLEM_CODES,
  PARTICLE_PROBLEM_CODES,
  PORTAL_PROBLEM_CODES,
  WEATHERING_PROBLEM_CODES,
} from '@msm/plugin-blocks-items';
import { CONTROLS_PROBLEM_CODES } from '@msm/plugin-controls';
import { ENTITIES_PROBLEM_CODES, VEHICLE_PROBLEM_CODES } from '@msm/plugin-entities';
import { RULES_PROBLEM_CODES } from '@msm/plugin-rules';
import { describe, expect, it } from 'vitest';
import {
  missingPictureOf,
  PLAIN_FIX_LABELS,
  PLAIN_PROBLEMS,
  plainProblem,
  plainProblemWords,
  problemThingName,
  removeAtPointer,
  stepPointerOf,
} from '../src/renderer/src/session/plain-problems';
import {
  CONTROLS_NEEDS_JAR_CODE,
  PARTICLE_TEXTURE_MISSING_CODE,
  VEHICLES_NEEDS_JAR_CODE,
} from '../src/renderer/src/session/project-session';
import { RulesSessionProblemCodes } from '../src/renderer/src/session/rules-view';

/** The codes a beginner can meet in Very easy, from the plugins' and the session's lists. */
const BEGINNER_CODES: readonly string[] = [
  ...RULES_PROBLEM_CODES,
  ...Object.values(RulesSessionProblemCodes),
  ...BLOCKS_ITEMS_PROBLEM_CODES,
  ...BLOCK_TYPE_PROBLEM_CODES,
  ...PORTAL_PROBLEM_CODES,
  ...PARTICLE_PROBLEM_CODES,
  ...CONTAINER_PROBLEM_CODES,
  ...WEATHERING_PROBLEM_CODES,
  ...INVENTORY_PROBLEM_CODES,
  ...ENTITIES_PROBLEM_CODES,
  ...VEHICLE_PROBLEM_CODES,
  ...CONTROLS_PROBLEM_CODES,
  CONTROLS_NEEDS_JAR_CODE,
  VEHICLES_NEEDS_JAR_CODE,
  ExportProblemCodes.notInEject,
  PARTICLE_TEXTURE_MISSING_CODE,
  // What blocks Play and Share my mod.
  ExportProblemCodes.noFabricTarget,
  ExportProblemCodes.runtimeMissing,
  ExportProblemCodes.geckolibMissing,
  ExportProblemCodes.noGeckolibTarget,
];

const element = (id: string, kind: string, data: Element['data']): Element =>
  ({ id, kind, data, meta: {} }) as unknown as Element;

const project = (elements: Element[]): Project =>
  ({
    name: 'Ruby',
    namespaces: [{ name: 'ruby', elements, assets: [] }],
  }) as unknown as Project;

const problem = (code: string, extra: Partial<Problem> = {}): Problem => ({
  severity: 'error',
  code,
  message: `The original message of ${code}.`,
  ...extra,
});

describe('plain-language problems', () => {
  it('has plain words for every code a beginner can meet (from the plugins’ code lists)', () => {
    expect(BEGINNER_CODES.length).toBeGreaterThan(100);
    const missing = BEGINNER_CODES.filter((code) => PLAIN_PROBLEMS[code] === undefined);
    expect(missing).toEqual([]);
  });

  it('names the thing and shows no ids, pointers or code words', () => {
    for (const [code, entry] of Object.entries(PLAIN_PROBLEMS)) {
      const text = entry.words('Ruby Lamp');
      expect(text, code).not.toMatch(/[a-z0-9_]+:[a-z0-9_/]+/);
      expect(text, code).not.toMatch(/\/[a-z]+\/\d/);
      expect(text, code).not.toMatch(/\b(tick|ticks|json|element|texture|entity)\b/i);
      expect(text, code).toMatch(/[.!]$/);
    }
  });

  it('uses the display name of the thing and falls back for unknown codes', () => {
    const lamp = element('ruby:ruby_lamp', 'msm:block', { display_name: 'Ruby Lamp' });
    const egg = element('ruby:spark', 'msm:entity', {});
    const current = project([lamp, egg]);
    const missingModel = problem('blocks-items.missing-model', { elementId: lamp.id });
    expect(problemThingName(current, missingModel)).toBe('Ruby Lamp');
    expect(plainProblem(missingModel, 'Ruby Lamp')).toEqual({
      text: 'Ruby Lamp has no shape picture (model) to show. Pick a picture for it.',
      known: true,
    });
    expect(problemThingName(current, problem('x', { elementId: egg.id }))).toBe('Spark');
    expect(problemThingName(current, problem('x'))).toBe('your mod');
    expect(plainProblem(problem('scripting.something'), 'Spark')).toEqual({
      text: 'Something in Spark needs fixing.',
      known: false,
    });
  });

  it('gives the Rule cards words only for known codes', () => {
    const words = plainProblemWords(project([]));
    expect(words(problem('rules.too-many-steps', { elementId: 'ruby:rules' }))).toBe(
      'A rule in Rules has more than 50 steps. Split it in two.',
    );
    expect(words(problem('rules.something-new'))).toBeUndefined();
  });

  it('offers "Remove this step" on a broken rule step and removes exactly it', () => {
    const fixed = plainProblem(problem('rules.unknown-step'), 'Rules');
    expect(fixed.fix).toBe('remove-step');
    expect(PLAIN_FIX_LABELS['remove-step']).toBe('Remove this step');
    expect(stepPointerOf('/rules/1/do/2/else/0/amount')).toBe('/rules/1/do/2/else/0');
    expect(stepPointerOf('/rules/1/when')).toBeNull();
    expect(stepPointerOf(undefined)).toBeNull();
    const book = { format: 1, rules: [{ key: 'a', do: [{ step: 'x' }, { step: 'y' }] }] };
    expect(removeAtPointer(book, '/rules/0/do/0')).toEqual({
      format: 1,
      rules: [{ key: 'a', do: [{ step: 'y' }] }],
    });
    expect(book.rules[0]?.do).toHaveLength(2);
    expect(removeAtPointer(book, '/rules/0/do/5')).toBeNull();
    expect(removeAtPointer(book, '/rules/0/key')).toBeNull();
  });

  it('offers "Paint the picture" for a missing mob picture at the right asset path', () => {
    const mob = element('ruby:spark', 'msm:entity', {
      components: { 'msm:animated_model': { texture: 'ruby:entity/spark' } },
    });
    const missing = problem('entities.missing-texture', {
      elementId: mob.id,
      path: '/components/msm:animated_model/texture',
    });
    expect(plainProblem(missing, 'Spark').fix).toBe('paint-picture');
    expect(missingPictureOf(project([mob]), missing)).toEqual({
      namespace: 'ruby',
      path: 'textures/entity/spark.png',
    });
    expect(
      missingPictureOf(project([mob]), { ...missing, path: '/components/msm:animated_model' }),
    ).toEqual({ namespace: 'ruby', path: 'textures/entity/spark.png' });
    expect(missingPictureOf(project([mob]), { ...missing, path: '/nothing' })).toBeNull();
  });
});
