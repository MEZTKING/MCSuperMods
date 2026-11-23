/**
 * Pixel pictures for the flat looks (B625): a picture drawn at a whole scale with sharp pixels,
 * and a tinted layer as the game tints one (each pixel's colour multiplied by the tint, its
 * alpha kept), done by the browser with a mask and a multiply blend, so no canvas is needed.
 */

import type { CSSProperties } from 'react';

/** Props of {@link PixelPicture}. */
export interface PixelPictureProps {
  /** A `data:` URL. */
  readonly url: string;
  /** Size on screen in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Multiplies every pixel's colour (`#rrggbb`), as the game's tint does; none by default. */
  readonly tint?: string | undefined;
  /** Placed over the box it sits in (for layers), or in the flow. */
  readonly layer?: boolean;
  /** Read out for tests and screen readers: what the picture is. */
  readonly label?: string;
  readonly testId?: string | undefined;
  readonly style?: CSSProperties;
}

/** A picture with sharp pixels, tinted when asked. */
export function PixelPicture(props: PixelPictureProps) {
  const { url, width, height, tint } = props;
  const base: CSSProperties = {
    width,
    height,
    imageRendering: 'pixelated',
    ...(props.layer === true ? { position: 'absolute', left: 0, top: 0 } : {}),
    ...props.style,
  };
  if (tint === undefined) {
    return (
      <img
        src={url}
        alt={props.label ?? ''}
        width={width}
        height={height}
        draggable={false}
        data-testid={props.testId}
        style={base}
      />
    );
  }
  const image = `url("${url}")`;
  const named =
    props.label === undefined
      ? ({ 'aria-hidden': true } as const)
      : ({ role: 'img', 'aria-label': props.label } as const);
  return (
    <span
      {...named}
      data-testid={props.testId}
      data-tint={tint}
      style={{
        ...base,
        display: 'block',
        backgroundImage: image,
        backgroundColor: tint,
        backgroundBlendMode: 'multiply',
        backgroundSize: `${width}px ${height}px`,
        maskImage: image,
        maskSize: `${width}px ${height}px`,
        WebkitMaskImage: image,
        WebkitMaskSize: `${width}px ${height}px`,
      }}
    />
  );
}
