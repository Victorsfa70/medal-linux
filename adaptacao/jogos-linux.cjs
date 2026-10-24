const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const run = promisify(execFile);
const SCREEN_CATEGORY = '1b7CpvXVSuB';
function identify(window) {
  const identity = `${window.applicationId || ''} ${window.className} ${window.instance} ${window.executable}`;
  const browser = /(?:firefox|chromium|chrome|brave|edge|vivaldi)/i.test(identity);
  if (/(?:^|[ ./_-])(?:sober|roblox(?:playerbeta)?)(?:$|[ ./_-])/i.test(identity) || (!browser && /^(?:Roblox|Sober)(?:$| [—–-] )/i.test(window.title))) return { categoryId: '1e2Ad6EOaE', categoryName: 'Roblox (Sober)', isGame: true };
  if (/(?:^|[ ./_-])minecraft(?:$|[ ./_-])/i.test(identity) || (!browser && /^Minecraft(?:$| [\d—–-])/i.test(window.title))) return { categoryId: 'hAXdelx2t', categoryName: 'Minecraft', isGame: true };
  const steamGame = /[\\/]steamapps[\\/]common[\\/]/i.test(window.executablePath || '') && !/(?:launcher|crash|helper|webview|steamwebhelper)/i.test(window.executable);
  const gameExecutable = [window.executable, window.className, window.instance].some(name => /^(?:hl2|gmod|cs2|csgo|tf_linux64|dota2|GeometryDash|RobloxPlayerBeta)(?:\.exe)?$/i.test(name));
  const steamIdentity = /(?:^|\s)steam_app_[1-9]\d*(?:$|\s)/i.test(identity);
  return { categoryId: SCREEN_CATEGORY, categoryName: window.title, isGame: !browser && (steamGame || steamIdentity || gameExecutable) };
}
class Games {
  constructor(profile) { this.file = path.join(profile, 'linux-game-targets.json'); this.targets = []; this.selected = null; this.suppressed = new Set(); }
  async load() { try { const value = JSON.parse(await fs.readFile(this.file, 'utf8')); if (Array.isArray(value)) this.targets = value.filter(v => typeof v.className === 'string' && typeof v.executable === 'string').slice(0, 100); } catch {} }
  async windows() {
    const { stdout } = await run('python3', [path.join(__dirname, 'janelas-linux.py')], { timeout: 5000, maxBuffer: 2 * 1024 * 1024 });
    const result = JSON.parse(stdout);
    return result.windows.filter(w => w.pid !== process.pid && !/^(medal-linux|medal)$/i.test(w.className) && !/^(cinnamon|nemo-desktop|xfce4-panel|plasmashell)$/i.test(w.className)).map(w => {
      const game = identify(w);
      return { ...w, ...game, processName: `${game.categoryId === SCREEN_CATEGORY ? w.executable : game.categoryName} — ${w.title} [0x${Number(w.windowId).toString(16)}]`, active: w.windowId === result.activeWindow };
    });
  }
  matches(saved, window) {
    const cls = String(window.className).toLowerCase();
    if (String(saved.className).toLowerCase() !== cls) return false;
    // Flatpak wrappers may expose a different executable after an update.
    return String(saved.executable).toLowerCase() === String(window.executable).toLowerCase() || /(?:sober|minecraft|roblox)/.test(cls);
  }
  async select(candidate, remember = true) {
    const rows = await this.windows();
    const target = rows.find(w => candidate.windowId ? w.windowId === String(candidate.windowId) : w.processName === candidate.processName);
    if (!target) throw new Error('The selected game window is no longer visible. Refresh the game list.');
    this.suppressed.delete(target.className + '\0' + target.executable);
    if (remember && !this.targets.some(t => this.matches(t, target))) {
      this.targets.push({ className: target.className, executable: target.executable });
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(this.targets, null, 2), { mode: 0o600 });
    }
    this.selected = target; return target;
  }
  async remove(processName) {
    const normalize = value => String(value || '').replace(/\.exe$/i, '').toLowerCase();
    const normalized = normalize(processName);
    const selected = this.selected && [this.selected.processName, this.selected.executable].some(v => normalize(v) === normalized) ? this.selected : null;
    this.targets = this.targets.filter(t => selected ? !this.matches(t, selected) : ![t.processName, t.executable].some(v => normalize(v) === normalized));
    await fs.writeFile(this.file, JSON.stringify(this.targets, null, 2), { mode: 0o600 });
    if (selected) { this.suppressed.add(selected.className + '\0' + selected.executable); this.selected = null; }
  }
  autoTarget(rows) {
    const games = rows.filter(w => !this.suppressed.has(w.className + '\0' + w.executable) && (w.isGame || this.targets.some(t => this.matches(t, w))));
    return games.find(w => w.active) || (games.length === 1 ? games[0] : undefined);
  }
}
module.exports = { Games, identify, SCREEN_CATEGORY };
