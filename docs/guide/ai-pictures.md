# AI pictures

**AI pictures** make textures from a description. You say what you want ("a sun chestplate"), an image service draws four pictures starting from MCSuperMods' own drawing of that thing, MCSuperMods checks that each one really looks like the thing and is in your colour, and cleans the good ones up into Minecraft-style textures. You pick the one you like, or keep MCSuperMods' drawing.

AI pictures are optional and use your own account with an image service. Without a key, MCSuperMods works exactly as before, and **Draw…** still makes every picture for free.

## Choose a service and get a key

MCSuperMods can use two services. You need an account and a key with the one you choose; the service bills you for each picture. MCSuperMods adds no charge of its own.

- **Retro Diffusion (pixel art)**, the default and the one we recommend. A pixel-art service with Minecraft styles for block textures and items, and it can start from MCSuperMods' own drawing, so shapes come out right.
  1. Go to <https://www.retrodiffusion.ai/> and make an account.
  2. Buy some credit (pay as you go).
  3. Create an API key in your account page; it starts with `rdpk-`. An account can have up to five keys.
  At the time of writing a picture costs $0.06 (RD Plus), so one **Make 4** costs $0.24. Pictures that fail on the service's side are refunded by Retro Diffusion.
- **OpenAI images**. A general image model. Its pictures come out large and smooth, so MCSuperMods' clean-up does more of the work, and it cannot start from MCSuperMods' drawing. Create a key at <https://platform.openai.com/api-keys> (it starts with `sk-`) and add credit. OpenAI bills pictures by image tokens and gives no price in advance.

Prices change: MCSuperMods asks Retro Diffusion for the price of every request before it is sent (a free check) and shows it in the window.

## Settings: AI pictures

Open **Settings** (the gear icon on the toolbar) and scroll to **AI pictures**.

- **Image service**: Retro Diffusion or OpenAI. Each keeps its own key.
- The key status reads **No key** or **Key set (…abcd)** with the last four characters of the stored key.
- Paste the key, then **Save key**. The field empties after saving; the key is stored encrypted on this computer and never shown again.
- **Test key** checks the key without making a picture (Retro Diffusion: your balance, which is free) and shows **The key works.** or why it failed.
- **Clear key** deletes the stored key.

## What is sent

The words shown under the description (**Sent: …**) go to the service with your key, and, for things MCSuperMods can draw itself, MCSuperMods' own drawing of that thing in your colour (made on this computer, never one of your files) and its colours. Your project files, your textures and pictures you painted are never sent. The key stays in MCSuperMods' main process, the part that talks to the service, and is never given to the window you work in.

## Where Make with AI appears

**Make with AI** sits beside **Draw…** wherever MCSuperMods makes a picture:

| Where | What it makes | Retro Diffusion style | Size |
| --- | --- | --- | --- |
| **Block Studio**: each texture of the model and each slot of a typed block | a block face | `mc_texture`, tileable | 16 × 16 or 32 × 32 |
| **Item Studio**: the textures of the item's model | an item or tool icon | `mc_item`, background removed | 16 × 16 or 32 × 32 |
| **Mob Studio**: **Make a skin with AI**, beside **Draw a skin** | a fur, hide or scales tile laid on the model's own boxes, each side shaded | `mc_texture`, tileable | the model's texture size (64 × 64, 64 × 32…) |
| **Villager look Studio**: each picture | clothes laid on the villager's body, robe, arms and legs | `mc_texture`, tileable | 64 × 64 |
| **Particle Studio**: each frame | a small cut-out sprite | `mc_item`, background removed | 8 × 8 |
| **Creator**: every picture field | a block face or item; a skin (on a humanoid); a painting of the size you chose; a particle | as above; paintings RD Plus's default style | as above |
| **New texture…**: **Start from: Made with AI** (with a key) | any kind in the list, paintings too | by the kind | by the kind |
| **Texture painter** | by the texture's folder: paintings, armour layers (64 × 32, laid on the armour or leggings), banner and shield patterns (a pale mask the loom dyes), pot patterns (pressed into fired clay), skins, villager looks, particles, blocks and items | by the kind | the texture's own size |

Without a key the button reads **Set up AI pictures in Settings** and opens Settings. In Very easy mode it reads **Make it with AI**, and **Draw it for me** offers **Make it with AI instead** once a key is set.

## The Make with AI window

- **Description**: filled in from the thing's name, for example "a sun chestplate". Change it as you like.
- **Sent**: the exact words that go to the service. MCSuperMods never sends a bare description: it adds what the thing is (a chestplate, a sword, an ore…), how Minecraft draws it ("front view, a torso piece with two shoulder pads and a round neck opening, same outline as an iron chestplate"), that it is only that thing on a plain background (no creature, no plant, no text), and your colour in words ("golden").
- The style (**Minecraft block texture**, **Item icon**, **Tool**) and **Size** for square textures; skins, paintings, patterns and particles show their fixed size instead.
- **Main colour** and **MSM's drawing**: the shape every picture is checked against, drawn in your colour. In the Creator the colour starts on the colour you gave the thing; elsewhere pick one, and only then are its words, its shades and the colour check used.
- The price: "4 pictures cost $0.24 on your account (balance $9.76)." It is asked again when you change the style or size, before anything is made.
- **Make 4** asks for four pictures; afterwards it reads **Try again**. It can take up to a minute; **Cancel** stops it.
- **Use MSM's drawing** takes MCSuperMods' own drawing instead, for free.

Each picture shows twice: on the left as the service drew it, on the right cleaned up for Minecraft. Click one, then **Use this picture**. It is written as one step: **Undo** puts the old picture back (or removes a new one). In the texture painter the picture replaces the canvas; paint over it if you like, then **Save**.

## How MCSuperMods keeps the pictures right

- **It starts from MCSuperMods' drawing.** Retro Diffusion is sent MCSuperMods' drawing of the same thing (a chestplate's outline in your gold) as the picture to start from, so the shape comes from MCSuperMods and only the look from the service. The palette of the drawing is sent too, so the colours stay yours.
- **Every picture is checked before you see it.** Its outline is compared with the drawing's (a round blob fills a chestplate's neck and the gaps between its arms, and fails), its main colour with your colour, and a block face must tile without a seam.
- **One more try, then MCSuperMods' drawing.** If none of the four passes, MCSuperMods asks once more with stronger words and a closer start (for the same price again, which the window says beforehand). If those fail too, it shows its own drawing with the line "The AI picture did not look like a chestplate, so here is MSM's drawing; try again or edit it." A wrong picture is never placed without telling you.
- **A set is made together.** With **Use AI pictures** in the Creator, all the pictures of one thing you make (a gear set's helmet, chestplate, leggings and boots, a wood set's planks and logs) use one seed and one palette, so they match.

## How the clean-up works

- For items and tools, the background goes, the picture is cropped to the thing and fitted into the texture without stretching it.
- For blocks, the middle square of the picture is used, edge to edge; the window says whether it **Tiles without a seam**.
- Paintings keep their proportions and every pixel; patterns become a pale mask on the banner's front and back, or a motif pressed into the pot's clay; skins and armour lay the tile on every face of the model, the top a shade lighter and the sides and bottom a shade darker.
- Scaling down keeps each pixel's own colour: an area's average, or its commonest colour for pictures that are already pixel art. It never blurs.
- Colours become a few shades a colour (six by default), darker shades a little bluer and lighter ones a little yellower, as vanilla's textures are. A darker part never becomes lighter than a lighter one, and pixels of one colour stay one shade.
- Items and tools get a one-pixel dark outline.

## Use AI pictures in the Creator and Surprise me

With a key set, the Creator and **Surprise me** show a **Use AI pictures** switch. It is off by default. When it is on, it shows the price of one picture, and nothing is sent until **Create** or **Make it**; then each new block and item texture is made with one checked request (and a second only when the first fails its check), and the progress shows "Making AI pictures: 2 of 5". **Stop** ends it; the rest keep MCSuperMods' drawings. A picture that fails its check keeps MCSuperMods' drawing, and the message afterwards says how many were made and why any were not ("did not look like a chestplate"). It is still one step for **Undo**.

## When something goes wrong

- **The service did not accept the key**: check it in Settings, then **Test key**.
- **The account has run out of credit or quota**: top it up on the service's website.
- **The service is getting too many requests**: wait a minute.
- **The service declined this description**: describe it another way.
- **The service could not be reached** or **took too long to answer**: check the internet connection and try again.
- **The AI picture did not look like …**: press **Try again**, change the description or the colour, or use MCSuperMods' drawing and paint over it.

## Limits

- The shape check knows the things MCSuperMods can draw (armour, tools, weapons, gems, ingots, food, ores, planks, logs, bricks, leaves, blocks). Other things (a wand, a skin, a painting, a pattern) are checked for colour and seams only, or not at all.
- The check compares outlines roughly: a chunky shape such as leggings or a gem is easier to pass than a chestplate.
- A skin is one tile of fur or scales laid on every box, with eyes on the face; for markings, paint over it or use **Draw a skin**.
- OpenAI cannot start from MCSuperMods' drawing; its pictures are still checked.
- The AI helper cannot make pictures yet.
