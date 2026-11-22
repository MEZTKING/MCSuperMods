/**
 * **Everything in it** (B612, ADR 0120 D5): a tag resolved as the game loads it, by `@msm/sim`'s
 * resolver in the live views worker (B604, B608). Every member with its picture where it has one
 * (blocks, items, mobs' eggs) and its name, where it came from (which file, through which tags),
 * the tags inside opened up in groups, the tag's optional entries, plain notes for entries not
 * found, tags that name each other, a dropped tag and a `replace`, and **What changed** against
 * vanilla's tag of the same id. A dropped tag has no members, as in the game.
 *
 * The default export is the registry's view (the preview panel, the Creator, the AI review); the
 * Tag Studio draws {@link TagMembersView} beside its editor with the session's registry ids.
 */

import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import type { LiveViewClient } from '../../client';
import { type Fidelity, weakest } from '../../frame/fidelity';
import { ItemSlot } from '../../frame/ItemSlot';
import {
  type ItemPictureSource,
  type LangTable,
  resourceFoldersOf,
  useVanillaLang,
} from '../../frame/item-picture';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { useLiveViewJob } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { vanillaFileId } from '../../vanilla-data';
import { useTagFiles, useVendoredRegistries } from './tag-files';
import {
  comesFrom,
  groupMembers,
  isMinecraftId,
  type MemberGroup,
  namesVanillaFile,
  optionalEntries,
  panelRegistryIds,
  splitMissing,
  type TagChange,
  tagRegistryOf,
  whatChanged,
} from './tag-model';
import { hasPictures, memberName, pictureItemOf } from './tag-pictures';

/** Members a group shows before "Show all". */
export const MEMBERS_SHOWN = 64;

/** Props of {@link TagMembersView}. */
export interface TagMembersViewProps extends LiveViewProps {
  /**
   * The registry's ids from the session's registry index (the Tag Studio), so an entry that
   * names nothing is found out; `undefined` reads the target's vendored list instead (the
   * panel), `null` checks nothing.
   */
  readonly registryIds?: readonly string[] | null;
  /** Reads a project file by jar path (`assets/<ns>/...`), for the project's own pictures. */
  readonly readProject?: (path: string) => Promise<Uint8Array | null>;
  /** The live views client (tests); default the app's shared one. */
  readonly client?: LiveViewClient;
}

/** The registry's view. */
export default function TagMembers(props: LiveViewProps) {
  return <TagMembersView {...props} />;
}

/** Plain words for an entry the game could not find (`#tag` or an element). */
function entryWords(entry: string, registry: string, lang: LangTable | null): string {
  if (entry.startsWith('#')) return `the tag ${entry}`;
  return `${memberName(registry, entry, lang)} (${entry})`;
}

interface Shown {
  readonly registry: string;
  readonly tagId: string;
  readonly lang: LangTable | null;
  readonly pictures: ItemPictureSource;
}

function MemberRow({ member, shown }: { member: MemberGroup['members'][number]; shown: Shown }) {
  const name = memberName(shown.registry, member.id, shown.lang);
  const picture = pictureItemOf(shown.registry, member.id);
  return (
    <li
      data-testid="tag-member"
      data-id={member.id}
      data-origin={member.origin}
      data-chain={member.chain.join(' ')}
      className="flex items-center gap-2"
    >
      {picture !== null && (
        <ItemSlot
          item={{ id: picture, count: 1 }}
          pictures={shown.pictures}
          lang={shown.lang}
          name={name}
          extraLines={[{ text: member.id, tone: 'note' }]}
        />
      )}
      <span className="flex min-w-0 flex-col text-sm">
        <span className="[overflow-wrap:anywhere]">{name}</span>
        <span className="text-xs text-muted [overflow-wrap:anywhere]">
          <code className="font-mono">{member.id}</code> {comesFrom(member, shown.tagId)}
        </span>
      </span>
    </li>
  );
}

function Group({ group, shown }: { group: MemberGroup; shown: Shown }) {
  const [all, setAll] = useState(false);
  const list = all ? group.members : group.members.slice(0, MEMBERS_SHOWN);
  const more = group.members.length - list.length;
  const count = `${group.members.length} ${group.members.length === 1 ? 'thing' : 'things'}`;
  return (
    <details
      open
      data-testid="tag-group"
      data-via={group.via ?? ''}
      className="flex flex-col gap-1"
    >
      <summary className="cursor-pointer text-sm font-medium">
        {group.via === null ? `Listed in this tag: ${count}` : `#${group.via}: ${count}`}
      </summary>
      <ul className="flex flex-col gap-1 pt-1">
        {list.map((member) => (
          <MemberRow key={member.id} member={member} shown={shown} />
        ))}
      </ul>
      {more > 0 && (
        <Button className="self-start text-xs" onClick={() => setAll(true)}>
          {`Show all ${group.members.length}`}
        </Button>
      )}
    </details>
  );
}

function ChangeList({ change, shown }: { change: TagChange | null; shown: Shown }) {
  if (change === null) return null;
  const nameOf = (id: string) => `${memberName(shown.registry, id, shown.lang)} (${id})`;
  return (
    <section
      aria-label="What changed"
      data-testid="tag-what-changed"
      className="flex flex-col gap-1"
    >
      <h4 className="text-sm font-medium">What changed</h4>
      {change.kind === 'new' ? (
        <p className="text-sm text-muted">
          Minecraft has no tag of this name: everything in it is new.
        </p>
      ) : change.added.length === 0 && change.removed.length === 0 ? (
        <p className="text-sm text-muted">Nothing: it holds the same as Minecraft’s own.</p>
      ) : (
        <>
          {change.added.length > 0 && (
            <div data-testid="tag-added" className="text-sm">
              <span>{`Added (${change.added.length}): `}</span>
              <span className="text-muted [overflow-wrap:anywhere]">
                {change.added.map(nameOf).join(', ')}
              </span>
            </div>
          )}
          {change.removed.length > 0 && (
            <div data-testid="tag-removed" className="text-sm">
              <span>{`Taken out (${change.removed.length}): `}</span>
              <span className="text-muted [overflow-wrap:anywhere]">
                {change.removed.map(nameOf).join(', ')}
              </span>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** The view; see the module comment. */
export function TagMembersView(props: TagMembersViewProps) {
  const { project, element, vanilla, vanillaAssets, onSetup } = props;
  const registry = tagRegistryOf(element.kind) ?? element.kind;
  const tagId = vanillaFileId(element.id);
  const vendored = useVendoredRegistries(project);
  const panelIds = useMemo(
    () => (props.registryIds !== undefined ? null : panelRegistryIds(vendored, project, registry)),
    [props.registryIds, vendored, project, registry],
  );
  const registryIds = props.registryIds !== undefined ? props.registryIds : panelIds;
  const files = useTagFiles(project, vanilla, registry, registryIds, props.client);
  const job = useMemo(() => ({ kind: 'tag' as const, registry, id: tagId }), [registry, tagId]);
  const ready = files.status === 'ready' ? files : null;
  const now = useLiveViewJob(ready?.now ?? null, job, props.client);
  const compare = isMinecraftId(tagId) ? (ready?.vanillaOnly ?? null) : null;
  const before = useLiveViewJob(compare, compare === null ? null : job, props.client);
  const folders = useMemo(() => resourceFoldersOf(project), [project]);
  const lang = useVanillaLang(vanillaAssets, folders);
  const pictures = useMemo<ItemPictureSource>(
    () => ({
      vanillaAssets,
      folders,
      ...(props.readProject === undefined ? {} : { readProject: props.readProject }),
    }),
    [vanillaAssets, folders, props.readProject],
  );

  const namesVanilla = namesVanillaFile(tagId, element.data);
  const vanillaRead = ready?.vanilla !== 'not_set_up';
  const needsSetUp = needsSetUpBanner(
    ready === null || ready.vanilla === 'none' ? null : ready.vanilla,
    namesVanilla,
  );
  const tag = now.result;
  const shown: Shown = { registry, tagId, lang, pictures };

  const notes: string[] = [];
  const levels: Fidelity[] = ['checked'];
  if (hasPictures(registry)) {
    notes.push('Pictures are each thing’s first texture, as Try it’s hotbar shows it.');
  }
  if (registryIds === null) {
    notes.push('Whether each entry names something that exists is not checked here.');
    levels.push('about_right');
  } else if (props.registryIds === undefined) {
    notes.push(
      'Entries in your own namespaces are taken to exist here; the Tag Studio checks them against everything your project makes.',
    );
  }
  if (!vanillaRead && namesVanilla) {
    notes.push('Minecraft’s own tags are not opened until your Minecraft folder is set up.');
    levels.push('about_right');
  }
  if (registry === 'function') {
    notes.push('Minecraft has no function tags of its own; only your files are read.');
  }

  let body: ReactNode;
  if (files.status === 'error') {
    body = (
      <p role="alert" className="text-sm text-error">
        {files.message}
      </p>
    );
  } else if (now.error !== null) {
    body = (
      <p role="alert" className="text-sm text-error">
        {now.error}
      </p>
    );
  } else if (tag === null) {
    body = (
      <p role="status" className="text-sm text-muted">
        Working out what is in it…
      </p>
    );
  } else {
    const { missing, unread } = splitMissing(tag.missing, vanillaRead);
    const dropped = tag.dropped && (missing.length > 0 || tag.cycles.length > 0);
    const optional = optionalEntries(element.data, tag);
    const change = before.result === null ? null : whatChanged(tag, before.result);
    body = (
      <div className="flex flex-col gap-3" data-testid="tag-members" data-pending={now.pending}>
        {dropped ? (
          <div role="status" data-testid="tag-dropped" className="flex flex-col gap-1 text-sm">
            <p className="font-medium">The game leaves this tag out, so nothing is in it.</p>
            <ul className="flex flex-col gap-0.5 text-muted [overflow-wrap:anywhere]">
              {missing.map((entry) => (
                <li key={entry} data-testid="tag-missing" data-entry={entry}>
                  {`Not found: ${entryWords(entry, registry, lang)}. A required entry that is not found drops the whole tag.`}
                </li>
              ))}
              {tag.cycles.map((cycle) => (
                <li key={cycle.join(' ')} data-testid="tag-cycle">
                  {`These tags name each other: ${[...cycle, cycle[0]].map((id) => `#${id}`).join(' → ')}. The game drops every tag in the loop.`}
                </li>
              ))}
            </ul>
          </div>
        ) : unread.length > 0 && tag.dropped ? (
          <p role="status" data-testid="tag-unread" className="text-sm text-muted">
            {`Not opened yet: ${unread.join(', ')}. Set up your Minecraft folder to see what is in it.`}
          </p>
        ) : (
          <p data-testid="tag-count" className="text-sm font-medium">
            {`Everything in it: ${tag.members.length} ${tag.members.length === 1 ? 'thing' : 'things'}`}
          </p>
        )}
        {tag.replaced && (
          <p data-testid="tag-replaced" className="text-sm text-muted">
            Replace is on: Minecraft’s own entries of this tag are thrown away, and only yours
            count.
          </p>
        )}
        {!dropped && tag.cycles.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-sm text-muted">
            {tag.cycles.map((cycle) => (
              <li key={cycle.join(' ')} data-testid="tag-cycle">
                {`Left out: ${cycle.map((id) => `#${id}`).join(', ')} name each other, so the game drops them.`}
              </li>
            ))}
          </ul>
        )}
        {optional.length > 0 && (
          <ul aria-label="Optional entries" className="flex flex-col gap-0.5 text-sm">
            {optional.map((entry) => (
              <li
                key={`${entry.tag ? '#' : ''}${entry.id}`}
                data-testid="tag-optional"
                data-entry={entry.id}
                data-found={entry.found}
                className="text-muted [overflow-wrap:anywhere]"
              >
                {entry.found
                  ? `optional: ${entry.tag ? `#${entry.id}` : entryWords(entry.id, registry, lang)}, found`
                  : `optional: ${entry.tag ? `#${entry.id}` : entryWords(entry.id, registry, lang)}, not found, so the game skips it`}
              </li>
            ))}
          </ul>
        )}
        {groupMembers(tag.members).map((group) => (
          <Group key={group.via ?? ''} group={group} shown={shown} />
        ))}
        <ChangeList change={change} shown={shown} />
      </div>
    );
  }

  return (
    <LiveViewFrame
      title="Everything in it"
      fidelity={weakest(levels)}
      notes={notes}
      needsSetUp={needsSetUp}
      onSetup={onSetup}
    >
      {body}
    </LiveViewFrame>
  );
}
