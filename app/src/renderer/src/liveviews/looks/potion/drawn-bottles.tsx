/**
 * MSM's own drawn bottles and arrow (B625), used when the Minecraft folder is not set up: 16 by
 * 16 pixel maps drawn by MSM (never traced from the game's pictures). `#` is the glass or
 * shaft outline, `+` the glass or fletching, `o` the liquid or arrow head, which takes the
 * potion's colour.
 */

/** The four things a potion makes. */
export type PotionThing = 'potion' | 'splash_potion' | 'lingering_potion' | 'tipped_arrow';

const MAPS: Readonly<Record<PotionThing, readonly string[]>> = {
  potion: [
    '................',
    '......####......',
    '......#++#......',
    '.......##.......',
    '......#..#......',
    '......#..#......',
    '.....#....#.....',
    '....#.oooo.#....',
    '...#.oooooo.#...',
    '...#.oooooo.#...',
    '...#.oooooo.#...',
    '...#.oooooo.#...',
    '....#.oooo.#....',
    '.....######.....',
    '................',
    '................',
  ],
  splash_potion: [
    '................',
    '.......##.......',
    '......#++#......',
    '.......##.......',
    '......#..#......',
    '.....#....#.....',
    '....#.oooo.#....',
    '...#.oooooo.#...',
    '..#.oooooooo.#..',
    '..#.oooooooo.#..',
    '..#.oooooooo.#..',
    '...#.oooooo.#...',
    '....########....',
    '................',
    '................',
    '................',
  ],
  lingering_potion: [
    '................',
    '......####......',
    '......#++#......',
    '.......##.......',
    '......#..#......',
    '......#..#......',
    '......#..#......',
    '.....#.oo.#.....',
    '....#.oooo.#....',
    '....#.oooo.#....',
    '....#.oooo.#....',
    '....#.oooo.#....',
    '....#.oooo.#....',
    '.....######.....',
    '................',
    '................',
  ],
  tipped_arrow: [
    '................',
    '...........ooo..',
    '..........oooo..',
    '.........#ooo...',
    '........#.o.....',
    '.......#........',
    '......#.........',
    '.....#..........',
    '....#...........',
    '...#............',
    '.+#.............',
    '.++.............',
    '+.++............',
    '................',
    '................',
    '................',
  ],
};

const OUTLINE = '#2b2b2b';
const GLASS = '#c8d8e8';

/** MSM's drawing of `thing` with its liquid (or head) in `colour`. */
export function DrawnPotionThing(props: {
  thing: PotionThing;
  colour: string;
  size: number;
  label: string;
}) {
  const rects: { x: number; y: number; fill: string }[] = [];
  MAPS[props.thing].forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const cell = row[x];
      if (cell === '#') rects.push({ x, y, fill: OUTLINE });
      else if (cell === '+') rects.push({ x, y, fill: GLASS });
      else if (cell === 'o') rects.push({ x, y, fill: props.colour });
    }
  });
  return (
    <svg
      role="img"
      aria-label={props.label}
      width={props.size}
      height={props.size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      data-drawn="msm"
    >
      {rects.map((rect) => (
        <rect
          key={`${rect.x},${rect.y}`}
          x={rect.x}
          y={rect.y}
          width={1}
          height={1}
          fill={rect.fill}
        />
      ))}
    </svg>
  );
}
