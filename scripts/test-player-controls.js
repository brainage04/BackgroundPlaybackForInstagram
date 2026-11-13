// Loads the extension into headless Chromium, serves fixture pages at an instagram.com URL
// so the content scripts run, moves the pointer over them and checks where the controls go.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const CDP = require("chrome-remote-interface");

const root = path.resolve(__dirname, "..");
const PAGE_URL = "https://www.instagram.com/igbp-test/";

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

const videoStyle = (left, top, width, height) =>
  `position: absolute; left: ${left}px; top: ${top}px; width: ${width}px; height: ${height}px; background: #345;`;

// The reels viewer: a list of reels left in the page under the viewer's solid background,
// and the reel being watched on top of it.
const reelsViewer = `<!doctype html>
<body style="margin: 0; background: #000">
  <main><video id="hidden" style="${videoStyle(100, 50, 468, 585)}"></video></main>
  <div style="position: fixed; inset: 0; background: rgb(12 16 20)">
    <video id="shown" style="${videoStyle(636, 1, 419, 748)}"></video>
  </div>
</body>`;

// A video under a half-transparent overlay, like Instagram's gradients, is still seen.
const dimmedVideo = `<!doctype html>
<body style="margin: 0; background: #000">
  <video id="dimmed" style="${videoStyle(100, 50, 468, 585)}"></video>
  <div style="position: fixed; inset: 0; background: rgb(0 0 0 / 40%)"></div>
</body>`;

const cases = [
  {
    name: "reel under the pointer gets the controls at its box",
    html: reelsViewer,
    point: [800, 400],
    expected: { display: "block", left: 636, top: 1, width: 419, height: 748 }
  },
  {
    name: "video under the reels viewer's solid background gets no controls",
    html: reelsViewer,
    point: [300, 300],
    expected: { display: "none" }
  },
  {
    name: "video under a half-transparent overlay gets the controls",
    html: dimmedVideo,
    point: [300, 300],
    expected: { display: "block", left: 100, top: 50, width: 468, height: 585 }
  }
];

function readHost() {
  const host = [...document.documentElement.children].find(
    (element) => element.tagName === "DIV" && element.style.zIndex === "2147483647"
  );
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
  const stop = () => {
    chrome.kill();
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { port, stop };
}

async function runCase(client, testCase) {
  const { Fetch, Input, Page, Runtime } = client;
  const unsubscribe = Fetch.requestPaused((event) => {
    Fetch.fulfillRequest({
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "text/html" }],
      body: Buffer.from(testCase.html).toString("base64")
    });
  });
  const loaded = Page.loadEventFired();
  await Page.navigate({ url: PAGE_URL });
  await loaded;
  unsubscribe();
  await delay(300);
  const [x, y] = testCase.point;
  await Input.dispatchMouseEvent({ type: "mouseMoved", x: x - 5, y });
  await Input.dispatchMouseEvent({ type: "mouseMoved", x, y });
  await delay(200);
  const { result } = await Runtime.evaluate({
    expression: `(${readHost.toString()})()`,
    returnByValue: true
  });
  return result.value;
}

async function main() {
  const { port, stop } = await startChrome();
  let client;
  let failed = 0;
  try {
    client = await CDP({ port });
    await Promise.all([
      client.Page.enable(),
      client.Fetch.enable({ patterns: [{ urlPattern: `${PAGE_URL}*` }] })
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
    stop();
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
