/**
 * The interface of the structure assembler and the processors (ADR 0122 D2 to D6; spike B634,
 * `docs/reference/spikes/b634/README.md`, rules J1 to J20). B635 made the types; B637 fills
 * `assemble.ts` and B638 `processors.ts`. A change to these types is reported to the orchestrator,
 * not made. Pure: no DOM, no Node APIs; the same files and seed give the same assembly.
 *
 * The assembler is a generator of {@link AssemblyStep}s (D5): a piece tried, placed, or refused with
 * its reason. The views draw the steps as they arrive.
 */

/** A turn about the vertical axis, clockwise seen from above, in quarter turns. */
export type PieceRotation = 'none' | 'clockwise_90' | 'clockwise_180' | 'counterclockwise_90';

/** An axis-aligned box of whole blocks, both corners inclusive, in the assembly's own coordinates. */
export interface PieceBox {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/** Which side a jigsaw faces and which way its top points (a vertical jigsaw's `orientation`). */
export type JigsawOrientation =
  | 'down_east'
  | 'down_north'
  | 'down_south'
  | 'down_west'
  | 'up_east'
  | 'up_north'
  | 'up_south'
  | 'up_west'
  | 'west_up'
  | 'east_up'
  | 'north_up'
  | 'south_up';

/** One jigsaw block of a template (the fields of the block's entity). */
export interface JigsawBlock {
  /** The block's place in the template, before any turn. */
  readonly pos: readonly [number, number, number];
  readonly orientation: JigsawOrientation;
  readonly name: string;
  readonly target: string;
  readonly pool: string;
  /** `rollable` or `aligned` (J4: the parent's joint decides). */
  readonly joint: 'rollable' | 'aligned';
  readonly finalState: string;
  readonly selectionPriority: number;
  readonly placementPriority: number;
}

/** A parsed template (`.nbt` structure file): its size, blocks and jigsaws. Parsed once per pool (B637). */
export interface PieceTemplate {
  /** The template's id, as `minecraft:village/plains/houses/plains_small_house_1`. */
  readonly id: string;
  readonly size: readonly [number, number, number];
  readonly jigsaws: readonly JigsawBlock[];
  /** Blocks as palette indexes and positions; `null` for a labelled box (D7: the jar is missing). */
  readonly blocks: readonly TemplateBlock[] | null;
  readonly palette: readonly string[];
}

/** One block of a template. */
export interface TemplateBlock {
  readonly pos: readonly [number, number, number];
  /** Index into the template's palette (a block state string such as `minecraft:stone[...]`). */
  readonly state: number;
  /** The block entity data, where the block has any (only listed, never placed: 4L7). */
  readonly nbt?: unknown;
}

/** How a piece follows the ground (J19; on a flat floor `terrain_matching` equals `rigid`, 4L5). */
export type Projection = 'rigid' | 'terrain_matching';

/** The pool element types the assembler knows (the target's registry lists the rest). */
export type PoolElementType =
  | 'minecraft:single_pool_element'
  | 'minecraft:legacy_single_pool_element'
  | 'minecraft:list_pool_element'
  | 'minecraft:feature_pool_element'
  | 'minecraft:empty_pool_element';

/** One element of a pool as the data names it, with its weight (J6, J7). */
export interface PoolElementData {
  readonly weight: number;
  readonly type: PoolElementType | string;
  /** The template id, for a single element. */
  readonly location?: string;
  /** The processor list id, or the inline list. */
  readonly processors?: unknown;
  readonly projection: Projection;
  /**
   * Read by the newer target only (spike B634: not measured). Named, never applied; the target's
   * fact will say whether it exists (`packages/targets`, later).
   */
  readonly cornerConstraint?: unknown;
}

/** A template pool as the data names it. */
export interface PoolData {
  readonly id: string;
  /** The pool tried when no element fits (J8); `minecraft:empty` for none. */
  readonly fallback: string;
  readonly elements: readonly PoolElementData[];
}

/** The numbers of a jigsaw structure's own data that the assembler reads (J11 to J16). */
export interface JigsawStructureData {
  readonly startPool: string;
  /** Depth, 0 to 20 (0 makes no structure, J11). */
  readonly size: number;
  /** The start jigsaw's `name`, when the structure names one (J16). */
  readonly startJigsawName?: string;
  /** Start height, as the data's height provider names it (J16). */
  readonly startHeight: unknown;
  /** Horizontal and vertical distance limits (J12, J13). */
  readonly maxDistanceFromCenter:
    | number
    | { readonly horizontal: number; readonly vertical?: number };
  readonly useExpansionHack: boolean;
  readonly terrainAdaptation: 'none' | 'beard_thin' | 'beard_box' | 'bury' | 'encapsulate';
}

/**
 * One template of a list element's piece (J18; B712): every member stands at the piece's origin and
 * turn. The game's order where members overlap was not measured (the spike's and B639's list
 * element has no shared cell; verify at implementation); the views draw them in this order, later
 * members over earlier.
 */
export interface PieceMember {
  /** The template id. */
  readonly template: string;
  /** The processor list that applies to this member, by id, or `null`. */
  readonly processors: string | null;
  /** Where this member's template was read from, as {@link AssembledPiece.source}. */
  readonly source: 'project' | 'vanilla' | 'box';
  /**
   * The member's own box where it stands (a part of the piece's box); with the piece's rotation
   * and the template's size it gives the member's origin (`pieceOrigin({ box, rotation }, size)`).
   */
  readonly box: PieceBox;
}

/** One placed piece. */
export interface AssembledPiece {
  /** The piece's number in placing order; the start piece is 0. */
  readonly index: number;
  /** The piece it joined to, or `null` for the start piece. */
  readonly parent: number | null;
  /** Depth: 0 for the start piece, then 1 to `size + 1` (J11). */
  readonly depth: number;
  /** The template id; `null` for a feature or empty element. */
  readonly template: string | null;
  /** The pool it was drawn from. */
  readonly pool: string;
  readonly box: PieceBox;
  readonly rotation: PieceRotation;
  /** The jigsaw of the parent and of this piece that met (an index into each template's list). */
  readonly joinedBy: { readonly parentJigsaw: number; readonly jigsaw: number } | null;
  /** The processor list that applies to it, by id, or `null`. */
  readonly processors: string | null;
  readonly projection: Projection;
  /** Whether the template was read from the jar, the project, or is a labelled box (D7). */
  readonly source: 'project' | 'vanilla' | 'box';
  /**
   * A list element's templates in the element's order, empty members left out (J18; B712). The
   * first is the one `template`, `processors` and `source` name, and the one that joins and
   * expands. Absent for every other element.
   */
  readonly members?: readonly PieceMember[];
}

/** Why a try did not become a piece (rules J1 to J13). */
export type RefusalReason =
  | 'no_matching_jigsaw'
  | 'overlaps_a_piece'
  | 'too_far_from_start'
  | 'too_high_or_low'
  | 'past_depth_limit'
  | 'template_missing'
  | 'pool_missing'
  | 'pool_empty'
  | 'unsupported_element';

/** One step of an assembly (D5). */
export type AssemblyStep =
  | {
      readonly kind: 'tried';
      readonly pool: string;
      readonly template: string | null;
      readonly parent: number;
      readonly parentJigsaw: number;
    }
  | { readonly kind: 'placed'; readonly piece: AssembledPiece }
  | {
      readonly kind: 'refused';
      readonly pool: string;
      readonly template: string | null;
      readonly parent: number;
      readonly parentJigsaw: number;
      readonly reason: RefusalReason;
    }
  | { readonly kind: 'stopped'; readonly reason: 'piece_limit' | 'done'; readonly pieces: number };

/** What assembling takes (B637). */
export interface AssemblyInput {
  readonly structure: JigsawStructureData;
  /** Pools by id: the project's laid over vanilla's. */
  readonly pools: (id: string) => PoolData | null;
  /** Templates by id, from the project or the jar; `null` when neither has it (D7). */
  readonly templates: (id: string) => PieceTemplate | null;
  /** The seed of MSM's own picks (4L1): the game's order of draws is its code. */
  readonly seed: bigint;
  /** Where the start chunk's minimum corner is; the view usually uses 0, start height, 0. */
  readonly origin: readonly [number, number, number];
  /** Stops after this many pieces (4L9); 500 unless the user raises it. */
  readonly pieceLimit: number;
}

/** The assembly of one seed, as the views read it. */
export interface Assembly {
  readonly pieces: readonly AssembledPiece[];
  readonly steps: readonly AssemblyStep[];
  readonly stoppedAtLimit: boolean;
}

/** How faithful a processor result is (D4, D6); the three levels of the frame. */
export type ProcessorFidelity = 'exact' | 'about_right' | 'only_in_game';

/** One rule of a processor list and what it did to a template. */
export interface ProcessorRuleResult {
  /** The processor's type id, as `minecraft:rule`. */
  readonly type: string;
  readonly fidelity: ProcessorFidelity;
  /** How many blocks the rule changed; 0 for a rule left out. */
  readonly changed: number;
  /** A sentence when the rule is named only (4L4) or approximate. */
  readonly note?: string;
}

/** A processor list applied to one template (B638). */
export interface ProcessedTemplate {
  readonly template: PieceTemplate;
  /** The blocks after every rule, in the template's own order. */
  readonly after: readonly TemplateBlock[];
  readonly palette: readonly string[];
  readonly rules: readonly ProcessorRuleResult[];
}

/** What the world holds where a template lands, for processors that read it (`location_predicate`, `protected_blocks`, `gravity`). */
export interface ProcessorWorld {
  /** The block state at a position, or `null` for air or unknown. */
  blockAt(x: number, y: number, z: number): string | null;
  /** The surface height at a column, or `null` on a flat floor with none. */
  surfaceAt(x: number, z: number): number | null;
}

/**
 * The target's name for a rule test's registry (spike B634: the newer target renames
 * `rule_test` to `rule_test_type`; the fact belongs to `packages/targets`, later). The slot is typed here so a
 * target fact can fill it without a change of shape.
 */
export interface ProcessorTargetFacts {
  readonly ruleTestRegistry?: 'rule_test' | 'rule_test_type';
  /** Whether the pool element's `corner_constraint` is read (the newer target only; named, not applied). */
  readonly readsCornerConstraint?: boolean;
}

/** What applying a processor list takes (B638). */
export interface ProcessInput {
  readonly template: PieceTemplate;
  /** The list as the data names it (`{ processors: [...] }`) or an id the host resolved. */
  readonly list: unknown;
  readonly rotation: PieceRotation;
  /** The position of the template's origin in the world. */
  readonly origin: readonly [number, number, number];
  readonly seed: bigint;
  readonly world: ProcessorWorld;
  readonly facts?: ProcessorTargetFacts;
}
