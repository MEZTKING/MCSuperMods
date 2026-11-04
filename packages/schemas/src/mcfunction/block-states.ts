/**
 * Block-state property checks inside commands (`setblock ~ ~ ~ oak_stairs[facing=up]`).
 *
 * Spyglass parses and completes `[key=value]` after a block id but does not check it (verified
 * against `@spyglassmc/java-edition` 0.3.70). The game rejects an unknown property or value as
 * a parse error, so MSM reports both as errors, from the block states the mcmeta summary
 * registered as `block` symbol members. Tags and unknown blocks are skipped: the
 * `undeclaredSymbol` linter already reports an unknown block id.
 */

import * as core from '@spyglassmc/core';

interface Located {
  message: string;
  range: core.Range;
}

interface StringLike extends core.AstNode {
  value: string;
}

function isStringNode(node: unknown): node is StringLike {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { type?: unknown }).type === 'string' &&
    typeof (node as { value?: unknown }).value === 'string'
  );
}

/** Problems for every `mcfunction:block/states` node below `root`. */
export function checkBlockStates(root: core.AstNode, ctx: core.CheckerContext): Located[] {
  const out: Located[] = [];
  core.traversePreOrder(
    root,
    () => true,
    () => true,
    (node) => {
      if (node.type !== 'mcfunction:block/states') return;
      const block = node.parent as (core.AstNode & { id?: core.ResourceLocationNode }) | undefined;
      const idNode = block?.type === 'mcfunction:block' ? block.id : undefined;
      if (!idNode || idNode.isTag) return;
      const id = core.ResourceLocationNode.toString(idNode, 'full');
      // The binder enters a reference for an unknown id, so look for a declaration.
      if (!ctx.symbols.query(ctx.doc, 'block', id).symbol?.declaration?.length) return;
      const states = core.getStates('block', [id], ctx);
      for (const child of node.children ?? []) {
        const pair = child as core.AstNode & { key?: unknown; value?: unknown };
        if (!isStringNode(pair.key)) continue;
        const key = pair.key.value;
        const values = states[key];
        if (values === undefined) {
          const known = Object.keys(states);
          out.push({
            message:
              known.length === 0
                ? `Block ${id} has no properties, so "${key}" is not allowed.`
                : `Block ${id} has no property "${key}". Expected one of: ${known.join(', ')}.`,
            range: pair.key.range,
          });
          continue;
        }
        if (!isStringNode(pair.value)) continue;
        const value = pair.value.value;
        if (value === '') {
          out.push({ message: `Property "${key}" of ${id} needs a value.`, range: pair.key.range });
        } else if (!values.includes(value)) {
          out.push({
            message: `Property "${key}" of ${id} cannot be "${value}". Expected one of: ${values.join(', ')}.`,
            range: pair.value.range,
          });
        }
      }
    },
  );
  return out;
}
