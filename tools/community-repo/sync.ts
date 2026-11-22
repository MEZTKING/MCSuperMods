/**
 * `node tools/community-repo/sync.ts --repo <community repository> [--examples <folder>] [--check]`
 *
 * Writes the MCSuperMods community repository's `examples/` from MSM's `examples/` mirror, or
 * with `--check` fails when it is out of date (see README.md). The library entries the READMEs
 * describe come from `@msm/plugin-library`, so this entry first registers the module hooks
 * that let Node load the workspace packages, then the tool.
 */
import '../shared/workspace-hooks.ts';

const { main } = await import('./run.ts');
process.exitCode = await main(process.argv.slice(2));
