# ADR 0047: Easy and Advanced mode, friendlier navigation, live armour preview, texture painting

## Context

The user tried the app on 2026-11-06 (screenshot: the AI helper building a mace in a project with an equipment element open). Their feedback: the art needs improving or must be customisable; navigation should be easier; it should be clear that a whole new project can be started with the AI helper; armour and similar content should preview live while it is edited, with each part expandable and clickable and configurable; and there should be an easy and an advanced mode.

The sidebar groups elements under raw kind ids (`MINECRAFT:EQUIPMENT`, `MSM:ITEM`), shows every technical element (models, item definitions, pack and mod settings, language files) at the same level as the content a beginner cares about, and cannot be searched or collapsed. Element editors always offer Raw JSON. The armour figure exists only inside the Creator. Placeholder textures can be replaced only by importing a PNG made elsewhere.

## Decision

- **D1 Modes.** A UI preference `mode`, `easy` or `advanced`, kept in the renderer's local storage with the other view preferences (not in the project, not in main's settings: it changes no file). A brand-new install (launch notice `welcome`) starts in Easy; an existing install, and test runs, stay in Advanced, which is today's interface. **View → Easy Mode / Advanced Mode**, the toolbar's mode switch and the palette switch it.
  - Easy: the sidebar shows content by Creator set and friendly groups and folds technical groups (models, item looks, block states, pack settings, mod settings, names) under **More**; the editor shows the Form only (Raw JSON is hidden); the empty editor area leads with **Create something…** and **Build with the AI helper…**.
  - Advanced: every group, kind ids next to the friendly names, Raw JSON.
- **D2 Navigation.** In both modes the sidebar has a search box (matches id and kind), friendly group headings with the kind id as a subtitle in Advanced, and collapsible groups whose state is remembered. Elements made by one Create (same `meta.creator.setId`) are listed together under the set's name in Easy mode.
- **D3 Start with the AI helper.** **New project with the AI helper…** (the New menu, the palette, the Welcome and the empty editor area) asks what to make, creates a blank project in a folder the user picks, opens the AI helper in Build mode and sends the description. Without a key it opens Settings → AI helper first.
- **D4 Live armour preview.** The Preview tab previews `minecraft:equipment` elements and `msm:item`s with `msm:armor` on the humanoid figure the Creator uses (`preview/geo/armour.ts`), redrawn as the element changes. A parts list beside it (helmet, chestplate, leggings, boots, and horse and wolf body layers when present) has one row per part: it expands to show the layer textures, toggles the part on the figure and, when clicked, moves the form to that part's field.
- **D5 Customisable art.** **Paint…** on a texture asset (sidebar asset rows, and image fields) opens a pixel editor: pencil, eraser, fill, eyedropper, a palette from the texture plus a colour picker, zoom, undo and redo inside the editor, and Save, which replaces the bytes through `applyChangeset` writes so one Undo in the app restores the old picture ([ADR 0045](0045-undoable-asset-writes.md)). The placeholder patterns get shading and outlines where they are flat.

## Consequences

- Beginners see their content, not the files behind it; nothing is removed from Advanced mode, so guides written for it stay true there.
- Tests run in Advanced mode unless a test switches; the Easy-mode behaviour has its own tests.
- The guide gains a page section on the modes and on painting textures; screenshots and labels in other pages describe Advanced mode.

## Status

Accepted (2026-11-06) by the user's request; for app 1.1.0.
