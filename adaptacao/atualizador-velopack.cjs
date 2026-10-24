// The Windows updater cannot update this isolated Linux prototype.
class VelopackApp {
  static build() { return new VelopackApp(); }
  onRestarted() { return this; }
  onFirstRun() { return this; }
  setArgs() { return this; }
  setLogger() { return this; }
  setAutoApplyOnStartup() { return this; }
  run() {}
}
class HttpSource { constructor(url) { this.url = url; } }
class UpdateManager {
  constructor() { throw new Error('Automatic Windows updates are disabled in Medal Linux Prototype.'); }
}
module.exports = { VelopackApp, HttpSource, UpdateManager };
