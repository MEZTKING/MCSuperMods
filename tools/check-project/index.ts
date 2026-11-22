/**
 * `node tools/check-project/index.ts <project folder>... [--target mc-26.3|mc-26.4|all] [--json]`
 *
 * Checks that MSM project folders open, validate and export with no errors, as the app does
 * them (see README.md). The workspace packages import each other without file endings, as the
 * bundlers allow, so this entry first registers module hooks that resolve those imports for
 * Node, then loads the checker.
 */
import '../shared/workspace-hooks.ts';

const { main } = await import('./cli.ts');
process.exitCode = await main(process.argv.slice(2));
