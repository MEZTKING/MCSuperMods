# ADR 0054: More Picture to texture options, a picture tray and drag and drop textures

## Context

The user finds Picture to texture (ADR 0048) the best way to make textures and asked for more control, and for the easiest possible way to switch between textures when they have several pictures: "a click drag and drop system, easy to use as possible".

## Decision

- **D1 Options.** Picture to texture gains, under "More options": turn left and right and mirror (horizontal, vertical); **Fill the texture** (the crop keeps the texture's proportions, as before) or **Fit the whole part** (a free crop fitted whole with transparency around it); brightness, contrast, colourfulness and hue; an outline (none, dark like vanilla items, or a picked colour). Pure steps in `image-convert.ts` (`transformImage`, `fitInside`, `adjustColours`, `addOutline`), run after cropping and the background cut, the colour steps after scaling.
- **D2 Tray.** Several pictures (paste, drop or choose more than one) line up in a tray; a click switches the source picture, and its file name becomes the texture name until the user types one; × removes a picture (at most 24 kept).
- **D3 Drag a texture onto an element.** Texture asset rows are draggable (`application/x-msm-texture`, `<ns>:<path>`). Dropping one on an element row in the sidebar or on the live preview makes the element draw with it: a model element changes itself; an `msm:item` or `msm:block` follows its `model` to the project's model element (a vanilla model is refused with a message). The slot is `layer0`, else `all`, else the model's first texture, else a new `layer0`. One `setElementData` command: one Undo.
- **D4 Drop files on the window.** Picture files dropped anywhere in the window (and not taken by a drop target inside it) open Picture to texture with them in the tray.

## Consequences

- Swapping a texture is one drag; trying several pictures for one texture is one click each.
- Models with several texture slots (for example a block with top and side) change only the slot above; other slots stay editable in the form.

## Status

Accepted (2026-11-08) on the user's request.
