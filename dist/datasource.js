"use strict";
// Static data source: reads a pre-generated data.json (no server needed).
let _data = null;
async function _load() {
  if (!_data) {
    const r = await fetch("data.json");
    if (!r.ok) throw new Error("data.json " + r.status);
    _data = await r.json();
  }
  return _data;
}
window.DS = {
  mode: "static",
  async status() {
    const d = await _load();
    return { configFolder: "(статическая сборка)", files: d.generatedFiles,
             classes: d.classesCount, itemClasses: d.classes.length, translations: d.translations };
  },
  async scopes() { return (await _load()).scopes; },
  async classes({ search, scope, limit, desc } = {}) {
    const d = await _load();
    let items = d.classes;
    if (scope) { const sc = scope.toLowerCase(); items = items.filter(c => (c.scope || "").toLowerCase() === sc); }
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(c =>
        c.name.toLowerCase().includes(s) ||
        (c.display || "").toLowerCase().includes(s) ||
        (desc && ((d.details[c.path] && d.details[c.path].description) || "").toLowerCase().includes(s)));
    }
    const total = items.length, max = limit || 5000;
    return { total, shown: Math.min(max, total), items: items.slice(0, max) };
  },
  async detail(path) { return (await _load()).details[path] || null; },
};