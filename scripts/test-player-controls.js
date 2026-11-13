// Loads the extension into headless Chromium, serves fixture pages at instagram.com URLs so
// the content scripts run, drives the pointer over them and checks what the controls do.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const CDP = require("chrome-remote-interface");

const root = path.resolve(__dirname, "..");
const PAGE_URL = "https://www.instagram.com/igbp-test/";
const STORY_URL = "https://www.instagram.com/stories/igbp-test/1/";

// Branded Google Chrome ignores --load-extension since version 137, so this needs Chromium.
const chromeCandidates = [process.env.CHROME_BIN, "chromium", "chromium-browser"].filter(Boolean);

function findChrome() {
  for (const candidate of chromeCandidates) {
    try {
      execFileSync("which", [candidate], { stdio: "ignore" });
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("Could not find Chromium. Set CHROME_BIN to a Chromium executable.");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Runs in every fixture page before the extension. The controls' shadow root is closed, so
// tests open it to find the controls' positions.
const pageHelpers = `
  {
    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      return attachShadow.call(this, { ...init, mode: "open" });
    };
    window.testHost = () =>
      [...document.querySelectorAll("div")].find((element) => element.style.zIndex === "2147483647");
  }`;

const videoStyle = (left, top, width, height) =>
  `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; background: #345;`;

const page = (body) => `<!doctype html>
<body style="margin: 0; background: #000">
  ${body}
</body>`;

const feedVideo = `<video id="video" style="${videoStyle(100, 50, 468, 585)}"></video>`;

// A playing video, muted as Instagram starts it, fed from a canvas instead of a file.
const playMuted = `<script>
  {
    const video = document.getElementById("video");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    setInterval(() => context.fillRect(0, 0, 1, 1), 50);
    video.srcObject = canvas.captureStream(20);
    video.muted = true;
    video.addEventListener("playing", () => (window.playing = true));
    video.play();
  }
</script>`;

// Instagram's player controller where the extension finds it: in a React hook's state on
// the video's fiber. "without" leaves methods out, as a future Instagram build might.
const fakeController = (qualities, without = []) => `<script>
  {
    const video = document.getElementById("video");
    const controller = {
      getCurrentState: () => ({
        availableVideoQualities: ${JSON.stringify(qualities)},
        selectedVideoQuality: "notselected",
        currentVideoQuality: "${qualities[0]}"
      }),
      internal_getVideoElement: () => video,
      selectVideoQuality() {},
      seek: (seconds) => (video.currentTime = seconds),
      play: () => video.play(),
      pause: () => video.pause(),
      setMuted: (muted) => (video.muted = muted)
    };
    for (const name of ${JSON.stringify(without)}) {
      delete controller[name];
    }
    video.__reactFiber$test = { memoizedState: { memoizedState: controller, next: null } };
  }
</script>`;

// The reels viewer: a list of reels left in the page under the viewer's solid background,
// and the reel being watched on top of it.
const reelsViewer = page(`
  <main><video id="hidden" style="${videoStyle(100, 50, 468, 585)}"></video></main>
  <div style="position: fixed; inset: 0; background: rgb(12 16 20)">
    <video id="shown" style="${videoStyle(636, 1, 419, 748)}"></video>
  </div>`);

// A video under a half-transparent overlay, like Instagram's gradients, is still seen.
const dimmedVideo = page(`
  ${feedVideo}
  <div style="position: fixed; inset: 0; background: rgb(0 0 0 / 40%)"></div>`);

const dialogOver = (left) =>
  page(`
  ${feedVideo}
  <div aria-modal="true" style="position: fixed; left: ${left}px; top: 100px; width: 500px; height: 500px; background: #fff"></div>`);

// A story with its reply box: a bordered pill around a borderless text box, 16 px above
// the bottom of the story.
const replyBox = `<div style="position: absolute; left: 16px; right: 16px; bottom: 16px; height: 44px; border: 1px solid #fff; border-radius: 22px">
  <textarea style="width: 200px; height: 20px; border: 0; background: transparent"></textarea>
</div>`;

const story = page(`
  <section style="position: absolute; left: 400px; top: 20px; width: 400px; height: 560px">
    <div id="wrap" style="position: absolute; inset: 0">
      <video id="video" style="width: 100%; height: 100%; background: #345"></video>
    </div>
    ${replyBox}
  </section>`);

const shortStory = page(`
  <section id="story" style="position: absolute; left: 400px; top: 100px; width: 300px; height: 180px">
    <video id="video" style="width: 100%; height: 100%; background: #345"></video>
  </section>`);

function readHost() {
  const host = window.testHost();
  if (!host || host.style.display !== "block") {
    return { display: "none" };
  }
  const box = host.getBoundingClientRect();
  return {
    display: "block",
    left: Math.round(box.left),
    top: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height)
  };
}

function testPage(client, errors, release) {
  const { Input, Runtime } = client;
  const evaluate = async (fn, ...args) => {
    const { result, exceptionDetails } = await Runtime.evaluate({
      expression: `(${fn})(...${JSON.stringify(args)})`,
      awaitPromise: true,
      returnByValue: true
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    }
    return result.value;
  };
  const mouse = (type, [x, y], buttons = 0) =>
    Input.dispatchMouseEvent({
      type,
      x,
      y,
      buttons,
      button: type === "mouseMoved" && !buttons ? "none" : "left",
      clickCount: type === "mouseMoved" ? 0 : 1
    });
  const box = (selector) =>
    evaluate((selector) => {
      const { left, top, right, bottom } = window
        .testHost()
        .shadowRoot.querySelector(selector)
        .getBoundingClientRect();
      return { left, top, right, bottom, x: (left + right) / 2, y: (top + bottom) / 2 };
    }, selector);
  return {
    errors,
    evaluate,
    mouse,
    box,
    release,
    host: () => evaluate(readHost),
    async control(selector) {
      const { x, y } = await box(selector);
      return [x, y];
    },
    async hover([x, y]) {
      await mouse("mouseMoved", [x - 5, y]);
      await mouse("mouseMoved", [x, y]);
      await delay(200);
    },
    async click(point) {
      await mouse("mouseMoved", point);
      await mouse("mousePressed", point, 1);
      await mouse("mouseReleased", point);
      await delay(200);
    },
    waitForPlaying: () =>
      evaluate(
        () =>
          new Promise((resolve) => {
            const check = () => (window.playing ? resolve() : setTimeout(check, 20));
            check();
          })
      )
  };
}

const hoverAndRead = (point) => async (page) => {
  await page.hover(point);
  return page.host();
};

const cases = [
  {
    name: "reel under the pointer gets the controls at its box",
    html: reelsViewer,
    run: hoverAndRead([800, 400]),
    expected: { display: "block", left: 636, top: 1, width: 419, height: 748 }
  },
  {
    name: "video under the reels viewer's solid background gets no controls",
    html: reelsViewer,
    run: hoverAndRead([300, 300]),
    expected: { display: "none" }
  },
  {
    name: "video under a half-transparent overlay gets the controls",
    html: dimmedVideo,
    run: hoverAndRead([300, 300]),
    expected: { display: "block", left: 100, top: 50, width: 468, height: 585 }
  },
  {
    name: "video under part of an open post's dialog gets no controls",
    html: dialogOver(300),
    run: hoverAndRead([150, 300]),
    expected: { display: "none" }
  },
  {
    name: "video beside a dialog that leaves it uncovered gets the controls",
    html: dialogOver(700),
    run: hoverAndRead([300, 300]),
    expected: { display: "block", left: 100, top: 50, width: 468, height: 585 }
  },
  {
    name: "story controls end above the reply box, as far above it as it is from the bottom",
    url: STORY_URL,
    html: story,
    run: hoverAndRead([600, 300]),
    expected: { display: "block", left: 400, top: 20, width: 400, height: 482 }
  },
  {
    name: "Instagram's button in a bottom corner is hidden while the controls show",
    html: page(`${feedVideo}
      <button id="corner" style="position: absolute; left: 110px; top: 585px; width: 40px; height: 40px"></button>`),
    run: async (page) => {
      await page.hover([300, 300]);
      return page.evaluate(() =>
        document.getElementById("corner").hasAttribute("data-igbp-hidden")
      );
    },
    expected: true
  },
  {
    name: "a playing muted video gets its sound after the first click on the page",
    html: page(feedVideo + playMuted),
    run: async (page) => {
      await page.waitForPlaying();
      await page.click([1500, 850]);
      return page.evaluate(() => document.getElementById("video").muted);
    },
    expected: false
  },
  {
    name: "a click before the controls load still gives the playing video its sound",
    html: page(`${feedVideo}${playMuted}<script src="held.js"></script>`),
    hold: "held.js",
    run: async (page) => {
      await page.waitForPlaying();
      await page.click([1500, 850]);
      await page.release();
      await delay(1500);
      return page.evaluate(() => document.getElementById("video").muted);
    },
    expected: false
  },
  {
    name: "volume slid down to 0 mutes, and Instagram's own unmute brings back the volume from before",
    html: page(feedVideo),
    run: async (page) => {
      await page.hover([300, 300]);
      await page.hover(await page.control(".mute"));
      const rail = await page.box(".volume-rail");
      await page.mouse("mousePressed", [rail.x, rail.y], 1);
      for (let y = rail.y; y <= rail.bottom + 12; y += 6) {
        await page.mouse("mouseMoved", [rail.x, y], 1);
      }
      await page.mouse("mouseReleased", [rail.x, rail.bottom + 12]);
      return page.evaluate(async () => {
        const video = document.getElementById("video");
        const mutedBySlide = video.muted;
        video.muted = false;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { mutedBySlide, muted: video.muted, volume: video.volume };
      });
    },
    expected: { mutedBySlide: true, muted: false, volume: 1 }
  },
  {
    name: "Instagram resetting one video's volume many times doesn't stop the next keeping yours",
    html: page(`${feedVideo}<video id="next" style="${videoStyle(700, 50, 468, 585)}"></video>`),
    run: async (page) => {
      await page.hover([300, 300]);
      await page.hover(await page.control(".mute"));
      await page.click(await page.control(".volume-rail"));
      return page.evaluate(async () => {
        const wait = () => new Promise((resolve) => setTimeout(resolve, 30));
        const video = document.getElementById("video");
        const next = document.getElementById("next");
        const chosen = video.volume;
        for (let i = 0; i < 21; i++) {
          video.volume = 1;
          await wait();
        }
        next.volume = 0.9;
        await wait();
        return Math.abs(next.volume - chosen) < 0.01;
      });
    },
    expected: true
  },
  {
    name: "dragging the seek line while the video leaves the page throws nothing",
    html: page(feedVideo),
    run: async (page) => {
      await page.hover([300, 300]);
      const [x, y] = await page.control(".progress");
      await page.mouse("mouseMoved", [x, y]);
      await page.mouse("mousePressed", [x, y], 1);
      await page.evaluate(() => document.getElementById("video").remove());
      await delay(150);
      await page.mouse("mouseMoved", [x + 40, y], 1);
      await page.mouse("mouseReleased", [x + 40, y]);
      return page.errors;
    },
    expected: []
  },
  {
    name: "dragging the volume while the video leaves the page throws nothing",
    html: page(feedVideo),
    run: async (page) => {
      await page.hover([300, 300]);
      await page.hover(await page.control(".mute"));
      const rail = await page.box(".volume-rail");
      await page.mouse("mousePressed", [rail.x, rail.y], 1);
      await page.evaluate(() => document.getElementById("video").remove());
      await delay(150);
      await page.mouse("mouseMoved", [rail.x, rail.y + 10], 1);
      await page.mouse("mouseReleased", [rail.x, rail.y + 10]);
      return page.errors;
    },
    expected: []
  },
  {
    name: "a story footer appearing under short controls hides them without errors",
    url: STORY_URL,
    html: shortStory,
    run: async (page) => {
      await page.hover([550, 150]);
      await page.evaluate(() => {
        const footer = document.createElement("textarea");
        footer.style.cssText =
          "position: absolute; left: 10px; bottom: 0; width: 200px; height: 40px";
        document.getElementById("story").append(footer);
      });
      await delay(600);
      return { host: (await page.host()).display, errors: page.errors };
    },
    expected: { host: "none", errors: [] }
  },
  {
    name: "a bar fixed over the video's bottom edge keeps its links, and the video gets no controls",
    html: page(`${feedVideo}
      <nav style="position: fixed; left: 0; right: 0; top: 600px; height: 60px; background: #fff">
        <a id="link" href="#" style="display: inline-block; width: 48px; height: 48px; margin-left: 110px"></a>
      </nav>`),
    run: async (page) => {
      await page.hover([300, 300]);
      return {
        host: (await page.host()).display,
        linkHidden: await page.evaluate(() =>
          document.getElementById("link").hasAttribute("data-igbp-hidden")
        )
      };
    },
    expected: { host: "none", linkHidden: false }
  },
  {
    name: "the quality menu stays inside a short video",
    html: page(
      `<video id="video" style="${videoStyle(100, 300, 468, 263)}"></video>` +
        fakeController(["1080p", "720p", "540p", "480p", "360p"])
    ),
    run: async (page) => {
      await page.hover([300, 400]);
      await page.click(await page.control(".settings"));
      await page.click(await page.control(".menu-item"));
      const menu = await page.box(".menu");
      const host = await page.host();
      return menu.top >= host.top;
    },
    expected: true
  },
  {
    name: "a controller missing setMuted leaves the mute button working on the video itself",
    html: page(feedVideo + fakeController(["720p", "480p"], ["setMuted"])),
    run: async (page) => {
      await page.hover([300, 300]);
      await page.click(await page.control(".mute"));
      const muted = await page.evaluate(() => document.getElementById("video").muted);
      return { muted, errors: page.errors };
    },
    expected: { muted: true, errors: [] }
  },
  {
    name: "full screen story controls reach the bottom of the screen",
    url: STORY_URL,
    html: story,
    run: async (page) => {
      await page.hover([600, 300]);
      await page.click(await page.control(".fullscreen"));
      await delay(300);
      await page.hover([800, 450]);
      await delay(500);
      return page.evaluate(() => ({
        fullscreen: Boolean(document.fullscreenElement),
        gap: Math.round(innerHeight - window.testHost().getBoundingClientRect().bottom)
      }));
    },
    expected: { fullscreen: true, gap: 0 }
  }
];

async function startChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "igbp-test-"));
  const chrome = spawn(
    findChrome(),
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      `--load-extension=${root}`,
      `--disable-extensions-except=${root}`,
      "--window-size=1600,900",
      "about:blank"
    ],
    { stdio: "ignore" }
  );
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) {
    await delay(100);
  }
  const port = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]);
  const stop = async () => {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await exited;
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { port, stop };
}

async function runCase(client, testCase) {
  const { Fetch, Page, Runtime } = client;
  const url = testCase.url || PAGE_URL;
  const errors = [];
  let held = null;
  const unsubscribeFetch = Fetch.requestPaused((event) => {
    if (testCase.hold && event.request.url.endsWith(testCase.hold)) {
      held = event.requestId;
      return;
    }
    Fetch.fulfillRequest({
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html" }],
      body: Buffer.from(testCase.html).toString("base64")
    });
  });
  const unsubscribeErrors = Runtime.exceptionThrown(({ exceptionDetails }) => {
    errors.push((exceptionDetails.exception?.description || exceptionDetails.text).split("\n")[0]);
  });
  const release = async () => {
    while (!held) {
      await delay(20);
    }
    await Fetch.fulfillRequest({
      requestId: held,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
      body: ""
    });
  };
  try {
    const loaded = Page.loadEventFired();
    await Page.navigate({ url });
    if (!testCase.hold) {
      await loaded;
      await delay(300);
    }
    return await testCase.run(testPage(client, errors, release));
  } finally {
    unsubscribeFetch();
    unsubscribeErrors();
  }
}

async function main() {
  const { port, stop } = await startChrome();
  let client;
  let failed = 0;
  try {
    client = await CDP({ port });
    await Promise.all([
      client.Page.enable(),
      client.Runtime.enable(),
      client.Page.addScriptToEvaluateOnNewDocument({ source: pageHelpers }),
      client.Fetch.enable({
        patterns: [{ urlPattern: `${PAGE_URL}*` }, { urlPattern: `${STORY_URL}*` }]
      })
    ]);
    for (const testCase of cases) {
      const actual = await runCase(client, testCase);
      const ok = JSON.stringify(actual) === JSON.stringify(testCase.expected);
      failed += ok ? 0 : 1;
      console.log(`${ok ? "ok  " : "FAIL"} ${testCase.name}`);
      if (!ok) {
        console.log(`     expected ${JSON.stringify(testCase.expected)}`);
        console.log(`     actual   ${JSON.stringify(actual)}`);
      }
    }
  } finally {
    await client?.close();
    await stop();
  }
  if (failed) {
    console.error(`${failed} of ${cases.length} failed`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
