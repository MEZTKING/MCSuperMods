/**
 * List and tuple editors. Lists have add, remove and move up/down; short fixed-length
 * lists of scalars (vectors such as `from`/`to`) and all-scalar tuples render as one row.
 */
import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { Button, iconButtonClass } from '../components/ui/Button';
import { useForm, useProblems } from './context';
import { Field, NodeEditor, type NodeEditorProps, ProblemList } from './NodeEditor';
import { childPointer } from './pointer';
import { childScopes, defaultValue, isInlineList, isScalar } from './schema-utils';

/** Inline row of scalar slots, each with its own problems. */
function InlineSlots({
  items,
  values,
  pointer,
  label,
  depth,
}: {
  items: readonly SchemaNode[];
  values: readonly Json[];
  pointer: string;
  label: string;
  depth: number;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, index) => (
        <Slot
          key={index}
          node={item}
          value={values[index]}
          pointer={childPointer(pointer, index)}
          label={`${label} ${index + 1}`}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function Slot(props: NodeEditorProps) {
  const problems = useProblems(props.pointer);
  return (
    <div data-pointer={props.pointer} className="flex min-w-0 flex-col gap-0.5">
      <NodeEditor {...props} />
      <ProblemList problems={problems} />
    </div>
  );
}

function CreateButton({
  node,
  pointer,
  label,
}: {
  node: SchemaNode;
  pointer: string;
  label: string;
}) {
  const { onChange } = useForm();
  return (
    <Button className="self-start text-xs" onClick={() => onChange(pointer, defaultValue(node))}>
      <Plus size={12} aria-hidden />
      Create {label}
    </Button>
  );
}

export function ListEditor(
  props: NodeEditorProps & { node: SchemaNode & { kind: 'list' }; value: Json[] | undefined },
) {
  const { onChange } = useForm();
  const { node, value, pointer, label, depth } = props;
  const items = value ?? [];
  const min = node.lengthRange?.min;
  const max = node.lengthRange?.max;
  const fixed = isInlineList(node);

  if (fixed) {
    if (value === undefined) return <CreateButton node={node} pointer={pointer} label={label} />;
    if (items.length === min) {
      return (
        <InlineSlots
          items={items.map(() => node.item)}
          values={items}
          pointer={pointer}
          label={label}
          depth={depth}
        />
      );
    }
  }

  const move = (from: number, to: number) => {
    const next = [...items];
    const [entry] = next.splice(from, 1);
    if (entry === undefined) return;
    next.splice(to, 0, entry);
    onChange(pointer, next);
  };
  const full = max !== undefined && items.length >= max;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {items.map((item, index) => {
        const name = `${label} item ${index + 1}`;
        return (
          <Field
            key={index}
            node={node.item}
            value={item}
            pointer={childPointer(pointer, index)}
            label={name}
            depth={depth + 1}
            scopes={childScopes(props)}
            headerExtra={
              <>
                <button
                  type="button"
                  aria-label={`Move ${name} up`}
                  className={iconButtonClass}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${name} down`}
                  className={iconButtonClass}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown size={12} aria-hidden />
                </button>
              </>
            }
            onRemove={() => onChange(childPointer(pointer, index), undefined)}
          />
        );
      })}
      <Button
        className="self-start text-xs"
        aria-label={`Add item to ${label}`}
        disabled={full}
        onClick={() => onChange(`${pointer}/-`, defaultValue(node.item))}
      >
        <Plus size={12} aria-hidden />
        Add item
      </Button>
    </div>
  );
}

export function TupleEditor(
  props: NodeEditorProps & { node: SchemaNode & { kind: 'tuple' }; value: Json[] | undefined },
) {
  const { node, value, pointer, label, depth } = props;
  if (value === undefined) return <CreateButton node={node} pointer={pointer} label={label} />;
  if (node.items.every(isScalar)) {
    return (
      <InlineSlots
        items={node.items}
        values={value}
        pointer={pointer}
        label={label}
        depth={depth}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {node.items.map((item, index) => (
        <Field
          key={index}
          node={item}
          value={value[index]}
          pointer={childPointer(pointer, index)}
          label={`${label} ${index + 1}`}
          depth={depth + 1}
          scopes={childScopes(props)}
        />
      ))}
    </div>
  );
}
