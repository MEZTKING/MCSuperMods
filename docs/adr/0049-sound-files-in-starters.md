# ADR 0049: Sound files in starters (the Music disc song)

## Context

The Music disc flow (ADR 0044 D6) bundles no sound: its sound event plays the vanilla `records/cat` until the user imports an `.ogg` with Import assets, edits the sound event's `name` and types the song's length. It was listed as a follow-up ("music disc flow has no audio import"). Starters can take pictures (`image`, ADR 0044 D7) but not sounds.

## Decision

- **D1 Audio parameter.** Plugin API 1.4.0 adds `AudioStarterParameter` (`type: 'audio'`, `default: null`, `maxBytes?`, 8 MB when absent) to the `StarterParameter` union. Its value is an Ogg Vorbis `data:` URL (`data:audio/ogg;base64,...`) or `null`. The host checks the Ogg capture pattern, the Vorbis identification header and the size before passing a value. Additive: `^1.0.0` plugins load unchanged; a plugin that declares an `audio` parameter declares `^1.4.0`.
- **D2 Host.** The wizard renders a file input (`.ogg`) with a summary ("Ogg Vorbis, 2:05, stereo"); the Creator renders **Choose song…** through the host's file picker (`pickFiles`, Ogg filter). The length and channels are read from the container: the identification header gives the sample rate and channels, the last page's granule position the number of samples. Nothing is decoded, and the page cannot play the sound (the window's CSP allows no `data:` media).
- **D3 Music disc flow.** The flow's new **Song file** (`song_file`, at most 16 MB) is stored as `sounds/<song id>.ogg`, the sound event plays `<ns>:<song id>` with `stream: true`, and `length_in_seconds` is the file's length rounded up (the typed **Length in seconds** applies only without a file). The notes say whether the file is mono (it fades with distance from the jukebox) or stereo (it plays at the same volume everywhere). Without a file the bundle is unchanged byte for byte.

## Consequences

- A music disc with the user's own song is one Create away; the song travels in the packs and the mod jar like other sounds.
- The library reads Ogg containers itself (`oggVorbisInfo`), as it reads PNG headers for images, because plugins depend on `@msm/plugin-api` only.

## Status

Accepted (2026-11-07), continuing the follow-ups after 1.2.0 on the user's "Continue"; for app 1.3.0.
