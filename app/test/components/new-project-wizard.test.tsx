// @vitest-environment happy-dom
import type { ProjectStarter, TargetFacts } from '@msm/plugin-api';
import { libraryStarters } from '@msm/plugin-library';
import { builtInTargets, defaultTargetId, targetFacts } from '@msm/targets';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NewProjectDialog,
  type NewProjectRequest,
} from '../../src/renderer/src/components/NewProjectDialog';
import { fakeStarter } from './library-fixtures';

afterEach(cleanup);

const facts: TargetFacts[] = builtInTargets.map(
  (bundle) => targetFacts(bundle.target.id) as TargetFacts,
);
const snapshot = facts.find((target) => target.channel === 'snapshot') as TargetFacts;
const ore = libraryStarters.find((starter) => starter.id === 'custom_ore') as ProjectStarter;
const mob = libraryStarters.find((starter) => starter.id === 'custom_mob') as ProjectStarter;

function renderDialog(starters: readonly ProjectStarter[]) {
  const onCreate = vi.fn<(request: NewProjectRequest) => void>();
  const onCancel = vi.fn();
  render(
    <NewProjectDialog
      starters={starters}
      targets={facts}
      defaultTargetId={defaultTargetId}
      onCreate={onCreate}
      onCancel={onCancel}
    />,
  );
  return { onCreate, onCancel, user: userEvent.setup() };
}

describe('NewProjectDialog with targets and wizards', () => {
  it('creates a starter without parameters in one step, with the target select on that step', async () => {
    const { onCreate, user } = renderDialog([fakeStarter, ore]);
    await user.click(screen.getByTestId('starter-test_starter'));
    expect(screen.getByTestId('wizard-step-1')).toBeTruthy();
    expect(screen.queryByTestId('wizard-next')).toBeNull();
    const select = screen.getByTestId('new-project-target') as HTMLSelectElement;
    expect(select.value).toBe(defaultTargetId);
    await user.selectOptions(select, snapshot.id);
    expect(screen.getByTestId('new-project-target-snapshot').textContent).toBe('snapshot');
    await user.click(screen.getByTestId('new-project-dialog-submit'));
    expect(onCreate).toHaveBeenCalledExactlyOnceWith({
      starterId: 'test_starter',
      folder: null,
      targetId: snapshot.id,
      values: {},
    });
  });

  it('runs the wizard of a starter with parameters and passes its values and target', async () => {
    const { onCreate, user } = renderDialog([fakeStarter, ore]);
    expect(screen.getByTestId('starter-custom_ore-wizard').textContent).toBe('Wizard');
    await user.click(screen.getByTestId('starter-custom_ore'));
    expect(screen.queryByTestId('new-project-target')).toBeNull();
    expect(screen.getByTestId('wizard-progress').textContent).toBe('Step 1 of 5');
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-2')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Custom ore: Ore' })).toBeTruthy();
    const name = screen.getByTestId('param-ore_name');
    await user.clear(name);
    await user.type(name, 'Amber');
    await user.selectOptions(screen.getByTestId('param-tool_tier'), 'diamond');
    await user.click(screen.getByTestId('param-make_block'));
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByRole('heading', { name: 'Custom ore: Drops' })).toBeTruthy();
    const most = screen.getByTestId('param-drop_max');
    await user.clear(most);
    await user.type(most, '9');
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-4')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Custom ore: World' })).toBeTruthy();
    // Generation is on by default; keep it and change the veins per chunk.
    expect((screen.getByTestId('param-generate') as HTMLInputElement).checked).toBe(true);
    const veins = screen.getByTestId('param-veins_per_chunk');
    await user.clear(veins);
    await user.type(veins, '10');
    await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-5')).toBeTruthy();
    expect((screen.getByTestId('new-project-target') as HTMLSelectElement).value).toBe(
      defaultTargetId,
    );
    await user.click(screen.getByTestId('new-project-dialog-submit'));
    expect(onCreate).toHaveBeenCalledExactlyOnceWith({
      starterId: 'custom_ore',
      folder: null,
      targetId: defaultTargetId,
      values: {
        ore_name: 'Amber',
        colour: '#c41c34',
        tool_tier: 'diamond',
        make_block: false,
        drop_min: 1,
        drop_max: 9,
        generate: true,
        vein_size: 6,
        veins_per_chunk: 10,
        min_y: -64,
        max_y: 32,
      },
    });
  });

  it('keeps the wizard values when going back to the starter list and returning', async () => {
    const { user } = renderDialog([fakeStarter, ore]);
    await user.click(screen.getByTestId('starter-custom_ore'));
    await user.click(screen.getByTestId('wizard-next'));
    await user.clear(screen.getByTestId('param-ore_name'));
    await user.type(screen.getByTestId('param-ore_name'), 'Jade');
    await user.click(screen.getByTestId('wizard-back'));
    expect(screen.getByTestId('wizard-step-1')).toBeTruthy();
    expect((screen.getByTestId('starter-custom_ore') as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByTestId('wizard-next'));
    expect((screen.getByTestId('param-ore_name') as HTMLInputElement).value).toBe('Jade');
  });

  it('offers only the targets a starter supports', async () => {
    const { onCreate, user } = renderDialog([mob]);
    await user.click(screen.getByTestId('starter-custom_mob'));
    // Starter list, Mob, Behaviour, Spawning and Variants steps.
    for (let step = 0; step < 5; step += 1) await user.click(screen.getByTestId('wizard-next'));
    const options = [...(screen.getByTestId('new-project-target') as HTMLSelectElement).options];
    const supported = facts.filter((target) => mob.supports?.(target) ?? true);
    expect(options.map((option) => option.value)).toEqual(supported.map((target) => target.id));
    await user.click(screen.getByTestId('new-project-dialog-submit'));
    expect(onCreate.mock.calls[0]?.[0].values).toMatchObject({
      mob_name: 'Ruby Golem',
      behaviour: 'neutral',
    });
  });

  it('falls back to onSubmit with the chosen starter when the host passes no onCreate', async () => {
    const onSubmit = vi.fn();
    render(<NewProjectDialog starters={[ore]} onSubmit={onSubmit} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('starter-custom_ore'));
    // Starter list, Ore, Drops and World steps.
    for (let step = 0; step < 4; step += 1) await user.click(screen.getByTestId('wizard-next'));
    expect(screen.getByTestId('wizard-step-5')).toBeTruthy();
    // Without targets there is no select on the last step.
    expect(screen.queryByTestId('new-project-target')).toBeNull();
    await user.click(screen.getByTestId('new-project-dialog-submit'));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(ore);
  });
});
