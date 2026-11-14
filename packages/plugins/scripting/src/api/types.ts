/**
 * The shape of the script API description, `api/script-api-v1.json` (ADR 0032 D1), and a
 * structural check that turns the parsed JSON into a typed {@link ScriptApi}.
 *
 * Type strings are TypeScript type expressions restricted to primitives, the declared
 * types, arrays, string literal unions, unions with `undefined`, function types and object
 * literals. The runtime's `ScriptApiContractTest` reads the same JSON.
 */

/** One parameter of a method or overload. */
export interface ScriptApiParam {
  /** The parameter name, a JavaScript identifier. */
  name: string;
  /** The parameter's TypeScript type string. */
  type: string;
  /** `true` when the argument may be omitted. */
  optional?: boolean;
  /** One British English sentence, emitted as `@param`. */
  doc?: string;
}

/** One call signature of a method. */
export interface ScriptApiSignature {
  /** The parameters in call order. */
  params: ScriptApiParam[];
  /** The return type string; `void` when omitted. */
  returns?: string;
  /** One British English sentence describing this signature (required on overloads). */
  doc?: string;
}

/** A read-only value member. Properties are emitted `readonly`. */
export interface ScriptApiProperty {
  kind: 'property';
  /** The TypeScript type string. */
  type: string;
  /** `true` when the member may be absent (emitted as `name?:`). */
  optional?: boolean;
  /** One British English sentence. */
  doc: string;
}

/** A method with one signature (`params`) or several (`overloads`). */
export interface ScriptApiMethod {
  kind: 'method';
  /** The parameters of a single-signature method. */
  params?: ScriptApiParam[];
  /** The return type string of a single-signature method; `void` when omitted. */
  returns?: string;
  /** The signatures of an overloaded method, emitted in this order. */
  overloads?: ScriptApiSignature[];
  /** One British English sentence. */
  doc: string;
}

/** A namespace object such as `msm.log`; emitted as its own interface. */
export interface ScriptApiNamespace {
  kind: 'namespace';
  /** The namespace's members. */
  members: Record<string, ScriptApiMember>;
  /** One British English sentence. */
  doc: string;
}

/** Any member of a type, a namespace or a global. */
export type ScriptApiMember = ScriptApiProperty | ScriptApiMethod | ScriptApiNamespace;

/** A declared object type such as `World` or `BlockInteractEvent`. */
export interface ScriptApiType {
  /** One British English sentence. */
  doc: string;
  /** The declared type this one extends, if any. */
  extends?: string;
  /** The type's own members (inherited ones are not repeated). */
  members: Record<string, ScriptApiMember>;
}

/** A global object such as `msm`; emitted as an interface named after it (`Msm`). */
export interface ScriptApiGlobal {
  /** One British English sentence. */
  doc: string;
  /** The global's members. */
  members: Record<string, ScriptApiMember>;
}

/**
 * A named type alias such as `ItemSpec` (a union or an object literal), emitted as a global
 * `type` declaration and exported from `msm:runtime`. Aliases have no runtime presence, so the
 * runtime's contract test does not compare them (ADR 0065).
 */
export interface ScriptApiAlias {
  /** The aliased TypeScript type string. */
  type: string;
  /** British English sentences; a blank line separates paragraphs. */
  doc: string;
}

/** A game event a script can handle with `msm.events.on`. */
export interface ScriptApiEvent {
  /** The declared type of the event object handed to handlers. */
  type: string;
  /** `true` when the event object has `cancel()`. */
  cancellable: boolean;
  /** The Fabric API (or runtime) source of the event, for the runtime side. */
  source: string;
  /** One British English sentence. */
  doc: string;
}

/**
 * The whole script API description. `functions` declares global free functions such as
 * `require` (ADR 0032 D1 amendment); each is a method member, emitted as `declare function`.
 */
export interface ScriptApi {
  /** The API version (1 for `script-api-v1.json`). */
  version: number;
  /** Declared object types, keyed by name. */
  types: Record<string, ScriptApiType>;
  /** Global objects, keyed by name (`msm`). */
  globals: Record<string, ScriptApiGlobal>;
  /** Game events, keyed by name (`block.interact`). */
  events: Record<string, ScriptApiEvent>;
  /** Global free functions, keyed by name (`require`); omitted when there are none. */
  functions?: Record<string, ScriptApiMethod>;
  /** Named type aliases, keyed by name (`ItemSpec`); omitted when there are none. */
  aliases?: Record<string, ScriptApiAlias>;
}

/** Thrown by {@link parseScriptApi} when the JSON does not have the expected shape. */
export class ScriptApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptApiError';
  }
}

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(where: string, what: string): never {
  throw new ScriptApiError(`${where}: ${what}`);
}

function obj(value: unknown, where: string): Obj {
  if (!isObj(value)) fail(where, 'expected an object');
  return value;
}

function str(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '') fail(where, 'expected a non-empty string');
  return value;
}

function optBool(value: unknown, where: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(where, 'expected a boolean');
  return value;
}

function onlyKeys(value: Obj, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(where, `unknown field ${JSON.stringify(key)}`);
  }
}

function parseParams(value: unknown, where: string): ScriptApiParam[] {
  if (!Array.isArray(value)) fail(where, 'expected an array of parameters');
  return value.map((entry, index) => {
    const at = `${where}[${index}]`;
    const raw = obj(entry, at);
    onlyKeys(raw, ['name', 'type', 'optional', 'doc'], at);
    const param: ScriptApiParam = {
      name: str(raw.name, `${at}.name`),
      type: str(raw.type, `${at}.type`),
    };
    const optional = optBool(raw.optional, `${at}.optional`);
    if (optional !== undefined) param.optional = optional;
    if (raw.doc !== undefined) param.doc = str(raw.doc, `${at}.doc`);
    return param;
  });
}

function parseMember(value: unknown, where: string): ScriptApiMember {
  const raw = obj(value, where);
  const doc = str(raw.doc, `${where}.doc`);
  switch (raw.kind) {
    case 'property': {
      onlyKeys(raw, ['kind', 'type', 'optional', 'doc'], where);
      const member: ScriptApiProperty = {
        kind: 'property',
        type: str(raw.type, `${where}.type`),
        doc,
      };
      const optional = optBool(raw.optional, `${where}.optional`);
      if (optional !== undefined) member.optional = optional;
      return member;
    }
    case 'method': {
      onlyKeys(raw, ['kind', 'params', 'returns', 'overloads', 'doc'], where);
      const member: ScriptApiMethod = { kind: 'method', doc };
      if (raw.overloads !== undefined) {
        if (raw.params !== undefined || raw.returns !== undefined) {
          fail(where, 'a method has either overloads or params and returns');
        }
        if (!Array.isArray(raw.overloads) || raw.overloads.length === 0) {
          fail(`${where}.overloads`, 'expected a non-empty array');
        }
        member.overloads = raw.overloads.map((entry, index) => {
          const at = `${where}.overloads[${index}]`;
          const o = obj(entry, at);
          onlyKeys(o, ['params', 'returns', 'doc'], at);
          const signature: ScriptApiSignature = {
            params: parseParams(o.params, `${at}.params`),
            doc: str(o.doc, `${at}.doc`),
          };
          if (o.returns !== undefined) signature.returns = str(o.returns, `${at}.returns`);
          return signature;
        });
      } else {
        member.params = parseParams(raw.params ?? [], `${where}.params`);
        if (raw.returns !== undefined) member.returns = str(raw.returns, `${where}.returns`);
      }
      return member;
    }
    case 'namespace':
      onlyKeys(raw, ['kind', 'members', 'doc'], where);
      return { kind: 'namespace', members: parseMembers(raw.members, `${where}.members`), doc };
    default:
      return fail(`${where}.kind`, 'expected "property", "method" or "namespace"');
  }
}

function parseMembers(value: unknown, where: string): Record<string, ScriptApiMember> {
  const raw = obj(value, where);
  const members: Record<string, ScriptApiMember> = {};
  for (const [name, member] of Object.entries(raw)) {
    members[name] = parseMember(member, `${where}.${name}`);
  }
  return members;
}

/**
 * Checks the parsed `script-api-v1.json` structurally and returns it typed. Throws a
 * {@link ScriptApiError} naming the first offending path.
 */
export function parseScriptApi(json: unknown): ScriptApi {
  const root = obj(json, 'api');
  onlyKeys(root, ['version', 'types', 'globals', 'events', 'functions', 'aliases'], 'api');
  if (typeof root.version !== 'number' || !Number.isInteger(root.version) || root.version < 1) {
    fail('api.version', 'expected a positive integer');
  }
  const types: Record<string, ScriptApiType> = {};
  for (const [name, value] of Object.entries(obj(root.types, 'api.types'))) {
    const at = `api.types.${name}`;
    const raw = obj(value, at);
    onlyKeys(raw, ['doc', 'extends', 'members'], at);
    const type: ScriptApiType = {
      doc: str(raw.doc, `${at}.doc`),
      members: parseMembers(raw.members, `${at}.members`),
    };
    if (raw.extends !== undefined) type.extends = str(raw.extends, `${at}.extends`);
    types[name] = type;
  }
  const globals: Record<string, ScriptApiGlobal> = {};
  for (const [name, value] of Object.entries(obj(root.globals, 'api.globals'))) {
    const at = `api.globals.${name}`;
    const raw = obj(value, at);
    onlyKeys(raw, ['doc', 'members'], at);
    globals[name] = {
      doc: str(raw.doc, `${at}.doc`),
      members: parseMembers(raw.members, `${at}.members`),
    };
  }
  const events: Record<string, ScriptApiEvent> = {};
  for (const [name, value] of Object.entries(obj(root.events, 'api.events'))) {
    const at = `api.events.${name}`;
    const raw = obj(value, at);
    onlyKeys(raw, ['type', 'cancellable', 'source', 'doc'], at);
    if (typeof raw.cancellable !== 'boolean') fail(`${at}.cancellable`, 'expected a boolean');
    events[name] = {
      type: str(raw.type, `${at}.type`),
      cancellable: raw.cancellable,
      source: str(raw.source, `${at}.source`),
      doc: str(raw.doc, `${at}.doc`),
    };
  }
  const api: ScriptApi = { version: root.version, types, globals, events };
  if (root.functions !== undefined) {
    const functions: Record<string, ScriptApiMethod> = {};
    for (const [name, value] of Object.entries(obj(root.functions, 'api.functions'))) {
      const at = `api.functions.${name}`;
      const member = parseMember(value, at);
      if (member.kind !== 'method') fail(`${at}.kind`, 'expected "method"');
      functions[name] = member;
    }
    api.functions = functions;
  }
  if (root.aliases !== undefined) {
    const aliases: Record<string, ScriptApiAlias> = {};
    for (const [name, value] of Object.entries(obj(root.aliases, 'api.aliases'))) {
      const at = `api.aliases.${name}`;
      const raw = obj(value, at);
      onlyKeys(raw, ['type', 'doc'], at);
      aliases[name] = { type: str(raw.type, `${at}.type`), doc: str(raw.doc, `${at}.doc`) };
    }
    api.aliases = aliases;
  }
  return api;
}
