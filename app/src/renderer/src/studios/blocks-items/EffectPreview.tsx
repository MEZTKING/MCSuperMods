/**
 * The Effect Studio's icon and preview card (ADR 0055 D6), out of the Studio so the Creator and
 * the AI helper draw them too (B615): the 18 by 18 icon (or a swatch of the effect colour), the
 * name in its category's colour and a summary of levels I and II. The icon comes through the
 * blocks and items Studio host's `thumbnail`, so a bundle-backed host draws a bundle's.
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import { useEffect, useState } from 'react';
import { pngDataUrl } from '../../components/AssetList';
import { asObject } from './blocks-items-model';
import {
  categoryColour,
  EFFECT_ICON_SIZE,
  effectDisplayName,
  modifierSummary,
  tickInterval,
} from './effect-model';
import { useBlocksItemsStudioHost } from './host';

/** A thumbnail `data:` URL of `assetPath` from the host, or `null`. */
export function useIconThumbnail(assetPath: string, present: boolean): string | null {
  const host = useBlocksItemsStudioHost();
  const [url, setUrl] = useState<string | null>(null);
  const load = host?.thumbnail;
  const revision = host?.revision ?? 0;
  useEffect(() => {
    setUrl(null);
    if (load === undefined || !present) return;
    let live = true;
    load(assetPath, EFFECT_ICON_SIZE * 2).then(
      (bytes) => {
        if (live) setUrl(pngDataUrl(bytes));
      },
      () => {
        if (live) setUrl(null);
      },
    );
    return () => {
      live = false;
    };
  }, [load, assetPath, present, revision]);
  return url;
}

/** The icon, or a swatch of the effect colour when there is no thumbnail. */
export function IconImage(props: { url: string | null; colour: string; testId: string }) {
  return props.url !== null ? (
    <img
      src={props.url}
      alt="Effect icon"
      data-testid={props.testId}
      width={EFFECT_ICON_SIZE * 2}
      height={EFFECT_ICON_SIZE * 2}
      style={{ imageRendering: 'pixelated' }}
    />
  ) : (
    <span
      aria-hidden
      data-testid={`${props.testId}-placeholder`}
      className="inline-block rounded border border-border"
      style={{
        width: EFFECT_ICON_SIZE * 2,
        height: EFFECT_ICON_SIZE * 2,
        background: props.colour,
      }}
    />
  );
}

/** The effect colour as a CSS colour, or `transparent`. */
export function effectSwatch(data: Json | undefined): string {
  const colour = asObject(data).color;
  return typeof colour === 'number' ? `#${colour.toString(16).padStart(6, '0')}` : 'transparent';
}

/**
 * The preview card: the icon with the name, then one line per level
 * (`<testId>-icon`, `-name`, `-levels`).
 */
export function EffectPreviewCard(props: {
  element: Element;
  iconUrl: string | null;
  testId?: string;
}) {
  const { element } = props;
  const testId = props.testId ?? 'effect-preview';
  const data = asObject(element.data);
  const components = asObject(data.components);
  const onTick = components['msm:on_tick'];
  const modifiers = Array.isArray(data.attribute_modifiers) ? data.attribute_modifiers : [];
  const levels = [1, 2];
  return (
    <>
      <div className="flex items-center gap-2 rounded border border-border bg-bg p-2">
        <IconImage
          url={props.iconUrl}
          colour={effectSwatch(element.data)}
          testId={`${testId}-icon`}
        />
        <span
          data-testid={`${testId}-name`}
          className="font-medium text-sm"
          style={{ color: categoryColour(data.category) }}
        >
          {effectDisplayName(element)}
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 text-xs" data-testid={`${testId}-levels`}>
        {levels.map((level) => {
          const interval = tickInterval(onTick, level);
          const parts = [
            ...modifiers.map((modifier) => modifierSummary(modifier, level)),
            ...(interval === undefined ? [] : [`acts every ${interval} ticks`]),
          ];
          return (
            <li key={level}>
              <span className="text-muted">Level {level === 1 ? 'I' : 'II'}: </span>
              {parts.length === 0 ? 'no stat changes or tick actions' : parts.join(', ')}
            </li>
          );
        })}
      </ul>
    </>
  );
}
