/**
 * `node tools/diff-targets/index.ts --from <target folder> --to <target folder>
 * [--out <file.json>] [--draft <CHANGES-draft.md>] [--check] [--mcdoc gated|refs]`
 *
 * Diffs two targets' vendored data into the generated half of a change set (ADR 0136 D2,
 * D11; see README.md). The workspace packages import each other without file endings, so this
 * entry first registers module hooks that resolve those imports for Node, then loads the tool.
 */
import '../shared/workspace-hooks.ts';

const { main } = await import('./cli.ts');
process.exitCode = await main(process.argv.slice(2));
