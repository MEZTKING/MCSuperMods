/**
 * Template Pool Studio (plan D7): the fallback pool, the pieces (weight, element type,
 * location, processors, projection), a Connections panel listing the jigsaw blocks of the
 * project structure templates the pool places, and "Used by". Choices come from the schema
 * (the element type dispatcher, the projection enum) and the vanilla registries; edits go
 * through `onChange`, so Raw JSON stays in sync. "Advanced" shows the full schema form.
 *
 * data-testids: `pool-studio`, `pool-advanced-toggle`, `pool-fallback`, `pool-piece-<n>`,
 * `pool-piece-<n>-weight`, `pool-piece-<n>-type`, `pool-piece-<n>-location`,
 * `pool-piece-<n>-processors`, `pool-piece-<n>-projection`, `pool-add-piece`,
 * `pool-connections`, `pool-connection-<n>`, `pool-used-by`.
 *
 * @packageDocumentation
 */

import type { Json, ResourceLocation } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { type FormProblem, isWithin, ProblemList } from '../../forms';
import type { StudioProps } from '../types';
import {
  normaliseId,
  type PoolConnections,
  poolConnections,
  poolStatus,
  TEMPLATE_POOL_KIND,
  vanillaIdSet,
} from './connections';
import { useStructureStudioHost } from './host';
import {
  discriminatorChoices,
  fieldNode,
  IdField,
  listItemNode,
  NumberField,
  POOL_STATUS_LABELS,
  SelectField,
  stringChoices,
} from './pickers';

type JsonObject = { [key: string]: Json };

function asObject(value: Json | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
}

const POOL_REGISTRY = 'worldgen/template_pool';
const ELEMENT_TYPE_REGISTRY = 'worldgen/structure_pool_element';

function within(problems: readonly FormProblem[], pointer: string): FormProblem[] {
  return problems.filter((problem) => isWithin(problem.path, pointer));
}

function hasError(problems: readonly FormProblem[]): boolean {
  return problems.some((problem) => problem.severity === 'error');
}

/** The schema nodes the Studio reads: the piece (list item) and its `element`. */
function poolNodes(node: SchemaNode, data: Json) {
  const piece = listItemNode(fieldNode(node, data, 'elements'));
  const element = fieldNode(piece, undefined, 'element');
  return { piece, element };
}

/** The template pool Studio. */
export function TemplatePoolStudio(props: StudioProps) {
  const { element, onChange, problems, context, project } = props;
  const host = useStructureStudioHost();
  const [advanced, setAdvanced] = useState(false);
  const pool = asObject(element.data);
  const pieces: Json[] = Array.isArray(pool.elements) ? pool.elements : [];
  const nodes = useMemo(() => poolNodes(props.node, element.data), [props.node, element.data]);
  const vanillaPools = useMemo(
    () => vanillaIdSet(context.vanillaRegistries[POOL_REGISTRY]),
    [context.vanillaRegistries],
  );
  const projectPools = useMemo(() => {
    const ids = new Set<string>();
    for (const namespace of project.namespaces) {
      for (const entry of namespace.elements) {
        if (entry.kind === TEMPLATE_POOL_KIND) ids.add(entry.id);
      }
    }
    return ids;
  }, [project]);
  const connections = useMemo(
    () => poolConnections(project, element.id, { vanillaPools }),
    [project, element.id, vanillaPools],
  );
  const vanillaTypes = context.vanillaRegistries[ELEMENT_TYPE_REGISTRY] ?? [];

  const fallback = typeof pool.fallback === 'string' ? pool.fallback : '';
  const fallbackStatus = fallback === '' ? null : poolStatus(fallback, projectPools, vanillaPools);

  const newPiece = (): Json => {
    const defaults = asObject(props.kind.defaultData);
    const first = Array.isArray(defaults.elements) ? defaults.elements[0] : undefined;
    if (first !== undefined) return structuredClone(first);
    const [type] = discriminatorChoices(nodes.element, {}, 'element_type', vanillaTypes);
    return { weight: 1, element: type === undefined ? {} : { element_type: type } };
  };
  const addPiece = () => {
    if (Array.isArray(pool.elements)) onChange('/elements/-', newPiece());
    else onChange('/elements', [newPiece()]);
  };
  const movePiece = (from: number, to: number) => {
    const next = [...pieces];
    const [entry] = next.splice(from, 1);
    if (entry === undefined) return;
    next.splice(to, 0, entry);
    onChange('/elements', next);
  };

  return (
    <section
      aria-label="Template pool"
      data-testid="pool-studio"
      className="flex flex-col gap-3 px-2"
    >
      <label className="flex items-center gap-1.5 self-end text-sm">
        <input
          type="checkbox"
          data-testid="pool-advanced-toggle"
          checked={advanced}
          onChange={(event) => setAdvanced(event.target.checked)}
        />
        Advanced (all fields)
      </label>
      {advanced ? (
        <div data-testid="schema-form">{props.form}</div>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <IdField
              label="Fallback pool"
              value={fallback}
              registry={POOL_REGISTRY}
              suggest={props.suggest}
              onCommit={(text) => onChange('/fallback', text)}
              testId="pool-fallback"
              invalid={hasError(within(problems, '/fallback'))}
              className="max-w-96 flex-1"
            />
            {fallbackStatus !== null && (
              <span className={statusClass(fallbackStatus)} data-testid="pool-fallback-status">
                {POOL_STATUS_LABELS[fallbackStatus]}
              </span>
            )}
          </div>
          <ProblemList problems={within(problems, '/fallback')} />
          <h3 className="font-semibold text-sm">Pieces</h3>
          <ol aria-label="Pieces" className="flex flex-col gap-2">
            {pieces.map((piece, index) => (
              <PieceRow
                key={index}
                index={index}
                count={pieces.length}
                piece={piece}
                elementNode={nodes.element}
                vanillaTypes={vanillaTypes}
                problems={problems}
                suggest={props.suggest}
                onChange={onChange}
                onMove={movePiece}
              />
            ))}
          </ol>
          {pieces.length === 0 && <p className="text-muted text-sm">No pieces yet.</p>}
          <div>
            <Button className="text-xs" data-testid="pool-add-piece" onClick={addPiece}>
              <Plus size={12} aria-hidden />
              Add piece
            </Button>
          </div>
          <ProblemList
            problems={problems.filter(
              (problem) => problem.path === '' || problem.path === '/elements',
            )}
          />
        </>
      )}
      <ConnectionsPanel connections={connections} onOpen={host?.openElement} />
      <UsedByPanel connections={connections} onOpen={host?.openElement} />
    </section>
  );
}

function statusClass(status: 'project' | 'vanilla' | 'missing'): string {
  return status === 'missing' ? 'text-error text-xs' : 'text-muted text-xs';
}

interface PieceRowProps {
  index: number;
  count: number;
  piece: Json;
  elementNode: SchemaNode | undefined;
  vanillaTypes: readonly string[];
  problems: readonly FormProblem[];
  suggest: StudioProps['suggest'];
  onChange: StudioProps['onChange'];
  onMove(from: number, to: number): void;
}

function PieceRow(props: PieceRowProps) {
  const { index, onChange, problems } = props;
  const base = `/elements/${index}`;
  const piece = asObject(props.piece);
  const element = asObject(piece.element);
  const type = typeof element.element_type === 'string' ? element.element_type : undefined;
  const types = discriminatorChoices(
    props.elementNode,
    element,
    'element_type',
    props.vanillaTypes,
  );
  const location = fieldNode(props.elementNode, element, 'location');
  const processors = fieldNode(props.elementNode, element, 'processors');
  const projection = fieldNode(props.elementNode, element, 'projection');
  const name = `Piece ${index + 1}`;
  const testId = `pool-piece-${index}`;
  return (
    <li
      aria-label={name}
      data-testid={testId}
      className="flex flex-col gap-1 rounded border border-border p-2"
    >
      <div className="flex flex-wrap items-end gap-2">
        <NumberField
          label="Weight"
          value={piece.weight}
          integer
          testId={`${testId}-weight`}
          invalid={hasError(within(problems, `${base}/weight`))}
          onCommit={(value) =>
            onChange(`${base}/weight`, value, { coalesce: `typing:${base}/weight` })
          }
        />
        <SelectField
          label="Element type"
          value={type}
          choices={types}
          testId={`${testId}-type`}
          onChange={(value) => onChange(`${base}/element/element_type`, value)}
        />
        {projection !== undefined && (
          <SelectField
            label="Projection"
            value={typeof element.projection === 'string' ? element.projection : undefined}
            choices={stringChoices(projection)}
            testId={`${testId}-projection`}
            onChange={(value) => onChange(`${base}/element/projection`, value)}
          />
        )}
        <div className="ml-auto flex items-center">
          <button
            type="button"
            aria-label={`Move ${name} up`}
            className={iconButtonClass}
            disabled={index === 0}
            onClick={() => props.onMove(index, index - 1)}
          >
            <ArrowUp size={12} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Move ${name} down`}
            className={iconButtonClass}
            disabled={index === props.count - 1}
            onClick={() => props.onMove(index, index + 1)}
          >
            <ArrowDown size={12} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Remove ${name}`}
            className={iconButtonClass}
            onClick={() => onChange(base, undefined)}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      </div>
      {location !== undefined && (
        <IdField
          label="Location"
          value={typeof element.location === 'string' ? element.location : ''}
          registry="structure"
          suggest={props.suggest}
          testId={`${testId}-location`}
          invalid={hasError(within(problems, `${base}/element/location`))}
          onCommit={(text) => onChange(`${base}/element/location`, text)}
        />
      )}
      {processors !== undefined &&
        (typeof element.processors === 'string' || element.processors === undefined ? (
          <IdField
            label="Processors"
            value={typeof element.processors === 'string' ? element.processors : ''}
            registry="worldgen/processor_list"
            suggest={props.suggest}
            testId={`${testId}-processors`}
            invalid={hasError(within(problems, `${base}/element/processors`))}
            onCommit={(text) => onChange(`${base}/element/processors`, text)}
          />
        ) : (
          <p className="text-muted text-xs" data-testid={`${testId}-processors`}>
            Processors: an inline processor list; edit it under Advanced.
          </p>
        ))}
      <ProblemList problems={within(problems, base)} />
    </li>
  );
}

function ConnectionsPanel(props: {
  connections: PoolConnections;
  onOpen: ((id: ResourceLocation) => void) | undefined;
}) {
  const { pieces } = props.connections;
  let row = 0;
  return (
    <section
      aria-label="Connections"
      data-testid="pool-connections"
      className="flex flex-col gap-1"
    >
      <h3 className="font-semibold text-sm">Connections</h3>
      {pieces.length === 0 ? (
        <p className="text-muted text-sm">
          No piece of this pool is a structure template in the project.
        </p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted">
              <th scope="col">Piece</th>
              <th scope="col">Jigsaw</th>
              <th scope="col">Target pool</th>
              <th scope="col">Pool</th>
              <th scope="col">Target</th>
            </tr>
          </thead>
          <tbody>
            {pieces.flatMap((piece) =>
              piece.jigsaws.length === 0
                ? [
                    <tr key={`${piece.templateId}:none`}>
                      <td>
                        <ElementLink id={piece.templateId} onOpen={props.onOpen} />
                      </td>
                      <td colSpan={4} className="text-muted">
                        No jigsaw blocks.
                      </td>
                    </tr>,
                  ]
                : piece.jigsaws.map((jigsaw, index) => {
                    const n = row++;
                    return (
                      <tr key={`${piece.templateId}:${index}`} data-testid={`pool-connection-${n}`}>
                        <td>
                          <ElementLink id={piece.templateId} onOpen={props.onOpen} />
                        </td>
                        <td className="font-mono">{jigsaw.name}</td>
                        <td className="font-mono">
                          {jigsaw.status === 'project' ? (
                            <ElementLink id={normaliseId(jigsaw.pool)} onOpen={props.onOpen} />
                          ) : (
                            jigsaw.pool
                          )}
                        </td>
                        <td className={statusClass(jigsaw.status)} data-status={jigsaw.status}>
                          {POOL_STATUS_LABELS[jigsaw.status]}
                        </td>
                        <td
                          className={jigsaw.targetFound === false ? 'text-error' : 'text-muted'}
                          data-target-found={String(jigsaw.targetFound)}
                        >
                          {jigsaw.targetFound === null
                            ? 'Not checked'
                            : jigsaw.targetFound
                              ? `${jigsaw.target} found`
                              : `No jigsaw named ${jigsaw.target}`}
                        </td>
                      </tr>
                    );
                  }),
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}

function UsedByPanel(props: {
  connections: PoolConnections;
  onOpen: ((id: ResourceLocation) => void) | undefined;
}) {
  const { structures, pools } = props.connections.usedBy;
  return (
    <section aria-label="Used by" data-testid="pool-used-by" className="flex flex-col gap-1">
      <h3 className="font-semibold text-sm">Used by</h3>
      {structures.length + pools.length === 0 ? (
        <p className="text-muted text-sm">Nothing in the project uses this pool.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-xs">
          {structures.map((id) => (
            <li key={`s:${id}`}>
              Structure (start pool): <ElementLink id={id} onOpen={props.onOpen} />
            </li>
          ))}
          {pools.map((id) => (
            <li key={`p:${id}`}>
              Pool (jigsaw target): <ElementLink id={id} onOpen={props.onOpen} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** An element id that goes to the element when the host can open it. */
function ElementLink(props: {
  id: ResourceLocation;
  onOpen: ((id: ResourceLocation) => void) | undefined;
}) {
  const { onOpen, id } = props;
  if (onOpen === undefined) return <code className="font-mono">{id}</code>;
  return (
    <button
      type="button"
      className="cursor-pointer font-mono text-accent underline-offset-2 hover:underline"
      aria-label={`Go to ${id}`}
      onClick={() => onOpen(id)}
    >
      {id}
    </button>
  );
}
