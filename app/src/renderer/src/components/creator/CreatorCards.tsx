/**
 * The Creator's Card tab (ADR 0044 D6): a painting hung on a wall at its size in blocks (the
 * picture stretched over the painting as the game does, with a note when its proportions do
 * not match) and an enchantment card (the in-game name at each level, where it goes, how rare
 * it is and a table of its numbers per level); a status effect card (ADR 0055: its icon, the
 * name in its category's colour, what it does and a table of stat changes and tick rate per
 * level) and a throwable card (ADR 0056: the item picture, a sketch of a level throw from its
 * speed and gravity, damage, holding, what happens after the throw and on a hit). Plain DOM and
 * SVG, no WebGL.
 *
 * Test ids: `creator-cards`, `creator-painting-<id>`, `creator-painting-picture`,
 * `creator-painting-fit`, `creator-enchantment-<id>`, `creator-enchantment-levels`,
 * `creator-effect-<id>`, `creator-effect-icon`, `creator-effect-name`, `creator-effect-levels`,
 * `creator-throwable-<id>`, `creator-throwable-sprite`, `creator-throwable-arc`.
 *
 * @packageDocumentation
 */

import type { ContentBundle } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import {
  bundleAssetBytes,
  elementTextureBytes,
  paintingTextureBytes,
  pngDataUrl,
} from '../../preview/bundle-source';
import type { ResourceFolders } from '../../preview/model-chain';
import { pngSize } from '../wizard/wizard-model';
import {
  type ArcPoint,
  type EffectCard,
  type EnchantmentCard,
  effectCards,
  enchantmentCards,
  enchantmentSummary,
  type PaintingCard,
  paintingCards,
  pictureFit,
  romanLevel,
  THROW_EYE_HEIGHT,
  type ThrowableCard,
  throwableCards,
} from './creator-cards';

/** Pixels per block of the wall the painting hangs on. */
export const WALL_BLOCK_PX = 40;

/** Blocks of wall around the painting on each side. */
const WALL_MARGIN = 1;

/** Props of {@link CreatorCards}. */
export interface CreatorCardsProps {
  bundle: ContentBundle;
  folders: ResourceFolders;
  readProjectAsset(namespace: string, path: string): Promise<Uint8Array | null>;
}

function PaintingView(props: {
  card: PaintingCard;
  bundle: ContentBundle;
  folders: ResourceFolders;
  readProjectAsset: CreatorCardsProps['readProjectAsset'];
}) {
  const { card, bundle, folders, readProjectAsset } = props;
  const [picture, setPicture] = useState<{ url: string; bytes: Uint8Array } | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    void paintingTextureBytes(bundle, card.assetId, folders, readProjectAsset).then((bytes) => {
      if (!live) return;
      setPicture(bytes === null ? null : { url: pngDataUrl(bytes), bytes });
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [bundle, card.assetId, folders, readProjectAsset]);
  const pixels = picture === null ? null : pngSize(picture.bytes);
  const fit = pixels === null ? null : pictureFit(pixels, card);
  const wallWidth = (card.width + WALL_MARGIN * 2) * WALL_BLOCK_PX;
  const wallHeight = (card.height + WALL_MARGIN * 2) * WALL_BLOCK_PX;
  const description = `${card.title}${card.author === null ? '' : ` by ${card.author}`}, ${card.width} by ${card.height} blocks`;
  return (
    <section
      aria-label={`Painting ${card.title}`}
      data-testid={`creator-painting-${card.id}`}
      className="flex flex-col gap-1.5"
    >
      <figure className="m-0 flex flex-col gap-1">
        <div
          role="img"
          aria-label={`${description}, on a wall`}
          className="relative max-w-full overflow-hidden rounded border border-border"
          style={{
            width: wallWidth,
            height: wallHeight,
            backgroundColor: '#7d7d7d',
            backgroundImage:
              'linear-gradient(to right, rgba(0,0,0,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.18) 1px, transparent 1px)',
            backgroundSize: `${WALL_BLOCK_PX}px ${WALL_BLOCK_PX}px`,
          }}
        >
          {picture === null ? (
            <div
              className="absolute flex items-center justify-center border border-black/40 bg-black/20 p-1 text-center text-[10px] text-white"
              style={{
                left: WALL_MARGIN * WALL_BLOCK_PX,
                top: WALL_MARGIN * WALL_BLOCK_PX,
                width: card.width * WALL_BLOCK_PX,
                height: card.height * WALL_BLOCK_PX,
              }}
            >
              {loaded ? 'No picture found' : 'Loading…'}
            </div>
          ) : (
            <img
              alt=""
              data-testid="creator-painting-picture"
              src={picture.url}
              className="absolute shadow-md [image-rendering:pixelated]"
              style={{
                left: WALL_MARGIN * WALL_BLOCK_PX,
                top: WALL_MARGIN * WALL_BLOCK_PX,
                width: card.width * WALL_BLOCK_PX,
                height: card.height * WALL_BLOCK_PX,
              }}
            />
          )}
        </div>
        <figcaption className="text-sm">
          <span className="font-medium">{card.title}</span>
          {card.author !== null && <span className="text-muted"> by {card.author}</span>}
          <span className="block text-xs text-muted">
            {card.width} by {card.height} block{card.width * card.height === 1 ? '' : 's'}{' '}
            <code className="font-mono">{card.id}</code>
          </span>
        </figcaption>
      </figure>
      {fit !== null && (
        <p
          data-testid="creator-painting-fit"
          role={fit.matches ? undefined : 'status'}
          className={fit.matches ? 'text-xs text-muted' : 'text-xs text-warning'}
        >
          {fit.text}
        </p>
      )}
    </section>
  );
}

function EnchantmentView({ card }: { card: EnchantmentCard }) {
  const shownLevels = card.levels.length;
  return (
    <section
      aria-label={`Enchantment ${card.name}`}
      data-testid={`creator-enchantment-${card.id}`}
      className="flex flex-col gap-2"
    >
      <p className="sr-only">As shown in an item's tooltip:</p>
      <div
        className="w-fit max-w-full rounded border-2 border-[#2a0f5c] bg-[#120018] px-2 py-1 font-mono text-sm text-[#aaaaaa]"
        data-testid="creator-enchantment-tooltip"
      >
        {card.levels.map((row) => (
          <p key={row.level} className="m-0">
            {card.name}
            {card.maxLevel === 1 ? '' : ` ${row.roman}`}
          </p>
        ))}
      </div>
      <ul className="m-0 list-disc pl-5 text-sm">
        {enchantmentSummary(card).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <table
        data-testid="creator-enchantment-levels"
        className="w-fit border-collapse text-left text-xs"
      >
        <caption className="pb-1 text-left text-muted">
          {card.name} per level
          {card.maxLevel > shownLevels ? ` (first ${shownLevels} of ${card.maxLevel})` : ''}
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border border-border px-1.5 py-0.5">
              Level
            </th>
            <th scope="col" className="border border-border px-1.5 py-0.5">
              Enchanting cost
            </th>
            {card.columns.map((column) => (
              <th key={column} scope="col" className="border border-border px-1.5 py-0.5">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {card.levels.map((row) => (
            <tr key={row.level} data-testid={`creator-enchantment-level-${row.level}`}>
              <th scope="row" className="border border-border px-1.5 py-0.5 font-normal">
                {romanLevel(row.level)}
              </th>
              <td className="border border-border px-1.5 py-0.5">{row.cost}</td>
              {row.values.map((value, index) => (
                <td
                  key={card.columns[index] ?? index}
                  className="border border-border px-1.5 py-0.5"
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function EffectView(props: {
  card: EffectCard;
  bundle: ContentBundle;
  folders: ResourceFolders;
  readProjectAsset: CreatorCardsProps['readProjectAsset'];
}) {
  const { card, bundle, folders, readProjectAsset } = props;
  const [icon, setIcon] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const { namespace } = card.icon;
  const path = `${folders.textures}/${card.icon.path}`;
  useEffect(() => {
    let live = true;
    setLoaded(false);
    const own = bundleAssetBytes(bundle, namespace, path);
    void (own === undefined ? readProjectAsset(namespace, path) : Promise.resolve(own)).then(
      (bytes) => {
        if (!live) return;
        setIcon(bytes === null ? null : pngDataUrl(bytes));
        setLoaded(true);
      },
    );
    return () => {
      live = false;
    };
  }, [bundle, namespace, path, readProjectAsset]);
  return (
    <section
      aria-label={`Status effect ${card.name}`}
      data-testid={`creator-effect-${card.id}`}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 rounded border-2 border-[#2a0f5c] bg-[#120018] px-2 py-1 font-mono text-sm w-fit max-w-full">
        {icon === null ? (
          <span
            className="inline-block h-9 w-9 border border-white/30 text-center text-[9px] leading-9 text-white"
            data-testid="creator-effect-icon"
          >
            {loaded ? 'No icon' : '…'}
          </span>
        ) : (
          <img
            alt={`${card.name} icon`}
            src={icon}
            data-testid="creator-effect-icon"
            className="h-9 w-9 [image-rendering:pixelated]"
          />
        )}
        <span data-testid="creator-effect-name" style={{ color: card.nameColour }}>
          {card.name}
        </span>
      </div>
      <p className="m-0 flex items-center gap-1.5 text-xs text-muted">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 rounded-full border border-border"
          style={{ backgroundColor: card.colour }}
        />
        {card.categoryWords}, colour {card.colour}. <code className="font-mono">{card.id}</code>
      </p>
      <ul className="m-0 list-disc pl-5 text-sm">
        {card.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {card.levels.length > 0 && (
        <table
          data-testid="creator-effect-levels"
          className="w-fit border-collapse text-left text-xs"
        >
          <caption className="pb-1 text-left text-muted">{card.name} per level</caption>
          <thead>
            <tr>
              <th scope="col" className="border border-border px-1.5 py-0.5">
                Level
              </th>
              {card.columns.map((column) => (
                <th key={column} scope="col" className="border border-border px-1.5 py-0.5">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {card.levels.map((row) => (
              <tr key={row.level}>
                <th scope="row" className="border border-border px-1.5 py-0.5 font-normal">
                  {row.roman}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={card.columns[index] ?? index}
                    className="border border-border px-1.5 py-0.5"
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Width and height of the throw sketch in pixels. */
const ARC_WIDTH = 240;
const ARC_HEIGHT = 80;

/** The SVG polyline points of a throw, scaled to fit the sketch (same scale on both axes). */
function arcPolyline(arc: readonly ArcPoint[]): { points: string; scale: number } {
  const far = Math.max(1, ...arc.map((point) => point.x));
  const high = Math.max(THROW_EYE_HEIGHT, ...arc.map((point) => point.y));
  const scale = Math.min((ARC_WIDTH - 16) / far, (ARC_HEIGHT - 12) / high);
  const points = arc
    .map((point) => `${8 + point.x * scale},${ARC_HEIGHT - 4 - point.y * scale}`)
    .join(' ');
  return { points, scale };
}

function ThrowableView(props: {
  card: ThrowableCard;
  bundle: ContentBundle;
  folders: ResourceFolders;
}) {
  const { card, bundle, folders } = props;
  const item = bundle.elements.find((entry) => entry.id === card.id);
  const bytes = item === undefined ? undefined : elementTextureBytes(bundle, item.data, folders);
  const { points, scale } = arcPolyline(card.arc);
  const last = card.arc[card.arc.length - 1] as ArcPoint;
  return (
    <section
      aria-label={`Throwable ${card.name}`}
      data-testid={`creator-throwable-${card.id}`}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        {bytes === undefined ? null : (
          <img
            alt={`${card.name} item`}
            src={pngDataUrl(bytes)}
            data-testid="creator-throwable-sprite"
            className="h-8 w-8 [image-rendering:pixelated]"
          />
        )}
        <span className="text-sm font-medium">{card.name}</span>
        <code className="font-mono text-xs text-muted">{card.id}</code>
      </div>
      <svg
        role="img"
        aria-label={`A level throw from eye height lands about ${Math.round(last.x)} blocks away`}
        data-testid="creator-throwable-arc"
        width={ARC_WIDTH}
        height={ARC_HEIGHT}
        viewBox={`0 0 ${ARC_WIDTH} ${ARC_HEIGHT}`}
        className="max-w-full rounded border border-border bg-bg"
      >
        <line
          x1={0}
          y1={ARC_HEIGHT - 4}
          x2={ARC_WIDTH}
          y2={ARC_HEIGHT - 4}
          stroke="currentColor"
          strokeOpacity={0.4}
        />
        <line
          x1={8}
          y1={ARC_HEIGHT - 4}
          x2={8}
          y2={ARC_HEIGHT - 4 - THROW_EYE_HEIGHT * scale}
          stroke="currentColor"
          strokeOpacity={0.6}
          strokeWidth={2}
        />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </svg>
      <ul className="m-0 list-disc pl-5 text-sm">
        {card.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** The Card tab: paintings, enchantments, status effects and throwables of the bundle. */
export function CreatorCards(props: CreatorCardsProps) {
  const paintings = paintingCards(props.bundle);
  const enchantments = enchantmentCards(props.bundle);
  const effects = effectCards(props.bundle);
  const throwables = throwableCards(props.bundle);
  if (
    paintings.length === 0 &&
    enchantments.length === 0 &&
    effects.length === 0 &&
    throwables.length === 0
  ) {
    return (
      <p className="text-sm text-muted">
        This flow makes no paintings, enchantments, status effects or throwables.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="creator-cards">
      {effects.map((card) => (
        <EffectView
          key={card.id}
          card={card}
          bundle={props.bundle}
          folders={props.folders}
          readProjectAsset={props.readProjectAsset}
        />
      ))}
      {throwables.map((card) => (
        <ThrowableView key={card.id} card={card} bundle={props.bundle} folders={props.folders} />
      ))}
      {paintings.map((card) => (
        <PaintingView
          key={card.id}
          card={card}
          bundle={props.bundle}
          folders={props.folders}
          readProjectAsset={props.readProjectAsset}
        />
      ))}
      {enchantments.map((card) => (
        <EnchantmentView key={card.id} card={card} />
      ))}
    </div>
  );
}
