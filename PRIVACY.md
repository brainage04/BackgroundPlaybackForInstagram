# Privacy Policy

Background Playback for Instagram does not collect, store, sell, or transmit user data. It requests no browser permissions beyond running on Instagram, uses no storage, makes no network calls, and has no analytics.

It only runs three scripts on `https://www.instagram.com/*` pages, all inside your browser:

- `src/keep-visible.js` - tells Instagram's own code that the page is always visible and focused, so videos don't pause when you switch tabs or windows
- `src/media-source-registry.js` - tracks which media buffers belong to each video, so the old quality can be cleared from the buffer after you pick a new one
- `src/player-controls.js` - shows player controls over the video under your pointer, unmutes videos after you click or press a key on the page, and passes your play, pause, seek, volume, quality, picture-in-picture, and full-screen choices to the video or Instagram's own player

To place the controls, these scripts read the page's layout and Instagram's player state. Nothing they read leaves the page.

The extension does not:

- collect personal information or browsing history
- send page content anywhere
- store settings or user data
- use analytics
- contact external servers
- execute remotely hosted code
