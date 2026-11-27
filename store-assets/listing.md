# Chrome Web Store listing

Text for the developer dashboard. The name and summary come from `manifest.json`.

## Store listing tab

Name: Background Playback for Instagram

Summary (132 characters at most):

> Keeps Instagram videos playing in background tabs, with sound on by default and full player controls

Description:

> Instagram's website pauses videos as soon as you switch to another tab or click into
> another window. It also starts every video muted and gives you no way to seek back or
> forward. This extension fixes all three:
>
> - Videos keep playing (and you keep hearing them) while you use another tab or window
> - Videos play with sound by default - Chrome only allows this after your first click or
>   key press on the page, so the first video stays muted until then (and if you mute a
>   video, videos stay muted until you unmute or reload the page)
> - Hover over a video for player controls - a seek line, play/pause, time, volume, video
>   quality, picture-in-picture, and full screen
>
> There are no settings. The extension only asks for access to www.instagram.com and never
> sends any data anywhere.
>
> Note: Chrome itself pauses muted videos in background tabs, so make sure sound is on
> before switching away. Because Instagram can't tell the tab is in the background, it may
> also mark direct messages and stories open in that tab as seen.
>
> This extension is not made by or affiliated with Instagram or Meta.

Category: Social networking

Language: English

Graphics:

- Store icon: `icons/icon128.png`
- Screenshots, in this order: `store-assets/screenshot-controls-1280x800.png`,
  `store-assets/screenshot-quality-1280x800.png`, `store-assets/screenshot-demo-1280x800.png`
- Small promo tile: `store-assets/small-promo-tile-440x280.png`

Homepage URL: https://github.com/brainage04/BackgroundPlaybackForInstagram

Support URL: https://github.com/brainage04/BackgroundPlaybackForInstagram/issues

## Privacy practices tab

Single purpose:

> Keeps Instagram videos playing when the tab is in the background, with sound on by
> default and player controls.

Host permission justification, for the content scripts on `https://www.instagram.com/*`:

> The content scripts run on https://www.instagram.com/* to stop Instagram pausing videos
> in background tabs and to add player controls over its videos. They don't run on any
> other site.

Remote code: No, I am not using remote code.

Data usage: tick none of the data types, then tick all three certifications.

Privacy policy URL: https://github.com/brainage04/BackgroundPlaybackForInstagram/blob/master/PRIVACY.md
