/**
 * A map of the app's places and buttons (ADR 0125 D6, B682), so "where is my sword?" or "how do
 * I give this to a friend?" gets the app's own words. Every label is an exported constant; the
 * app's truth test (B683) finds each one in the app: in the constants the components export
 * (`MAKE_TILES`, `PLAY_CONTROL_LABELS`, `DRAW_IT_FOR_ME_BUTTON`, `MAKE_IT_WITH_AI`, `SHOWCASES`'s heading,
 * the command titles) or in the markup of the component named beside it.
 *
 * The review of the helper's own proposals is left out on purpose (B685, B688): the prompt does
 * not name its headings and buttons. There is one view since ADR 0130.
 */
import { quoted } from './core';

/** The labels the map names, by place, with the component or constant each comes from. */
export const APP_MAP_LABELS = Object.freeze({
  /** The toolbar's one row (`Toolbar.tsx`; Play and Reload from `PLAY_CONTROL_LABELS`). */
  toolbar: Object.freeze([
    'Home',
    'Undo',
    'Redo',
    'Save',
    'Try it',
    'Play',
    'Reload',
    'Share my mod',
    'AI helper',
    'Help',
    'More',
  ]),
  /** The toolbar's More menu (`Toolbar.tsx`, ADR 0131 D1). */
  toolbarMore: Object.freeze([
    'New mod…',
    'Open a mod…',
    'Recent mods',
    'Make something…',
    'Add from the full list…',
    'Bring in pictures or sounds…',
    'Export',
    'Install',
    'Test in Minecraft…',
    'Settings…',
  ]),
  /** The disclosure at the bottom of each part of a thing (`MoreOptions.tsx`). */
  moreOptions: 'More options',
  /** A thing's last part and its raw text (`EditorArea.tsx`). */
  whereItGoes: 'Where it goes',
  editAsRawText: 'Edit as raw text',
  /** Home's headings (`MakeTiles.tsx`, `MyThings.tsx`). */
  makeSomething: 'Make something',
  myThings: 'My things',
  /** A My things card's menu (`MyThings.tsx`). */
  thingMenu: Object.freeze(['Edit in Creator', 'Rename', 'Duplicate', 'Delete']),
  /** The tile that makes a random mod (`MAKE_TILES` id `surprise`). */
  surprise: 'Surprise me',
  /** The showcase (`App.tsx` `showcaseGallery`'s heading, `ShowcaseCard.tsx`, `Home.tsx` `SHOW_SHOWCASE`). */
  showcase: 'See what you can make',
  showcaseButtons: Object.freeze(['Make this', 'See the example']),
  showShowcase: 'Show what you can make',
  /** The problems bar (`ThingsToFix.tsx`). */
  thingsToFix: 'Things to fix',
  nothingToFix: 'Nothing to fix',
  thingsToFixButtons: Object.freeze(['Show me', 'Fix it:', 'Show details']),
  /** Play's menu (`PLAY_CONTROL_LABELS`). */
  playMenu: Object.freeze(['New test world', 'Restart']),
  /** The right-hand panel (`RightDock.tsx`). */
  dockTabs: Object.freeze(['Preview', 'Problems', 'AI helper']),
  /** An open thing's header (`EditorArea.tsx`). */
  elementHeader: Object.freeze(['Edit in Creator', 'Preview', 'Ask AI']),
  /** The picture buttons (`DrawButton.tsx` `DRAW_IT_FOR_ME_BUTTON`; `MakeWithAiButton.tsx`). */
  draw: 'Draw it for me',
  makeWithAi: 'Make it with AI',
  setUpAiPictures: 'Set up AI pictures in Settings',
  /** Settings' section of the picture service (`AiPicturesSettingsSection.tsx`). */
  aiPictures: 'AI pictures',
  /** The picture service a new install uses (`AI_PICTURE_SERVICE_INFO`, `DEFAULT_AI_PICTURE_SERVICE`). */
  aiPictureService: 'Retro Diffusion',
  /** The Help menu's Wishlist (`main/menu.ts`) and the command palette's title. */
  wishlist: 'Wishlist…',
  /** The export of the mod jar (`main/menu.ts`). */
  exportJar: 'Export Fabric Mod Jar…',
} as const);

/**
 * The Home tiles' labels, in Home's order (`MAKE_TILES` of `components/home/tiles.ts`); a tile
 * whose flows the target cannot make is hidden there.
 */
export const APP_MAP_TILES = Object.freeze([
  'Surprise me',
  'Make a block',
  'Make a chest or machine',
  'Make an item',
  'Make a tool or weapon',
  'Make armour',
  'Make food',
  'Make a plant or tree',
  'Make a recipe',
  'Make a mob',
  'Make a pet or animal',
  'Make a trader',
  'Make a vehicle',
  'Make a potion or effect',
  'Make sparkles',
  'Make a magic wand',
  'Make a world',
  'Make a portal',
  'Make a building',
  'Change drops and trades',
  'Make a game',
  'Change how Minecraft looks',
  'Change a Minecraft texture',
  'Make a painting or pattern',
  'Make a sound or music',
  'Paint a picture',
  'Make your mod do something',
  'Make things happen',
  'Build with the AI helper',
]);

const M = APP_MAP_LABELS;

export const APP_MAP = `- The app, by its labels: one view for everyone. The toolbar is one row, ${quoted(M.toolbar)}; "More" holds ${quoted(M.toolbarMore)}, and the menu bar the same ("${M.exportJar}" makes the jar). Every part of an open thing ends in "${M.moreOptions}" with its rarer settings, ids and raw values; its last part "${M.whereItGoes}" holds what uses it and, under its "${M.moreOptions}", "${M.editAsRawText}". Home has "${M.makeSomething}", tiles that open the Creator (plain questions with a live picture) or another maker: ${quoted(APP_MAP_TILES)}; then "${M.myThings}", a card per thing, which opens it, with a menu of ${quoted(M.thingMenu)} (the first only for things a Creator flow made). An empty mod shows "${M.showcase}", clips with ${quoted(M.showcaseButtons)}, later folded under "${M.showShowcase}". "${M.surprise}" makes a random mod to start from. Problems are listed under "${M.thingsToFix}" ("${M.nothingToFix}" when none) with ${quoted(M.thingsToFixButtons)}; the right-hand tabs are ${quoted(M.dockTabs)}, and an open thing's header has ${quoted(M.elementHeader)} ("Preview" is the live view: models, pictures, the world map). "Play" saves, builds and starts Minecraft in a test world (its menu: ${quoted(M.playMenu)}); "Reload" sends changes into the running game and says when one needs a restart. "Share my mod" saves the mod as one file friends put in their mods folder next to Fabric API. Picture fields have "${M.draw}", MSM's own drawing, and "${M.makeWithAi}", which asks the AI picture service set up in Settings, "${M.aiPictures}" (${M.aiPictureService} by default; its own key and cost; until then "${M.setUpAiPictures}"); you cannot make AI pictures yourself. What note_missing_feature notes is in the Wishlist (Help, "${M.wishlist}").`;
