const { EventEmitter } = require('node:events');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const run = promisify(execFile);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function videoFilter(source, maxWidth = 1920, maxHeight = 1080, encoder = 'libx264') {
  const factor = Math.min(1, maxWidth / source.width, maxHeight / source.height);
  const width = Math.max(2, Math.floor(source.width * factor / 2) * 2);
  const height = Math.max(2, Math.floor(source.height * factor / 2) * 2);
  const format = encoder === 'h264_nvenc' ? 'nv12' : 'yuv420p';
  return (width === source.width && height === source.height ? '' : `scale=${width}:${height}:flags=fast_bilinear,`) + `format=${format}`;
}
function screenInput(source, fps) {
  if (!source.display) throw new Error('Esta captura usa uma sessão X11. Entre na sessão Cinnamon/XFCE X11 para gravar.');
  return ['-thread_queue_size', '16', '-f', 'x11grab', ...(source.windowId ? ['-window_id', String(source.windowId)] : []), '-draw_mouse', '1', '-framerate', String(fps), '-video_size', `${source.width}x${source.height}`, '-i', source.windowId ? source.display : `${source.display}+${source.x},${source.y}`];
}
function outputArgs({ encoder, source, fps, audioCount, replay, directory, file, maxWidth, maxHeight, threads }) {
  const args = [];
  if (audioCount > 1) args.push('-filter_complex', '[1:a][2:a]amix=inputs=2:duration=longest:dropout_transition=0[audio]', '-map', '0:v:0', '-map', '[audio]');
  else { args.push('-map', '0:v:0'); if (audioCount) args.push('-map', '1:a:0'); }
  args.push('-vf', videoFilter(source, maxWidth, maxHeight, encoder), '-c:v', encoder, '-pix_fmt', encoder === 'h264_nvenc' ? 'nv12' : 'yuv420p');
  if (encoder === 'h264_nvenc') args.push('-preset', 'p1', '-tune', 'll', '-rc-lookahead', '0', '-bf', '0', '-cq', '23', '-b:v', '0');
  else args.push('-preset', 'ultrafast', '-tune', 'zerolatency', '-threads', String(threads), '-crf', '23');
  args.push('-g', String(fps * 2), '-keyint_min', String(fps * 2), '-sc_threshold', '0', '-force_key_frames', 'expr:gte(t,n_forced*2)');
  if (audioCount) args.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000');
  if (replay) args.push('-f', 'segment', '-segment_format', 'matroska', '-segment_time', '2', '-reset_timestamps', '1', '-segment_list', path.join(directory, 'closed.csv'), '-segment_list_type', 'csv', path.join(directory, 'part-%08d.mkv'));
  else args.push('-f', 'matroska', file);
  return args;
}

class Recorder extends EventEmitter {
  constructor({ directory, source, onFile = async () => {}, settings = {}, command = 'ffmpeg', inputBuilder, encoderProbe, pollMs = 1000 }) {
    super(); this.directory = path.resolve(directory); this.getSource = source; this.onFile = onFile; this.command = command;
    this.settings = { fps: 60, seconds: 60, audio: 'system', cpuFallback: false, ...settings };
    this.inputBuilder = inputBuilder; this.encoderProbe = encoderProbe; this.pollMs = pollMs;
    this.diagnostics = {}; this.state = 'idle'; this.mode = null; this.child = null; this.encoder = null; this.stderr = ''; this.busySave = false; this.savedClips = 0;
  }
  status() { return { state: this.state, mode: this.mode, encoder: this.encoder, savedClips: this.savedClips, seconds: this.settings.seconds, diagnostics: this.diagnostics }; }
  changed() { this.emit('state', this.status()); }
  async chooseEncoder() {
    if (this.encoder) return this.encoder;
    if (this.encoderProbe) this.encoder = await this.encoderProbe();
    else if (this.encoderCache) this.encoder = this.encoderCache;
    else {
      try { await run(this.command, ['-v', 'error', '-f', 'lavfi', '-i', 'color=s=64x64:r=1', '-frames:v', '1', '-c:v', 'h264_nvenc', '-f', 'null', '-'], { timeout: 12000 }); this.encoder = 'h264_nvenc'; }
      catch (error) { this.encoder = 'libx264'; this.nvencFailure = String(error.stderr || error.message).slice(-700); }
    }
    this.encoderCache = this.encoder;
    return this.encoder;
  }
  async audioInputs() {
    if (this.settings.audio === 'none') return { args: [], count: 0 };
    let sink, mic;
    try {
      if (['system', 'both'].includes(this.settings.audio)) sink = (await run('pactl', ['get-default-sink'], { timeout: 4000 })).stdout.trim();
      if (['mic', 'both'].includes(this.settings.audio)) mic = (await run('pactl', ['get-default-source'], { timeout: 4000 })).stdout.trim();
    } catch { throw new Error('Não consegui acessar o áudio do PulseAudio/PipeWire. Confira a saída de som ou selecione Gravação → Áudio → Sem áudio.'); }
    const sources = [];
    if (sink) sources.push(sink + '.monitor');
    if (mic) sources.push(mic);
    if (!sources.length) throw new Error('Nenhuma fonte de áudio está disponível. Selecione outra opção no menu Gravação → Áudio.');
    return { args: sources.flatMap(name => ['-thread_queue_size', '1024', '-f', 'pulse', '-i', name]), count: sources.length };
  }
  async start(mode = 'record') {
    if (this.state !== 'idle') throw new Error('Já existe uma captura em andamento. Pare-a antes de trocar o modo.');
    if (!['record', 'replay'].includes(mode)) throw new Error('Modo de captura inválido.');
    this.state = 'starting'; this.mode = mode; this.changed(); this.stderr = '';
    try {
      await fs.mkdir(this.directory, { recursive: true });
      const source = await this.getSource();
      if (!(source.width > 0 && source.height > 0)) throw new Error('Tela de captura inválida.');
      const encoder = await this.chooseEncoder();
      const fallback = encoder === 'libx264' && this.settings.cpuFallback;
      const fps = fallback ? Math.min(30, this.settings.fps) : this.settings.fps;
      const maxWidth = fallback ? 1280 : 1920, maxHeight = fallback ? 720 : 1080;
      const threads = Math.max(1, Math.min(2, Math.floor((os.availableParallelism?.() || os.cpus().length) / 2)));
      this.diagnostics = { encoder, requestedFPS: this.settings.fps, captureFPS: fps, cpuFallback: fallback, maxWidth, maxHeight, threads: encoder === 'libx264' ? threads : null, nvencFailure: fallback ? this.nvencFailure : undefined };
      console.info('[linux-recorder:performance]', JSON.stringify(this.diagnostics));
      const input = this.inputBuilder ? await this.inputBuilder(source, fps) : { args: screenInput(source, fps), ...await this.audioInputs() };
      const audioArgs = input.args;
      const baseInput = this.inputBuilder ? [] : screenInput(source, fps);
      const replay = mode === 'replay';
      this.bufferDir = replay ? await fs.mkdtemp(path.join(this.directory, '.replay-')) : null;
      this.file = path.join(this.directory, `Medal-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.mkv`);
      const args = ['-hide_banner', '-loglevel', 'warning', '-y', '-nostdin', '-progress', 'pipe:1', '-stats_period', '0.5', '-filter_threads', '2', '-filter_complex_threads', '1', ...baseInput, ...audioArgs,
        ...outputArgs({ encoder, source, fps, maxWidth, maxHeight, threads, audioCount: input.count, replay, directory: this.bufferDir, file: this.file })];
      const child = spawn(this.command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      try { os.setPriority(child.pid, 5); } catch {}
      this.exit = new Promise(resolve => {
        child.once('error', error => { this.stderr += error.message; resolve({ code: -1, error }); });
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      child.stderr.on('data', data => { this.stderr = (this.stderr + data.toString()).slice(-16000); });
      let progress = '';
      const ready = new Promise((resolve, reject) => {
        child.stdout.on('data', data => {
          progress = (progress + data.toString()).slice(-4000);
          const metric = key => [...progress.matchAll(new RegExp('(?:^|\\n)' + key + '=([^\\n]+)', 'g'))].at(-1)?.[1]?.trim();
          this.diagnostics.observedFPS = Number(metric('fps')) || 0;
          this.diagnostics.droppedFrames = Number(metric('drop_frames')) || 0;
          this.diagnostics.duplicatedFrames = Number(metric('dup_frames')) || 0;
          if (/frame=\s*[1-9]\d*/.test(progress)) resolve();
        });
        this.exit.then(() => reject(new Error(this.stderr.trim() || 'O gravador encerrou antes de capturar a primeira imagem.')));
      });
      let timer;
      try { await Promise.race([ready, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('O gravador não iniciou em 15 segundos. ' + this.stderr.slice(-1500))), 15000); })]); }
      finally { clearTimeout(timer); }
      this.state = mode === 'replay' ? 'replaying' : 'recording'; this.changed();
      if (replay) this.poll = setInterval(() => { this.cleanSegments().catch(error => this.emit('warning', error.message)); }, this.pollMs);
      this.exit.then(() => {
        if (this.child === child && ['recording', 'replaying'].includes(this.state)) {
          // Closing/unmapping a selected window ends x11grab. Finalize its file.
          this.stop({ unexpected: true }).catch(error => this.emit('failure', error));
        }
      });
      return this.status();
    } catch (error) {
      if (this.child) { this.child.kill('SIGINT'); await this.waitForExit().catch(() => {}); }
      this.child = null; this.state = 'idle'; this.mode = null; this.changed(); throw error;
    }
  }
  async waitForExit() {
    const result = await Promise.race([this.exit, delay(15000).then(() => null)]);
    if (result) return result;
    this.child?.kill('SIGTERM');
    const retry = await Promise.race([this.exit, delay(3000).then(() => null)]);
    if (retry) return retry;
    this.child?.kill('SIGKILL'); throw new Error('O gravador demorou para encerrar. O arquivo MKV permanece na pasta de gravações.');
  }
  async segments() {
    if (!this.bufferDir) return [];
    let csv; try { csv = await fs.readFile(path.join(this.bufferDir, 'closed.csv'), 'utf8'); } catch { return []; }
    const names = [...csv.matchAll(/(?:^|\n)"?([^",\r\n]+)"?,/g)].map(match => path.basename(match[1]));
    const result = [];
    for (const name of names) {
      if (!/^part-\d{8}\.mkv$/.test(name)) continue;
      const file = path.join(this.bufferDir, name);
      if (await fs.stat(file).then(stat => stat.size > 0, () => false)) result.push(file);
    }
    return result;
  }
  async cleanSegments() {
    if (this.busySave || !this.bufferDir) return;
    const segments = await this.segments();
    const keep = Math.ceil(this.settings.seconds / 2) + 3;
    for (const file of segments.slice(0, -keep)) await fs.unlink(file).catch(() => {});
  }
  async saveReplay(seconds = this.settings.seconds) {
    if (this.state !== 'replaying') throw new Error('Ative o replay antes de salvar os últimos segundos.');
    if (this.busySave) throw new Error('Um clipe já está sendo salvo.');
    this.busySave = true;
    let snapshot;
    try {
      const source = (await this.segments()).slice(-Math.ceil(Math.min(this.settings.seconds, seconds) / 2));
      if (!source.length) throw new Error('O replay ainda está preenchendo. Aguarde pelo menos 3 segundos.');
      snapshot = await fs.mkdtemp(path.join(this.directory, '.saving-'));
      const lines = [];
      for (const [index, file] of source.entries()) {
        const name = `segment-${index}.mkv`; await fs.copyFile(file, path.join(snapshot, name)); lines.push(`file '${name}'`);
      }
      const list = path.join(snapshot, 'clips.txt'); await fs.writeFile(list, lines.join('\n'));
      const destination = path.join(this.directory, `Replay-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}.mp4`);
      await run(this.command, ['-v', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', list, '-c', 'copy', '-movflags', '+faststart', destination], { timeout: 60000, maxBuffer: 1024 * 1024 });
      await this.onFile(destination); this.savedClips++; this.emit('saved', destination); this.changed();
      return destination;
    } finally {
      this.busySave = false;
      if (snapshot) await fs.rm(snapshot, { recursive: true, force: true });
    }
  }
  async stop({ unexpected = false } = {}) {
    if (!this.child || this.state === 'idle') return null;
    if (this.state === 'starting' || this.state === 'stopping') throw new Error('Aguarde a operação de captura terminar.');
    const wasReplay = this.mode === 'replay';
    let saveError;
    if (wasReplay && !this.busySave && (await this.segments()).length) {
      try { await this.saveReplay(); } catch (error) { saveError = error; }
    }
    if (this.busySave) throw new Error('Aguarde o clipe terminar de salvar antes de encerrar o replay.');
    this.state = 'stopping'; this.changed(); clearInterval(this.poll);
    const file = this.file; const buffer = this.bufferDir;
    try {
      this.child.kill('SIGINT'); const result = await this.waitForExit();
      if (!unexpected && ![0, 255].includes(result.code) && result.signal !== 'SIGINT') throw new Error('O gravador não finalizou normalmente. ' + this.stderr.slice(-2200));
      if (!wasReplay) {
        if (unexpected) await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file], { timeout: 5000 });
        const stat = await fs.stat(file); if (stat.size < 1024) throw new Error('A gravação não contém vídeo suficiente.');
        await this.onFile(file); this.savedClips++; this.emit('saved', file); return file;
      }
      if (saveError) throw saveError;
      return null;
    } finally {
      this.child = null; this.bufferDir = null; this.state = 'idle'; this.mode = null; this.changed();
      if (buffer) await fs.rm(buffer, { recursive: true, force: true });
    }
  }
}
module.exports = { Recorder, screenInput, outputArgs, videoFilter };
