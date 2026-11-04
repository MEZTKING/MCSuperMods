/**
 * Structure Studio (plan D7): a structure template's size and block count, its palette, and
 * a table of its jigsaw blocks (pool, name, target, final state, joint, priorities) edited
 * through `onChange`; "Replace from file…" re-imports a `.nbt` or `.schem` file into the same
 * id, and the two structure export commands run from here. The 3D preview is the dock.
 * "Advanced" shows the full schema form.
 *
 * data-testids: `structure-studio`, `structure-advanced-toggle`, `structure-summary`,
 * `structure-replace`, `structure-export-nbt`, `structure-export-schem`, `structure-palette`,
 * `structure-jigsaw-<n>`, `structure-jigsaw-<n>-pool`, `structure-jigsaw-<n>-pool-status`.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { Download, FileUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { type FormProblem, isWithin, ProblemList } from '../../forms';
import type { StudioProps } from '../types';
import { poolStatus, TEMPLATE_POOL_KIND, vanillaIdSet } from './connections';
import { useStructureStudioHost } from './host';
import {
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

function within(problems: readonly FormProblem[], pointer: string): FormProblem[] {
  return problems.filter((problem) => isWithin(problem.path, pointer));
}

function hasError(problems: readonly FormProblem[]): boolean {
  return problems.some((problem) => problem.severity === 'error');
}

/** Size, palette usage and jigsaw count of a structure template's data. */
export function templateSummary(data: Json): {
  size: number[];
  blocks: number;
  palette: { state: string; count: number }[];
  jigsaws: number;
} {
  const template = asObject(data);
  const size = Array.isArray(template.size)
    ? template.size.map((axis) => (typeof axis === 'number' ? axis : 0))
    : [];
  const palette = Array.isArray(template.palette)
    ? template.palette.map((state) => ({
        state: typeof state === 'string' ? state : '?',
        count: 0,
      }))
    : [];
  const blocks = Array.isArray(template.blocks) ? template.blocks : [];
  for (const block of blocks) {
    if (!Array.isArray(block)) continue;
    const index = block[3];
    if (typeof index === 'number') {
      const entry = palette[index];
      if (entry !== undefined) entry.count += 1;
    }
  }
  const jigsaws = Array.isArray(template.jigsaws) ? template.jigsaws.length : 0;
  return { size, blocks: blocks.length, palette, jigsaws };
}

const POOL_REGISTRY = 'worldgen/template_pool';

/** The structure template Studio. */
export function StructureStudio(props: StudioProps) {
  const { element, onChange, problems, project, context } = props;
  const host = useStructureStudioHost();
  const [advanced, setAdvanced] = useState(false);
  const template = asObject(element.data);
  const summary = useMemo(() => templateSummary(element.data), [element.data]);
  const jigsaws: Json[] = Array.isArray(template.jigsaws) ? template.jigsaws : [];
  const jigsawNode = useMemo(
    () => listItemNode(fieldNode(props.node, undefined, 'jigsaws')),
    [props.node],
  );
  const joints = useMemo(
    () => stringChoices(fieldNode(jigsawNode, undefined, 'joint')),
    [jigsawNode],
  );
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

  return (
    <section
      aria-label="Structure template"
      data-testid="structure-studio"
      className="flex flex-col gap-3 px-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="text-xs"
          data-testid="structure-replace"
          disabled={host === null}
          onClick={() => host?.replaceFromFile(element.id)}
        >
          <FileUp size={12} aria-hidden />
          Replace from file…
        </Button>
        <Button
          className="text-xs"
          data-testid="structure-export-nbt"
          disabled={host === null}
          onClick={() => host?.exportStructures('nbt')}
        >
          <Download size={12} aria-hidden />
          Export structures (.nbt)…
        </Button>
        <Button
          className="text-xs"
          data-testid="structure-export-schem"
          disabled={host === null}
          onClick={() => host?.exportStructures('schem')}
        >
          <Download size={12} aria-hidden />
          Export structures (.schem)…
        </Button>
        <label className="ml-auto flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            data-testid="structure-advanced-toggle"
            checked={advanced}
            onChange={(event) => setAdvanced(event.target.checked)}
          />
          Advanced (all fields)
        </label>
      </div>
      {advanced ? (
        <div data-testid="schema-form">{props.form}</div>
      ) : (
        <>
          <dl
            data-testid="structure-summary"
            className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm"
          >
            <dt className="text-muted">Size</dt>
            <dd>{summary.size.length === 3 ? summary.size.join(' × ') : 'Unknown'}</dd>
            <dt className="text-muted">Blocks</dt>
            <dd>{summary.blocks}</dd>
            <dt className="text-muted">Palette entries</dt>
            <dd>{summary.palette.length}</dd>
            <dt className="text-muted">Jigsaw blocks</dt>
            <dd>{summary.jigsaws}</dd>
          </dl>
          <ProblemList problems={within(problems, '/size')} />
          <h3 className="font-semibold text-sm">Palette</h3>
          <ol
            aria-label="Palette"
            data-testid="structure-palette"
            className="flex flex-col text-xs"
          >
            {summary.palette.map((entry, index) => (
              <li key={index} className="flex gap-2">
                <code className="min-w-0 flex-1 truncate font-mono">{entry.state}</code>
                <span className="text-muted">{entry.count}</span>
              </li>
            ))}
          </ol>
          {summary.palette.length === 0 && <p className="text-muted text-sm">No blocks.</p>}
          <ProblemList problems={within(problems, '/palette')} />
          <h3 className="font-semibold text-sm">Jigsaw blocks</h3>
          {jigsaws.length === 0 ? (
            <p className="text-muted text-sm">
              No jigsaw blocks. Place them in-game, save with a structure block and use Replace from
              file….
            </p>
          ) : (
            <ol aria-label="Jigsaw blocks" className="flex flex-col gap-2">
              {jigsaws.map((jigsaw, index) => (
                <JigsawRow
                  key={index}
                  index={index}
                  jigsaw={jigsaw}
                  joints={joints}
                  problems={problems}
                  suggest={props.suggest}
                  onChange={onChange}
                  status={(pool) => poolStatus(pool, projectPools, vanillaPools)}
                />
              ))}
            </ol>
          )}
          <ProblemList
            problems={problems.filter(
              (problem) => problem.path === '' || problem.path === '/jigsaws',
            )}
          />
        </>
      )}
    </section>
  );
}

interface JigsawRowProps {
  index: number;
  jigsaw: Json;
  joints: readonly string[];
  problems: readonly FormProblem[];
  suggest: StudioProps['suggest'];
  onChange: StudioProps['onChange'];
  status(pool: string): 'project' | 'vanilla' | 'missing';
}

function JigsawRow(props: JigsawRowProps) {
  const { index, onChange, problems } = props;
  const base = `/jigsaws/${index}`;
  const jigsaw = asObject(props.jigsaw);
  const text = (key: string) => (typeof jigsaw[key] === 'string' ? (jigsaw[key] as string) : '');
  const pos = Array.isArray(jigsaw.pos) ? jigsaw.pos.join(', ') : '?';
  const pool = text('pool');
  const status = pool === '' ? null : props.status(pool);
  const testId = `structure-jigsaw-${index}`;
  const field = (key: string) => hasError(within(problems, `${base}/${key}`));
  return (
    <li
      aria-label={`Jigsaw ${index + 1} at ${pos}`}
      data-testid={testId}
      className="flex flex-col gap-1 rounded border border-border p-2"
    >
      <div className="text-muted text-xs">
        Jigsaw {index + 1} at <span className="font-mono">{pos}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex items-end gap-2">
          <IdField
            label="Pool"
            value={pool}
            registry={POOL_REGISTRY}
            suggest={props.suggest}
            testId={`${testId}-pool`}
            invalid={field('pool')}
            className="flex-1"
            onCommit={(value) => onChange(`${base}/pool`, value)}
          />
          {status !== null && (
            <span
              data-testid={`${testId}-pool-status`}
              data-status={status}
              className={status === 'missing' ? 'text-error text-xs' : 'text-muted text-xs'}
            >
              {POOL_STATUS_LABELS[status]}
            </span>
          )}
        </div>
        <IdField
          label="Name"
          value={text('name')}
          registry="jigsaw_name"
          testId={`${testId}-name`}
          invalid={field('name')}
          onCommit={(value) => onChange(`${base}/name`, value)}
        />
        <IdField
          label="Target"
          value={text('target')}
          registry="jigsaw_name"
          testId={`${testId}-target`}
          invalid={field('target')}
          onCommit={(value) => onChange(`${base}/target`, value)}
        />
        <IdField
          label="Final state"
          value={text('final_state')}
          registry="block"
          suggest={props.suggest}
          testId={`${testId}-final-state`}
          invalid={field('final_state')}
          onCommit={(value) => onChange(`${base}/final_state`, value)}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Joint"
          value={text('joint') === '' ? undefined : text('joint')}
          choices={props.joints}
          emptyLabel="(default)"
          testId={`${testId}-joint`}
          onChange={(value) => onChange(`${base}/joint`, value)}
        />
        <NumberField
          label="Placement priority"
          value={jigsaw.placement_priority}
          integer
          allowEmpty
          testId={`${testId}-placement-priority`}
          invalid={field('placement_priority')}
          onCommit={(value) =>
            onChange(`${base}/placement_priority`, value, {
              coalesce: `typing:${base}/placement_priority`,
            })
          }
        />
        <NumberField
          label="Selection priority"
          value={jigsaw.selection_priority}
          integer
          allowEmpty
          testId={`${testId}-selection-priority`}
          invalid={field('selection_priority')}
          onCommit={(value) =>
            onChange(`${base}/selection_priority`, value, {
              coalesce: `typing:${base}/selection_priority`,
            })
          }
        />
      </div>
      <ProblemList problems={within(problems, base)} />
    </li>
  );
}
