// @vitest-environment happy-dom
/**
 * Home's Your mods (ADR 0128 D4, D5): cards above the Showcase with the mod's picture (its own,
 * else a drawn monogram), its name, its things and when it was opened; Open (`home-recent-<n>`),
 * Show in folder and Remove from this list; the missing folder's line and Remove; eight cards,
 * then See all my mods; the arrow keys; the order on Home without a mod.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Home } from '../../../src/renderer/src/components/home/Home';
import {
  clearRecentSummaries,
  monogram,
  openedAgo,
  thingsInWords,
} from '../../../src/renderer/src/components/home/recent-summary';
import { MOD_FOLDER_GONE, YourMods } from '../../../src/renderer/src/components/home/YourMods';
import type { RecentProjectSummary, RecentProjectView } from '../../../src/shared/platform';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function mod(name: string, hoursAgo: number, exists = true): RecentProjectView {
  return {
    root: `/mods/${name.toLowerCase().replaceAll(' ', '_')}`,
    name,
    openedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    exists,
  };
}

afterEach(() => {
  cleanup();
  clearRecentSummaries();
});

describe('Your mods', () => {
  it('shows each mod as a card with its picture, things and when it was opened', async () => {
    const summaries: Record<string, RecentProjectSummary> = {
      '/mods/ruby_mod': { things: 4, picture: PNG, pictureFrom: 'pack' },
      '/mods/elm_mod': { things: 1, picture: null, pictureFrom: null },
    };
    const summary = vi.fn(async (root: string) => summaries[root] as RecentProjectSummary);
    const onOpen = vi.fn();
    render(
      <YourMods
        recent={[mod('Ruby Mod', 2), mod('Elm Mod', 30)]}
        onOpen={onOpen}
        summary={summary}
        now={() => NOW}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Your mods' })).toBeTruthy();
    const ruby = screen.getByTestId('home-recent-card-0');
    expect(ruby.textContent).toContain('Ruby Mod');
    expect(ruby.textContent).toContain('Opened 2 hours ago');
    expect(screen.getByTestId('home-recent-card-1').textContent).toContain('Opened yesterday');
    await waitFor(() =>
      expect(screen.getByTestId('home-recent-picture-0').dataset.picture).toBe('own'),
    );
    expect(screen.getByTestId('home-recent-things-0').textContent).toBe('4 things');
    await waitFor(() =>
      expect(screen.getByTestId('home-recent-things-1').textContent).toBe('1 thing'),
    );
    // No picture of its own: the drawn monogram.
    const elm = screen.getByTestId('home-recent-picture-1');
    expect(elm.dataset.picture).toBe('monogram');
    expect(elm.textContent).toBe('EM');
    fireEvent.click(screen.getByRole('button', { name: 'Open Ruby Mod' }));
    expect(onOpen).toHaveBeenCalledWith('/mods/ruby_mod');
    expect(screen.getByTestId('home-recent-0')).toBe(
      screen.getByRole('button', { name: 'Open Ruby Mod' }),
    );
  });

  it('reads each mod once and never blocks the cards', async () => {
    let release: (value: RecentProjectSummary) => void = () => {};
    const summary = vi.fn(
      () =>
        new Promise<RecentProjectSummary>((resolve) => {
          release = resolve;
        }),
    );
    const { rerender } = render(
      <YourMods recent={[mod('Ruby Mod', 2)]} onOpen={vi.fn()} summary={summary} now={() => NOW} />,
    );
    // Drawn at once, with the monogram, before the read answers.
    expect(screen.getByTestId('home-recent-picture-0').dataset.picture).toBe('monogram');
    rerender(
      <YourMods recent={[mod('Ruby Mod', 2)]} onOpen={vi.fn()} summary={summary} now={() => NOW} />,
    );
    release({ things: 0, picture: PNG, pictureFrom: 'texture' });
    await waitFor(() =>
      expect(screen.getByTestId('home-recent-picture-0').dataset.picture).toBe('own'),
    );
    expect(screen.getByTestId('home-recent-things-0').textContent).toBe('No things yet');
    expect(summary).toHaveBeenCalledTimes(1);
  });

  it('offers Show in folder and Remove from this list in the card’s menu', async () => {
    const onRemove = vi.fn();
    const onShowInFolder = vi.fn();
    render(
      <YourMods
        recent={[mod('Ruby Mod', 2)]}
        onOpen={vi.fn()}
        onRemove={onRemove}
        onShowInFolder={onShowInFolder}
        now={() => NOW}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'More for Ruby Mod' }));
    await user.click(await screen.findByTestId('home-recent-show'));
    expect(onShowInFolder).toHaveBeenCalledWith('/mods/ruby_mod');
    await user.click(screen.getByRole('button', { name: 'More for Ruby Mod' }));
    await user.click(await screen.findByText('Remove from this list'));
    expect(onRemove).toHaveBeenCalledWith('/mods/ruby_mod');
  });

  it('says when a mod’s folder is gone, with Remove and no Open', () => {
    const onRemove = vi.fn();
    const summary = vi.fn(
      async (): Promise<RecentProjectSummary> => ({ things: 1, picture: null, pictureFrom: null }),
    );
    render(
      <YourMods
        recent={[mod('Ruby Mod', 2), mod('Gone Mod', 5, false)]}
        onOpen={vi.fn()}
        onRemove={onRemove}
        summary={summary}
        now={() => NOW}
      />,
    );
    expect(screen.getByTestId('home-recent-missing-1').textContent).toBe(MOD_FOLDER_GONE);
    expect(screen.queryByTestId('home-recent-1')).toBeNull();
    fireEvent.click(screen.getByTestId('home-recent-remove-1'));
    expect(onRemove).toHaveBeenCalledWith('/mods/gone_mod');
    // A gone folder is never read.
    expect(summary).not.toHaveBeenCalledWith('/mods/gone_mod');
  });

  it('shows eight cards, then See all my mods with every one', async () => {
    const recent = Array.from({ length: 10 }, (_, index) => mod(`Mod ${index}`, index + 1));
    const onOpen = vi.fn();
    render(<YourMods recent={recent} onOpen={onOpen} now={() => NOW} />);
    expect(screen.getAllByTestId(/^home-recent-card-\d+$/)).toHaveLength(8);
    fireEvent.click(screen.getByTestId('home-recent-all'));
    const dialog = await screen.findByTestId('your-mods-dialog');
    expect(within(dialog).getAllByTestId(/^home-recent-card-\d+$/)).toHaveLength(10);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open Mod 9' }));
    expect(onOpen).toHaveBeenCalledWith('/mods/mod_9');
    await waitFor(() => expect(screen.queryByTestId('your-mods-dialog')).toBeNull());
  });

  it('moves between the cards with the arrow keys', () => {
    render(
      <YourMods
        recent={[mod('A Mod', 1), mod('B Mod', 2), mod('C Mod', 3)]}
        onOpen={vi.fn()}
        now={() => NOW}
      />,
    );
    const first = screen.getByTestId('home-recent-0');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('home-recent-1'));
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
  });

  it('comes above the showcase, and More ideas under it, on Home without a mod', () => {
    render(
      <Home
        project={null}
        tiles={[]}
        onTile={vi.fn()}
        cards={[]}
        texturesFolder="textures"
        onOpenThing={vi.fn()}
        onRenameThing={vi.fn()}
        onDuplicateThing={vi.fn()}
        onDeleteThing={vi.fn()}
        onNewProject={vi.fn()}
        onOpenProject={vi.fn()}
        recentProjects={[mod('Ruby Mod', 2)]}
        onOpenRecent={vi.fn()}
        showcase={<p data-testid="the-showcase">Showcase</p>}
        moreIdeas={<p data-testid="the-ideas">Ideas</p>}
      />,
    );
    const home = screen.getByTestId('home');
    const order = [
      screen.getByTestId('home-new'),
      screen.getByTestId('home-your-mods'),
      screen.getByTestId('the-showcase'),
      screen.getByTestId('the-ideas'),
    ];
    for (let at = 1; at < order.length; at += 1) {
      const before = order[at - 1] as Node;
      const after = order[at] as Node;
      expect(home.contains(after)).toBe(true);
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Very easy shows no ids or paths on the cards.
    expect(screen.getByTestId('home-your-mods').textContent).not.toContain('/mods/');
  });
});

describe('the words of a card', () => {
  it('says how long ago and how many things', () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    expect(openedAgo(at(10_000), NOW)).toBe('just now');
    expect(openedAgo(at(60_000), NOW)).toBe('1 minute ago');
    expect(openedAgo(at(7_200_000), NOW)).toBe('2 hours ago');
    expect(openedAgo(at(86_400_000 * 3), NOW)).toBe('3 days ago');
    expect(openedAgo(at(86_400_000 * 21), NOW)).toBe('3 weeks ago');
    expect(openedAgo(at(86_400_000 * 400), NOW)).toBe('13 months ago');
    expect(openedAgo('not a time', NOW)).toBe('');
    expect(thingsInWords(0)).toBe('No things yet');
    expect(thingsInWords(1)).toBe('1 thing');
    expect(thingsInWords(12)).toBe('12 things');
    expect(monogram('Ruby Mod')).toBe('RM');
    expect(monogram('elm')).toBe('E');
    expect(monogram('---')).toBe('?');
  });
});
