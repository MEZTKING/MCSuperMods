// @vitest-environment happy-dom
import type { Project } from '@msm/core';
import type { ContentBundle, ProjectStarter } from '@msm/plugin-api';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreatorDialog } from '../../src/renderer/src/components/creator/CreatorDialog';
import {
  effectCards,
  throwArc,
  throwableCards,
} from '../../src/renderer/src/components/creator/creator-cards';
import {
  bundleHasCards,
  CREATOR_GROUPS,
  firstTab,
} from '../../src/renderer/src/components/creator/creator-model';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import { aiSession } from './ai-fixtures';

afterEach(cleanup);

function starter(session: ProjectSession, id: string): ProjectStarter {
  const found = session.library.starters.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No starter ${id}`);
  return found;
}

async function build(
  session: ProjectSession,
  id: string,
  values: Record<string, unknown> = {},
): Promise<ContentBundle> {
  const flow = starter(session, id);
  const defaults = Object.fromEntries(
    (flow.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );
  return flow.build({
    namespace: 'demo',
    projectName: 'Demo',
    target: session.target,
    values: { ...defaults, ...values } as never,
  });
}

describe('Creator status effect and throwable cards (ADRs 0055, 0056)', () => {
  it('lists Magic as a group and the Status effect flow in it', async () => {
    const { session } = await aiSession();
    expect(CREATOR_GROUPS.map((group) => group.title)).toContain('Magic');
    expect(starter(session, 'status-effect').creator?.group).toBe('magic');
    expect(starter(session, 'throwable').creator?.group).toBe('gear');
  });

  it('shows an effect with its category colour, icon and a per-level table', async () => {
    const { session } = await aiSession();
    const bundle = await build(session, 'status-effect', {
      behaviour: 'heal',
      faster_per_level: true,
    });
    const [card] = effectCards(bundle);
    expect(card).toMatchObject({
      id: 'demo:ruby_rush',
      category: 'beneficial',
      nameColour: '#5555ff',
      icon: { namespace: 'demo', path: 'mob_effect/ruby_rush.png' },
    });
    expect(card?.lines.some((line) => line.includes('heals'))).toBe(true);
    expect(card?.columns).toContain('Acts every (seconds)');
    expect(card?.levels).toHaveLength(4);
    expect(bundleHasCards(bundle)).toBe(true);
    expect(firstTab(bundle)).toBe('card');
    const harmful = effectCards(await build(session, 'status-effect', { category: 'harmful' }));
    expect(harmful[0]?.nameColour).toBe('#ff5555');
  });

  it('describes a throwable and sketches a level throw', async () => {
    const { session } = await aiSession();
    const bundle = await build(session, 'throwable');
    const [card] = throwableCards(bundle);
    expect(card?.id).toBe('demo:ruby_knife');
    expect(card?.lines.join(' ')).toContain('picked up again');
    expect(card?.lines.join(' ')).toContain('damage');
    expect(firstTab(bundle)).toBe('items');
    const arc = throwArc(1.5, 0.03);
    expect(arc[0]).toEqual({ x: 0, y: 1.62 });
    expect(arc[arc.length - 1]?.y).toBe(0);
    const heavy = throwArc(1.5, 0.08);
    expect((heavy[heavy.length - 1]?.x ?? 0) < (arc[arc.length - 1]?.x ?? 0)).toBe(true);
  });

  it('renders the effect and flask cards in the Card tab', async () => {
    const { session } = await aiSession();
    render(
      <CreatorDialog
        session={session}
        project={session.snapshot.project as Project}
        namespaces={['demo']}
        folders={session.target.folders.resource}
        readProjectAsset={(namespace, path) => session.readAsset(namespace, path).catch(() => null)}
        vanilla={null}
        onClose={vi.fn()}
        onCreated={vi.fn()}
        newSetId={() => 'set-1'}
        webgl={false}
        debounceMs={5}
      />,
    );
    const user = userEvent.setup();
    const magic = await screen.findByTestId('creator-group-magic');
    expect(within(magic).getByRole('heading', { name: 'Magic' })).toBeTruthy();
    await user.click(within(magic).getByTestId('creator-flow-status-effect'));
    await user.selectOptions(await screen.findByLabelText('How players get it'), 'flask');
    const effect = await screen.findByTestId(
      'creator-effect-demo:ruby_rush',
      {},
      { timeout: 5000 },
    );
    expect(within(effect).getByTestId('creator-effect-name').textContent).toBe('Ruby Rush');
    expect(within(effect).getByTestId('creator-effect-levels')).toBeTruthy();
    expect(await screen.findByTestId('creator-throwable-demo:ruby_rush_flask')).toBeTruthy();
    expect(screen.getByTestId('creator-throwable-arc')).toBeTruthy();
  });
});
