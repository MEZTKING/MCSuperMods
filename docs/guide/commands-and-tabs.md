# Commands and creative tabs

A few small things make a mod feel finished: a **command** of your own that players type in chat (`/heal`, `/kit 5`), a **creative tab** of your own that holds your blocks and items in the creative inventory instead of scattering them over the vanilla tabs, a **game rule** of your own (a world setting such as `/gamerule mypack:allow_heal false`) and a **statistic** of your own that counts something for each player.

All four are elements of the project (`msm:command`, `msm:creative_tab`, `msm:game_rule` and `msm:stat`), made without code. All need the **Fabric mod jar**: commands and tabs the runtime of MCSuperMods 1.5.1 or later, game rules, statistics, the newer argument types and the hand order the runtime that ships them (1.5.3); a vanilla pack leaves them out ([Vanilla packs](#vanilla-packs)).

## Make a command

There are four ways:

- the Creator's **Custom command** flow (group **Scripts**; Fabric mod jar only). Its answers: **Command name** (`heal` gives `/heal`), **Who can use it** (**Every player** or **Operators only (as /give)**), **Message back**, **What it does** (**Heal you**, **Give you an effect**, **Give you an item** or **Launch you up**) with its numbers (**Health restored**, **Effect**, **Effect seconds**, **Item**, **How many**), and **Its own game rule**: a game rule `<namespace>:allow_<name>` that turns the command on and off (its action moves into a rule book that runs it while the rule is on). It creates with its untouched defaults and zero problems;
- in Very easy mode, the Home tile **Make your mod do something** (heading **Rules and help**) opens the Custom command, Creative tab and Game rule flows ([Very easy mode](very-easy.md));
- **Add element** (Ctrl+N), the templates under **Commands**: **Help command** (`/helpme`, also `/tips`: a chime and an answer in chat) and **Hop command** (`/hop`: a few blocks up, then a slow fall);
- the examples **Command: /welcome** (`/welcome`, also `/hi`) and **Server helper** (`/helpme` for everyone, `/hub` to jump to a lobby, `/boost` with a number for operators, and a rule book that points new players at `/helpme`).

Selecting a command opens the Command Studio.

## The Command Studio

- **How it is typed** shows the chat line as a player sees it: `/kit <who> [count]`, with `<…>` for needed words and `[…]` for the ones that may be left out, and the other names beneath.
- **Name** is the command's name (lower case letters, digits and `_`, without the slash, 1 to 64 characters) and up to four **Other name** entries (aliases).
- **What the player types after it** lists the words after the name. Each row has a **name** (what a function calls it), **is** (the kind of value, below), **Lowest** and **Highest** for numbers, **May be left out**, and move up, move down and remove buttons (each one undo step). Up to eight arguments. The kinds, in the Studio's words: **One word**, **Some text (the rest of the line)**, **A whole number**, **A number (may have a decimal point)**, **Yes or no (true or false)**, **One player**, **One or more players**, **One mob or player**, **A place (x y z)**, **A block position (x y z)**, **An item**, **A block**, **A dimension**, **A length of time (such as 5s or 2d)**, **A colour name**, **A colour code (such as #FF8800)**, **A facing (sideways and up or down)**, **An angle**, **A UUID**, **A scoreboard objective**, **One score holder**, **One or more score holders**, **An item test (an item or # and a tag)**, **A block test (a block or # and a tag)**, **An effect**, **An enchantment**, **A biome**, **A biome or # and a biome tag**, **A structure**, **A structure or # and a structure tag**, **A kind of mob**, **A particle**, **A game mode**, **A text component (JSON text)**, **A range of whole numbers (such as 1..5)**, **An id (such as minecraft:stone)**, **A team**, **An inventory slot**, **NBT data**, **A chat message (the rest of the line)**, **A dialog**, **A loot table**, **An advancement** and **A recipe**: 44 in all. Words that may be left out come last, and the text or chat message goes last of all.
- **Who can use it** is the permission level in five words: **Every player**, **Trusted players (level 1)**, **Operators, as for cheat commands like /give (level 2)**, **Server admins (level 3)** and **The server owner only (level 4)**.
- **What it does** picks one: **Do the steps of an event** (the events editor appears, with the actions you know from blocks), **Run a function** (a data pack function) or **Nothing here (a script listens for it)**.
- **Message back** is the text shown to the player when the command worked (`feedback_text`).
- The **Rules** section appears once a rule has something to say about the command ([Rules](rules.md#placing-explosions-commands-and-riding)).

**Problems** reports, in plain words, a name with letters it cannot use, a name that Minecraft or another of your commands already uses, a word that must be typed after one that may be left out, a "rest of the line" text that is not last, a lowest or highest value on something that is not a number, a lowest above the highest, a command that runs both a function and an event, an event that is not there any more, a command that does nothing yet, and two notes (below).

## How a command runs

When a player types the command, the game reads the words, then:

- an **event** runs with `self` and `other` both the player (the source of the command); its actions give items, heal, launch and so on ([Events and actions](blocks-and-items.md#events-and-actions));
- a **function** runs at once with the typed words passed in as macro values, as `/function <id> with storage <mod id>:args`. In the function write `$(count)` where a value goes: a whole number is `5`, a number `2.5`, yes or no `1` or `0`, a place `1.5 64.0 -2.25`, a block position `3 70 -4`, an item or block its id, **One player** the player's **name**, **One or more players** the names separated by spaces, and **One mob or player** its UUID. Of the newer kinds, a dimension, effect, enchantment, biome, structure, kind of mob, particle, advancement, recipe, id, dialog or loot table arrives as its id (`#` and the tag for the "or # and a tag" kinds); a length of time in ticks; a colour name as its name and a colour code as `#RRGGBB`; a facing as `yaw pitch`; an angle as a number; score holders separated by spaces; item and block tests, slots, text components and ranges as typed; NBT data as SNBT; and a chat message with its selectors filled in;
- a **script** listens for the Script API's `command` event ([Scripting](scripting.md#script-api-16)), which says which command ran and what was typed; a script run by the command's own event reads the typed values from `event.args` ([Script API 1.7](scripting.md#script-api-17));
- the **Message back** is sent, and the command's own **Rules** run.

A command with **Every player** and a function is worth a thought: the function runs with operator rights (level 2, the permission of cheat commands) whatever the player's own level, so anyone can do what the function does. The Studio and Problems say so (`commands.runs-as-player`). Keep such a function harmless, or make the command **Operators**.

After a Play, the commands also come back after `/reload` (the game registers them again and tells every player its new list). A new command is read when Minecraft starts, so adding one makes Play say **Restart needed**; changing the events of a command that exists reloads ([Playing and testing](playing-and-testing.md#restart-needed)).

## Make a creative tab

- the Creator's **Creative tab** flow (group **Scripts**; Fabric mod jar only): **Tab title** (My Blocks gives `my_blocks`), **Icon** (**The first block**, or a Diamond, Emerald, Bricks, Golden apple or Nether star), **Order** (with **In my own order**, **Vanilla items in the tab**: a torch, lantern, bricks, glass or flower pot after your own things) and **Make a first block in it** with **Block colour**, so the tab is not empty;
- the templates **Creative tab** and **Creative tab in your own order** (category **Creative tabs**), the example **Creative tab: Curios**, or an element of its own.

Selecting a tab opens the Creative Tab Studio:

- **Tab**: **Title** and **Icon (an item)**, and **Order**: **In the order the mod adds them**, **By name, A to Z** or **In your own order**;
- **Your own order** (with **In your own order**): the items in the order the tab shows them, any item of the project or of Minecraft, moved up and down or taken out. Picking **In your own order** starts the list from the tab's members in one undo step. Things in the tab that are not listed follow after;
- **Preview**;
- **What is in it** lists the items, block items and spawn eggs whose **Creative tab** field names this tab. **Add**, **Take out** and **Add everything without a tab** set or clear that field on the things, each as a single undo step however many things change. Items and blocks join a tab by naming it in their own **Creative tab** field too ([Blocks and items](blocks-and-items.md#the-block-studio)).

How the tab is ordered:

- **In the order the mod adds them** is the order the game registers things: all the block items, then the items, then the spawn eggs, each by mod id and then by file path. It is not always the order the project lists them in, so the list in the Studio is a guide.
- **By name, A to Z** sorts by the name players see.
- **In your own order** shows the listed items first, in your order, each once, then the tab's other things in the order the mod adds them.
- A tab with an **icon that does not exist** shows no picture. Problems says so (`creative-tab-icon-unknown`), and also reports an item that names a tab that is not there (`creative-tab-unknown`), a hand-order list under another order (it is not used), **In your own order** with no list, an id in the list that is no item, and an item listed twice (it is shown once, at its first place).
- Extra tabs appear on the creative inventory's second page, after the vanilla tabs. A new creative tab needs a restart; nothing about it reloads.

## Game rules

A game rule of your own is a world setting players change with `/gamerule <namespace>:<name>` (the namespace is needed) and see in the world's game rule screen. It is saved with each world.

- the Creator's **Game rule** flow (group **Scripts**; Fabric mod jar only). Its answers: **What is the setting called?**, **What it does, in a sentence**, **What it holds** (**On or off** or **A whole number**), **On in a new world**, or **Number in a new world** with **Lowest number allowed** and **Highest number allowed**, **Listed under** (Player, Mobs, Spawning, Drops, World updates, Chat or Miscellaneous), and under **Using it** **Greet players while it is on** with **The greeting**, and **Count the greetings** (a statistic). The greeting is a rule book that reads the setting;
- **Add element**, the templates **On or off game rule** and **Number game rule** (category **Game rules**), or the example **Game rule: Sparkle trails**.

The **Game rule Studio** has **Name**, **Description**, **Game rule kind** (**On or off (true or false)** or **A whole number**), **Category**, **Default**, and for a number **Lowest** and **Highest**; outside Very easy mode it shows the `/gamerule` line to type. A rule reads a game rule with the condition **The game rule is** and changes it with the step **Set a game rule** ([Rules](rules.md)); a script with `world.gameRule` and `world.setGameRule` ([Script API 1.7](scripting.md#script-api-17)).

Problems reports a lowest above the highest, a default outside them, a lowest or highest on an on or off rule (they are ignored), a game rule in the `minecraft` namespace that Minecraft already has (refused), one that has the name of a vanilla rule in your own namespace (a note: players may mix the two up), and a game rule without a name (a note: the screen shows its language key).

## Statistics

A statistic of your own counts something for each player. It is shown in the Statistics screen and can be the criterion of a scoreboard objective, `minecraft.custom:<namespace>.<name>` (`/scoreboard objectives add coins minecraft.custom:mypack.coins_found`).

- the Game rule flow's **Count the greetings**, the templates **Counted statistic** and **Timed statistic** (category **Statistics**), or the example **Statistic: Bells rung**;
- the **Statistic Studio**: **Name** and **Shown as**: **A count (1, 2, 3…)**, **A distance (counted in centimetres, shown in metres)** or **A time (counted in ticks, shown in seconds and minutes)**; outside Very easy mode it shows the scoreboard criterion.

A rule adds to it with **Add to a statistic** and tests it with **The statistic is at least**; a script with `player.stat` and `player.addStat`. Problems reports the same clashes and missing names as for game rules.

## The limits

- **A name that clashes is not registered.** A command named like a vanilla command (there are 94) or like one of another mod, or with the same name as an earlier command of yours, is a load error in the game log and is not registered under that name. Problems warns first (`commands.name-clash`). The same goes for an alias.
- **The text is raw.** A text or word typed by a player goes into the function as it is. A `"` or `\` typed by a player can break a function that puts the value in quotes. Problems adds the note `commands.raw-text` to commands with text arguments. Keep text out of quoted places, or let a script read it.
- **`player` arguments take names or selectors**, not UUIDs: `/kit Ann 5` and `/kit @a 5` work. A function receives the name; a script receives the UUID in `args`.
- **Functions run at level 2** whatever the player's level (see above), and a command with permission 0 is for everyone.
- **A command that matches nobody fails.** The runtime always reads the arguments, so an event-only command whose player selector matches nobody says so and does not run.
- **Server side commands only.** There are no client-side commands, and no argument types of your own beyond the 44. A structure, advancement or recipe argument takes any id as it is typed, and the game checks it only when the command runs, so players get no list of suggestions for it (the game does not send those lists to players).
- **Rules read some argument kinds only.** **What the player typed** reads whole numbers, numbers, places and block positions (by part), words, text, players (by name), mobs (by UUID), items, blocks, dimensions and effects; the other kinds reach the command's function or script only.
- **A script rule is not run from the console.** Rules and scripts that listen for a command that runs a function do not run when the console or a command block runs it.
- **`as_listed` follows registration order**; use **In your own order** to set it by hand (above).
- **Game rules are on or off, or a whole number**, as Minecraft's are: there are no text rules. **Statistics count** in Minecraft's three formats (a count, a distance, a time). Both are fixed when the game starts: a new one needs a restart.
- **Looks are in-game checks.** The Try it preview lists commands in **What happened** instead of showing their results, and the tab as the game draws it is best checked in the game ([Try it](try-it.md)).

## Vanilla packs

Commands, creative tabs, game rules and statistics are not in the resource or data pack exports: they need the runtime. The export says `export.needs-jar` ("only works in the Fabric mod jar. Share my mod makes one.") for each command and tab. A function in a vanilla data pack that runs a project command is kept with the warning `export.mod-only-function`, since a vanilla game would not know the command. The language file keys (`command.<namespace>.<name>.feedback` and `itemGroup.<namespace>.<name>`) go into the resource pack.

The [Java project export](eject.md) contains commands (`ModCommands`, with Brigadier builders for all 44 kinds of words and the same macro values), tabs (`ModCreativeTabs`, hand order included), game rules and statistics.

## The in-game check

Press **Play** (or export the Fabric mod jar). Type `/` in chat: your commands are listed with their words, and a wrong value is refused with the game's own message. In a creative world, open the creative inventory: your tab is on the second page when the vanilla tabs fill the first. For a command with a function, run it with a player selector, a number and a place to see what arrives. For a tab in your own order, check the order. Type `/gamerule <namespace>:<name>` to read and set a game rule, and open **Statistics** (Esc, then **Statistics**, **General**) to see a statistic count. Look for `registered N command(s)`, `registered N creative tab(s)`, `registered N game rule(s)` and `registered N statistic(s)` in the log (`[msm_runtime]` lines).

The other chapters are listed in the [user guide](/).
