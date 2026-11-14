// Script API 1.4 members (ADR 0082 D5) that Rules use, declared for the type-check test until
// B370 adds them to `packages/plugins/scripting/api/msm-runtime.d.ts`. `typecheck.test.ts` reads
// this file only while the real typings lack `dayTime`; B368 deletes it once B370 is merged.
interface World {
  /** Whether it is raining (or thundering) in this world. */
  readonly isRaining: boolean;
  /** Whether it is thundering in this world. */
  readonly isThundering: boolean;
  /** The time of day in ticks, 0 to 23999. */
  readonly dayTime: number;
  /** Sets the weather, for `seconds` or for as long as the game picks. */
  setWeather(kind: "clear" | "rain" | "thunder", seconds?: number): void;
  /** Makes an explosion of `power` 0 to 10. */
  explode(pos: Pos, power: number, options?: { fire?: boolean; breaksBlocks?: boolean }): void;
  /** Drops an item stack on the ground. */
  dropItem(pos: Pos, item: ItemSpec): void;
}
