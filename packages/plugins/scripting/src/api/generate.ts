/**
 * Generates `msm-runtime.d.ts` from the script API description (ADR 0032 D1).
 *
 * The output is deterministic: interfaces and members sorted by name (overloads keep their
 * JSON order), two-space indentation, LF line endings and a trailing newline. Every
 * property is `readonly`: scripts change the game through methods, never by assignment.
 */
import type {
  ScriptApi,
  ScriptApiMember,
  ScriptApiMethod,
  ScriptApiParam,
  ScriptApiSignature,
} from './types';

const INDENT = '  ';

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedEntries<T>(record: Record<string, T>): [string, T][] {
  return Object.entries(record).sort(([a], [b]) => byName(a, b));
}

function capitalise(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function checkDoc(text: string): string {
  if (text.includes('*/')) throw new Error(`A doc comment may not contain "*/": ${text}`);
  return text;
}

function jsdoc(indent: string, doc: string, signature?: ScriptApiSignature): string[] {
  const tags: string[] = [];
  for (const param of signature?.params ?? []) {
    if (param.doc !== undefined) tags.push(`@param ${param.name} - ${checkDoc(param.doc)}`);
  }
  if (tags.length === 0) return [`${indent}/** ${checkDoc(doc)} */`];
  return [
    `${indent}/**`,
    `${indent} * ${checkDoc(doc)}`,
    `${indent} *`,
    ...tags.map((tag) => `${indent} * ${tag}`),
    `${indent} */`,
  ];
}

function paramList(params: ScriptApiParam[]): string {
  return params.map((p) => `${p.name}${p.optional === true ? '?' : ''}: ${p.type}`).join(', ');
}

function signatures(method: ScriptApiMethod): ScriptApiSignature[] {
  if (method.overloads !== undefined) return method.overloads;
  const signature: ScriptApiSignature = { params: method.params ?? [], doc: method.doc };
  if (method.returns !== undefined) signature.returns = method.returns;
  return [signature];
}

/** The interface name of a namespace member: the owner's name plus the member's, capitalised. */
function namespaceTypeName(owner: string, member: string): string {
  return `${owner}${capitalise(member)}`;
}

interface InterfaceDecl {
  doc: string;
  extends?: string;
  members: Record<string, ScriptApiMember>;
}

function collectInterfaces(api: ScriptApi): Map<string, InterfaceDecl> {
  const decls = new Map<string, InterfaceDecl>();
  const add = (name: string, decl: InterfaceDecl): void => {
    if (decls.has(name)) throw new Error(`Duplicate interface name ${name}`);
    decls.set(name, decl);
    for (const [memberName, member] of Object.entries(decl.members)) {
      if (member.kind === 'namespace') {
        add(namespaceTypeName(name, memberName), { doc: member.doc, members: member.members });
      }
    }
  };
  for (const [name, type] of Object.entries(api.types)) {
    const decl: InterfaceDecl = { doc: type.doc, members: type.members };
    if (type.extends !== undefined) decl.extends = type.extends;
    add(name, decl);
  }
  for (const [name, global] of Object.entries(api.globals)) {
    add(capitalise(name), { doc: global.doc, members: global.members });
  }
  return decls;
}

function memberLines(owner: string, name: string, member: ScriptApiMember): string[] {
  switch (member.kind) {
    case 'property':
      return [
        ...jsdoc(INDENT, member.doc),
        `${INDENT}readonly ${name}${member.optional === true ? '?' : ''}: ${member.type};`,
      ];
    case 'namespace':
      return [
        ...jsdoc(INDENT, member.doc),
        `${INDENT}readonly ${name}: ${namespaceTypeName(owner, name)};`,
      ];
    case 'method':
      return signatures(member).flatMap((signature) => [
        ...jsdoc(INDENT, signature.doc ?? member.doc, signature),
        `${INDENT}${name}(${paramList(signature.params)}): ${signature.returns ?? 'void'};`,
      ]);
  }
}

/**
 * Generates the text of `msm-runtime.d.ts` for a script API description: one global
 * `interface` per declared type, global and namespace, `declare const` for each global, and
 * `declare module "msm:runtime"` exporting the globals and an alias of every type, so scripts
 * work with or without the import.
 */
export function generateTypings(api: ScriptApi): string {
  const decls = collectInterfaces(api);
  const out: string[] = [
    // The checked-in golden lives in the repository, where Biome would otherwise reformat it.
    '// biome-ignore-all format: generated file',
    `// msm-runtime.d.ts: typings of the MSM runtime script API, version ${api.version}.`,
    '// Generated from script-api-v1.json by @msm/plugin-scripting (generateTypings); do not edit.',
  ];
  for (const [name, decl] of [...decls.entries()].sort(([a], [b]) => byName(a, b))) {
    out.push('', ...jsdoc('', decl.doc));
    const heritage = decl.extends !== undefined ? ` extends ${decl.extends}` : '';
    out.push(`interface ${name}${heritage} {`);
    for (const [memberName, member] of sortedEntries(decl.members)) {
      out.push(...memberLines(name, memberName, member));
    }
    out.push('}');
  }
  const globals = sortedEntries(api.globals);
  for (const [name, global] of globals) {
    out.push('', ...jsdoc('', global.doc), `declare const ${name}: ${capitalise(name)};`);
  }
  out.push('', '/** The runtime module; `require("msm:runtime")` returns the same objects. */');
  out.push('declare module "msm:runtime" {');
  for (const [name, global] of globals) {
    out.push(...jsdoc(INDENT, global.doc), `${INDENT}export const ${name}: ${capitalise(name)};`);
  }
  // An ambient module may export only its own declarations, so each global interface is
  // re-exported through an alias of the same name.
  for (const name of [...decls.keys()].sort(byName)) {
    out.push(`${INDENT}export type ${name} = globalThis.${name};`);
  }
  out.push('}', '');
  return out.join('\n');
}

/**
 * Cross-checks a script API description and returns every inconsistency as a sentence:
 * unknown `extends` and event types, events without exactly one `msm.events.on` overload of
 * the form `(name: "<event>", handler: (e: <Type>) => void)`, overloads naming no event, and
 * `cancellable` disagreeing with whether the event type has `cancel()`. Empty when consistent.
 */
export function checkScriptApi(api: ScriptApi): string[] {
  const issues: string[] = [];
  for (const [name, type] of Object.entries(api.types)) {
    if (type.extends !== undefined && api.types[type.extends] === undefined) {
      issues.push(`Type ${name} extends unknown type ${type.extends}.`);
    }
  }
  const hasCancel = (typeName: string): boolean => {
    const seen = new Set<string>();
    let current: string | undefined = typeName;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      const type: ScriptApi['types'][string] | undefined = api.types[current];
      if (type === undefined) return false;
      if (type.members.cancel?.kind === 'method') return true;
      current = type.extends;
    }
    return false;
  };
  const events = api.globals.msm?.members.events;
  const on = events?.kind === 'namespace' ? events.members.on : undefined;
  const overloads = on?.kind === 'method' ? (on.overloads ?? []) : [];
  if (on === undefined) issues.push('msm.events.on is missing.');
  const overloadEvents = new Map<string, string>();
  for (const overload of overloads) {
    const nameParam = overload.params[0];
    const literal = nameParam !== undefined ? /^"([^"]+)"$/.exec(nameParam.type) : null;
    if (literal === null || literal[1] === undefined) {
      issues.push('An msm.events.on overload has no string literal event name.');
      continue;
    }
    const eventName = literal[1];
    if (overloadEvents.has(eventName)) issues.push(`Event ${eventName} has two on overloads.`);
    overloadEvents.set(eventName, overload.params[1]?.type ?? '');
    if (api.events[eventName] === undefined) {
      issues.push(`An on overload names unknown event ${eventName}.`);
    }
  }
  for (const [name, event] of Object.entries(api.events)) {
    if (api.types[event.type] === undefined) {
      issues.push(`Event ${name} has unknown type ${event.type}.`);
    }
    const handler = overloadEvents.get(name);
    if (handler === undefined) issues.push(`Event ${name} has no on overload.`);
    else if (handler !== `(e: ${event.type}) => void`) {
      issues.push(`The on overload of ${name} has handler type ${handler}.`);
    }
    if (hasCancel(event.type) !== event.cancellable) {
      issues.push(
        `Event ${name}: cancellable is ${event.cancellable} but ${event.type} disagrees.`,
      );
    }
  }
  return issues;
}
