// School Wars desktop app (what Steam runs). It opens the live game in its
// own full-screen window, so it always has the latest version and plays with
// everyone on the website.

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

const GAME_URL = process.env.SCHOOL_WARS_URL || "https://mikes-game.vercel.app";
const GAME_ORIGIN = new URL(GAME_URL).origin;

// The Steam overlay (Shift+Tab) only draws over Electron with these on.
app.commandLine.appendSwitch("in-process-gpu");
app.commandLine.appendSwitch("disable-direct-composition");
// Sounds play right away, without a click first.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

/** @type {BrowserWindow | null} */
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    fullscreen: true,
    backgroundColor: "#0b0d12",
    title: "School Wars",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenu(null);
  if (!smokeArg) win.once("ready-to-show", () => win?.show());

  // Links to other sites open in the normal web browser, not in the game.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== GAME_ORIGIN && !url.startsWith("file:")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // No internet (or the site is down): show a "Try again" screen.
  win.webContents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted, e.g. a redirect */) return;
    if (url.startsWith("file:")) return;
    win?.loadFile(path.join(__dirname, "offline.html"));
  });

  // F11 or Alt+Enter: switch between full screen and a window.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11" || (input.alt && input.key === "Enter")) {
      event.preventDefault();
      win?.setFullScreen(!win.isFullScreen());
    }
  });

  win.loadURL(GAME_URL);
}

ipcMain.on("quit", () => app.quit());
ipcMain.on("toggle-fullscreen", () => win?.setFullScreen(!win.isFullScreen()));
ipcMain.on("retry", () => win?.loadURL(GAME_URL));

// Self-check for builds: `SchoolWars.exe --smoke-test=out.png` loads the game
// in a hidden window, saves a picture of it and quits.
const smokeArg = process.argv.find((a) => a.startsWith("--smoke-test="));
if (smokeArg) {
  const out = smokeArg.slice("--smoke-test=".length);
  app.whenReady().then(() => {
    setTimeout(async () => {
      if (!win) return app.exit(1);
      const img = await win.webContents.capturePage();
      require("node:fs").writeFileSync(out, img.toPNG());
      const bridge = await win.webContents.executeJavaScript("typeof window.schoolWarsDesktop");
      require("node:fs").writeFileSync(out + ".txt", `${win.webContents.getURL()} bridge=${bridge}\n`);
      app.exit(0);
    }, 8000);
  });
}

// Only one copy of the game at a time.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(createWindow);
  app.on("window-all-closed", () => app.quit());
}
