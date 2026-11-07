# ADR 0048: Pictures, screenshots and skins

## Context

On 2026-11-07 the user asked for "a system that a user can take a screenshot and turn it into a working file, or also able to import textures like skins". Until now a texture could only be imported as a PNG of exactly the right size, painted in the pixel editor ([ADR 0047](0047-easy-and-advanced-mode.md) D5) or picked in the Painting flow. Screenshots are large, have a background and come from the clipboard; player skins come in the 64 by 64 layout or the legacy 64 by 32 one. The Custom mob's biped geo model already uses the player skin layout (head at 0,0, body at 16,16, right arm at 40,16, left arm at 32,48, legs at 0,16 and 16,48). The AI helper sends text only.

## Decision

- **D1 Picture to texture.** **File → Picture to Texture…**, the palette and the picture button on a namespace's asset heading open a dialog that takes a picture from the clipboard (Ctrl+V), a drop or the file picker (PNG, JPEG, GIF, BMP, WebP; up to 32 MB, decoded at most 2048 pixels on the longest edge). The user picks what the texture is for (item or block 16 by 16, armour layers 64 by 32, mob skin 64 by 64, paintings from 1 by 1 to 4 by 4 blocks), drags a crop that keeps the target's proportions, and chooses smooth (area average) or sharp (nearest) scaling, an optional transparent background (border-connected pixels near the corners' colour, with a tolerance) and an optional colour limit (median cut). Alpha is hardened to 0 or 255. **Add texture** records the PNG as a project asset in one undo step (an `asset` changeset item); **Touch up in the painter…** opens the pixel editor on it first. The conversion is pure (`components/texture-editor/image-convert.ts`); decoding and encoding use a canvas in the renderer.
- **D2 Skins.** A 64 by 32 picture for the mob skin kind is converted to 64 by 64 as the game converts legacy skins: the left arm and left leg are the right ones mirrored, face by face. The Custom mob starter and Creator flow get a **Skin** image field (a PNG of 64 by 64 or 64 by 32, at most 256 KB) and an **Arms** choice (classic or slim). With a 64 by 64 skin the model gains the second layer (hat, jacket, sleeves, trousers) as inflated cubes; with a 64 by 32 skin the model uses `texture_height` 32 and mirrored left limbs, which GeckoLib draws as the old game did; slim arms are 3 pixels wide. Without a skin, the bundle is unchanged byte for byte. The plugin does not decode PNGs (it reads only the size from IHDR), so no conversion runs in the plugin.
- **D3 Screenshots for the AI helper.** `AiStartRequest.images` (protocol of `@msm/ai`) carries up to four pictures (PNG, JPEG, GIF, WebP; base64 up to 5 MB each, the API limit, verify at implementation) that the loop sends as image blocks before the context and the text. The AI panel accepts pasted, dropped and attached pictures, shows thumbnails in the draft and in the transcript, and sends a default question when the text is empty. **New project with the AI helper…** accepts screenshots too. The renderer scales pictures to at most 1568 pixels on the longest edge and falls back to JPEG when a PNG is too large. The guide's "What is sent" names pictures.

## Consequences

- A screenshot of an item, a block or a painting becomes a working texture in a few clicks, and a player skin becomes a mob in the Creator without other tools.
- Pictures sent to the AI helper leave the computer, like messages; they stay in the conversation's memory and are sent again with later messages of the same conversation.
- The library's Custom mob parameters grow by two; defaults and goldens are unchanged.

## Status

Accepted (2026-11-07) by the user's request; for app 1.2.0.
