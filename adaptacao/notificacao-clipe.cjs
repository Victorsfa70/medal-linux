const { app, screen } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const run = promisify(execFile);
class ClipFeedback {
  constructor(getSetting) { this.getSetting = getSetting; this.destroyed = false; this.monitorConfigured = false; }
  async monitorAtPointer() {
    if (this.monitorConfigured) return;
    // Cinnamon uses its global notification policy; native toasts have no
    // supported per-application monitor override. The user requested this policy.
    if (/(?:cinnamon|x-cinnamon)/i.test(process.env.XDG_CURRENT_DESKTOP || '')) {
      try {
        await run('gsettings', ['set', 'org.cinnamon.desktop.notifications', 'notification-screen-display', 'active-screen'], { timeout: 3000 });
        this.monitorConfigured = true;
      } catch (error) { console.error('[linux-notification-monitor]', error.message); }
    }
  }
  async saved() {
    if (this.destroyed) return;
    const settings = await this.getSetting(['GlobalSoundAlerts', 'ClipSavedSoundAlerts', 'ClipSound', 'ClipSoundPath', 'AudioNotificationVolume', 'AllowNotificationPopups', 'StreamerMode']);
    if (this.destroyed) return;
    const volume = Math.min(100, Math.max(0, Number(settings.AudioNotificationVolume ?? 100)));
    if (settings.GlobalSoundAlerts !== false && settings.ClipSavedSoundAlerts !== false && volume) {
      const preset = /^[a-z-]+$/.test(settings.ClipSound || '') ? settings.ClipSound : 'default';
      const file = preset === 'custom' && settings.ClipSoundPath ? settings.ClipSoundPath : path.join(app.getAppPath(), 'src/assets/sound-alerts', preset + '.wav');
      if (fs.existsSync(file)) run('paplay', ['--volume=' + Math.round(volume * 655.36), file], { timeout: 15000 }).catch(error => console.error('[linux-clip-sound]', error.message));
      else console.error('[linux-clip-sound] Selected sound is missing:', file);
    }
    if (settings.AllowNotificationPopups === false || settings.StreamerMode) return;
    await this.monitorAtPointer();
    if (this.destroyed) return;
    const point = screen.getCursorScreenPoint();
    // These standard hints help servers which honor position hints. Cinnamon
    // instead follows the active-screen preference above; other desktops may ignore them.
    await run('notify-send', ['--app-name=Medal', '--icon=' + path.join(app.getAppPath(), 'src/assets/icon/MedalApp.png'), '--expire-time=2500', '--hint=string:desktop-entry:medal-linux', '--hint=boolean:suppress-sound:true', '--hint=int:x:' + Math.round(point.x), '--hint=int:y:' + Math.round(point.y), 'Medal Clipped', 'Clip saved.'], { timeout: 5000 }).catch(error => console.error('[linux-clip-notification]', error.message));
  }
  destroy() { this.destroyed = true; }
}
module.exports = { ClipFeedback };
