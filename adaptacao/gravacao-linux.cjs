// Linux backend for the existing Medal screen-recording commands.
// No added menus, fixed shortcuts, notifications, titles, or renderer controls.
const { app, screen, BrowserWindow, Menu } = require('electron');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const crypto = require('node:crypto');
const { Recorder } = require('./nucleo-gravador.cjs');
const { ClipFeedback } = require('./notificacao-clipe.cjs');
const { Games } = require('./jogos-linux.cjs');
const { Hotkeys } = require('./atalhos-linux.cjs');
const run = promisify(execFile);
let controller;

function install(api) {
  let recorder, sessionId, quitting = false, operation = Promise.resolve();
  const nativeRecorder = api.context.recorder;
  const feedback = new ClipFeedback(api.getSetting);
  const games = new Games(app.getPath('userData'));
  let gamePoll, polling = false;
  const pausedWindows = new Set();
  const report = error => { console.error('[linux-recorder]', error.message); api.events.emit('recorderFailure', { errorMessage: error.message }); };
  const hotkeys = new Hotkeys({ events: api.events, getSetting: api.getSetting, mainWindow: () => api.context.mainWindow, execute: action => executeAction(action), report });
  function publish() {
    const active = recorder && ['recording', 'replaying'].includes(recorder.state);
    nativeRecorder.stateMachine.status = active ? 'capturing' : 'ready';
    const category = games.selected || { categoryId: '1b7CpvXVSuB', categoryName: 'Screen Recording' };
    nativeRecorder.stateMachine.meta = active ? { categoryId: category.categoryId, categoryName: category.categoryName } : {};
    api.setGameState({ sessionId: sessionId || crypto.randomUUID(), contexts: active ? [{ type: 'CATEGORY', externalId: category.categoryId, metadata: { recording: true, name: category.categoryName, processName: games.selected?.processName } }] : [] });
    api.events.emit('screenRecordingUpdate', !!active);
  }
  async function displays() {
    await app.whenReady();
    if (process.env.XDG_SESSION_TYPE === 'wayland') throw new Error('A captura Linux disponível exige uma sessão X11.');
    let sources = [];
    try {
      const { stdout } = await run('xrandr', ['--query'], { env: { ...process.env, LC_ALL: 'C' }, timeout: 4000 });
      sources = [...stdout.matchAll(/^(\S+) connected( primary)? (\d+)x(\d+)([+-]\d+)([+-]\d+)/gm)].map(m => ({ id: m[1], primary: !!m[2], width: +m[3], height: +m[4], x: +m[5], y: +m[6], display: process.env.DISPLAY }));
    } catch {}
    if (!sources.length) sources = screen.getAllDisplays().map(d => ({ id: String(d.id), primary: d.id === screen.getPrimaryDisplay().id, width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor), x: Math.round(d.bounds.x * d.scaleFactor), y: Math.round(d.bounds.y * d.scaleFactor), display: process.env.DISPLAY }));
    return sources;
  }
  const ready = app.whenReady().then(async () => {
    await games.load();
    recorder = new Recorder({ directory: path.join(app.getPath('videos'), 'Medal', 'Gravacoes'), source: async () => {
      if (games.selected) return games.select(games.selected, false);
      const list = await displays();
      const selected = await api.getSetting('MonitorDeviceName');
      return list.find(d => d.id === selected) || list.find(d => d.primary) || list[0];
    }, onFile: async file => {
      const row = await api.createContent({ createdAt: Date.now(), uuid: crypto.randomUUID(), title: '', gameCategoryId: games.selected?.categoryId || '1b7CpvXVSuB', clipLocation: file, isImport: true, metadata: {} });
      api.allowPaths([file, row.thumbnail_path]); api.refresh(); return row;
    } });
    recorder.on('saved', () => feedback.saved().catch(error => console.error('[notificacao-clipe]', error)));
    recorder.on('state', () => {
      publish();
      require('node:fs/promises').writeFile(path.join(app.getPath('userData'), 'recording-diagnostics.json'), JSON.stringify(recorder.status().diagnostics, null, 2)).catch(() => {});
    });
    recorder.on('failure', error => { console.error('[linux-recorder]', error); api.events.emit('recorderFailure', { errorMessage: error.message }); });
    const hideMenu = window => { window.setAutoHideMenuBar(true); window.setMenuBarVisibility(false); };
    for (const window of BrowserWindow.getAllWindows()) hideMenu(window);
    app.on('browser-window-created', (_, window) => hideMenu(window));
    Menu.setApplicationMenu(null);
    publish();
    // Main-process-only diagnostics; no new renderer API is exposed.
    global.__medalLinuxRecorder = recorder;
    global.__medalLinuxRecordingApi = { ...api, displays, hotkeys, games, feedback, setTargetProcess };
    return recorder;
  });
  async function configure() {
    const values = await api.getSetting(['TargetFPS', 'Encoder', 'RecordingEnabled', 'MicEnabled', 'AudioModeConfig', 'Codec', 'FullSessionMode', 'Hotkeys']);
    if (values.RecordingEnabled === false) throw new Error('Ative a gravação nas configurações originais do Medal.');
    if (values.Codec && values.Codec !== 'H264') throw new Error('A captura Linux disponível usa H.264. Selecione H.264 nas configurações originais.');
    recorder.settings.fps = Math.max(1, Math.min(60, Number(values.TargetFPS) || 60));
    const audio = values.AudioModeConfig;
    const system = audio?.pcAudioEnabled !== false && audio?.sources?.find(s => s.id === 'game-audio')?.enabled !== false;
    recorder.settings.audio = system ? (values.MicEnabled ? 'both' : 'system') : (values.MicEnabled ? 'mic' : 'none');
    recorder.settings.cpuFallback = values.Encoder !== 'CPU';
    if (values.Encoder === 'CPU') recorder.encoder = 'libx264';
    else recorder.encoder = null;
    const lengths = (values.Hotkeys || []).filter(h => h.action?.startsWith('clip;')).map(h => Number(/(?:^|;)length=([\d.]+)/.exec(h.action)?.[1])).filter(n => n > 0 && Number.isFinite(n));
    recorder.settings.seconds = Math.min(1259, Math.max(30, ...lengths));
    return values;
  }
  function setCapturing(enabled) {
    const next = operation.then(async () => {
      await ready;
      if (enabled) {
        // This entry point is Medal's explicit Screen Recording command.
        if (games.selected) {
          if (recorder.state !== 'idle') await recorder.stop();
          games.selected = null; currentCaptureTarget = null;
        }
        if (recorder.state !== 'idle') return true;
        const values = await configure(); sessionId = crypto.randomUUID();
        await recorder.start(values.FullSessionMode ? 'record' : 'replay');
      } else {
        if (games.selected) pausedWindows.add(games.selected.windowId);
        if (recorder.state !== 'idle') await recorder.stop();
      }
      return ['recording', 'replaying'].includes(recorder.state);
    });
    operation = next.catch(error => { publish(); console.error('[linux-recorder]', error.message); });
    return next;
  }
  function executeAction(action) {
    const next = operation.then(async () => {
      await ready;
      if (action.split(';')[0] === 'segment_toggle') {
        if (recorder.state === 'recording') return recorder.stop();
        if (recorder.state === 'replaying') await recorder.stop();
        await configure(); sessionId = crypto.randomUUID();
        return recorder.start('record');
      }
      if (recorder.state !== 'replaying') throw new Error('Para salvar os últimos segundos, ative a captura de tela no modo Clips do Medal.');
      const seconds = Number(/(?:^|;)length=([\d.]+)/.exec(action)?.[1]) || 30;
      return recorder.saveReplay(Math.min(1259, Math.max(1, seconds)));
    });
    operation = next.catch(() => {});
    return next;
  }
  async function setTargetProcess(candidate) {
    const next = operation.then(async () => {
      await ready;
      const target = await games.select(candidate);
      pausedWindows.delete(target.windowId);
      // Keep the previous file associated with its original game while finalizing.
      const previous = games.selected; games.selected = currentCaptureTarget;
      try { if (recorder.state !== 'idle') await recorder.stop(); } finally { games.selected = previous; }
      currentCaptureTarget = target;
      await configure(); sessionId = crypto.randomUUID();
      await recorder.start((await api.getSetting('FullSessionMode')) ? 'record' : 'replay');
      api.events.emit('targetProcessSet', target);
      return target;
    });
    operation = next.catch(error => { api.events.emit('recorderError', { type: 'game-request-failed', message: error.message }); report(error); });
    return next;
  }
  let currentCaptureTarget = null;
  async function pollGames() {
    if (polling || quitting) return; polling = true;
    try {
      await ready;
      const rows = await games.windows();
      for (const id of pausedWindows) if (!rows.some(w => w.windowId === id)) pausedWindows.delete(id);
      if (games.selected && !rows.some(w => w.windowId === games.selected.windowId) && recorder.state === 'idle') { games.selected = null; currentCaptureTarget = null; publish(); }
      if (games.selected && recorder.state !== 'idle') {
        const target = rows.find(w => w.windowId === games.selected.windowId);
        if (!target || target.width !== games.selected.width || target.height !== games.selected.height) {
          await setCapturing(false); games.selected = null; currentCaptureTarget = null; publish();
        }
      } else if (recorder.state === 'idle' && (await api.getSetting('RecordingEnabled')) !== false) {
        const target = games.autoTarget(rows.filter(w => !pausedWindows.has(w.windowId))); if (target) await setTargetProcess(target);
      }
    } catch (error) { console.error('[jogos-linux]', error.message); }
    finally { polling = false; }
  }
  async function request(method) {
    await ready;
    if (method === 'activeDisplays') return (await displays()).map(d => ({ DeviceName: d.id, IsPrimaryScreen: d.primary, Width: d.width, Height: d.height, X: d.x, Y: d.y, CurrentScreenshot: null }));
    if (method === 'getActiveProcesses') return games.windows();
    if (method === 'getTargetedProcesses') return games.selected && recorder.state !== 'idle' ? [games.selected] : [];
    if (['gamePluginsInstalled', 'webcamDevices', 'audioProcesses'].includes(method)) return [];
    if (method === 'startHotkeyListening') return hotkeys.startListening();
    if (method === 'availableMicDevices' || method === 'availableAudioDevices') {
      const type = method === 'availableMicDevices' ? 'sources' : 'sinks';
      const { stdout } = await run('pactl', ['--format=json', 'list', type], { timeout: 4000 });
      return JSON.parse(stdout).filter(d => type !== 'sources' || !d.name.endsWith('.monitor')).map(d => d.name);
    }
    if (method === 'getDefaultAudioDevices') {
      const [input, output] = await Promise.all(['get-default-source', 'get-default-sink'].map(option => run('pactl', [option], { timeout: 4000 }).then(r => r.stdout.trim())));
      return { input, output };
    }
    throw new Error(`O comando ${method} ainda não tem implementação Linux.`);
  }
  async function notification(method, payload = {}) {
    if (method === 'settings') {
      if (payload.settings?.some(s => ['Hotkeys', 'RecordingEnabled'].includes(s.key))) await hotkeys.refresh();
      if (payload.settings?.some(s => s.key === 'RecordingEnabled' && s.value === false)) return setCapturing(false);
      const capture = payload.settings?.find(s => s.key === 'ScreenCaptureEnabled');
      if (capture) return setCapturing(!!capture.value);
      return;
    }
    if (method === 'setTargetProcess') return setTargetProcess(payload.data || payload);
    if (method === 'deleteTargetProcess') { await setCapturing(false); await games.remove((payload.data || payload).processName); games.selected = null; currentCaptureTarget = null; publish(); return; }
    if (method === 'switchGameRecording') {
      const data = payload.data || payload;
      const target = (await games.windows()).find(w => data.processName ? w.processName === data.processName : w.categoryId === data.categoryId);
      if (!target) throw new Error('No visible window matches this game.');
      return setTargetProcess(target);
    }
    if (method === 'shutdown') return setCapturing(false);
    if (method === 'stopHotkeyListening') return hotkeys.stopListening();
    if (['user', 'windowsGameMode'].includes(method)) return;
    throw new Error(`O comando ${method} ainda não tem implementação Linux.`);
  }
  function startGamePolling() {
    if (gamePoll || process.env.XDG_SESSION_TYPE === 'wayland' || quitting) return;
    gamePoll = setInterval(pollGames, 2000); gamePoll.unref();
    pollGames().catch(report);
  }
  // Linux startup does not necessarily call the Windows recorder's run().
  ready.then(startGamePolling).catch(report);
  api.context.WSHandler.sendRequest = request;
  api.context.WSHandler.sendNotification = notification;
  nativeRecorder.run = async () => { await ready; await hotkeys.refresh(); publish(); startGamePolling(); api.events.emit('recorderReady'); return 0; };
  api.events.on('authChanged', () => hotkeys.refresh().catch(report));
  nativeRecorder.killRecorder = async () => { await setCapturing(false); return true; };
  controller = { setCapturing, setTargetProcess, ready };
  const originalQuit = app.quit.bind(app);
  app.quit = () => {
    if (quitting === 'done') return originalQuit();
    if (quitting) return;
    quitting = true;
    clearInterval(gamePoll);
    feedback.destroy();
    hotkeys.destroy();
    setCapturing(false).catch(error => console.error('[linux-recorder:quit]', error)).finally(() => { quitting = 'done'; originalQuit(); });
  };
  app.on('before-quit', event => {
    if (!quitting && recorder && recorder.state !== 'idle') { event.preventDefault(); app.quit(); }
  });
}
module.exports = { install, setCapturing: enabled => {
  if (!controller) return Promise.reject(new Error('O gravador ainda está inicializando.'));
  return controller.setCapturing(enabled);
}, setTargetProcess: candidate => {
  if (!controller) return Promise.reject(new Error('The recorder is still initializing.'));
  return controller.setTargetProcess(candidate);
} };
