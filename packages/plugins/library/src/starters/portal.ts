/**
 * The Portal Creator flow (ADR 0078 D2, group `worlds`): a portal block (ADR 0077) that players
 * light in a frame and walk through to another dimension and back. The answers pick where it
 * goes (a new dimension, the default, with the Dimension flow's Terrain, Biome and Sky
 * questions; the Nether; the End; or another dimension by id), the frame (a new frame block in
 * the portal colour, the default, or a vanilla block), what lights it (flint and steel, the
 * default; a new key item with 64 uses; a fire charge; an eye of ender), the scale (1:1 or 8:1
 * like the Nether), the portal colour, the particles (portal sparkles or coloured dust), the
 * sounds (the portal hum or quiet) and the wobble and overlay when entering.
 *
 * Ids derive from `portal_name` (see `content/portal.ts`: the portal `sky_portal`, its frame
 * block `sky_portal_frame`, its key `sky_portal_key`) and, for a new dimension, from
 * `dimension_name` (the dimension `sky_realm` and its travel function `sky_realm/travel`, which
 * the flow writes too so a vanilla data pack still has a way in). Portals need the Fabric mod
 * jar export.
 */
import type {
  BundleContext,
  ContentBundle,
  ResourceLocation,
  StarterParameter,
} from '@msm/plugin-api';
import { modElement, PACK_NOTES, packElement } from '../content/bundle';
import {
  booleanValue,
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';
import {
  DEFAULT_PORTAL_COLOUR,
  PORTAL_FRAMES,
  PORTAL_IGNITERS,
  type PortalDestination,
  portalContent,
} from '../content/portal';
import { dimensionContent, dimensionWorldParameters } from './dimension';

/** Where the portal goes: a new dimension, the Nether, the End or a dimension by id. */
const DESTINATIONS: readonly { value: string; label: string; words: string }[] = [
  { value: 'new', label: 'A new dimension (choose its terrain, biome and sky below)', words: '' },
  { value: 'minecraft:the_nether', label: 'The Nether', words: 'the Nether' },
  { value: 'minecraft:the_end', label: 'The End', words: 'the End' },
  { value: 'other', label: 'Another dimension, by its id (below)', words: '' },
];

/** An id with a namespace, as the "Other dimension" answer takes it. */
const DIMENSION_ID_PATTERN = '^[a-z0-9_.-]+:[a-z0-9_./-]+$';

/** The Portal flow's questions, groups "Portal", "Where it goes", "Frame", "Travel" and "Looks". */
export const PORTAL_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'portal_name',
    label: 'Portal name',
    description: 'The English name. Ids derive from it: Sky Portal gives sky_portal.',
    group: 'Portal',
    type: 'string',
    default: 'Sky Portal',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'destination',
    label: 'Where it goes',
    description: 'The portal leads there and back to the overworld.',
    group: 'Where it goes',
    type: 'choice',
    default: 'new',
    choices: DESTINATIONS.map(({ value, label }) => ({ value, label })),
  },
  {
    id: 'dimension_name',
    label: 'New dimension name',
    description:
      'For a new dimension: its English name. Ids derive from it: Sky Realm gives sky_realm.',
    group: 'Where it goes',
    type: 'string',
    default: 'Sky Realm',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  ...dimensionWorldParameters('Where it goes'),
  {
    id: 'dimension_id',
    label: 'Other dimension',
    description:
      'For another dimension: its id, such as a dimension of this project (demo:ruby_realm) or a vanilla one.',
    group: 'Where it goes',
    type: 'string',
    default: 'minecraft:the_end',
    pattern: DIMENSION_ID_PATTERN,
    maxLength: 64,
  },
  {
    id: 'frame',
    label: 'Frame',
    description:
      'What players build the frame of. Exit portals at the other end are built of it too.',
    group: 'Frame',
    type: 'choice',
    default: 'new',
    choices: PORTAL_FRAMES.map((entry) => ({ ...entry })),
  },
  {
    id: 'igniter',
    label: 'Light it with',
    description: 'Used on the inside of a finished frame, it fills the frame with the portal.',
    group: 'Frame',
    type: 'choice',
    default: 'minecraft:flint_and_steel',
    choices: PORTAL_IGNITERS.map((entry) => ({ ...entry })),
  },
  {
    id: 'scale',
    label: 'Scale',
    description: 'How far a step there takes you here.',
    group: 'Travel',
    type: 'choice',
    default: '1',
    choices: [
      { value: '1', label: '1:1, one block there is one block here' },
      { value: '8', label: '8:1 like the Nether, one block there is eight here' },
    ],
  },
  {
    id: 'overlay',
    label: 'Wobble and overlay when entering',
    description:
      "The screen wobbles and shows the Nether portal's purple swirl while you stand in the portal, as in the Nether portal.",
    group: 'Travel',
    type: 'boolean',
    default: true,
  },
  {
    id: 'colour',
    label: 'Portal colour',
    description: 'The colour of the portal, the new frame block, the key and coloured dust.',
    group: 'Looks',
    type: 'colour',
    default: hexFromRgb(DEFAULT_PORTAL_COLOUR),
  },
  {
    id: 'particles',
    label: 'Particles',
    group: 'Looks',
    type: 'choice',
    default: 'portal',
    choices: [
      { value: 'portal', label: 'Portal sparkles' },
      { value: 'dust', label: 'Coloured dust in the portal colour' },
    ],
  },
  {
    id: 'sounds',
    label: 'Sounds',
    group: 'Looks',
    type: 'choice',
    default: 'hum',
    choices: [
      { value: 'hum', label: 'The portal hum and whoosh' },
      { value: 'quiet', label: 'Quiet' },
    ],
  },
]);

export function portalBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(PORTAL_PARAMETERS, context);
  const name = nameForms(stringValue(values, 'portal_name'));
  const where = stringValue(values, 'destination');
  const chosen = DESTINATIONS.find((entry) => entry.value === where) ?? DESTINATIONS[0];
  if (chosen === undefined) throw new Error('No portal destination.');

  const bundle: ContentBundle = {
    elements: [
      packElement(namespace, `${projectName}: ${name.lower}`, PACK_NOTES),
      modElement(namespace, projectName, `Adds ${name.lower}, a portal to another dimension.`),
    ],
    assets: [],
  };
  let destination: PortalDestination;
  if (chosen.value === 'new') {
    const dimensionName = nameForms(stringValue(values, 'dimension_name'));
    const world = dimensionContent(
      namespace,
      dimensionName,
      values,
      ', or step through the portal',
    );
    bundle.elements.push(...world.elements);
    destination = {
      dimension: world.dimension,
      words: `${dimensionName.display} (${world.words})`,
      travel: world.travel,
    };
  } else if (chosen.value === 'other') {
    const typed = stringValue(values, 'dimension_id');
    const id: ResourceLocation = typed.includes(':')
      ? (typed as ResourceLocation)
      : `minecraft:${typed}`;
    destination = { dimension: id, words: `the dimension ${id}` };
  } else {
    destination = { dimension: chosen.value as ResourceLocation, words: chosen.words };
  }
  const portal = portalContent(namespace, name, destination, {
    frame: stringValue(values, 'frame'),
    igniter: stringValue(values, 'igniter'),
    scale: stringValue(values, 'scale'),
    colour: rgbFromHex(stringValue(values, 'colour'), DEFAULT_PORTAL_COLOUR),
    particles: stringValue(values, 'particles'),
    sounds: stringValue(values, 'sounds'),
    overlay: booleanValue(values, 'overlay'),
  });
  bundle.elements.push(...portal.elements);
  bundle.assets.push(...portal.assets);
  return bundle;
}
