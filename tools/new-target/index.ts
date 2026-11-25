/**
 * `node tools/new-target/index.ts --from mc-<a> --version <new>` makes `packages/targets/mc-<new>`
 * from the newest target; `--repin mc-<b> --version <new>` refreshes one; `--check` only says
 * whether Mojang has a version newer than each target; `--dry-run [--out <dir>]` writes
 * everything outside the repository (ADR 0136 D11; see README.md).
 *
 * The workspace packages import each other without file endings, and the tool loads a target's
 * own `src/index.ts`, so this entry first registers module hooks that resolve those imports for
 * Node, then loads the tool.
 */
import '../shared/workspace-hooks.ts';

const { main } = await import('./cli.ts');
process.exitCode = await main(process.argv.slice(2));
