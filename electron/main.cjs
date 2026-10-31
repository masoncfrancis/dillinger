const { app, BrowserWindow, dialog, ipcMain, Menu, shell, utilityProcess } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");

const DEV_URL = process.env.ELECTRON_START_URL || "http://127.0.0.1:3000";
const DESKTOP_PORT = 3210;
const DESKTOP_URL = `http://127.0.0.1:${DESKTOP_PORT}`;

let mainWindow;
let nextServer;
let closeRequested = false;
let closeInProgress = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

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

async function writeFileAtomically(filePath, content) {
  const temporaryPath = `${filePath}.dillinger-${process.pid}-${Date.now()}.tmp`;

  try {
    await fs.writeFile(temporaryPath, content, "utf8");
    await fs.rm(filePath, { force: true });
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }

  const stats = await fs.stat(filePath);
  return stats.mtimeMs;
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
    modifiedAt: (await fs.stat(filePath)).mtimeMs,
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

  const modifiedAt = await writeFileAtomically(targetPath, content);
  return {
    filePath: targetPath,
    fileName: path.basename(targetPath),
    modifiedAt,
  };
});

ipcMain.handle("file:write", async (_event, request) => {
  if (!request || typeof request !== "object") {
    throw new TypeError("A write request is required");
  }

  const { filePath, content, expectedModifiedAt } = request;
  assertString(filePath, "filePath");
  assertString(content, "content");

  const stats = await fs.stat(filePath);
  if (
    expectedModifiedAt !== undefined &&
    (typeof expectedModifiedAt !== "number" || stats.mtimeMs !== expectedModifiedAt)
  ) {
    const error = new Error("The file changed outside Dillinger");
    error.code = "FILE_CHANGED";
    throw error;
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    modifiedAt: await writeFileAtomically(filePath, content),
  };
});

ipcMain.handle("file:print-pdf", async (_event, request) => {
  if (!request || typeof request !== "object") {
    throw new TypeError("A print request is required");
  }

  const { html, fileName } = request;
  assertString(html, "html");
  assertString(fileName, "fileName");

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export PDF",
    defaultPath: fileName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
    const pdf = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: "A4",
      margins: {
        marginType: "custom",
        top: 0.79,
        bottom: 0.79,
        left: 0.79,
        right: 0.79,
      },
    });
    await fs.writeFile(result.filePath, pdf);

    return {
      filePath: result.filePath,
      fileName: path.basename(result.filePath),
    };
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.destroy();
    }
  }
});

ipcMain.handle("app:confirm-unsaved-changes", async () => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    title: "Unsaved changes",
    message: "This document has unsaved changes.",
    detail: "Would you like to save your changes before closing Dillinger?",
  });

  return result.response;
});

ipcMain.handle("app:confirm-close", (_event, shouldClose) => {
  if (typeof shouldClose !== "boolean") {
    throw new TypeError("shouldClose must be a boolean");
  }

  closeInProgress = false;
  if (shouldClose && mainWindow && !mainWindow.isDestroyed()) {
    closeRequested = true;
    mainWindow.close();
  }
});

ipcMain.handle("app:quit", () => {
  closeRequested = true;
  app.quit();
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
  nextServer = utilityProcess.fork(serverPath, [], {
    cwd: path.dirname(serverPath),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(DESKTOP_PORT),
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || DESKTOP_URL,
    },
    stdio: "pipe",
    serviceName: "Next.js server",
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
    title: "Dillinger",
    backgroundColor: "#ffffff",
    autoHideMenuBar: process.platform === "win32",
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

  mainWindow.on("close", (event) => {
    if (closeRequested || app.isQuitting) return;
    if (closeInProgress) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    closeInProgress = true;
    mainWindow.webContents.send("app:request-close");
  });

  const url = app.isPackaged ? await startProductionServer() : DEV_URL;
  await mainWindow.loadURL(url);
}

function createApplicationMenu() {
  const send = (action) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app:menu-action", action);
    }
  };

  const template = [
    {
      label: "File",
      submenu: [
        { label: "New Document", accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { label: "Open…", accelerator: "CmdOrCtrl+O", click: () => send("open") },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => send("save") },
        { label: "Save As…", accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-as") },
        { type: "separator" },
        { label: "Quit", accelerator: "CmdOrCtrl+Q", click: () => send("quit") },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Sidebar", accelerator: "CmdOrCtrl+B", click: () => send("toggle-sidebar") },
        { label: "Toggle Preview", accelerator: "CmdOrCtrl+\\", click: () => send("toggle-preview") },
        { label: "Zen Mode", accelerator: "CmdOrCtrl+Shift+Z", click: () => send("zen") },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "Keyboard Shortcuts", click: () => send("shortcuts") },
        { label: "About Dillinger", click: () => send("about") },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (gotLock) app.whenReady().then(async () => {
  createApplicationMenu();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

if (gotLock) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (!closeRequested && mainWindow && !mainWindow.isDestroyed()) {
    event.preventDefault();
    mainWindow.webContents.send("app:request-close");
    return;
  }

  app.isQuitting = true;
  closeRequested = true;
  nextServer?.kill();
});
