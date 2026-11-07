/**
 * "New texture…" (ADR 0047 D5): a name and a kind that fixes the folder and size; the host then
 * opens the texture editor on a blank picture and adds the PNG to the namespace on Save.
 *
 * @packageDocumentation
 */

import { useId, useState } from 'react';
import { fieldClass, Modal } from '../NewElementDialog';

/** The kinds of texture offered, with their folder and size. */
export const NEW_TEXTURE_KINDS = [
  { id: 'item', label: 'Item (16 × 16)', folder: 'textures/item', width: 16, height: 16 },
  { id: 'block', label: 'Block (16 × 16)', folder: 'textures/block', width: 16, height: 16 },
  {
    id: 'armour',
    label: 'Armour layer: helmet, chestplate, boots (64 × 32)',
    folder: 'textures/entity/equipment/humanoid',
    width: 64,
    height: 32,
  },
  {
    id: 'leggings',
    label: 'Armour layer: leggings (64 × 32)',
    folder: 'textures/entity/equipment/humanoid_leggings',
    width: 64,
    height: 32,
  },
  {
    id: 'skin',
    label: 'Mob skin, the player skin layout (64 × 64)',
    folder: 'textures/entity',
    width: 64,
    height: 64,
  },
  {
    id: 'painting_1x1',
    label: 'Painting, 1 by 1 block (16 × 16)',
    folder: 'textures/painting',
    width: 16,
    height: 16,
  },
  {
    id: 'painting_2x1',
    label: 'Painting, 2 by 1 blocks (32 × 16)',
    folder: 'textures/painting',
    width: 32,
    height: 16,
  },
  {
    id: 'painting',
    label: 'Painting, 2 by 2 blocks (32 × 32)',
    folder: 'textures/painting',
    width: 32,
    height: 32,
  },
  {
    id: 'painting_4x2',
    label: 'Painting, 4 by 2 blocks (64 × 32)',
    folder: 'textures/painting',
    width: 64,
    height: 32,
  },
  {
    id: 'painting_4x4',
    label: 'Painting, 4 by 4 blocks (64 × 64)',
    folder: 'textures/painting',
    width: 64,
    height: 64,
  },
] as const;

export type NewTextureKind = (typeof NEW_TEXTURE_KINDS)[number];

/** A texture name: lower case letters, digits, `_`, `-` and `.`, starting with a letter or digit. */
const NAME = /^[a-z0-9][a-z0-9_.-]*$/;

export interface NewTextureDialogProps {
  namespace: string;
  /** Asset paths the namespace already has (`textures/item/ruby.png`), to refuse clashes. */
  existing: readonly string[];
  onPaint(choice: { kind: NewTextureKind; name: string; path: string }): void;
  onClose(): void;
}

export function NewTextureDialog(props: NewTextureDialogProps) {
  const [name, setName] = useState('');
  const [kindId, setKindId] = useState<NewTextureKind['id']>('item');
  const nameId = useId();
  const kindIdField = useId();
  const kind = NEW_TEXTURE_KINDS.find((entry) => entry.id === kindId) ?? NEW_TEXTURE_KINDS[0];
  const path = `${kind.folder}/${name}.png`;
  const error =
    name === ''
      ? null
      : !NAME.test(name)
        ? 'Use lower case letters, digits, _, - and . only.'
        : props.existing.includes(path)
          ? `${path} already exists: use the brush on its row to paint it.`
          : null;
  return (
    <Modal
      title={`New texture in ${props.namespace}`}
      error={error}
      testId="new-texture-dialog"
      submitLabel="Paint…"
      busy={name === '' || error !== null}
      onCancel={props.onClose}
      onSubmit={() => props.onPaint({ kind, name, path })}
    >
      <label htmlFor={nameId} className="text-sm font-medium">
        Name
      </label>
      <input
        id={nameId}
        data-testid="new-texture-name"
        className={fieldClass}
        placeholder="ruby_staff"
        value={name}
        onChange={(event) => setName(event.target.value.trim().toLowerCase())}
      />
      <label htmlFor={kindIdField} className="text-sm font-medium">
        What it is for
      </label>
      <select
        id={kindIdField}
        data-testid="new-texture-kind"
        className={fieldClass}
        value={kindId}
        onChange={(event) => setKindId(event.target.value as NewTextureKind['id'])}
      >
        {NEW_TEXTURE_KINDS.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted">
        It is saved as {props.namespace}:{name === '' ? '<name>' : name} in {kind.folder}. Point a
        model or an equipment layer at it to use it.
      </p>
    </Modal>
  );
}
