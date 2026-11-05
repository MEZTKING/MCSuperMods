// @vitest-environment happy-dom
import type { ProjectStarter, TargetFacts } from '@msm/plugin-api';
import { builtInTargets, targetFacts } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StarterWizard } from '../../src/renderer/src/components/wizard/StarterWizard';
import {
  defaultRawValues,
  type RawValues,
} from '../../src/renderer/src/components/wizard/wizard-model';
import { fakeStarter } from './library-fixtures';

afterEach(cleanup);

const facts: TargetFacts[] = builtInTargets.map(
  (bundle) => targetFacts(bundle.target.id) as TargetFacts,
);
const release = facts.find((target) => target.channel === 'release') as TargetFacts;
const snapshot = facts.find((target) => target.channel === 'snapshot') as TargetFacts;

const wizardStarter: ProjectStarter = {
  ...fakeStarter,
  id: 'gem_wizard',
  title: 'Gem wizard',
  parameters: [
    {
      id: 'gem_name',
      label: 'Gem name',
      group: 'Gem',
      type: 'string',
      default: 'Ruby',
      pattern: '^[A-Za-z][A-Za-z0-9]*( [A-Za-z0-9]+)*$',
    },
    { id: 'colour', label: 'Colour', group: 'Gem', type: 'colour', default: '#c41c34' },
    {
      id: 'drops',
      label: 'Drops',
      group: 'Loot',
      type: 'number',
      default: 2,
      min: 1,
      max: 9,
      step: 1,
    },
    { id: 'block', label: 'Add a block', group: 'Loot', type: 'boolean', default: true },
  ],
};

function Harness(props: { onCreate(values: RawValues, targetId: string): void; onBack?(): void }) {
  const [values, setValues] = useState<RawValues>(defaultRawValues(wizardStarter.parameters));
  const [targetId, setTargetId] = useState(release.id);
  return (
    <StarterWizard
      starter={wizardStarter}
      targets={facts}
      targetId={targetId}
      onTargetChange={setTargetId}
      values={values}
      onValuesChange={setValues}
      {...(props.onBack === undefined ? {} : { onBack: props.onBack })}
      onCancel={() => {}}
      onCreate={() => props.onCreate(values, targetId)}
    />
  );
}

describe('StarterWizard', () => {
  it('shows one step per group, then the create step with the target select', async () => {
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} />);
    const user = userEvent.setup();
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
    expect(screen.getByTestId('wizard-progress').textContent).toBe('Step 2 of 4');
    expect(screen.getByTestId('param-gem_name')).toBeTruthy();
    expect(screen.getByTestId('param-colour')).toBeTruthy();
    expect(screen.queryByTestId('param-drops')).toBeNull();
    expect(screen.getByTestId('param-gem_name-id').textContent).toBe('Ids start with ruby');
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-3')).toBeTruthy();
    expect(screen.getByTestId('param-drops')).toBeTruthy();
    expect(screen.queryByTestId('new-project-target')).toBeNull();
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-4')).toBeTruthy();
    const select = screen.getByTestId('new-project-target') as HTMLSelectElement;
    expect(select.value).toBe(release.id);
    expect([...select.options].map((option) => option.textContent)).toContain(
      `Minecraft ${snapshot.mcVersion} (snapshot)`,
    );
    expect(screen.queryByTestId('new-project-target-snapshot')).toBeNull();
    expect(screen.getByTestId('wizard-summary').textContent).toContain('Gem nameRuby');
    expect(screen.getByTestId('wizard-create').textContent).toBe('Choose folder and create');
    await user.selectOptions(select, snapshot.id);
    expect(screen.getByTestId('new-project-target-snapshot').textContent).toBe('snapshot');
    await user.click(screen.getByTestId('wizard-create'));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate.mock.calls[0]?.[1]).toBe(snapshot.id);
  });

  it('blocks Next on an invalid field and shows the error under it', async () => {
    render(<Harness onCreate={vi.fn()} />);
    const user = userEvent.setup();
    const name = screen.getByTestId('param-gem_name');
    await user.clear(name);
    await user.type(name, '9 lives');
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
    expect(screen.getByTestId('param-gem_name-error').textContent).toBe(
      'This value does not have the expected form.',
    );
    expect(name.getAttribute('aria-invalid')).toBe('true');
    await user.clear(name);
    expect(screen.getByTestId('param-gem_name-error').textContent).toBe('Enter a value.');
    await user.type(name, 'Amber');
    expect(screen.queryByTestId('param-gem_name-error')).toBeNull();
    // Enter submits the step, like Next.
    await user.type(name, '{Enter}');
    const drops = screen.getByTestId('param-drops');
    await user.clear(drops);
    await user.type(drops, '12');
    expect((drops as HTMLInputElement).value).toBe('12');
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('param-drops-error').textContent).toBe('Enter at most 9.');
    expect(screen.getByTestId('wizard-step-3')).toBeTruthy();
  });

  it('keeps values on Back and leaves the first step through onBack', async () => {
    const onBack = vi.fn();
    const onCreate = vi.fn();
    render(<Harness onCreate={onCreate} onBack={onBack} />);
    const user = userEvent.setup();
    const name = screen.getByTestId('param-gem_name');
    await user.clear(name);
    await user.type(name, 'Blue Topaz');
    await user.click(screen.getByTestId('wizard-next'));
    await user.click(screen.getByTestId('param-block'));
    await user.click(screen.getByTestId('wizard-back'));
    expect((screen.getByTestId('param-gem_name') as HTMLInputElement).value).toBe('Blue Topaz');
    expect(screen.getByTestId('param-gem_name-id').textContent).toBe('Ids start with blue_topaz');
    await user.click(screen.getByTestId('wizard-next'));
    expect((screen.getByTestId('param-block') as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByTestId('wizard-back'));
    await user.click(screen.getByTestId('wizard-back'));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
