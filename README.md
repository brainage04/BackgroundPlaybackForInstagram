# Instagram Background Playback

Instagram's website pauses a video as soon as you switch to another tab, or even just click
into another window, starts every video muted, and gives you no way to skip back or
forward. This Chrome extension fixes all three: a reel or video keeps playing (and you keep
hearing it) while you do something else, videos play with sound, and hovering over a video
shows player controls like X's.

There are no settings, it doesn't touch your account, and it never sends anything anywhere.

## Player controls

Move the pointer over a video and the controls appear along its bottom edge:

- **Seek line** across the full width: click or drag anywhere on it to jump. The lighter
  part shows what has loaded.
- **Play/pause** and the **time** (position / length) on the left.
- **Volume** on the right: click to mute or unmute, or hover it and drag the slider that
  pops up. The volume you pick stays for every video until you reload the page.
- **Settings** (gear): **Video quality**, either Auto or one of the resolutions Instagram
  has for that video, read from Instagram's player for each video. The gear only appears
  when there is more than one. A new choice shows within a few seconds (3–9 s in testing)
  without interrupting playback. On a looping reel, the part already played before the
  change keeps the old resolution on later loops.
- **Picture-in-picture** and **full screen**.

While the controls show, Instagram's own mute and tagged-people buttons in the bottom
corners are hidden under them. On narrow videos the controls drop the time first, then
settings and picture-in-picture, so nothing overlaps. The controls hide 2.5 seconds after
the pointer stops moving over the video.

Stories don't get these controls: they have their own pause and mute buttons, and their
reply box, like and share buttons sit where the controls would go.

## Sound on by default

Videos play with sound instead of muted. Chrome only lets a page unmute a video after you
have clicked or pressed a key on it, so straight after opening Instagram the first video
stays muted until your first click anywhere on the page; every video after that starts
with sound. If you mute a video, with these controls or Instagram's own button, videos stay
muted until you unmute or reload the page.

## Install in Chrome

There is no Chrome Web Store listing, so it is installed by hand, which takes about a minute:

1. Download or copy this folder somewhere you will keep it.
2. In Chrome, type `chrome://extensions` in the address bar and press Enter.
3. Turn on **Developer mode** with the switch in the top-right corner.
4. Click **Load unpacked** and pick this folder (or drag the folder onto the page).
5. Reload any Instagram tab that is already open.

To remove it later, click **Remove** on the same page.

## How it works

### Background playback

Instagram's player pauses when `document.hidden` is true or `document.hasFocus()` is false,
and checks again on the window's `blur` and `focus` events and the document's
`visibilitychange` event. `src/keep-visible.js` runs in Instagram's page before its own
scripts and:

- makes `document.hidden` always `false`, `document.visibilityState` always `"visible"`,
  and `document.hasFocus()` always `true`
- stops `visibilitychange` events and the window's own `blur` event before Instagram's
  listeners see them. Blur events from text boxes and other elements pass through untouched.

### Player controls and sound

Instagram's own overlays sit on top of its `<video>` elements, so `src/player-controls.js`
draws the controls outside Instagram's page structure, in a closed shadow root laid over
whichever video is under the pointer (found with `document.elementsFromPoint`). It stops
its own clicks from reaching Instagram, which would otherwise pause or mute the video.

It runs in Instagram's page world rather than the extension's isolated world, because it
drives Instagram's own player controller, found by walking React's fiber tree up from the
`<video>` element. Play, pause, seek and mute go through that controller so Instagram's
state matches what the controls show, and it is the only way to pick a video quality. The
volume is set on the `<video>` element instead and re-applied when Instagram resets it,
because Instagram's audio manager restores its own remembered volume whenever playback
starts. Without a controller (if Instagram changes its code), everything except video
quality still works through the `<video>` element.

Instagram keeps playing whatever it has already buffered, so on its own a new quality
would show only once that ran out, which for a reel looping from a full buffer is never.
`src/media-source-registry.js` runs before Instagram's scripts and records which
`MediaSource` and `SourceBuffer`s back each video. After a quality change the controls
remove the video buffered more than four seconds ahead of the playhead, and Instagram
refetches it at the new quality. Keeping less than that, or also removing video behind
the playhead, froze the picture for a few seconds and skipped footage in testing.

All three scripts run only on `https://www.instagram.com/*`, and the extension needs no
permissions.

## Limitations

- **Muted videos still pause.** Chrome itself pauses muted or silent videos in background
  tabs, regardless of what the page wants. Turn the sound on in Instagram before switching
  away.
- **Instagram always thinks you are looking at it.** While you have a direct message thread
  open in a background tab, Instagram may treat new messages as seen, as it would if the
  tab were in front.
- Instagram can change its player code at any time, which may stop this working.

## Development

The development tooling requires Node.js `^20.19.0`, `^22.13.0`, or `>=24`.

```sh
npm install
npm run check
```

Use `npm run lint` or `npm run format:check` to run one check, and `npm run format` to apply
Prettier formatting.

The extension has no build step. After editing, reload it in `chrome://extensions`, or run
`npm run reload:extension` while Chrome is running with `--remote-debugging-port=9222`. Set
`EXTENSION_ID`, `EXTENSION_NAME`, or `CDP_PORT` to override how it finds the extension.

`npm run render:store-assets` renders the Web Store images from `store-assets/*.html` with
local headless Chrome (set `CHROME_BIN` if needed). `npm run build:zip` writes
`dist/instagram-background-playback-<version>.zip` containing `manifest.json`, `icons/`, and
`src/`. Keep the versions in `package.json` and `manifest.json` identical.

## Files

- `manifest.json`: extension metadata and the content script registration.
- `src/keep-visible.js`: keeps Instagram from noticing the tab is in the background.
- `src/media-source-registry.js`: records each video's `MediaSource` for quality changes.
- `src/player-controls.js`: the player controls and sound on by default.
- `icons/`: editable SVG icon and generated PNGs.
- `scripts/`: ZIP builder, reload helper, and store-asset renderer.
- `store-assets/`: Web Store listing pages and generated images.

See [PRIVACY.md](./PRIVACY.md) for the privacy policy.
