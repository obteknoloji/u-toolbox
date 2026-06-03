const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getHardwareInfo: () => ipcRenderer.invoke('get-hardware-info'),
  getPcUsageHistory: () => ipcRenderer.invoke('get-pc-usage-history'),
  getUsageStats: () => ipcRenderer.invoke('get-usage-stats'),
  setTraySetting: (val) => ipcRenderer.send('set-tray-setting', val),
  getJunkSizes: () => ipcRenderer.invoke('get-junk-sizes'),
  cleanJunk: (targets) => ipcRenderer.invoke('clean-junk', targets),
  onCleanProgress: (callback) => ipcRenderer.on('clean-progress', (e, val) => callback(val)),
  freeRam: () => ipcRenderer.invoke('free-ram'),
  onRamProgress: (callback) => ipcRenderer.on('ram-progress', (e, val) => callback(val)),
  shredFile: (type) => ipcRenderer.invoke('shred-file', type),
  showShredMenu: () => ipcRenderer.invoke('show-shred-menu'),
  onShredProgress: (callback) => ipcRenderer.on('shred-progress', (e, val) => callback(val)),

  scheduleShutdown: (seconds) => ipcRenderer.invoke('schedule-shutdown', seconds),
  cancelShutdown: () => ipcRenderer.invoke('cancel-shutdown'),
  createRestorePoint: () => ipcRenderer.invoke('create-restore-point'),
  applyTweak: (tweakId, enabled) => ipcRenderer.invoke('apply-tweak', tweakId, enabled),
  getAllTweakStatuses: (tweakIds) => ipcRenderer.invoke('get-all-tweak-statuses', tweakIds),
  runDebloatAction: (actionId) => ipcRenderer.invoke('run-debloat-action', actionId),
  checkDebloatStatus: () => ipcRenderer.invoke('check-debloat-status'),
  updateTrayLabels: (labels) => ipcRenderer.send('update-tray-labels', labels),
  onOpenRamOptimizer: (callback) => ipcRenderer.on('open-ram-optimizer', () => callback()),
  
  getDesktopLayouts: () => ipcRenderer.invoke('get-desktop-layouts'),
  saveDesktopLayout: (name) => ipcRenderer.invoke('save-desktop-layout', name),
  restoreDesktopLayout: (name) => ipcRenderer.invoke('restore-desktop-layout', name),
  deleteDesktopLayout: (name) => ipcRenderer.invoke('delete-desktop-layout', name),

  fcSelectFolder: () => ipcRenderer.invoke('fc-select-folder'),
  fcAnalyzeFolder: (path) => ipcRenderer.invoke('fc-analyze-folder', path),
  fcCompressFolder: (path, mode, force) => ipcRenderer.invoke('fc-compress-folder', path, mode, force),
  fcUncompressFolder: (path) => ipcRenderer.invoke('fc-uncompress-folder', path),
  onFcProgress: (callback) => {
    ipcRenderer.removeAllListeners('fc-progress');
    ipcRenderer.on('fc-progress', (e, data) => callback(data));
  },
  
  // Updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdaterEvent: (callback) => {
    ipcRenderer.removeAllListeners('updater-event');
    ipcRenderer.on('updater-event', (e, data) => callback(data));
  }
});
