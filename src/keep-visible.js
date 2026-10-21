// Runs in Instagram's own page context before its scripts load. Instagram pauses its
// video player when the page reports itself hidden or the window loses focus, so this
// makes the page always look visible and focused to Instagram's code.
(() => {
  "use strict";

  const alwaysVisible = {
    hidden: false,
    visibilityState: "visible"
  };

  for (const [name, value] of Object.entries(alwaysVisible)) {
    Object.defineProperty(document, name, {
      configurable: true,
      get: () => value
    });
  }

  Object.defineProperty(document, "hasFocus", {
    configurable: true,
    value: () => true
  });

  const stop = (event) => event.stopImmediatePropagation();

  // visibilitychange is dispatched at document and bubbles, so a capture listener on
  // window, registered before any of Instagram's, sees it first and stops it.
  window.addEventListener("visibilitychange", stop, true);

  // Element blur events also pass through window's capture phase; only the window's own
  // blur means the tab or window lost focus. Instagram's inputs keep their blur handlers.
  window.addEventListener(
    "blur",
    (event) => {
      if (event.target === window) {
        stop(event);
      }
    },
    true
  );
})();
