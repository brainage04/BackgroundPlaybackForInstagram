# Background Playback for Instagram

Background Playback for Instagram is a Chrome extension that keeps Instagram reels and videos playing when you switch tabs or click into another window. It also starts videos with sound on and adds full player controls when you hover over a video.

There are no settings, and it never sends anything anywhere.

This extension is not made by or affiliated with Instagram or Meta.

## Player controls

Hover over a video and the controls appear along its bottom edge:

- **Seek line** across the full width - click or drag anywhere on it to jump (the lighter part shows what has loaded)
- **Play/pause** and the **time** (position / length) on the left
- **Volume** on the right - click to mute or unmute, or hover it and drag the slider that pops up (the volume you pick stays for every video until you reload the page)
- **Settings** (gear) - **Video quality**, either Auto or one of the resolutions Instagram has for that video (only appears when there is more than one - a new choice shows within a few seconds, and on a looping reel the part already played before the change keeps the old resolution on later loops)
- **Picture-in-picture** and **full screen**

While the controls are visible, Instagram's own mute and tagged-people buttons in the bottom corners are hidden under them. On narrow videos the controls leave out the time, then settings, picture-in-picture and full screen. The controls hide 2.5 seconds after the pointer stops moving over the video.

A video whose bottom edge is under a bar across the page gets no controls.

## Sound on by default

Videos play with sound instead of starting muted.

Chrome only lets a page unmute a video after you click or press a key on it, so straight after opening Instagram the first video stays muted until your first click anywhere on the page. Every video after that starts with sound. If you mute a video (with these controls or Instagram's own button), videos stay muted until you unmute or reload the page.

## Install in Chrome

To install it from this repository:

1. Download or copy this folder somewhere you will keep it
2. In Chrome, type `chrome://extensions` in the address bar and press Enter
3. Turn on **Developer mode** with the switch in the top-right corner
4. Click **Load unpacked** and pick this folder (or drag the folder onto the page)
5. Reload any Instagram tab that is already open

To remove it later, click **Remove** on the same page.

## How it works

### Background playback

Instagram's player pauses when `document.hidden` is true or `document.hasFocus()` is false, and rechecks on the window's `blur` and `focus` events and the document's `visibilitychange` event. `src/keep-visible.js` runs in Instagram's page before its own scripts and:

- makes `document.hidden` always `false`, `document.visibilityState` always `"visible"`, and `document.hasFocus()` always `true`
- stops `visibilitychange` events and the window's own `blur` event before Instagram's listeners see them (blur events from text boxes and other elements pass through untouched)

### Player controls and sound

Instagram's own overlays sit on top of its `<video>` elements, so `src/player-controls.js` draws the controls outside Instagram's page structure in a closed shadow root laid over whichever video is under the pointer (found with `document.elementsFromPoint`). It stops its own clicks from reaching Instagram, which would otherwise pause or mute the video.

It runs in Instagram's page world rather than the extension's isolated world because it drives Instagram's own player controller, found by walking React's fiber tree up from the `<video>` element. Play, pause, seek and mute go through that controller so Instagram's state matches what the controls show, and it is the only way to pick a video quality. Volume is set on the `<video>` element instead and re-applied when Instagram resets it, because Instagram's audio manager restores its own remembered volume whenever playback starts. Without a controller (if Instagram changes its code), everything except video quality still works through the `<video>` element.

Instagram keeps playing whatever it has already buffered, so on its own a new quality would only show once that ran out (which for a reel looping from a full buffer is never). `src/media-source-registry.js` runs before Instagram's scripts and records which `MediaSource` and `SourceBuffer`s back each video. After a quality change the controls remove the video buffered more than four seconds ahead of the playhead, and Instagram refetches it at the new quality.

All three scripts run only on `https://www.instagram.com/*`, and that is the only access the extension asks for.

## Limitations

- **Muted videos still pause** - Chrome itself pauses muted or silent videos in background tabs, regardless of what the page wants (turn the sound on in Instagram before switching away)
- **Instagram always thinks you are looking at it** - while you have a direct message thread open in a background tab, Instagram may treat new messages as seen, and stories open in a background tab keep moving on to the next one so Instagram may mark them as seen too

## Development

The development tooling requires Node.js `^20.19.0`, `^22.13.0`, or `>=24`.

```sh
npm install
npm run check
```

`npm test` loads the extension into headless Chromium, serves fixture pages at Instagram URLs, moves and clicks the pointer over them and checks what the controls do. Set `CHROME_BIN` to a Chromium executable if `chromium` is not on the path - Google Chrome ignores `--load-extension`.

Use `npm run lint` or `npm run format:check` to run one check, and `npm run format` to apply Prettier formatting.

The extension has no build step. After editing, reload it in `chrome://extensions`, or run `npm run reload:extension` while Chrome is running with `--remote-debugging-port=9222`. Set `EXTENSION_ID`, `EXTENSION_NAME`, or `CDP_PORT` to override how it finds the extension.

- `npm run render:store-assets` - renders the Web Store images from `store-assets/*.html` with local headless Chrome (set `CHROME_BIN` if needed)
- `npm run render:store-screenshots` - renders the screenshots of the controls with the extension loaded into headless Chromium over a clip made with `ffmpeg`
- `npm run build:zip` - writes `dist/instagram-background-playback-<version>.zip` containing `manifest.json`, `icons/`, and `src/`, named after the version in `manifest.json` (keep the version in `package.json` the same)

## Files

- `manifest.json` - extension metadata and the content script registration
- `src/keep-visible.js` - keeps Instagram from noticing the tab is in the background
- `src/media-source-registry.js` - records each video's `MediaSource` for quality changes
- `src/player-controls.js` - the player controls and sound on by default
- `icons/` - editable SVG icon and generated PNGs
- `scripts/` - ZIP builder, reload helper, store image renderers and the headless tests
- `store-assets/` - Web Store listing text, listing pages and generated images

See [PRIVACY.md](./PRIVACY.md) for the privacy policy.
