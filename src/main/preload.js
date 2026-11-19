const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('office', {
  lang: ipcRenderer.sendSync('i18n:lang'),
  getAgents: () => ipcRenderer.invoke('agents:get'),
  getTerminalFont: () => ipcRenderer.invoke('terminal:font'),
  onAgents: (callback) => subscribe('agents', callback),
  onBubble: (callback) => subscribe('bubble', callback),
  onError: (callback) => subscribe('herdr-error', callback),
  openTerminal: (kind, cols, rows) => ipcRenderer.invoke('pty:open', { kind, cols, rows }),
  focusAgent: (paneId) => ipcRenderer.send('herdr:focus', { paneId }),
  writeTerminal: (id, data) => ipcRenderer.send('pty:input', { id, data }),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
  closeTerminal: (id) => ipcRenderer.send('pty:close', { id }),
  onTerminalData: (callback) => subscribe('pty:data', callback),
  onTerminalExit: (callback) => subscribe('pty:exit', callback),
  onShellCommand: (callback) => subscribe('shell:command', callback),
  onLayoutCommand: (callback) => subscribe('layout:command', callback),
  reportLayout: (state) => ipcRenderer.send('layout:state', state),
});
