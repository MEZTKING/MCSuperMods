/**
 * The Creator's Card tab (ADR 0044 D6): a painting hung on a wall at its size in blocks (the
 * picture stretched over the painting as the game does, with a note when its proportions do
 * not match) and an enchantment card (the in-game name at each level, where it goes, how rare
 * it is and a table of its numbers per level). Plain DOM, no WebGL.
 *
 * Test ids: `creator-cards`, `creator-painting-<id>`, `creator-painting-picture`,
 * `creator-painting-fit`, `creator-enchantment-<id>`, `creator-enchantment-levels`.
 *
 * @packageDocumentation
 */

import type { ContentBundle } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { paintingTextureBytes, pngDataUrl } from '../../preview/bundle-source';
import type { ResourceFolders } from '../../preview/model-chain';
import { pngSize } from '../wizard/wizard-model';
import {
  type EnchantmentCard,
  enchantmentCards,
  enchantmentSummary,
  type PaintingCard,
  paintingCards,
  pictureFit,
  romanLevel,
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

/** The Card tab: paintings and enchantments of the bundle. */
export function CreatorCards(props: CreatorCardsProps) {
  const paintings = paintingCards(props.bundle);
  const enchantments = enchantmentCards(props.bundle);
  if (paintings.length === 0 && enchantments.length === 0) {
    return <p className="text-sm text-muted">This flow makes no paintings or enchantments.</p>;
  }
  return (
    <div className="flex flex-col gap-4" data-testid="creator-cards">
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
