import { defineConfig } from 'vitepress';

/**
 * The MCSuperMods documentation site (ADR 0039): the user guide in `docs/guide/`, built by
 * VitePress and deployed to GitHub Pages under `/MCSuperMods/`. B158 fills the navigation.
 *
 * Dead links fail the build. `MSM_SITE_IGNORE_DEAD_LINKS=1` lets the build pass while the
 * guide still links to repository files with relative paths (until B158 rewrites them).
 */
const ignoreDeadLinks = process.env.MSM_SITE_IGNORE_DEAD_LINKS === '1';

export default defineConfig({
  srcDir: '../guide',
  base: '/MCSuperMods/',
  title: 'MCSuperMods',
  description: 'Desktop mod maker for Minecraft Java: the user guide.',
  lang: 'en-GB',
  // The guide's index is README.md (it also renders on GitHub); serve it as the home page.
  rewrites: { 'README.md': 'index.md' },
  ignoreDeadLinks,
  themeConfig: {
    sidebar: [],
  },
});
