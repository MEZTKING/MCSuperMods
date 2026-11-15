# hud-layout: the cross-language HUD layout golden

Shared golden of [ADR 0089](../../docs/adr/0089-hud-elements.md) D4 (brief B416): the runtime's pure `HudLayout` (`engine-mod/src/main/java/dev/mcsupermods/runtime/client/hud/HudLayout.java`), which places every `msm:hud` element and the vehicle dashboard in game, and the app's two HTML twins must put the same element in the same place: the HUD Studio's layout preview (brief B420, ADR 0089 D9) and the HUD layer over Try it's view (brief B429, ADR 0091 D6). It also pins how a bar fills, how a row of icons is drawn and how a number is written as text. Nothing here knows the font: a text element's width is an input (the runtime measures it with Minecraft's font; the app uses its own measure, so its text boxes may be a few pixels off, which this file does not check).

## The rules

Written from ADR 0089 D4, never from vanilla's `Gui` class. Everything is in GUI pixels (the window's pixels over the GUI scale) with x to the right and y downwards from the top left corner.

- **GUI size.** The GUI's scaled width and height are the window's width and height divided by the GUI scale, rounded up (`ceil(window / scale)`); the client GameTest checks that the game reports the same. The HUD Studio previews scales 2, 3 and 4.
- **Constants** (`constants`): `margin` 2 (from a screen edge to an edge anchor's stack), `gap` 2 (between two elements of one stack), `above_hotbar` 52 (the bottom of the `above_hotbar` stack sits this far above the screen's bottom edge, above vanilla's hotbar, hearts, food and armour rows), `text_height` 9 (a line of text), `icon_size` 9 and `icon_step` 8 (icons overlap by one pixel, as hearts do), `max_icons` 20, `decimals` 2.
- **The anchor table** (`anchors`): each anchor's `horizontal` (`left`, `centre`, `right`) and `vertical` (`top`, `middle`, `bottom`, `above_hotbar`) rule:

  | anchor | horizontal | vertical |
  |---|---|---|
  | `top_left`, `top`, `top_right` | left, centre, right | top |
  | `left`, `center`, `right` | left, centre, right | middle |
  | `bottom_left`, `bottom`, `bottom_right` | left, centre, right | bottom |
  | `above_hotbar` (the default) | centre | above_hotbar |

- **Stacks.** Each anchor holds a stack of the elements that are drawn this frame (hidden ones take no room), sorted by `order` (lower first) and then by id as a string (`namespace:path`, compared character by character).
- **Horizontal**, element by element: `left` x = `margin`; `centre` x = `floor((width - w) / 2)`; `right` x = `width - margin - w`.
- **Vertical**: `top` stacks start at y = `margin` and grow down (each next element at the previous y + its height + `gap`); `bottom` stacks end at `height - margin` (the first element's bottom edge) and grow up (each next element's bottom edge is the previous element's top - `gap`); `above_hotbar` stacks do the same from `height - above_hotbar`; the `middle` row is centred as a whole: total = the heights plus `gap` between each two, the first element at y = `floor((height - total) / 2)`, growing down.
- **Offsets** come last: each element moves by its own `offset` `[x, y]`; an offset never moves the others in its stack.
- **Sizes**: a text is its font width by `text_height`; a bar is its `size` (default 81 by 5); a row of icons is `icon_step × (count - 1) + icon_size` wide (0 for no icons) by `icon_size` high.
- **The vehicle dashboard** (ADR 0089 D5) takes part as rows `msm_runtime:dashboard/<n>` in the `bottom_right` stack with `order` -2147483648 + n, so they sit at the bottom right below any project element there; row 0 is the lowest (the last weapon), the top row is health. Each row is a label and a 50 by 5 bar, `text_height` high. The two dashboard rows in `elements` stand in for them.
- **Bar fill** (`bar_fill`): `filled = round(width × clamp(value / max, 0, 1))`, rounding halves up; 0 when `max` is 0 or less. The bar's back (colour or `back_sprite`) is drawn at full width, then the fill (colour, or the left `filled` pixels of `sprite` laid out at the bar's full size).
- **Icons** (`icons`): `count = min(max_icons, ceil(max / per_icon))` (0 when `max` or `per_icon` is 0 or less); `halves = clamp(floor(value × 2 / per_icon), 0, 2 × count)`; `full = floor(halves / 2)`; `half` is 1 when `halves` is odd and the element has a `half_icon` (else 0: the half rounds down); `empty = count - full - half` when the element has an `empty_icon` (else 0). Drawn left to right: full icons, the half icon, then the empty ones, `icon_step` apart. A small amount (1e-9) is allowed against floating-point error in `ceil` and `floor`.
- **Numbers as text** (`numbers`): rounded half away from zero from the number's exact binary value to at most two decimals, trailing zeros dropped, never in exponent form; a result of zero is `0` (no `-0`). This is JavaScript's `Number(value.toFixed(2)).toString()` for every case in the file. A text template replaces `{value}` and `{max}` with this text (a text value is shown as it is; no value shows as nothing).

## The file

`golden.json`: `format` 1. Inputs: `elements` (19 boxes: `id`, `anchor`, `order`, `size` `[w, h]`, optional `offset` `[x, y]`; every anchor has at least one, several stack, two tie on `order`), `screens` (10: `window` `[w, h]` in pixels and `scale`), the `bar_fill` cases (`value`, `max`, `width`), the `icons` cases (`value`, `max`, `per_icon`, `has_half`, `has_empty`) and the `numbers` cases (`value`). Outputs, rewritten by the writer: `constants`, `anchors`, each screen's `gui` `[w, h]` and `positions` (`id` to `[x, y]`, the top left corner), each bar case's `filled`, each icon case's `count`, `width`, `full`, `half`, `empty`, and each number's `text`. Keys are sorted; every value is an integer except the inputs `value`, `max` and `per_icon`.

## Who writes and checks it

- **Runtime (the writer):** `engine-mod/src/test/java/dev/mcsupermods/runtime/client/hud/HudLayoutGoldenTest.java` recomputes every output from the inputs and fails when the file differs. After changing a rule on purpose: `cd engine-mod && UPDATE_GOLDENS=1 ./gradlew --no-daemon test --tests '*HudLayoutGoldenTest'` (JDK 25). To add a case, add its inputs and run the writer.
- **App (readers):** the HUD Studio's layout preview (B420) and Try it's HUD layer (B429) read this file in their unit tests and must give the same `gui`, `positions`, `filled`, icon counts and texts. They never write it.
