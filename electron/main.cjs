const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");

const DEV_URL = process.env.ELECTRON_START_URL || "http://127.0.0.1:3000";
const DESKTOP_PORT = 3210;

let mainWindow;
let nextServer;

const documentFilters = [
  { name: "Markdown and text", extensions: ["md", "markdown", "txt"] },
  { name: "HTML", extensions: ["html", "htm"] },
  { name: "All files", extensions: ["*"] },
];

function assertString(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
}

ipcMain.handle("file:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Open document",
    properties: ["openFile"],
    filters: documentFilters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    filePath,
    fileName: path.basename(filePath),
    content: await fs.readFile(filePath, "utf8"),
  };
});

ipcMain.handle("file:save", async (_event, request) => {
  if (!request || typeof request !== "object") {
    throw new TypeError("A save request is required");
  }

  const { filePath, fileName, content } = request;
  assertString(content, "content");

  let targetPath = filePath;
  if (targetPath !== undefined && targetPath !== null) {
    assertString(targetPath, "filePath");
  }

  if (!targetPath) {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Save document",
      defaultPath: fileName || "document.md",
      filters: documentFilters,
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    targetPath = result.filePath;
  }

  await fs.writeFile(targetPath, content, "utf8");
  return {
    filePath: targetPath,
    fileName: path.basename(targetPath),
  };
});

function getProductionServerPath() {
  return path.join(process.resourcesPath, "next-server", "server.js");
}

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(check, 250);
      });
    };

    check();
  });
}

async function startProductionServer() {
  const serverPath = getProductionServerPath();
  nextServer = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT: String(DESKTOP_PORT),
    },
    stdio: "pipe",
  });

  nextServer.stderr.on("data", (chunk) => {
    console.error(`[next] ${chunk}`.trim());
  });

  nextServer.on("exit", (code) => {
    if (code && !app.isQuitting) {
      console.error(`Next server exited with code ${code}`);
    }
  });

  await waitForServer(`http://127.0.0.1:${DESKTOP_PORT}`);
  return `http://127.0.0.1:${DESKTOP_PORT}`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const url = app.isPackaged ? await startProductionServer() : DEV_URL;
  await mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  app.isQuitting = true;
  nextServer?.kill();
});
