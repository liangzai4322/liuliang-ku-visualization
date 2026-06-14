"use strict";

// 字段配置集中放在顶部，后续增删列优先改这里。
const COLUMN_CONFIG = {
  "库名": { display: false, label: "库名", area: "hidden" },
  "来源文件": { display: false, label: "来源文件", area: "hidden" },
  "归档日期": { display: false, label: "归档日期", area: "hidden" },
  "案例日期": { display: true, label: "案例日期", area: "title" },
  "大分类": { display: true, label: "大分类", area: "title" },
  "细分赛道": { display: true, label: "细分赛道", area: "title" },
  "案例/来源": { display: true, label: "案例/来源", area: "title" },
  "引流平台": { display: true, label: "引流平台", area: "body" },
  "引流钩子": { display: true, label: "引流钩子", area: "body" },
  "冷启动方式": { display: true, label: "冷启动方式", area: "body" },
  "规模化路径": { display: true, label: "规模化路径", area: "body" },
  "证据/备注": { display: true, label: "证据/备注", area: "detail" },
};

const PAGE_SIZE = 24;
const BODY_FIELDS = ["引流平台", "引流钩子", "冷启动方式", "规模化路径"];
const DATA_JSON_URL = "traffic-data.json";
const CSV_URL = "流量库.csv";
const UNCATEGORIZED = "未分类";
const DATE_ISO_FIELD = "案例日期_ISO";
const DATE_TS_FIELD = "案例日期_TS";
const RAW_INDEX_FIELD = "__rawIndex";
const TOKEN_SPLIT_PATTERN = /\s*(?:,|，|、|\+|\/|；|;|｜|\||→|->)\s*/;

const CATEGORY_COLORS = [
  "#0ea5e9",
  "#16a34a",
  "#0891b2",
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#d97706",
  "#0f766e",
  "#4f46e5",
  "#be123c",
];

const FIELD_STYLE_CONFIG = {
  "引流平台": { className: "field-platform" },
  "引流钩子": { className: "field-hook" },
  "冷启动方式": { className: "field-start" },
  "规模化路径": { className: "field-scale" },
};

const PLATFORM_COLORS = {
  "抖音": ["#0f172a", "#e0f2fe"],
  "小红书": ["#dc2626", "#fee2e2"],
  "知乎": ["#2563eb", "#dbeafe"],
  "视频号": ["#16a34a", "#dcfce7"],
  "公众号": ["#15803d", "#dcfce7"],
  "微信": ["#16a34a", "#dcfce7"],
  "私域": ["#059669", "#d1fae5"],
  "快手": ["#ea580c", "#ffedd5"],
  "B站": ["#0891b2", "#cffafe"],
  "哔哩哔哩": ["#0891b2", "#cffafe"],
  "TikTok": ["#111827", "#e5e7eb"],
  "YouTube": ["#dc2626", "#fee2e2"],
  "推特": ["#0284c7", "#e0f2fe"],
  "Twitter": ["#0284c7", "#e0f2fe"],
  "X": ["#111827", "#e5e7eb"],
  "Google": ["#2563eb", "#dbeafe"],
  "SEO": ["#0f766e", "#ccfbf1"],
  "搜索": ["#0f766e", "#ccfbf1"],
  "Reddit": ["#ea580c", "#ffedd5"],
};

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const state = {
  items: [],
  filtered: [],
  counts: new Map(),
  categoryColors: new Map(),
  expandedCategories: new Set(),
  search: "",
  category: "",
  subcategory: "",
  sort: "desc",
  focusField: "引流平台",
  visibleCount: PAGE_SIZE,
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();

  try {
    state.items = normalizeItems(await loadData());
    buildCounts();
    assignCategoryColors();
    buildFilters();
    renderCategoryTree();
    applyFilters();
  } catch (error) {
    showError(error);
  }
}

function cacheElements() {
  els.totalCount = document.querySelector("#totalCount");
  els.searchInput = document.querySelector("#searchInput");
  els.categoryFilter = document.querySelector("#categoryFilter");
  els.subcategoryFilter = document.querySelector("#subcategoryFilter");
  els.sortSelect = document.querySelector("#sortSelect");
  els.focusControl = document.querySelector("#focusControl");
  els.clearFilters = document.querySelector("#clearFilters");
  els.categoryTree = document.querySelector("#categoryTree");
  els.resultInfo = document.querySelector("#resultInfo");
  els.cardGrid = document.querySelector("#cardGrid");
  els.emptyState = document.querySelector("#emptyState");
  els.errorState = document.querySelector("#errorState");
  els.errorMessage = document.querySelector("#errorMessage");
  els.loadMoreButton = document.querySelector("#loadMoreButton");
}

function bindEvents() {
  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value.trim().toLowerCase();
    state.visibleCount = PAGE_SIZE;
    applyFilters();
  });

  els.categoryFilter.addEventListener("change", () => {
    state.category = els.categoryFilter.value;
    state.subcategory = "";
    state.visibleCount = PAGE_SIZE;
    buildSubcategoryFilter();
    syncExpandedCategory();
    applyFilters();
  });

  els.subcategoryFilter.addEventListener("change", () => {
    state.subcategory = els.subcategoryFilter.value;
    state.visibleCount = PAGE_SIZE;
    applyFilters();
  });

  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    state.visibleCount = PAGE_SIZE;
    applyFilters();
  });

  els.focusControl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-focus-field]");
    if (!button) return;
    state.focusField = button.dataset.focusField;
    syncFocusButtons();
    renderCards();
  });

  els.clearFilters.addEventListener("click", () => {
    state.search = "";
    state.category = "";
    state.subcategory = "";
    state.visibleCount = PAGE_SIZE;
    els.searchInput.value = "";
    buildFilters();
    renderCategoryTree();
    applyFilters();
  });

  els.categoryTree.addEventListener("click", (event) => {
    const subcategoryButton = event.target.closest("[data-subcategory]");
    const categoryButton = event.target.closest("[data-category]");

    if (subcategoryButton) {
      state.category = subcategoryButton.dataset.parentCategory;
      state.subcategory = subcategoryButton.dataset.subcategory;
      state.expandedCategories.add(state.category);
      state.visibleCount = PAGE_SIZE;
      syncFilterControls();
      renderCategoryTree();
      applyFilters();
      return;
    }

    if (categoryButton) {
      const category = categoryButton.dataset.category;
      state.category = category;
      state.subcategory = "";
      if (state.expandedCategories.has(category)) state.expandedCategories.delete(category);
      else state.expandedCategories.add(category);
      state.visibleCount = PAGE_SIZE;
      syncFilterControls();
      renderCategoryTree();
      applyFilters();
    }
  });

  els.loadMoreButton.addEventListener("click", () => {
    state.visibleCount += PAGE_SIZE;
    renderCards();
  });
}

async function loadData() {
  if (Array.isArray(window.TRAFFIC_DATA)) return window.TRAFFIC_DATA;
  if (window.location.protocol === "file:") {
    throw new Error("双击打开需要同目录存在 traffic-data.js。请先运行一次 python traffic-convert.py。");
  }

  try {
    const response = await fetch(DATA_JSON_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`traffic-data.json 状态码 ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : data.records || [];
  } catch (jsonError) {
    try {
      return await loadCsvData(CSV_URL);
    } catch (csvError) {
      throw new Error(`无法加载数据：${csvError.message || jsonError.message}`);
    }
  }
}

function normalizeItems(items) {
  const displayColumns = Object.keys(COLUMN_CONFIG).filter((column) => COLUMN_CONFIG[column].display);

  return items.map((item, index) => {
    const normalized = { [RAW_INDEX_FIELD]: Number(item[RAW_INDEX_FIELD] || index + 1) };
    displayColumns.forEach((column) => {
      normalized[column] = cleanText(item[column]);
    });

    normalized["大分类"] = normalized["大分类"] || UNCATEGORIZED;
    normalized["细分赛道"] = normalized["细分赛道"] || UNCATEGORIZED;
    normalized["案例/来源"] = normalized["案例/来源"] || "未命名案例";

    const parsedDate = parseCaseDate(normalized["案例日期"]);
    normalized[DATE_ISO_FIELD] = cleanText(item[DATE_ISO_FIELD]) || parsedDate.iso;
    normalized[DATE_TS_FIELD] = Number(item[DATE_TS_FIELD] || parsedDate.timestamp || 0);
    normalized.__searchText = buildSearchText(normalized);
    return normalized;
  });
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ");
}

function buildSearchText(item) {
  return ["案例/来源", "引流平台", "引流钩子", "冷启动方式", "规模化路径", "证据/备注", "大分类", "细分赛道"]
    .map((column) => item[column] || "")
    .join(" ")
    .toLowerCase();
}

function buildCounts() {
  state.counts.clear();
  state.items.forEach((item) => {
    const category = item["大分类"] || UNCATEGORIZED;
    const subcategory = item["细分赛道"] || UNCATEGORIZED;
    if (!state.counts.has(category)) state.counts.set(category, { total: 0, subcategories: new Map() });
    const bucket = state.counts.get(category);
    bucket.total += 1;
    bucket.subcategories.set(subcategory, (bucket.subcategories.get(subcategory) || 0) + 1);
  });

  const firstCategory = [...state.counts.keys()].sort(localeSort)[0];
  if (firstCategory) state.expandedCategories.add(firstCategory);
}

function assignCategoryColors() {
  [...state.counts.keys()].sort(localeSort).forEach((category, index) => {
    state.categoryColors.set(category, category === UNCATEGORIZED ? "#94a3b8" : CATEGORY_COLORS[index % CATEGORY_COLORS.length]);
  });
}

function buildFilters() {
  fillSelect(els.categoryFilter, [["", "全部大分类"], ...getCategories().map((category) => [category, category])]);
  buildSubcategoryFilter();
}

function buildSubcategoryFilter() {
  const names = new Set();
  if (state.category && state.counts.has(state.category)) {
    state.counts.get(state.category).subcategories.forEach((_, name) => names.add(name));
  } else {
    state.counts.forEach((bucket) => bucket.subcategories.forEach((_, name) => names.add(name)));
  }
  fillSelect(els.subcategoryFilter, [["", "全部细分赛道"], ...[...names].sort(localeSort).map((name) => [name, name])]);
  els.subcategoryFilter.value = state.subcategory;
}

function fillSelect(select, options) {
  select.replaceChildren();
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
}

function syncFilterControls() {
  els.categoryFilter.value = state.category;
  buildSubcategoryFilter();
  els.subcategoryFilter.value = state.subcategory;
}

function syncExpandedCategory() {
  if (state.category) state.expandedCategories.add(state.category);
  renderCategoryTree();
}

function getCategories() {
  return [...state.counts.keys()].sort(localeSort);
}

function localeSort(a, b) {
  return String(a).localeCompare(String(b), "zh-Hans-CN");
}

function renderCategoryTree() {
  const fragment = document.createDocumentFragment();
  getCategories().forEach((category) => {
    const bucket = state.counts.get(category);
    const group = document.createElement("section");
    group.className = "category-group";
    group.classList.toggle("expanded", state.expandedCategories.has(category));
    group.style.setProperty("--category-color", getCategoryColor(category));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-button";
    button.dataset.category = category;
    button.classList.toggle("active", state.category === category && !state.subcategory);
    button.setAttribute("aria-expanded", String(state.expandedCategories.has(category)));
    button.append(createTextSpan(category, "category-name"), createBadge(bucket.total));
    group.append(button);

    const list = document.createElement("div");
    list.className = "subcategory-list";
    [...bucket.subcategories.entries()].sort(([a], [b]) => localeSort(a, b)).forEach(([subcategory, count]) => {
      const child = document.createElement("button");
      child.type = "button";
      child.className = "subcategory-button";
      child.dataset.parentCategory = category;
      child.dataset.subcategory = subcategory;
      child.classList.toggle("active", state.category === category && state.subcategory === subcategory);
      child.append(createTextSpan(subcategory, "subcategory-name"), createBadge(count));
      list.append(child);
    });
    group.append(list);
    fragment.append(group);
  });
  els.categoryTree.replaceChildren(fragment);
}

function createTextSpan(text, className) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function createBadge(count) {
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = count;
  return badge;
}

function getCategoryColor(category) {
  return state.categoryColors.get(category) || CATEGORY_COLORS[0];
}

function applyFilters() {
  state.filtered = state.items
    .filter((item) => {
      if (state.category && item["大分类"] !== state.category) return false;
      if (state.subcategory && item["细分赛道"] !== state.subcategory) return false;
      if (state.search && !item.__searchText.includes(state.search)) return false;
      return true;
    })
    .sort(sortByDate);

  els.totalCount.textContent = state.items.length;
  renderCategoryTree();
  renderCards();
}

function sortByDate(a, b) {
  const aTime = Number(a[DATE_TS_FIELD] || 0);
  const bTime = Number(b[DATE_TS_FIELD] || 0);
  if (!aTime && bTime) return 1;
  if (aTime && !bTime) return -1;
  if (aTime !== bTime) return state.sort === "asc" ? aTime - bTime : bTime - aTime;
  return Number(a[RAW_INDEX_FIELD]) - Number(b[RAW_INDEX_FIELD]);
}

function renderCards() {
  els.errorState.hidden = true;
  els.cardGrid.classList.toggle("field-focus-mode", Boolean(state.focusField));
  const shownItems = state.filtered.slice(0, state.visibleCount);
  const fragment = document.createDocumentFragment();
  shownItems.forEach((item) => fragment.append(createCard(item)));

  els.cardGrid.replaceChildren(fragment);
  els.emptyState.hidden = state.filtered.length !== 0;
  els.loadMoreButton.hidden = state.visibleCount >= state.filtered.length;
  els.resultInfo.textContent = buildResultInfo(shownItems.length);
}

function buildResultInfo(shownCount) {
  const parts = [`当前 ${state.filtered.length} 条`];
  if (state.category) parts.push(state.category);
  if (state.subcategory) parts.push(state.subcategory);
  if (state.search) parts.push(`关键词：${state.search}`);
  if (state.filtered.length > shownCount) parts.push(`已显示 ${shownCount} 条`);
  return parts.join(" · ");
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "case-card";
  card.classList.toggle("field-focus-active", Boolean(state.focusField));
  card.style.setProperty("--category-color", getCategoryColor(item["大分类"]));

  const meta = document.createElement("div");
  meta.className = "card-meta";
  appendMetaPills(meta, item);
  meta.append(createPill(formatDateLabel(item), "date-pill"));
  card.append(meta);

  const title = document.createElement("h2");
  title.className = "case-title";
  title.textContent = item["案例/来源"];
  card.append(title);

  const fields = document.createElement("dl");
  fields.className = "field-list";
  getBodyFieldOrder().forEach((column) => fields.append(createField(column, item[column])));
  card.append(fields);

  if (item["证据/备注"]) {
    const detail = document.createElement("details");
    detail.className = "detail";
    const summary = document.createElement("summary");
    summary.textContent = "证据/备注";
    const text = document.createElement("p");
    text.textContent = item["证据/备注"];
    detail.append(summary, text);
    card.append(detail);
  }
  return card;
}

function appendMetaPills(meta, item) {
  const category = item["大分类"] || UNCATEGORIZED;
  const subcategory = item["细分赛道"] || UNCATEGORIZED;
  if (category === UNCATEGORIZED && subcategory === UNCATEGORIZED) {
    meta.append(createPill(UNCATEGORIZED, "unknown-pill"));
    return;
  }
  meta.append(createPill(category, category === UNCATEGORIZED ? "unknown-pill" : ""));
  if (subcategory !== category && subcategory !== UNCATEGORIZED) meta.append(createPill(subcategory));
}

function createPill(text, extraClass = "") {
  const pill = document.createElement("span");
  pill.className = `pill ${extraClass}`.trim();
  pill.textContent = text || "未填写";
  return pill;
}

function createField(column, value) {
  const wrapper = document.createElement("div");
  const fieldStyle = FIELD_STYLE_CONFIG[column] || {};
  wrapper.className = `field ${fieldStyle.className || ""}`.trim();
  wrapper.classList.toggle("is-focused", state.focusField === column);
  wrapper.classList.toggle("is-dimmed", Boolean(state.focusField) && state.focusField !== column);

  const term = document.createElement("dt");
  term.textContent = COLUMN_CONFIG[column].label;

  const desc = document.createElement("dd");
  const text = cleanText(value);
  const tokens = splitFieldTokens(text, column);
  if (tokens.length > 1) {
    const tokenList = document.createElement("span");
    tokenList.className = "token-list";
    tokens.forEach((token) => tokenList.append(createToken(token, column)));
    desc.append(tokenList);
  } else {
    desc.textContent = text || "未填写";
  }
  desc.classList.toggle("muted", !text);
  wrapper.append(term, desc);
  return wrapper;
}

function splitFieldTokens(text, column) {
  if (!text) return [];
  const limit = column === "引流平台" ? 14 : 6;
  const maxLength = column === "引流平台" ? 180 : 280;
  if (text.length > maxLength && column !== "引流平台") return [];
  return text
    .split(TOKEN_SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter((token) => token.length >= 1)
    .slice(0, limit);
}

function createToken(token, column) {
  const chip = document.createElement("span");
  chip.className = "field-token";
  chip.textContent = token;
  if (column === "引流平台") {
    const [color, bg] = getPlatformTokenColors(token);
    chip.style.setProperty("--token-color", color);
    chip.style.setProperty("--token-bg", bg);
    chip.style.setProperty("--token-line", withAlpha(color, 0.28));
  }
  return chip;
}

function getPlatformTokenColors(token) {
  const key = Object.keys(PLATFORM_COLORS).find((name) => token.includes(name));
  if (key) return PLATFORM_COLORS[key];
  const hue = stableHue(token);
  return [`hsl(${hue}, 70%, 34%)`, `hsl(${hue}, 84%, 94%)`];
}

function stableHue(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
}

function syncFocusButtons() {
  els.focusControl.querySelectorAll("[data-focus-field]").forEach((button) => {
    button.classList.toggle("active", button.dataset.focusField === state.focusField);
  });
}

function getBodyFieldOrder() {
  if (!state.focusField || !BODY_FIELDS.includes(state.focusField)) return BODY_FIELDS;
  return [state.focusField, ...BODY_FIELDS.filter((column) => column !== state.focusField)];
}

function formatDateLabel(item) {
  if (item[DATE_ISO_FIELD]) return item[DATE_ISO_FIELD].slice(0, 7);
  return item["案例日期"] || "日期未知";
}

function parseCaseDate(value) {
  const text = cleanText(value);
  if (!text) return { iso: "", timestamp: 0 };
  const normalized = text.replace(/[_/.]/g, "-").replace(/\s+/g, "-");
  let match = normalized.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (match) return buildIsoDate(Number(match[1]), Number(match[2]));
  match = normalized.match(/^(\d{2})-(\d{1,2})(?:-\d{1,2})?$/);
  if (match) return buildIsoDate(2000 + Number(match[1]), Number(match[2]));
  match = normalized.match(/^(\d{2,4})-([A-Za-z]+)$/) || normalized.match(/^([A-Za-z]+)-(\d{2,4})$/);
  if (match) {
    const firstIsYear = /^\d+$/.test(match[1]);
    let year = Number(firstIsYear ? match[1] : match[2]);
    if (year < 100) year += 2000;
    const month = MONTHS[String(firstIsYear ? match[2] : match[1]).toLowerCase()] || 0;
    return buildIsoDate(year, month);
  }
  match = text.match(/^(\d{2,4})年(\d{1,2})月/);
  if (match) {
    let year = Number(match[1]);
    if (year < 100) year += 2000;
    return buildIsoDate(year, Number(match[2]));
  }
  return { iso: "", timestamp: 0 };
}

function buildIsoDate(year, month) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || year < 2000 || month < 1 || month > 12) {
    return { iso: "", timestamp: 0 };
  }
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  return { iso, timestamp: Math.floor(Date.UTC(year, month - 1, 1) / 1000) };
}

function withAlpha(color, alpha) {
  if (color.startsWith("hsl(")) return color.replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
  const match = color.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!match) return `rgba(14, 165, 233, ${alpha})`;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function showError(error) {
  els.cardGrid.replaceChildren();
  els.emptyState.hidden = true;
  els.loadMoreButton.hidden = true;
  els.errorState.hidden = false;
  els.resultInfo.textContent = "未能加载数据";
  els.errorMessage.textContent = error.message || String(error);
}

async function loadCsvData(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`CSV 加载失败：${response.status}`);
  return normalizeCsvRows(parseCsv(await response.text()));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function normalizeCsvRows(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map(cleanText);
  const displayColumns = Object.keys(COLUMN_CONFIG).filter((column) => COLUMN_CONFIG[column].display);
  return rows.slice(1).map((sourceRow, index) => {
    const raw = {};
    headers.forEach((header, columnIndex) => {
      raw[header] = cleanText(sourceRow[columnIndex] ?? "");
    });
    const item = { [RAW_INDEX_FIELD]: index + 1 };
    displayColumns.forEach((column) => {
      item[column] = raw[column] || "";
    });
    const parsedDate = parseCaseDate(item["案例日期"]);
    item[DATE_ISO_FIELD] = parsedDate.iso;
    item[DATE_TS_FIELD] = parsedDate.timestamp;
    return item;
  });
}
