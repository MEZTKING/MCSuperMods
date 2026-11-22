/**
 * AI pictures (ADR 0093, accepted 2026-11-22): textures made by an image service with the user's own key,
 * then cleaned up into Minecraft style in the renderer. Shared types of main, the preload and
 * the renderer. The keys live only in main, encrypted with `safeStorage`; the renderer sees
 * whether a key is set and its last four characters, never the key.
 *
 * @packageDocumentation
 */

/** The image services MSM can call. */
export const AI_PICTURE_SERVICES = ['retro-diffusion', 'openai'] as const;

/** One image service. */
export type AiPictureServiceId = (typeof AI_PICTURE_SERVICES)[number];

/** What each service is called in the UI, with its sign-up page. */
export const AI_PICTURE_SERVICE_INFO: Readonly<
  Record<AiPictureServiceId, { label: string; keyHint: string; signUp: string; blurb: string }>
> = Object.freeze({
  'retro-diffusion': {
    label: 'Retro Diffusion (pixel art)',
    keyHint: 'rdpk-…',
    signUp: 'https://www.retrodiffusion.ai/',
    blurb:
      'A pixel-art service with Minecraft item and texture styles. Pay as you go: a few cents a picture.',
  },
  openai: {
    label: 'OpenAI images',
    keyHint: 'sk-…',
    signUp: 'https://platform.openai.com/api-keys',
    blurb:
      'A general image model. Pictures come out large and smooth; MSM cleans them up into 16 × 16 pixel art.',
  },
});

/** The service a new install uses. */
export const DEFAULT_AI_PICTURE_SERVICE: AiPictureServiceId = 'retro-diffusion';

/**
 * What a picture is for: the provider picks its style from it. `block`, `item` and `tool` are
 * the square textures the dialog lets the user switch between; `skin` (a mob's coat, laid on
 * the model's boxes in the renderer), `painting`, `pattern` (a banner, shield or pot motif) and
 * `particle` are fixed by the field they are made for (amended 2026-11-22).
 */
export const AI_PICTURE_STYLES = [
  'block',
  'item',
  'tool',
  'skin',
  'painting',
  'pattern',
  'particle',
] as const;

/** One style. */
export type AiPictureStyle = (typeof AI_PICTURE_STYLES)[number];

/** The words of each style in the UI. */
export const AI_PICTURE_STYLE_LABELS: Readonly<Record<AiPictureStyle, string>> = Object.freeze({
  block: 'Minecraft block texture',
  item: 'Item icon',
  tool: 'Tool',
  skin: 'Mob skin',
  painting: 'Painting',
  pattern: 'Pattern',
  particle: 'Particle',
});

/** The styles the dialog offers to switch between (square textures). */
export const AI_PICTURE_SQUARE_STYLES = ['block', 'item', 'tool'] as const;

/** Whether `style` is one of the square texture styles the user may switch between. */
export function isSquareStyle(style: AiPictureStyle): boolean {
  return (AI_PICTURE_SQUARE_STYLES as readonly string[]).includes(style);
}

/** The smallest and largest picture edge a request may name (pixels of the texture). */
export const AI_PICTURES_MIN_EDGE = 8;
export const AI_PICTURES_MAX_EDGE = 64;

/** The most pictures one request asks for. */
export const AI_PICTURES_MAX_COUNT = 4;

/** The longest description sent (characters). */
export const AI_PICTURES_PROMPT_MAX = 1000;

/** The longest key accepted (characters). */
export const AI_PICTURES_KEY_MAX = 512;

/** The largest picture a service may send back (bytes, each). */
export const AI_PICTURES_IMAGE_MAX_BYTES = 16 * 1024 * 1024;

/** Whether a key is set for one service. */
export interface AiPictureKeyState {
  set: boolean;
  /** The key's last four characters, or `null` when none is stored. */
  tail: string | null;
}

/** What the renderer may know about AI pictures. */
export interface AiPicturesStatus {
  /** The chosen service. */
  service: AiPictureServiceId;
  keys: Record<AiPictureServiceId, AiPictureKeyState>;
  /** Whether `safeStorage` can encrypt on this system; saving a key needs it. */
  encryptionAvailable: boolean;
}

/** RGB pixels without transparency (`width` × `height` × 3 bytes). */
export interface AiPictureRaster {
  width: number;
  height: number;
  rgb: Uint8Array;
}

/** The largest edge of a reference or palette picture the renderer may send. */
export const AI_PICTURES_REFERENCE_MAX_EDGE = 64;

/** One request for pictures. */
export interface AiPictureRequest {
  /** Chosen by the renderer, so it can cancel the request. */
  requestId: string;
  /** The description; the only text sent to the service besides the style. */
  prompt: string;
  style: AiPictureStyle;
  /** The texture's edge in pixels (16 or 32); the service draws at its own nearest size. */
  size: number;
  /**
   * The picture's width and height when it is not a square of `size` (a painting of 32 by 16,
   * a banner motif of 20 by 40). Absent: `size` by `size`.
   */
  width?: number | undefined;
  height?: number | undefined;
  /** How many pictures, 1 to {@link AI_PICTURES_MAX_COUNT}. */
  count: number;
  /** Ask for a transparent background (items and tools). */
  transparent: boolean;
  /**
   * MSM's own drawing of the same thing (the art generator's recipe for the slot, in the asked
   * colour, flattened on white), made on this computer: Retro Diffusion's `input_image`, so the
   * shape comes from MSM and only the look from the service. Never a project file.
   */
  reference?: AiPictureRaster | undefined;
  /** How much the service may change `reference`, 0 to 1 (Retro Diffusion: low is subtle). */
  strength?: number | undefined;
  /** The colours the picture may use (Retro Diffusion's `input_palette`): one pixel each. */
  palette?: AiPictureRaster | undefined;
  /** The same seed for every piece of a set, so they match. */
  seed?: number | undefined;
}

/** Why a request failed, in a word the UI can act on. */
export type AiPictureErrorClass =
  | 'no_key'
  | 'bad_key'
  | 'quota'
  | 'rate_limit'
  | 'refused'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'server'
  | 'bad_response';

/** The result of a request or key test. */
export type AiPictureResult =
  | { ok: true; images: Uint8Array[] }
  | { ok: false; error: string; errorClass: AiPictureErrorClass };

/** The outcome of "Test key". */
export type AiPictureKeyTest =
  | { ok: true }
  | { ok: false; error: string; errorClass: AiPictureErrorClass };

/** What a request asks a price for: the request without its id. */
export type AiPictureCostRequest = Omit<AiPictureRequest, 'requestId'>;

/**
 * The price of a request before it is sent (Retro Diffusion's free `check_cost` dry run).
 * `usd` is `null` when the service publishes no price a picture (OpenAI bills by tokens).
 */
export type AiPictureCost =
  | { ok: true; usd: number | null; balanceUsd: number | null }
  | { ok: false; error: string; errorClass: AiPictureErrorClass };

/** AI pictures in main, as the renderer reaches them. */
export interface AiPicturesPlatform {
  status(): Promise<AiPicturesStatus>;
  /** Chooses the service (not a secret: stored in `<msmHome>/ai-pictures.json`). */
  setService(service: AiPictureServiceId): Promise<void>;
  /** Encrypts and stores the key of `service`. Rejects when encryption is unavailable. */
  setKey(service: AiPictureServiceId, key: string): Promise<void>;
  clearKey(service: AiPictureServiceId): Promise<void>;
  /** One free request with the stored key (no picture is made). */
  testKey(service: AiPictureServiceId): Promise<AiPictureKeyTest>;
  /** Makes pictures with the chosen service. Never rejects for service errors. */
  generate(request: AiPictureRequest): Promise<AiPictureResult>;
  /**
   * The price of a request, asked without making a picture (free). Shown before every request.
   * Optional so that renderer test fakes may leave it out; the preload always provides it.
   */
  cost?(request: AiPictureCostRequest): Promise<AiPictureCost>;
  /** Cancels a running request; it resolves with `cancelled`. Unknown ids are ignored. */
  cancel(requestId: string): Promise<void>;
}
