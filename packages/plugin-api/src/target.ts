/**
 * The `Target` contract: one Minecraft version's facts.
 *
 * Every version-specific value MSM uses is a field of {@link Target}, and targets are only
 * implemented in `packages/targets`. No other package hard-codes a version number.
 *
 * @packageDocumentation
 */

import type { ResourceLocation } from './json';
import type { Project } from './model';
import type { Problem } from './problems';

/**
 * A pack format number. Minecraft writes it as `major` or `major.minor` in `pack.mcmeta`.
 */
export interface PackFormat {
  /** The major pack format number. */
  major: number;
  /** The minor pack format number; `0` when the version has no minor format. */
  minor: number;
}

/**
 * One change applied to an element by {@link Target.migrateFrom}.
 */
export interface MigrationChange {
  /** The element that was changed. */
  elementId: ResourceLocation;
  /** Human-readable description of the change, in British English. */
  description: string;
}

/**
 * The outcome of migrating a project from one target to another.
 */
export interface MigrationReport {
  /** Every change the migration applied. */
  changes: MigrationChange[];
  /** Anything the migration could not handle automatically and the user must review. */
  problems: Problem[];
}

/**
 * One Minecraft version's facts, contributed by a `@msm/target-mc-<version>` package.
 *
 * This interface is the documented home of every target field.
 */
export interface Target {
  /** Target id: `mc-` followed by the Minecraft version, such as `mc-<version>`. */
  id: string;
  /** The Minecraft version this target describes, as the game names it. */
  mcVersion: string;
  /** The Java feature release the game requires, for example `25`. */
  java: number;
  /** Resource pack and data pack formats written into `pack.mcmeta`. */
  packFormats: {
    /** Resource pack format. */
    resource: PackFormat;
    /** Data pack format. */
    data: PackFormat;
  };
  /** SpyglassMC/vanilla-mcdoc commit sha (40 hex chars). */
  mcdocRef: string;
  /**
   * misode/mcmeta version prefix; refs are `${mcmetaRef}-summary` and
   * `${mcmetaRef}-registries`.
   */
  mcmetaRef: string;
  /** Fabric toolchain versions. Required from Phase 4. */
  fabric?: {
    /** Fabric Loader version. */
    loader: string;
    /** Fabric API version. */
    api: string;
    /** Fabric Loom (Gradle plugin) version. */
    loom: string;
  };
  /** GeckoLib version. Required when a project uses animated entities (Phase 5). */
  geckolib?: string;
  /**
   * Migrates a project written for `previous` so that it is valid for this target.
   *
   * Called when the user moves a project to this target. Omit the hook when no migration is
   * needed.
   *
   * @param previous - The target the project was written for.
   * @param project - The project to migrate.
   * @returns What changed and what needs the user's attention.
   */
  migrateFrom?(previous: Target, project: Project): MigrationReport;
}
