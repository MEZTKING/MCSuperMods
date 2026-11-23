/**
 * The settings the search finds (ADR 0124 D1, D3; B662): one line per setting of the Settings
 * dialog, with its label exactly as the dialog shows it, one plain sentence, the section it sits
 * in and the extra words people type for it. Each line of the dialog carries
 * `data-setting="<id>"`; `settings-catalogue.test.tsx` checks every line here against the
 * dialog's real controls and every control against a line (a line inside a More options is
 * checked with it open, ADR 0130 D3).
 * `SettingsDialog`'s `focusSetting` opens the dialog at a line by its id.
 *
 * @packageDocumentation
 */

export interface SettingsCatalogueEntry {
  /** The line's id (`data-setting` in the dialog; `focusSetting` takes it). */
  readonly id: string;
  /** The line's label, exactly as the dialog shows it. */
  readonly title: string;
  /** One plain sentence on what the setting does (British English). */
  readonly sentence: string;
  /** The heading of the dialog section the line sits under. */
  readonly section: string;
  /** Extra words people type for it (American spellings and short forms included). */
  readonly words?: readonly string[];
  /** The line sits inside a More options of its section (ADR 0130 D3). */
  readonly more?: boolean;
}

export const SETTINGS_CATALOGUE: readonly SettingsCatalogueEntry[] = [
  {
    id: 'install-target',
    title: 'Install packs into',
    sentence: 'Choose the game folder or launcher instance that packs and mods are installed into.',
    section: 'Game locations',
    words: ['install target', 'instance', 'launcher', 'game folder', 'location', 'where'],
  },
  {
    id: 'minecraft-folder',
    title: 'Official launcher folder',
    sentence: 'Use another Minecraft folder in place of the one found for the official launcher.',
    section: 'Game locations',
    words: ['.minecraft', 'minecraft folder', 'game directory', 'path', 'browse', 'detected'],
  },
  {
    id: 'launcher-folders',
    title: 'Other launchers',
    sentence:
      'Add the folder of a Prism Launcher, MultiMC or CurseForge install kept somewhere else.',
    section: 'Game locations',
    words: ['prism', 'multimc', 'polymc', 'curseforge', 'launcher folder', 'instances'],
  },
  {
    id: 'vanilla-assets',
    title: 'Vanilla assets',
    sentence:
      'Copy the models and textures of your own Minecraft into the cache so the preview can show them.',
    section: 'Vanilla assets',
    words: ['extract', 'unpack', 'client jar', 'textures', 'models', 'cache', 'preview'],
  },
  {
    id: 'auto-update',
    title: 'Check for updates automatically',
    sentence: 'Look for a new release of MCSuperMods shortly after it starts.',
    section: 'Updates',
    words: ['update', 'auto update', 'new version', 'release', 'upgrade', 'download'],
  },
  {
    id: 'showcase-clips',
    title: 'Play showcase clips',
    sentence: 'Play the moving pictures on Home and in New project; off shows still pictures.',
    section: 'Showcase',
    words: ['animation', 'animations', 'moving pictures', 'video', 'autoplay', 'motion'],
  },
  {
    id: 'remember-searches',
    title: 'Remember my searches',
    sentence: 'Keep your recent searches and chosen results on this computer so they come first.',
    section: 'Search',
    words: ['search history', 'recent searches', 'history', 'privacy', 'recent'],
  },
  {
    id: 'clear-searches',
    title: 'Clear my searches',
    sentence: 'Forget the searches and results remembered so far.',
    section: 'Search',
    words: ['clear history', 'delete history', 'forget', 'erase', 'privacy', 'reset'],
  },
  {
    id: 'backups-folder',
    title: 'Backups folder',
    sentence: 'Open the folder on this computer where the world backups are kept.',
    section: 'World backups',
    words: ['backup', 'backups', 'zip', 'saves', 'open folder'],
  },
  {
    id: 'backups-before-install',
    title: 'Back up a world before installing into it',
    sentence: 'Save a copy of the whole world before a data pack is installed into it.',
    section: 'World backups',
    words: ['backup', 'save copy', 'world copy', 'safety', 'data pack'],
  },
  {
    id: 'backups-keep',
    title: 'Backups to keep per world',
    sentence: 'Choose how many backups of each world are kept before the oldest is deleted.',
    section: 'World backups',
    words: ['backup count', 'how many backups', 'old backups', 'delete backups', 'limit'],
  },
  {
    id: 'backups-restore',
    title: 'Restore a backup',
    sentence: 'Unpack a world backup beside the world as a new world folder.',
    section: 'World backups',
    words: ['restore', 'undo world', 'get my world back', 'recover', 'lost world'],
  },
  {
    id: 'ai-key',
    title: 'Your Anthropic key',
    sentence: 'Save, check or remove the key the AI helper uses to talk to Claude.',
    section: 'AI helper',
    words: ['api key', 'claude key', 'anthropic', 'ai key', 'token', 'set up ai'],
  },
  {
    id: 'ai-model',
    title: 'Model',
    sentence: 'Choose which Claude model the AI helper uses.',
    section: 'AI helper',
    words: ['ai model', 'claude', 'opus', 'sonnet', 'haiku', 'cheaper', 'smarter'],
  },
  {
    id: 'ai-effort-chat',
    title: 'Effort for questions and small changes',
    sentence:
      'Choose how long the AI helper thinks before it answers a question or makes a small change.',
    section: 'AI helper',
    words: ['effort', 'thinking', 'chat', 'questions', 'cost', 'speed'],
  },
  {
    id: 'ai-effort-build',
    title: 'Effort for whole builds',
    sentence: 'Choose how long the AI helper thinks before it builds a whole mod.',
    section: 'AI helper',
    words: ['effort', 'thinking', 'build', 'cost', 'speed'],
  },
  {
    id: 'ai-fallbacks',
    title: 'Let Anthropic answer with another Claude model when this one declines',
    sentence: 'Let another Claude model answer when the chosen one declines a request.',
    section: 'AI helper',
    words: ['fallback', 'fall back', 'declines', 'refuses', 'other model'],
  },
  {
    id: 'ai-limits',
    title: 'Default limits',
    sentence:
      'Set how many steps and how much writing a run of the AI helper may take before it pauses.',
    section: 'AI helper',
    words: ['limits', 'steps', 'tokens', 'budget', 'cost', 'pause', 'pacing', 'more options'],
    more: true,
  },
  {
    id: 'ai-pictures-service',
    title: 'Image service',
    sentence: 'Choose the service that draws AI pictures from a description.',
    section: 'AI pictures',
    words: ['ai pictures', 'ai art', 'retro diffusion', 'openai', 'image ai', 'textures'],
  },
  {
    id: 'ai-pictures-key',
    title: 'Image service key',
    sentence: 'Save, test or clear your key for the image service.',
    section: 'AI pictures',
    words: ['api key', 'ai pictures key', 'openai key', 'retro diffusion key', 'token'],
  },
  {
    id: 'plugins-folder',
    title: 'Open plugins folder',
    sentence: 'Open the folder where plugins made by other people are installed.',
    section: 'Plugins',
    words: ['plugins', 'add-ons', 'addons', 'extensions', 'third party', 'install plugin'],
  },
];
