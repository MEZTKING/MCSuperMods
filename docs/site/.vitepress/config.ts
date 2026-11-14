import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig } from 'vitepress';

/**
 * The MCSuperMods documentation site (ADR 0039): the user guide in `docs/guide/`, built by
 * VitePress and deployed to GitHub Pages under `/MCSuperMods/` by `.github/workflows/docs.yml`.
 *
 * Dead links fail the build. Guide pages link to repository files outside `docs/guide/` with
 * absolute `https://github.com/MEZTKING/MCSuperMods/blob/main/…` URLs (ADR 0039 D2), so every
 * relative link must resolve to another guide page.
 */

const repository = 'https://github.com/MEZTKING/MCSuperMods';

/**
 * The pages live outside this package (`srcDir` is `../guide`), where pnpm's strict layout
 * lets nothing resolve `vue`; point the compiled pages at this package's copy.
 */
const vueRoot = dirname(createRequire(import.meta.url).resolve('vue/package.json'));

export default defineConfig({
  srcDir: '../guide',
  base: '/MCSuperMods/',
  title: 'MCSuperMods',
  description: 'Desktop mod maker for Minecraft Java: the user guide.',
  lang: 'en-GB',
  // The guide's index is README.md (it also renders on GitHub); serve it as the home page.
  rewrites: { 'README.md': 'index.md' },
  ignoreDeadLinks: false,
  lastUpdated: false,
  // The guide is plain Markdown that also renders on GitHub, and its prose names placeholders
  // such as <namespace>: treat raw HTML as text so Vue does not read them as elements.
  markdown: { html: false },
  vite: { resolve: { alias: [{ find: /^vue(?=$|\/)/, replacement: vueRoot }] } },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'GitHub', link: repository },
    ],
    // The order of the guide index table (docs/guide/README.md).
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Your first mod', link: '/first-mod' },
          { text: 'Getting started', link: '/getting-started' },
          { text: 'Structures', link: '/structures' },
          { text: 'Worldgen', link: '/worldgen' },
          { text: 'Blocks and items', link: '/blocks-and-items' },
          { text: 'The Creator', link: '/creator' },
          { text: 'Status effects and throwables', link: '/effects-and-throwables' },
          { text: 'Adding to vanilla', link: '/adding-to-vanilla' },
          { text: 'Entities and models', link: '/entities-and-models' },
          { text: 'Scripting', link: '/scripting' },
          { text: 'Eject to a Java project', link: '/eject' },
          { text: 'The AI helper', link: '/ai-helper' },
          { text: 'Minecraft versions', link: '/targets' },
          { text: 'Plugins', link: '/plugins' },
          { text: 'Modpacks', link: '/modpacks' },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'Templates, starters and examples', link: '/templates-and-examples' }],
      },
    ],
    outline: [2, 3],
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: repository }],
    footer: {
      message: 'Released under the MIT Licence.',
      copyright: 'Copyright (c) 2026 MEZTKING and MCSuperMods contributors',
    },
  },
});
