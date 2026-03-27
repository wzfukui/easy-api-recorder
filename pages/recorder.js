import {
  DEFAULT_CAPTURE_PREFERENCES,
  formatBytes,
  normalizeCapturePreferences,
  RESOURCE_TYPE_OPTIONS,
  rulesToMultiline,
  summarizeEnabledResourceTypes,
} from "../lib/shared.js";

const APP_VERSION = chrome.runtime.getManifest().version;
const PROJECT_URL = "https://github.com/wzfukui/easy-api-recorder";

const state = {
  activeSessionTabId: null,
  session: null,
  savedPreferences: normalizeCapturePreferences(DEFAULT_CAPTURE_PREFERENCES),
  draftPreferences: normalizeCapturePreferences(DEFAULT_CAPTURE_PREFERENCES),
  draftIncludeRulesText: "",
  draftExcludeRulesText: "",
  settingsDirty: false,
  selectedIds: new Set(),
  activeEntryId: null,
  searchTerm: "",
  activeListTab: "captured",
  hideQueuedFromCaptured: true,
  activeTypeFilters: new Set(),
  helpOpen: false,
  aboutOpen: false,
};

const aboutButton = document.querySelector("#about-button");
const helpButton = document.querySelector("#help-button");
const refreshButton = document.querySelector("#refresh-button");
const clearButton = document.querySelector("#clear-button");
const applySettingsButton = document.querySelector("#apply-settings-button");
const resetSettingsButton = document.querySelector("#reset-settings-button");
const capturedTabButton = document.querySelector("#captured-tab-button");
const queueTabButton = document.querySelector("#queue-tab-button");
const capturedTabCountElement = document.querySelector("#captured-tab-count");
const queueTabCountElement = document.querySelector("#queue-tab-count");
const selectAllCheckbox = document.querySelector("#select-all-checkbox");
const hideQueuedCheckbox = document.querySelector("#hide-queued-checkbox");
const searchInput = document.querySelector("#search-input");
const addToQueueButton = document.querySelector("#add-to-queue-button");
const deleteSelectedButton = document.querySelector("#delete-selected-button");
const clearSelectionButton = document.querySelector("#clear-selection-button");
const exportAllJsonButton = document.querySelector("#export-all-json-button");
const exportAllHarButton = document.querySelector("#export-all-har-button");
const exportQueueJsonButton = document.querySelector("#export-queue-json-button");
const exportQueueHarButton = document.querySelector("#export-queue-har-button");
const clearQueueButton = document.querySelector("#clear-queue-button");

const settingsStatusElement = document.querySelector("#settings-status");
const settingsSummaryElement = document.querySelector("#settings-summary");
const recorderVersionElement = document.querySelector("#recorder-version");
const sessionStatusElement = document.querySelector("#session-status");
const sessionTitleElement = document.querySelector("#session-title");
const sessionUrlElement = document.querySelector("#session-url");
const sessionCountElement = document.querySelector("#session-count");
const sessionUpdatedElement = document.querySelector("#session-updated");
const visibleCountElement = document.querySelector("#visible-count");
const queueCountElement = document.querySelector("#queue-count");
const queueSummaryElement = document.querySelector("#queue-summary");
const selectionSummaryElement = document.querySelector("#selection-summary");
const queueViewSummaryElement = document.querySelector("#queue-view-summary");
const errorBannerElement = document.querySelector("#error-banner");
const aboutModalElement = document.querySelector("#about-modal");
const aboutRepoLinkElement = document.querySelector("#about-repo-link");
const aboutRepoNameElement = document.querySelector("#about-repo-name");
const aboutVersionElement = document.querySelector("#about-version");
const helpModalElement = document.querySelector("#help-modal");
const closeAboutModalButton = document.querySelector("#close-about-modal-button");
const closeHelpModalButton = document.querySelector("#close-help-modal-button");
const resultTypeFilterBarElement = document.querySelector("#result-type-filter-bar");
const capturedViewElement = document.querySelector("#captured-view");
const queueViewElement = document.querySelector("#queue-view");
const requestListElement = document.querySelector("#request-list");
const queueListElement = document.querySelector("#queue-list");
const resourceTypeGridElement = document.querySelector("#resource-type-grid");
const includeRulesInput = document.querySelector("#include-rules-input");
const excludeRulesInput = document.querySelector("#exclude-rules-input");
const binaryBodiesCheckbox = document.querySelector("#binary-bodies-checkbox");
const drawerScrimElement = document.querySelector("#drawer-scrim");
const detailDrawerElement = document.querySelector("#detail-drawer");
const closeDrawerButton = document.querySelector("#close-drawer-button");
const detailTitleElement = document.querySelector("#detail-title");
const detailSubtitleElement = document.querySelector("#detail-subtitle");
const emptyDetailElement = document.querySelector("#empty-detail");
const detailPanelElement = document.querySelector("#detail-panel");
const detailTypeElement = document.querySelector("#detail-type");
const detailMethodElement = document.querySelector("#detail-method");
const detailStatusElement = document.querySelector("#detail-status");
const detailUrlElement = document.querySelector("#detail-url");
const detailRequestHeadersElement = document.querySelector("#detail-request-headers");
const detailResponseHeadersElement = document.querySelector("#detail-response-headers");
const detailRequestBodyElement = document.querySelector("#detail-request-body");
const detailResponseBodyElement = document.querySelector("#detail-response-body");

aboutButton.addEventListener("click", () => {
  state.aboutOpen = !state.aboutOpen;
  if (state.aboutOpen) {
    state.helpOpen = false;
  }
  renderInfoPanels();
});

helpButton.addEventListener("click", () => {
  state.helpOpen = !state.helpOpen;
  if (state.helpOpen) {
    state.aboutOpen = false;
  }
  renderInfoPanels();
});
closeAboutModalButton.addEventListener("click", () => closeInfoModal("about"));
closeHelpModalButton.addEventListener("click", () => closeInfoModal("help"));
refreshButton.addEventListener("click", () => void refresh());
clearButton.addEventListener("click", () => void clearSession());
applySettingsButton.addEventListener("click", () => void applySettings());
resetSettingsButton.addEventListener("click", () => void resetSettings());
capturedTabButton.addEventListener("click", () => switchTab("captured"));
queueTabButton.addEventListener("click", () => switchTab("queue"));
selectAllCheckbox.addEventListener("change", handleSelectAllChanged);
hideQueuedCheckbox.addEventListener("change", () => {
  state.hideQueuedFromCaptured = hideQueuedCheckbox.checked;
  renderWorkspace();
});
searchInput.addEventListener("input", () => {
  state.searchTerm = searchInput.value.trim().toLowerCase();
  renderWorkspace();
});
addToQueueButton.addEventListener("click", () => void addSelectionToQueue());
deleteSelectedButton.addEventListener("click", () => void deleteSelectedEntries());
clearSelectionButton.addEventListener("click", () => {
  state.selectedIds.clear();
  renderWorkspace();
});
exportAllJsonButton.addEventListener("click", () => void exportEntries("json", "all"));
exportAllHarButton.addEventListener("click", () => void exportEntries("har", "all"));
exportQueueJsonButton.addEventListener("click", () => void exportEntries("json", "queue"));
exportQueueHarButton.addEventListener("click", () => void exportEntries("har", "queue"));
clearQueueButton.addEventListener("click", () => void clearQueue());
includeRulesInput.addEventListener("input", () => {
  state.draftIncludeRulesText = includeRulesInput.value;
  markSettingsDirty();
});
excludeRulesInput.addEventListener("input", () => {
  state.draftExcludeRulesText = excludeRulesInput.value;
  markSettingsDirty();
});
binaryBodiesCheckbox.addEventListener("change", () => {
  state.draftPreferences.captureBinaryBodies = binaryBodiesCheckbox.checked;
  markSettingsDirty();
});
closeDrawerButton.addEventListener("click", closeDrawer);
drawerScrimElement.addEventListener("click", closeDrawer);
for (const element of document.querySelectorAll("[data-close-modal]")) {
  element.addEventListener("click", () => {
    closeInfoModal(element.dataset.closeModal);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (state.aboutOpen || state.helpOpen) {
    closeInfoModal();
    return;
  }

  if (state.activeEntryId) {
    closeDrawer();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "recorder/state-changed") {
    void refresh();
  }
});

initializeResourceTypeGrid();
void refresh();

function initializeResourceTypeGrid() {
  resourceTypeGridElement.textContent = "";

  for (const option of RESOURCE_TYPE_OPTIONS) {
    const label = document.createElement("label");
    label.className = "resource-toggle";

    const head = document.createElement("div");
    head.className = "resource-toggle-head";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.resourceType = option.key;
    input.addEventListener("change", () => {
      state.draftPreferences.resourceTypes[option.key] = input.checked;
      markSettingsDirty();
    });

    const title = document.createElement("span");
    title.textContent = option.label;

    head.append(input, title);

    const hint = document.createElement("div");
    hint.className = "resource-toggle-hint";
    hint.textContent = option.hint;

    label.append(head, hint);
    resourceTypeGridElement.append(label);
  }
}

async function refresh() {
  try {
    const stateResponse = await chrome.runtime.sendMessage({
      type: "recorder/get-state",
    });

    state.activeSessionTabId = stateResponse.activeSessionTabId ?? null;
    state.savedPreferences = normalizeCapturePreferences(stateResponse.capturePreferences);

    if (!state.settingsDirty) {
      syncDraftPreferences(state.savedPreferences);
    }

    const targetTabId = state.activeSessionTabId ?? stateResponse.sessions?.[0]?.tabId ?? null;

    if (typeof targetTabId !== "number") {
      state.session = null;
      state.selectedIds.clear();
      state.activeEntryId = null;
      render(stateResponse.lastError || "");
      return;
    }

    const sessionResponse = await chrome.runtime.sendMessage({
      type: "recorder/get-session",
      tabId: targetTabId,
    });

    state.session = sessionResponse.session;
    syncSelection();
    render(sessionResponse.lastError || stateResponse.lastError || "");
  } catch (error) {
    render(error?.message || String(error));
  }
}

function syncDraftPreferences(preferences) {
  state.draftPreferences = normalizeCapturePreferences(preferences);
  state.draftIncludeRulesText = rulesToMultiline(preferences.includeRules);
  state.draftExcludeRulesText = rulesToMultiline(preferences.excludeRules);
  state.settingsDirty = false;
}

function syncSelection() {
  const currentEntries = new Set((state.session?.entries || []).map((entry) => entry.entryId));
  state.selectedIds = new Set([...state.selectedIds].filter((id) => currentEntries.has(id)));

  const queueIds = new Set(state.session?.exportQueueEntryIds || []);
  if (state.activeListTab === "queue" && queueIds.size === 0) {
    state.activeListTab = "captured";
  }

  if (!state.activeEntryId || !currentEntries.has(state.activeEntryId)) {
    state.activeEntryId = null;
    closeDrawer();
  }
}

function render(errorMessage) {
  renderOverview(errorMessage);
  renderSettings();
  renderInfoPanels();
  renderWorkspace();
  renderDrawer();
  updateButtons();
}

function renderInfoPanels() {
  recorderVersionElement.textContent = `版本 v${APP_VERSION}`;
  aboutVersionElement.textContent = `v${APP_VERSION}`;
  aboutRepoLinkElement.href = PROJECT_URL;
  aboutRepoLinkElement.title = PROJECT_URL;
  aboutRepoNameElement.textContent = PROJECT_URL.replace("https://github.com/", "");
  aboutModalElement.classList.toggle("hidden", !state.aboutOpen);
  aboutModalElement.setAttribute("aria-hidden", String(!state.aboutOpen));
  helpModalElement.classList.toggle("hidden", !state.helpOpen);
  helpModalElement.setAttribute("aria-hidden", String(!state.helpOpen));
  aboutButton.setAttribute("aria-expanded", String(state.aboutOpen));
  helpButton.setAttribute("aria-expanded", String(state.helpOpen));
  document.body.classList.toggle("modal-open", state.aboutOpen || state.helpOpen);
}

function closeInfoModal(target = "all") {
  if (target === "about" || target === "all") {
    state.aboutOpen = false;
  }
  if (target === "help" || target === "all") {
    state.helpOpen = false;
  }
  renderInfoPanels();
}

function renderOverview(errorMessage) {
  const session = state.session;
  const queueEntries = getQueueEntries();

  sessionStatusElement.textContent = session?.isRecording ? "录制中" : "空闲";
  sessionTitleElement.textContent = session?.title || "暂无会话";
  sessionUrlElement.textContent = session?.url || "-";
  sessionCountElement.textContent = String(session?.entries?.length || 0);
  sessionUpdatedElement.textContent = session?.updatedAt
    ? new Date(session.updatedAt).toLocaleString()
    : "-";
  queueCountElement.textContent = String(queueEntries.length);
  queueSummaryElement.textContent = queueEntries.length > 0 ? `待导出 ${queueEntries.length} 条` : "队列为空";

  errorBannerElement.textContent = errorMessage;
  errorBannerElement.classList.toggle("hidden", !errorMessage);
}

function renderSettings() {
  for (const input of resourceTypeGridElement.querySelectorAll("input[data-resource-type]")) {
    const key = input.dataset.resourceType;
    input.checked = Boolean(state.draftPreferences.resourceTypes[key]);
  }

  if (includeRulesInput.value !== state.draftIncludeRulesText) {
    includeRulesInput.value = state.draftIncludeRulesText;
  }

  if (excludeRulesInput.value !== state.draftExcludeRulesText) {
    excludeRulesInput.value = state.draftExcludeRulesText;
  }

  binaryBodiesCheckbox.checked = Boolean(state.draftPreferences.captureBinaryBodies);
  settingsStatusElement.textContent = state.settingsDirty ? "未保存" : "已保存";
  settingsSummaryElement.textContent = buildSettingsSummary();
}

function buildSettingsSummary() {
  const includeCount = state.savedPreferences.includeRules.length;
  const excludeCount = state.savedPreferences.excludeRules.length;
  const scope = summarizeEnabledResourceTypes(state.savedPreferences, 5);
  return `${scope} | 包含 ${includeCount} 条 | 排除 ${excludeCount} 条 | 以排除为准`;
}

function renderWorkspace() {
  renderTabs();
  renderTypeFilters();
  renderCapturedList();
  renderQueueList();
  capturedViewElement.classList.toggle("hidden", state.activeListTab !== "captured");
  queueViewElement.classList.toggle("hidden", state.activeListTab !== "queue");
  updateButtons();
}

function renderTypeFilters() {
  const sourceEntries = state.activeListTab === "queue" ? getQueueEntries() : getCapturedEntries();
  const counts = new Map();

  for (const entry of sourceEntries) {
    counts.set(entry.resourceType, (counts.get(entry.resourceType) || 0) + 1);
  }

  const availableTypes = new Set(counts.keys());
  state.activeTypeFilters = new Set([...state.activeTypeFilters].filter((type) => availableTypes.has(type)));

  resultTypeFilterBarElement.textContent = "";

  const allButton = document.createElement("button");
  allButton.className = `filter-chip ${state.activeTypeFilters.size === 0 ? "active" : ""}`;
  allButton.textContent = `全部 ${sourceEntries.length}`;
  allButton.addEventListener("click", () => {
    state.activeTypeFilters.clear();
    renderWorkspace();
  });
  resultTypeFilterBarElement.append(allButton);

  for (const [type, count] of [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))) {
    const button = document.createElement("button");
    button.className = `filter-chip ${state.activeTypeFilters.has(type) ? "active" : ""}`;
    button.textContent = `${getResourceTypeLabel(type)} ${count}`;
    button.addEventListener("click", () => {
      if (state.activeTypeFilters.has(type)) {
        state.activeTypeFilters.delete(type);
      } else {
        state.activeTypeFilters.add(type);
      }
      renderWorkspace();
    });
    resultTypeFilterBarElement.append(button);
  }
}

function renderTabs() {
  const capturedEntries = getFilteredCapturedEntries();
  const queueEntries = getFilteredQueueEntries();

  capturedTabButton.classList.toggle("active", state.activeListTab === "captured");
  queueTabButton.classList.toggle("active", state.activeListTab === "queue");
  capturedTabCountElement.textContent = String(capturedEntries.length);
  queueTabCountElement.textContent = String(queueEntries.length);
  visibleCountElement.textContent =
    state.activeListTab === "captured"
      ? `可见 ${capturedEntries.length} 条`
      : `队列中可见 ${queueEntries.length} 条`;
}

function renderCapturedList() {
  const visibleEntries = getFilteredCapturedEntries();
  requestListElement.textContent = "";

  if (!state.session?.entries?.length) {
    requestListElement.append(createEmptyState("还没有抓到任何请求。请先在弹窗里开始录制，走完目标流程后再回到这里查看。"));
    selectionSummaryElement.textContent = "已选 0 条";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    return;
  }

  if (visibleEntries.length === 0) {
    const message = state.hideQueuedFromCaptured && getQueueEntries().length > 0
      ? "当前没有匹配搜索条件的抓包记录，或者匹配到的条目都已经加入导出队列。"
      : "当前没有匹配搜索条件的抓包记录。";
    requestListElement.append(createEmptyState(message));
    selectionSummaryElement.textContent = "已选 0 条";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    return;
  }

  for (const entry of visibleEntries) {
    requestListElement.append(createCapturedRow(entry));
  }

  const selectedVisibleCount = visibleEntries.filter((entry) => state.selectedIds.has(entry.entryId)).length;
  selectAllCheckbox.checked = selectedVisibleCount > 0 && selectedVisibleCount === visibleEntries.length;
  selectAllCheckbox.indeterminate =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleEntries.length;
  selectionSummaryElement.textContent = `已选 ${state.selectedIds.size} 条`;
}

function renderQueueList() {
  const queueEntries = getFilteredQueueEntries();
  queueListElement.textContent = "";

  if (queueEntries.length === 0) {
    queueListElement.append(createEmptyState("导出队列还是空的。你可以先在“已抓取”列表里挑选条目，再加入导出队列。"));
    queueViewSummaryElement.textContent = "队列为空";
    return;
  }

  for (const entry of queueEntries) {
    queueListElement.append(createQueueRow(entry));
  }

  queueViewSummaryElement.textContent = `待导出 ${queueEntries.length} 条`;
}

function createCapturedRow(entry) {
  const row = document.createElement("div");
  row.className = "request-row";
  applyTypeTheme(row, entry.resourceType);
  if (entry.entryId === state.activeEntryId) {
    row.classList.add("active");
  }

  const checkbox = document.createElement("input");
  checkbox.className = "request-check";
  checkbox.type = "checkbox";
  checkbox.checked = state.selectedIds.has(entry.entryId);
  checkbox.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      state.selectedIds.add(entry.entryId);
    } else {
      state.selectedIds.delete(entry.entryId);
    }
    renderWorkspace();
  });

  const main = document.createElement("div");
  main.className = "request-main";
  main.innerHTML = buildRowMarkup(entry, isQueued(entry.entryId));

  const time = document.createElement("div");
  time.className = "request-time";
  time.textContent = entry.startedDateTime
    ? new Date(entry.startedDateTime).toLocaleTimeString()
    : "-";

  row.append(checkbox, main, time);

  row.addEventListener("click", () => {
    state.activeEntryId = entry.entryId;
    renderWorkspace();
    renderDrawer();
  });

  return row;
}

function createQueueRow(entry) {
  const row = document.createElement("div");
  row.className = "request-row";
  applyTypeTheme(row, entry.resourceType);
  if (entry.entryId === state.activeEntryId) {
    row.classList.add("active");
  }

  const badge = document.createElement("div");
  badge.className = "chip";
  badge.textContent = "已入队";

  const main = document.createElement("div");
  main.className = "request-main";
  main.innerHTML = buildRowMarkup(entry, true);

  const removeButton = document.createElement("button");
  removeButton.className = "queue-remove";
  removeButton.textContent = "移出队列";
  removeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void removeFromQueue(entry.entryId);
  });

  row.append(badge, main, removeButton);

  row.addEventListener("click", () => {
    state.activeEntryId = entry.entryId;
    renderWorkspace();
    renderDrawer();
  });

  return row;
}

function buildRowMarkup(entry, queued) {
  const typeLabel = getResourceTypeLabel(entry.resourceType);
  return `
    <div class="request-top">
      <span class="chip">${entry.method || "-"}</span>
      <span class="chip type">${typeLabel}</span>
      <span class="status-pill ${statusClass(entry.status, entry.failed)}">${formatStatus(entry)}</span>
      ${queued ? '<span class="chip">队列中</span>' : ""}
    </div>
    <div class="request-url">${escapeHtml(entry.url || "-")}</div>
    <div class="request-meta">
      <span>${entry.mimeType || "未知 MIME"}</span>
      <span>${entry.durationMs != null ? `${entry.durationMs} ms` : "等待中"}</span>
      <span>${entry.responseBody?.base64Encoded ? "二进制内容" : "文本或无响应体"}</span>
    </div>
  `;
}

function createEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  return empty;
}

function renderDrawer() {
  const entry = state.session?.entries?.find((item) => item.entryId === state.activeEntryId) || null;

  if (!entry) {
    detailDrawerElement.classList.remove("open");
    detailDrawerElement.setAttribute("aria-hidden", "true");
    drawerScrimElement.classList.add("hidden");
    detailTitleElement.textContent = "未选择条目";
    detailSubtitleElement.textContent = "请先从列表里选择一条请求。";
    emptyDetailElement.classList.remove("hidden");
    detailPanelElement.classList.add("hidden");
    return;
  }

  detailDrawerElement.classList.add("open");
  detailDrawerElement.setAttribute("aria-hidden", "false");
  drawerScrimElement.classList.remove("hidden");

  detailTitleElement.textContent = `${entry.method || "-"} ${getResourceTypeLabel(entry.resourceType)}`;
  detailSubtitleElement.textContent = entry.url || "-";
  detailTypeElement.textContent = getResourceTypeLabel(entry.resourceType);
  detailMethodElement.textContent = entry.method || "-";
  detailStatusElement.textContent = formatStatus(entry);
  detailUrlElement.textContent = entry.url || "-";
  detailRequestHeadersElement.textContent = formatHeaders(entry.requestHeaders);
  detailResponseHeadersElement.textContent = formatHeaders(entry.responseHeaders);
  detailRequestBodyElement.textContent = formatBody(entry.requestBody, "request");
  detailResponseBodyElement.textContent = formatBody(entry.responseBody, "response");

  emptyDetailElement.classList.add("hidden");
  detailPanelElement.classList.remove("hidden");
}

function closeDrawer() {
  state.activeEntryId = null;
  renderDrawer();
  renderWorkspace();
}

function switchTab(nextTab) {
  state.activeListTab = nextTab;
  renderWorkspace();
}

function getCapturedEntries() {
  const queueSet = new Set(state.session?.exportQueueEntryIds || []);
  const entries = state.session?.entries || [];

  return entries.filter((entry) => {
    if (!state.hideQueuedFromCaptured) {
      return true;
    }

    return !queueSet.has(entry.entryId);
  });
}

function getQueueEntries() {
  const entriesById = new Map((state.session?.entries || []).map((entry) => [entry.entryId, entry]));
  return (state.session?.exportQueueEntryIds || []).map((entryId) => entriesById.get(entryId)).filter(Boolean);
}

function getFilteredCapturedEntries() {
  const entries = getCapturedEntries();
  const typeFilteredEntries = entries.filter(matchesTypeFilter);
  if (!state.searchTerm) {
    return typeFilteredEntries;
  }

  return typeFilteredEntries.filter((entry) => matchesSearch(entry, state.searchTerm));
}

function getFilteredQueueEntries() {
  const entries = getQueueEntries();
  const typeFilteredEntries = entries.filter(matchesTypeFilter);
  if (!state.searchTerm) {
    return typeFilteredEntries;
  }

  return typeFilteredEntries.filter((entry) => matchesSearch(entry, state.searchTerm));
}

function matchesTypeFilter(entry) {
  if (state.activeTypeFilters.size === 0) {
    return true;
  }

  return state.activeTypeFilters.has(entry.resourceType);
}

function matchesSearch(entry, query) {
  const haystack = [
    entry.url,
    entry.method,
    entry.resourceType,
    getResourceTypeLabel(entry.resourceType),
    entry.mimeType,
    entry.status,
    entry.statusText,
    entry.errorText,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return haystack.includes(query);
}

function isQueued(entryId) {
  return (state.session?.exportQueueEntryIds || []).includes(entryId);
}

function markSettingsDirty() {
  state.settingsDirty = true;
  renderSettings();
}

async function applySettings(preferencesOverride = null) {
  try {
    const nextPreferences =
      preferencesOverride ||
      normalizeCapturePreferences({
        ...state.draftPreferences,
        includeRules: state.draftIncludeRulesText,
        excludeRules: state.draftExcludeRulesText,
        captureBinaryBodies: binaryBodiesCheckbox.checked,
      });

    const response = await chrome.runtime.sendMessage({
      type: "recorder/update-preferences",
      preferences: nextPreferences,
    });

    if (!response.ok) {
      throw new Error(response.error || "更新抓包设置失败。");
    }

    syncDraftPreferences(nextPreferences);
    await refresh();
  } catch (error) {
    render(error?.message || String(error));
  }
}

async function resetSettings() {
  const defaults = normalizeCapturePreferences(DEFAULT_CAPTURE_PREFERENCES);
  state.draftPreferences = defaults;
  state.draftIncludeRulesText = rulesToMultiline(defaults.includeRules);
  state.draftExcludeRulesText = rulesToMultiline(defaults.excludeRules);
  state.settingsDirty = true;
  renderSettings();
  await applySettings(defaults);
}

async function clearSession() {
  if (!state.session?.tabId) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "recorder/clear",
      tabId: state.session.tabId,
    });

    if (!response.ok) {
      throw new Error(response.error || "清空会话失败。");
    }

    state.selectedIds.clear();
    state.activeEntryId = null;
    await refresh();
  } catch (error) {
    render(error?.message || String(error));
  }
}

async function addSelectionToQueue() {
  if (!state.session?.tabId || state.selectedIds.size === 0) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "recorder/queue/add",
      tabId: state.session.tabId,
      entryIds: [...state.selectedIds],
    });

    if (!response.ok) {
      throw new Error(response.error || "加入导出队列失败。");
    }

    state.selectedIds.clear();
    await refresh();
  } catch (error) {
    render(error?.message || String(error));
  }
}

async function removeFromQueue(entryId) {
  if (!state.session?.tabId) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "recorder/queue/remove",
      tabId: state.session.tabId,
      entryIds: [entryId],
    });

    if (!response.ok) {
      throw new Error(response.error || "移出导出队列失败。");
    }

    await refresh();
  } catch (error) {
    render(error?.message || String(error));
  }
}

async function clearQueue() {
  if (!state.session?.tabId) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "recorder/queue/clear",
      tabId: state.session.tabId,
    });

    if (!response.ok) {
      throw new Error(response.error || "清空导出队列失败。");
    }

    await refresh();
  } catch (error) {
    render(error?.message || String(error));
  }
}

async function deleteSelectedEntries() {
  if (!state.session?.tabId || state.selectedIds.size === 0) {
    return;
  }

  const targetEntryIds = [...state.selectedIds];
  const confirmed = window.confirm(`确认从当前会话中删除已选的 ${targetEntryIds.length} 条抓包记录吗？`);
  if (!confirmed) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "recorder/delete-entries",
      tabId: state.session.tabId,
      entryIds: targetEntryIds,
    });

    if (!response.ok) {
      throw new Error(response.error || "删除选中的抓包记录失败。");
    }

    for (const entryId of targetEntryIds) {
      state.selectedIds.delete(entryId);
    }
    if (state.activeEntryId && targetEntryIds.includes(state.activeEntryId)) {
      state.activeEntryId = null;
    }
    await refresh();
  } catch (error) {
    render(error?.message || String(error));
  }
}

async function exportEntries(format, mode) {
  if (!state.session?.tabId) {
    return;
  }

  try {
    const requestIds =
      mode === "queue"
        ? [...(state.session.exportQueueEntryIds || [])]
        : [];

    const response = await chrome.runtime.sendMessage({
      type: "recorder/get-export",
      tabId: state.session.tabId,
      requestIds,
      format,
    });

    if (!response.ok) {
      throw new Error(response.error || `导出 ${format.toUpperCase()} 失败。`);
    }

    const blob = new Blob([JSON.stringify(response.content, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    render(error?.message || String(error));
  }
}

function handleSelectAllChanged() {
  const visibleEntries = getFilteredCapturedEntries();

  if (selectAllCheckbox.checked) {
    for (const entry of visibleEntries) {
      state.selectedIds.add(entry.entryId);
    }
  } else {
    for (const entry of visibleEntries) {
      state.selectedIds.delete(entry.entryId);
    }
  }

  renderWorkspace();
}

function updateButtons() {
  const hasSession = Boolean(state.session);
  const hasEntries = Boolean(state.session?.entries?.length);
  const hasSelection = state.selectedIds.size > 0;
  const hasQueue = Boolean(state.session?.exportQueueEntryIds?.length);

  clearButton.disabled = !hasSession;
  addToQueueButton.disabled = !hasSelection;
  deleteSelectedButton.disabled = !hasSelection;
  clearSelectionButton.disabled = !hasSelection;
  exportAllJsonButton.disabled = !hasEntries;
  exportAllHarButton.disabled = !hasEntries;
  exportQueueJsonButton.disabled = !hasQueue;
  exportQueueHarButton.disabled = !hasQueue;
  clearQueueButton.disabled = !hasQueue;
}

function applyTypeTheme(row, resourceType) {
  const theme = getTypeTheme(resourceType);
  row.style.setProperty("--type-accent", theme.accent);
  row.style.setProperty("--type-tint", theme.tint);
  row.style.setProperty("--type-surface", theme.surface);
}

function getTypeTheme(resourceType) {
  const themes = {
    Document: { accent: "#8b5728", tint: "#f6e4d0", surface: "#fcf4ea" },
    XHR: { accent: "#1d6fd6", tint: "#dfeeff", surface: "#f4f9ff" },
    Fetch: { accent: "#0f6d5d", tint: "#dcf4ef", surface: "#f2fbf8" },
    Image: { accent: "#c66a1f", tint: "#faead9", surface: "#fff7ef" },
    Script: { accent: "#8a6a12", tint: "#f5ecc9", surface: "#fcf8eb" },
    Stylesheet: { accent: "#7a4ea3", tint: "#eee3fb", surface: "#f7f1ff" },
    Font: { accent: "#5f62b8", tint: "#e7e8fb", surface: "#f5f6ff" },
    Media: { accent: "#b5484f", tint: "#f9e1e3", surface: "#fff4f5" },
    Manifest: { accent: "#70554b", tint: "#eee3de", surface: "#faf5f2" },
    EventSource: { accent: "#2b7c8d", tint: "#dff2f6", surface: "#f3fcfe" },
    WebSocket: { accent: "#9a5c2f", tint: "#f6e6d7", surface: "#fcf5ef" },
    Other: { accent: "#6b604f", tint: "#ece6de", surface: "#faf7f2" },
  };

  return themes[resourceType] || themes.Other;
}

function formatHeaders(headers = []) {
  if (!headers.length) {
    return "// 未捕获到头信息";
  }

  return headers.map((header) => `${header.name}: ${header.value}`).join("\n");
}

function formatBody(body, phase) {
  if (!body?.text) {
    return phase === "response"
      ? "// 未捕获到响应体。这可能表示内容为空、未开启二进制响应体抓取，或者当前响应不支持读取。"
      : "// 未捕获到请求体";
  }

  const size = formatBytes(body.originalLength || body.text.length);
  const prefix = [
    body.base64Encoded ? "// base64 编码：是" : "// base64 编码：否",
    body.truncated ? `// 已截断：是（${size}）` : `// 大小：${size}`,
  ].join("\n");

  return `${prefix}\n\n${body.text}`;
}

function formatStatus(entry) {
  if (entry.failed) {
    return entry.errorText || "失败";
  }

  if (typeof entry.status === "number") {
    return `${entry.status} ${entry.statusText || ""}`.trim();
  }

  return "等待中";
}

function getResourceTypeLabel(resourceType) {
  return RESOURCE_TYPE_OPTIONS.find((option) => option.key === resourceType)?.label || resourceType || "-";
}

function statusClass(status, failed) {
  if (failed || (typeof status === "number" && status >= 400)) {
    return "error";
  }

  if (typeof status === "number" && status > 0) {
    return "ok";
  }

  return "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
