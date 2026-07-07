"use strict";
// Live data source: talks to the ASP.NET API. The static build ships a different
// datasource.js that reads a pre-generated data.json instead. app.js uses only `window.DS`.

async function _api(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

window.DS = {
  mode: "api",

  status() {
    return _api("/api/status");
  },

  scopes() {
    return _api("/api/scopes");
  },

  classes({ search, scope, limit } = {}) {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (scope) p.set("scope", scope);
    p.set("limit", String(limit || 5000));
    return _api("/api/classes?" + p.toString());
  },

  detail(path) {
    return _api("/api/class?path=" + encodeURIComponent(path));
  },
};
