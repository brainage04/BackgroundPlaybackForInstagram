# Instagram Background Playback

Instagram's website pauses a video as soon as you switch to another tab, or even just click
into another window, and it gives you no way to skip back or forward. This Chrome extension
fixes both: a reel or video keeps playing (and you keep hearing it) while you do something
else, and hovering over a video shows a seek bar.

There are no settings, it doesn't touch your account, and it never sends anything anywhere.

## Seeking

Move the pointer over a video and a bar appears near its bottom edge, clear of Instagram's
own mute button, volume slider and tagged-people button:

- **−5** and **+5** jump back or forward 5 seconds.
- Click or drag along the track to jump anywhere; the lighter part shows what has loaded.
- The time on the right is the position and the video's length.

On narrow videos the bar drops the time first and then the skip buttons, so the track stays
wide enough to use.

The bar hides itself 2.5 seconds after the pointer stops moving over the video.

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

### Seek bar

Instagram's own overlays sit on top of its `<video>` elements, so `src/seek-controls.js`
draws the bar outside Instagram's page structure, in a closed shadow root fixed to the
bottom of whichever video is under the pointer. It finds that video with
`document.elementsFromPoint`, seeks by setting the video's `currentTime`, and stops its own
clicks from reaching Instagram, which would otherwise pause or mute the video. It runs in
the extension's isolated world, so Instagram's scripts cannot see or change it.

Both scripts run only on `https://www.instagram.com/*`, and the extension needs no
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
- `src/keep-visible.js`: the content script.
- `icons/`: editable SVG icon and generated PNGs.
- `scripts/`: ZIP builder, reload helper, and store-asset renderer.
- `store-assets/`: Web Store listing pages and generated images.

See [PRIVACY.md](./PRIVACY.md) for the privacy policy.
