// Renders the Web Store screenshots of the controls: the extension loaded into headless
// Chromium, over a generated gradient clip served at an instagram.com URL.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const CDP = require("chrome-remote-interface");

const root = path.resolve(__dirname, "..");
const PAGE_URL = "https://www.instagram.com/igbp-screenshot/";
const WIDTH = 1280;
const HEIGHT = 800;

// Branded Google Chrome ignores --load-extension since version 137, so this needs Chromium.
const chromeCandidates = [process.env.CHROME_BIN, "chromium", "chromium-browser"].filter(Boolean);

function findOnPath(candidates, what) {
  for (const candidate of candidates) {
    try {
      execFileSync("which", [candidate], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(what);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const html = `<!doctype html>
<body style="margin: 0; background: #0b0b0d">
  <video id="video" src="clip.webm" loop
    style="position: absolute; left: 415px; top: 0; width: 450px; height: 800px; object-fit: cover"></video>
  <script>
    {
      const video = document.getElementById("video");
      const controller = {
        getCurrentState: () => ({
          availableVideoQualities: ["1080p", "720p", "480p", "360p"],
          selectedVideoQuality: "notselected",
          currentVideoQuality: "1080p"
        }),
        internal_getVideoElement: () => video,
        selectVideoQuality() {},
        seek: (seconds) => (video.currentTime = seconds),
        play: () => video.play(),
        pause: () => video.pause(),
        setMuted: (muted) => (video.muted = muted)
      };
      video.__reactFiber$screenshot = { memoizedState: { memoizedState: controller, next: null } };
    }
  </script>
</body>`;

function makeClip(dir) {
  const ffmpeg = findOnPath(["ffmpeg"], "The `ffmpeg` command is required to make the clip.");
  const clip = path.join(dir, "clip.webm");
  execFileSync(ffmpeg, [
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "gradients=s=450x800:c0=0x1e3a8a:c1=0x0ea5e9:c2=0xf59e0b:c3=0x10b981:n=4:speed=0.02:d=34:r=30",
    "-c:v",
    "libvpx-vp9",
    "-b:v",
    "600k",
    "-pix_fmt",
    "yuv420p",
    clip
  ]);
  return fs.readFileSync(clip);
}

// The video element seeks with range requests, so the clip is served in parts.
function clipResponse(clip, range) {
  const match = /bytes=(\d+)-(\d*)/.exec(range || "");
  const start = match ? Number(match[1]) : 0;
  const end = match && match[2] ? Number(match[2]) : clip.length - 1;
  const headers = [
    { name: "Content-Type", value: "video/webm" },
    { name: "Accept-Ranges", value: "bytes" },
    { name: "Content-Length", value: String(end - start + 1) }
  ];
  if (match) {
    headers.push({ name: "Content-Range", value: `bytes ${start}-${end}/${clip.length}` });
  }
  return {
    responseCode: match ? 206 : 200,
    responseHeaders: headers,
    body: clip.subarray(start, end + 1).toString("base64")
  };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "igbp-screenshots-"));
  let clip;
  try {
    clip = makeClip(dir);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  const chrome = spawn(
    findOnPath(
      chromeCandidates,
      "Could not find Chromium. Set CHROME_BIN to a Chromium executable."
    ),
    [
      "--headless=new",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${dir}`,
      `--load-extension=${root}`,
      `--disable-extensions-except=${root}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--hide-scrollbars",
      "about:blank"
    ],
    { stdio: "ignore" }
  );
  const portFile = path.join(dir, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) {
    await delay(100);
  }
  const client = await CDP({ port: Number(fs.readFileSync(portFile, "utf8").split("\n")[0]) });
  try {
    const { Emulation, Fetch, Input, Page, Runtime } = client;
    await Promise.all([
      Page.enable(),
      Emulation.setDeviceMetricsOverride({
        width: WIDTH,
        height: HEIGHT,
        deviceScaleFactor: 1,
        mobile: false
      }),
      Fetch.enable({ patterns: [{ urlPattern: `${PAGE_URL}*` }] })
    ]);
    Fetch.requestPaused(({ requestId, request }) => {
      const response = request.url.endsWith("clip.webm")
        ? clipResponse(clip, request.headers.Range || request.headers.range)
        : {
            responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/html" }],
            body: Buffer.from(html).toString("base64")
          };
      Fetch.fulfillRequest({ requestId, ...response });
    });
    const evaluate = async (expression) =>
      (await Runtime.evaluate({ expression, awaitPromise: true, returnByValue: true })).result
        .value;
    const mouse = (type, [x, y], buttons = 0) =>
      Input.dispatchMouseEvent({
        type,
        x,
        y,
        buttons,
        button: type === "mouseMoved" ? "none" : "left",
        clickCount: type === "mouseMoved" ? 0 : 1
      });
    const click = async (point) => {
      await mouse("mouseMoved", point);
      await mouse("mousePressed", point, 1);
      await mouse("mouseReleased", point);
      await delay(250);
    };
    const controlAt = (selector) =>
      evaluate(`(() => {
        const host = [...document.documentElement.children].find(
          (element) => element.style.zIndex === "2147483647"
        );
        const { left, top, width, height } = host.style;
        return [parseFloat(left), parseFloat(top), parseFloat(width), parseFloat(height)];
      })()`).then(([left, top, width, height]) => selector(left, top, width, height));
    const screenshot = async (name) => {
      const { data } = await Page.captureScreenshot({ format: "png" });
      fs.writeFileSync(path.join(root, "store-assets", name), Buffer.from(data, "base64"));
      console.log(`Wrote store-assets/${name}`);
    };

    const loaded = Page.loadEventFired();
    await Page.navigate({ url: PAGE_URL });
    await loaded;
    // A click on the page lets the extension play the video with sound.
    await click([100, 400]);
    await evaluate(`(async () => {
      const video = document.getElementById("video");
      if (video.readyState < 1) {
        await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
      }
      video.currentTime = 12.3;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 400));
    })()`);
    await mouse("mouseMoved", [630, 500]);
    await mouse("mouseMoved", [640, 500]);
    await delay(400);
    await screenshot("screenshot-controls-1280x800.png");

    // The gear is the third button from the right: 36 px buttons, 2 px apart, 10 px padding.
    const gear = await controlAt((left, top, width, height) => [
      left + width - 10 - 36 * 2 - 2 * 2 - 18,
      top + height - 4 - 20
    ]);
    await click(gear);
    await click([gear[0] - 60, gear[1] - 90]);
    await mouse("mouseMoved", [200, 400]);
    await delay(300);
    await screenshot("screenshot-quality-1280x800.png");
  } finally {
    await client.close();
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
