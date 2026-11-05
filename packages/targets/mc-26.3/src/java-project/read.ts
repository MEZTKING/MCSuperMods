/**
 * Typed reads of definition JSON (runtime definition format 1) with the runtime's defaults.
 * Every failure throws an `Error` whose message names the definition, which the exporter
 * reports as `export.java-generation-failed`.
 *
 * @packageDocumentation
 */

import type { DefinitionInput, Json, JsonObject } from '@msm/plugin-api';

/** Reads fields of one JSON object of a definition. */
export class Reader {
  readonly definition: DefinitionInput;
  readonly value: JsonObject;
  readonly where: string;

  /**
   * @param definition - The definition being read, named in error messages.
   * @param value - The object read.
   * @param where - The object's location inside the definition, for messages.
   */
  constructor(definition: DefinitionInput, value: JsonObject, where: string) {
    this.definition = definition;
    this.value = value;
    this.where = where;
  }

  /** Throws an error naming the definition and the location. */
  fail(message: string): never {
    const at = this.where === '' ? '' : `${this.where}: `;
    throw new Error(`${this.definition.path} (${this.definition.id}): ${at}${message}`);
  }

  /** Fails when the object has a key outside `known`. */
  onlyKeys(known: readonly string[], what: string): void {
    for (const key of Object.keys(this.value).sort()) {
      if (!known.includes(key)) this.fail(`unknown ${what} '${key}' cannot be ejected`);
    }
  }

  has(key: string): boolean {
    return Object.hasOwn(this.value, key);
  }

  private raw(key: string): Json | undefined {
    return Object.hasOwn(this.value, key) ? this.value[key] : undefined;
  }

  private at(key: string): string {
    return this.where === '' ? key : `${this.where}.${key}`;
  }

  /** A nested object, or `undefined` when absent. */
  object(key: string): Reader | undefined {
    const value = this.raw(key);
    if (value === undefined) return undefined;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(`${key} must be an object`);
    }
    return new Reader(this.definition, value, this.at(key));
  }

  /**
   * A value that is either a string or an object (an mcdoc union such as
   * `(ToolTier | ToolMaterial)`), or `undefined` when absent.
   */
  stringOrObject(key: string): string | Reader | undefined {
    const value = this.raw(key);
    if (value === undefined || typeof value === 'string') return value;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      this.fail(`${key} must be a string or an object`);
    }
    return new Reader(this.definition, value, this.at(key));
  }

  /** A required tag reference (`#namespace:path`), returned without the `#`. */
  requiredTag(key: string): string {
    return this.tag(key) ?? this.fail(`${key} is missing`);
  }

  /** An optional tag reference (`#namespace:path`), returned without the `#`. */
  tag(key: string): string | undefined {
    const value = this.optionalString(key);
    if (value === undefined) return undefined;
    if (!/^#[^#:\s]+(:[^#:\s]+)?$/.test(value)) {
      this.fail(`${key} '${value}' is not a tag reference (#namespace:path)`);
    }
    return value.slice(1);
  }

  /** A required nested object. */
  requiredObject(key: string): Reader {
    return this.object(key) ?? this.fail(`${key} is missing`);
  }

  number(key: string, fallback: number): number {
    const value = this.raw(key);
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) this.fail(`${key} must be a number`);
    return value;
  }

  requiredNumber(key: string): number {
    if (!this.has(key)) this.fail(`${key} is missing`);
    return this.number(key, 0);
  }

  optionalNumber(key: string): number | undefined {
    return this.has(key) ? this.number(key, 0) : undefined;
  }

  integer(key: string, fallback: number): number {
    const value = this.number(key, fallback);
    if (!Number.isInteger(value)) this.fail(`${key} must be an integer`);
    return value;
  }

  requiredInteger(key: string): number {
    if (!this.has(key)) this.fail(`${key} is missing`);
    return this.integer(key, 0);
  }

  boolean(key: string, fallback: boolean): boolean {
    const value = this.raw(key);
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') this.fail(`${key} must be true or false`);
    return value;
  }

  optionalString(key: string): string | undefined {
    const value = this.raw(key);
    if (value === undefined) return undefined;
    if (typeof value !== 'string') this.fail(`${key} must be a string`);
    return value;
  }

  string(key: string, fallback: string): string {
    return this.optionalString(key) ?? fallback;
  }

  requiredString(key: string): string {
    return this.optionalString(key) ?? this.fail(`${key} is missing`);
  }

  /** One of `values` (lower case in JSON), returned in upper case as the Java constant. */
  enumConstant(key: string, values: readonly string[], fallback: string): string {
    const value = this.string(key, fallback);
    if (!values.includes(value)) this.fail(`${key} '${value}' is not one of ${values.join(', ')}`);
    return value.toUpperCase();
  }

  /** A list of strings, or `fallback` when absent. */
  strings(key: string, fallback: readonly string[]): string[] {
    const value = this.raw(key);
    if (value === undefined) return [...fallback];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      this.fail(`${key} must be a list of strings`);
    }
    return value as string[];
  }

  /** A list of objects, or an empty list when absent. */
  objects(key: string): Reader[] {
    const value = this.raw(key);
    if (value === undefined) return [];
    if (!Array.isArray(value)) this.fail(`${key} must be a list`);
    return value.map((entry, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        this.fail(`${key}[${index}] must be an object`);
      }
      return new Reader(this.definition, entry, `${this.at(key)}[${index}]`);
    });
  }

  /** The keys of the object, sorted. */
  keys(): string[] {
    return Object.keys(this.value).sort();
  }
}

/** A reader over a whole definition. */
export function readDefinition(definition: DefinitionInput): Reader {
  return new Reader(definition, definition.definition, '');
}

/** Fails unless `format` is 1. */
export function checkFormat(reader: Reader): void {
  const format = reader.requiredNumber('format');
  if (format !== 1)
    reader.fail(`format ${format} is not the definition format this generator reads (1)`);
}
