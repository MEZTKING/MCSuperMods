/**
 * Home's "My things" (ADR 0083 D2): a grid of cards, one per Creator set or loose content
 * element, with its picture (the ThingPicker's sources) and name. A card opens its thing; its
 * menu has Edit in Creator (for a set), Rename, Duplicate and Delete, each one undo step in the
 * host.
 *
 * Below them, "Particles and sounds" (ADR 0121, the audit's note; B630): one card per particle
 * (`msm:particle` and `minecraft:particle`) and per sound event of the project's `sounds.json`,
 * each opening its live view in a window (the registry's view over the project, a lazy chunk),
 * a sound card with Play on the card itself. Names are words, never ids (Very easy).
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import { targetById } from '@msm/targets';
import { MoreHorizontal, X } from 'lucide-react';
import { Dialog, DropdownMenu } from 'radix-ui';
import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { useSoundSources } from '../../audio/provider';
import { SoundPlayButton } from '../../audio/SoundPlayButton';
import { displayNameOf } from '../../session/plain-problems';
import { fieldClass, Modal } from '../NewElementDialog';
import {
  ThingIcon,
  type ThingPicture,
  type ThingPictures,
  thingSections,
} from '../thing-picker/ThingPicker';
import { iconButtonClass } from '../ui/Button';
import { THING_KINDS, type ThingCard } from './things';

/** Props of {@link MyThings}. */
export interface MyThingsProps {
  project: Project;
  cards: readonly ThingCard[];
  /** The target's texture folder (`target.folders.resource.textures`). */
  texturesFolder: string;
  pictures?: ThingPictures | null;
  onOpen(card: ThingCard): void;
  /** Reopens the card's set in the Creator; offered for sets. */
  onEditInCreator?(card: ThingCard): void;
  onRename(card: ThingCard): void;
  onDuplicate(card: ThingCard): void;
  onDelete(card: ThingCard): void;
}

const NO_IDS = { ids: () => [] as readonly string[] };

const menuItemClass =
  'flex cursor-pointer rounded px-2 py-1 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-bg data-[highlighted]:text-accent';

/** The pictures of the project's things by element id. */
function usePictures(project: Project, texturesFolder: string): Map<string, ThingPicture | null> {
  return useMemo(() => {
    const out = new Map<string, ThingPicture | null>();
    for (const { kind, sort } of THING_KINDS) {
      const sections = thingSections({
        project,
        registries: NO_IDS,
        sort,
        texturesFolder,
        projectOnly: true,
        kinds: [kind],
      });
      for (const section of sections) {
        for (const thing of section.things) out.set(thing.id, thing.picture);
      }
    }
    return out;
  }, [project, texturesFolder]);
}

/** One card of "Particles and sounds". */
export interface LookCard {
  /** Stable key: `particle:<id>` or `sound:<sounds element id>#<event>`; test id `my-look-<n>`. */
  readonly key: string;
  /** The name shown (words, never an id). */
  readonly name: string;
  /** What it is: "Particle" or "Sound". */
  readonly what: 'Particle' | 'Sound';
  /** The element whose live view the card opens. */
  readonly element: Element;
  /** For a sound: the event id its Play button plays. */
  readonly event?: string;
}

/** The kinds a particle card is made for. */
export const PARTICLE_CARD_KINDS: readonly string[] = ['msm:particle', 'minecraft:particle'];

/** A sound event's key in words: `block.ruby.hum` reads "Block ruby hum". */
export function soundEventWords(key: string): string {
  const words = key
    .split(/[._/:]+/)
    .filter(Boolean)
    .join(' ');
  return words === '' ? 'A sound' : `${words[0]?.toUpperCase()}${words.slice(1)}`;
}

/**
 * The cards of "Particles and sounds": every particle, then every sound event of every
 * `minecraft:sounds` element, each sorted by name. Pure.
 */
export function lookCards(project: Project | null): LookCard[] {
  if (project === null) return [];
  const particles: LookCard[] = [];
  const sounds: LookCard[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (PARTICLE_CARD_KINDS.includes(element.kind)) {
        particles.push({
          key: `particle:${element.id}`,
          name: displayNameOf(element),
          what: 'Particle',
          element,
        });
        continue;
      }
      if (element.kind !== 'minecraft:sounds') continue;
      const data = element.data as Json;
      if (typeof data !== 'object' || data === null || Array.isArray(data)) continue;
      const soundNamespace = element.id.includes(':')
        ? element.id.slice(0, element.id.indexOf(':'))
        : namespace.name;
      for (const key of Object.keys(data)) {
        sounds.push({
          key: `sound:${element.id}#${key}`,
          name: soundEventWords(key),
          what: 'Sound',
          element,
          event: `${soundNamespace}:${key}`,
        });
      }
    }
  }
  const byName = (a: LookCard, b: LookCard) =>
    a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
  return [...particles.sort(byName), ...sounds.sort(byName)];
}

const BundleLiveView = lazy(() => import('../../liveviews/BundleLiveView'));

/** The window a look card opens: the element's live view over the project. */
function LookWindow(props: {
  card: LookCard;
  project: Project;
  pictures: ThingPictures | null | undefined;
  onClose(): void;
}) {
  const { card, project } = props;
  const sources = useSoundSources();
  const vanilla = props.pictures?.vanilla;
  const vanillaAssets = useMemo(
    () => (vanilla === undefined ? null : { readAsset: (path: string) => vanilla(path) }),
    [vanilla],
  );
  const readProjectAsset = sources.readProjectAsset;
  const readProject = useMemo(
    () =>
      readProjectAsset === null
        ? undefined
        : async (path: string) => {
            const match = /^assets\/([^/]+)\/(.+)$/.exec(path);
            if (match === null) return null;
            return await readProjectAsset(match[1] as string, match[2] as string).catch(() => null);
          },
    [readProjectAsset],
  );
  const targetId = project.targets[0];
  const mcVersion =
    targetId === undefined ? null : (targetById(targetId)?.target.mcVersion ?? null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="my-look-window"
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-auto rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <Dialog.Title className="font-semibold text-base">{card.name}</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className={iconButtonClass}
                aria-label="Close"
                data-testid="my-look-close"
              >
                <X size={14} aria-hidden />
              </button>
            </Dialog.Close>
          </div>
          <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
            <BundleLiveView
              project={project}
              element={card.element}
              vanillaAssets={vanillaAssets}
              mcVersion={mcVersion}
              {...(readProject === undefined ? {} : { readProject })}
              onSetup={() => sources.onSetup?.()}
            />
          </Suspense>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** "Particles and sounds": a card per particle and per sound, each opening its view. */
export function LookCards(props: {
  project: Project;
  pictures?: ThingPictures | null | undefined;
}) {
  const cards = useMemo(() => lookCards(props.project), [props.project]);
  const [open, setOpen] = useState<string | null>(null);
  if (cards.length === 0) return null;
  const opened = cards.find((card) => card.key === open);
  return (
    <section aria-labelledby="home-looks-heading" className="flex flex-col gap-2">
      <h2 id="home-looks-heading" className="font-semibold text-base">
        Particles and sounds
      </h2>
      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2"
        data-testid="my-looks"
      >
        {cards.map((card, index) => (
          <li
            key={card.key}
            data-testid={`my-look-${index + 1}`}
            data-what={card.what}
            className="flex items-start gap-1 rounded-md border border-border bg-panel p-2"
          >
            <button
              type="button"
              data-testid={`my-look-open-${index + 1}`}
              aria-label={`${card.name}, ${card.what}`}
              className="flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 text-center"
              onClick={() => setOpen(card.key)}
            >
              <ThingIcon
                sort={card.what === 'Sound' ? 'sound' : 'particle'}
                picture={null}
                pictures={props.pictures}
                size={48}
              />
              <span className="w-full truncate font-medium text-sm">{card.name}</span>
              <span className="text-muted text-xs">{card.what}</span>
            </button>
            {card.event !== undefined && (
              <SoundPlayButton
                event={card.event}
                project={props.project}
                compact
                testId={`my-look-play-${index + 1}`}
              />
            )}
          </li>
        ))}
      </ul>
      {opened !== undefined && (
        <LookWindow
          card={opened}
          project={props.project}
          pictures={props.pictures}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/** The "My things" grid. */
export function MyThings(props: MyThingsProps) {
  const pictures = usePictures(props.project, props.texturesFolder);
  return (
    <>
      <section aria-labelledby="home-things-heading" className="flex flex-col gap-2">
        <h2 id="home-things-heading" className="font-semibold text-base">
          My things
        </h2>
        {props.cards.length === 0 ? (
          <p className="text-muted text-sm" data-testid="my-things-empty">
            Nothing here yet. Pick a tile above to make your first thing.
          </p>
        ) : (
          <ul
            className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2"
            data-testid="my-things"
          >
            {props.cards.map((card) => (
              <li
                key={card.key}
                data-testid={`my-thing-${card.key}`}
                className="flex items-start gap-1 rounded-md border border-border bg-panel p-2"
              >
                <button
                  type="button"
                  data-testid={`my-thing-open-${card.key}`}
                  aria-label={`${card.name}, ${card.what}`}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 text-center"
                  onClick={() => props.onOpen(card)}
                >
                  <ThingIcon
                    sort={card.sort}
                    picture={pictures.get(card.main.id) ?? null}
                    pictures={props.pictures}
                    size={48}
                  />
                  <span className="w-full truncate font-medium text-sm">{card.name}</span>
                  <span className="text-muted text-xs">{card.what}</span>
                </button>
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className={iconButtonClass}
                      data-testid={`my-thing-menu-${card.key}`}
                      aria-label={`More for ${card.name}`}
                    >
                      <MoreHorizontal size={14} aria-hidden />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={4}
                      className="z-50 flex min-w-40 flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-text shadow-lg"
                    >
                      {props.onEditInCreator !== undefined &&
                        card.main.meta.creator !== undefined && (
                          <DropdownMenu.Item
                            className={menuItemClass}
                            data-testid="my-thing-edit-in-creator"
                            onSelect={() => props.onEditInCreator?.(card)}
                          >
                            Edit in Creator
                          </DropdownMenu.Item>
                        )}
                      <DropdownMenu.Item
                        className={menuItemClass}
                        data-testid="my-thing-rename"
                        onSelect={() => props.onRename(card)}
                      >
                        Rename
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className={menuItemClass}
                        data-testid="my-thing-duplicate"
                        onSelect={() => props.onDuplicate(card)}
                      >
                        Duplicate
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className={menuItemClass}
                        data-testid="my-thing-delete"
                        onSelect={() => props.onDelete(card)}
                      >
                        Delete
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </li>
            ))}
          </ul>
        )}
      </section>
      <LookCards project={props.project} pictures={props.pictures} />
    </>
  );
}

/** Props of {@link RenameThingDialog}. */
export interface RenameThingDialogProps {
  /** The name now. */
  name: string;
  onCancel(): void;
  /** Saves the new name (one undo step in the host). */
  onSubmit(name: string): void;
}

/** Very easy's Rename: the thing's shown name, never its id (ADR 0083 D7). */
export function RenameThingDialog(props: RenameThingDialogProps) {
  const [name, setName] = useState(props.name);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <Modal
      title="Rename"
      error={error}
      testId="rename-thing-dialog"
      submitLabel="Rename"
      onCancel={props.onCancel}
      onSubmit={() => {
        const trimmed = name.trim();
        if (trimmed === '') {
          setError('Type a name.');
          return;
        }
        props.onSubmit(trimmed);
      }}
    >
      <label htmlFor={id} className="text-sm">
        New name
      </label>
      <input
        id={id}
        data-testid="rename-thing-name"
        className={fieldClass}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
      />
    </Modal>
  );
}
