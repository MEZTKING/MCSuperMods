/**
 * The language file editor: the generated map form over a `minecraft:lang` element with a
 * search box and "Add key". It is a wrapper around `SchemaForm`, not a separate model: the
 * search only narrows the value the form shows, and edits are merged back into the full file.
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { Plus } from 'lucide-react';
import { type Ref, useId, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import {
  type ChangeOptions,
  type CompletionSource,
  type FormProblem,
  SchemaForm,
  type SchemaFormHandle,
} from '../forms';

type JsonObject = { [key: string]: Json };

function asObject(value: Json): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

/** RFC 6901 pointer of a top-level key. */
export function keyPointer(key: string): string {
  return `/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

/** The entries whose key or text contains `query` (case-insensitive). */
export function filterLang(data: JsonObject, query: string): JsonObject {
  const needle = query.trim().toLowerCase();
  if (needle === '') return data;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(data)) {
    const text = typeof value === 'string' ? value : '';
    if (key.toLowerCase().includes(needle) || text.toLowerCase().includes(needle)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Merges a whole-object edit made on the filtered view back into the full file: visible keys
 * take their new values, removed or renamed visible keys go, new keys take the place of the
 * first one that went (so a rename keeps its position), and hidden keys are kept.
 */
export function mergeFiltered(full: JsonObject, visible: JsonObject, next: JsonObject): JsonObject {
  const added = Object.keys(next).filter((key) => !Object.hasOwn(visible, key));
  const addedSet = new Set(added);
  const out: JsonObject = {};
  let inserted = false;
  const insert = () => {
    if (inserted) return;
    inserted = true;
    for (const key of added) out[key] = next[key] as Json;
  };
  for (const [key, value] of Object.entries(full)) {
    if (!Object.hasOwn(visible, key)) {
      if (!addedSet.has(key)) out[key] = value;
    } else if (Object.hasOwn(next, key)) {
      out[key] = next[key] as Json;
    } else {
      insert();
    }
  }
  insert();
  return out;
}

/** Props of {@link LangStudio}. */
export interface LangStudioProps {
  element: Element;
  node: SchemaNode;
  problems: readonly FormProblem[];
  completions: CompletionSource;
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  ref: Ref<SchemaFormHandle>;
}

/** Search, "Add key" and the generated map form for a language file. */
export function LangStudio({
  element,
  node,
  problems,
  completions,
  onChange,
  ref,
}: LangStudioProps) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const full = asObject(element.data);
  const visible = useMemo(() => filterLang(full, query), [full, query]);
  const filtering = query.trim() !== '';
  const candidate = query.trim();
  const canAdd = candidate !== '' && !Object.hasOwn(full, candidate);

  const change = (pointer: string, value: Json | undefined, options?: ChangeOptions) => {
    if (filtering && pointer === '' && value !== undefined) {
      onChange('', mergeFiltered(full, visible, asObject(value)), options);
    } else {
      onChange(pointer, value, options);
    }
  };

  return (
    <section aria-label="Language file" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 px-2">
        <label htmlFor={searchId} className="text-sm">
          Search or new key
        </label>
        <input
          id={searchId}
          type="search"
          data-testid="lang-search"
          className="min-w-48 flex-1 rounded border border-border bg-bg px-2 py-1 text-sm"
          placeholder="block.my_mod.ruby_block"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          data-testid="lang-add-key"
          disabled={!canAdd}
          onClick={() => {
            onChange(keyPointer(candidate), '');
            setQuery('');
          }}
        >
          <Plus size={14} aria-hidden />
          Add key
        </Button>
      </div>
      <p className="px-2 text-xs text-muted">
        {Object.keys(full).length} key(s)
        {filtering ? `, ${Object.keys(visible).length} shown` : ''}
      </p>
      <div data-testid="schema-form">
        <SchemaForm
          ref={ref}
          node={node}
          value={visible}
          onChange={change}
          problems={problems}
          completions={completions}
          rootLabel={element.id}
        />
      </div>
    </section>
  );
}
