/**
 * Every place in the app where a sound is picked or defined, and how its Play button gets there
 * (ADR 0121 D2; B622). `test/components/audio/sound-pickers.test.tsx` walks the renderer's
 * source for sound pickers ({@link SOUND_PICKER_MARKERS}) and fails when a file picks a sound
 * but is not listed here, or is listed but does not use the part that carries the button; it
 * then renders each of those parts and finds the button.
 *
 * - `SoundPlayButton`: the file draws the button itself.
 * - `IdField`: the shared id field (`studios/structures/pickers.tsx`) shows Play beside a sound
 *   event id in Easy and in Very easy.
 * - `ThingPicker`: every sound tile of the picker has Play.
 * - `StringControl`: the schema form's text field shows Play beside a sound event or sound file.
 *
 * Pure: no DOM.
 *
 * @packageDocumentation
 */

/** The parts that carry a Play button. */
export type SoundPickerPart = 'SoundPlayButton' | 'IdField' | 'ThingPicker' | 'StringControl';

/** One place that picks a sound. */
export interface SoundPickerPlace {
  /** The file under `app/src/renderer/src/`. */
  readonly file: string;
  /** What it is, in words. */
  readonly place: string;
  /** The part that shows its Play button. */
  readonly via: SoundPickerPart;
}

/** Registries whose ids are sound events (with or without `minecraft:`). */
const EVENT_REGISTRIES: ReadonlySet<string> = new Set(['sound_event', 'weighed_sound_event']);

/** Whether `registry` names sound events. */
export const isSoundEventRegistry = (registry: string | undefined): boolean =>
  registry !== undefined && EVENT_REGISTRIES.has(registry.replace(/^minecraft:/, ''));

/** Whether `registry` names sound files (the `name` of a file entry in `sounds.json`). */
export const isSoundFileRegistry = (registry: string | undefined): boolean =>
  registry !== undefined && registry.replace(/^minecraft:/, '') === 'sound';

/**
 * Text in a source file that means it picks a sound: a sound event registry or the ThingPicker's
 * `sound` sort anywhere, an `audio` parameter only in a component (`.tsx`; the models that build
 * flows from it pick nothing).
 */
export const SOUND_PICKER_MARKERS: readonly { pattern: RegExp; componentsOnly: boolean }[] = [
  {
    pattern: /registry(?:=|: )["'](?:minecraft:)?(?:weighed_)?sound_event["']/,
    componentsOnly: false,
  },
  { pattern: /sort(?:=|: )["']sound["']/, componentsOnly: false },
  { pattern: /case 'audio':/, componentsOnly: true },
  { pattern: /type: 'audio'/, componentsOnly: true },
];

/** The places (see the module comment); sorted by file. */
export const SOUND_PICKERS: readonly SoundPickerPlace[] = [
  {
    file: 'components/creator/CreatorAudioField.tsx',
    place: "The Creator's song field",
    via: 'SoundPlayButton',
  },
  {
    file: 'components/thing-picker/ThingPicker.tsx',
    place: 'The ThingPicker (Rules, Very easy, the Studios)',
    via: 'SoundPlayButton',
  },
  {
    file: 'components/wizard/ParameterField.tsx',
    place: "A starter wizard's song field",
    via: 'SoundPlayButton',
  },
  { file: 'forms/scalars.tsx', place: 'The schema form', via: 'SoundPlayButton' },
  {
    file: 'liveviews/looks/sounds/SoundsView.tsx',
    place: 'The sounds live view',
    via: 'SoundPlayButton',
  },
  {
    file: 'studios/rules/SlotChip.tsx',
    place: 'Rules: a sound slot (`THING_SLOTS.sound`)',
    via: 'ThingPicker',
  },
  {
    file: 'studios/blocks-items/blocks-items-model.ts',
    place: 'The Events editor: Play a sound',
    via: 'IdField',
  },
  {
    file: 'studios/blocks-items/EffectStudio.tsx',
    place: 'Effect Studio: its sound',
    via: 'IdField',
  },
  {
    file: 'studios/blocks-items/InventorySection.tsx',
    place: "Block Studio: the container's sounds",
    via: 'IdField',
  },
  {
    file: 'studios/blocks-items/ItemInventorySection.tsx',
    place: "Item Studio: the bag's sounds",
    via: 'IdField',
  },
  {
    file: 'studios/blocks-items/ItemStudio.tsx',
    place: "Item Studio: the throwable's sound",
    via: 'IdField',
  },
  {
    file: 'studios/blocks-items/PortalSection.tsx',
    place: "Block Studio: the portal's sounds",
    via: 'IdField',
  },
  {
    file: 'studios/blocks-items/SoundsSection.tsx',
    place: 'Block Studio: How it sounds',
    via: 'SoundPlayButton',
  },
  {
    file: 'studios/entities/EntityStudio.tsx',
    place: 'Mob Studio: Sounds',
    via: 'IdField',
  },
  {
    file: 'studios/entities/ProfessionStudio.tsx',
    place: 'Profession Studio: the work sound',
    via: 'IdField',
  },
  {
    file: 'studios/entities/RangedSection.tsx',
    place: 'Mob Studio: the ranged attack sound',
    via: 'IdField',
  },
  {
    file: 'studios/entities/StorageSection.tsx',
    place: 'Mob Studio: the storage sounds',
    via: 'IdField',
  },
  {
    file: 'studios/entities/TraderSection.tsx',
    place: 'Mob Studio: the trader sounds',
    via: 'IdField',
  },
  {
    file: 'studios/entities/vehicle/WeaponsSection.tsx',
    place: "Vehicle Studio: a weapon's sound",
    via: 'IdField',
  },
  {
    file: 'studios/entities/vehicle/sections.tsx',
    place: 'Vehicle Studio: engine, start and horn',
    via: 'IdField',
  },
];

/** How a file shows that it uses a part (its import or its own definition). */
export const PART_USES: Readonly<Record<SoundPickerPart, RegExp>> = {
  SoundPlayButton: /\bSoundPlayButton\b/,
  // A model file names fields a Studio draws through `IdField` (`type: 'id'`).
  IdField: /\bIdField\b|\bIdAt\b|type: 'id'/,
  ThingPicker: /\bThingPicker\b/,
  StringControl: /\bStringControl\b/,
};

/** The bytes of a `data:` URL (the Creator's picked song), or `null`. */
export function bytesOfDataUrl(url: string): Uint8Array | null {
  const comma = url.indexOf(',');
  if (!url.startsWith('data:') || comma < 0 || !url.slice(0, comma).endsWith(';base64')) {
    return null;
  }
  try {
    const text = atob(url.slice(comma + 1));
    const out = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) out[index] = text.charCodeAt(index);
    return out;
  } catch {
    return null;
  }
}
