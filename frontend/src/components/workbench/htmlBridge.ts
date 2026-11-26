const THEME_VAR_NAMES = [
  '--bg-page',
  '--bg-sidebar',
  '--bg-surface',
  '--bg-elevated',
  '--bg-hover',
  '--text-primary',
  '--text-secondary',
  '--text-muted',
  '--border-subtle',
  '--border-strong',
  '--accent',
  '--accent-contrast',
  '--danger',
  '--success',
] as const

export function readCurrentThemeSnapshot(): {
  theme: 'light' | 'dark'
  vars: Record<string, string>
} {
  const root = document.documentElement
  const theme = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
  const cs = getComputedStyle(root)
  const vars: Record<string, string> = {}
  for (const name of THEME_VAR_NAMES) {
    vars[name] = cs.getPropertyValue(name).trim()
  }
  return { theme, vars }
}

export function buildBridgeInjection(
  appId: string,
  bridgeToken: string,
  initialData: Record<string, unknown>,
  snapshot: { theme: 'light' | 'dark'; vars: Record<string, string> },
): string {
  const cssLines = Object.entries(snapshot.vars)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n  ')

  const safeDataJson = JSON.stringify(initialData).replace(/</g, '\\u003c')
  const safeVarsJson = JSON.stringify(snapshot.vars).replace(/</g, '\\u003c')

  return `
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;">
<style id="donut-theme-vars">
:root {
  color-scheme: ${snapshot.theme};
  ${cssLines}
}
html, body {
  margin: 0;
  padding: 0;
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
</style>
<script>
(function () {
  var APP_ID = ${JSON.stringify(appId)};
  var BRIDGE_TOKEN = ${JSON.stringify(bridgeToken)};
  var currentTheme = ${JSON.stringify(snapshot.theme)};
  var cachedData = ${safeDataJson};
  var themeListeners = [];
  var pending = {};
  var seq = 0;

  function applyTheme(theme, vars) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    root.setAttribute('data-theme', currentTheme);
    root.style.colorScheme = currentTheme;
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (k) { root.style.setProperty(k, vars[k]); });
    }
    themeListeners.forEach(function (fn) { try { fn(currentTheme, vars); } catch (e) {} });
  }

  function callParent(type, payload) {
    return new Promise(function (resolve, reject) {
      var reqId = 'req_' + (++seq);
      pending[reqId] = { resolve: resolve, reject: reject };
      window.parent.postMessage({
        channel: 'donut-microapp',
        appId: APP_ID,
        token: BRIDGE_TOKEN,
        reqId: reqId,
        type: type,
        payload: payload || {}
      }, '*');
    });
  }

  window.addEventListener('message', function (ev) {
    var msg = ev.data;
    if (!msg || msg.channel !== 'donut-microapp' || msg.token !== BRIDGE_TOKEN) return;
    if (msg.type === 'donut:theme') {
      applyTheme(msg.theme, msg.vars);
      return;
    }
    if (msg.reqId && pending[msg.reqId]) {
      var cb = pending[msg.reqId];
      delete pending[msg.reqId];
      if (msg.error) cb.reject(new Error(msg.error));
      else cb.resolve(msg.result);
    }
  });

  window.DonutApp = {
    appId: APP_ID,
    getInitialData: function () { return cachedData; },
    getData: function () {
      return callParent('app:getData').then(function (d) {
        cachedData = d || {};
        return cachedData;
      });
    },
    setData: function (nextData) {
      return callParent('app:setData', { data: nextData }).then(function (d) {
        cachedData = d || nextData || {};
        return cachedData;
      });
    },
    getTheme: function () { return currentTheme; },
    onThemeChange: function (fn) {
      if (typeof fn === 'function') themeListeners.push(fn);
    },
    toast: function (message) {
      window.parent.postMessage({
        channel: 'donut-microapp',
        appId: APP_ID,
        token: BRIDGE_TOKEN,
        type: 'app:toast',
        payload: { message: String(message || '') }
      }, '*');
    }
  };
  applyTheme(currentTheme, ${safeVarsJson});
})();
</script>`.trim()
}

export function injectIntoHtml(html: string, snippet: string): string {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${snippet}`)
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1>\n<head>\n${snippet}\n</head>`)
  }
  return `<!doctype html><html><head><meta charset="utf-8" />\n${snippet}\n</head><body>\n${html}\n</body></html>`
}
