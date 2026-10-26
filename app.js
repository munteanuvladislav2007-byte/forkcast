// Forkcast: a personal calorie and macro diary.
// Food data from USDA FoodData Central + Open Food Facts; meal estimates pasted from a Claude chat.

const ZXING_URL = "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js";
const OFF = "https://world.openfoodfacts.org";
const FDC = "https://api.nal.usda.gov/fdc/v1";

const NUTS = [
  ["kcal", "Energy", "kcal"], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"],
  ["fiber", "Fiber", "g"], ["sugar", "Sugars", "g"], ["sodium", "Sodium", "mg"],
];
// "Unsorted" is where the general Add buttons put food; drag entries from there into a meal.
const MEALS = ["Unsorted", "Breakfast", "Lunch", "Dinner", "Snacks"];
const STORE = "forkcast.v1";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const r0 = (v) => Math.round(v || 0);
const r1 = (v) => Math.round((v || 0) * 10) / 10;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- State ----------
const DEFAULTS = {
  settings: { usdaKey: "DEMO_KEY", targets: { kcal: 2200, protein: 150, carbs: 220, fat: 75 } },
  log: {},
  recents: [],
  favorites: [],
  recipes: [], // premade meals: { id, name, items: [{ food, grams }] }
};
let S = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULTS), ...d,
        settings: { ...DEFAULTS.settings, ...d.settings, targets: { ...DEFAULTS.settings.targets, ...(d.settings || {}).targets } },
      };
    }
  } catch {}
  return structuredClone(DEFAULTS);
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {}
}

// ---------- Dates ----------
function iso(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function shiftDay(day, n) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
}
function dayLabel(day) {
  const t = iso();
  if (day === t) return "Today";
  if (day === shiftDay(t, -1)) return "Yesterday";
  if (day === shiftDay(t, 1)) return "Tomorrow";
  return new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
let day = iso();

// ---------- Nutrition math ----------
function scale(food, grams) {
  const o = {};
  for (const [k] of NUTS) o[k] = ((food.per100 && food.per100[k]) || 0) * grams / 100;
  return o;
}
function total(entries) {
  const o = Object.fromEntries(NUTS.map(([k]) => [k, 0]));
  for (const e of entries) {
    const n = scale(e.food, e.grams);
    for (const k in o) o[k] += n[k];
  }
  return o;
}
function defaultMeal() {
  const h = new Date().getHours();
  return h < 11 ? "Breakfast" : h < 15 ? "Lunch" : h < 21 ? "Dinner" : "Snacks";
}
function macroLine(n) {
  return `<span class="dots"><span class="dot p">${r1(n.protein)}P</span><span class="dot c">${r1(n.carbs)}C</span><span class="dot f">${r1(n.fat)}F</span></span>`;
}
function fmtGrams(g) {
  return `${r1(g)} g`;
}

// ---------- Diary render ----------
function render() {
  $("#dayLabel").textContent = dayLabel(day);
  const entries = S.log[day] || [];
  const tot = total(entries);
  const T = S.settings.targets;

  const left = T.kcal - tot.kcal;
  $("#kcalLeft").textContent = r0(Math.abs(left));
  $("#kcalLeftCap").textContent = left >= 0 ? "kcal left" : "kcal over";
  $("#kcalEaten").textContent = r0(tot.kcal);
  $("#kcalTarget").textContent = r0(T.kcal);
  const C = 326.73;
  const frac = T.kcal ? Math.min(tot.kcal / T.kcal, 1) : 0;
  const ring = $("#ringFill");
  ring.style.strokeDashoffset = String(C * (1 - frac));
  ring.classList.toggle("over", left < 0);

  $("#macroBars").innerHTML = [["protein", "Protein", "--protein"], ["carbs", "Carbs", "--carbs"], ["fat", "Fat", "--fat"]]
    .map(([k, label, color]) => {
      const pct = T[k] ? Math.min(100, (tot[k] / T[k]) * 100) : 0;
      return `<div class="macro"><b>${label}</b><div class="bar"><i style="width:${pct}%;background:var(${color})"></i></div><span class="val">${r0(tot[k])} / ${r0(T[k])} g</span></div>`;
    }).join("");

  $("#meals").innerHTML = MEALS.map((meal) => {
    const list = entries.filter((e) => e.meal === meal);
    const mt = total(list);
    const unsorted = meal === "Unsorted";
    if (unsorted && !list.length) return "";
    return `<section class="meal${unsorted ? " unsorted" : ""}" data-meal="${meal}">
      <div class="meal-head"><h3>${meal}</h3><span class="kcal">${list.length ? r0(mt.kcal) + " kcal" : ""}</span>
        ${list.length ? `<button class="icon-btn save-meal" data-save-meal="${meal}" aria-label="Save ${meal} as a premade meal" title="Save as a premade meal"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>` : ""}
        <button class="add-btn" data-add="${meal}">+ Add</button></div>
      ${unsorted ? `<p class="unsorted-hint">Drag these into a meal with the handle, or leave them here.</p>` : ""}
      ${list.length ? `<ul class="entries">${list.map((e) => {
        const n = scale(e.food, e.grams);
        const tag = e.food.source === "AI estimate" ? `<span class="src-ai">AI</span>` : e.food.source === "My meal" ? `<span class="src-ai">Meal</span>` : "";
        return `<li class="entry" data-edit="${e.id}">
          <button class="grip" aria-label="Drag ${esc(e.food.name)} to another meal"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>
          <div class="entry-main"><div class="entry-name">${esc(e.food.name)}${tag}</div>
          <div class="entry-sub">${fmtGrams(e.grams)} &middot; ${macroLine(n)}</div></div><div class="entry-kcal">${r0(n.kcal)}</div></li>`;
      }).join("")}</ul>` : ""}
    </section>`;
  }).join("") + (entries.length ? "" : `<p class="empty-day">Nothing logged for ${esc(dayLabel(day).toLowerCase())} yet. Tap Add food, scan a barcode, or paste a meal from Claude.</p>`);
}

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- Sheets ----------
function openSheet(id) {
  const d = $(id);
  if (!d.open) d.showModal();
}
function closeSheet(d) {
  if (typeof d === "string") d = $(d);
  if (d.open) d.close();
  if (d.id === "addSheet") onAddClosed();
}
$$("dialog.sheet").forEach((d) => {
  d.addEventListener("click", (e) => {
    if (e.target === d) closeSheet(d); // backdrop tap
    if (e.target.closest("[data-close]")) closeSheet(d);
  });
});
// Runs on every way the add sheet can close (buttons, backdrop, Escape); safe to call twice.
function onAddClosed() {
  stopScan();
  if (pickMode) {
    pickMode = false;
    showRecipe(); // back to the meal being edited
  }
}
$("#addSheet").addEventListener("close", onAddClosed);

// ---------- Add sheet & tabs ----------
let addMeal = "Unsorted";
// When set, picking a food adds it as an ingredient of the premade meal being edited instead of logging it.
let pickMode = false;
function fillMealSelect(sel, value) {
  sel.innerHTML = MEALS.map((m) => `<option ${m === value ? "selected" : ""}>${m}</option>`).join("");
}
function openAdd(tab, meal, { pick = false } = {}) {
  pickMode = pick;
  addMeal = meal || "Unsorted";
  fillMealSelect($("#addMeal"), addMeal);
  $("#addTitleText").textContent = pick ? `Add ingredient to ${draft.name || "your meal"}` : "Add to";
  $("#addMeal").hidden = pick;
  openSheet("#addSheet");
  setTab(tab);
}
$("#addMeal").addEventListener("change", (e) => (addMeal = e.target.value));

function setTab(tab) {
  $$(".tabs [data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  $$(".tab-panel").forEach((p) => (p.hidden = p.dataset.panel !== tab));
  if (tab === "scan") startScan();
  else stopScan();
  if (tab === "search") {
    if (!$("#q").value) renderList();
    setTimeout(() => $("#q").focus(), 50);
  }
}
$$(".tabs [data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ---------- Food data: USDA ----------
function titleCase(s) {
  s = String(s || "").trim();
  if (s && s === s.toUpperCase()) return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  return s;
}
function fromUSDA(f) {
  const get = (nums) => {
    for (const n of f.foodNutrients || []) {
      const num = String(n.nutrientNumber ?? n.nutrient?.number ?? "");
      if (!nums.includes(num)) continue;
      const unit = String(n.unitName ?? n.nutrient?.unitName ?? "").toLowerCase();
      if (unit === "kj") continue;
      return Number(n.value ?? n.amount) || 0;
    }
    return 0;
  };
  const per100 = {
    kcal: get(["208", "958", "957"]), protein: get(["203"]), carbs: get(["205"]), fat: get(["204"]),
    fiber: get(["291"]), sugar: get(["269"]), sodium: get(["307"]),
  };
  const servings = [];
  if (f.servingSize && /^(g|ml|grm|mlt)$/i.test(f.servingSizeUnit || "")) {
    const label = f.householdServingFullText ? `${f.householdServingFullText} (${r1(f.servingSize)} g)` : `1 serving (${r1(f.servingSize)} g)`;
    servings.push({ label, grams: Number(f.servingSize) });
  }
  for (const m of (f.foodMeasures || []).slice(0, 8)) {
    if (m.gramWeight && m.disseminationText && !/quantity not specified/i.test(m.disseminationText)) {
      servings.push({ label: `${m.disseminationText} (${r1(m.gramWeight)} g)`, grams: Number(m.gramWeight) });
    }
  }
  return {
    id: "fdc:" + f.fdcId,
    name: titleCase(f.description),
    brand: titleCase(f.brandName || f.brandOwner || ""),
    source: f.dataType === "Branded" ? "USDA Branded" : "USDA",
    generic: f.dataType !== "Branded",
    per100, servings, code: f.gtinUpc || "",
  };
}
function usdaKey() {
  return encodeURIComponent(S.settings.usdaKey || "DEMO_KEY");
}
async function searchUSDA(q) {
  const types = encodeURIComponent("Foundation,SR Legacy,Survey (FNDDS),Branded");
  const r = await fetch(`${FDC}/foods/search?api_key=${usdaKey()}&query=${encodeURIComponent(q)}&pageSize=30&dataType=${types}`);
  if (r.status === 429) throw new Error("USDA rate limit reached (DEMO_KEY). Add a free key in Settings.");
  if (!r.ok) throw new Error("USDA search failed (" + r.status + ")");
  const j = await r.json();
  return (j.foods || []).map(fromUSDA).filter((f) => f.per100.kcal || f.per100.protein || f.per100.carbs || f.per100.fat);
}

// ---------- Food data: Open Food Facts ----------
function fromOFF(p) {
  const n = p.nutriments || {};
  const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(n["energy-kj_100g"]) ?? num(n["energy_100g"]);
    kcal = kj != null ? kj / 4.184 : null;
  }
  let sodium = num(n.sodium_100g);
  if (sodium == null) {
    const salt = num(n.salt_100g);
    sodium = salt != null ? salt / 2.5 : 0;
  }
  const per100 = {
    kcal: kcal || 0, protein: num(n.proteins_100g) || 0, carbs: num(n.carbohydrates_100g) || 0, fat: num(n.fat_100g) || 0,
    fiber: num(n.fiber_100g) || 0, sugar: num(n.sugars_100g) || 0, sodium: (sodium || 0) * 1000,
  };
  const servings = [];
  const sq = num(p.serving_quantity);
  if (sq) {
    const label = p.serving_size ? (/\d\s*(g|ml)\b/i.test(p.serving_size) ? p.serving_size : `${p.serving_size} (${r1(sq)} g)`) : `1 serving (${r1(sq)} g)`;
    servings.push({ label, grams: sq });
  }
  return {
    id: "off:" + p.code,
    name: (p.product_name || p.product_name_en || "Unnamed product").trim(),
    brand: (p.brands || "").split(",")[0].trim(),
    source: "Open Food Facts", generic: false, per100, servings, code: p.code,
    hasNutrition: kcal != null,
  };
}
const OFF_FIELDS = "code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity";
// OFF text search is often overloaded or blocks browser requests; it is a bonus on top of USDA.
async function searchOFF(q) {
  const urls = [
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&fields=${OFF_FIELDS}`,
    `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const j = await r.json();
      return (j.hits || j.products || []).filter((p) => p.product_name).map(fromOFF).filter((f) => f.hasNutrition);
    } catch {}
  }
  return [];
}

async function lookupBarcode(raw) {
  const code = String(raw).replace(/\D/g, "");
  if (!code) return null;
  try {
    const r = await fetch(`${OFF}/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
    if (r.ok) {
      const j = await r.json();
      if (j.status === 1 && j.product) {
        const f = fromOFF({ ...j.product, code });
        if (f.hasNutrition) return f;
      }
    }
  } catch {}
  try {
    const r = await fetch(`${FDC}/foods/search?api_key=${usdaKey()}&query=${code}&dataType=Branded&pageSize=10`);
    if (r.ok) {
      const j = await r.json();
      const strip = (s) => String(s || "").replace(/^0+/, "");
      const hit = (j.foods || []).find((f) => strip(f.gtinUpc) === strip(code));
      if (hit) return fromUSDA(hit);
    }
  } catch {}
  return null;
}

// ---------- Search tab ----------
function resultItem(f, i, listName, extra = "") {
  const badgeCls = f.source.startsWith("USDA") ? "usda" : f.source === "Open Food Facts" ? "off" : f.source === "AI estimate" ? "ai" : "custom";
  const badge = f.source === "Open Food Facts" ? "OFF" : f.source === "USDA Branded" ? "USDA" : f.source === "AI estimate" ? "AI" : f.source === "My meal" ? "Meal" : f.source;
  const s = f.servings[0];
  const ref = s ? scale(f, s.grams) : f.per100;
  const refLabel = s ? (f.source === "My meal" ? "per meal" : "per serving") : "per 100 g";
  const star = isFav(f) ? `<span class="fav-mark" aria-label="Favorite">&#9733;</span>` : "";
  return `<li class="result" data-list="${listName}" data-i="${i}">
    <div class="result-main"><div class="result-name">${star}${esc(f.name)}</div>
    <div class="result-sub"><span class="badge ${badgeCls}">${esc(badge)}</span> ${esc(f.brand)}</div></div>
    <div class="result-kcal">${r0(ref.kcal)} kcal<small>${refLabel}</small></div>${extra}</li>`;
}
let lists = { results: [], recents: [], favorites: [], meals: [], history: [] };
let listKind = "recents";
const LIST_EMPTY = {
  recents: "Foods you log show up here for quick re-adding.",
  favorites: "Tap the star on any food to keep it here.",
  meals: "Save foods you often eat together, like a protein shake, and log them in one tap.",
  history: "Days you log food show up here. Tap any entry to add it again.",
};
function renderList(kind = listKind) {
  listKind = kind;
  $$("#listChips [data-list-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.listTab === kind)));
  $("#searchStatus").textContent = "";
  const R = $("#results");
  if (kind === "recents" || kind === "favorites") {
    lists[kind] = kind === "recents" ? S.recents.slice(0, 30) : S.favorites;
    R.innerHTML = lists[kind].length ? lists[kind].map((f, i) => resultItem(f, i, kind)).join("") : `<li class="status">${LIST_EMPTY[kind]}</li>`;
  } else if (kind === "meals") {
    lists.meals = S.recipes.map(recipeFood);
    R.innerHTML = (pickMode ? "" : `<li class="list-action"><button class="btn ghost wide" id="newRecipe">+ Create a premade meal</button></li>`) +
      (lists.meals.length
        ? lists.meals.map((f, i) => resultItem(f, i, "meals", pickMode ? "" : `<button class="icon-btn" data-edit-recipe="${S.recipes[i].id}" aria-label="Edit ${esc(f.name)}">&#9998;</button>`)).join("")
        : `<li class="status">${LIST_EMPTY.meals}</li>`);
  } else {
    lists.history = [];
    const days = Object.keys(S.log).filter((d) => (S.log[d] || []).length).sort().reverse().slice(0, 30);
    R.innerHTML = days.length ? days.map((d) => {
      const es = S.log[d];
      return `<li class="list-label">${esc(dayLabel(d))} &middot; ${r0(total(es).kcal)} kcal</li>` + es.map((e) => {
        const i = lists.history.push(e) - 1;
        const n = scale(e.food, e.grams);
        return `<li class="result" data-list="history" data-i="${i}"><div class="result-main"><div class="result-name">${esc(e.food.name)}</div>
          <div class="result-sub">${esc(e.meal)} &middot; ${fmtGrams(e.grams)} &middot; ${macroLine(n)}</div></div><div class="result-kcal">${r0(n.kcal)} kcal</div></li>`;
      }).join("");
    }).join("") : `<li class="status">${LIST_EMPTY.history}</li>`;
  }
}
$("#listChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-list-tab]");
  if (!b) return;
  $("#q").value = "";
  searchSeq++;
  renderList(b.dataset.listTab);
});
let searchSeq = 0;
$("#searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("#q").value.trim();
  if (!q) return renderList();
  $$("#listChips [data-list-tab]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  const seq = ++searchSeq;
  const st = $("#searchStatus");
  st.className = "status";
  st.innerHTML = `<span class="spinner"></span> Searching&hellip;`;
  $("#results").innerHTML = "";
  const [usda, off] = await Promise.allSettled([searchUSDA(q), searchOFF(q)]);
  if (seq !== searchSeq) return;
  const u = usda.status === "fulfilled" ? usda.value : [];
  const o = off.status === "fulfilled" ? off.value : [];
  const generic = u.filter((f) => f.generic);
  const branded = [];
  const ub = u.filter((f) => !f.generic);
  for (let i = 0; i < Math.max(ub.length, o.length); i++) {
    if (o[i]) branded.push(o[i]);
    if (ub[i]) branded.push(ub[i]);
  }
  lists.results = [...generic, ...branded].slice(0, 50);
  const errs = [usda, off].filter((x) => x.status === "rejected").map((x) => x.reason.message);
  st.className = "status" + (errs.length && !lists.results.length ? " err" : "");
  st.textContent = lists.results.length ? "" : errs.length ? errs.join(" ") : `No foods found for "${q}". Try a simpler name, or create a custom food.`;
  $("#results").innerHTML = lists.results.map((f, i) => resultItem(f, i, "results")).join("");
});
$("#results").addEventListener("click", (e) => {
  if (e.target.closest("#newRecipe")) { closeSheet("#addSheet"); return openRecipe(null); }
  const er = e.target.closest("[data-edit-recipe]");
  if (er) { closeSheet("#addSheet"); return openRecipe(er.dataset.editRecipe); }
  const li = e.target.closest(".result");
  if (!li) return;
  const item = lists[li.dataset.list][+li.dataset.i];
  if (li.dataset.list === "history") openFood(item.food, { grams: item.grams, meal: addMeal });
  else openFood(item, { meal: addMeal });
});

// ---------- Barcode tab ----------
let scanStop = null;
let scanBusy = false;
function scanStatus(msg, err = false) {
  const s = $("#scanStatus");
  s.className = "status" + (err ? " err" : "");
  s.innerHTML = msg;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error("Could not load the barcode scanner library."));
    document.head.appendChild(s);
  });
}
async function startScan() {
  stopScan();
  $("#scanResult").innerHTML = "";
  const video = $("#scanVideo");
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    scanStatus("The camera needs a secure (https) page. Type the barcode below or scan it from a photo.", true);
    return;
  }
  scanStatus(`<span class="spinner"></span> Starting camera&hellip;`);
  try {
    if ("BarcodeDetector" in window) {
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      video.srcObject = stream;
      await video.play();
      let alive = true;
      scanStop = () => { alive = false; stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
      scanStatus("Point the camera at a barcode.");
      const tick = async () => {
        if (!alive) return;
        try {
          const codes = await det.detect(video);
          if (codes.length) return onCode(codes[0].rawValue);
        } catch {}
        setTimeout(tick, 180);
      };
      tick();
    } else {
      await loadScript(ZXING_URL);
      const reader = new window.ZXing.BrowserMultiFormatReader();
      scanStop = () => reader.reset();
      await reader.decodeFromVideoDevice(null, video, (res) => { if (res) onCode(res.getText()); });
      scanStatus("Point the camera at a barcode.");
    }
  } catch (e) {
    scanStatus(e && e.name === "NotAllowedError"
      ? "Camera access was blocked. Allow it in your browser's site settings, or type the barcode below."
      : "Couldn't start the camera (" + esc(e.message || e.name) + "). Type the barcode below instead.", true);
  }
}
function stopScan() {
  if (scanStop) { try { scanStop(); } catch {} }
  scanStop = null;
}
async function onCode(code) {
  if (scanBusy) return;
  scanBusy = true;
  stopScan();
  try { navigator.vibrate && navigator.vibrate(60); } catch {}
  scanStatus(`<span class="spinner"></span> Looking up ${esc(code)}&hellip;`);
  try {
    const food = await lookupBarcode(code);
    if (food) {
      scanStatus("");
      openFood(food, { meal: addMeal });
    } else {
      scanStatus("");
      $("#scanResult").innerHTML = `<div class="notfound"><div><b>Barcode ${esc(code)} isn't in Open Food Facts or USDA yet.</b><br>Add it from the nutrition label, or snap the meal for an AI estimate.</div>
        <div class="row"><button class="btn" data-nf="custom" data-code="${esc(code)}">Enter label values</button><button class="btn ghost" data-nf="retry">Scan again</button></div></div>`;
    }
  } finally {
    scanBusy = false;
  }
}
$("#scanResult").addEventListener("click", (e) => {
  const b = e.target.closest("[data-nf]");
  if (!b) return;
  if (b.dataset.nf === "retry") startScan();
  else openCustom(b.dataset.code);
});
$("#codeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#codeInput").value.trim();
  if (v) onCode(v);
});
$("#codePhoto").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  stopScan();
  scanStatus(`<span class="spinner"></span> Reading barcode from photo&hellip;`);
  try {
    let code = null;
    if ("BarcodeDetector" in window) {
      const bmp = await createImageBitmap(file);
      const codes = await new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] }).detect(bmp);
      code = codes[0]?.rawValue || null;
    }
    if (!code) {
      await loadScript(ZXING_URL);
      const url = URL.createObjectURL(file);
      try { code = (await new window.ZXing.BrowserMultiFormatReader().decodeFromImageUrl(url)).getText(); } catch {}
      URL.revokeObjectURL(url);
    }
    if (code) onCode(code);
    else scanStatus("No barcode found in that photo. Try a closer, sharper shot, or type the number.", true);
  } catch (err) {
    scanStatus("Couldn't read that photo: " + esc(err.message), true);
  }
});

// ---------- Food detail sheet ----------
let detail = null;
function openFood(food, { grams, meal, entryId } = {}) {
  const s0 = food.servings && food.servings[0];
  detail = { food, entryId, meal: meal || addMeal || defaultMeal() };
  $("#foodName").textContent = food.name;
  $("#foodSub").textContent = [food.brand, food.source].filter(Boolean).join(" · ");
  $("#unit").innerHTML = (food.servings || []).map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join("") + `<option value="g">g / ml</option>`;
  if (grams != null) {
    $("#unit").value = "g";
    $("#amount").value = r1(grams);
  } else if (s0) {
    $("#unit").value = "0";
    $("#amount").value = 1;
  } else {
    $("#unit").value = "g";
    $("#amount").value = 100;
  }
  fillMealSelect($("#foodMeal"), detail.meal);
  $("#deleteEntry").hidden = !entryId;
  $("#foodMeal").hidden = pickMode;
  $("#logFood").textContent = pickMode ? "Add to meal" : entryId ? "Save" : "Add to diary";
  $("#favBtn").hidden = food.source === "My meal";
  updateFavBtn();
  renderFoodNutrients();
  openSheet("#foodSheet");
}

// ---------- Favorites ----------
function isFav(food) {
  return S.favorites.some((f) => f.id === food.id);
}
function updateFavBtn() {
  const on = isFav(detail.food);
  const b = $("#favBtn");
  b.innerHTML = on ? "&#9733;" : "&#9734;";
  b.setAttribute("aria-pressed", String(on));
  b.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
}
$("#favBtn").addEventListener("click", () => {
  const f = detail.food;
  if (isFav(f)) {
    S.favorites = S.favorites.filter((x) => x.id !== f.id);
    toast("Removed from favorites");
  } else {
    S.favorites = [f, ...S.favorites];
    toast("Added to favorites");
  }
  save();
  updateFavBtn();
  if ($("#addSheet").open && !$("#q").value) renderList();
});
function detailGrams() {
  const amt = parseFloat($("#amount").value) || 0;
  const u = $("#unit").value;
  return u === "g" ? amt : amt * detail.food.servings[+u].grams;
}
function renderFoodNutrients() {
  if (!detail) return;
  const g = detailGrams();
  detail.grams = g;
  const n = scale(detail.food, g);
  $("#foodNutrients").innerHTML = `
    <div class="nut-big">
      <div><b>${r0(n.kcal)}</b><span>kcal</span></div>
      <div class="p"><b>${r1(n.protein)}</b><span>protein g</span></div>
      <div class="c"><b>${r1(n.carbs)}</b><span>carbs g</span></div>
      <div class="f"><b>${r1(n.fat)}</b><span>fat g</span></div>
    </div>
    <table class="nut-table"><tbody>
      <tr><td>Amount</td><td>${fmtGrams(g)}</td></tr>
      <tr><td>Fiber</td><td>${r1(n.fiber)} g</td></tr>
      <tr><td>Sugars</td><td>${r1(n.sugar)} g</td></tr>
      <tr><td>Sodium</td><td>${r0(n.sodium)} mg</td></tr>
    </tbody></table>`;
}
$("#amount").addEventListener("input", renderFoodNutrients);
$("#unit").addEventListener("change", (e) => {
  // Keep the same total weight when switching units.
  const g = detail.grams || 100;
  const u = e.target.value;
  $("#amount").value = u === "g" ? r1(g) : Math.round((g / detail.food.servings[+u].grams) * 100) / 100;
  renderFoodNutrients();
});

function remember(food) {
  if (food.source === "AI estimate") return;
  S.recents = [food, ...S.recents.filter((f) => f.id !== food.id)].slice(0, 40);
}
function addEntry(food, grams, meal) {
  (S.log[day] ||= []).push({ id: uid(), meal, food, grams, at: Date.now() });
  remember(food);
}
$("#logFood").addEventListener("click", () => {
  const g = detailGrams();
  if (!(g > 0)) return toast("Enter an amount above zero.");
  if (pickMode) {
    draft.items.push({ food: detail.food, grams: g });
    remember(detail.food);
    save();
    closeSheet("#foodSheet");
    closeSheet("#addSheet"); // reopens the meal editor
    toast(`Added ${detail.food.name}`);
    return;
  }
  const meal = $("#foodMeal").value;
  if (detail.entryId) {
    const e = (S.log[day] || []).find((x) => x.id === detail.entryId);
    if (e) { e.grams = g; e.meal = meal; }
    toast("Saved");
  } else {
    addEntry(detail.food, g, meal);
    toast(`Added to ${meal}`);
    closeSheet("#addSheet");
  }
  save();
  closeSheet("#foodSheet");
  render();
});
$("#deleteEntry").addEventListener("click", () => {
  S.log[day] = (S.log[day] || []).filter((x) => x.id !== detail.entryId);
  save();
  closeSheet("#foodSheet");
  render();
  toast("Deleted");
});
$("#meals").addEventListener("click", (e) => {
  if (e.target.closest(".grip")) return;
  const add = e.target.closest("[data-add]");
  if (add) return openAdd("search", add.dataset.add);
  const sm = e.target.closest("[data-save-meal]");
  if (sm) {
    const items = (S.log[day] || []).filter((x) => x.meal === sm.dataset.saveMeal).map((x) => ({ food: x.food, grams: x.grams }));
    return openRecipe(null, items);
  }
  const li = e.target.closest("[data-edit]");
  if (li) {
    const en = (S.log[day] || []).find((x) => x.id === li.dataset.edit);
    if (en) openFood(en.food, { grams: en.grams, meal: en.meal, entryId: en.id });
  }
});

// ---------- Drag entries between meals ----------
// Pointer events work for both mouse and touch; the grip has touch-action:none so dragging it doesn't scroll the page.
// While dragging, an empty Unsorted section appears so entries can be moved back there too.
let drag = null;
$("#meals").addEventListener("pointerdown", (e) => {
  const grip = e.target.closest(".grip");
  if (!grip || e.button > 0) return;
  e.preventDefault();
  const li = grip.closest(".entry");
  const rect = li.getBoundingClientRect();
  if (!$('.meal[data-meal="Unsorted"]')) {
    $("#meals").insertAdjacentHTML("afterbegin", `<section class="meal unsorted drop-only" data-meal="Unsorted"><div class="meal-head"><h3>Unsorted</h3></div></section>`);
  }
  const ghost = li.cloneNode(true);
  ghost.classList.add("drag-ghost");
  Object.assign(ghost.style, { width: rect.width + "px", left: rect.left + "px", top: rect.top + "px" });
  document.body.appendChild(ghost);
  li.classList.add("dragging");
  drag = { id: li.dataset.edit, li, ghost, dy: e.clientY - rect.top, target: null };
  try { grip.setPointerCapture(e.pointerId); } catch {}
  try { navigator.vibrate && navigator.vibrate(15); } catch {}
});
window.addEventListener("pointermove", (e) => {
  if (!drag) return;
  drag.ghost.style.top = e.clientY - drag.dy + "px";
  const sec = document.elementFromPoint(e.clientX, e.clientY)?.closest(".meal");
  if (sec !== drag.target) {
    drag.target?.classList.remove("drop");
    drag.target = sec || null;
    drag.target?.classList.add("drop");
  }
  if (e.clientY < 90) window.scrollBy(0, -14);
  else if (e.clientY > innerHeight - 120) window.scrollBy(0, 14);
});
function endDrag() {
  if (!drag) return;
  const { id, ghost, li, target } = drag;
  drag = null;
  ghost.remove();
  li.classList.remove("dragging");
  const en = (S.log[day] || []).find((x) => x.id === id);
  const meal = target?.dataset.meal;
  if (en && meal && meal !== en.meal) {
    en.meal = meal;
    save();
    toast(`Moved to ${meal}`);
  }
  render();
}
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);

// ---------- Premade meals ----------
// A premade meal logs as one entry whose nutrients are the sum of its ingredients; its serving is "1 meal".
function recipeFood(r) {
  const g = r.items.reduce((a, x) => a + x.grams, 0) || 1;
  const k = 100 / g;
  return {
    id: "meal:" + r.id, name: r.name, brand: r.items.map((x) => x.food.name).join(", "), source: "My meal",
    per100: Object.fromEntries(Object.entries(total(r.items)).map(([key, v]) => [key, v * k])),
    servings: [{ label: `1 meal (${r1(g)} g)`, grams: g }],
  };
}
let draft = null;
function openRecipe(id, items = []) {
  const r = id && S.recipes.find((x) => x.id === id);
  draft = r ? structuredClone(r) : { id: uid(), name: "", items: structuredClone(items) };
  $("#deleteRecipe").hidden = !r;
  showRecipe();
  if (!r) setTimeout(() => $("#rName").focus(), 50);
}
function showRecipe() {
  $("#rName").value = draft.name;
  renderDraft();
  openSheet("#recipeSheet");
}
function renderDraft() {
  $("#rItems").innerHTML = draft.items.length ? draft.items.map((x, i) => {
    const n = scale(x.food, x.grams);
    return `<li class="ai-item r-item">
      <div class="nm">${esc(x.food.name)}<small data-r-mac="${i}">${r0(n.kcal)} kcal &middot; ${macroLine(n)}</small></div>
      <label class="g"><input type="number" inputmode="decimal" step="any" min="0" value="${r1(x.grams)}" data-r-g="${i}" aria-label="Grams of ${esc(x.food.name)}"> g</label>
      <button class="icon-btn" data-r-del="${i}" aria-label="Remove ${esc(x.food.name)}">&#10005;</button></li>`;
  }).join("") : `<li class="status">No ingredients yet. Add them from search, barcode, favorites, or a meal from Claude.</li>`;
  renderDraftTotal();
}
function renderDraftTotal() {
  const t = total(draft.items);
  $("#rTotal").innerHTML = `<span>Total</span><span>${r0(t.kcal)} kcal &middot; ${r1(t.protein)}P ${r1(t.carbs)}C ${r1(t.fat)}F</span>`;
}
$("#rName").addEventListener("input", (e) => (draft.name = e.target.value));
$("#rItems").addEventListener("input", (e) => {
  const i = e.target.dataset.rG;
  if (i == null) return;
  const x = draft.items[+i];
  x.grams = parseFloat(e.target.value) || 0;
  const n = scale(x.food, x.grams);
  $(`[data-r-mac="${i}"]`).innerHTML = `${r0(n.kcal)} kcal &middot; ${macroLine(n)}`;
  renderDraftTotal();
});
$("#rItems").addEventListener("click", (e) => {
  const d = e.target.closest("[data-r-del]");
  if (!d) return;
  draft.items.splice(+d.dataset.rDel, 1);
  renderDraft();
});
$("#addIngredient").addEventListener("click", () => {
  closeSheet("#recipeSheet");
  openAdd("search", null, { pick: true });
});
$("#saveRecipe").addEventListener("click", () => {
  draft.name = $("#rName").value.trim();
  draft.items = draft.items.filter((x) => x.grams > 0);
  if (!draft.name) { $("#rName").focus(); return toast("Give the meal a name."); }
  if (!draft.items.length) return toast("Add at least one ingredient.");
  const i = S.recipes.findIndex((x) => x.id === draft.id);
  if (i >= 0) S.recipes[i] = draft;
  else S.recipes.unshift(draft);
  save();
  closeSheet("#recipeSheet");
  toast(`Saved "${draft.name}" to My meals`);
});
$("#deleteRecipe").addEventListener("click", () => {
  S.recipes = S.recipes.filter((x) => x.id !== draft.id);
  save();
  closeSheet("#recipeSheet");
  toast("Meal deleted");
});

// ---------- Custom food ----------
function openCustom(code = "") {
  $("#customForm").reset();
  $("#cCode").value = code;
  $("#cName").value = $("#q").value.trim();
  openSheet("#customSheet");
}
$("#newCustom").addEventListener("click", () => openCustom());
$("#customForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const sv = parseFloat($("#cServing").value) || 100;
  const f = (id) => (parseFloat($(id).value) || 0) * 100 / sv;
  const code = $("#cCode").value;
  const food = {
    id: "custom:" + (code || uid()), name: $("#cName").value.trim(), brand: $("#cBrand").value.trim(), source: "Custom",
    per100: { kcal: f("#cKcal"), protein: f("#cProtein"), carbs: f("#cCarbs"), fat: f("#cFat"), fiber: f("#cFiber"), sugar: 0, sodium: 0 },
    servings: [{ label: `1 serving (${r1(sv)} g)`, grams: sv }], code,
  };
  remember(food);
  save();
  closeSheet("#customSheet");
  openFood(food, { meal: addMeal });
});

// ---------- From Claude (pasted meal estimate) ----------
let aiItems = [];
function aiStatus(msg, err = false) {
  const s = $("#aiStatus");
  s.className = "status" + (err ? " err" : "");
  s.innerHTML = msg;
}

// Claude's reply ends with a block like:
//   FORKCAST {"meal":"Chicken bowl","confidence":"medium","notes":"...","items":[{"name":"Rice","portion":"1 cup","g":180,"kcal":234,"p":4.3,"c":51,"f":0.5,"fiber":0.7,"sugar":0,"na":2}]}
// The parser takes the first balanced {...} after the FORKCAST marker (or anywhere, if the marker is missing).
function extractJson(text) {
  const marker = text.search(/FORKCAST/i);
  const start = text.indexOf("{", marker >= 0 ? marker : 0);
  if (start < 0) return null;
  let depth = 0, inStr = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
function parseClaude(text) {
  // Phones sometimes swap in curly quotes when pasting.
  const raw = extractJson(String(text).replace(/[“”]/g, '"'));
  if (!raw) throw new Error("No FORKCAST block found. Copy the whole block at the end of Claude's reply, starting with FORKCAST.");
  let d;
  try { d = JSON.parse(raw); } catch { throw new Error("The pasted block is incomplete. Copy it again from Claude, all the way to the last }."); }
  const items = Array.isArray(d.items) ? d.items : [];
  if (!items.length) throw new Error("The pasted block has no food items in it.");
  return { meal: d.meal || d.meal_name || "Meal", confidence: d.confidence || "medium", notes: d.notes || "", items };
}
const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] != null && o[k] !== "") return Number(o[k]) || 0;
  return 0;
};
function importText(text) {
  try {
    const data = parseClaude(text);
    aiStatus("");
    showAi(data);
    $("#pasteBox").value = "";
  } catch (e) {
    $("#aiResult").innerHTML = "";
    aiStatus(esc(e.message), true);
  }
}
$("#pasteBtn").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) throw new Error("empty");
    importText(text);
  } catch {
    aiStatus("Couldn't read the clipboard here. Tap and hold in the box below, then choose Paste.");
    $("#pasteBox").focus();
  }
});
$("#pasteBox").addEventListener("paste", (e) => {
  const text = e.clipboardData?.getData("text");
  if (text) { e.preventDefault(); importText(text); }
});
$("#pasteBox").addEventListener("input", (e) => {
  if (/FORKCAST[\s\S]*\}\s*$/i.test(e.target.value)) importText(e.target.value);
});

function aiFood(it) {
  const g = Math.max(1, pick(it, "g", "grams") || 1);
  const k = 100 / g;
  const portion = String(it.portion || "");
  return {
    id: "ai:" + uid(), name: String(it.name || "Food"), brand: portion, source: "AI estimate",
    per100: {
      kcal: pick(it, "kcal", "calories") * k, protein: pick(it, "p", "protein", "protein_g") * k,
      carbs: pick(it, "c", "carbs", "carbs_g") * k, fat: pick(it, "f", "fat", "fat_g") * k,
      fiber: pick(it, "fiber", "fiber_g") * k, sugar: pick(it, "sugar", "sugar_g") * k, sodium: pick(it, "na", "sodium", "sodium_mg") * k,
    },
    servings: [{ label: `${portion || "portion"} (${r1(g)} g)`, grams: g }],
  };
}
let aiMealName = "";
function showAi(data) {
  aiMealName = data.meal;
  aiItems = data.items.map((it) => { const food = aiFood(it); return { food, grams: food.servings[0].grams, on: true }; });
  if (!["low", "medium", "high"].includes(data.confidence)) data.confidence = "medium";
  $("#aiResult").innerHTML = `<div class="ai-card">
    <div class="ai-head"><b>${esc(aiMealName)}</b><span class="pill ${esc(data.confidence)}">${esc(data.confidence)} confidence</span></div>
    <div id="aiItems"></div>
    <div class="ai-total" id="aiTotal"></div>
    ${data.notes ? `<div class="ai-notes">${esc(data.notes)}</div>` : ""}
    <div class="ai-actions">
      <label class="check" ${pickMode ? "hidden" : ""}><input type="checkbox" id="aiCombine"> Log as one entry named "${esc(aiMealName)}"</label>
      <button class="btn primary wide" id="aiLog">${pickMode ? "Add to meal" : `Add to ${esc(addMeal)}`}</button>
    </div></div>`;
  renderAiItems();
}
function renderAiItems() {
  $("#aiItems").innerHTML = aiItems.map((x, i) => {
    const n = scale(x.food, x.grams);
    return `<div class="ai-item">
      <input type="checkbox" data-ai-on="${i}" ${x.on ? "checked" : ""} aria-label="Include ${esc(x.food.name)}">
      <div class="nm">${esc(x.food.name)}<small>${esc(x.food.brand)}</small></div>
      <label class="g"><input type="number" inputmode="decimal" step="any" min="0" value="${r1(x.grams)}" data-ai-g="${i}" aria-label="Grams of ${esc(x.food.name)}"> g</label>
      <div class="mac" data-ai-mac="${i}">${r0(n.kcal)} kcal &middot; ${macroLine(n)}</div></div>`;
  }).join("");
  renderAiTotal();
}
function renderAiTotal() {
  const t = total(aiItems.filter((x) => x.on));
  $("#aiTotal").innerHTML = `<span>Total</span><span>${r0(t.kcal)} kcal &middot; ${r1(t.protein)}P ${r1(t.carbs)}C ${r1(t.fat)}F</span>`;
}
$("#aiResult").addEventListener("input", (e) => {
  const gi = e.target.dataset.aiG;
  if (gi != null) {
    const x = aiItems[+gi];
    x.grams = parseFloat(e.target.value) || 0;
    const n = scale(x.food, x.grams);
    $(`[data-ai-mac="${gi}"]`).innerHTML = `${r0(n.kcal)} kcal &middot; ${macroLine(n)}`;
    renderAiTotal();
  }
});
$("#aiResult").addEventListener("change", (e) => {
  const oi = e.target.dataset.aiOn;
  if (oi != null) { aiItems[+oi].on = e.target.checked; renderAiTotal(); }
});
$("#aiResult").addEventListener("click", (e) => {
  if (!e.target.closest("#aiLog")) return;
  const chosen = aiItems.filter((x) => x.on && x.grams > 0);
  if (!chosen.length) return toast("Select at least one item.");
  if (pickMode) {
    for (const x of chosen) draft.items.push({ food: x.food, grams: x.grams });
    resetAi();
    closeSheet("#addSheet"); // reopens the meal editor
    return;
  }
  if ($("#aiCombine").checked) {
    const t = total(chosen);
    const g = chosen.reduce((a, x) => a + x.grams, 0);
    const k = 100 / g;
    const food = {
      id: "ai:" + uid(), name: aiMealName, brand: chosen.map((x) => x.food.name).join(", "), source: "AI estimate",
      per100: Object.fromEntries(Object.entries(t).map(([kk, v]) => [kk, v * k])),
      servings: [{ label: `whole meal (${r1(g)} g)`, grams: g }],
    };
    addEntry(food, g, addMeal);
  } else {
    for (const x of chosen) addEntry(x.food, x.grams, addMeal);
  }
  save();
  render();
  closeSheet("#addSheet");
  resetAi();
  toast(`Added to ${addMeal}`);
});
function resetAi() {
  aiItems = [];
  $("#pasteBox").value = "";
  $("#aiResult").innerHTML = "";
  aiStatus("");
}

// ---------- Settings ----------
function openSettings() {
  const T = S.settings.targets;
  $("#tKcal").value = T.kcal; $("#tProtein").value = T.protein; $("#tCarbs").value = T.carbs; $("#tFat").value = T.fat;
  $("#sUsda").value = S.settings.usdaKey;
  openSheet("#settingsSheet");
}
$("#openSettings").addEventListener("click", openSettings);
$("#settingsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const n = (id, d) => Math.max(0, parseFloat($(id).value) || d);
  S.settings.targets = { kcal: n("#tKcal", 2000), protein: n("#tProtein", 0), carbs: n("#tCarbs", 0), fat: n("#tFat", 0) };
  S.settings.usdaKey = $("#sUsda").value.trim() || "DEMO_KEY";
  save();
  closeSheet("#settingsSheet");
  render();
  toast("Settings saved");
});
$("#exportData").addEventListener("click", () => {
  const data = { log: S.log, recents: S.recents, favorites: S.favorites, recipes: S.recipes, targets: S.settings.targets, exported: new Date().toISOString() };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = `forkcast-${iso()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#importData").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!d.log || typeof d.log !== "object") throw new Error();
    S.log = { ...S.log, ...d.log };
    if (Array.isArray(d.recents)) S.recents = d.recents;
    if (Array.isArray(d.favorites)) S.favorites = d.favorites;
    if (Array.isArray(d.recipes)) S.recipes = d.recipes;
    if (d.targets) S.settings.targets = { ...S.settings.targets, ...d.targets };
    save();
    render();
    toast("Diary imported");
  } catch {
    toast("That file isn't a Forkcast export.");
  }
});

// ---------- Wiring ----------
$("#prevDay").addEventListener("click", () => { day = shiftDay(day, -1); render(); });
$("#nextDay").addEventListener("click", () => { day = shiftDay(day, 1); render(); });
$("#dayLabel").addEventListener("click", () => { day = iso(); render(); });
$$(".actionbar [data-open]").forEach((b) => b.addEventListener("click", () => openAdd(b.dataset.open)));

render();

if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
