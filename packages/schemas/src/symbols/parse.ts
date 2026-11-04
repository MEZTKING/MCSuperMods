import type { RawMcdocType } from './raw-types';

/**
 * A vanilla-mcdoc symbol export (`mcdoc-cli export symbols.json`), validated.
 * `dispatchers` is the export's `mcdoc/dispatcher` table: registry -> key -> type.
 */
export interface VanillaMcdocSymbols {
  ref: string;
  mcdoc: Record<string, RawMcdocType>;
  dispatchers: Record<string, Record<string, RawMcdocType>>;
}

/** Thrown when a symbol export does not have the expected shape. `path` is an RFC 6901 pointer. */
export class SymbolsFormatError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path === '' ? '/' : path}: ${message}`);
    this.name = 'SymbolsFormatError';
    this.path = path;
  }
}

type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapePointer = (segment: string | number): string =>
  String(segment).replaceAll('~', '~0').replaceAll('/', '~1');

const at = (path: string, segment: string | number): string => `${path}/${escapePointer(segment)}`;

function expectObject(value: unknown, path: string): Obj {
  if (!isObject(value)) throw new SymbolsFormatError(path, 'expected an object');
  return value;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new SymbolsFormatError(path, 'expected an array');
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new SymbolsFormatError(path, 'expected a string');
  return value;
}

function checkRange(value: unknown, path: string): void {
  if (value === undefined) return;
  const range = expectObject(value, path);
  if (typeof range.kind !== 'number') {
    throw new SymbolsFormatError(at(path, 'kind'), 'expected a number');
  }
  for (const bound of ['min', 'max'] as const) {
    if (range[bound] !== undefined && typeof range[bound] !== 'number') {
      throw new SymbolsFormatError(at(path, bound), 'expected a number');
    }
  }
}

function checkAttributes(node: Obj, path: string): void {
  if (node.attributes === undefined) return;
  const attributes = expectArray(node.attributes, at(path, 'attributes'));
  attributes.forEach((raw, i) => {
    const attrPath = at(at(path, 'attributes'), i);
    const attribute = expectObject(raw, attrPath);
    expectString(attribute.name, at(attrPath, 'name'));
    if (attribute.value !== undefined) {
      const value = expectObject(attribute.value, at(attrPath, 'value'));
      if (value.kind === 'tree') {
        expectObject(value.values, at(at(attrPath, 'value'), 'values'));
      } else {
        checkType(value, at(attrPath, 'value'));
      }
    }
  });
}

/**
 * Checks one raw type recursively. Known kinds must carry their required properties;
 * unknown kinds are accepted (they normalise to `unsupported`) so a newer export still loads.
 */
function checkType(value: unknown, path: string): void {
  const node = expectObject(value, path);
  const kind = expectString(node.kind, at(path, 'kind'));
  checkAttributes(node, path);
  switch (kind) {
    case 'struct': {
      const fields = expectArray(node.fields, at(path, 'fields'));
      fields.forEach((raw, i) => {
        const fieldPath = at(at(path, 'fields'), i);
        const field = expectObject(raw, fieldPath);
        checkAttributes(field, fieldPath);
        if (field.kind === 'pair') {
          if (typeof field.key !== 'string') checkType(field.key, at(fieldPath, 'key'));
          checkType(field.type, at(fieldPath, 'type'));
        } else if (field.kind === 'spread') {
          checkType(field.type, at(fieldPath, 'type'));
        } else {
          throw new SymbolsFormatError(at(fieldPath, 'kind'), 'expected "pair" or "spread"');
        }
      });
      break;
    }
    case 'list':
      checkType(node.item, at(path, 'item'));
      checkRange(node.lengthRange, at(path, 'lengthRange'));
      break;
    case 'string':
      checkRange(node.lengthRange, at(path, 'lengthRange'));
      break;
    case 'byte':
    case 'short':
    case 'int':
    case 'long':
    case 'float':
    case 'double':
      checkRange(node.valueRange, at(path, 'valueRange'));
      break;
    case 'enum': {
      const values = expectArray(node.values, at(path, 'values'));
      values.forEach((raw, i) => {
        const valuePath = at(at(path, 'values'), i);
        const entry = expectObject(raw, valuePath);
        expectString(entry.identifier, at(valuePath, 'identifier'));
        if (typeof entry.value !== 'string' && typeof entry.value !== 'number') {
          throw new SymbolsFormatError(at(valuePath, 'value'), 'expected a string or number');
        }
        checkAttributes(entry, valuePath);
      });
      break;
    }
    case 'literal': {
      const literal = expectObject(node.value, at(path, 'value'));
      const inner = literal.value;
      if (typeof inner !== 'string' && typeof inner !== 'number' && typeof inner !== 'boolean') {
        throw new SymbolsFormatError(
          at(at(path, 'value'), 'value'),
          'expected a string, number or boolean',
        );
      }
      break;
    }
    case 'union':
      expectArray(node.members, at(path, 'members')).forEach((member, i) => {
        checkType(member, at(at(path, 'members'), i));
      });
      break;
    case 'reference':
      if (node.path !== undefined) expectString(node.path, at(path, 'path'));
      break;
    case 'dispatcher': {
      expectString(node.registry, at(path, 'registry'));
      const indices = expectArray(node.parallelIndices, at(path, 'parallelIndices'));
      indices.forEach((raw, i) => {
        const indexPath = at(at(path, 'parallelIndices'), i);
        const index = expectObject(raw, indexPath);
        if (index.kind === 'static') {
          expectString(index.value, at(indexPath, 'value'));
        } else if (index.kind === 'dynamic') {
          expectArray(index.accessor, at(indexPath, 'accessor')).forEach((step, j) => {
            const stepPath = at(at(indexPath, 'accessor'), j);
            if (typeof step === 'string') return;
            const keyword = expectObject(step, stepPath).keyword;
            if (keyword !== 'key' && keyword !== 'parent') {
              throw new SymbolsFormatError(at(stepPath, 'keyword'), 'expected "key" or "parent"');
            }
          });
        } else {
          throw new SymbolsFormatError(at(indexPath, 'kind'), 'expected "static" or "dynamic"');
        }
      });
      break;
    }
    case 'template': {
      checkType(node.child, at(path, 'child'));
      expectArray(node.typeParams, at(path, 'typeParams')).forEach((raw, i) => {
        const paramPath = at(at(path, 'typeParams'), i);
        expectString(expectObject(raw, paramPath).path, at(paramPath, 'path'));
      });
      break;
    }
    case 'concrete':
      checkType(node.child, at(path, 'child'));
      expectArray(node.typeArgs, at(path, 'typeArgs')).forEach((arg, i) => {
        checkType(arg, at(at(path, 'typeArgs'), i));
      });
      break;
    case 'tuple':
      expectArray(node.items, at(path, 'items')).forEach((item, i) => {
        checkType(item, at(at(path, 'items'), i));
      });
      break;
    case 'byte_array':
    case 'int_array':
    case 'long_array':
      checkRange(node.lengthRange, at(path, 'lengthRange'));
      checkRange(node.valueRange, at(path, 'valueRange'));
      break;
    default:
      // boolean, any, unsafe and kinds MSM does not model need no further checks.
      break;
  }
}

/** Structural validation of the mcdoc-cli export; throws SymbolsFormatError with a path on failure. */
export function parseVanillaMcdocSymbols(json: unknown): VanillaMcdocSymbols {
  const root = expectObject(json, '');
  const ref = expectString(root.ref, '/ref');
  const mcdoc = expectObject(root.mcdoc, '/mcdoc');
  for (const [typePath, type] of Object.entries(mcdoc)) {
    checkType(type, at('/mcdoc', typePath));
  }
  const dispatcherPath = at('', 'mcdoc/dispatcher');
  const dispatcherTable = expectObject(root['mcdoc/dispatcher'], dispatcherPath);
  for (const [registry, members] of Object.entries(dispatcherTable)) {
    const registryPath = at(dispatcherPath, registry);
    for (const [key, type] of Object.entries(expectObject(members, registryPath))) {
      checkType(type, at(registryPath, key));
    }
  }
  return {
    ref,
    mcdoc: mcdoc as Record<string, RawMcdocType>,
    dispatchers: dispatcherTable as Record<string, Record<string, RawMcdocType>>,
  };
}
