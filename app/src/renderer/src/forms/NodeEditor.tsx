/**
 * The recursive part of the form: `Field` (label, description, problems, collapsing) and
 * `NodeEditor` (the control for one schema node at one pointer).
 */
import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { ChevronDown, ChevronRight, Info, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { iconButtonClass } from '../components/ui/Button';
import { Tip } from '../components/ui/Tip';
import { type FormProblem, useForm, useProblems } from './context';
import { JsonFallback } from './JsonFallback';
import { ListEditor, TupleEditor } from './ListEditor';
import { isJsonObject } from './pointer';
import { StructEditor } from './StructEditor';
import {
  BooleanControl,
  ChoiceControl,
  enumChoices,
  inputClass,
  NumberControl,
  StringControl,
} from './scalars';
import {
  defaultValue,
  describeNode,
  flattenUnion,
  inferMember,
  isInlineList,
  isScalar,
  jsonKind,
  literalChoices,
  resolveNode,
  typeLabel,
} from './schema-utils';

/** Composite sections at this depth or deeper start collapsed. */
const COLLAPSE_DEPTH = 4;

export interface NodeEditorProps {
  node: SchemaNode;
  value: Json | undefined;
  pointer: string;
  /** Accessible name of the control(s). */
  label: string;
  depth: number;
  /** The key under which the value sits in its parent object, for `%key` dispatchers. */
  parentKey?: string;
}

/** Problems at one pointer, listed under its control. */
export function ProblemList({ problems, id }: { problems: readonly FormProblem[]; id?: string }) {
  if (problems.length === 0) return null;
  return (
    <ul id={id} className="flex flex-col gap-0.5 text-xs">
      {problems.map((problem, index) => (
        <li
          key={index}
          data-severity={problem.severity}
          className={problem.severity === 'error' ? 'text-error' : 'text-warning'}
        >
          <span className="sr-only">{problem.severity}: </span>
          {problem.message}
        </li>
      ))}
    </ul>
  );
}

/** Small description button with a tooltip (hover and keyboard focus). */
export function DescriptionTip({ label, desc }: { label: string; desc: string | undefined }) {
  if (desc === undefined || desc.trim() === '') return null;
  return (
    <Tip label={<span className="whitespace-pre-line">{desc.trim()}</span>}>
      <button type="button" aria-label={`About ${label}`} className={iconButtonClass}>
        <Info size={12} aria-hidden />
      </button>
    </Tip>
  );
}

function isComposite(node: SchemaNode, value: Json | undefined): boolean {
  const target = resolveNode(node);
  switch (target.kind) {
    case 'struct':
    case 'dispatcher':
      return value === undefined || isJsonObject(value);
    case 'list':
      return !isInlineList(target) && (value === undefined || Array.isArray(value));
    case 'tuple':
      return !target.items.every(isScalar) && (value === undefined || Array.isArray(value));
    case 'union': {
      const members = flattenUnion(target);
      if (literalChoices(target) !== undefined) return false;
      const index = inferMember(members, value);
      const member = members[index];
      return member !== undefined && isComposite(member, value);
    }
    default:
      return false;
  }
}

/**
 * One labelled field: header (name, deprecated badge, description, remove), the editor and
 * its problems. Struct and list fields are collapsible; hidden pointers render nothing.
 */
export function Field({
  label,
  desc,
  deprecated,
  onRemove,
  headerExtra,
  labelSlot,
  editorOverride,
  ...editor
}: NodeEditorProps & {
  desc?: string | undefined;
  deprecated?: boolean | undefined;
  onRemove?: (() => void) | undefined;
  headerExtra?: ReactNode;
  /** Replaces the label text in the header, e.g. with a map key input. */
  labelSlot?: ReactNode;
  /** Renders this instead of the node's own editor (dispatcher selects). */
  editorOverride?: ReactNode;
}) {
  const { hidden } = useForm();
  const problems = useProblems(editor.pointer);
  const composite = isComposite(editor.node, editor.value);
  const [open, setOpen] = useState(editor.depth < COLLAPSE_DEPTH);
  const problemId = useId();
  if (hidden.has(editor.pointer)) return null;
  const description = desc ?? describeNode(editor.node);
  const header = (
    <div className="flex min-w-0 items-center gap-1">
      {composite ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
          className={iconButtonClass}
          onClick={() => setOpen(!open)}
          data-collapse-toggle
        >
          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        </button>
      ) : null}
      {labelSlot ?? <span className="truncate font-medium text-sm">{label}</span>}
      {deprecated === true && (
        <span className="rounded border border-warning px-1 text-[10px] text-warning">
          deprecated
        </span>
      )}
      <DescriptionTip label={label} desc={description} />
      {headerExtra}
      {onRemove !== undefined && (
        <button
          type="button"
          aria-label={`Remove ${label}`}
          className={`${iconButtonClass} ml-auto`}
          onClick={onRemove}
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </div>
  );
  if (composite) {
    return (
      <fieldset
        data-pointer={editor.pointer}
        data-collapsed={open ? undefined : 'true'}
        aria-label={label}
        aria-describedby={problems.length > 0 ? problemId : undefined}
        className="flex min-w-0 flex-col gap-1 rounded border border-border p-1.5"
      >
        {header}
        <ProblemList problems={problems} id={problemId} />
        {open && (
          <div className="flex flex-col gap-1.5 pl-2">
            {editorOverride ?? <NodeEditor label={label} {...editor} />}
          </div>
        )}
      </fieldset>
    );
  }
  return (
    <div data-pointer={editor.pointer} className="flex min-w-0 flex-col gap-0.5">
      {header}
      {editorOverride ?? <NodeEditor label={label} {...editor} />}
      <ProblemList problems={problems} id={problemId} />
    </div>
  );
}

function Mismatch({ node, value, pointer, label }: NodeEditorProps) {
  return (
    <JsonFallback
      pointer={pointer}
      value={value}
      label={label}
      notice={`Expected ${typeLabel(node)} but found ${jsonKind(value)}; edit it as JSON.`}
    />
  );
}

/** The control for one node at one pointer, chosen by the (resolved) node kind. */
export function NodeEditor(props: NodeEditorProps) {
  const { maxDepth } = useForm();
  const problems = useProblems(props.pointer);
  const invalid = problems.some((problem) => problem.severity === 'error');
  const { value, pointer, label, depth } = props;
  const node = resolveNode(props.node);
  if (depth > maxDepth) {
    return (
      <JsonFallback
        pointer={pointer}
        value={value}
        label={label}
        notice="Nested too deeply for the form; edit it as JSON here or in Raw JSON."
      />
    );
  }
  const scalar = { pointer, label, invalid };
  switch (node.kind) {
    case 'struct':
    case 'dispatcher':
      if (value !== undefined && !isJsonObject(value)) return <Mismatch {...props} />;
      return <StructEditor {...props} node={node} value={value} />;
    case 'list':
      if (value !== undefined && !Array.isArray(value)) return <Mismatch {...props} />;
      return <ListEditor {...props} node={node} value={value} />;
    case 'tuple':
      if (value !== undefined && !Array.isArray(value)) return <Mismatch {...props} />;
      return <TupleEditor {...props} node={node} value={value} />;
    case 'string':
      if (value !== undefined && typeof value !== 'string') return <Mismatch {...props} />;
      return <StringControl {...scalar} node={node} value={value} />;
    case 'number':
      if (value !== undefined && typeof value !== 'number') return <Mismatch {...props} />;
      return <NumberControl {...scalar} node={node} value={value} />;
    case 'boolean':
      if (value !== undefined && typeof value !== 'boolean') return <Mismatch {...props} />;
      return <BooleanControl {...scalar} value={value} />;
    case 'enum':
      return <ChoiceControl {...scalar} choices={enumChoices(node)} value={value} />;
    case 'literal':
      return <LiteralControl {...scalar} literal={node.value} value={value} />;
    case 'union':
      return <UnionEditor {...props} node={node} />;
    case 'any':
      return <JsonFallback pointer={pointer} value={value} label={label} />;
    case 'unsupported':
      return (
        <JsonFallback
          pointer={pointer}
          value={value}
          label={label}
          notice={`The form cannot edit this part of the schema (${node.reason}); edit it as JSON here or in Raw JSON.`}
        />
      );
    case 'reference':
      // resolveNode never returns a reference.
      return null;
  }
}

function LiteralControl({
  literal,
  value,
  pointer,
  label,
}: {
  literal: string | number | boolean;
  value: Json | undefined;
  pointer: string;
  label: string;
  invalid: boolean;
}) {
  const { onChange } = useForm();
  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="text"
        readOnly
        aria-label={label}
        className={`${inputClass} w-auto font-mono`}
        value={JSON.stringify(literal)}
      />
      {value !== literal && (
        <button
          type="button"
          className="cursor-pointer text-accent text-xs underline"
          onClick={() => onChange(pointer, literal)}
        >
          Set to {JSON.stringify(literal)}
        </button>
      )}
    </div>
  );
}

/** Variant picker plus the chosen member's editor. */
function UnionEditor(props: NodeEditorProps & { node: SchemaNode & { kind: 'union' } }) {
  const { onChange } = useForm();
  const { node, value, pointer, label } = props;
  const literals = literalChoices(node);
  if (literals !== undefined) {
    return (
      <ChoiceControl
        pointer={pointer}
        label={label}
        invalid={false}
        choices={literals.map((entry) => ({ value: entry, label: String(entry) }))}
        value={value}
      />
    );
  }
  const members = flattenUnion(node);
  const only = members[0];
  if (members.length === 1 && only !== undefined) return <NodeEditor {...props} node={only} />;
  const index = inferMember(members, value);
  const labels = uniqueLabels(members.map(typeLabel));
  const member = members[index];
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <select
        aria-label={`${label} variant`}
        className={`${inputClass} w-auto self-start`}
        value={index >= 0 ? String(index) : ''}
        onChange={(event) => {
          const next = members[Number(event.target.value)];
          if (next !== undefined) onChange(pointer, defaultValue(next));
        }}
      >
        {index < 0 && (
          <option value="" disabled>
            Choose a variant...
          </option>
        )}
        {labels.map((entry, position) => (
          <option key={entry} value={String(position)}>
            {entry}
          </option>
        ))}
      </select>
      {member === undefined ? (
        <JsonFallback
          pointer={pointer}
          value={value}
          label={label}
          notice="The value matches no variant; edit it as JSON or choose a variant."
        />
      ) : (
        <NodeEditor {...props} node={member} />
      )}
    </div>
  );
}

function uniqueLabels(labels: readonly string[]): string[] {
  const counts = new Map<string, number>();
  return labels.map((entry) => {
    const count = (counts.get(entry) ?? 0) + 1;
    counts.set(entry, count);
    return count === 1 ? entry : `${entry} (${count})`;
  });
}
