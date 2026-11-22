/**
 * Block transformers and vanilla block rules, tried on a block (B614; ADR 0120 D8, limit 2L11):
 * each row is the block **Before** and **After** with the tool that does it, the sound it plays
 * and what the preview leaves out, drawn at once from the element (no worker: it reads the
 * element's own data with `@msm/sim`'s readers, the code Try it runs). **In Try it** names the
 * blocks and tools Try it's picker offers for it, so the same rows can be tried on the blocks as
 * props there. The preview panel shows it for both kinds, and the Vanilla block rules Studio's
 * section **Try it here**.
 */

import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { FIDELITY_LABELS, type Fidelity, weakest } from '../../frame/fidelity';
import { ItemSlot } from '../../frame/ItemSlot';
import {
  type ItemPictureSource,
  type LangTable,
  resourceFoldersOf,
  useVanillaLang,
} from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { factsOf } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import {
  type BlockRulesModel,
  type RuleRow,
  transformerModel,
  vanillaRulesModel,
} from './block-rules-model';

/** A block (or a tag, or any block) in a slot. */
function BlockCell(props: {
  readonly id: string;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
  readonly testId: string;
}) {
  const { id } = props;
  if (id === '*') {
    return (
      <span data-testid={props.testId} className="text-sm text-muted">
        Any block
      </span>
    );
  }
  if (id.startsWith('#')) {
    return (
      <span
        data-testid={props.testId}
        className="rounded border border-border px-1.5 py-0.5 text-xs [overflow-wrap:anywhere]"
        title="Every block in this tag (the Tag Studio shows them)"
      >
        {id}
      </span>
    );
  }
  return (
    <ItemSlot
      item={{ id, count: 1 }}
      pictures={props.pictures}
      lang={props.lang}
      testId={props.testId}
    />
  );
}

/** One row: before, the tool, after, then its lines. */
function Row(props: {
  readonly row: RuleRow;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
}) {
  const { row, pictures, lang } = props;
  const base = `block-rules-row-${row.key}`;
  return (
    <li data-testid={base} data-fidelity={row.fidelity} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <figure className="flex flex-wrap items-center gap-1">
          <figcaption className="sr-only">Before</figcaption>
          {row.before.map((id, index) => (
            <BlockCell
              key={id}
              id={id}
              pictures={pictures}
              lang={lang}
              testId={`${base}-before-${index}`}
            />
          ))}
        </figure>
        <span className="flex items-center gap-1 text-xs text-muted" data-testid={`${base}-tool`}>
          {row.toolItem !== undefined && (
            <ItemSlot item={{ id: row.toolItem, count: 1 }} pictures={pictures} lang={lang} />
          )}
          {row.tool}
          <ArrowRight size={14} aria-hidden />
        </span>
        <figure className="flex items-center gap-1">
          <figcaption className="sr-only">After</figcaption>
          {row.after !== undefined ? (
            <BlockCell id={row.after} pictures={pictures} lang={lang} testId={`${base}-after`} />
          ) : (
            <span data-testid={`${base}-after`} className="text-sm text-muted">
              {FIDELITY_LABELS.only_in_game}
            </span>
          )}
        </figure>
      </div>
      <ul className="flex flex-col gap-0.5 text-xs text-muted [overflow-wrap:anywhere]">
        {row.after !== undefined && (
          <li>
            {row.keeps ? 'Keeps the block states it shares with the new block' : 'Its block states'}
            {row.properties.length > 0 ? `; sets ${row.properties.join(', ')}` : ''}.
          </li>
        )}
        {row.sound !== undefined && (
          <li data-testid={`${base}-sound`}>
            Sound: {row.sound} (a caption in Try it; it plays in the game).
          </li>
        )}
        {row.unknown !== undefined && (
          <li data-testid={`${base}-unknown`}>
            {row.unknown === 'Not in Try it'
              ? 'Only in the game.'
              : `Only in the game: ${row.unknown}.`}
          </li>
        )}
        {row.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>{FIDELITY_LABELS[row.fidelity]}</li>
      </ul>
    </li>
  );
}

/** The body of the view for a model. */
function RulesBody(props: {
  readonly model: BlockRulesModel;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
}) {
  const { model, pictures, lang } = props;
  return (
    <div className="flex flex-col gap-3">
      <div data-testid="block-rules-used-by" className="flex flex-col gap-0.5 text-sm">
        <span className="font-medium">Used by</span>
        {model.usedBy.map((line) => (
          <span key={line} className="text-muted [overflow-wrap:anywhere]">
            {line}
          </span>
        ))}
      </div>
      {model.groups.length === 0 && (
        <p data-testid="block-rules-empty" className="text-sm text-muted">
          No blocks yet: add one and it shows here.
        </p>
      )}
      {model.groups.map((group) => (
        <section
          key={group.key}
          aria-label={group.title}
          data-testid={`block-rules-group-${group.key}`}
          className="flex flex-col gap-2"
        >
          <h4 className="text-sm font-medium">{group.title}</h4>
          <ol className="flex flex-col gap-3">
            {group.rows.map((row) => (
              <Row key={row.key} row={row} pictures={pictures} lang={lang} />
            ))}
          </ol>
        </section>
      ))}
      <div
        data-testid="block-rules-try-it"
        className="flex flex-col gap-1 rounded border border-border px-3 py-2 text-sm"
      >
        <span className="font-medium">In Try it</span>
        {model.tryItBlocks.length === 0 || model.tryItTools.length === 0 ? (
          <span className="text-muted">
            Nothing to try yet: Try it needs a block to place and a tool that uses this.
          </span>
        ) : (
          <span className="text-muted [overflow-wrap:anywhere]">
            Press Try it on the toolbar: its picker has {model.tryItBlocks.join(', ')} and{' '}
            {model.tryItTools.join(', ')}. Place a block, hold the tool and use it on the block.
          </span>
        )}
      </div>
    </div>
  );
}

/** The view, for both kinds. */
export default function BlockRules(props: LiveViewProps) {
  const { project, element, vanillaAssets } = props;
  const folders = useMemo(() => resourceFoldersOf(project), [project]);
  const pictures = useMemo(() => ({ vanillaAssets, folders }), [vanillaAssets, folders]);
  const lang = useVanillaLang(vanillaAssets, folders);
  const model = useMemo(
    () =>
      element.kind === 'msm:vanilla_block_rules'
        ? vanillaRulesModel(element, factsOf(project)?.blocks?.vanillaPairs)
        : transformerModel(element, project),
    [element, project],
  );
  const fidelity: Fidelity = weakest([
    'about_right',
    ...model.groups.flatMap((group) => group.rows.map((row) => row.fidelity)),
  ]);
  return (
    <LiveViewFrame title={model.title} fidelity={fidelity} notes={model.notes}>
      <RulesBody model={model} pictures={pictures} lang={lang} />
    </LiveViewFrame>
  );
}
