import type { StarterParameter, TargetFacts } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { builtInTargets, targetFacts } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  defaultRawValues,
  derivedId,
  hasParameters,
  pickTargetId,
  showsIdPreview,
  stepErrors,
  targetLabel,
  targetsFor,
  toValues,
  UNGROUPED_STEP_TITLE,
  validateParameter,
  wizardSteps,
} from '../../src/renderer/src/components/wizard/wizard-model';

const PARAMETERS: StarterParameter[] = [
  {
    id: 'gem_name',
    label: 'Name',
    group: 'A',
    type: 'string',
    default: 'Ruby',
    pattern: '[A-Z][a-z]*',
    maxLength: 8,
  },
  { id: 'loose', label: 'Loose', type: 'boolean', default: false },
  { id: 'count', label: 'Count', group: 'B', type: 'number', default: 2, min: 1, max: 9, step: 1 },
  { id: 'colour', label: 'Colour', group: 'A', type: 'colour', default: '#C41C34' },
  {
    id: 'speed',
    label: 'Speed',
    group: 'B',
    type: 'number',
    default: 0.25,
    min: 0.05,
    max: 1,
    step: 0.05,
  },
  {
    id: 'tier',
    label: 'Tier',
    type: 'choice',
    default: 'iron',
    choices: [
      { value: 'stone', label: 'Stone' },
      { value: 'iron', label: 'Iron' },
    ],
  },
];

const facts = builtInTargets.map((bundle) => targetFacts(bundle.target.id) as TargetFacts);
const release = facts.find((target) => target.channel === 'release') as TargetFacts;
const snapshot = facts.find((target) => target.channel === 'snapshot') as TargetFacts;

describe('wizard model', () => {
  it('builds one step per group in first-appearance order; ungrouped parameters share "Options"', () => {
    const steps = wizardSteps(PARAMETERS);
    expect(steps.map((step) => step.title)).toEqual(['A', UNGROUPED_STEP_TITLE, 'B']);
    expect(steps.map((step) => step.parameters.map((parameter) => parameter.id))).toEqual([
      ['gem_name', 'colour'],
      ['loose', 'tier'],
      ['count', 'speed'],
    ]);
    expect(wizardSteps(undefined)).toEqual([]);
  });

  it('takes the steps of the library wizards from their groups', () => {
    const titles = (id: string) =>
      wizardSteps(libraryStarters.find((starter) => starter.id === id)?.parameters).map(
        (step) => step.title,
      );
    expect(titles('custom_ore')).toEqual(['Ore', 'Drops', 'World']);
    expect(titles('custom-sword')).toEqual(['Sword', 'Stats', 'Recipe']);
    expect(titles('custom_mob')).toEqual(['Mob', 'Behaviour', 'Spawning']);
    expect(hasParameters(libraryStarters.find((starter) => starter.id === 'blank'))).toBe(false);
  });

  it('fills defaults and converts them to the values build receives', () => {
    const raw = defaultRawValues(PARAMETERS);
    expect(raw).toEqual({
      gem_name: 'Ruby',
      loose: false,
      count: '2',
      colour: '#C41C34',
      speed: '0.25',
      tier: 'iron',
    });
    expect(toValues(PARAMETERS, raw)).toEqual({
      gem_name: 'Ruby',
      loose: false,
      count: 2,
      colour: '#c41c34',
      speed: 0.25,
      tier: 'iron',
    });
    // Invalid or missing values fall back to the default, so every id is present.
    expect(toValues(PARAMETERS, { count: 'x', speed: '0.5' })).toMatchObject({
      count: 2,
      speed: 0.5,
      gem_name: 'Ruby',
    });
  });

  it('validates strings: non-empty, pattern on the whole value, maximum length', () => {
    const name = PARAMETERS[0] as StarterParameter;
    expect(validateParameter(name, 'Amber')).toBeNull();
    expect(validateParameter(name, '  ')).toBe('Enter a value.');
    expect(validateParameter(name, 'amber')).toBe('This value does not have the expected form.');
    expect(validateParameter(name, 'Amberxx!')).not.toBeNull();
    expect(validateParameter(name, 'Abcdefghi')).toBe('Use at most 8 characters.');
  });

  it('validates numbers: a number, min, max and step', () => {
    const count = PARAMETERS[2] as StarterParameter;
    const speed = PARAMETERS[4] as StarterParameter;
    expect(validateParameter(count, '9')).toBeNull();
    expect(validateParameter(count, '')).toBe('Enter a number.');
    expect(validateParameter(count, 'abc')).toBe('Enter a number.');
    expect(validateParameter(count, '0')).toBe('Enter at least 1.');
    expect(validateParameter(count, '10')).toBe('Enter at most 9.');
    expect(validateParameter(count, '2.5')).toBe('Enter a whole number.');
    expect(validateParameter(speed, '0.35')).toBeNull();
    expect(validateParameter(speed, '0.33')).toBe('Use steps of 0.05.');
  });

  it('validates colours, choices and booleans', () => {
    const [, loose, , colour, , tier] = PARAMETERS as [
      StarterParameter,
      StarterParameter,
      StarterParameter,
      StarterParameter,
      StarterParameter,
      StarterParameter,
    ];
    expect(validateParameter(colour, '#00ff00')).toBeNull();
    expect(validateParameter(colour, 'green')).toBe('Enter a colour as #rrggbb.');
    expect(validateParameter(tier, 'stone')).toBeNull();
    expect(validateParameter(tier, 'gold')).toBe('Choose one of the options.');
    expect(validateParameter(loose, true)).toBeNull();
    expect(validateParameter(loose, 'yes')).toBe('Choose yes or no.');
    expect(
      stepErrors(PARAMETERS, { ...defaultRawValues(PARAMETERS), count: '0', tier: 'x' }),
    ).toEqual({
      count: 'Enter at least 1.',
      tier: 'Choose one of the options.',
    });
  });

  it('previews the id a name derives (ADR 0040 D2)', () => {
    expect(derivedId('Ruby')).toBe('ruby');
    expect(derivedId('Ruby Golem')).toBe('ruby_golem');
    expect(derivedId(' Blue  Topaz ')).toBe('blue_topaz');
    expect(derivedId("Dragon's Tooth")).toBe('dragons_tooth');
    expect(showsIdPreview(PARAMETERS[0] as StarterParameter)).toBe(true);
    expect(showsIdPreview(PARAMETERS[3] as StarterParameter)).toBe(false);
  });

  it('offers the targets a starter supports and preselects a release target', () => {
    const mob = libraryStarters.find((starter) => starter.id === 'custom_mob') ?? null;
    expect(targetsFor(null, facts)).toEqual(facts);
    expect(targetsFor(mob, facts).every((target) => target.geckolib !== undefined)).toBe(true);
    expect(pickTargetId(facts, snapshot.id)).toBe(snapshot.id);
    expect(pickTargetId(facts, 'mc-unknown')).toBe(release.id);
    expect(pickTargetId([], 'mc-unknown')).toBe('mc-unknown');
    expect(targetLabel(snapshot)).toBe(`Minecraft ${snapshot.mcVersion} (snapshot)`);
    expect(targetLabel(release)).toBe(`Minecraft ${release.mcVersion}`);
  });
});
