# Rules: make things happen without code

Rules say what your blocks, items, mobs and effects do when something happens, in sentences you build from pickers. "When a player uses the Chime Block, play a chime and give the player a Ruby." You do not write code, JSON or a script: MCSuperMods turns the sentences into the events and scripts the game reads.

Rules are for people who do not want to code, and they are as strong as most small scripts: conditions, chances, counters, repeats and waits are all there. When you need more than the catalogue offers, use a [script](scripting.md) instead.

Rules are part of the Fabric mod jar. Export the **Fabric mod jar** ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)), press **Play** ([Playing and testing](playing-and-testing.md)) or use **Share my mod** ([Very easy mode](very-easy.md)).

## Where rules live

- **In a Studio.** The Block, Item, Mob and Effect Studios have a **Rules** section just above the events: "Rules say what this block does when something happens. No code needed." It lists the rules about the thing you are editing and has **Add a rule**. A new rule starts with the thing's most natural moment already chosen: "A player uses the block" for a block, "A player uses the item" for an item, "The mob is hurt" for a mob, "The effect starts" for an effect.
- **In the Rule book.** All rules are kept in rule books. A project starts with none; the first rule you add makes the project's book, `<namespace>:rules`, in the same undo step. **Open the rule book** in a Rules section opens it with every rule of the project. In Very easy mode, **Make things happen** on Home opens it ([Very easy mode](very-easy.md)).
- **From a template.** **Add element** (Ctrl+N) has six templates in the category **Rules**: **Welcome message**, **Jump pad**, **Lucky block**, **Healing spring**, **Click counter** and **Mob drops a reward**. They use only vanilla ids, so each works in a project of its own.
- **From an example.** Help > Examples… has **Rules: a lucky block** (breaking the Lucky Block counts, and with a 60 per cent chance drops one to three Lucky Coins, else spawns a silverfish; using a coin gives a minute of Luck) and **Rules: a guard mob** (every five seconds the Guard warns every player within 12 blocks and makes them glow; it calls for help when hurt). See [Templates, starters and examples](templates-and-examples.md).
- **The AI helper** writes rule books too ([The AI helper](ai-helper.md)).

## One rule, one sentence

The **Rule book** shows each rule as a card with a name, an **On** switch, **Move rule up** and **Move rule down**, **Duplicate rule** and **Delete rule**. Under the name are three parts:

- **When** is the moment, for example "A player uses the block", with the thing it is about.
- **Only if** is optional. It is a list of things that must be true ("The player is sneaking", "A chance 50%"). Choose **all of these** or **any of these**, and **Not** to turn one round.
- **Do** is the list of steps, in order.

Every blank in the sentence is a button, for example "Item: Ruby". Choose it to pick another thing, a number or a place. Things are chosen in the picker, which shows **Your things** first, then Minecraft's. Pictures of Minecraft things appear once MSM has found your Minecraft (Settings, Game locations); until then you see a generic icon. Alt+Up and Alt+Down move the selected step, condition or rule.

A rule's **key** (a to z, 0 to 9 and `_`, at most 32 characters, different in each book) is made for you. **Problems** shows what is wrong with a rule on the rule's card, in words: a message you can read, then the step it is about.

## When: the moments

| Group | Moments |
|---|---|
| Blocks | A player uses the block; Something steps on the block; A player breaks the block; The block is placed; The block gets a random tick; Something is inside the block; The block is powered by redstone; The block stops being powered; The one block is broken |
| Containers, machines, portals | A player opens or closes the container; The machine starts working or finishes; Something travels through the portal |
| Items | A player uses the item; uses it on a block; The item hits a mob; Every few seconds while the item is held or worn |
| Thrown items | The thrown item hits a mob or a block |
| Mobs | The mob is hurt, dies, attacks or spawns; A player uses the mob; Every few seconds while the mob is alive |
| Effects | The effect starts, ends, or every few seconds while it lasts |
| Players | A player joins, leaves, respawns, chats or changes dimension; Every few seconds for each player; A player crafts; A player picks up; A player eats; A player goes to sleep; A player wakes up; A player gets an advancement; A player enters the area; A player leaves the area |
| The world | The world starts; Every few seconds; A timer ends |
| Keys | A player presses a key; A player lets go of a key; A player holds a key (every half second by default) |
| Vehicles | Someone gets in the vehicle; Someone gets out; The vehicle fires; The vehicle is destroyed; Every few seconds while the vehicle is driven |
| Placing, explosions, commands, riding | A player places a block; Something explodes; A player types the command (one of your [commands](commands-and-tabs.md)); A player gets on something; A player gets off something |
| Anything | A player uses or breaks any block; A player uses any item; Any mob is hurt or dies; A player uses any mob. Pick a vanilla thing or one of yours, or leave it empty for all of them |

**A player crafts**, **A player picks up** and **A player eats** (eating or drinking) take an item, vanilla or one of yours, or nothing for any item; an item's own Rules section offers them too. **A player gets an advancement** takes an advancement, or nothing for any. **A player goes to sleep** and **A player wakes up** take nothing.

Moments with "every few seconds" take a number of seconds; some take a cooldown in seconds or a chance. These options belong to the thing's moment, not to one rule, so **two rules on the same block and moment share them**: change "every 2 seconds" on one and the other changes too. The cards show the shared value.

## Do: the steps

| Group | Steps |
|---|---|
| Players | Give an item; Give from a loot table; Take an item away; Heal; Hurt; Feed; Give experience; Set the game mode; Teleport; Launch; Show a chat message; Show a title; Show text above the hotbar; Give an effect; Remove an effect; Open a dialog; Add to a statistic; Join a team; Leave the team; Set the player's spawn point |
| World | Place a block; Remove a block (with or without drops); Spawn a mob; Drop an item; Drop from a loot table; Place a structure; Make an explosion; Set the weather; Set a game rule; Run a function; Run a command; Light a portal; Reset an area; Set the world spawn; Set the world border |
| On screen | Show on screen; Hide from the screen; Show a number on screen |
| Sounds and particles | Play a sound; Spawn particles; Play an animation |
| Mobs | Remove the mob; Set on fire (a mob, for some seconds; players are not lit, as no Minecraft command can do that); Show a boss bar |
| Riding | Ride something; Get off |
| Logic | If ... otherwise ...; Repeat; For each player; Wait; Pick one at random; Stop the normal action; Stop the placing; Stop the explosion; Keep the blocks safe |
| Counters | Set a counter; Add to a counter; Take from a counter; Set a score; Add to a score; Start a timer; Stop a timer |

Places are "Here", "Above here", "In front of here" (one block along the way the block faces), "At the player", "At the mob", "Where the player looks" and "Offset". Who is "The player", "The mob", "The other one", "Every player" or "Every player nearby". A moment offers only what exists there: a random tick has no player, so there is no "The player".

Numbers can be fixed or **readings**: a random number, a counter, the player's health, food, level or position, the number of players, the time of day, **What the player typed** (on **A player types the command**), or a sum. Text can mix words and readings ("You have used the lucky block" and a counter).

**The time of day** counts game ticks: 0 is sunrise, 6000 noon, 13000 nightfall and 18000 midnight. **Weather** is the server's, so "It is raining" is never true in the Nether or the End.

**Stop the normal action** cancels what the game would have done, and works only on "A player chats", "A player uses any block", "A player breaks any block", "A player uses any item", "Any mob is hurt" and "A player uses any mob".

**Blocks placed when a block breaks.** On "A player breaks the block" and "A player breaks any block" the rules run just before the game takes the block away. So that the break does not take away what a rule builds there, the steps that change blocks (Place a block, Remove a block, Place a structure, Reset an area, and an explosion that breaks blocks or lights fire) run a twentieth of a second later, once the block is gone; everything else, Stop the normal action included, runs at once.

## Vehicles, keys and the screen

Rules for keys sit on a key of your own ([Keys and the screen](keys-and-hud.md)) and rules for vehicles on a vehicle of yours ([Vehicles](vehicles.md)). In the Studio of a key or vehicle, the Rules section appears once a rule has something to say there.

- **A player presses a key** (the key is chosen with **Press the key you want**), **A player lets go of a key** and **A player holds a key**. A press can have a cooldown in seconds; a held key repeats every half second unless you change it (0.05 to 60 seconds).
- **Someone gets in the vehicle**, **Someone gets out**, **The vehicle fires** (every weapon; only offered for a vehicle with a weapon) and **The vehicle is destroyed**, and **Every few seconds while the vehicle is driven**.
- **Show on screen** and **Hide from the screen** pick one of your on-screen elements. **Show a number on screen** sets a number or a text, as a bar or as text, and **Make a new on-screen number** makes the element for you (named like `number`, `number_2`) in the same undo step as the rule. A counter shows through an element that reads saved data; it shows only what a step sets.
- **Make an explosion** is now a plain step: it breaks blocks by default here, unlike the action in the Events editor.
- Readings for a vehicle: its fuel (in seconds of driving left), its damage and its ammunition (for the first weapon, or pick **The first weapon**; a missing weapon is marked "(not on this vehicle)").

Plain rules go into the key's or vehicle's own events. A rule with logic becomes a script that listens to the Script API 1.5 events. Script rules on vehicles reload without a restart; plain ones need one (a new vehicle or key always does). A rule on a vehicle that does not exist, a weapon that is not there or an on-screen element that is missing shows a problem in the Rule book.

## Placing, explosions, commands and riding

Script API 1.6 gave rules five more moments (runtime 1.5.2 or later). They are in the table under **Placing, explosions, commands, riding**.

- **A player places a block** (then **Which block?**, or leave it empty for any block). **Stop the placing** cancels it, so the block is not placed and the player keeps it; it is offered only for this moment. For example: when a player places TNT, stop the placing and show "No TNT here". Only placing by a player is seen: dispensers, endermen and commands that place blocks are not, and the moment can fire for a placing that then fails (the block did not fit).
- **Something explodes** covers every explosion: TNT, creepers, fireballs, wind charges, a bed or respawn anchor in the wrong dimension and **Make an explosion**. **Stop the explosion** cancels it. **Keep the blocks safe** lets the explosion hurt and push but not break blocks or start fires; when both steps are given, stopping wins. The check **What caused it** ("it was caused by") picks a mob type, with **A block** first in the picker for explosions that come from a block (a bed or an anchor). Rules cannot make an explosion bigger or smaller; **Make an explosion** makes a new one. A stopped explosion may still show its smoke and sound.
- **A player types the command** picks one of your commands, shown as `/name` in the picker ([Commands and creative tabs](commands-and-tabs.md)). "The player" is whoever typed it. For a command that runs a function the rules listen to the Script API's `command` event, and they do not run when the console or a command block runs it. The reading **What the player typed** reads one of the command's words: pick it in **Typed for** (the menu lists the words Rules can read), and for a place or block position the **Part** (x, y or z). Whole numbers and numbers are numbers; words, text, a player (by name), a mob or player (by UUID), an item, a block, a dimension and an effect are text. Other kinds of words cannot be read by rules: they reach the command's function or a script only.
- **A player gets on something** and **A player gets off something**; "The other one" is what they got on or off. Getting on and off is noticed up to a quarter of a second late, and only for players. Mobs getting on things have no moment.
- **Ride something** (who rides what) and **Get off**. The vanilla boarding rules apply (a cooldown, a free seat) and nothing can ride a player. The picker for what is ridden does not offer "every player" or "players nearby".
- **Someone is riding** checks who is riding, and optionally what. **Something is facing a way** checks the block here, the player, the mob or the other one against north, east, south, west, up or down. A block is read by the way it points, else by its axis (x is east, y up, z south). A player or a mob is read by the way it looks, flat on the ground: **entity facing is horizontal only**, so up and down fit only blocks.
- **The way it faces** is a reading that gives a word ("north"), so it is offered in text and not where a number is needed (Problems says: "uses 'the way it faces' where a number is needed. Use it in a message.").
- **In front of here** is a place one block along the way the block here faces. A conveyor block that moves the player to the block in front is the sample's example; in a row of conveyors the player is moved into the next one at once, so a long row carries them along.

The Try it preview ([Try it](try-it.md)) lists an explosion or a command as a line in **What happened** and does not show a blast or run a function; check them in the game.

Problems reports a step or check that belongs to another moment: "uses a step or a check that only works with another 'When' (such as 'Stop the placing' when a player places a block)".

## Crafting, eating, sleeping, dialogs, game rules and statistics

Script API 1.7 gave rules six more moments, three steps, two checks and a reading (runtime 1.5.3 or later).

- **A player crafts** runs once for each craft, in the inventory's grid, at a crafting table (once for each craft of a Shift and click) or when a player takes a furnace's result. Crafters and dispensers do not count.
- **A player picks up** runs when a player picks up an item from the ground, also when only part of it fits.
- **A player eats** runs when a player finishes eating or drinking (food, a potion, milk, a bottle of your liquid); a meal stopped before the end does not count.
- **A player goes to sleep** and **A player wakes up** (in the morning, by leaving the bed, or woken).
- **A player gets an advancement**, by playing or by `/advancement`. The recipe advancements that unlock entries of the recipe book do not count.
- **Open a dialog** opens a dialog, yours or Minecraft's, on a player's screen. It is a plain step.
- **Add to a statistic** adds a number to one of your [statistics](commands-and-tabs.md#statistics) for a player, and **The statistic is at least** checks it.
- **Set a game rule** sets one of your [game rules](commands-and-tabs.md#game-rules) or Minecraft's, and **The game rule is** checks it. For one of Minecraft's rules the editor offers both true or false and a number, because it does not know which the rule holds.

The six moments come from small hooks the runtime adds to the game, and a rule on them, like the steps and checks above other than **Open a dialog**, is a rule with logic. Try it says them in **What happened** as "Only in Minecraft" ([Try it](try-it.md)).

## Games: teams, scores, timers and areas

Rules 3 gave rules what games need ([Game modes](game-modes.md)). They work with the pieces of a game, a team, a score, a timer, an area or a magic block of your project (or a team or score of Minecraft's by its name), and with loot tables and structures.

- Moments: **A player enters the area** and **A player leaves the area** pick one of your areas. **A timer ends** picks one of your timers; it has no player. **The one block is broken** picks one of your magic blocks and, if you like, a phase (from 1): it has no player and no place either, since the game counts the break before anyone can be named.
- Steps: **Give from a loot table** (to a player) and **Drop from a loot table** (at a place) roll a loot table. **Place a structure** places one of your structures, turned and mirrored if you like. **Pick one at random** runs one of its steps, each with a weight from 0 to 1000 (at most 16): the lucky block uses it. **Join a team** and **Leave the team**; **Set a score** and **Add to a score**; **Start a timer** and **Stop a timer**; **Reset an area** (rebuilds it from its buildings, or only clears its mobs and items when it has none); **Set the world spawn**, **Set the player's spawn point** and **Set the world border** (how wide, over how many seconds, and its centre).
- Checks: **The player is in the area**, **The player is on the team**, **The score is at least** and **The timer is running**.
- Readings: **The score of**, **Time left on the timer** (in seconds) and **Players on the team**.
- Picking: every blank of these opens the picker, which lists things by their names (never their ids): **Your things**, then Minecraft's loot tables (grouped as chests, blocks' drops, mobs' drops and so on) and structures. A team, score, timer, area or magic block is one of your own; one made elsewhere (a team or score of Minecraft's by its name) shows in quotes. Under the list, **Make a new team** (score, timer, area, magic block or loot table) makes one for you, named like **My team**, **My team 2**, and picks it in the same undo step as the rule; open it from your things to change it. A structure cannot be made here: build it in the game and bring it in with **Bring builds from my test worlds** ([Maps](maps.md#bring-builds-from-my-test-worlds)), or import one ([Structures](structures.md#import-a-structure)). In a reading, the score, timer or team is picked in the number's editor.

Scores are not counters. A counter belongs to your rules and is kept by the mod; a score is Minecraft's own scoreboard, which the sidebar, functions and commands can see. Use **Set a score** and **Add to a score** for anything players should see on the sidebar.

Every one of these is a rule with logic (it runs a command through the script), so it needs the Fabric mod jar. Rules on an area, a timer or a magic block reach the rules through a small command of the mod's own, run by your game's functions only when a rule listens. In a vanilla data pack the game skips those few functions and everything else of the game still works. In Try it, a step it cannot run is said as "Only in Minecraft" ([Try it](try-it.md#games)).

## Counters

A counter remembers a number. Choose a counter in a step or a reading, and MSM declares it on first use in the book's **Counters** list: its name, who owns it (**player**, **mob** or **world**) and its starting number. A player counter is separate for every player; a world counter is shared.

Counters are saved with the world. A new test world starts them again ([Playing and testing](playing-and-testing.md)).

## Logic: if, repeat, for each player

- **If ... otherwise ...** runs one list when its conditions hold and another when not.
- **Repeat** runs a list up to 100 times.
- **For each player** runs a list for every player, or every player within a radius of up to 64 blocks. Inside it, "The player" is that player.
- **Wait** pauses the rest of the rule for some seconds. The game carries on meanwhile.

These can nest up to three levels. A rule has at most 50 steps in all, a list at most 50 entries, an explosion's power is 0 to 10, a dropped stack at most 64 and a weather change at most 1,000,000 seconds. The Rule book stops you at these limits and **Problems** says so if a hand edit goes past them.

## Plain rules and rules with logic

MCSuperMods compiles a rule in one of two ways, and you do not have to choose:

- A **plain** rule is on a block, item, mob or effect of your own, has no **Only if**, uses plain numbers (nothing random or read from the game), only steps the game's own events can do (Give an item, Heal, Hurt, Launch, Give an effect, Place a block, Run a function, Light a portal, Play a sound, Spawn particles, Play an animation), and only people and mobs the moment has (a random tick has no player to give things to). It becomes ordinary **events** on the thing, the same ones you could write in the Events editor.
- **Every other rule** compiles to a **script**. Everything else works the same; the script is written for you and is checked like your own scripts. When one rule needs a script, the other rules on the same thing and moment join it, so the order stays what you see.

In Advanced mode the rule book shows **What this becomes**: the events and the generated script, for reading. They cannot be edited there; they are made again whenever the rules change.

A hand-made event on the same moment runs before any rule.

## Copy as my own script

In Advanced mode the rule book also has **Copy as my own script**, for when you want to take over by hand what the rules do. As one undo step ("Copy <book> as my own script") it:

- adds a normal script, named after the book with `_script` at the end (`my_mod:rules_script`), holding the code the rules made, so you can change it in the Script Studio;
- gives each block, item, mob or effect the book's events as its own events, named `<thing>_script_<moment>` (they still call the script's handlers, and keep the cooldown or interval the rules had);
- turns every rule in the book off, so nothing runs twice.

The game does the same as before; the rules are kept, turned off, and **Edit > Undo** puts everything back. If every rule in the book was plain, no script is needed and only the events are copied. A book with problems must be fixed first. When another rule book with a name earlier in the alphabet also has rules on the same thing and moment, its rules ran first and now run after the copied ones; the Studio says so after the copy.

## Rules in the Events editor

A block, item, mob or effect that has rules shows them in the Events editor under **From rules**: a read-only list of the events they make, with **Open the rule book**. Rule events cannot be edited there, because they are made from the rules.

A hand-made event whose actions can all be written as steps has **Turn into rules**: it makes a rule for the moment, removes the event and keeps the order, as one undo step ("Turn <event> into rules"). It is offered only when the rule means exactly what the event did.

## What the game needs to know

- **A new moment needs a restart.** The first rule that gives a block, say, "A player breaks the block" changes the block itself, so Minecraft must start again to read it. Editing rules on a moment the thing already has reloads in the running game. See [Playing and testing](playing-and-testing.md).
- **Rules need the Fabric mod jar.** Vanilla packs carry no rules. Exporting a resource or data pack says: "Rules are not in vanilla packs: they need the Fabric mod jar. Export the Fabric mod jar to play with your rules."
- **Rules with logic are not in the Java project.** The [Java eject](eject.md) has events but no scripts, so a rule that needs a script does nothing there. The Export Java project dialog lists those rules, and **Problems** says: "The rule "<name>" needs a script, and scripts are not in the Java project, so it does nothing there. Rules without logic are in it as events." To change that code by hand, use **Copy as my own script** in the rule book (Advanced mode, see above); the script still needs porting to Java by hand for the eject.
- **Placing and explosion rules are scripts.** They listen to the two Script API 1.6 events, so they are not in the Java project either (`export.not-in-eject`). Rules on crafting, picking up, eating, sleeping, waking and advancements are scripts too, and so are not in it. A plain rule on a command is part of the command's event and is.
- **Pictures and sounds.** Pictures of Minecraft's own things need your Minecraft files (Settings, Game locations). Minecraft's sounds cannot be played in the editor; you see their names. Sounds of your own project play.
- **Time limits.** One script call may run for two seconds; a very long repeat or a long chain of waits is stopped.

## Hand edits

A rule book is an ordinary element (kind `msm:rules`), so Raw JSON and other tools can edit it. If an edit breaks a limit or an id, the rule's card shows the error and the export is blocked until it is fixed.

## Try the sample

`fixtures/sample-rules` in the repository is a small project that uses most of this: a chime block, a lucky block with a counter, a rally horn that waits, a mob that keeps watch, and rules on vanilla Stone, joining and the weather. Its checklist is [`fixtures/sample-rules/README.md`](https://github.com/MEZTKING/MCSuperMods/blob/main/fixtures/sample-rules/README.md). Use the Lucky Block with an empty hand: while the hand holds a Ruby, sneaking and using it does nothing (Minecraft treats it as placing the Ruby).
