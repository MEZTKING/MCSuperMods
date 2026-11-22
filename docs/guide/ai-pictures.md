# AI pictures

**AI pictures** make textures from a description. You type what you want ("a ruby pickaxe"), an image service draws four pictures, and MCSuperMods cleans each one up into a Minecraft-style texture: 16 by 16 (or 32 by 32), a few shades a colour, a clear background and a dark outline for items. You pick the one you like.

AI pictures are optional and use your own account with an image service. Without a key, MCSuperMods works exactly as before.

## Choose a service and get a key

MCSuperMods can use two services. You need an account and a key with the one you choose; the service bills you for each picture. MCSuperMods adds no charge of its own.

- **Retro Diffusion (pixel art)**, the default. A pixel-art service with Minecraft styles for block textures and items. Sign up at <https://www.retrodiffusion.ai/>, buy some credit, and create an API key (it starts with `rdpk-`). At the time of writing a picture costs about $0.06, so one **Make 4** costs about $0.24.
- **OpenAI images**. A general image model. Its pictures come out large and smooth, so MCSuperMods' clean-up does more of the work. Create a key at <https://platform.openai.com/api-keys> (it starts with `sk-`) and add credit to the account. OpenAI bills pictures by size and quality; MCSuperMods asks for its cheapest quality.

Prices change: check the service's own page.

## Settings: AI pictures

Open **Settings** (the gear icon on the toolbar) and scroll to **AI pictures**.

- **Image service**: Retro Diffusion or OpenAI. Each keeps its own key.
- The key status reads **No key** or **Key set (…abcd)** with the last four characters of the stored key.
- Paste the key, then **Save key**. The field empties after saving; the key is stored encrypted on this computer and never shown again.
- **Test key** checks the key without making a picture and shows **The key works.** or why it failed.
- **Clear key** deletes the stored key.

## What is sent

Only the description you type (and the style you pick) goes to the service, with your key. Your project files, textures and other pictures are never sent. The key stays in MCSuperMods' main process, the part that talks to the service, and is never given to the window you work in.

## Make with AI

**Make with AI** appears next to pictures:

- the **Block Studio**: a row for each texture of the block's model, and a button by each texture slot of a typed block (stairs, a pillar, a crop and so on). An empty slot gets a new texture, and the slot names it;
- the **Item Studio**: the textures of the item's model;
- the **Particle Studio**: each frame;
- the **Creator**: the picture fields (not mob skins);
- the **texture painter**.

**Draw…** sits beside it on the same fields and makes a picture in a Minecraft-like style without a key ([Drawing pictures](pictures.md)).

Without a key the button reads **Set up AI pictures in Settings** and opens Settings. In Very easy mode it reads **Make it with AI**.

The window that opens has:

- **Description**: filled in from the thing's name, for example "a ruby ore". Change it as you like; describe the thing, not the style.
- The style: **Minecraft block texture**, **Item icon** or **Tool** (tools are drawn diagonally, handle at the bottom left).
- **Size**: 16 × 16 or 32 × 32.
- **Make 4** asks for four pictures. It can take up to a minute; **Cancel** stops it.

Each picture shows twice: on the left as the service drew it, on the right cleaned up for Minecraft. Click one, then **Use this picture**. It is written as one step: **Undo** puts the old picture back (or removes a new one). In the texture painter the picture replaces the canvas; paint over it if you like, then **Save**.

## How the clean-up works

- For items and tools, the background goes, the picture is cropped to the thing and fitted into the texture without stretching it.
- For blocks, the middle square of the picture is used, edge to edge.
- Scaling down keeps each pixel's own colour: an area's average, or its commonest colour for pictures that are already pixel art. It never blurs.
- Colours become a few shades a colour (six by default), darker shades a little bluer and lighter ones a little yellower, as vanilla's textures are. A darker part never becomes lighter than a lighter one, so the light stays where the picture had it (the descriptions ask for light from the top left).
- Items and tools get a one-pixel dark outline.

## Use AI pictures in the Creator and Surprise me

With a key set, the Creator and **Surprise me** show a **Use AI pictures** switch. It is off by default. When it is on, nothing is sent until **Create** or **Make it**; then each new block and item texture is made with one request, and the progress shows "Making AI pictures: 2 of 5". **Stop** ends it; the rest keep the built-in pictures. A picture that fails also keeps the built-in one, and the message afterwards says how many were made and why any were not. It is still one step for **Undo**.

## When something goes wrong

- **The service did not accept the key**: check it in Settings, then **Test key**.
- **The account has run out of credit or quota**: top it up on the service's website.
- **The service is getting too many requests**: wait a minute.
- **The service declined this description**: describe it another way.
- **The service could not be reached** or **took too long to answer**: check the internet connection and try again.

## Limits

- Mob skins are not made with AI: their 64 by 64 layout is not one picture.
- The AI helper cannot make pictures yet.
- The clean-up is automatic; for fine control use [Picture to texture](creator.md#picture-to-texture) or paint over the result.
