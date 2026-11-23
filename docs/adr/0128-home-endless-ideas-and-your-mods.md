# ADR 0128: Home's endless ideas, sharper clips and Your mods as cards

## Context

The user looked at 1.5.6's Home (Very easy, no mod) on Windows on 2026-11-23 and asked three things:

- "the resolution needs to be better for the previews": the Showcase clips and stills look soft and low in detail at the card size; two world cards ("A world of islands", "A world of tall mountains") showed an empty grey frame.
- "the your mod section seems very terribly designed": Your mods is a centred column of plain names under the cards.
- "make an infinity scrolling feature so there are endless mod to go through".

The Showcase (ADR 0118) has thirteen hand-picked cards, each a library example with a clip drawn live by Try it's renderer, one live clip at a time. Surprise me (ADR 0086) makes a small themed mod from a seed, pure and repeatable: the same seed, theme, project and target give the same mod. The app has no network by default, so ideas cannot come from a server.

## Decision

**D1 Endless ideas from Surprise me's seeds.** Below the thirteen Showcase cards, Home shows **More ideas**: an endless list of cards, each a mod Surprise me would make from a seed. Card *n* uses a seed derived from a per-install base seed and *n*, so the list is the same each time the user returns and goes on for ever. A card shows the mod's name, one line on what is in it (the things it makes, in words) and a picture; **Make this** starts a mod from exactly that seed (in Very easy, the name dialog first, as Make this does for a Showcase card), and **Shuffle** on the heading picks a new base seed. Nothing is generated until a card comes near the view (an intersection observer), and cards far behind are unmounted (a windowed list), so memory stays flat however far the user scrolls.

**D2 Pictures for idea cards.** An idea card's picture is drawn, not filmed: the mod's main things laid out as the Showcase's drawn stills are (the textures Surprise me's flows draw), at the card's real pixel size. A card under the pointer, or the one in the middle of the view on touch, may play a live clip through the Showcase's one-live-clip rule (`chooseLiveClip`), reusing its player; reduced motion and the setting **Play showcase clips** apply as they do to the Showcase.

**D3 Sharper clips and stills.** Clips render at the canvas's displayed size times the device pixel ratio (capped at 2), not at a fixed small buffer scaled up; drawn stills and texture pictures are drawn at whole multiples of their pixels with `image-rendering: pixelated`, never smoothed. A world card that cannot draw its ground shows its drawn still and a line, never an empty frame.

**D4 Your mods as cards.** Your mods becomes a grid of cards above the Showcase when the user has mods: each card shows the mod's picture (its `pack.png` if it has one, else its first item or block texture, else a drawn monogram), its name, how many things it has and when it was last opened, with **Open** as the card's main action and a menu with **Show in folder** and **Remove from this list**. More than eight mods show the eight most recent and **See all my mods**. A missing folder shows "This mod's folder is not there any more." with Remove.

**D5 Order on Home.** With mods: Your mods, then See what you can make (the Showcase), then More ideas. Without mods: the start buttons, the Showcase, then More ideas.

**D6 Live view rule.** Idea cards are presentation over Surprise me's output, never content; they add no kind. Search finds **More ideas** and **Your mods** (the findable rule in HANDOFF).

## Consequences

- Home grows below the fold without limit, but stays flat in memory (D1's window) and runs at most one live clip (D2).
- The first paint must not grow by more than the cards' own code: the Surprise me generator and the drawn-still code load lazily when More ideas first comes into view (ADR 0126 D4 stop lines).
- Your mods reads a little more per recent mod (pack picture, thing count): read lazily per card, cached, never blocking Home.
- Vetoable defaults: the base seed per install, eight recent mods before See all, the order of D5, Shuffle on the heading.

## Status

Accepted (2026-11-23, user's request on Home; the defaults above are vetoable).

**Amendment (2026-11-23, ADR 0131 plan) to D3:** a clip steps its pixel ratio down from 2 to 1.5 to 1 while its own median frame time is over 1000/24 ms, and does not step up again for that card in the session (replaces the open item "measure at ratio 2 on a quiet machine").

Amendment (B713, 2026-11-23): D3's cap of 2 is where a clip starts; it steps to 1.5, then 1, while the median of its last 30 frames is over 1000/24 ms, per card and never back up in the session. D7: in the app's 14-pixel rem, gallery and idea cards are 242 by 272.25 px with a 12 px gap.
