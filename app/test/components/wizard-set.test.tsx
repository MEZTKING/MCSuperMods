// @vitest-environment happy-dom
import type { ProjectStarter, StarterParameter, TargetFacts } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { builtInTargets, targetFacts } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParameterField } from '../../src/renderer/src/components/wizard/ParameterField';
import { StarterWizard, setSummary } from '../../src/renderer/src/components/wizard/StarterWizard';
import {
  defaultRawValue,
  defaultRawValues,
  type RawValue,
  type RawValues,
  stepErrors,
  toggleSetValue,
  toValue,
  toValues,
  validateParameter,
  wizardSteps,
} from '../../src/renderer/src/components/wizard/wizard-model';
import { fakeStarter } from './library-fixtures';

afterEach(cleanup);

const PIECES: StarterParameter & { type: 'set' } = {
  id: 'pieces',
  label: 'Pieces',
  group: 'Pieces',
  type: 'set',
  choices: [
    { value: 'sword', label: 'Sword' },
    { value: 'helmet', label: 'Helmet' },
    { value: 'boots', label: 'Boots' },
  ],
  default: ['sword', 'boots'],
  min: 1,
};

describe('set parameters in the wizard model (ADR 0043 D1)', () => {
  it('edits a copy of the default and converts to the chosen values in choice order', () => {
    const raw = defaultRawValue(PIECES);
    expect(raw).toEqual(['sword', 'boots']);
    expect(raw).not.toBe(PIECES.default);
    expect(toValue(PIECES, ['boots', 'sword'])).toEqual(['sword', 'boots']);
    expect(toValues([PIECES], defaultRawValues([PIECES]))).toEqual({ pieces: ['sword', 'boots'] });
  });

  it('requires at least min known values', () => {
    expect(validateParameter(PIECES, ['helmet'])).toBeNull();
    expect(validateParameter(PIECES, [])).toBe('Choose at least one.');
    expect(validateParameter({ ...PIECES, min: 2 }, ['helmet'])).toBe('Choose at least 2.');
    const { min: _min, ...optional } = PIECES;
    expect(validateParameter(optional, [])).toBeNull();
    expect(validateParameter(PIECES, ['shield'])).toBe('Choose from the options.');
    expect(validateParameter(PIECES, 'sword')).toBe('Choose from the options.');
    expect(stepErrors([PIECES], { pieces: [] })).toEqual({ pieces: 'Choose at least one.' });
  });

  it('falls back to the default for an invalid value', () => {
    expect(toValue(PIECES, [])).toEqual(['sword', 'boots']);
    expect(toValue(PIECES, undefined)).toEqual(['sword', 'boots']);
  });

  it('rejects a list for a parameter that is not a set', () => {
    const name: StarterParameter = { id: 'name', label: 'Name', type: 'string', default: 'Ruby' };
    expect(validateParameter(name, ['Ruby'])).toBe('Enter a value.');
  });

  it('ticks and unticks values, keeping the choice order', () => {
    expect(toggleSetValue(PIECES, ['boots'], 'sword', true)).toEqual(['sword', 'boots']);
    expect(toggleSetValue(PIECES, ['sword', 'boots'], 'sword', false)).toEqual(['boots']);
    expect(toggleSetValue(PIECES, undefined, 'helmet', true)).toEqual(['helmet']);
  });

  it('summarises the chosen labels', () => {
    expect(setSummary(PIECES, ['sword', 'boots'])).toBe('Sword, Boots');
    expect(setSummary(PIECES, [])).toBe('None');
  });

  it('takes the Gear set steps from its groups and validates its defaults', () => {
    const gear = libraryStarters.find((starter) => starter.id === 'gear-set');
    expect(gear?.creator?.group).toBe('gear');
    expect(wizardSteps(gear?.parameters).map((step) => step.title)).toEqual([
      'Material',
      'Pieces',
      'Tools',
      'Armour',
    ]);
    const parameters = gear?.parameters ?? [];
    expect(stepErrors(parameters, defaultRawValues(parameters))).toEqual({});
    expect(toValues(parameters, defaultRawValues(parameters)).pieces).toHaveLength(9);
  });
});

describe('ParameterField for a set', () => {
  function Field(props: { onChange?(value: RawValue): void; error?: string | null }) {
    const [value, setValue] = useState<RawValue>(defaultRawValue(PIECES));
    return (
      <ParameterField
        parameter={PIECES}
        value={value}
        error={props.error ?? null}
        onChange={(next) => {
          setValue(next);
          props.onChange?.(next);
        }}
      />
    );
  }

  it('renders a labelled group of checkboxes with per-value test ids', async () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);
    const group = screen.getByTestId('param-pieces');
    expect(group.tagName).toBe('FIELDSET');
    expect(screen.getByRole('group', { name: 'Pieces' })).toBe(group);
    const sword = screen.getByTestId('param-pieces-sword') as HTMLInputElement;
    const helmet = screen.getByTestId('param-pieces-helmet') as HTMLInputElement;
    expect(sword.checked).toBe(true);
    expect(helmet.checked).toBe(false);
    expect(screen.getByLabelText('Helmet')).toBe(helmet);
    await userEvent.click(helmet);
    expect(onChange).toHaveBeenLastCalledWith(['sword', 'helmet', 'boots']);
    await userEvent.click(sword);
    expect(onChange).toHaveBeenLastCalledWith(['helmet', 'boots']);
    expect((screen.getByTestId('param-pieces-helmet') as HTMLInputElement).checked).toBe(true);
  });

  it('shows the error under the group', () => {
    render(<Field error="Choose at least one." />);
    expect(screen.getByTestId('param-pieces-error').textContent).toBe('Choose at least one.');
    expect(screen.getByTestId('param-pieces').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('StarterWizard with a set', () => {
  const facts: TargetFacts[] = builtInTargets.map(
    (bundle) => targetFacts(bundle.target.id) as TargetFacts,
  );
  const starter: ProjectStarter = {
    ...fakeStarter,
    id: 'set_wizard',
    title: 'Set wizard',
    parameters: [PIECES],
  };

  function Harness(props: { onCreate(values: RawValues): void }) {
    const [values, setValues] = useState<RawValues>(defaultRawValues(starter.parameters));
    const [targetId, setTargetId] = useState(facts[0]?.id ?? '');
    return (
      <StarterWizard
        starter={starter}
        targets={facts}
        targetId={targetId}
        onTargetChange={setTargetId}
        values={values}
        onValuesChange={setValues}
        onCancel={() => {}}
        onCreate={() => props.onCreate(values)}
      />
    );
  }

  it('blocks Next with nothing ticked and lists the chosen labels in the summary', async () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);
    await userEvent.click(screen.getByTestId('param-pieces-sword'));
    await userEvent.click(screen.getByTestId('param-pieces-boots'));
    await userEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('param-pieces-error').textContent).toBe('Choose at least one.');
    await userEvent.click(screen.getByTestId('param-pieces-helmet'));
    expect(screen.queryByTestId('param-pieces-error')).toBeNull();
    await userEvent.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-summary').textContent).toContain('Helmet');
    await userEvent.click(screen.getByTestId('wizard-create'));
    expect(onCreate).toHaveBeenCalledWith({ pieces: ['helmet'] });
  });
});
