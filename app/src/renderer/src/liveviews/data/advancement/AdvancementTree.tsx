/**
 * An advancement's tab drawn as a tree (B611; ADR 0120 D6, limits 2L5 and 2L6): this
 * advancement lit, its parents and children marked, every frame and icon of the tab, the toast
 * and the chat line it shows when done, and its criteria as a checklist that never ticks by
 * itself. Parents, children, columns, frames, icons, titles and hidden ones are the data's; the
 * rows are MSM's own tidy tree in MSM's order of siblings (`tree-layout.ts`), so about right.
 * Vanilla parents come from the user's jar cache; without it the view says so and draws the
 * project's part.
 */

import type { Json } from '@msm/plugin-api';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { pngDataUrl } from '../../../preview/bundle-source';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { texturePath } from '../../../tryit/hotbar';
import { projectDataFiles } from '../../client';
import {
  type ItemPictureSource,
  itemName,
  resourceFoldersOf,
  useItemPicture,
} from '../../frame/item-picture';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import type { VanillaFolderFiles } from '../../vanilla-data';
import { useLang, useSettled } from '../lines/lang';
import { TextLine } from '../lines/TextLine';
import { type LangLookup, plainText, type TextRun, textRuns } from '../lines/text-component';
import {
  type AdvancementFrame,
  type AdvancementNode,
  ancestorsOf,
  childrenIndex,
  layoutTab,
  missingNode,
  readAdvancement,
  type TabLayout,
  withNamespace,
} from './tree-layout';

/** One column and one row of the tab in GUI pixels (B600 2S8: about 28 and 26). */
const COLUMN = 28;
const ROW = 26;
/** A frame's size in GUI pixels (MSM's own drawing). */
const NODE = 24;
/** Screen pixels per GUI pixel. */
const SCALE = 1.5;
const PAD = 12;

const FRAME_WORDS: Readonly<Record<AdvancementFrame, string>> = {
  task: 'Task',
  goal: 'Goal',
  challenge: 'Challenge',
};

/** The toast's heading for each frame (the game's words from `en_us` when the jar is set up). */
const TOAST_WORDS: Readonly<Record<AdvancementFrame, string>> = {
  task: 'Advancement Made!',
  goal: 'Goal Reached!',
  challenge: 'Challenge Complete!',
};

/** The chat line's words when no language file has them. */
const CHAT_WORDS: Readonly<Record<AdvancementFrame, string>> = {
  task: '%s has made the advancement %s',
  goal: '%s has reached the goal %s',
  challenge: '%s has completed the challenge %s',
};

/** The colour the chat line gives the title (MSM's drawing: green, or purple for a challenge). */
const TITLE_COLOURS: Readonly<Record<AdvancementFrame, string>> = {
  task: '#55ff55',
  goal: '#55ff55',
  challenge: '#ff55ff',
};

/** How a node relates to the advancement being viewed. */
type NodeState = 'this' | 'parent' | 'child' | 'other';

const STATE_COLOURS: Readonly<Record<NodeState, { fill: string; edge: string }>> = {
  this: { fill: '#d9a62e', edge: '#fff2b0' },
  parent: { fill: '#8a7440', edge: '#e0cf90' },
  child: { fill: '#5f7d8c', edge: '#b9dbe8' },
  other: { fill: '#4a4a4a', edge: '#9a9a9a' },
};

const STATE_WORDS: Readonly<Record<NodeState, string>> = {
  this: 'this advancement',
  parent: 'comes before it',
  child: 'comes after it',
  other: 'in the same tab',
};

/** The frame's outline: a square, a rounded square, or a spiky challenge frame. */
const FRAME_SHAPES: Readonly<Record<AdvancementFrame, CSSProperties>> = {
  task: { borderRadius: 2 },
  goal: { borderRadius: '40%' },
  challenge: {
    clipPath:
      'polygon(50% 0, 62% 12%, 85% 8%, 88% 38%, 100% 50%, 88% 62%, 85% 92%, 62% 88%, 50% 100%, 38% 88%, 15% 92%, 12% 62%, 0 50%, 12% 38%, 15% 8%, 38% 12%)',
  },
};

/** Where vanilla's advancements stand. */
type VanillaState =
  | { readonly status: 'none' | 'loading' | 'not_set_up' }
  | { readonly status: 'ready'; readonly files: VanillaFolderFiles };

/** Every advancement the view knows: vanilla's (when read), then the project's over them. */
function advancementMap(
  project: Readonly<Record<string, Json>>,
  element: { readonly id: string; readonly data: Json },
  vanilla: VanillaFolderFiles | null,
): Map<string, AdvancementNode> {
  const nodes = new Map<string, AdvancementNode>();
  for (const [id, json] of Object.entries(vanilla ?? {})) {
    nodes.set(id, readAdvancement(id, json, 'vanilla'));
  }
  for (const [id, json] of Object.entries(project)) {
    nodes.set(id, readAdvancement(id, json, 'project'));
  }
  const id = withNamespace(element.id);
  nodes.set(id, readAdvancement(id, element.data, 'project'));
  return nodes;
}

/** The ids of a node's ancestors and descendants, for lighting. */
function relatives(nodes: ReadonlyMap<string, AdvancementNode>, id: string) {
  const parents = new Set(ancestorsOf(nodes, id).chain);
  const children = childrenIndex(nodes);
  const descendants = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (descendants.has(next) || next === id) continue;
    descendants.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return { parents, descendants };
}

/** The node's icon: the item's picture, or the start of its name. */
function NodeIcon({ id, source }: { id: string; source: ItemPictureSource }) {
  const picture = useItemPicture(id, source);
  if (picture !== null) {
    return <img alt="" src={picture} className="size-6 [image-rendering:pixelated]" />;
  }
  return (
    <span className="text-[0.55rem] leading-none text-white">{itemName(id, null).slice(0, 3)}</span>
  );
}

/** The tab's background texture tiled, from the jar cache, or `null`. */
function useBackground(
  texture: string | null,
  vanillaAssets: VanillaAssetReader | null,
  source: ItemPictureSource,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const folders = source.folders;
  useEffect(() => {
    setUrl(null);
    if (texture === null || folders === null || vanillaAssets === null) return;
    if (!withNamespace(texture).startsWith('minecraft:')) return;
    let live = true;
    void vanillaAssets
      .readAsset(texturePath(folders, withNamespace(texture)))
      .then((bytes) => {
        if (live && bytes !== null && bytes.length > 0) setUrl(pngDataUrl(bytes));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [texture, vanillaAssets, folders]);
  return url;
}

interface TreeProps {
  readonly layout: TabLayout;
  readonly nodes: ReadonlyMap<string, AdvancementNode>;
  readonly viewed: string;
  readonly selected: string;
  onSelect(id: string): void;
  readonly lang: LangLookup;
  readonly source: ItemPictureSource;
  readonly background: string | null;
}

/** The tab: connectors under the frames, every frame a button. */
function Tree({ layout, nodes, viewed, selected, onSelect, lang, source, background }: TreeProps) {
  const { parents, descendants } = useMemo(() => relatives(nodes, viewed), [nodes, viewed]);
  const stateOf = (id: string): NodeState =>
    id === viewed ? 'this' : parents.has(id) ? 'parent' : descendants.has(id) ? 'child' : 'other';
  const at = new Map(layout.nodes.map((node) => [node.id, node]));
  const cx = (x: number) => PAD + (x * COLUMN + NODE / 2) * SCALE;
  const cy = (y: number) => PAD + (y * ROW + NODE / 2) * SCALE;
  const width = PAD * 2 + ((layout.columns - 1) * COLUMN + NODE) * SCALE;
  const height = PAD * 2 + ((layout.rows - 1) * ROW + NODE) * SCALE;
  const half = (NODE / 2) * SCALE;
  return (
    <div
      className="max-h-[28rem] max-w-full overflow-auto rounded border border-border"
      style={{ backgroundColor: '#1d1d1d' }}
    >
      <div
        data-testid="advancement-tree"
        data-columns={layout.columns}
        data-rows={layout.rows}
        className="relative"
        style={{
          width,
          height,
          ...(background === null
            ? {}
            : {
                backgroundImage: `linear-gradient(#000000a0, #000000a0), url(${background})`,
                backgroundSize: `auto, ${16 * SCALE * 2}px`,
                imageRendering: 'pixelated',
              }),
        }}
      >
        <svg
          aria-hidden
          width={width}
          height={height}
          className="pointer-events-none absolute top-0 left-0"
        >
          {layout.edges.map(({ from, to }) => {
            const a = at.get(from);
            const b = at.get(to);
            if (a === undefined || b === undefined) return null;
            const spine = cx(a.x) + (COLUMN * SCALE) / 2;
            const d = `M ${cx(a.x) + half} ${cy(a.y)} H ${spine} V ${cy(b.y)} H ${cx(b.x) - half}`;
            const lit = stateOf(to) !== 'other' && stateOf(from) !== 'other';
            return (
              <g key={`${from}>${to}`}>
                <path d={d} fill="none" stroke="#000000" strokeWidth={4} />
                <path d={d} fill="none" stroke={lit ? '#fff2b0' : '#bdbdbd'} strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        {layout.nodes.map((placed) => {
          const node = nodes.get(placed.id);
          const display = node?.display;
          if (node === undefined || display == null) return null;
          const state = stateOf(placed.id);
          const colours = STATE_COLOURS[state];
          const title = plainText(textRuns(display.title, { lang }));
          return (
            <button
              key={placed.id}
              type="button"
              data-testid="advancement-node"
              data-id={placed.id}
              data-x={placed.x}
              data-y={placed.y}
              data-frame={display.frame}
              data-state={state}
              data-hidden={display.hidden}
              data-origin={node.origin}
              aria-pressed={selected === placed.id}
              aria-label={`${title}, ${FRAME_WORDS[display.frame].toLowerCase()}, ${STATE_WORDS[state]}${display.hidden ? ', hidden' : ''}`}
              title={title}
              onClick={() => onSelect(placed.id)}
              className={`absolute flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selected === placed.id ? 'ring-2 ring-white' : ''
              }`}
              style={{
                left: cx(placed.x) - half,
                top: cy(placed.y) - half,
                width: NODE * SCALE,
                height: NODE * SCALE,
                backgroundColor: colours.fill,
                border: `2px ${display.hidden || node.origin === 'missing' ? 'dashed' : 'solid'} ${colours.edge}`,
                ...FRAME_SHAPES[display.frame],
              }}
            >
              {node.origin === 'missing' ? (
                <span className="text-xs font-semibold text-white">?</span>
              ) : (
                <NodeIcon id={display.icon.id} source={source} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Every one", "any one" or the groups, in plain words. */
function requirementWords(node: AdvancementNode): string {
  const groups = node.requirements.filter((group) => group.length > 0);
  if (groups.length === 0) return 'Nothing is needed: the game gives it at once.';
  if (groups.every((group) => group.length === 1)) {
    return groups.length === 1 ? 'Needs this one:' : `Needs every one of these ${groups.length}:`;
  }
  if (groups.length === 1) return 'Needs any one of these:';
  return `Needs one from each group: ${groups.map((group) => `(${group.join(' or ')})`).join(' and ')}`;
}

/** `minecraft:inventory_changed` to `Inventory changed`. */
function triggerWords(trigger: string): string {
  if (trigger === '') return 'No trigger';
  const path = trigger.slice(trigger.indexOf(':') + 1).replaceAll('_', ' ');
  return path.charAt(0).toUpperCase() + path.slice(1);
}

/** Rewards in plain words. */
function rewardWords(rewards: Readonly<Record<string, Json>>): string[] {
  const out: string[] = [];
  const list = (value: Json | undefined): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
  if (typeof rewards.experience === 'number' && rewards.experience > 0) {
    out.push(`${rewards.experience} experience`);
  }
  const recipes = list(rewards.recipes);
  if (recipes.length > 0) out.push(`Recipes: ${recipes.join(', ')}`);
  const loot = list(rewards.loot);
  if (loot.length > 0) out.push(`Loot: ${loot.join(', ')}`);
  if (typeof rewards.function === 'string') out.push(`Runs the function ${rewards.function}`);
  return out;
}

interface DetailsProps {
  readonly node: AdvancementNode;
  readonly lang: LangLookup;
  readonly source: ItemPictureSource;
}

/** The chosen advancement: words, toast, chat line, criteria, rewards. */
function Details({ node, lang, source }: DetailsProps) {
  const display = node.display;
  const title: TextRun[] = display === null ? [] : textRuns(display.title, { lang });
  const titleText = plainText(title) || node.id;
  const rewards = rewardWords(node.rewards);
  const chatFormat =
    display === null
      ? null
      : (lang(`chat.type.advancement.${display.frame}`) ?? CHAT_WORDS[display.frame]);
  return (
    <div
      data-testid="advancement-details"
      data-id={node.id}
      className="flex flex-col gap-3 text-sm"
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium [overflow-wrap:anywhere]">
          {display === null ? node.id : <TextLine runs={title} testId="advancement-title" />}
        </span>
        {display !== null && (
          <TextLine
            runs={textRuns(display.description, { lang })}
            testId="advancement-description"
            className="text-muted"
          />
        )}
        <span className="text-xs text-muted">
          {[
            display === null ? 'Not shown in any tab (no display)' : FRAME_WORDS[display.frame],
            node.origin === 'vanilla'
              ? 'from Minecraft’s files'
              : node.origin === 'missing'
                ? 'not found'
                : 'in this project',
            display?.hidden === true ? 'hidden until done' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      {display?.showToast && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">The toast when it is done</span>
          <div
            data-testid="advancement-toast"
            className="flex w-64 max-w-full items-center gap-2 rounded border-2 border-[#555555] bg-[#212121] px-2 py-1.5 font-mono text-xs"
          >
            <span className="flex size-8 shrink-0 items-center justify-center">
              <NodeIcon id={display.icon.id} source={source} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span style={{ color: display.frame === 'challenge' ? '#ff88ff' : '#ffff00' }}>
                {lang(`advancements.toast.${display.frame}`) ?? TOAST_WORDS[display.frame]}
              </span>
              <span className="truncate text-white">{titleText}</span>
            </span>
          </div>
        </div>
      )}
      {display?.announceToChat && chatFormat !== null && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">The chat line when a player earns it</span>
          <div
            data-testid="advancement-chat"
            className="rounded-sm bg-[#000000b0] px-2 py-1 font-mono text-xs text-white [overflow-wrap:anywhere]"
          >
            <TextLine
              runs={textRuns(
                {
                  translate: `chat.type.advancement.${display.frame}`,
                  fallback: chatFormat,
                  with: [
                    'Ann',
                    {
                      translate: 'chat.square_brackets',
                      fallback: '[%s]',
                      color: TITLE_COLOURS[display.frame],
                      with: [display.title],
                    },
                  ],
                },
                { lang },
              )}
            />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">{requirementWords(node)}</span>
        <ul
          data-testid="advancement-criteria"
          aria-label="Criteria"
          className="flex flex-col gap-1"
        >
          {node.criteria.map((criterion) => (
            <li
              key={criterion.name}
              data-testid="advancement-criterion"
              data-name={criterion.name}
              className="flex items-center gap-2"
            >
              <input
                type="checkbox"
                disabled
                checked={false}
                readOnly
                aria-label={`${criterion.name}: not done`}
              />
              <span className="[overflow-wrap:anywhere]">{criterion.name}</span>
              <span className="text-xs text-muted">{triggerWords(criterion.trigger)}</span>
            </li>
          ))}
        </ul>
      </div>
      {rewards.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">Rewards</span>
          <ul data-testid="advancement-rewards" className="flex flex-col gap-0.5 text-xs">
            {rewards.map((line) => (
              <li key={line} className="[overflow-wrap:anywhere]">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The view of `minecraft:advancement`. */
export default function AdvancementTree(props: LiveViewProps) {
  const { vanilla, vanillaAssets, onSetup } = props;
  const settled = useSettled(
    useMemo(
      () => ({ project: props.project, element: props.element }),
      [props.project, props.element],
    ),
  );
  const { project, element } = settled;
  const viewed = withNamespace(element.id);
  const own = useMemo(
    () => projectDataFiles(project, ['advancement']).advancement ?? {},
    [project],
  );
  const projectOnly = useMemo(
    () => advancementMap(own, { id: element.id, data: element.data as Json }, null),
    [own, element],
  );
  // Vanilla's files are read only when this advancement's tab reaches into Minecraft's.
  const wantsVanilla = useMemo(() => {
    const { chain, missing } = ancestorsOf(projectOnly, viewed);
    return [viewed, ...chain, missing ?? ''].some((id) => id.startsWith('minecraft:'));
  }, [projectOnly, viewed]);
  const [vanillaState, setVanillaState] = useState<VanillaState>({ status: 'none' });
  useEffect(() => {
    if (!wantsVanilla) {
      setVanillaState({ status: 'none' });
      return;
    }
    let live = true;
    setVanillaState((before) => (before.status === 'ready' ? before : { status: 'loading' }));
    void vanilla.folder('advancement').then(
      (answer) => {
        if (!live) return;
        setVanillaState(
          answer.status === 'ready'
            ? { status: 'ready', files: answer.files }
            : { status: 'not_set_up' },
        );
      },
      () => {
        if (live) setVanillaState({ status: 'not_set_up' });
      },
    );
    return () => {
      live = false;
    };
  }, [wantsVanilla, vanilla]);

  const nodes = useMemo(() => {
    const map =
      vanillaState.status === 'ready'
        ? advancementMap(own, { id: element.id, data: element.data as Json }, vanillaState.files)
        : new Map(projectOnly);
    const { missing } = ancestorsOf(map, viewed);
    if (missing !== null) map.set(missing, missingNode(missing));
    return map;
  }, [own, element, projectOnly, vanillaState, viewed]);
  const { chain, missing, loop } = useMemo(() => ancestorsOf(nodes, viewed), [nodes, viewed]);
  const root = chain.length === 0 ? viewed : (chain[chain.length - 1] as string);
  const layout = useMemo(() => (loop ? null : layoutTab(nodes, root)), [nodes, root, loop]);
  const notFound = chain.find((id) => nodes.get(id)?.origin === 'missing') ?? missing;

  const [selected, setSelected] = useState(viewed);
  useEffect(() => setSelected(viewed), [viewed]);
  const { lookup } = useLang(project, vanillaAssets);
  const source: ItemPictureSource = useMemo(
    () => ({ vanillaAssets, folders: resourceFoldersOf(project) }),
    [vanillaAssets, project],
  );
  const rootNode = nodes.get(root);
  const background = useBackground(rootNode?.display?.background ?? null, vanillaAssets, source);
  const selectedNode = nodes.get(selected) ?? nodes.get(viewed);
  const hasHidden = layout?.nodes.some((node) => nodes.get(node.id)?.display?.hidden === true);

  const notes = [
    'Positions are about right: the game orders the branches of a tab its own way, which differs between versions, so the same parents and children may sit in another order.',
    'Criteria are listed, not triggered: none ticks by itself here. Play is the real check.',
    'The game shows only advancements that are done or next to one that is done; here the whole tab is shown.',
    ...(hasHidden === true
      ? ['Hidden advancements (dashed) appear in the game only once they are done.']
      : []),
  ];
  const needsSetUp = needsSetUpBanner(
    vanillaState.status === 'not_set_up'
      ? 'not_set_up'
      : vanillaState.status === 'ready'
        ? 'ready'
        : null,
    wantsVanilla,
  );
  const tabTitle =
    rootNode?.display == null ? null : textRuns(rootNode.display.title, { lang: lookup });

  return (
    <LiveViewFrame
      title="Advancement tab"
      fidelity="about_right"
      notes={notes}
      needsSetUp={needsSetUp}
      onSetup={onSetup}
    >
      <div className="flex flex-col gap-3">
        {loop && (
          <p role="status" data-testid="advancement-loop" className="text-sm text-warning">
            Its parents go round in a loop, so the game cannot place it in a tab.
          </p>
        )}
        {notFound !== null &&
          notFound !== undefined &&
          !needsSetUp &&
          vanillaState.status !== 'loading' && (
            <p
              role="status"
              data-testid="advancement-parent-missing"
              className="text-sm text-warning"
            >
              {`Its parent ${notFound} is not in this project${
                vanillaState.status === 'ready' ? ' or in Minecraft’s files' : ''
              }; it is drawn here as a question mark.`}
            </p>
          )}
        {!loop && layout === null && (
          <p role="status" data-testid="advancement-no-tab" className="text-sm text-muted">
            {root === viewed
              ? 'It has no display, so the game makes no tab of it and shows it nowhere.'
              : 'Its tab’s first advancement has no display, so the game shows this tab nowhere.'}
          </p>
        )}
        {element.data !== null &&
          readAdvancement(viewed, element.data as Json, 'project').display === null &&
          layout !== null && (
            <p role="status" data-testid="advancement-no-display" className="text-sm text-muted">
              It has no display, so it is not drawn; the advancements after it hang from the one
              before it.
            </p>
          )}
        {layout !== null && (
          <div className="flex flex-col gap-1">
            {tabTitle !== null && (
              <span className="text-xs text-muted">
                Tab: <TextLine runs={tabTitle} testId="advancement-tab-title" />
              </span>
            )}
            <Tree
              layout={layout}
              nodes={nodes}
              viewed={viewed}
              selected={selected}
              onSelect={setSelected}
              lang={lookup}
              source={source}
              background={background}
            />
          </div>
        )}
        {selectedNode !== undefined && (
          <Details node={selectedNode} lang={lookup} source={source} />
        )}
      </div>
    </LiveViewFrame>
  );
}
