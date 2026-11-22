/**
 * The Item Studio's "Boat" section (ADR 0110 D1 as amended, ADR 0112 D1): `msm:boat` on or off
 * ("A boat"), "Has a chest boat" (`chest`), "Raft" (`raft`, drawn and sized as the bamboo raft),
 * "Wood pictures" (`wood_texture`, the wood the pictures are named after) and the pictures
 * (`boat_textures`: the boat 128 x 64, the chest boat 128 x 128, the chest boat item) with the
 * chest boat's name. The game reads the boat pictures only from fixed places
 * (`boatTexturePaths`), so choosing a picture stored elsewhere also copies it there in the same
 * undo step (`picture-copies.ts`); "Copy the pictures" does it for pictures added before.
 *
 * @packageDocumentation
 */

import type { Element, Json, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { BOAT_COMPONENT, BOAT_TEXTURE_SIZES, boatTexturePaths } from '@msm/plugin-blocks-items';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import type { FormProblem } from '../../forms';
import { typingKey } from '../../forms/context';
import {
  missingPictureCopies,
  type PictureCopy,
  pictureCopiesOf,
  writeWithPictureCopies,
} from '../picture-copies';
import { IdField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { asObject, pointerOf } from './blocks-items-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, ProblemsAt, TextField } from './parts';
import { TextureThumbnail } from './TexturesSection';

type JsonObject = { [key: string]: Json };

/** The picture slots of `boat_textures`, with their words. */
export const BOAT_PICTURES: readonly (readonly [
  'boat' | 'chest_boat' | 'chest_boat_item',
  string,
])[] = Object.freeze([
  ['boat', `Boat picture (${BOAT_TEXTURE_SIZES.boat.width} by ${BOAT_TEXTURE_SIZES.boat.height})`],
  [
    'chest_boat',
    `Chest boat picture (${BOAT_TEXTURE_SIZES.chest_boat.width} by ${BOAT_TEXTURE_SIZES.chest_boat.height})`,
  ],
  ['chest_boat_item', 'Chest boat item picture'],
]);

/** The picture copies a boat item needs (its pictures that are not at their fixed places). */
export function boatPictureCopies(
  target: Pick<Target, 'folders'>,
  element: Pick<Element, 'id' | 'data'>,
): PictureCopy[] {
  try {
    return pictureCopiesOf(boatTexturePaths(target, element));
  } catch {
    return [];
  }
}

/** Item data with boat picture `slot` set (`''` removes it, and `boat_textures` when empty). */
export function withBoatPicture(
  data: Json | undefined,
  slot: 'boat' | 'chest_boat' | 'chest_boat_item',
  value: string,
): JsonObject {
  const object = asObject(data);
  const pictures: JsonObject = { ...asObject(object.boat_textures) };
  if (value === '') delete pictures[slot];
  else pictures[slot] = value;
  const out: JsonObject = { ...object, boat_textures: pictures };
  if (Object.keys(pictures).length === 0) delete out.boat_textures;
  return out;
}

/** Props of {@link BoatSection}. */
export interface BoatSectionProps {
  project: Project;
  element: Pick<Element, 'id' | 'kind' | 'data'>;
  target: Target;
  problems: readonly FormProblem[];
  suggest(registry: string, prefix: string): string[];
  set(path: readonly (string | number)[], value: Json | undefined, coalesce?: string): void;
  /** Replaces the whole element data in one undoable edit. */
  replace(next: Json): void;
}

/** The "Boat" section. */
export function BoatSection(props: BoatSectionProps) {
  const { project, element, target, problems, suggest, set } = props;
  const host = useBlocksItemsStudioHost();
  const [error, setError] = useState<string | null>(null);
  const data = asObject(element.data);
  const components = asObject(data.components);
  const on = components[BOAT_COMPONENT] !== undefined;
  const boat = asObject(components[BOAT_COMPONENT]);
  const path = ['components', BOAT_COMPONENT];
  const pictures = asObject(data.boat_textures);
  const picture = (slot: string) =>
    typeof pictures[slot] === 'string' ? String(pictures[slot]) : '';
  const name =
    typeof data.display_name === 'string' && data.display_name.trim() !== ''
      ? data.display_name
      : 'Boat';
  const write = (after: Json, label: string) => {
    setError(null);
    writeWithPictureCopies(
      { apply: host?.applyChanges, read: host?.modelPreview?.readProjectAsset },
      project,
      element,
      after,
      boatPictureCopies(target, { ...element, data: after }),
      label,
      'boat-picture-field',
      props.replace,
    ).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  };
  const missing = on ? missingPictureCopies(project, boatPictureCopies(target, element)) : [];
  const flag = (key: 'chest' | 'raft', checked: boolean) =>
    set([...path, key], checked ? true : undefined);

  return (
    <Section title="Boat" testId="item-boat">
      <CheckField
        label="A boat (rides on water, as Minecraft's boats do)"
        checked={on}
        testId="item-boat-on"
        onChange={(checked) => set(path, checked ? {} : undefined)}
      />
      {on && (
        <>
          <p className="text-muted text-xs" data-testid="item-boat-how">
            Using the item on water places the boat; two can ride it. Boats stack to one and are
            crafted from five planks of their wood, as Minecraft's are.
          </p>
          <CheckField
            label="Has a chest boat"
            checked={boat.chest === true}
            testId="item-boat-chest"
            onChange={(checked) => flag('chest', checked)}
          />
          <CheckField
            label="Raft (shaped like the bamboo raft)"
            checked={boat.raft === true}
            testId="item-boat-raft"
            onChange={(checked) => flag('raft', checked)}
          />
          <TextField
            label="Wood pictures (empty: named after this boat's wood)"
            value={boat.wood_texture}
            testId="item-boat-wood"
            placeholder="minecraft:oak"
            onCommit={(value) =>
              set([...path, 'wood_texture'], value, typingKey(pointerOf([...path, 'wood_texture'])))
            }
          />
          <p className="text-muted text-xs">
            Naming one of Minecraft's woods borrows its boat pictures from your game.
          </p>
          {BOAT_PICTURES.filter(([slot]) => slot === 'boat' || boat.chest === true).map(
            ([slot, label]) => (
              <div key={slot} className="flex items-end gap-2">
                <TextureThumbnail
                  texture={picture(slot)}
                  testId={`item-boat-picture-${slot}-thumbnail`}
                />
                <IdField
                  label={label}
                  value={picture(slot)}
                  registry="texture"
                  suggest={suggest}
                  testId={`item-boat-picture-${slot}`}
                  onCommit={(value) =>
                    write(withBoatPicture(element.data, slot, value), 'Boat picture')
                  }
                />
              </div>
            ),
          )}
          {boat.chest === true && (
            <TextField
              label="Chest boat name"
              value={data.chest_boat_display_name}
              testId="item-boat-chest-name"
              placeholder={`${name} with Chest`}
              onCommit={(value) =>
                set(['chest_boat_display_name'], value, typingKey('/chest_boat_display_name'))
              }
            />
          )}
          {missing.length > 0 && (
            <div className="flex flex-col gap-1" data-testid="item-boat-pictures-missing">
              <p className="text-warning text-xs">
                The game looks for these pictures in a fixed place, and they are not there yet.
              </p>
              <Button
                className="self-start text-xs"
                data-testid="item-boat-pictures-copy"
                disabled={host?.applyChanges === undefined}
                onClick={() => write(element.data, 'Copy boat pictures')}
              >
                Copy the pictures to where the game looks
              </Button>
            </div>
          )}
          {error !== null && (
            <p role="alert" className="text-error text-xs" data-testid="item-boat-error">
              {error}
            </p>
          )}
        </>
      )}
      <ProblemsAt problems={problems} pointer={pointerOf(path)} />
      {(['chest', 'raft', 'wood_texture'] as const).map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf([...path, key])} />
      ))}
      <ProblemsAt problems={problems} pointer={pointerOf(['boat_textures'])} />
      {BOAT_PICTURES.map(([slot]) => (
        <ProblemsAt key={slot} problems={problems} pointer={pointerOf(['boat_textures', slot])} />
      ))}
      <ProblemsAt problems={problems} pointer={pointerOf(['chest_boat_display_name'])} />
    </Section>
  );
}
