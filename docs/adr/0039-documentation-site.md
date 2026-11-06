# ADR 0039: Documentation site from `docs/guide/`

## Context

The user guide is eight Markdown pages plus an index under `docs/guide/`, written for GitHub rendering with relative links into the repository (`../../README.md#…`, `../DESIGN.md`, `../../examples/README.md`). The ROADMAP asks for a documentation site. Checked 2026-11-05 on npm and GitHub:

- VitePress `1.6.4` (2025-08-05) depends on Vite `^5.4`; VitePress `2.0.0-alpha.21` (2026-10-25) depends on Vite `^8.3.4`, Vue 3.5 and Shiki 4; the repository's catalog pins Vite `8.3.5`.
- Starlight `0.42.9` (2026-11-04) requires Astro `^7.2.10` (7.4.6 current): a second framework.
- GitHub Pages deploys from Actions with `actions/configure-pages`, `actions/upload-pages-artifact` and `actions/deploy-pages` under the permissions `pages: write` and `id-token: write`; no repository secret is needed. The repository is public and has Pages off (`has_pages: false`); switching Pages' source to "GitHub Actions" is a one-time setting the user makes.

## Decision

**D1. VitePress, pinned.** The site is a workspace package `docs/site/` (`@msm/site`, private) with VitePress `2.0.0-alpha.21` pinned exactly (it shares the catalog's Vite 8; if the alpha fails to build, the fallback is `1.6.4` with its own Vite 5 inside the package, and nothing else changes). `srcDir` is `../guide`, so the pages stay where they are and GitHub keeps rendering them; `docs/guide/README.md` is the site's home page. Dead-link checking is on (`ignoreDeadLinks: false`): a link in the guide that does not resolve fails the build.

**D2. Links.** Guide pages link to repository files (README sections, `examples/`, `fixtures/*/README.md`, `DESIGN.md`, `ROADMAP.md`, ADRs) with absolute `https://github.com/MEZTKING/MCSuperMods/blob/main/…` URLs, which work on GitHub and on the site; links between guide pages stay relative (`blocks-and-items.md#…`). Images, if any, live in `docs/guide/images/`.

**D3. Deployment.** `.github/workflows/docs.yml` builds the site on every push to `main` (and on manual dispatch) and deploys it to GitHub Pages at `https://meztking.github.io/MCSuperMods/` (`base: '/MCSuperMods/'`). The CI workflow's `pnpm build` also builds the site on every push (turbo picks up the package's `build` script), so broken links fail CI before `main`. The action versions are checked at implementation (verify at implementation).

**D4. Content scope.** The site is the user guide only: what the app does and how to use it, plus the plugin author pages added in Phase 7 (`plugins.md`, `targets.md`) and the contribution guide (`CONTRIBUTING.md` is linked, not copied). DESIGN, ROADMAP, ADRs and DEVLOG stay repository documents.

## Consequences

- One more workspace package and one more workflow; the site's `dist/` and `.vitepress/cache/` are ignored by git.
- `tools/check-deps` gets a `@msm/site: []` layer entry; the package has no internal dependencies.
- The user enables Pages once (Settings > Pages > Source: GitHub Actions); until then the workflow's deploy step fails with a clear message while the build step passes.

## Status

**Accepted (2026-11-06).** Scaffolded by B152, built by B158 (VitePress 2.0.0-alpha.21 built the guide, so the 1.6.4 fallback was not needed; dead links fail the build; `docs.yml` deploys on push to `main` once the repository owner sets Pages to "GitHub Actions"). Later pages (`creator.md`, `ai-helper.md`) joined the sidebar; B161 adds the plugins and targets pages.
