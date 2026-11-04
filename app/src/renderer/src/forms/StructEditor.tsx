/**
 * Struct editor: required and present fields, "Add field" for missing optional ones,
 * dispatcher discriminator selects, and the key/value table for `'*'` map fields.
 */
import type { Json } from '@msm/core';
import type { SchemaField, SchemaNode } from '@msm/schemas';
import { Plus } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useId, useState } from 'react';
import { Button, buttonClass } from '../components/ui/Button';
import { type CompletionSource, type FormProblem, useForm } from './context';
import { JsonFallback } from './JsonFallback';
import { Field, type NodeEditorProps, ProblemList } from './NodeEditor';
import { childPointer, parsePointer } from './pointer';
import { ChoiceControl, inputClass } from './scalars';
import {
  defaultObject,
  defaultValue,
  literalChoices,
  pickableKeys,
  resolveNode,
  type StructShape,
  structShape,
} from './schema-utils';

type JsonObject = { [key: string]: Json };
type StructLike = SchemaNode & { kind: 'struct' | 'dispatcher' };

/** Problems addressed to direct children of `pointer` that no rendered control shows. */
function orphanProblems(
  problems: ReadonlyMap<string, readonly FormProblem[]>,
  pointer: string,
  rendered: ReadonlySet<string>,
): FormProblem[] {
  const out: FormProblem[] = [];
  for (const [path, list] of problems) {
    if (!path.startsWith(`${pointer}/`)) continue;
    const rest = path.slice(pointer.length + 1);
    if (rest.includes('/')) continue;
    const key = parsePointer(`/${rest}`)[0] ?? '';
    if (!rendered.has(key)) out.push(...list);
  }
  return out;
}

export function StructEditor(
  props: NodeEditorProps & { node: StructLike; value: JsonObject | undefined },
) {
  const { onChange, hidden, problems } = useForm();
  const { node, value, pointer, label, depth, parentKey } = props;
  const shape = structShape(node, value, parentKey);
  const object: JsonObject = value ?? {};

  /** Sets one field, creating the object when it is absent. */
  const setField = (key: string, next: Json | undefined) => {
    if (value === undefined) {
      if (next !== undefined) onChange(pointer, { [key]: next });
      return;
    }
    onChange(childPointer(pointer, key), next);
  };

  const named = new Set(shape.fields.map((field) => field.key));
  for (const discriminator of shape.discriminators) named.add(discriminator.key);
  const rendered = new Set<string>();

  const present = shape.fields.filter(
    (field) => !field.optional || Object.hasOwn(object, field.key),
  );
  const missing = shape.fields.filter(
    (field) =>
      field.optional &&
      !Object.hasOwn(object, field.key) &&
      !hidden.has(childPointer(pointer, field.key)),
  );
  for (const field of present) rendered.add(field.key);

  const mapField = shape.wildcards[0];
  const mapEntries =
    mapField === undefined ? [] : Object.keys(object).filter((key) => !named.has(key));
  for (const key of mapEntries) rendered.add(key);
  for (const discriminator of shape.discriminators) rendered.add(discriminator.key);

  const opaque = shape.opaque[0];
  const orphans = orphanProblems(problems, pointer, rendered);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {shape.discriminators.map((discriminator) => (
        <DiscriminatorField
          key={discriminator.key}
          shape={shape}
          node={node}
          object={object}
          fieldKey={discriminator.key}
          pointer={pointer}
          depth={depth}
        />
      ))}
      {opaque !== undefined && (
        <div className="flex flex-col gap-1">
          <p role="status" className="text-warning text-xs">
            {opaque.reason === 'unknown-key'
              ? `Unknown ${opaque.dispatcher.registry} type ${JSON.stringify(opaque.key)}; its fields cannot be shown.`
              : opaque.reason === 'missing-key'
                ? `Choose a type to see its fields.`
                : `The fields for this ${opaque.dispatcher.registry} type cannot be shown as a form.`}
          </p>
          {opaque.reason !== 'missing-key' && (
            <JsonFallback pointer={pointer} value={value} label={label} />
          )}
        </div>
      )}
      {shape.unsupportedSpreads > 0 && (
        <p className="text-muted text-xs">
          Some fields of this object cannot be shown in the form; use Raw JSON for them.
        </p>
      )}
      {present.map((field) => {
        const child = childPointer(pointer, field.key);
        const has = Object.hasOwn(object, field.key);
        return (
          <Field
            key={field.key}
            node={field.type}
            value={has ? object[field.key] : undefined}
            pointer={child}
            label={field.key}
            depth={depth + 1}
            parentKey={field.key}
            desc={field.desc}
            deprecated={field.deprecated}
            onRemove={field.optional && has ? () => setField(field.key, undefined) : undefined}
          />
        );
      })}
      {mapField !== undefined && (
        <MapEditor
          field={mapField}
          object={object}
          entries={mapEntries}
          reserved={named}
          pointer={pointer}
          label={label}
          depth={depth}
          absent={value === undefined}
        />
      )}
      {missing.length > 0 && (
        <AddFieldMenu
          label={label}
          fields={missing}
          onAdd={(field) => setField(field.key, defaultValue(field.type))}
        />
      )}
      <ProblemList problems={orphans} />
    </div>
  );
}

/** The select for a field that chooses a dispatcher member (e.g. `type`). */
function DiscriminatorField({
  shape,
  node,
  object,
  fieldKey,
  pointer,
  depth,
}: {
  shape: StructShape;
  node: StructLike;
  object: JsonObject;
  fieldKey: string;
  pointer: string;
  depth: number;
}) {
  const { onChange, hidden } = useForm();
  const child = childPointer(pointer, fieldKey);
  const discriminator = shape.discriminators.find((entry) => entry.key === fieldKey);
  if (discriminator === undefined || hidden.has(child)) return null;
  const keys = pickableKeys(discriminator.dispatcher);
  const pick = (next: string | number | boolean) => {
    // Keep only what the new member (and the struct itself) still declares.
    const probe: JsonObject = { ...object, [fieldKey]: next };
    const nextShape = structShape(node, probe);
    const keep = new Set(nextShape.fields.map((field) => field.key));
    for (const entry of nextShape.discriminators) keep.add(entry.key);
    const base: JsonObject = {};
    for (const [key, entry] of Object.entries(probe)) {
      if (keep.has(key) || nextShape.wildcards.length > 0) base[key] = entry;
    }
    onChange(pointer, defaultObject(node, base, depth));
  };
  return (
    <Field
      node={{ kind: 'string' }}
      value={object[fieldKey]}
      pointer={child}
      label={fieldKey}
      depth={depth + 1}
      desc={discriminator.declared?.desc ?? discriminator.dispatcher.desc}
      editorOverride={
        <ChoiceControl
          pointer={child}
          label={fieldKey}
          invalid={false}
          forceSelect
          choices={keys.map((key) => ({ value: key, label: key }))}
          value={object[fieldKey]}
          onPick={pick}
        />
      }
    />
  );
}

/** "Add field" popover listing the missing optional fields. */
function AddFieldMenu({
  label,
  fields,
  onAdd,
}: {
  label: string;
  fields: readonly SchemaField[];
  onAdd: (field: SchemaField) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={`${buttonClass} self-start text-xs`}
        aria-label={`Add field to ${label}`}
      >
        <Plus size={12} aria-hidden />
        Add field
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 flex max-h-72 min-w-40 flex-col overflow-auto rounded border border-border bg-panel p-1 text-sm shadow"
        >
          <ul aria-label={`Optional fields of ${label}`} className="flex flex-col">
            {fields.map((field) => (
              <li key={field.key}>
                <button
                  type="button"
                  title={field.desc}
                  className="w-full cursor-pointer rounded px-2 py-0.5 text-left hover:bg-bg focus:bg-bg"
                  onClick={() => {
                    onAdd(field);
                    setOpen(false);
                  }}
                >
                  {field.key}
                  {field.deprecated === true && (
                    <span className="ml-1 text-warning text-xs">(deprecated)</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Suggested keys for a map from its key type. */
function keySuggestions(
  keyType: SchemaNode | undefined,
  completions: CompletionSource | undefined,
  prefix: string,
): string[] {
  if (keyType === undefined) return [];
  const target = resolveNode(keyType);
  if (target.kind === 'enum') return target.values.map((entry) => String(entry.value));
  if (target.kind === 'union') {
    return (literalChoices(target) ?? []).map((entry) => String(entry));
  }
  if (target.kind === 'string' && target.idRegistry !== undefined && completions !== undefined) {
    return completions.suggest(target.idRegistry, prefix).slice(0, 50);
  }
  return [];
}

/** Key/value table for a `'*'` field: add, remove and rename entries. */
function MapEditor({
  field,
  object,
  entries,
  reserved,
  pointer,
  label,
  depth,
  absent,
}: {
  field: SchemaField;
  object: JsonObject;
  entries: readonly string[];
  reserved: ReadonlySet<string>;
  pointer: string;
  label: string;
  depth: number;
  absent: boolean;
}) {
  const { onChange, completions } = useForm();
  const [draft, setDraft] = useState('');
  const listId = useId();
  const taken = (key: string) => Object.hasOwn(object, key) || reserved.has(key);
  const suggestions = keySuggestions(field.keyType, completions, draft).filter(
    (key) => !taken(key),
  );
  const canAdd = draft !== '' && !taken(draft);
  const add = () => {
    if (!canAdd) return;
    const initial = defaultValue(field.type);
    if (absent) onChange(pointer, { [draft]: initial });
    else onChange(childPointer(pointer, draft), initial);
    setDraft('');
  };
  const rename = (from: string, to: string) => {
    const next: JsonObject = {};
    for (const [key, entry] of Object.entries(object)) next[key === from ? to : key] = entry;
    onChange(pointer, next);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-map-pointer={pointer}>
      {entries.map((key) => (
        <Field
          key={key}
          node={field.type}
          value={object[key]}
          pointer={childPointer(pointer, key)}
          label={key}
          depth={depth + 1}
          parentKey={key}
          desc={field.desc}
          labelSlot={
            <KeyInput
              current={key}
              label={label}
              isTaken={(candidate) => candidate !== key && taken(candidate)}
              onRename={(to) => rename(key, to)}
            />
          }
          onRemove={() => onChange(childPointer(pointer, key), undefined)}
        />
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          aria-label={`New key in ${label}`}
          placeholder="New key"
          className={`${inputClass} max-w-48`}
          spellCheck={false}
          list={suggestions.length > 0 ? listId : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((key) => (
              <option key={key} value={key} />
            ))}
          </datalist>
        )}
        <Button
          className="text-xs"
          disabled={!canAdd}
          onClick={add}
          aria-label={`Add entry to ${label}`}
        >
          <Plus size={12} aria-hidden />
          Add entry
        </Button>
      </div>
    </div>
  );
}

/** Editable map key; renames on Enter or blur, reverts on Escape or a clash. */
function KeyInput({
  current,
  label,
  isTaken,
  onRename,
}: {
  current: string;
  label: string;
  isTaken: (key: string) => boolean;
  onRename: (key: string) => void;
}) {
  const [text, setText] = useState(current);
  useEffect(() => setText(current), [current]);
  const commit = () => {
    if (text === current) return;
    if (text === '' || isTaken(text)) {
      setText(current);
      return;
    }
    onRename(text);
  };
  return (
    <input
      type="text"
      aria-label={`Key ${current} in ${label}`}
      className={`${inputClass} max-w-48 font-medium`}
      spellCheck={false}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          setText(current);
        }
      }}
    />
  );
}
