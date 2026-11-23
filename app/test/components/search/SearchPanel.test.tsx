// @vitest-environment happy-dom
/**
 * The search panel (B663; ADR 0124 D6, D8, D10, D11): the combobox and grouped listbox roles,
 * `aria-activedescendant`, every key, the live region's words, the chips (removing one asks
 * again), the scopes and Advanced's prefixes, Show more, the empty state, Closest things and
 * Nothing close with the Wishlist, the buttons per result handed to `onAction`, the template's
 * name, a result the target cannot make, the stacked layout under 768 px and reduced motion.
 */

import type { SearchAnswer, SearchHit, SearchRequest } from '@msm/search';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPanel, type SearchPanelProps } from '../../../src/renderer/src/search/SearchPanel';
import {
  BLUE_SWORD_HIT,
  blueSword,
  CLOSEST,
  entry,
  fakeQuery,
  GUIDE,
  hit,
  NOTHING,
  TEMPLATE,
} from './panel-fixtures';

afterEach(cleanup);

type Recorded = { hit: SearchHit; which: string; options?: { name?: string } };

function setup(
  props: Partial<SearchPanelProps> & {
    table?: (request: SearchRequest) => SearchAnswer | null;
  } = {},
) {
  const { table, ...rest } = props;
  const fake = fakeQuery(
    table ??
      ((request) =>
        request.text === 'blue sword'
          ? blueSword(request.limit !== undefined)
          : request.text === 'lorem ipsum dolor'
            ? CLOSEST
            : request.text === 'sword'
              ? { ...blueSword(), understood: { chips: [] } }
              : NOTHING),
  );
  const actions: Recorded[] = [];
  const remembered: string[] = [];
  const user = userEvent.setup();
  const utils = render(
    <SearchPanel
      query={fake.query}
      mode="easy"
      hasMod
      delayMs={0}
      reducedMotion={false}
      rememberText={(text) => remembered.push(text)}
      onAction={(h, which, options) =>
        actions.push({ hit: h, which, ...(options !== undefined ? { options } : {}) })
      }
      {...rest}
    />,
  );
  const field = screen.getByRole('combobox');
  return { ...utils, fake, actions, remembered, user, field };
}

async function typed(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, text: string) {
  await user.type(field, text);
  await waitFor(() => expect(screen.getByTestId('search-live').textContent).not.toBe(''));
}

const activeOption = (field: HTMLElement): HTMLElement => {
  const id = field.getAttribute('aria-activedescendant');
  expect(id).toBeTruthy();
  const option = document.getElementById(id as string);
  expect(option).not.toBeNull();
  return option as HTMLElement;
};

describe('roles', () => {
  it('is a combobox over a grouped listbox, the active row named by aria-activedescendant', async () => {
    const { user, field } = setup();
    expect(field.getAttribute('aria-expanded')).toBe('false');
    await typed(user, field, 'blue sword');
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect(field.getAttribute('aria-autocomplete')).toBe('list');
    const list = screen.getByRole('listbox', { name: 'Results' });
    expect(field.getAttribute('aria-controls')).toBe(list.id);
    const groups = within(list).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-labelledby'))).toHaveLength(5);
    expect(
      groups.map(
        (group) =>
          document.getElementById(group.getAttribute('aria-labelledby') as string)?.textContent,
      ),
    ).toEqual(['Best matches', 'Things you can make', 'From Minecraft', 'How to', 'More']);
    for (const group of groups) {
      expect(within(group).getAllByRole('option').length).toBeGreaterThan(0);
    }
    const first = activeOption(field);
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.getAttribute('data-testid')).toBe('search-row-flow:weapon');
    // Rows never take focus.
    for (const option of within(list).getAllByRole('option')) {
      expect(option.getAttribute('tabindex')).toBe('-1');
    }
    expect(document.activeElement).toBe(field);
  });

  it('greys a result the target cannot make, says why and gives it no button', async () => {
    const { user, field, actions } = setup();
    await typed(user, field, 'blue sword');
    const row = screen.getByTestId('search-row-flow:spear');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(within(row).getByTestId('search-row-reason').textContent).toBe(
      'Not on this Minecraft version.',
    );
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(activeOption(field)).toBe(row);
    expect(screen.queryByTestId('search-actions')).toBeNull();
    await user.keyboard('{Enter}');
    expect(actions).toEqual([]);
  });
});

describe('keys', () => {
  it('moves with the arrows and Page keys, runs the main button with Enter and the second with Ctrl+Enter', async () => {
    const { user, field, actions, remembered } = setup();
    await typed(user, field, 'blue sword');
    await user.keyboard('{ArrowDown}');
    expect(activeOption(field).getAttribute('data-testid')).toBe('search-row-starter:custom-sword');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(activeOption(field).getAttribute('data-testid')).toBe('search-row-flow:weapon');
    await user.keyboard('{Enter}');
    expect(actions.map((a) => [a.hit.entry.id, a.which])).toEqual([['flow:weapon', 'make']]);
    expect(actions[0]?.hit.answers).toEqual(BLUE_SWORD_HIT.answers);
    expect(remembered).toEqual(['blue sword']);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(actions[1]?.which).toBe('add');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    expect(actions[2]?.which).toBe('add');
    await user.keyboard('{PageDown}');
    expect(activeOption(field).getAttribute('data-testid')).toBe('search-row-flow:spear');
    await user.keyboard('{PageDown}');
    expect(activeOption(field).getAttribute('data-testid')).toBe(
      'search-row-vanilla:thing:diamond_sword',
    );
    await user.keyboard('{PageUp}{PageUp}');
    expect(activeOption(field).getAttribute('data-testid')).toBe('search-row-flow:weapon');
    // Typing goes on while the selection moves.
    await user.keyboard('{ArrowDown}x');
    expect((field as HTMLInputElement).value).toBe('blue swordx');
  });

  it('takes Tab into the preview buttons and Escape closes from anywhere in the panel', async () => {
    const onClose = vi.fn();
    const { user, field, actions } = setup({ onClose });
    await typed(user, field, 'blue sword');
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByTestId('search-action-make'));
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByTestId('search-action-add'));
    await user.keyboard('{Enter}');
    expect(actions.map((a) => a.which)).toEqual(['add']);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    field.focus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('opens a section with Show more, asking for more rows and landing on the first new one', async () => {
    const { user, field, fake } = setup();
    await typed(user, field, 'blue sword');
    const more = screen.getByTestId('search-show-more-minecraft');
    expect(more.getAttribute('role')).toBe('option');
    expect(more.textContent).toBe('Show more (1)');
    await user.click(more);
    await waitFor(() => expect(screen.queryByTestId('search-show-more-minecraft')).toBeNull());
    expect(fake.requests.at(-1)?.limit).toBe(50);
    expect(activeOption(field).getAttribute('data-testid')).toBe(
      'search-row-vanilla:thing:stone_sword',
    );
    // Other sections stay at three rows.
    expect(within(screen.getByTestId('search-group-make')).getAllByRole('option')).toHaveLength(1);
  });

  it('a click runs the main button and keeps focus in the field', async () => {
    const { user, field, actions } = setup();
    await typed(user, field, 'blue sword');
    await user.click(screen.getByTestId('search-row-guide:creator.md#make-a-weapon'));
    expect(actions.map((a) => [a.hit.entry.id, a.which])).toEqual([[GUIDE.id, 'show-me-how']]);
    expect(document.activeElement).toBe(field);
  });
});

describe('the live region', () => {
  it('says the count and the best match, Closest things, and Nothing close', async () => {
    const { user, field } = setup();
    const live = screen.getByTestId('search-live');
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    await typed(user, field, 'blue sword');
    expect(live.textContent).toBe('9 results. Best match: Weapon.');
    await user.clear(field);
    await typed(user, field, 'lorem ipsum dolor');
    expect(live.textContent).toBe('1 result. Closest things: Oak door.');
    expect(screen.getByTestId('search-closest').textContent).toBe('Closest things');
    expect(screen.getByTestId('search-corrected').textContent).toBe(
      'Showing results for lore ipsum door',
    );
    await user.clear(field);
    await typed(user, field, 'blorptastic');
    expect(live.textContent).toBe(
      'Nothing close to that yet. Try other words, or add it to your Wishlist.',
    );
  });
});

describe('chips and scopes', () => {
  it('shows what was understood; removing a chip takes its words out and asks again', async () => {
    const { user, field, fake } = setup();
    await typed(user, field, 'blue sword');
    const chips = screen.getAllByTestId('search-chip');
    expect(chips.map((chip) => chip.textContent)).toEqual(['blue×']);
    expect(screen.getByText('I understood:')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove blue' }));
    expect((field as HTMLInputElement).value).toBe('sword');
    await waitFor(() => expect(fake.requests.at(-1)?.text).toBe('sword'));
    expect(document.activeElement).toBe(field);
  });

  it('strikes the words it could not place and offers the Wishlist and the AI helper', async () => {
    const onWishlist = vi.fn();
    const onAskAi = vi.fn();
    const { user, field } = setup({ onWishlist, onAskAi });
    await typed(user, field, 'blorptastic');
    const chip = screen.getByTestId('search-chip');
    expect(chip.querySelector('s')?.textContent).toBe('blorptastic');
    expect(screen.getByText('Not understood:')).toBeTruthy();
    expect(screen.getByTestId('search-nothing').textContent).toBe(
      'Nothing close to that yet. Try other words, or add it to your Wishlist.',
    );
    expect(activeOption(field).textContent).toBe('Add it to my Wishlist');
    await user.keyboard('{Enter}');
    expect(onWishlist).toHaveBeenCalledWith('blorptastic');
    await user.keyboard('{ArrowDown}');
    expect(activeOption(field).textContent).toBe('Ask the AI helper');
    await user.keyboard('{Enter}');
    expect(onAskAi).toHaveBeenCalledWith('blorptastic', []);
  });

  it('asks within a scope chip; pressing it again looks everywhere', async () => {
    const { user, field, fake } = setup();
    await typed(user, field, 'blue sword');
    const chip = screen.getByTestId('search-scope-minecraft');
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(fake.requests.at(-1)?.scope).toBe('minecraft'));
    await user.click(chip);
    await waitFor(() => expect(fake.requests.at(-1)?.scope).toBeUndefined());
    expect(screen.getByRole('group', { name: 'Look in' })).toBeTruthy();
  });

  it('reads the prefixes as scopes for everyone (ADR 0130)', async () => {
    const advanced = setup({ mode: 'advanced' });
    await typed(advanced.user, advanced.field, '>export jar');
    expect(advanced.fake.requests.at(-1)).toMatchObject({ text: 'export jar', scope: 'commands' });
    expect(screen.getByTestId('search-scope-commands').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('search-scope-commands').textContent).toBe('Commands>');
    cleanup();
    const plain = setup({ mode: 'very-easy' });
    await typed(plain.user, plain.field, '@ruby');
    expect(plain.fake.requests.at(-1)).toMatchObject({ text: 'ruby', scope: 'mine' });
  });

  it('opens on the palette door with the commands scope', () => {
    setup({ door: 'palette', initialScope: 'commands', mode: 'very-easy' });
    expect(screen.getByRole('combobox').getAttribute('placeholder')).toBe('Type a command');
    expect(screen.getByTestId('search-scope-commands').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('the empty state', () => {
  it('offers three example searches and says nothing leaves the computer', async () => {
    const { user, field, fake } = setup({ mode: 'very-easy', door: 'start' });
    expect(field.getAttribute('placeholder')).toBe('What do you want to make?');
    expect(field.className).toContain('text-lg');
    const examples = screen.getByTestId('search-examples');
    expect(examples.textContent).toBe('Try:blue sword·make a pig fly·skyblock');
    expect(screen.getByText('Nothing you type here leaves your computer.')).toBeTruthy();
    await user.click(within(examples).getByRole('button', { name: 'blue sword' }));
    await waitFor(() => expect(fake.requests.at(-1)?.text).toBe('blue sword'));
    expect(document.activeElement).toBe(field);
    expect(screen.queryByTestId('search-empty')).toBeNull();
  });

  it('uses the toolbar wording on the toolbar door', () => {
    setup({ mode: 'very-easy' });
    expect(screen.getByRole('combobox').getAttribute('placeholder')).toBe(
      'Search or make anything',
    );
  });
});

describe('results', () => {
  it('hands a template its typed name; the set-up line shows for Minecraft results without the jar', async () => {
    const table = () => ({
      understood: { chips: [] },
      confident: true,
      best: [hit(TEMPLATE)],
      sections: blueSword().sections.filter((s) => s.id === 'minecraft'),
    });
    const { user, field, actions } = setup({ table, minecraftNames: false, mode: 'advanced' });
    await typed(user, field, 'sword template');
    expect(screen.getByTestId('search-minecraft-folder').textContent).toBe(
      "Set up your Minecraft folder to see Minecraft's own names and pictures.",
    );
    expect(screen.getByTestId('search-row-template:item_sword').textContent).toContain(
      'template:item_sword',
    );
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByTestId('search-name'));
    await user.keyboard('Ruby blade{Tab}{Enter}');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ which: 'add', options: { name: 'Ruby blade' } });
  });

  it('draws the preview of the selected result only', async () => {
    const preview = vi.fn((h: SearchHit) => <span data-testid="picture">{h.entry.id}</span>);
    const { user, field } = setup({ preview });
    await typed(user, field, 'blue sword');
    expect(screen.getByTestId('picture').textContent).toBe('flow:weapon');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('picture').textContent).toBe('starter:custom-sword');
    expect(new Set(preview.mock.calls.map(([h]) => h.entry.id))).toEqual(
      new Set(['flow:weapon', 'starter:custom-sword']),
    );
  });

  it('keeps the last answer when a query is replaced (null) and asks with the newest words', async () => {
    let calls = 0;
    const { user, field } = setup({
      table: (request) => {
        calls++;
        return request.text === 'blue sword' ? blueSword() : null;
      },
    });
    await typed(user, field, 'blue sword');
    await user.type(field, 'z');
    await act(async () => {});
    expect(calls).toBeGreaterThan(1);
    expect(screen.getByTestId('search-live').textContent).toBe('9 results. Best match: Weapon.');
  });

  it('stacks the preview below the list under 768 px (800 px at 200 % zoom)', async () => {
    const { user, field } = setup();
    await typed(user, field, 'blue sword');
    const body = screen.getByTestId('search-results').parentElement as HTMLElement;
    expect(body.className).toContain('flex-col');
    expect(body.className).toContain('md:flex-row');
    // No fixed width below the breakpoint: only `md:` widths.
    const fixed = (element: HTMLElement) =>
      element.className.split(/\s+/).filter((name) => /^(w|min-w)-([1-9]|\[)/.test(name));
    expect(fixed(screen.getByTestId('search-preview'))).toEqual([]);
    expect(fixed(screen.getByTestId('search-results'))).toEqual([]);
    expect(screen.getByTestId('search-panel').className).toContain('min-w-0');
  });
});

describe('reduced motion', () => {
  it('stops the list animation and smooth scrolling', async () => {
    const scrolls: ScrollIntoViewOptions[] = [];
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = (options?: boolean | ScrollIntoViewOptions) => {
      if (typeof options === 'object') scrolls.push(options);
    };
    try {
      const reduced = setup({ reducedMotion: true });
      await typed(reduced.user, reduced.field, 'blue sword');
      await reduced.user.keyboard('{ArrowDown}');
      expect(screen.getByTestId('search-panel').getAttribute('data-motion')).toBe('reduce');
      for (const option of screen.getAllByRole('option')) {
        expect(option.className).not.toContain('transition');
      }
      expect(scrolls.length).toBeGreaterThan(0);
      expect(scrolls.every((options) => options.behavior === 'auto')).toBe(true);
      cleanup();
      scrolls.length = 0;
      const full = setup({ reducedMotion: false });
      await typed(full.user, full.field, 'blue sword');
      await full.user.keyboard('{ArrowDown}');
      expect(screen.getByTestId('search-panel').getAttribute('data-motion')).toBe('full');
      expect(screen.getAllByRole('option')[0]?.className).toContain('transition');
      expect(scrolls.at(-1)?.behavior).toBe('smooth');
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it("follows the system's setting when none is given", async () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockImplementation(
        (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
      );
    try {
      setup({ reducedMotion: undefined });
      expect(screen.getByTestId('search-panel').getAttribute('data-motion')).toBe('reduce');
    } finally {
      matchMedia.mockRestore();
    }
  });
});

describe('SearchPanel: third-party plugins and the helper line (B670, B669)', () => {
  const plugged = (request: SearchRequest): SearchAnswer | null =>
    request.text === 'howdy'
      ? {
          understood: { chips: [] },
          confident: true,
          best: [
            hit(entry('entry:sample:greeting', 'template', 'Greeting', { plugin: 'sample' })),
            hit(entry('template:item_sword', 'template', 'Sword template', { plugin: 'items' })),
          ],
          sections: [],
        }
      : NOTHING;

  it("shows a third-party plugin's name on its row and nothing on a built-in one", async () => {
    const { user, field } = setup({
      table: plugged,
      pluginName: (id) => (id === 'sample' ? 'Sample Plugin' : undefined),
    });
    await typed(user, field, 'howdy');
    const own = await screen.findByTestId('search-row-entry:sample:greeting');
    expect(within(own).getByTestId('search-row-plugin').textContent).toBe('From Sample Plugin');
    const builtIn = screen.getByTestId('search-row-template:item_sword');
    expect(within(builtIn).queryByTestId('search-row-plugin')).toBeNull();
  });

  it('shows the quiet helper line once words are typed, with no Ask the AI helper row', async () => {
    const { user, field } = setup({ askAiLine: 'Add a key first.' });
    expect(screen.queryByTestId('search-ask-ai-line')).toBeNull();
    await typed(user, field, 'blue sword');
    expect(screen.getByTestId('search-ask-ai-line').textContent).toBe('Add a key first.');
    expect(screen.queryByTestId('search-ask-ai')).toBeNull();
  });
});
