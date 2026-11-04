/**
 * The offline Spyglass mcfunction service (ADR 0014).
 *
 * Built from injected vendored data only: it never calls `je.initialize`, never fetches and
 * never reads files. Spyglass internals are used directly (`MetaRegistry`, `SymbolUtil`, the
 * linter plumbing of `Project.lint`); this file is the only code that changes on an upgrade.
 */

import * as core from '@spyglassmc/core';
import * as je from '@spyglassmc/java-edition';
import * as json from '@spyglassmc/json';
import * as mcdoc from '@spyglassmc/mcdoc';
import * as nbt from '@spyglassmc/nbt';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { checkBlockStates } from './block-states';
import { loadMcdocSymbols, readMcdocSymbolExport } from './mcdoc-symbols';
import type {
  McfunctionCheckOptions,
  McfunctionCompleteOptions,
  McfunctionCompletion,
  McfunctionData,
  McfunctionProblem,
  McfunctionService,
  McfunctionServiceOptions,
} from './types';

/** Sources longer than this (UTF-16 code units) are not parsed. */
export const MAX_SOURCE_LENGTH = 2 * 1024 * 1024;
/** Default cap on completion proposals. */
export const DEFAULT_COMPLETION_LIMIT = 200;

const LANGUAGE_ID = 'mcfunction';
const PROJECT_CONTRIBUTOR = 'msm-project';
/** Spyglass's symbol category for scoreboard objectives. */
const OBJECTIVE_CATEGORY = 'objective';
const PROJECT_URI = 'spyglass://msm';
const DEFAULT_URI = 'file:///msm/untitled.mcfunction';

type McmetaCommands = Parameters<typeof je.mcf.initialize>[1];
type McmetaSummary = Parameters<typeof je.dependency.symbolRegistrar>[0];
type ReleaseVersion = Parameters<typeof je.mcf.initialize>[2];

function offline(): Promise<never> {
  return Promise.reject(new Error('The mcfunction service has no file system or network access.'));
}

/** Externals that refuse every file, archive and network operation. */
const offlineExternals: core.Externals = {
  archive: { decompressBall: offline },
  error: {
    createKind: (kind, message) => Object.assign(new Error(message), { code: kind }),
    isKind: (e, kind) =>
      typeof e === 'object' && e !== null && (e as { code?: unknown }).code === kind,
  },
  fs: {
    chmod: offline,
    mkdir: offline,
    readdir: offline,
    readFile: offline,
    rm: offline,
    showFile: offline,
    stat: offline,
    unlink: offline,
    writeFile: offline,
  },
  web: { getCache: offline },
};

/** LSP `CompletionItemKind` names, indexed by value (Spyglass declares them as a const enum). */
const COMPLETION_KINDS = [
  'text',
  'text',
  'method',
  'function',
  'constructor',
  'field',
  'variable',
  'class',
  'interface',
  'module',
  'property',
  'unit',
  'value',
  'enum',
  'keyword',
  'snippet',
  'color',
  'file',
  'reference',
  'folder',
  'enumMember',
  'constant',
  'struct',
  'event',
  'operator',
  'typeParameter',
] as const;

/** Spyglass `ErrorSeverity`: Hint 0, Information 1, Warning 2, Error 3. */
function mapSeverity(severity: number): McfunctionProblem['severity'] {
  if (severity >= 3) return 'error';
  if (severity === 2) return 'warning';
  return 'info';
}

/** `file:///msm/data/<ns>/<folder>/<path>.mcfunction`. */
export function defaultFunctionUri(namespace: string, path: string, folder: string): string {
  return `file:///msm/data/${namespace}/${folder}/${path}.mcfunction`;
}

function normaliseId(id: string): string {
  const bare = id.startsWith('#') ? id.slice(1) : id;
  return bare.includes(':') ? bare : `minecraft:${bare}`;
}

/** A stable key for `projectIds`: categories and ids sorted, ids normalised. */
function projectIdsKey(ids: Readonly<Record<string, readonly string[]>> | undefined): string {
  if (!ids) return '[]';
  const entries = Object.keys(ids)
    .sort()
    .map((category) => {
      const list = ids[category] ?? [];
      const normalised = category === OBJECTIVE_CATEGORY ? list : list.map(normaliseId);
      return [category, [...new Set(normalised)].sort()];
    });
  return JSON.stringify(entries);
}

/** `scoreboard objectives add <name>` anywhere on a line (also after `execute ... run`). */
const OBJECTIVE_ADD = /(?:^|\s)scoreboard\s+objectives\s+add\s+([^\s$]+)(?=\s|$)/g;

/**
 * The scoreboard objectives a set of function sources creates with
 * `scoreboard objectives add <name>`, for `the `objective` category of `McfunctionCheckOptions.projectIds``. Comment
 * lines are skipped, as are macro names (`$(...)`), which are only known at run time. Sorted,
 * without duplicates; a lexical scan, so it never fails.
 *
 * @param sources - The text of every project function.
 */
export function collectProjectObjectives(sources: Iterable<string>): string[] {
  const found = new Set<string>();
  for (const source of sources) {
    for (const line of source.split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      for (const match of line.matchAll(OBJECTIVE_ADD)) {
        const name = match[1];
        if (name !== undefined) found.add(name);
      }
    }
  }
  return [...found].sort();
}

export async function createMcfunctionService(
  data: McfunctionData,
  options: McfunctionServiceOptions,
): Promise<McfunctionService> {
  const { mcVersion } = options;
  const logger = core.Logger.noop();
  const meta = new core.MetaRegistry();
  const symbols = new core.SymbolUtil({});
  const config = core.VanillaConfig;
  const cacheRoot = 'file:///msm/.spyglass-cache/' as const;
  const externals = offlineExternals;
  const release = mcVersion as ReleaseVersion;

  je.mcf.initialize(
    { cacheRoot, config, externals, isDebugging: false, logger, meta, projectRoots: [] },
    data.commands as McmetaCommands,
    release,
  );
  const summary = {
    blocks: data.blocks,
    commands: data.commands,
    fluids: je.dependency.Fluids,
    registries: data.registries,
    checksum: `msm:${mcVersion}`,
  } as unknown as McmetaSummary;
  je.dependency.symbolRegistrar(summary, release)(symbols, {});

  const typed = options.mcdocSymbols !== undefined;
  if (typed) {
    // What `je.initialize` does with the downloaded `@vanilla-mcdoc`, offline: declare the bound
    // type definitions, register mcdoc's built-in attributes (`id`, `color`, ...) and the
    // version-gating ones (`since`, `until`, `deprecated`) for this release.
    const exported = readMcdocSymbolExport(options.mcdocSymbols);
    mcdoc.initialize({ meta } as Parameters<typeof mcdoc.initialize>[0]);
    // The JSON and SNBT completers (and nbt's mcdoc attributes), as `je.initialize` registers
    // them; without these, completion inside `tellraw @a {"` or `summon ... {No` is empty.
    json.getInitializer()({ meta } as Parameters<ReturnType<typeof json.getInitializer>>[0]);
    nbt.initialize({ meta } as Parameters<typeof nbt.initialize>[0]);
    je.registerMcdocAttributes(meta, data.commands as McmetaCommands, release);
    loadMcdocSymbols(symbols, exported);
  }

  const project: core.ProjectData = {
    cacheRoot,
    config,
    ensureBindingStarted: async () => {},
    externals,
    // No file service: the service never reads files.
    fs: undefined as unknown as core.FileService,
    isDebugging: false,
    logger,
    meta,
    profilers: core.ProfilerFactory.noop(),
    projectRoots: [],
    roots: [],
    symbols,
    // What `je.initialize` would return; parsers and checkers gate syntax on `loadedVersion`.
    ctx: { loadedVersion: mcVersion, errorSource: mcVersion },
  };

  const parser = meta.getParserForLanguageId<core.AstNode>(LANGUAGE_ID);
  if (!parser) throw new Error('The mcfunction parser was not registered.');
  const parse: core.Parser<core.AstNode> = parser;
  const completer = meta.getCompleterForLanguageID(LANGUAGE_ID);
  const rootLiterals = rootCommandLiterals(data.commands);

  let currentIdsKey = '[]';
  function applyProjectIds(options: McfunctionCheckOptions): void {
    const ids = options.projectIds;
    const key = projectIdsKey(ids);
    if (key === currentIdsKey) return;
    symbols.clear({ contributor: PROJECT_CONTRIBUTOR });
    if (ids) {
      symbols.contributeAs(PROJECT_CONTRIBUTOR, () => {
        for (const [category, list] of Object.entries(ids)) {
          // Objective names are plain strings, not resource locations.
          const plain = category === OBJECTIVE_CATEGORY;
          for (const id of list) {
            symbols
              .query(PROJECT_URI, category, plain ? id : normaliseId(id))
              .enter({ usage: { type: 'declaration' } });
          }
        }
      });
    }
    currentIdsKey = key;
  }

  let queue: Promise<unknown> = Promise.resolve();
  function serialise<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  function toProblem(
    doc: TextDocument,
    error: core.LanguageError,
    code: McfunctionProblem['code'],
  ): McfunctionProblem {
    const startOffset = error.range.start;
    const endOffset = Math.max(error.range.end, startOffset);
    const startPos = doc.positionAt(startOffset);
    const endPos = doc.positionAt(endOffset);
    let end: number;
    if (endPos.line === startPos.line) {
      end = endPos.character;
    } else {
      const lineEnd = doc.offsetAt({ line: startPos.line + 1, character: 0 });
      const lineText = doc.getText({
        start: { line: startPos.line, character: 0 },
        end: doc.positionAt(lineEnd),
      });
      end = lineText.replace(/\r?\n$/, '').length;
    }
    return {
      severity: mapSeverity(error.severity),
      code,
      message: error.message,
      line: startPos.line,
      start: startPos.character,
      end: Math.max(end, startPos.character),
      offset: { start: startOffset, end: endOffset },
    };
  }

  function lint(node: core.AstNode, doc: TextDocument): Array<[core.LanguageError, string]> {
    const out: Array<[core.LanguageError, string]> = [];
    for (const [ruleName, rawValue] of Object.entries(config.lint)) {
      const result = core.LinterConfigValue.destruct(rawValue);
      if (!result) continue;
      const { ruleSeverity, ruleValue } = result;
      const { configValidator, linter, nodePredicate } = meta.getLinter(ruleName);
      if (!configValidator(ruleName, ruleValue, logger)) continue;
      const ctx = core.LinterContext.create(project, {
        doc,
        err: new core.LinterErrorReporter(ruleName, ruleSeverity, undefined),
        ruleName,
        ruleValue,
      });
      core.traversePreOrder(
        node,
        () => true,
        () => true,
        (n) => {
          if (nodePredicate(n)) linter(core.StateProxy.create(n), ctx);
        },
      );
      for (const error of ctx.err.dump()) out.push([error, ruleName]);
    }
    return out;
  }

  /**
   * Binds and checks `node`, as Spyglass does before linting or completing. The checker also
   * attaches mcdoc `typeDef`s to JSON and SNBT nodes, which their completers read. The caller
   * clears `uri`'s symbols afterwards.
   */
  async function bindAndCheck(
    node: core.AstNode,
    doc: TextDocument,
    uri: string,
  ): Promise<{ bctx: core.BinderContext; cctx: core.CheckerContext }> {
    // Drop what an earlier check of this document bound, then bind afresh.
    symbols.clear({ uri });
    const bctx = core.BinderContext.create(project, { doc });
    const binder = meta.getBinder(node.type);
    await symbols.contributeAsAsync('binder', async () => binder(node, bctx));
    const cctx = core.CheckerContext.create(project, { doc });
    const checker = meta.getChecker(node.type);
    await symbols.contributeAsAsync('checker', async () => checker(node, cctx));
    return { bctx, cctx };
  }

  async function runCheck(
    source: string,
    options: McfunctionCheckOptions,
  ): Promise<McfunctionProblem[]> {
    const uri = options.uri ?? DEFAULT_URI;
    if (source.length > MAX_SOURCE_LENGTH) {
      return [
        {
          severity: 'error',
          code: 'mcfunction.parse',
          message: 'This function is larger than 2 MB, so it was not checked.',
          line: 0,
          start: 0,
          end: 0,
          offset: { start: 0, end: 0 },
        },
      ];
    }
    applyProjectIds(options);
    const doc = TextDocument.create(uri, LANGUAGE_ID, 0, source);
    const problems: McfunctionProblem[] = [];

    const pctx = core.ParserContext.create(project, { doc });
    const node = parse(new core.Source(source), pctx);
    if (node === core.Failure) {
      return [failedParse()];
    }
    // `core.file` does this for Spyglass's own projects; checkers and completers walk up.
    core.AstNode.setParents(node);
    for (const e of pctx.err.dump()) problems.push(toProblem(doc, e, 'mcfunction.parse'));

    const { bctx, cctx } = await bindAndCheck(node, doc, uri);
    for (const e of bctx.err.dump()) problems.push(toProblem(doc, e, 'mcfunction.check'));
    for (const e of cctx.err.dump()) problems.push(toProblem(doc, e, 'mcfunction.check'));
    for (const { message, range } of checkBlockStates(node, cctx)) {
      problems.push(toProblem(doc, { message, range, severity: 3 }, 'mcfunction.check'));
    }

    for (const [e, rule] of lint(node, doc)) {
      problems.push(toProblem(doc, e, `mcfunction.lint.${rule}`));
    }

    symbols.clear({ uri });
    return problems.sort((a, b) => a.offset.start - b.offset.start || a.offset.end - b.offset.end);
  }

  async function runComplete(
    source: string,
    offset: number,
    options: McfunctionCompleteOptions,
  ): Promise<McfunctionCompletion[]> {
    if (source.length > MAX_SOURCE_LENGTH) return [];
    const limit = options.limit ?? DEFAULT_COMPLETION_LIMIT;
    const at = Math.min(Math.max(0, offset), source.length);
    applyProjectIds(options);
    const uri = options.uri ?? DEFAULT_URI;
    const doc = TextDocument.create(uri, LANGUAGE_ID, 0, source);
    const node = parse(new core.Source(source), core.ParserContext.create(project, { doc }));
    if (node === core.Failure) return [];
    core.AstNode.setParents(node);
    let items: readonly core.CompletionItem[];
    if (typed) {
      // JSON and SNBT completers need the `typeDef`s the checker attaches.
      await bindAndCheck(node, doc, uri);
      try {
        items = completer(node, core.CompleterContext.create(project, { doc, offset: at }));
      } finally {
        symbols.clear({ uri });
      }
    } else {
      items = completer(node, core.CompleterContext.create(project, { doc, offset: at }));
    }
    if (items.length === 0 && /^[ \t]*$/.test(linePrefix(source, at))) {
      // Spyglass offers nothing on a blank line; propose the root command literals there.
      items = rootLiterals.map((name) =>
        core.CompletionItem.create(name, at, { kind: KEYWORD_KIND }),
      );
    }

    const seen = new Set<string>();
    const out: Array<McfunctionCompletion & { sort: string }> = [];
    for (const item of items) {
      const prefix =
        item.range.start <= at && item.range.end >= item.range.start
          ? source.slice(item.range.start, at)
          : fallbackPrefix(source, at);
      const filter = (item.filterText ?? item.label).toLowerCase();
      if (!matchesPrefix(filter, prefix.toLowerCase())) continue;
      if (seen.has(item.label)) continue;
      seen.add(item.label);
      const completion: McfunctionCompletion & { sort: string } = {
        label: item.label,
        insertText: item.insertText ?? item.label,
        kind: COMPLETION_KINDS[item.kind ?? 1] ?? 'text',
        sort: item.sortText ?? item.label,
      };
      if (item.detail !== undefined) completion.detail = item.detail;
      out.push(completion);
    }
    out.sort((a, b) =>
      a.sort < b.sort
        ? -1
        : a.sort > b.sort
          ? 1
          : a.label < b.label
            ? -1
            : a.label > b.label
              ? 1
              : 0,
    );
    return out.slice(0, Math.max(0, limit)).map(({ sort: _sort, ...rest }) => rest);
  }

  return {
    mcVersion,
    check: (source, opts = {}) => serialise(() => runCheck(source, opts)),
    complete: (source, offset, opts = {}) => serialise(() => runComplete(source, offset, opts)),
  };
}

function failedParse(): McfunctionProblem {
  return {
    severity: 'error',
    code: 'mcfunction.parse',
    message: 'This function could not be parsed.',
    line: 0,
    start: 0,
    end: 0,
    offset: { start: 0, end: 0 },
  };
}

/** LSP `CompletionItemKind.Keyword`. */
const KEYWORD_KIND = 14 as core.CompletionKind;

/** Names of the literal children of the command tree root, sorted. */
function rootCommandLiterals(commands: unknown): string[] {
  if (typeof commands !== 'object' || commands === null) return [];
  const children = (commands as { children?: unknown }).children;
  if (typeof children !== 'object' || children === null) return [];
  return Object.entries(children)
    .filter(
      ([, child]) =>
        typeof child === 'object' &&
        child !== null &&
        (child as { type?: unknown }).type === 'literal',
    )
    .map(([name]) => name)
    .sort();
}

/** The text of the line containing `offset`, from its start up to `offset`. */
function linePrefix(source: string, offset: number): string {
  const start = offset === 0 ? 0 : source.lastIndexOf('\n', offset - 1) + 1;
  return source.slice(start, offset);
}

/** The text from the last whitespace, `[`, `=` or `,` before `offset` up to `offset`. */
function fallbackPrefix(source: string, offset: number): string {
  let i = offset;
  while (i > 0 && !/[\s[=,]/.test(source.charAt(i - 1))) i--;
  return source.slice(i, offset);
}

/** A resource location also matches when the prefix omits the `minecraft:` namespace. */
function matchesPrefix(candidate: string, prefix: string): boolean {
  if (prefix === '') return true;
  if (candidate.startsWith(prefix)) return true;
  return (
    candidate.startsWith('minecraft:') && candidate.slice('minecraft:'.length).startsWith(prefix)
  );
}
