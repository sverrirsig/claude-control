const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),

  // Terminal PTY API
  ptySpawn: (opts) => ipcRenderer.invoke("pty:spawn", opts),
  ptyWrite: (ptyId, data) => ipcRenderer.send("pty:write", { ptyId, data }),
  ptyResize: (ptyId, cols, rows) => ipcRenderer.send("pty:resize", { ptyId, cols, rows }),
  ptyKill: (ptyId, killTmuxSession) => ipcRenderer.invoke("pty:kill", { ptyId, killTmuxSession }),
  ptyReattach: (ptyId) => ipcRenderer.invoke("pty:reattach", { ptyId }),
  onPtyData: (callback) => {
    const listener = (_event, ptyId, data) => callback(ptyId, data);
    ipcRenderer.on("pty:data", listener);
    return () => ipcRenderer.removeListener("pty:data", listener);
  },
  onPtyExit: (callback) => {
    const listener = (_event, ptyId, info) => callback(ptyId, info);
    ipcRenderer.on("pty:exit", listener);
    return () => ipcRenderer.removeListener("pty:exit", listener);
  },
  getFilePath: (file) => webUtils.getPathForFile(file),
  ptyListInlineTmux: () => ipcRenderer.invoke("pty:listInlineTmux"),
});
