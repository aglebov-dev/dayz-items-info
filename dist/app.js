"use strict";

const el = (id) => document.getElementById(id);
const listEl = el("classList");
const searchEl = el("searchInput");
const scopeEl = el("scopeSelect");
const descEl = el("searchDescToggle");
const infoEl = el("listInfo");

let activePath = null;
let debounceTimer = null;
let lastDetail = null;

// ---- helpers ---------------------------------------------------------------

function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- class list ------------------------------------------------------------

async function loadScopes() {
  const scopes = await DS.scopes();
  for (const s of scopes) {
    const o = document.createElement("option");
    o.value = s.name;
    o.textContent = `${s.name} (${s.count})`;
    scopeEl.appendChild(o);
  }
}

async function loadStatus() {
  try {
    const s = await DS.status();
    const st = el("appStatus");
    if (s.itemClasses === 0) {
      st.innerHTML =
        `<b>Список пуст.</b> В папке не найдено классов:<br>` +
        `<code>${esc(s.configFolder)}</code><br>` +
        `Проверьте <code>Dayz:ConfigFolder</code> в appsettings.json.`;
      st.classList.add("warn");
    } else {
      st.innerHTML =
        `Загружено: <b>${s.itemClasses}</b> классов-предметов (scope=2) из <b>${s.files}</b> файлов, ` +
        `переводов: <b>${s.translations}</b>.`;
    }
  } catch { /* status is best-effort */ }
}

async function loadClasses() {
  const data = await DS.classes({
    search: searchEl.value.trim() || undefined,
    scope: scopeEl.value || undefined,
    desc: descEl.checked || undefined,
    limit: 5000,
  });
  renderList(data);
}

function renderList(data) {
  infoEl.textContent =
    data.total > data.shown
      ? `Показано ${data.shown} из ${data.total}. Уточните поиск.`
      : `${data.total} классов`;

  listEl.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const c of data.items) {
    const li = document.createElement("li");
    li.dataset.path = c.path;
    if (c.path === activePath) li.classList.add("active");
    li.innerHTML =
      `<span class="cl-scope">${esc(c.scope)}</span>` +
      `<span class="cl-name">${esc(c.name)}</span>` +
      (c.display ? `<span class="cl-display">${esc(c.display)}</span>` : "");
    li.addEventListener("click", () => selectClass(c.path));
    frag.appendChild(li);
  }
  listEl.appendChild(frag);
}

function markActive(path) {
  for (const li of listEl.children)
    li.classList.toggle("active", li.dataset.path === path);
}

// ---- details ---------------------------------------------------------------

// push=true adds a browser history entry (so Back/Forward work); false is used when
// we're already reacting to a popstate / deep link.
async function selectClass(path, push = true) {
  const d = await DS.detail(path);
  if (!d) return;
  activePath = path;
  markActive(path);
  renderDetails(d);

  const url = "#" + encodeURIComponent(path);
  if (push && location.hash !== url) history.pushState({ path }, "", url);
}

function pathFromHash() {
  return location.hash ? decodeURIComponent(location.hash.slice(1)) : null;
}

function showEmpty() {
  activePath = null;
  markActive(null);
  el("detailCard").hidden = true;
  el("emptyState").hidden = false;
}

window.addEventListener("popstate", (e) => {
  const path = (e.state && e.state.path) || pathFromHash();
  if (path) selectClass(path, false);
  else showEmpty();
});

function renderValue(v) {
  if (!v) return "";
  if (v.isArray) {
    if (!v.items || v.items.length === 0) return `<span class="arr-item">{}</span>`;
    return v.items.map((i) => `<span class="arr-item">${esc(i)}</span>`).join("");
  }
  let badge = "";
  if (v.translated) {
    const code = { russian: "RU", english: "EN", original: "EN", german: "DE" }[v.lang] || "TR";
    const cls = v.lang && v.lang !== "russian" ? "badge-tr fallback" : "badge-tr";
    badge = `<span class="${cls}" title="${esc(v.raw)} (${esc(v.lang || "")})">${code}</span>`;
  }
  return `${esc(v.text)}${badge}`;
}

function renderDetails(d) {
  el("emptyState").hidden = true;
  el("detailCard").hidden = false;

  el("dName").textContent = d.name;
  el("dDisplay").textContent = d.display || "";
  el("dDesc").textContent = d.description || "";
  el("dScope").textContent = d.scope || "";
  el("dSource").textContent = d.source ? `${d.source.file}:${d.source.line}` : "";

  // inheritance chain
  const inh = el("dInherit");
  const chain = d.inheritance || [];
  el("inheritBlock").hidden = chain.length <= 1;
  inh.innerHTML = chain
    .map((n, i) => {
      const self = i === chain.length - 1;
      const link = `<span class="link${self ? " self" : ""}">${esc(n)}</span>`;
      return i < chain.length - 1 ? link + `<span class="arrow">▸</span>` : link;
    })
    .join("");

  // properties
  const props = d.properties || [];
  el("propCount").textContent = `(${props.length})`;
  el("dProps").innerHTML = props
    .map((p) => {
      const origin = p.inherited
        ? `<span class="badge-inh" title="Наследуется от ${esc(p.definedIn)}">↑ ${esc(p.definedIn)}</span>`
        : "";
      return (
        `<tr class="${p.inherited ? "inherited" : ""}">` +
        `<td class="pname">${esc(p.name)}</td>` +
        `<td class="pval">${renderValue(p.value)}</td>` +
        `<td>${origin}</td></tr>`
      );
    })
    .join("");

  lastDetail = d;
  renderSlots(d);
  el("details").scrollTop = 0;
}

function itemsHtml(items) {
  if (!items || !items.length)
    return `<div class="slot-empty">нет совместимых предметов в загруженном наборе</div>`;
  return (
    `<div class="slot-items">` +
    items
      .map(
        (it) =>
          `<div class="item" data-path="${esc(it.path)}">` +
          `<span class="i-name">${esc(it.name)}</span>` +
          (it.display ? `<span class="i-disp">${esc(it.display)}</span>` : "") +
          `</div>`
      )
      .join("") +
    `</div>`
  );
}

function renderSlots(d) {
  const raw = el("rawSlotsToggle").checked;
  const groups = d.slotGroups || [];
  const slots = d.slots || [];
  el("slotsBlock").hidden = (raw ? slots.length : groups.length) === 0;

  if (raw) {
    el("slotCount").textContent = `(${slots.length} слотов)`;
    el("dSlots").innerHTML = slots
      .map(
        (s) =>
          `<div class="slot"><div class="slot-head ${s.items.length ? "" : "empty"}">` +
          `<span class="sn">${esc(s.name)}</span>` +
          `<span class="sd">${esc(s.displayName || (s.hasDefinition ? "" : "ванильный слот"))}</span>` +
          `</div>${itemsHtml(s.items)}</div>`
      )
      .join("");
  } else {
    const real = groups.filter((g) => !g.isEmpty).length;
    el("slotCount").textContent = `(${real} логических${groups.length !== slots.length ? ` из ${slots.length} слотов` : ""})`;
    el("dSlots").innerHTML = groups
      .map((g) => {
        const members =
          g.slots.length > 1
            ? `<span class="sd members" title="Взаимозаменяемые слоты">${esc(g.slots.join(", "))}</span>`
            : "";
        return (
          `<div class="slot ${g.isEmpty ? "grp-empty" : ""}">` +
          `<div class="slot-head ${g.isEmpty ? "empty" : ""}">` +
          `<span class="sn">${esc(g.label)}` +
          (g.slots.length > 1 ? ` <span class="grp-badge">×${g.slots.length}</span>` : "") +
          (g.isEmpty ? ` <span class="grp-tag">ванилла/пусто</span>` : "") +
          `</span>${members}</div>` +
          itemsHtml(g.items) +
          `</div>`
        );
      })
      .join("");
  }

  // clicking an item navigates to it
  for (const item of el("dSlots").querySelectorAll(".item[data-path]")) {
    const p = item.getAttribute("data-path");
    if (p) item.addEventListener("click", () => selectClass(p));
  }
}

// ---- events ----------------------------------------------------------------

searchEl.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadClasses, 180);
});
scopeEl.addEventListener("change", loadClasses);
descEl.addEventListener("change", loadClasses);

el("rawSlotsToggle").addEventListener("change", () => {
  if (lastDetail) renderSlots(lastDetail);
});

(async function init() {
  loadStatus();
  // Load the class list first (main data); the scope filter is secondary.
  try {
    await loadClasses();
  } catch (e) {
    infoEl.textContent = "Ошибка загрузки списка: " + e.message +
      " — открыт ли сервер по адресу этой страницы?";
  }
  try { await loadScopes(); } catch { /* optional */ }

  // Deep link: open the class named in the URL hash (so refresh / shared links work).
  const initPath = pathFromHash();
  if (initPath) {
    history.replaceState({ path: initPath }, "", location.hash);
    selectClass(initPath, false);
  }
})();
