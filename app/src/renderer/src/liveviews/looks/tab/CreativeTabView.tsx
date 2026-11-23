/**
 * The look of `msm:creative_tab` (ADR 0121 D7, B625; limit 3L10): the tab as a page of the
 * creative inventory, its icon on the tab above the panel and its things in rows in their order
 * (`page.ts`), 45 to a page, with the empty hotbar row below as the game shows it. The panel and
 * tab are the user's own GUI pictures from the jar (`creative_inventory/tab_items.png`,
 * `tab_top_selected_1`), or MSM's plain drawing when the Minecraft folder is not set up. A thing
 * shows its picture where one is found (Minecraft's from the jar, the project's own from its
 * files), else its first letters. Search and scrolling are only in the game. The page follows
 * an edit at once.
 *
 * The default export is the live view; {@link CreativeTabPage} is what the Creative Tab Studio's
 * Preview draws.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { useState } from 'react';
import { thingName, thingWords } from '../../../components/thing-picker/thing-sources';
import type { VanillaAssetReader } from '../../../preview/model-chain';
import { usePlain } from '../../../studios/plain';
import {
  type ItemPictureSource,
  resourceFoldersOf,
  useItemPicture,
} from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { PixelPicture } from '../particle/LookPicture';
import { STAND_IN_WORDS, useLookPicture } from '../particle/look-pictures';
import { PAGE, type PageThing, SLOTS_PER_PAGE, slotOf, tabPageThings } from './page';

/** GUI scale the page is drawn at. */
const SCALE = 2;

/** The notes under the view (3L10). */
export const CREATIVE_TAB_NOTES: readonly string[] = [
  'The page is MSM’s drawing of the game’s screen: the order and the icons are your tab’s, search and scrolling are only in the game.',
];

type JsonObject = { [key: string]: Json };
const asObject = (value: Json | undefined): JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

const split = (id: string) => {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

/** The project texture path a project thing most likely shows, or `null`. */
export function ownPicturePath(project: Project, itemId: string, textures: string): string | null {
  const { namespace, path } = split(itemId);
  const space = project.namespaces.find((entry) => entry.name === namespace);
  if (space === undefined) return null;
  const has = (asset: string) => space.assets.some((entry) => entry.path === asset);
  const element = space.elements.find(
    (entry) => entry.id === itemId || entry.id === `${namespace}:${path}`,
  );
  const data = asObject(element?.data);
  const candidates: string[] = [];
  const textureIds = [
    ...Object.values(asObject(data.textures)),
    data.texture,
    asObject(data.item).texture,
  ].filter((value): value is string => typeof value === 'string');
  for (const id of textureIds) {
    const where = split(id);
    if (where.namespace === namespace) candidates.push(`${textures}/${where.path}.png`);
  }
  candidates.push(`${textures}/item/${path}.png`, `${textures}/block/${path}.png`);
  const found = candidates.find(has);
  return found === undefined ? null : `assets/${namespace}/${found}`;
}

/** Two letters for a thing without a picture. */
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

/** One thing's picture, at 16 GUI pixels. */
function ThingIcon(props: {
  project: Project;
  itemId: string;
  name: string;
  own: boolean;
  pictures: ItemPictureSource;
  testId?: string;
}) {
  const { project, itemId, name, own, pictures } = props;
  const textures = pictures.folders?.textures ?? 'textures';
  const ownPath = own ? ownPicturePath(project, itemId, textures) : null;
  const ownPicture = useLookPicture(ownPath, {
    vanillaAssets: null,
    readProject: pictures.readProject,
  });
  const vanilla = useItemPicture(own ? '' : itemId, own ? undefined : pictures);
  const url = own ? (ownPicture.state === 'found' ? ownPicture.url : null) : vanilla;
  const size = 16 * SCALE;
  return url !== null ? (
    <PixelPicture url={url} width={size} height={size} label={name} testId={props.testId} />
  ) : (
    <span
      role="img"
      aria-label={name}
      data-testid={props.testId}
      className="flex items-center justify-center bg-[#6f6f6f] font-medium text-[11px] text-white"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}

/** Props of {@link CreativeTabPage}. */
export interface CreativeTabPageProps {
  readonly project: Project;
  readonly element: Element;
  readonly vanillaAssets: VanillaAssetReader | null;
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
}

/** The page in its frame; see the module comment. */
export function CreativeTabPage(props: CreativeTabPageProps) {
  const { project, element, vanillaAssets, readProject } = props;
  const veryEasy = usePlain();
  const [pageAsked, setPage] = useState(0);
  const folders = resourceFoldersOf(project);
  const textures = folders?.textures ?? 'textures';
  const source = { vanillaAssets, readProject };
  const panel = useLookPicture(
    `assets/minecraft/${textures}/gui/container/creative_inventory/tab_items.png`,
    source,
  );
  const tab = useLookPicture(
    `assets/minecraft/${textures}/gui/sprites/container/creative_inventory/tab_top_selected_1.png`,
    source,
  );
  const data = asObject(element.data);
  const title =
    typeof data.display_name === 'string' && data.display_name.trim() !== ''
      ? data.display_name
      : thingWords(element.id);
  const icon = typeof data.icon === 'string' ? data.icon : '';
  const things: PageThing[] = tabPageThings(project, element).map((thing) => ({
    ...thing,
    name: thing.name === '' ? thingName(project, thing.itemId, 'item') : thing.name,
  }));
  const pages = Math.max(1, Math.ceil(things.length / SLOTS_PER_PAGE));
  const page = Math.min(pageAsked, pages - 1);
  const onPage = things
    .map((thing, index) => ({ thing, index, slot: slotOf(index) }))
    .filter((entry) => entry.slot.page === page);
  const pictures: ItemPictureSource = {
    vanillaAssets,
    folders,
    ...(readProject === undefined ? {} : { readProject }),
  };
  const s = (value: number) => value * SCALE;
  const drawnPanel = panel.state !== 'found';

  return (
    <LiveViewFrame
      title="Creative tab"
      fidelity="about_right"
      notes={[...CREATIVE_TAB_NOTES, ...(vanillaAssets === null ? [STAND_IN_WORDS] : [])]}
    >
      <div className="flex flex-col gap-2">
        <div className="max-w-full overflow-x-auto">
          <div
            className="relative"
            style={{ width: s(PAGE.width), height: s(PAGE.height + PAGE.tabRise) }}
            data-testid="creative-tab-page"
            data-drawn={drawnPanel ? 'msm' : 'jar'}
          >
            {/* The tab, above the panel, with the icon on it. */}
            <div
              className="absolute"
              style={{ left: 0, top: 0, width: s(PAGE.tabWidth), height: s(PAGE.tabHeight) }}
              data-testid="creative-tab-page-tab"
            >
              {tab.state === 'found' ? (
                <PixelPicture
                  url={tab.url}
                  width={s(PAGE.tabWidth)}
                  height={s(PAGE.tabHeight)}
                  layer
                />
              ) : (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-t border-2 border-[#555] border-b-0 bg-[#c6c6c6]"
                />
              )}
              {icon !== '' && (
                <span className="absolute" style={{ left: s(5), top: s(9) }}>
                  <ThingIcon
                    project={project}
                    itemId={icon}
                    name={`Tab icon: ${thingName(project, icon, 'item')}`}
                    own={!icon.startsWith('minecraft:') && icon.includes(':')}
                    pictures={pictures}
                    testId="creative-tab-page-icon"
                  />
                </span>
              )}
            </div>
            {/* The panel. */}
            <div
              className="absolute"
              style={{
                left: 0,
                top: s(PAGE.tabRise),
                width: s(PAGE.width),
                height: s(PAGE.height),
                ...(drawnPanel
                  ? {
                      background: '#c6c6c6',
                      border: `${SCALE}px solid #555`,
                      borderRadius: SCALE * 2,
                    }
                  : {
                      backgroundImage: panel.state === 'found' ? `url("${panel.url}")` : undefined,
                      backgroundSize: `${s(256)}px ${s(256)}px`,
                      backgroundPosition: '0 0',
                      imageRendering: 'pixelated',
                    }),
              }}
            >
              <span
                className="absolute truncate"
                style={{
                  left: s(PAGE.titleX),
                  top: s(PAGE.titleY) - 2,
                  maxWidth: s(PAGE.width - 2 * PAGE.titleX),
                  color: '#404040',
                  fontSize: s(8) - 2,
                  lineHeight: `${s(9)}px`,
                }}
                data-testid="creative-tab-page-title"
              >
                {title}
              </span>
              {drawnPanel &&
                Array.from({ length: SLOTS_PER_PAGE + PAGE.columns }, (_, at) => {
                  const hotbar = at >= SLOTS_PER_PAGE;
                  const column = at % PAGE.columns;
                  const row = Math.floor(at / PAGE.columns);
                  return (
                    <span
                      key={at}
                      aria-hidden
                      className="absolute border border-[#373737] border-r-white border-b-white bg-[#8b8b8b]"
                      style={{
                        left: s(PAGE.gridX + column * PAGE.step - 1),
                        top: s(hotbar ? PAGE.hotbarY - 1 : PAGE.gridY + row * PAGE.step - 1),
                        width: s(18),
                        height: s(18),
                      }}
                    />
                  );
                })}
              <ol aria-label="Things in the tab, in order">
                {onPage.map(({ thing, index, slot }) => (
                  <li
                    key={`${thing.itemId}-${index}`}
                    className="absolute"
                    style={{ left: s(slot.x), top: s(slot.y) }}
                    data-testid={`creative-tab-page-slot-${index}`}
                    data-name={thing.name}
                    title={thing.name}
                  >
                    <ThingIcon
                      project={project}
                      itemId={thing.itemId}
                      name={thing.name}
                      own={thing.own}
                      pictures={pictures}
                    />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        {things.length === 0 && (
          <p className="text-muted text-xs" data-testid="creative-tab-page-empty">
            The tab is empty: nothing shows on its page yet.
          </p>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              data-testid="creative-tab-page-back"
            >
              Back
            </button>
            <span data-testid="creative-tab-page-number">
              Page {page + 1} of {pages}
            </span>
            <button
              type="button"
              className="rounded border border-border px-2 py-0.5"
              disabled={page >= pages - 1}
              onClick={() => setPage(page + 1)}
              data-testid="creative-tab-page-next"
            >
              Next
            </button>
          </div>
        )}
        {!veryEasy && things.length > 0 && (
          <p className="text-muted text-xs">
            {things.length} {things.length === 1 ? 'thing' : 'things'}; the game scrolls where this
            shows pages.
          </p>
        )}
      </div>
    </LiveViewFrame>
  );
}

/** The live view; see the module comment. */
export default function CreativeTabView(props: LiveViewProps) {
  return (
    <CreativeTabPage
      project={props.project}
      element={props.element}
      vanillaAssets={props.vanillaAssets}
      readProject={props.readProject}
    />
  );
}
