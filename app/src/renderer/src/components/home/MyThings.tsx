/**
 * Home's "My things" (ADR 0083 D2): a grid of cards, one per Creator set or loose content
 * element, with its picture (the ThingPicker's sources) and name. A card opens its thing; its
 * menu has Edit in Creator (for a set), Rename, Duplicate and Delete, each one undo step in the
 * host.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useId, useMemo, useState } from 'react';
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

/** The "My things" grid. */
export function MyThings(props: MyThingsProps) {
  const pictures = usePictures(props.project, props.texturesFolder);
  return (
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
