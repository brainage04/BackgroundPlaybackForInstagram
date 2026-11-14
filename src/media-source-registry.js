// Runs in Instagram's page world before its scripts. Records which MediaSource backs each
// blob: video URL and which SourceBuffers it holds, so the player controls can drop
// buffered video after a quality change. Instagram keeps playing what it has already
// buffered, so without that a new quality shows only once the buffer runs out (or, for
// a reel that loops from a full buffer, never).
(() => {
  "use strict";

  const sourcesByUrl = new Map();
  const buffersBySource = new WeakMap();

  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (object) {
    const url = createObjectURL.call(this, object);
    if (object instanceof MediaSource) {
      sourcesByUrl.set(url, object);
    }
    return url;
  };

  const revokeObjectURL = URL.revokeObjectURL;
  URL.revokeObjectURL = function (url) {
    sourcesByUrl.delete(url);
    return revokeObjectURL.call(this, url);
  };

  const addSourceBuffer = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (mimeType) {
    const sourceBuffer = addSourceBuffer.call(this, mimeType);
    const list = buffersBySource.get(this) || [];
    list.push({ mimeType: String(mimeType), sourceBuffer });
    buffersBySource.set(this, list);
    return sourceBuffer;
  };

  Object.defineProperty(window, Symbol.for("instagram-background-playback.mediaSources"), {
    value: {
      videoBuffersFor(video) {
        const source = sourcesByUrl.get(video.src);
        const list = (source && buffersBySource.get(source)) || [];
        return {
          source,
          buffers: list
            .filter(({ mimeType }) => mimeType.startsWith("video/"))
            .map(({ sourceBuffer }) => sourceBuffer)
        };
      }
    }
  });
})();
