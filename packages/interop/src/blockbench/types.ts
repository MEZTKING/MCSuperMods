/**
 * Output types of the Blockbench converter: the Bedrock geometry (1.12.0) and animation (1.8.0)
 * JSON that GeckoLib reads (ADR 0029 D2, D3), shaped like the MSM `msm:geo_model` and
 * `msm:animation` schemas in `@msm/schemas`.
 */
import type { Problem } from '@msm/plugin-api';

/** Element kind of an imported geometry (ADR 0029 D2). */
export const GEO_MODEL_KIND = 'msm:geo_model';
/** Element kind of an imported animation set (ADR 0029 D2). */
export const ANIMATION_KIND = 'msm:animation';

/** Geometry format version the converter writes (Blockbench's Bedrock default). */
export const GEO_FORMAT_VERSION = '1.12.0';
/** Animation format version the converter writes (Blockbench's Bedrock animation export). */
export const ANIMATION_FORMAT_VERSION = '1.8.0';

/** `[x, y, z]`. */
export type Vec3 = [number, number, number];

/** UV of one cube face. */
export interface GeoFaceUv {
  uv: [number, number];
  uv_size?: [number, number];
  uv_rotation?: number;
}

/** Per-face UVs, keyed by face name. */
export type GeoFaceUvs = Partial<
  Record<'north' | 'east' | 'south' | 'west' | 'up' | 'down', GeoFaceUv>
>;

/** A cube of a bone. */
export interface GeoCube {
  origin: Vec3;
  size: Vec3;
  inflate?: number;
  pivot?: Vec3;
  rotation?: Vec3;
  mirror?: boolean;
  uv: [number, number] | GeoFaceUvs;
}

/** A bone. */
export interface GeoBone {
  name: string;
  parent?: string;
  pivot: Vec3;
  rotation?: Vec3;
  mirror?: boolean;
  reset?: boolean;
  cubes?: GeoCube[];
}

/** A Bedrock geometry file. */
export interface GeoFile {
  format_version: string;
  'minecraft:geometry': {
    description: {
      identifier: string;
      texture_width: number;
      texture_height: number;
      visible_bounds_width?: number;
      visible_bounds_height?: number;
      visible_bounds_offset?: Vec3;
    };
    bones?: GeoBone[];
  }[];
}

/** One axis value of a keyframe: a number or a Molang string. */
export type AxisValue = number | string;
/** A keyframe value `[x, y, z]`. */
export type KeyframeVec = [AxisValue, AxisValue, AxisValue];

/** A keyframe with separate values before and after its time. */
export interface KeyframeObject {
  pre?: KeyframeVec;
  post?: KeyframeVec;
  lerp_mode?: 'linear' | 'catmullrom';
}

/** Keyframes of one channel, keyed by a timecode such as `"0.5"`. */
export type ChannelKeyframes = Record<string, KeyframeVec | KeyframeObject>;

/** The channels of one bone. */
export interface BoneAnimation {
  rotation?: ChannelKeyframes;
  position?: ChannelKeyframes;
  scale?: ChannelKeyframes;
}

/** One animation. */
export interface AnimationEntry {
  loop?: true | 'hold_on_last_frame';
  animation_length?: number;
  override_previous_animation?: boolean;
  anim_time_update?: string;
  blend_weight?: number | string;
  start_delay?: number | string;
  loop_delay?: number | string;
  bones: Record<string, BoneAnimation>;
}

/** A Bedrock animation file. */
export interface AnimationFile {
  format_version: string;
  animations: Record<string, AnimationEntry>;
}

/** A texture taken from a `.bbmodel`. */
export interface BbmodelTexture {
  /** Index in the `.bbmodel` `textures` array. */
  index: number;
  /** The texture's name in Blockbench, for example `two_bones.png`. */
  name: string;
  /** PNG bytes decoded from the embedded data URL. */
  bytes: Uint8Array;
  /** Image width in pixels, from the PNG header. */
  width: number;
  /** Image height in pixels, from the PNG header. */
  height: number;
}

/** Options for {@link convertBbmodel}. */
export interface ConvertBbmodelOptions {
  /**
   * The model name: the geometry identifier becomes `geometry.<name>`. Defaults to the file's
   * `model_identifier`, then its `name`, then `model`; lower-cased and cleaned.
   */
  name?: string;
}

/** What {@link convertBbmodel} produced. */
export interface BbmodelConversion {
  /** The model name used for the geometry identifier. */
  name: string;
  /** The geometry; absent when the file could not be converted (for example a Java block). */
  geometry?: GeoFile;
  /** The animations; absent when the file has none. */
  animations?: AnimationFile;
  /** Embedded PNG textures, in file order. */
  textures: BbmodelTexture[];
  /** Everything that could not be converted faithfully (`blockbench.*`). */
  problems: Problem[];
}
