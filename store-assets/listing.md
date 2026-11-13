# Chrome Web Store listing

Text for the developer dashboard. The name and summary come from `manifest.json`.

## Store listing tab

Name: Background Playback for Instagram

Summary (132 characters at most):

> Keeps Instagram videos playing in background tabs, with sound on and full player controls.

Description:

> Instagram's website pauses a video as soon as you switch to another tab or click into
> another window. It also starts every video muted and gives you no way to skip back or
> forward. This extension fixes all three.
>
> - Videos keep playing, and you keep hearing them, while you use another tab or window.
> - Videos play with sound. Chrome only allows that after your first click on the page, so
>   the first video stays muted until then. If you mute a video, videos stay muted until you
>   unmute or reload the page.
> - Move the pointer over a video for player controls: a seek line, play and pause, the
>   time, volume, video quality, picture-in-picture and full screen.
>
> There are no settings. The extension asks for no permissions, runs only on
> www.instagram.com, doesn't touch your account and never sends anything anywhere.
>
> Chrome itself pauses muted videos in background tabs, so turn the sound on before
> switching away. Instagram can't tell the tab is in the background, so it may mark direct
> messages and stories open in that tab as seen.
>
> This extension is not made by or affiliated with Instagram or Meta.

Category: Social networking

Language: English

Graphics:

- Store icon: `icons/icon128.png`
- Screenshot: `store-assets/screenshot-demo-1280x800.png`
- Small promo tile: `store-assets/small-promo-tile-440x280.png`

## Privacy practices tab

Single purpose:

> Keeps Instagram videos playing when the tab is in the background, and adds sound and
> player controls to those videos.

Host permission justification, for the content scripts on `https://www.instagram.com/*`:

> The scripts run on Instagram pages to stop Instagram pausing videos when the tab is in
> the background, and to draw player controls over its videos. They run on no other site.

Remote code: No, I am not using remote code.

Data usage: tick none of the data types, then tick all three certifications.

Privacy policy URL: https://github.com/brainage04/InstagramBackgroundPlayback/blob/master/PRIVACY.md
