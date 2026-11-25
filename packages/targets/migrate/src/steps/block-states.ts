/**
 * The block state step (ADR 0136 D3): renames a property of one block, or its values, wherever
 * element data writes that block's state.
 *
 * @packageDocumentation
 */

import type { Json, MigrationDetail } from '@msm/plugin-api';
import type { BlockStateStep } from '../types';
import { isObject, type JsonObject, pointer, replaceAt, type Segment, valueAt } from '../walk';

const NAMESPACE = 'minecraft:';

function namespaced(id: string): string {
  return id.includes(':') ? id : `${NAMESPACE}${id}`;
}

/** A whole-string block state `block[key=value,…]`, or `undefined`. */
function parseStateString(
  text: string,
): { block: string; properties: [string, string][] } | undefined {
  const match = /^(#?[a-z0-9_.:/-]+)\[([^\]]*)\]$/.exec(text);
  if (match === null) return undefined;
  const properties: [string, string][] = [];
  const body = (match[2] as string).trim();
  if (body !== '') {
    for (const part of body.split(',')) {
      const at = part.indexOf('=');
      if (at <= 0) return undefined;
      properties.push([part.slice(0, at).trim(), part.slice(at + 1).trim()]);
    }
  }
  return { block: match[1] as string, properties };
}

/** Applies `step` to one element's data; `data` is cloned before the first change. */
export function applyBlockStateStep(
  step: BlockStateStep,
  data: Json,
  owned: boolean,
): { data: Json; details: MigrationDetail[] } {
  const block = namespaced(step.block);
  const details: MigrationDetail[] = [];
  let out = data;
  let mine = owned;
  const writable = (): Json => {
    if (!mine) {
      out = structuredClone(out);
      mine = true;
    }
    return out;
  };
  const newName = step.renameTo ?? step.property;
  const newValue = (value: string): string => step.values?.[value] ?? value;
  const visit = (value: Json, segments: Segment[]): void => {
    if (typeof value === 'string') {
      const state = parseStateString(value);
      if (state === undefined || namespaced(state.block) !== block) return;
      let changed = false;
      const properties = state.properties.map(([key, current]): [string, string] => {
        if (key !== step.property) return [key, current];
        const next: [string, string] = [newName, newValue(current)];
        changed ||= next[0] !== key || next[1] !== current;
        return next;
      });
      if (!changed) return;
      const after = `${state.block}[${properties.map(([k, v]) => `${k}=${v}`).join(',')}]`;
      out = replaceAt(writable(), segments, after);
      details.push({
        op: 'set',
        path: pointer(segments),
        before: value,
        after,
        changeId: step.changeId,
      });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        visit(item, [...segments, index]);
      });
      return;
    }
    if (!isObject(value)) return;
    const name = value.Name;
    const props = value.Properties;
    if (
      typeof name === 'string' &&
      namespaced(name) === block &&
      isObject(props) &&
      Object.hasOwn(props, step.property)
    ) {
      const current = props[step.property] as Json;
      const propsPath = [...segments, 'Properties'];
      const fromPath = [...propsPath, step.property];
      if (newName !== step.property && !Object.hasOwn(props, newName)) {
        const target = valueAt(writable(), propsPath) as JsonObject;
        delete target[step.property];
        target[newName] = current;
        details.push({
          op: 'move',
          path: pointer([...propsPath, newName]),
          from: pointer(fromPath),
          before: current,
          after: current,
          changeId: step.changeId,
        });
      }
      const at =
        newName !== step.property && Object.hasOwn(valueAt(out, propsPath) as JsonObject, newName)
          ? [...propsPath, newName]
          : fromPath;
      const now = valueAt(out, at);
      if (typeof now === 'string' && newValue(now) !== now) {
        out = replaceAt(writable(), at, newValue(now));
        details.push({
          op: 'set',
          path: pointer(at),
          before: now,
          after: newValue(now),
          changeId: step.changeId,
        });
      }
    }
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) visit(item, [...segments, key]);
    }
  };
  visit(data, []);
  return { data: out, details };
}
