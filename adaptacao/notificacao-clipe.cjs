const { app, screen } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const fs = require('node:fs');
const run = promisify(execFile);

const CLIP_MESSAGES = {
  en: ['Medal Clipped', 'Clip saved.'],
  pt: ['Clipe salvo', 'Seu clipe foi salvo.'],
  es: ['Clip guardado', 'Tu clip se ha guardado.'],
  fr: ['Clip enregistré', 'Votre clip a été enregistré.'],
  de: ['Clip gespeichert', 'Dein Clip wurde gespeichert.'],
  it: ['Clip salvata', 'Il clip è stato salvato.'],
  nl: ['Clip opgeslagen', 'Je clip is opgeslagen.'],
  pl: ['Klip zapisany', 'Twój klip został zapisany.'],
  tr: ['Klip kaydedildi', 'Kliplendi ve kaydedildi.'],
  ru: ['Клип сохранён', 'Клип сохранён.'],
  ja: ['クリップを保存しました', 'クリップが保存されました。'],
  ko: ['클립 저장 완료', '클립이 저장되었습니다.'],
  zh: ['片段已保存', '你的片段已保存。'],
};

function notificationText(locale) {
  const language = String(locale || 'en').replace('_', '-').toLowerCase().split('-')[0];
  return CLIP_MESSAGES[language] || CLIP_MESSAGES.en;
}

function clipSoundPath(settings, appPath) {
  // Built-in Medal presets varied from the requested original clip effect.
  // Keep an explicitly selected custom file, but use ClipEffect for presets.
  if (settings.ClipSound === 'custom' && settings.ClipSoundPath) return settings.ClipSoundPath;
  return path.join(appPath, 'src/assets/sound-alerts/default.wav');
}

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
      const file = clipSoundPath(settings, app.getAppPath());
      if (fs.existsSync(file)) run('paplay', ['--volume=' + Math.round(volume * 655.36), file], { timeout: 15000 }).catch(error => console.error('[linux-clip-sound]', error.message));
      else console.error('[linux-clip-sound] Selected sound is missing:', file);
    }
    if (settings.AllowNotificationPopups === false || settings.StreamerMode) return;
    await this.monitorAtPointer();
    if (this.destroyed) return;
    const point = screen.getCursorScreenPoint();
    const [title, body] = notificationText(app.getLocale());
    // These standard hints help servers which honor position hints. Cinnamon
    // instead follows the active-screen preference above; other desktops may ignore them.
    await run('notify-send', ['--app-name=Medal', '--icon=' + path.join(app.getAppPath(), 'src/assets/icon/MedalApp.png'), '--expire-time=2500', '--hint=string:desktop-entry:medal-linux', '--hint=boolean:suppress-sound:true', '--hint=int:x:' + Math.round(point.x), '--hint=int:y:' + Math.round(point.y), title, body], { timeout: 5000 }).catch(error => console.error('[linux-clip-notification]', error.message));
  }
  destroy() { this.destroyed = true; }
}
module.exports = { ClipFeedback, notificationText, clipSoundPath };
