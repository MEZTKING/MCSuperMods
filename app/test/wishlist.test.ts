import { describe, expect, it } from 'vitest';
import {
  addWish,
  parseWishlist,
  serialiseWishlist,
  wishlistText,
} from '../src/renderer/src/wishlist/wishlist';

const now = new Date('2026-11-08T10:00:00Z');

describe('Wishlist (ADR 0053)', () => {
  it('adds, merges by title and round-trips through the file', () => {
    let list = addWish(
      [],
      { source: 'ai', title: 'Velocity', request: 'Push me', missing: 'No call' },
      now,
    );
    list = addWish(
      list,
      { source: 'user', title: 'Portal block', request: '', missing: 'No portals' },
      now,
    );
    list = addWish(
      list,
      { source: 'ai', title: 'velocity', request: 'Push me', missing: 'Still none' },
      now,
    );
    expect(list.map((entry) => [entry.title, entry.missing])).toEqual([
      ['velocity', 'Still none'],
      ['Portal block', 'No portals'],
    ]);
    const text = serialiseWishlist(list);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text).format).toBe(1);
    expect(parseWishlist(text)).toEqual(list);
    expect(parseWishlist('not json')).toEqual([]);
    expect(parseWishlist('{"entries":[{"id":"x"}]}')).toEqual([]);
  });

  it('writes the open wishes as text to send on', () => {
    const list = addWish(
      [],
      {
        source: 'ai',
        title: 'Velocity',
        request: 'Push me',
        missing: 'No call',
        builtInstead: 'Teleports',
      },
      now,
    );
    expect(wishlistText(list, 'Ruby Mod')).toBe(
      'MCSuperMods Wishlist for Ruby Mod (1 open):\n\n1. Velocity\n   Asked for: Push me\n   Missing: No call\n   Built instead: Teleports',
    );
    expect(
      wishlistText(
        list.map((entry) => ({ ...entry, status: 'done' as const })),
        'Ruby Mod',
      ),
    ).toBe('MCSuperMods Wishlist for Ruby Mod: nothing open.');
  });
});
