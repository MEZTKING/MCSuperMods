// @vitest-environment happy-dom
import type { Project } from '@msm/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WhatHappenedEntry } from '../../../src/renderer/src/tryit/session-source';
import {
  entryText,
  lineClass,
  linkFor,
  WhatHappened,
} from '../../../src/renderer/src/tryit/WhatHappened';

afterEach(cleanup);

const BOOK = 'msm_sample_rules:chime_block_rules';
const BLOCK = 'msm_sample_rules:chime_block';

/** A project with a rule book and a block that saves an event. */
const project = {
  namespaces: [
    {
      elements: [
        {
          id: BOOK,
          kind: 'msm:rules',
          data: { rules: [{ key: 'other' }, { key: 'ring_chime', name: 'Ring the chime' }] },
        },
        {
          id: BLOCK,
          kind: 'msm:block',
          data: {
            components: { 'msm:on_interact': { event: 'ring' } },
            events: { ring: { actions: [] } },
          },
        },
      ],
    },
  ],
} as unknown as Project;

let serial = 0;
const entry = (
  kind: WhatHappenedEntry['kind'],
  text: string,
  origin?: WhatHappenedEntry['origin'],
): WhatHappenedEntry => ({
  serial: ++serial,
  tick: 1,
  kind,
  text,
  ...(origin === undefined ? {} : { origin }),
});

/** One entry of each kind, in the order the simulation writes them. */
const ENTRIES: WhatHappenedEntry[] = [
  entry('info', 'You cleared the area.'),
  entry('trigger', 'You used Chime Block, so rule "Ring the chime" ran.', {
    elementId: BLOCK,
    eventId: `${BLOCK}_rules_block_used`,
    pointer: '/components/msm:on_interact/event',
    ruleKey: 'ring_chime',
    ruleBook: BOOK,
  }),
  entry('action', 'Played sound Chime.', {
    elementId: BLOCK,
    eventId: `${BLOCK}_rules_block_used`,
    ruleKey: 'ring_chime',
    ruleBook: BOOK,
  }),
  entry('action', 'Gave you 1 Ruby.', { elementId: BLOCK, eventId: 'ring' }),
  entry('skipped', 'Gave no Ruby: there is no player in this event.', { elementId: BLOCK }),
  entry('onlyInMinecraft', 'rule "try_luck" (it needs a script)', { ruleBook: 'x:missing' }),
];

function panel(options: { runEveryTime?: boolean } = {}) {
  const onOpen = vi.fn();
  const onRunEveryTime = vi.fn();
  render(
    <WhatHappened
      entries={ENTRIES}
      project={project}
      onOpen={onOpen}
      runEveryTime={options.runEveryTime ?? false}
      onRunEveryTime={onRunEveryTime}
    />,
  );
  return { onOpen, onRunEveryTime };
}

describe('What happened', () => {
  it('renders each trace entry kind as its sentence, newest first', () => {
    panel();
    const items = screen.getByTestId('tryit-log').querySelectorAll('li');
    expect([...items].map((item) => item.dataset.kind)).toEqual([
      'onlyInMinecraft',
      'skipped',
      'action',
      'action',
      'trigger',
      'info',
    ]);
    const texts = [...items].map((item) => item.querySelector('span')?.textContent);
    expect(texts).toEqual([
      'Only in Minecraft: rule "try_luck" (it needs a script)',
      'Gave no Ruby: there is no player in this event.',
      'Gave you 1 Ruby.',
      'Played sound Chime.',
      'You used Chime Block, so rule "Ring the chime" ran.',
      'You cleared the area.',
    ]);
  });

  it('shows "Only in Minecraft" lines without folding them away', () => {
    panel();
    const only = screen.getAllByTestId('tryit-log-only');
    expect(only).toHaveLength(1);
    expect(only[0]?.closest('details')).toBeNull();
    expect(only[0]?.hidden).toBe(false);
    expect(entryText({ kind: 'onlyInMinecraft', text: 'x' })).toBe('Only in Minecraft: x');
  });

  it('links to the rule card, the event and the Studio', () => {
    const { onOpen } = panel();
    const links = screen.getAllByTestId('tryit-log-link');
    // Newest first: the skipped line (Studio), "Gave you 1 Ruby." (event), the sound (rule),
    // the trigger (rule); the plain line and the line about a missing book have none.
    expect(links.map((link) => link.textContent)).toEqual(['Studio', 'Event', 'Rule', 'Rule']);
    fireEvent.click(links[3] as HTMLElement);
    expect(onOpen).toHaveBeenLastCalledWith(BOOK, '/rules/1');
    fireEvent.click(links[1] as HTMLElement);
    expect(onOpen).toHaveBeenLastCalledWith(BLOCK, '/events/ring');
    fireEvent.click(links[0] as HTMLElement);
    expect(onOpen).toHaveBeenLastCalledWith(BLOCK, null);
  });

  it('works out links from origins', () => {
    expect(linkFor({ ruleBook: BOOK }, project)).toEqual({
      label: 'Rule book',
      elementId: BOOK,
      pointer: null,
    });
    expect(
      linkFor({ elementId: BLOCK, pointer: '/components/msm:on_interact/event' }, project),
    ).toEqual({ label: 'Studio', elementId: BLOCK, pointer: '/components/msm:on_interact/event' });
    expect(linkFor({ elementId: 'minecraft:stone' }, project)).toBeNull();
    expect(linkFor(undefined, project)).toBeNull();
  });

  it("puts a logic rule's steps under the rule, linked to its card (B401)", () => {
    const origin = { elementId: BOOK, ruleKey: 'ring_chime', ruleBook: BOOK };
    const steps: WhatHappenedEntry[] = [
      entry('trigger', 'The script heard block.break, so rule "Ring the chime" ran.', origin),
      {
        ...entry(
          'action',
          'Rule "Ring the chime" checked its "if": true, so its "then" steps ran.',
          origin,
        ),
        ruleStep: 'check',
      },
      {
        ...entry('onlyInMinecraft', 'Player.showActionBar, used by rule "Ring the chime"', origin),
        ruleStep: 'did',
      },
      {
        ...entry(
          'skipped',
          'Rule "Ring the chime" failed after its "if" check: Error: boom',
          origin,
        ),
        ruleStep: 'error',
      },
    ];
    const onOpen = vi.fn();
    render(
      <WhatHappened
        entries={steps}
        project={project}
        onOpen={onOpen}
        runEveryTime={false}
        onRunEveryTime={vi.fn()}
      />,
    );
    const items = [...screen.getByTestId('tryit-log').querySelectorAll('li')];
    expect(items.map((item) => item.dataset.ruleStep)).toEqual([
      'error',
      'did',
      'check',
      undefined,
    ]);
    expect(items.map((item) => item.className.includes('pl-6'))).toEqual([true, true, true, false]);
    expect(items[0]?.className).toContain('text-muted');
    expect(items[1]?.querySelector('span')?.textContent).toBe(
      'Only in Minecraft: Player.showActionBar, used by rule "Ring the chime"',
    );
    const links = screen.getAllByTestId('tryit-log-link');
    expect(links.map((link) => link.textContent)).toEqual(['Rule', 'Rule', 'Rule', 'Rule']);
    fireEvent.click(links[0] as HTMLElement);
    expect(onOpen).toHaveBeenLastCalledWith(BOOK, '/rules/1');
    expect(lineClass({ kind: 'action' })).toBe('pl-3');
    expect(lineClass({ kind: 'trigger', ruleStep: 'start' })).toBe('font-medium');
    expect(lineClass({ kind: 'onlyInMinecraft', ruleStep: 'did' })).toBe('pl-6 text-warning');
  });

  it('turns "Run every time" on and off', () => {
    const { onRunEveryTime } = panel();
    fireEvent.click(screen.getByTestId('tryit-always'));
    expect(onRunEveryTime).toHaveBeenCalledWith(true);
  });
});
