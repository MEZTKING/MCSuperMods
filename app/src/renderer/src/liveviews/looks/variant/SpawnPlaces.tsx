/**
 * Where a variant appears (B627; the plan's batch 3 table): each spawn condition, highest priority
 * first, with a biome tag opened up into its biomes. Tags are resolved where every live view
 * resolves them (ADR 0120 D12): in the live views worker, over the project's tags laid on
 * vanilla's from the user's jar cache (the tag view's `useTagFiles` and the worker's `tag` job).
 * Names, not ids. Without the Minecraft folder a vanilla tag stays closed, and the line says why.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/plugin-api';
import { useMemo } from 'react';
import { thingName, thingWords } from '../../../components/thing-picker/thing-sources';
import type { LiveViewClient } from '../../client';
import { useTagFiles } from '../../data/tag/tag-files';
import { useLiveViewJob } from '../../frame/live-data';
import type { VanillaDataReader } from '../../vanilla-data';
import type { SpawnRule } from './variant-model';

const MAX_SHOWN = 24;

/** A list of names, cut after {@link MAX_SHOWN} with how many more. */
export function namesOf(project: Project, ids: readonly string[]): string {
  const shown = ids.slice(0, MAX_SHOWN).map((id) => thingName(project, id));
  const more = ids.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

/** Where the tags' files stand: their hash in the worker, or that vanilla's are not set up. */
interface TagData {
  readonly data: string | null;
  readonly vanilla: 'ready' | 'not_set_up' | 'none' | null;
}

/** One biome tag in words, opened by the worker. */
function BiomeTag(props: {
  project: Project;
  tag: string;
  files: TagData;
  client: LiveViewClient | undefined;
}) {
  const id = props.tag.replace(/^#/, '');
  const job = useMemo(
    () => ({
      kind: 'tag' as const,
      registry: 'worldgen/biome',
      id: id.includes(':') ? id : `minecraft:${id}`,
    }),
    [id],
  );
  const state = useLiveViewJob(props.files.data, job, props.client);
  const group = thingWords(id);
  const members = state.result?.members.map((member) => member.id) ?? [];
  let words = `the biomes of ${group}`;
  if (members.length > 0) words = `${namesOf(props.project, members)} (the biomes of ${group})`;
  else if (props.files.vanilla === 'not_set_up')
    words = `the biomes of ${group} (set up your Minecraft folder to list them)`;
  else if (state.result !== null) words = `the biomes of ${group} (no such group was found)`;
  return (
    <span data-testid="variant-spawn-tag" data-members={members.length}>
      {words}
    </span>
  );
}

/** One rule in words, but for biome tags (see {@link BiomeTag}). */
export function spawnRuleWords(project: Project, rule: SpawnRule): string {
  if (rule.type === 'anywhere') return 'Anywhere its mob appears.';
  if (rule.type === 'moon') {
    const { min, max } = rule.range ?? {};
    const from = min === undefined ? 'any' : String(min);
    const to = max === undefined ? 'any' : String(max);
    return `When the moon’s brightness is from ${from} to ${to}.`;
  }
  if (rule.type === 'other')
    return `When ${thingWords(rule.written ?? 'a condition')} holds (worked out only in the game).`;
  if (rule.type === 'structure') {
    const parts = rule.ids.map((id) =>
      id.startsWith('#')
        ? `any structure in the group ${thingWords(id.slice(1))}`
        : thingName(project, id),
    );
    return `Near ${parts.join(', ') || 'no structure'}.`;
  }
  const named = rule.ids.filter((id) => !id.startsWith('#')).map((id) => thingName(project, id));
  return named.length === 0 && rule.ids.length === 0 ? 'In no biome.' : named.join(', ');
}

type SpawnPlacesProps = {
  project: Project;
  vanilla: VanillaDataReader;
  rules: readonly SpawnRule[];
  /** The live views client (tests); default the app's shared one. */
  client?: LiveViewClient;
};

/** The rules with the tags' files given to the worker (only when a rule names a biome tag). */
function WithTagFiles(props: SpawnPlacesProps) {
  const state = useTagFiles(props.project, props.vanilla, 'worldgen/biome', null, props.client);
  const files: TagData =
    state.status === 'ready'
      ? { data: state.now, vanilla: state.vanilla }
      : { data: null, vanilla: null };
  return <RuleList {...props} files={files} />;
}

/** The list; see the module comment. */
export function SpawnPlaces(props: SpawnPlacesProps) {
  if (props.rules.length === 0) {
    return (
      <p className="text-sm" data-testid="variant-spawn-none">
        It names no place to appear, so the game never picks it by itself.
      </p>
    );
  }
  const hasTags = props.rules.some(
    (rule) => rule.type === 'biome' && rule.ids.some((id) => id.startsWith('#')),
  );
  return hasTags ? (
    <WithTagFiles {...props} />
  ) : (
    <RuleList {...props} files={{ data: null, vanilla: null }} />
  );
}

/** The rules in words. */
function RuleList(props: SpawnPlacesProps & { files: TagData }) {
  const { project, rules, files } = props;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted text-xs">
        Where it appears: the game tries these from the highest priority down and takes the first
        that holds.
      </p>
      <ul className="flex flex-col gap-1 text-sm" data-testid="variant-spawn">
        {rules.map((rule, index) => {
          const tags = rule.type === 'biome' ? rule.ids.filter((id) => id.startsWith('#')) : [];
          const words = spawnRuleWords(project, rule);
          return (
            <li
              key={`${index}-${rule.type}`}
              data-testid="variant-spawn-rule"
              data-type={rule.type}
            >
              <span className="text-muted text-xs">{`Priority ${rule.priority}: `}</span>
              {rule.type === 'biome' ? (
                <>
                  {'In '}
                  {words}
                  {tags.map((tag, at) => (
                    <span key={tag}>
                      {words !== '' || at > 0 ? '; ' : ''}
                      <BiomeTag project={project} tag={tag} files={files} client={props.client} />
                    </span>
                  ))}
                  {'.'}
                </>
              ) : (
                words
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
