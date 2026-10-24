const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;
require('./linux-network.cjs').install(electron);
const fs = require('node:fs');
const path = require('node:path');
const profile = process.env.MEDAL_LINUX_PROFILE || path.join(app.getPath('appData'), 'medal-linux-prototype');
fs.mkdirSync(profile, { recursive: true });
app.setName('Medal');
for (const [name, relative] of Object.entries({ userData: '.', sessionData: 'session', appData: 'app-data', documents: 'Documents', videos: 'Videos', downloads: 'Downloads' })) {
  const dir = path.join(profile, relative);
  fs.mkdirSync(dir, { recursive: true });
  app.setPath(name, dir);
}
app.setAppLogsPath(path.join(profile, 'logs'));
app.setLoginItemSettings = () => {};
app.setAsDefaultProtocolClient = () => false;
process.env.SKIP_SENTRY = 'true';
if (process.env.MEDAL_LINUX_SOFTWARE_RENDERING === '1') app.disableHardwareAcceleration();
process.on('uncaughtException', error => console.error('[linux-prototype:uncaught]', error));
process.on('unhandledRejection', error => console.error('[linux-prototype:rejection]', error));
if (process.env.MEDAL_LINUX_TEST === '1') {
  app.disableHardwareAcceleration();
  // Only the isolated CI environment lacks AF_UNIX; do not change desktop behavior.
  app.requestSingleInstanceLock = () => true;
  dialog.showErrorBox = (title, message) => console.error('[linux-prototype:dialog]', title, message);
  // The test host reaches the internet through its provided network proxy.
  // Desktop launches use the user's normal network configuration.
  if (process.env.HTTPS_PROXY) app.commandLine.appendSwitch('proxy-server', process.env.HTTPS_PROXY);
}
app.on('browser-window-created', (_, window) => {
  window.webContents.on('did-fail-load', (_, code, description, url) => console.error('[linux-prototype:load]', code, description, url));
  window.webContents.on('render-process-gone', (_, details) => console.error('[linux-prototype:renderer-gone]', details));
});
require('./index.js');
