import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, releaseNotesOf } from '../src/main/release-notes';

describe('releaseNotesOf', () => {
  it('turns the GitHub release body HTML into the Markdown subset the renderer shows', () => {
    const html =
      '<h2>Added</h2>\n<ul>\n<li><strong>What&#39;s new.</strong> See <code>Help</code> and ' +
      '<a href="https://github.com/MEZTKING/MCSuperMods/releases" rel="nofollow">releases</a>.</li>\n' +
      '<li>Fish &amp; chips &lt;b&gt;</li>\n</ul>\n<p>Thanks.</p><script>alert(1)</script>' +
      '<img src="x" onerror="alert(2)"><a href="javascript:alert(3)">bad</a>';
    expect(releaseNotesOf({ releaseNotes: html })).toBe(
      "## Added\n\n- **What's new.** See `Help` and [releases](https://github.com/MEZTKING/MCSuperMods/releases).\n- Fish & chips <b>\n\nThanks.\n\nbad",
    );
  });

  it('keeps plain text and joins full-changelog entries by version', () => {
    expect(releaseNotesOf({ releaseNotes: '### Added\r\n\r\n- Things\r\n' })).toBe(
      '### Added\n\n- Things',
    );
    expect(
      releaseNotesOf({
        releaseNotes: [
          { version: '0.7.0', note: '<ul><li>New</li></ul>' },
          { version: '0.6.1', note: '' },
          { nonsense: true },
        ],
      }),
    ).toBe('## 0.7.0\n\n- New\n\n## 0.6.1');
  });

  it('is undefined without notes, and caps long notes', () => {
    expect(releaseNotesOf({ version: '1.0.0' })).toBeUndefined();
    expect(releaseNotesOf({ releaseNotes: 'No content.'.slice(0, 0) })).toBeUndefined();
    expect(releaseNotesOf(null)).toBeUndefined();
    const long = Array.from({ length: 400 }, (_, index) => `- line ${index}`).join('\n');
    const capped = releaseNotesOf({ releaseNotes: long }, 200) ?? '';
    expect(capped.length).toBeLessThanOrEqual(200);
    expect(capped.endsWith('…')).toBe(true);
  });

  it('drops comments and styles and decodes numeric entities', () => {
    expect(htmlToMarkdown('<!-- x --><style>p{}</style><p>&#x41;&#66;&nbsp;c</p>')).toBe('AB c');
  });
});
