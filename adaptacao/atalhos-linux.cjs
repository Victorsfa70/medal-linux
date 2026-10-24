const { app, BrowserWindow, globalShortcut } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const modifierNames = new Set(['CONTROL', 'CTRL', 'ALT', 'ALTGRAPH', 'SHIFT', 'META', 'SUPER', 'OS']);
const keyNames = { ' ': 'SPACE', ARROWUP: 'UP', ARROWDOWN: 'DOWN', ARROWLEFT: 'LEFT', ARROWRIGHT: 'RIGHT', '+': 'PLUS', AUDIOVOLUMEUP: 'VOLUMEUP', AUDIOVOLUMEDOWN: 'VOLUMEDOWN', AUDIOVOLUMEMUTE: 'VOLUMEMUTE', MEDIATRACKNEXT: 'MEDIANEXTTRACK', MEDIATRACKPREVIOUS: 'MEDIAPREVIOUSTRACK' };
const keypadCodes = Object.fromEntries([
  ...Array.from({ length: 10 }, (_, n) => [`Numpad${n}`, `NUMPAD ${n}`]),
  ['NumpadAdd', 'NUMPAD ADD'], ['NumpadSubtract', 'NUMPAD SUBTRACT'], ['NumpadMultiply', 'NUMPAD MULTIPLY'], ['NumpadDivide', 'NUMPAD DIVIDE'], ['NumpadDecimal', 'NUMPAD DECIMAL'], ['NumpadComma', 'NUMPAD COMMA'], ['NumpadEnter', 'NUMPAD ENTER'], ['NumpadEqual', 'NUMPAD EQUAL'],
]);
const keypadSymbols = Object.fromEntries([
  ...Array.from({ length: 10 }, (_, n) => [`NUMPAD ${n}`, `KP_${n}`]),
  ['NUMPAD ADD', 'KP_Add'], ['NUMPAD SUBTRACT', 'KP_Subtract'], ['NUMPAD MULTIPLY', 'KP_Multiply'], ['NUMPAD DIVIDE', 'KP_Divide'], ['NUMPAD DECIMAL', 'KP_Decimal'], ['NUMPAD COMMA', 'KP_Separator'], ['NUMPAD ENTER', 'KP_Enter'], ['NUMPAD EQUAL', 'KP_Equal'],
]);
function fromInput(input) {
  const mods = [input.control && 'CTRL', input.alt && 'ALT', input.shift && 'SHIFT', input.meta && 'WIN'].filter(Boolean);
  const raw = String(input.key || '').toUpperCase();
  return { mods, key: keypadCodes[input.code] || keyNames[raw] || raw };
}
function keypadBinding(inputs) {
  const parts = (Array.isArray(inputs) ? inputs.join(' + ') : String(inputs || '')).toUpperCase().split(/\s*\+\s*/);
  const keysym = keypadSymbols[parts.at(-1)];
  if (!keysym) return null;
  const aliases = { CTRL: 'CTRL', CONTROL: 'CTRL', ALT: 'ALT', SHIFT: 'SHIFT', WIN: 'WIN', META: 'WIN', SUPER: 'WIN' };
  const modifiers = parts.slice(0, -1).map(part => aliases[part]);
  if (modifiers.some(mod => !mod)) throw new Error('Combinação inválida para o numpad.');
  return { keysym, modifiers };
}
function accelerator(inputs) {
  if (Array.isArray(inputs)) inputs = inputs.join(' + ');
  if (typeof inputs !== 'string' || !inputs.trim()) return null;
  const aliases = { CTRL: 'Control', CONTROL: 'Control', ALT: 'Alt', SHIFT: 'Shift', WIN: 'Super', META: 'Super', SPACE: 'Space', PLUS: 'Plus', ESC: 'Escape', ENTER: 'Return', PAGEUP: 'PageUp', PAGEDOWN: 'PageDown', BACKSPACE: 'Backspace', DELETE: 'Delete', INSERT: 'Insert', HOME: 'Home', END: 'End', TAB: 'Tab', UP: 'Up', DOWN: 'Down', LEFT: 'Left', RIGHT: 'Right' };
  return inputs.split(/\s*\+\s*/).map(part => aliases[part.toUpperCase()] || part).join('+');
}

class Hotkeys {
  constructor({ events, getSetting, mainWindow, execute, report }) {
    Object.assign(this, { events, getSetting, mainWindow, execute, report });
    this.registered = new Set(); this.keypadRegistered = new Set(); this.capture = null; this.revision = 0;
    app.on('will-quit', () => this.destroy());
  }
  unregister() {
    for (const key of this.registered) globalShortcut.unregister(key);
    this.registered.clear();
    this.keypadRegistered.clear();
    const child = this.keypadChild; this.keypadChild = null;
    if (!child) return Promise.resolve();
    return new Promise(resolve => { child.once('close', resolve); child.kill('SIGTERM'); });
  }
  async refresh() {
    if (this.destroyed) return;
    const revision = ++this.revision;
    await app.whenReady();
    const values = await this.getSetting(['Hotkeys', 'RecordingEnabled']);
    if (this.destroyed || revision !== this.revision || this.capture) return;
    await this.unregister();
    if (this.destroyed || revision !== this.revision || this.capture) return;
    if (values.RecordingEnabled === false) return;
    const groups = new Map();
    for (const binding of values.Hotkeys || []) {
      if (binding.device !== 'keyboard' || binding.type !== 'short_press' || !['clip', 'segment_toggle'].includes(binding.action?.split(';')[0])) continue;
      const key = keypadBinding(binding.inputs) ? (Array.isArray(binding.inputs) ? binding.inputs.join(' + ') : binding.inputs).toUpperCase() : accelerator(binding.inputs);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(binding.action);
    }
    const bindings = [];
    const names = {ESCAPE:'Escape',BACKSPACE:'BackSpace',DELETE:'Delete',INSERT:'Insert',HOME:'Home',END:'End',TAB:'Tab',VOLUMEUP:'XF86AudioRaiseVolume',VOLUMEDOWN:'XF86AudioLowerVolume',VOLUMEMUTE:'XF86AudioMute',MEDIANEXTTRACK:'XF86AudioNext',MEDIAPREVIOUSTRACK:'XF86AudioPrev',MEDIAPLAYPAUSE:'XF86AudioPlay',Control:'Control_L',Alt:'Alt_L',Shift:'Shift_L',Super:'Super_L',Return:'Return',Space:'space',Plus:'plus',Up:'Up',Down:'Down',Left:'Left',Right:'Right',PageUp:'Prior',PageDown:'Next',VolumeUp:'XF86AudioRaiseVolume',VolumeDown:'XF86AudioLowerVolume',VolumeMute:'XF86AudioMute'};
    for (const [key, actions] of groups) {
      let binding = keypadBinding(key);
      if (!binding) {
        const parts = key.split('+');
        const raw = parts.pop();
        const modifiers = parts.map(p => ({Control:'CTRL',Alt:'ALT',Shift:'SHIFT',Super:'WIN'})[p]);
        if (modifiers.some(m => !m)) continue;
        binding = { keysym: ({'!':'exclam','@':'at','#':'numbersign','$':'dollar','%':'percent','^':'asciicircum','&':'ampersand','*':'asterisk','(':'parenleft',')':'parenright','-':'minus','_':'underscore','=':'equal','[':'bracketleft',']':'bracketright','{':'braceleft','}':'braceright',';':'semicolon',':':'colon',"'":'apostrophe','"':'quotedbl',',':'comma','.':'period','/':'slash','?':'question','\\':'backslash','|':'bar','`':'grave','~':'asciitilde'})[raw] || names[raw] || (raw.length === 1 ? raw.toLowerCase() : raw), modifiers };
      }
      bindings.push({ ...binding, id: bindings.length, key, actions });
    }
    if (bindings.length) await this.registerKeypad(bindings, revision);
  }

  registerKeypad(bindings, revision) {
    const child = spawn('python3', [path.join(__dirname, 'teclado-global.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.keypadChild = child;
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(bindings.map(({ id, keysym, modifiers }) => ({ id, keysym, modifiers }))) + '\n');
    let buffer = '', stderr = '';
    child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-1500); });
    return new Promise(resolve => {
      let ready = false;
      const finish = () => { if (!ready) { ready = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(() => { if (this.keypadChild === child) { this.keypadChild = null; child.kill(); this.report(new Error('Não foi possível iniciar os atalhos do numpad.')); } finish(); }, 5000);
      child.on('error', error => { if (this.keypadChild === child) { this.keypadChild = null; this.report(error); } finish(); });
      child.on('close', code => { if (this.keypadChild === child) { this.keypadChild = null; this.keypadRegistered.clear(); if (!this.destroyed) this.report(new Error('O serviço de atalhos do numpad encerrou. ' + stderr)); } finish(); });
      child.stdout.on('data', bytes => {
        buffer += bytes.toString();
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let message; try { message = JSON.parse(line); } catch { continue; }
          if (this.keypadChild !== child || revision !== this.revision) continue;
          if (message.event === 'ready') { this.keypadRegistered = new Set(message.ids.map(id => bindings[id]?.key).filter(Boolean)); finish(); }
          else if (message.event === 'rejected' || message.event === 'error') this.report(new Error(message.message));
          else if (message.event === 'pressed' && !this.capture && bindings[message.id]) {
            for (const action of bindings[message.id].actions) Promise.resolve().then(() => this.execute(action)).catch(this.report);
          }
        }
      });
    });
  }
  async startListening() {
    if (this.destroyed) return false;
    this.stopListening(false, false);
    const window = BrowserWindow.getFocusedWindow() || this.mainWindow();
    if (!window || window.isDestroyed() || !window.webContents.getURL().endsWith('renderer.min.html')) return false;
    const revision = ++this.revision; await this.unregister();
    if (this.destroyed || revision !== this.revision) return false;
    const contents = window.webContents;
    const cancel = () => this.stopListening(true);
    const listener = (event, input) => {
      event.preventDefault();
      if (input.isAutoRepeat) return;
      const { mods, key } = fromInput(input);
      this.events.emit('hotkeyCaptureState', { modifiers: mods });
      if (input.type !== 'keyDown') return;
      if (key === 'ESCAPE') return cancel();
      if (!key || modifierNames.has(key)) return;
      this.stopListening(false);
      this.events.emit('hotkeyCaptured', { device: 'keyboard', inputs: [...mods, key].join(' + ') });
    };
    const timer = setTimeout(cancel, 30000); timer.unref();
    this.capture = { window, contents, listener, cancel, timer };
    contents.on('before-input-event', listener);
    contents.once('destroyed', cancel);
    contents.once('did-start-navigation', cancel);
    window.once('blur', cancel);
    this.events.emit('hotkeyCaptureState', { modifiers: [] });
    return true;
  }
  stopListening(cancelled = false, refresh = true) {
    const state = this.capture; this.capture = null;
    if (state) {
      clearTimeout(state.timer);
      state.contents.removeListener('before-input-event', state.listener);
      state.contents.removeListener('destroyed', state.cancel);
      state.contents.removeListener('did-start-navigation', state.cancel);
      state.window.removeListener('blur', state.cancel);
      if (cancelled) this.events.emit('hotkeyCaptureCancelled', {});
    }
    if (refresh) this.refresh().catch(this.report);
  }
  destroy() { this.destroyed = true; ++this.revision; this.stopListening(false, false); this.unregister(); }
}
module.exports = { Hotkeys, accelerator, fromInput, keypadBinding };
