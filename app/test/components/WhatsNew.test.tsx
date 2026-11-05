// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJsonText from '../../package.json?raw';
import { Markdown, parseMarkdown } from '../../src/renderer/src/components/Markdown';
import { WhatsNewDialog } from '../../src/renderer/src/components/WhatsNewDialog';
import { changelogSection, loadChangelog } from '../../src/renderer/src/whats-new';

afterEach(cleanup);

const CHANGELOG = `# Changelog

## [Unreleased]

- Coming soon.

## [0.6.0] - 2026-11-05

### Added

- **Scripting.** See [the guide](https://example.com/guide).

## [0.5.0] - 2026-11-05

- Mobs.

[0.6.0]: https://github.com/MEZTKING/MCSuperMods/releases/tag/v0.6.0
`;

describe('changelogSection', () => {
  it('finds one version, with or without brackets, v or date', () => {
    expect(changelogSection(CHANGELOG, '0.6.0')).toBe(
      '### Added\n\n- **Scripting.** See [the guide](https://example.com/guide).',
    );
    expect(changelogSection(CHANGELOG, 'v0.5.0')).toBe('- Mobs.');
    expect(changelogSection(CHANGELOG, 'Unreleased')).toBe('- Coming soon.');
    expect(changelogSection(CHANGELOG, '0.6')).toBeNull();
    expect(changelogSection(CHANGELOG, '0.4.0')).toBeNull();
    expect(changelogSection('## 1.0.0\n\n', '1.0.0')).toBeNull();
  });

  it('has a section for the app version in the bundled CHANGELOG.md', async () => {
    const { version } = JSON.parse(packageJsonText) as { version: string };
    const changelog = await loadChangelog();
    expect(changelog.startsWith('# Changelog\n')).toBe(true);
    expect(changelogSection(changelog, version)).not.toBeNull();
    expect(changelogSection(changelog, 'Unreleased')).not.toBeNull();
    // Keep a Changelog headings: `## [x.y.z] - YYYY-MM-DD`.
    for (const line of changelog.split('\n').filter((entry) => entry.startsWith('## '))) {
      expect(line).toMatch(/^## \[(?:Unreleased|\d+\.\d+\.\d+)\](?: - \d{4}-\d{2}-\d{2})?$/);
    }
  });
});

describe('Markdown', () => {
  it('parses headings, lists, paragraphs and code, and drops link definitions', () => {
    expect(
      parseMarkdown(
        '# Title\n\nSome\ntext.\n\n- one\n  more\n- two\n\n```\n<b>x</b>\n```\n[a]: https://x',
      ),
    ).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'Some text.' },
      { type: 'list', items: ['one more', 'two'] },
      { type: 'code', text: '<b>x</b>' },
    ]);
  });

  it('renders raw HTML as text, and only https links as links', () => {
    const { container } = render(
      <Markdown
        source={
          '<img src=x onerror=alert(1)> **bold** `code` [safe](https://example.com) [bad](javascript:alert(1))'
        }
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('code').tagName).toBe('CODE');
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://example.com');
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(links[0]?.getAttribute('rel')).toContain('noopener');
    expect(container.textContent).toContain('bad');
  });
});

describe('WhatsNewDialog', () => {
  it('shows the bundled section for the version', async () => {
    render(<WhatsNewDialog version="0.6.0" load={async () => CHANGELOG} onClose={() => {}} />);
    const dialog = screen.getByTestId('whats-new-dialog');
    expect(within(dialog).getByText("What's new in MCSuperMods 0.6.0")).toBeTruthy();
    expect(await within(dialog).findByText('Scripting.')).toBeTruthy();
    expect(within(dialog).getByText('All releases on GitHub').getAttribute('href')).toBe(
      'https://github.com/MEZTKING/MCSuperMods/releases',
    );
  });

  it('prefers release notes from the update feed, and says when there are none', async () => {
    const load = vi.fn(async () => CHANGELOG);
    const { unmount } = render(
      <WhatsNewDialog version="0.7.0" notes={'- Fresh notes'} load={load} onClose={() => {}} />,
    );
    expect(screen.getByText('Fresh notes')).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
    unmount();
    render(<WhatsNewDialog version="0.7.0" load={load} onClose={() => {}} />);
    expect(await screen.findByTestId('whats-new-missing')).toBeTruthy();
  });

  it('closes', async () => {
    const onClose = vi.fn();
    render(<WhatsNewDialog version="0.6.0" load={async () => CHANGELOG} onClose={onClose} />);
    await userEvent.setup().click(screen.getByTestId('whats-new-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
