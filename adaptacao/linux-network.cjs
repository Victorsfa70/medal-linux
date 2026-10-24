// Permit normal application traffic; keep known analytics destinations disabled.
const blockedDomains = ['amplitude.com', 'launchdarkly.com', 'launchdarkly.us', 'sentry.io', 'honeycomb.io', 'segment.io', 'google-analytics.com', 'analytics.google.com', 'mixpanel.com'];
function blocked(host) {
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  return blockedDomains.some(domain => host === domain || host.endsWith('.' + domain));
}
function install({ app, session }) {
  const sockets = require('node:net');
  const connect = sockets.Socket.prototype.connect;
  sockets.Socket.prototype.connect = function (...args) {
    const options = args[0] && typeof args[0] === 'object' ? args[0] : null;
    const host = options?.host || options?.hostname || (typeof args[1] === 'string' ? args[1] : '');
    if (blocked(host)) {
      queueMicrotask(() => this.destroy(Object.assign(new Error('Analytics disabled in Linux prototype'), { code: 'ERR_MEDAL_ANALYTICS_DISABLED' })));
      return this;
    }
    return connect.apply(this, args);
  };
  function protect(target) {
    target.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (request, done) => {
      let cancel = false;
      try {
        const url = new URL(request.url);
        cancel = blocked(url.hostname) || (url.hostname === 'api-v2.medal.tv' && url.pathname.startsWith('/instrument/'));
      } catch {}
      done({ cancel });
    });
  }
  app.on('session-created', protect);
  app.whenReady().then(() => protect(session.defaultSession));
}
module.exports = { install, blocked };
