/**
 * The Game and map Studio's catalogue (ADR 0132; plan section 12, "The catalogue"): the game
 * types as cards with their kind, players and whether they play without mods, then "More to
 * start from". B721 stub: the heading and the sentence; B731 fills it.
 *
 * @packageDocumentation
 */

/** The catalogue; until B731, its heading and sentence. */
export function Catalogue() {
  return (
    <section className="flex flex-col gap-2" data-testid="game-hub-catalogue">
      <h2 className="text-lg font-semibold">Pick a game type</h2>
      <p className="text-sm">
        Each starts as a working game you can play in Try it at once, then change: teams, timers,
        kits, arenas, rules and the map. All of it is your own copy.
      </p>
    </section>
  );
}
