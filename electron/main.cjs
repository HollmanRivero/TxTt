const { app, BrowserWindow, session, shell } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

// Her starter funksjonen som lager vinduet ditt
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      mediaStream: true, 
      camera: true       
    }
  });

  if (!app.isPackaged && process.env.ELECTRON_DEV) {
    // Dev: Last inn Vite-serveren UTEN await
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    startServer().then((port) => {
      win.loadURL(`http://localhost:${port}`);
    }).catch(err => console.error(err));
  }
}

// Håndtering av app-livssyklus
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Hvis du har en app.whenReady() lenger ned, pass på at den bare kaller createWindow:
app.whenReady().then(createWindow);