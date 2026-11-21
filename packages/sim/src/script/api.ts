/**
 * The Script API description as Try it reads it (B400, ADR 0032 D1). `@msm/sim` may not import
 * `@msm/plugin-scripting`, so these are the structural parts of `script-api-v1.json` the shim
 * needs; the app passes the plugin's `SCRIPT_API` (it fits this shape) and the tests read the
 * JSON file. {@link apiMembers} walks every member, so a test can check that each one is either
 * implemented by the shim or said out loud as only in Minecraft.
 */

/** One parameter of a method signature. */
export interface ApiParam {
  readonly name: string;
  readonly type: string;
  readonly optional?: boolean;
}

/** A property, a method or a namespace of the description. */
export type ApiMember =
  | { readonly kind: 'property'; readonly type: string; readonly optional?: boolean }
  | {
      readonly kind: 'method';
      readonly params?: readonly ApiParam[];
      readonly returns?: string;
      readonly overloads?: readonly {
        readonly params: readonly ApiParam[];
        readonly returns?: string;
      }[];
    }
  | { readonly kind: 'namespace'; readonly members: Readonly<Record<string, ApiMember>> };

/** A declared object type (`World`, `Player`, an event type). */
export interface ApiType {
  readonly extends?: string;
  readonly members: Readonly<Record<string, ApiMember>>;
}

/** The parts of the Script API description the shim reads. */
export interface ScriptApiDescription {
  readonly version: number;
  readonly types: Readonly<Record<string, ApiType>>;
  readonly globals: Readonly<
    Record<string, { readonly members: Readonly<Record<string, ApiMember>> }>
  >;
  readonly events: Readonly<
    Record<string, { readonly type: string; readonly cancellable: boolean }>
  >;
  readonly functions?: Readonly<Record<string, ApiMember>>;
  readonly aliases?: Readonly<Record<string, { readonly type: string }>>;
}

/** One member of the description, by where it is declared. */
export interface ApiMemberRef {
  /**
   * The member's name as the shim says it: `msm.log.info` for a global's member, `World.getBlock`
   * for a type's own member, `require` for a global function.
   */
  readonly path: string;
  /** `global`, `type` or `function`. */
  readonly owner: 'global' | 'type' | 'function';
  /** The declaring type, for a type's member. */
  readonly type?: string;
  readonly kind: 'property' | 'method';
}

/** Every member of the description (properties and methods, not namespaces), in order. */
export function apiMembers(api: ScriptApiDescription): ApiMemberRef[] {
  const out: ApiMemberRef[] = [];
  const walk = (prefix: string, members: Readonly<Record<string, ApiMember>>): void => {
    for (const [name, member] of Object.entries(members)) {
      if (member.kind === 'namespace') walk(`${prefix}${name}.`, member.members);
      else out.push({ path: `${prefix}${name}`, owner: 'global', kind: member.kind });
    }
  };
  for (const [name, global] of Object.entries(api.globals)) walk(`${name}.`, global.members);
  for (const [typeName, type] of Object.entries(api.types)) {
    for (const [name, member] of Object.entries(type.members)) {
      if (member.kind === 'namespace') continue;
      out.push({ path: `${typeName}.${name}`, owner: 'type', type: typeName, kind: member.kind });
    }
  }
  for (const [name, member] of Object.entries(api.functions ?? {})) {
    if (member.kind === 'namespace') continue;
    out.push({ path: name, owner: 'function', kind: member.kind });
  }
  return out;
}
