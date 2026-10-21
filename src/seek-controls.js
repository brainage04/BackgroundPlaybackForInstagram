// Adds a seek bar to Instagram videos. Instagram's own overlays cover the <video>
// element, so the bar lives outside Instagram's DOM in a closed shadow root, fixed to
// the bottom edge of whichever video the pointer is over.
(() => {
  "use strict";

  const SKIP_SECONDS = 5;
  const HIDE_AFTER_MS = 2500;
  const MIN_VIDEO_WIDTH = 160;
  const BAR_HEIGHT = 36;
  const BAR_INSET = 8;
  const MIN_TRACK_WIDTH = 48;
  // Instagram puts its mute and tagged-people buttons in the bottom 44 px of a video, and
  // the mute button opens a volume slider upwards along the right edge. Keep clear of both.
  const BAR_BOTTOM_GAP = 52;
  const BAR_RIGHT_GAP = 52;

  const host = document.createElement("div");
  host.style.cssText =
    "all: initial; position: fixed; z-index: 2147483647; display: none; left: 0; top: 0;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      .bar {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 8px;
        height: ${BAR_HEIGHT}px;
        padding: 0 10px;
        border-radius: 10px;
        background: rgb(0 0 0 / 68%);
        color: #fff;
        font: 600 12px/1 system-ui, sans-serif;
        user-select: none;
      }
      button {
        flex: none;
        min-width: 34px;
        height: 24px;
        padding: 0 6px;
        border: 0;
        border-radius: 6px;
        background: rgb(255 255 255 / 16%);
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      button:hover {
        background: rgb(255 255 255 / 30%);
      }
      .track {
        position: relative;
        flex: 1;
        min-width: 0;
        height: 24px;
        cursor: pointer;
        touch-action: none;
      }
      .rail,
      .buffered,
      .played {
        position: absolute;
        top: 10px;
        left: 0;
        height: 4px;
        border-radius: 2px;
      }
      .rail {
        right: 0;
        background: rgb(255 255 255 / 25%);
      }
      .buffered {
        background: rgb(255 255 255 / 45%);
      }
      .played {
        background: #fff;
      }
      .thumb {
        position: absolute;
        top: 6px;
        width: 12px;
        height: 12px;
        margin-left: -6px;
        border-radius: 50%;
        background: #fff;
      }
      .time {
        flex: none;
        font-variant-numeric: tabular-nums;
      }
      .no-time .time,
      .no-buttons button {
        display: none;
      }
    </style>
    <div class="bar">
      <button class="back" title="Back ${SKIP_SECONDS} seconds">−${SKIP_SECONDS}</button>
      <div class="track">
        <div class="rail"></div>
        <div class="buffered"></div>
        <div class="played"></div>
        <div class="thumb"></div>
      </div>
      <button class="forward" title="Forward ${SKIP_SECONDS} seconds">+${SKIP_SECONDS}</button>
      <span class="time"></span>
    </div>`;

  const bar = root.querySelector(".bar");
  const track = root.querySelector(".track");
  const buffered = root.querySelector(".buffered");
  const played = root.querySelector(".played");
  const thumb = root.querySelector(".thumb");
  const time = root.querySelector(".time");

  let video = null;
  let hideTimer = 0;
  let frame = 0;
  let dragging = false;
  let overBar = false;
  let fitKey = "";

  function duration() {
    if (Number.isFinite(video.duration)) {
      return video.duration;
    }
    const { seekable } = video;
    return seekable.length ? seekable.end(seekable.length - 1) : 0;
  }

  function seek(seconds) {
    const end = duration();
    if (end > 0) {
      video.currentTime = Math.min(Math.max(seconds, 0), end);
      render();
    }
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const s = String(total % 60).padStart(2, "0");
    const m = Math.floor(total / 60) % 60;
    const h = Math.floor(total / 3600);
    return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
  }

  function render() {
    const end = duration();
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
    fit();
  }

  // On narrow videos, drop the time label and then the skip buttons rather than let the
  // track shrink below a usable width. Only re-measured when the bar's width or the
  // label's length changes.
  function fit() {
    const key = `${host.style.width}|${time.textContent.length}`;
    if (key === fitKey) {
      return;
    }
    fitKey = key;
    bar.classList.remove("no-time", "no-buttons");
    if (track.clientWidth < MIN_TRACK_WIDTH) {
      bar.classList.add("no-time");
    }
    if (track.clientWidth < MIN_TRACK_WIDTH) {
      bar.classList.add("no-buttons");
    }
  }

  function place() {
    const rect = video.getBoundingClientRect();
    const tooSmall =
      rect.width < MIN_VIDEO_WIDTH || rect.height < (BAR_HEIGHT + BAR_BOTTOM_GAP) * 2;
    if (!video.isConnected || tooSmall) {
      hide();
      return false;
    }
    host.style.left = `${rect.left + BAR_INSET}px`;
    host.style.top = `${rect.bottom - BAR_HEIGHT - BAR_BOTTOM_GAP}px`;
    host.style.width = `${rect.width - BAR_INSET - BAR_RIGHT_GAP}px`;
    return true;
  }

  function tick() {
    frame = 0;
    if (!video || !place()) {
      return;
    }
    render();
    frame = requestAnimationFrame(tick);
  }

  function show(target) {
    video = target;
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
    video = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!dragging && !overBar) {
        hide();
      }
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
      if (dragging) {
        return;
      }
      overBar = event.composedPath().includes(host);
      if (overBar) {
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
    overBar = false;
    scheduleHide();
  });

  // Keep pointer and click events on the bar away from Instagram's handlers, which
  // would otherwise pause, mute, or open the video underneath.
  for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick"]) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }

  root.querySelector(".back").addEventListener("click", () => {
    seek(video.currentTime - SKIP_SECONDS);
  });
  root.querySelector(".forward").addEventListener("click", () => {
    seek(video.currentTime + SKIP_SECONDS);
  });

  function seekToPointer(event) {
    const rect = track.getBoundingClientRect();
    seek(((event.clientX - rect.left) / rect.width) * duration());
  }

  track.addEventListener("pointerdown", (event) => {
    dragging = true;
    track.setPointerCapture(event.pointerId);
    seekToPointer(event);
  });
  track.addEventListener("pointermove", (event) => {
    if (dragging) {
      seekToPointer(event);
    }
  });
  for (const type of ["pointerup", "pointercancel"]) {
    track.addEventListener(type, () => {
      dragging = false;
      scheduleHide();
    });
  }
})();
