import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig } from 'vitepress';

/**
 * The MCSuperMods documentation site (ADR 0039): the user guide in `docs/guide/`, built by
 * VitePress and deployed to GitHub Pages under `/MCSuperMods/`. B158 fills the navigation.
 *
 * Dead links fail the build. `MSM_SITE_IGNORE_DEAD_LINKS=1` ignores every dead link.
 */
const ignoreAllDeadLinks = process.env.MSM_SITE_IGNORE_DEAD_LINKS === '1';

/**
 * The guide's relative links to repository files outside the guide, dead on the site until
 * B158 rewrites them as absolute GitHub URLs; listed so that `pnpm build` (which builds every
 * package) passes meanwhile, while any other dead link still fails the build. B158 deletes
 * this list.
 */
const KNOWN_REPOSITORY_LINKS = [
  './../../README',
  './../../examples/README',
  './../../fixtures/sample-mob/README',
  './../../fixtures/sample-script/README',
  './../../fixtures/sample-worldgen/README',
  './../DESIGN',
  './../ROADMAP',
  './../adr/0020-templates-starters-examples',
];

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
  ignoreDeadLinks: ignoreAllDeadLinks ? true : KNOWN_REPOSITORY_LINKS,
  // The guide is plain Markdown that also renders on GitHub, and its prose names placeholders
  // such as <namespace>: treat raw HTML as text so Vue does not read them as elements.
  markdown: { html: false },
  vite: { resolve: { alias: [{ find: /^vue(?=$|\/)/, replacement: vueRoot }] } },
  themeConfig: {
    sidebar: [],
  },
});
