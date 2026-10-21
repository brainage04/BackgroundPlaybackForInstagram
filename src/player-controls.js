// X-style controls for Instagram videos: a seek line, play/pause, time, volume,
// picture-in-picture and fullscreen, plus sound on by default.
//
// Instagram's overlays sit on top of its <video> elements, so the controls live outside
// Instagram's DOM in a closed shadow root laid over whichever video the pointer is on.
// Runs in Instagram's page world so it can drive Instagram's own player controller
// (found through React's fiber tree); that keeps Instagram's play, seek and mute state in
// step with the controls. When no controller is found, the controls fall back to the
// <video> element itself.
(() => {
  "use strict";

  const HIDE_AFTER_MS = 2500;
  const MIN_VIDEO_WIDTH = 160;
  const MIN_VIDEO_HEIGHT = 140;
  const CORNER_BUTTON_MAX = 120;

  const ICONS = {
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
    volume:
      '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15 9a4.2 4.2 0 0 1 0 6M17.5 6.5a7.8 7.8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    muted:
      '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    pip: '<path d="M10 4.5H5.5a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M13 4.5h6.5V11M19.5 4.5 13 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="11.5" y="12.5" width="6" height="4.5" rx=".6"/>',
    fullscreen:
      '<path d="M4.5 9.5v-5h5M14.5 4.5h5v5M19.5 14.5v5h-5M9.5 19.5h-5v-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
    exitFullscreen:
      '<path d="M9.5 4.5v5h-5M19.5 9.5h-5v-5M14.5 19.5v-5h5M4.5 14.5h5v5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

  const host = document.createElement("div");
  host.style.cssText =
    "all: initial; position: fixed; z-index: 2147483647; display: none; pointer-events: none;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      * {
        box-sizing: border-box;
      }
      .chrome {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        padding: 28px 10px 4px;
        background: linear-gradient(to top, rgb(0 0 0 / 62%), rgb(0 0 0 / 0%));
        color: #fff;
        font: 500 15px/1 system-ui, sans-serif;
        user-select: none;
      }
      .progress {
        position: relative;
        height: 16px;
        margin: 0 2px;
        cursor: pointer;
        pointer-events: auto;
        touch-action: none;
      }
      .rail,
      .buffered,
      .played {
        position: absolute;
        top: 6px;
        left: 0;
        height: 3px;
        border-radius: 2px;
        transition:
          height 0.1s,
          top 0.1s;
      }
      .rail {
        right: 0;
        background: rgb(255 255 255 / 30%);
      }
      .buffered {
        background: rgb(255 255 255 / 50%);
      }
      .played {
        background: #fff;
      }
      .thumb {
        position: absolute;
        top: 1px;
        width: 13px;
        height: 13px;
        margin-left: -6.5px;
        border-radius: 50%;
        background: #fff;
        transform: scale(0);
        transition: transform 0.1s;
      }
      .progress:hover .rail,
      .progress:hover .buffered,
      .progress:hover .played,
      .scrubbing .rail,
      .scrubbing .buffered,
      .scrubbing .played {
        top: 5px;
        height: 5px;
      }
      .progress:hover .thumb,
      .scrubbing .thumb {
        transform: scale(1);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 2px;
        height: 40px;
      }
      .spacer {
        flex: 1;
      }
      button {
        display: grid;
        flex: none;
        place-items: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: 0;
        border-radius: 50%;
        background: none;
        color: inherit;
        cursor: pointer;
        pointer-events: auto;
      }
      button:hover {
        background: rgb(255 255 255 / 14%);
      }
      svg {
        width: 22px;
        height: 22px;
        fill: currentColor;
      }
      .time {
        flex: none;
        margin-left: 6px;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .volume {
        position: relative;
        pointer-events: auto;
      }
      .volume-pop {
        position: absolute;
        bottom: 36px;
        left: 50%;
        display: none;
        width: 40px;
        height: 132px;
        margin-left: -20px;
        padding: 14px 0;
        border-radius: 20px;
        background: rgb(40 40 40 / 82%);
        touch-action: none;
        cursor: pointer;
      }
      .volume:hover .volume-pop,
      .volume.adjusting .volume-pop {
        display: block;
      }
      .volume-pop::after {
        content: "";
        position: absolute;
        right: 0;
        bottom: -8px;
        left: 0;
        height: 8px;
      }
      .volume-rail {
        position: relative;
        width: 4px;
        height: 100%;
        margin: 0 auto;
        border-radius: 2px;
        background: rgb(255 255 255 / 30%);
      }
      .volume-level {
        position: absolute;
        right: 0;
        bottom: 0;
        left: 0;
        border-radius: 2px;
        background: #fff;
      }
      .volume-thumb {
        position: absolute;
        left: 50%;
        width: 16px;
        height: 16px;
        margin: 0 0 -8px -8px;
        border-radius: 50%;
        background: #fff;
      }
      [hidden] {
        display: none !important;
      }
    </style>
    <div class="chrome">
      <div class="progress" role="slider" aria-label="Seek">
        <div class="rail"></div>
        <div class="buffered"></div>
        <div class="played"></div>
        <div class="thumb"></div>
      </div>
      <div class="row">
        <button class="play" data-priority="0"></button>
        <span class="time" data-priority="1"></span>
        <span class="spacer"></span>
        <div class="volume" data-priority="0">
          <div class="volume-pop" role="slider" aria-label="Volume">
            <div class="volume-rail">
              <div class="volume-level"></div>
              <div class="volume-thumb"></div>
            </div>
          </div>
          <button class="mute"></button>
        </div>
        <button class="pip" title="Picture-in-Picture" data-priority="2">${icon("pip")}</button>
        <button class="fullscreen" data-priority="3"></button>
      </div>
    </div>`;

  const $ = (selector) => root.querySelector(selector);
  const chrome = $(".chrome");
  const progress = $(".progress");
  const buffered = $(".buffered");
  const played = $(".played");
  const thumb = $(".thumb");
  const row = $(".row");
  const playButton = $(".play");
  const time = $(".time");
  const volume = $(".volume");
  const volumePop = $(".volume-pop");
  const volumeLevel = $(".volume-level");
  const volumeThumb = $(".volume-thumb");
  const muteButton = $(".mute");
  const pipButton = $(".pip");
  const fullscreenButton = $(".fullscreen");
  const droppable = [...row.querySelectorAll("[data-priority]")]
    .filter((element) => element.dataset.priority !== "0")
    .sort((a, b) => a.dataset.priority - b.dataset.priority);

  let video = null;
  let hideTimer = 0;
  let frame = 0;
  let scrubbing = false;
  let adjustingVolume = false;
  let overControls = false;
  let fitKey = "";
  let lastCornerScan = 0;
  let userMuted = false;
  let chosenVolume = null;
  let volumeReverts = [];
  const rendered = {};

  // ---- Instagram's player controller -------------------------------------------------

  const controllers = new WeakMap();

  function findController(value, depth) {
    if (!value || typeof value !== "object" || depth > 3 || value instanceof Node) {
      return null;
    }
    if (
      typeof value.selectVideoQuality === "function" &&
      typeof value.getCurrentState === "function"
    ) {
      return value;
    }
    let keys;
    try {
      keys = Object.keys(value);
    } catch {
      return null;
    }
    for (const key of keys.slice(0, 40)) {
      let child;
      try {
        child = value[key];
      } catch {
        continue;
      }
      const found = findController(child, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function controllerFor(target) {
    const cached = controllers.get(target);
    if (cached && cached.controller) {
      try {
        if (cached.controller.internal_getVideoElement() === target) {
          return cached.controller;
        }
      } catch {
        // Stale controller; search again.
      }
    } else if (cached && performance.now() - cached.searchedAt < 1000) {
      return null;
    }
    const fiberKey = Object.keys(target).find((key) => key.startsWith("__reactFiber$"));
    let controller = null;
    let fiber = fiberKey ? target[fiberKey] : null;
    for (let depth = 0; fiber && depth < 40 && !controller; depth++, fiber = fiber.return) {
      let hook = fiber.memoizedState;
      for (let i = 0; hook && typeof hook === "object" && i < 100 && !controller; i++) {
        controller = findController(hook.memoizedState, 0);
        hook = hook.next;
      }
    }
    if (controller) {
      try {
        if (controller.internal_getVideoElement() !== target) {
          controller = null;
        }
      } catch {
        controller = null;
      }
    }
    controllers.set(target, { controller, searchedAt: performance.now() });
    return controller;
  }

  function playerState(target) {
    const controller = controllerFor(target);
    try {
      return controller ? controller.getCurrentState() : null;
    } catch {
      return null;
    }
  }

  // ---- Player actions ----------------------------------------------------------------

  function duration(target) {
    if (Number.isFinite(target.duration)) {
      return target.duration;
    }
    const { seekable } = target;
    return seekable.length ? seekable.end(seekable.length - 1) : 0;
  }

  function seek(seconds) {
    const end = duration(video);
    if (end <= 0) {
      return;
    }
    const position = Math.min(Math.max(seconds, 0), end);
    const controller = controllerFor(video);
    if (controller) {
      controller.seek(position);
    } else {
      video.currentTime = position;
    }
    render();
  }

  function togglePlay() {
    const controller = controllerFor(video);
    if (video.paused) {
      controller ? controller.play("user_initiated") : video.play();
    } else {
      controller ? controller.pause("user_initiated") : video.pause();
    }
  }

  function setMuted(target, muted) {
    const controller = controllerFor(target);
    if (controller) {
      controller.setMuted(muted, "user_initiated");
    } else {
      target.muted = muted;
    }
  }

  // Instagram's audio manager puts every video back to its own remembered volume when
  // playback starts, and its controller's setVolume does not change that memory. So the
  // volume picked here is set on the element and re-applied whenever Instagram changes
  // it, with a cap in case Instagram ever fights back on every change.
  function setVolume(level) {
    const value = Math.min(Math.max(level, 0), 1);
    chosenVolume = value;
    video.volume = value;
    if (value > 0 && video.muted) {
      setMuted(video, false);
    }
    userMuted = value === 0;
  }

  function keepChosenVolume(target) {
    if (chosenVolume === null || Math.abs(target.volume - chosenVolume) < 0.005) {
      return;
    }
    const now = performance.now();
    volumeReverts = volumeReverts.filter((at) => now - at < 10000);
    if (volumeReverts.length < 20) {
      volumeReverts.push(now);
      target.volume = chosenVolume;
    }
  }

  async function togglePictureInPicture() {
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      console.warn("Instagram Background Playback: picture-in-picture failed.", error);
    }
  }

  function fullscreenTarget(target) {
    return target.parentElement || target;
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        const target = fullscreenTarget(video);
        target.setAttribute("data-igbp-fullscreen", "");
        await target.requestFullscreen();
      }
    } catch (error) {
      console.warn("Instagram Background Playback: fullscreen failed.", error);
    }
  }

  // Fullscreen shows only the fullscreen element and its descendants, so the controls
  // move into it while fullscreen and back out afterwards. The video is letterboxed
  // rather than cropped to the screen.
  const pageStyle = document.createElement("style");
  pageStyle.textContent = `
    [data-igbp-hidden] { visibility: hidden !important; }
    [data-igbp-fullscreen]:fullscreen { background: #000 !important; }
    [data-igbp-fullscreen]:fullscreen > video {
      width: 100% !important;
      height: 100% !important;
      object-fit: contain !important;
    }`;
  (document.head || document.documentElement).append(pageStyle);

  document.addEventListener("fullscreenchange", () => {
    const element = document.fullscreenElement;
    if (element && element.hasAttribute("data-igbp-fullscreen")) {
      element.append(host);
    } else {
      document.querySelectorAll("[data-igbp-fullscreen]").forEach((node) => {
        node.removeAttribute("data-igbp-fullscreen");
      });
      document.documentElement.append(host);
    }
    fitKey = "";
  });

  // ---- Sound on by default -----------------------------------------------------------

  // Chrome pauses a video that is unmuted before the page has had a click or key press,
  // so autoplaying videos are unmuted once the page has user activation. A mute chosen
  // by the user (in these controls or Instagram's own button) is respected until the
  // page is reloaded.
  function unmuteByDefault(target) {
    if (!userMuted && target.muted && navigator.userActivation.hasBeenActive) {
      setMuted(target, false);
    }
  }

  document.addEventListener(
    "playing",
    (event) => {
      if (event.target instanceof HTMLVideoElement) {
        keepChosenVolume(event.target);
        unmuteByDefault(event.target);
      }
    },
    true
  );

  document.addEventListener(
    "volumechange",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLVideoElement)) {
        return;
      }
      keepChosenVolume(target);
      // A playing video muted or unmuted within moments of a click or key press was
      // changed by the user, in these controls or Instagram's own button, unless
      // Instagram says it muted it itself (while moving between reels or stories, or from
      // its audio manager). The video Instagram is leaving is paused by then.
      if (target.paused || !navigator.userActivation.isActive) {
        return;
      }
      if (!target.muted && target.volume > 0) {
        userMuted = false;
      } else if (target.muted) {
        const reason = playerState(target)?.lastMuteReason || "";
        if (
          !reason.endsWith("_transition_phase_initiated") &&
          reason !== "audio_manager_initiated"
        ) {
          userMuted = true;
        }
      }
    },
    true
  );

  // Videos already playing when the page first gets user activation are unmuted then;
  // later videos are unmuted as they start. Doing this only once matters: after a later
  // click on Instagram's own mute button, the volumechange that marks the mute as the
  // user's arrives as a separate task and would lose the race against a re-unmute.
  const activationEvents = ["pointerup", "keydown"];
  function onFirstActivation() {
    if (!navigator.userActivation.hasBeenActive) {
      return;
    }
    for (const type of activationEvents) {
      window.removeEventListener(type, onFirstActivation, true);
    }
    setTimeout(() => {
      for (const target of document.querySelectorAll("video")) {
        if (!target.paused) {
          unmuteByDefault(target);
        }
      }
    });
  }
  for (const type of activationEvents) {
    window.addEventListener(type, onFirstActivation, true);
  }

  // ---- Rendering ---------------------------------------------------------------------

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const s = String(total % 60).padStart(2, "0");
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  function setIcon(button, name, label) {
    if (rendered[button.className] !== name) {
      rendered[button.className] = name;
      button.innerHTML = icon(name);
      button.title = label;
      button.setAttribute("aria-label", label);
    }
  }

  function render() {
    const end = duration(video);
    const current = video.currentTime;
    const fraction = end > 0 ? Math.min(current / end, 1) : 0;
    let bufferedEnd = current;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= current && current <= video.buffered.end(i)) {
        bufferedEnd = video.buffered.end(i);
      }
    }
    played.style.width = `${fraction * 100}%`;
    thumb.style.left = `${fraction * 100}%`;
    buffered.style.width = `${end > 0 ? Math.min(bufferedEnd / end, 1) * 100 : 0}%`;
    time.textContent = `${formatTime(current)} / ${formatTime(end)}`;

    setIcon(playButton, video.paused ? "play" : "pause", video.paused ? "Play" : "Pause");
    const silent = video.muted || video.volume === 0;
    setIcon(muteButton, silent ? "muted" : "volume", silent ? "Unmute" : "Mute");
    const level = silent ? 0 : video.volume;
    volumeLevel.style.height = `${level * 100}%`;
    volumeThumb.style.bottom = `${level * 100}%`;

    const fullscreen = Boolean(document.fullscreenElement);
    setIcon(
      fullscreenButton,
      fullscreen ? "exitFullscreen" : "fullscreen",
      fullscreen ? "Exit full screen" : "Full screen"
    );
    pipButton.hidden = !document.pictureInPictureEnabled || video.disablePictureInPicture;
    fit();
  }

  // On narrow videos, drop the time, then picture-in-picture and fullscreen rather than
  // let the row overflow. Re-measured only when the width or label changes.
  function fit() {
    const key = `${host.style.width}|${time.textContent.length}|${pipButton.hidden}`;
    if (key === fitKey) {
      return;
    }
    fitKey = key;
    droppable.forEach((element) => (element.style.display = ""));
    for (const element of droppable) {
      if (row.scrollWidth <= row.clientWidth) {
        break;
      }
      element.style.display = "none";
    }
  }

  // ---- Placement and visibility ------------------------------------------------------

  // Instagram's mute and tagged-people buttons sit in the video's bottom corners, under
  // these controls; they are hidden while the controls show and restored afterwards.
  // Instagram only draws them once the pointer is over the video and re-renders them,
  // so the corners are checked again a few times a second.
  function hideCornerButtons(rect) {
    lastCornerScan = performance.now();
    for (const x of [rect.left + 24, rect.right - 24]) {
      const candidates = document.elementsFromPoint(x, rect.bottom - 24).filter((element) => {
        if (element === host || element === video || element.contains(video)) {
          return false;
        }
        const box = element.getBoundingClientRect();
        return box.width <= CORNER_BUTTON_MAX && box.height <= CORNER_BUTTON_MAX;
      });
      const largest = candidates.sort((a, b) => {
        const p = a.getBoundingClientRect();
        const q = b.getBoundingClientRect();
        return q.width * q.height - p.width * p.height;
      })[0];
      if (largest) {
        largest.setAttribute("data-igbp-hidden", "");
      }
    }
  }

  function restoreCornerButtons() {
    document.querySelectorAll("[data-igbp-hidden]").forEach((element) => {
      element.removeAttribute("data-igbp-hidden");
    });
  }

  function place() {
    const rect = video.getBoundingClientRect();
    if (!video.isConnected || rect.width < MIN_VIDEO_WIDTH || rect.height < MIN_VIDEO_HEIGHT) {
      hide();
      return false;
    }
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.width = `${rect.width}px`;
    host.style.height = `${rect.height}px`;
    return true;
  }

  function tick() {
    frame = 0;
    if (!video || !place()) {
      return;
    }
    if (performance.now() - lastCornerScan > 400) {
      hideCornerButtons(video.getBoundingClientRect());
    }
    render();
    frame = requestAnimationFrame(tick);
  }

  function show(target) {
    if (target !== video) {
      restoreCornerButtons();
      video = target;
      fitKey = "";
      if (!place()) {
        return;
      }
      hideCornerButtons(video.getBoundingClientRect());
    }
    if (!host.isConnected) {
      document.documentElement.append(host);
    }
    host.style.display = "block";
    if (!frame) {
      frame = requestAnimationFrame(tick);
    }
    scheduleHide();
  }

  function hide() {
    host.style.display = "none";
    cancelAnimationFrame(frame);
    frame = 0;
    restoreCornerButtons();
    video = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (scrubbing || adjustingVolume || overControls) {
        scheduleHide();
        return;
      }
      hide();
    }, HIDE_AFTER_MS);
  }

  function videoAt(x, y) {
    return document
      .elementsFromPoint(x, y)
      .find(
        (element) =>
          element instanceof HTMLVideoElement &&
          element.getBoundingClientRect().width >= MIN_VIDEO_WIDTH
      );
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      if (scrubbing || adjustingVolume) {
        return;
      }
      const path = event.composedPath();
      // Only the controls themselves take pointer events, and from outside the closed
      // shadow root they all appear as the host.
      overControls = path.includes(host);
      if (overControls) {
        scheduleHide();
        return;
      }
      const target = videoAt(event.clientX, event.clientY);
      if (target) {
        show(target);
      }
    },
    { capture: true, passive: true }
  );

  document.documentElement.addEventListener("pointerleave", () => {
    overControls = false;
    scheduleHide();
  });

  // Keep pointer and click events on the controls away from Instagram's handlers, which
  // would otherwise pause, mute, or open the video underneath.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick"]) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }

  // ---- Control wiring ----------------------------------------------------------------

  playButton.addEventListener("click", togglePlay);
  muteButton.addEventListener("click", () => {
    const unmute = video.muted || video.volume === 0;
    if (unmute && video.volume === 0) {
      setVolume(1);
    }
    setMuted(video, !unmute);
    userMuted = !unmute;
  });
  pipButton.addEventListener("click", togglePictureInPicture);
  fullscreenButton.addEventListener("click", toggleFullscreen);

  function seekToPointer(event) {
    const rect = progress.getBoundingClientRect();
    seek(((event.clientX - rect.left) / rect.width) * duration(video));
  }

  progress.addEventListener("pointerdown", (event) => {
    scrubbing = true;
    chrome.classList.add("scrubbing");
    progress.setPointerCapture(event.pointerId);
    seekToPointer(event);
  });
  progress.addEventListener("pointermove", (event) => {
    if (scrubbing) {
      seekToPointer(event);
    }
  });
  for (const type of ["pointerup", "pointercancel"]) {
    progress.addEventListener(type, () => {
      scrubbing = false;
      chrome.classList.remove("scrubbing");
      scheduleHide();
    });
  }

  function volumeToPointer(event) {
    const rect = volumePop.querySelector(".volume-rail").getBoundingClientRect();
    setVolume((rect.bottom - event.clientY) / rect.height);
  }

  volumePop.addEventListener("pointerdown", (event) => {
    adjustingVolume = true;
    volume.classList.add("adjusting");
    volumePop.setPointerCapture(event.pointerId);
    volumeToPointer(event);
  });
  volumePop.addEventListener("pointermove", (event) => {
    if (adjustingVolume) {
      volumeToPointer(event);
    }
  });
  for (const type of ["pointerup", "pointercancel"]) {
    volumePop.addEventListener(type, () => {
      adjustingVolume = false;
      volume.classList.remove("adjusting");
      scheduleHide();
    });
  }
})();
