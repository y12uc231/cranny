const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('cranny', {
  getState: () => ipcRenderer.invoke('browser:get-state'),
  createTab: (input) => ipcRenderer.invoke('browser:create-tab', input),
  activateTab: (tabId) => ipcRenderer.invoke('browser:activate-tab', tabId),
  closeTab: (tabId) => ipcRenderer.invoke('browser:close-tab', tabId),
  hibernateTab: (tabId) => ipcRenderer.invoke('browser:hibernate-tab', tabId),
  pinTab: (tabId, pinned) => ipcRenderer.invoke('browser:pin-tab', { tabId, pinned }),
  setIntent: (tabId, intent) => ipcRenderer.invoke('browser:set-intent', { tabId, intent }),
  navigate: (target) => ipcRenderer.invoke('browser:navigate', target),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  organize: () => ipcRenderer.invoke('browser:organize'),
  saveMemory: () => ipcRenderer.invoke('browser:save-memory'),
  ask: (prompt) => ipcRenderer.invoke('agent:ask', prompt),
  getJournal: (query = '') => ipcRenderer.invoke('journal:list', query),
  reopenJournal: (entryId) => ipcRenderer.invoke('journal:reopen', entryId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:set', settings),
  getMemory: () => ipcRenderer.invoke('memory:get'),
  onState: (callback) => subscribe('browser:state', callback),
  onMemory: (callback) => subscribe('memory:update', callback),
  onMemoryAlert: (callback) => subscribe('memory:alert', callback),
  onFocusAddress: (callback) => subscribe('ui:focus-address', callback),
  onNewTab: (callback) => subscribe('ui:new-tab', callback),
  onFocusAgent: (callback) => subscribe('ui:focus-agent', callback),
});
