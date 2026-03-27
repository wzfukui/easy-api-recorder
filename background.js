import { createHar } from "./lib/har-export.js";
import {
  createEntryId,
  createSessionId,
  DEFAULT_CAPTURE_PREFERENCES,
  mergeCapturePreferences,
  normalizeBodyPayload,
  normalizeCapturePreferences,
  normalizeHeaders,
  normalizeResourceType,
  safeIsoDateFromWallTime,
  serializeErrorMessage,
  shouldCaptureRequest,
  shouldCaptureResponseBody,
  STORAGE_KEY,
} from "./lib/shared.js";

const DEBUGGER_TARGET_VERSION = "1.3";

const state = {
  activeSessionTabId: null,
  sessions: new Map(),
  capturePreferences: normalizeCapturePreferences(DEFAULT_CAPTURE_PREFERENCES),
  lastError: "",
  initialized: false,
  persistTimer: null,
  expectedDetachTabIds: new Set(),
};

const initPromise = restoreState();

chrome.runtime.onInstalled.addListener(() => {
  void initPromise;
});

chrome.runtime.onStartup.addListener(() => {
  void initPromise;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (state.activeSessionTabId === tabId) {
    void stopRecording(tabId, { preserveData: true });
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  void handleDebuggerEvent(source, method, params);
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId == null) {
    return;
  }

  const session = getSession(source.tabId);
  if (!session) {
    return;
  }

  const isExpected = state.expectedDetachTabIds.has(source.tabId);
  state.expectedDetachTabIds.delete(source.tabId);
  session.isRecording = false;
  session.detachedReason = reason;
  session.updatedAt = new Date().toISOString();
  state.activeSessionTabId = state.activeSessionTabId === source.tabId ? null : state.activeSessionTabId;
  state.lastError =
    !isExpected && reason && reason !== "target_closed" ? `调试器已断开：${reason}` : "";
  schedulePersist();
  notifyStateChanged(source.tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: serializeErrorMessage(error) }));

  return true;
});

async function restoreState() {
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  const snapshot = stored[STORAGE_KEY];

  if (snapshot) {
    state.activeSessionTabId = typeof snapshot.activeSessionTabId === "number" ? snapshot.activeSessionTabId : null;
    state.lastError = snapshot.lastError || "";
    state.capturePreferences = normalizeCapturePreferences(snapshot.capturePreferences);
    state.sessions = new Map(
      (snapshot.sessions || []).map((session) => [
        session.tabId,
        {
          ...session,
          entries: Array.isArray(session.entries) ? session.entries : [],
          capturePreferences: normalizeCapturePreferences(session.capturePreferences),
          exportQueueEntryIds: Array.isArray(session.exportQueueEntryIds) ? session.exportQueueEntryIds : [],
        },
      ]),
    );
  }

  state.initialized = true;
}

function schedulePersist() {
  if (state.persistTimer) {
    clearTimeout(state.persistTimer);
  }

  state.persistTimer = setTimeout(() => {
    state.persistTimer = null;
    void persistState();
  }, 150);
}

async function persistState() {
  const snapshot = {
    activeSessionTabId: state.activeSessionTabId,
    lastError: state.lastError,
    capturePreferences: state.capturePreferences,
    sessions: Array.from(state.sessions.values()),
  };

  await chrome.storage.session.set({
    [STORAGE_KEY]: snapshot,
  });
}

function getSession(tabId) {
  return state.sessions.get(tabId) || null;
}

function createEmptySession(tab) {
  return {
    sessionId: createSessionId(tab.id),
    tabId: tab.id,
    title: tab.title || "未命名标签页",
    url: tab.url || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    attachedAt: null,
    detachedReason: "",
    isRecording: false,
    capturePreferences: structuredClone(state.capturePreferences),
    exportQueueEntryIds: [],
    entries: [],
  };
}

function syncExportQueue(session) {
  const validEntryIds = new Set(session.entries.map((entry) => entry.entryId));
  session.exportQueueEntryIds = (session.exportQueueEntryIds || []).filter((entryId) => validEntryIds.has(entryId));
}

function findEntry(session, entryId) {
  return session.entries.find((entry) => entry.entryId === entryId) || null;
}

function upsertEntry(session, entryId, updater) {
  const existing = findEntry(session, entryId);

  if (existing) {
    updater(existing);
    return existing;
  }

  const next = {
    sessionId: session.sessionId,
    entryId,
    tabId: session.tabId,
    requestId: entryId.split(":").slice(1).join(":"),
    resourceType: "",
    method: "",
    url: "",
    status: null,
    statusText: "",
    protocol: "",
    mimeType: "",
    remoteIPAddress: "",
    requestHeaders: [],
    responseHeaders: [],
    requestBody: null,
    responseBody: null,
    startedDateTime: new Date().toISOString(),
    wallTime: null,
    requestTimestamp: null,
    responseTimestamp: null,
    finishedTimestamp: null,
    durationMs: null,
    fromDiskCache: false,
    fromServiceWorker: false,
    failed: false,
    errorText: "",
  };

  updater(next);
  session.entries.push(next);
  return next;
}

function sortEntries(session) {
  session.entries.sort((left, right) => {
    const leftTime = Date.parse(left.startedDateTime || "") || 0;
    const rightTime = Date.parse(right.startedDateTime || "") || 0;
    return rightTime - leftTime;
  });
}

function notifyStateChanged(tabId = null) {
  chrome.runtime
    .sendMessage({
      type: "recorder/state-changed",
      tabId,
      activeSessionTabId: state.activeSessionTabId,
    })
    .catch(() => {
      // Ignore cases where no popup/page is listening.
    });
}

async function handleMessage(message) {
  await initPromise;

  switch (message?.type) {
    case "recorder/get-state":
      return getStatePayload();
    case "recorder/get-session":
      return getSessionPayload(message.tabId ?? state.activeSessionTabId);
    case "recorder/get-export":
      return getExportPayload(message.tabId ?? state.activeSessionTabId, message.requestIds, message.format);
    case "recorder/get-preferences":
      return {
        capturePreferences: structuredClone(state.capturePreferences),
      };
    case "recorder/update-preferences":
      return updateCapturePreferences(message.preferences);
    case "recorder/queue/add":
      return addToExportQueue(message.tabId, message.entryIds);
    case "recorder/queue/remove":
      return removeFromExportQueue(message.tabId, message.entryIds);
    case "recorder/queue/clear":
      return clearExportQueue(message.tabId);
    case "recorder/delete-entry":
      return deleteEntry(message.tabId, message.entryId);
    case "recorder/delete-entries":
      return deleteEntries(message.tabId, message.entryIds);
    case "recorder/start":
      return startRecording(message.tabId);
    case "recorder/stop":
      return stopRecording(message.tabId);
    case "recorder/clear":
      return clearSession(message.tabId);
    default:
      throw new Error(`不支持的消息类型：${message?.type || "未知"}`);
  }
}

function getStatePayload() {
  const sessions = Array.from(state.sessions.values())
    .map((session) => {
      syncExportQueue(session);
      return {
        sessionId: session.sessionId,
        tabId: session.tabId,
        title: session.title,
        url: session.url,
        isRecording: session.isRecording,
        entryCount: session.entries.length,
        queueCount: (session.exportQueueEntryIds || []).length,
        updatedAt: session.updatedAt,
        detachedReason: session.detachedReason,
      };
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    activeSessionTabId: state.activeSessionTabId,
    lastError: state.lastError,
    capturePreferences: structuredClone(state.capturePreferences),
    sessions,
  };
}

function getSessionPayload(tabId) {
  if (typeof tabId !== "number") {
    return {
      session: null,
      capturePreferences: structuredClone(state.capturePreferences),
      lastError: state.lastError,
    };
  }

  const session = getSession(tabId);
  if (session) {
    syncExportQueue(session);
  }

  return {
    session: session ? structuredClone(session) : null,
    capturePreferences: structuredClone(state.capturePreferences),
    lastError: state.lastError,
  };
}

function getExportPayload(tabId, requestIds = [], format = "json") {
  const session = getSession(tabId);

  if (!session) {
    throw new Error("当前没有可导出的会话。");
  }

  syncExportQueue(session);

  const idSet = Array.isArray(requestIds) && requestIds.length > 0 ? new Set(requestIds) : null;
  const entries = session.entries.filter((entry) => !idSet || idSet.has(entry.entryId));

  if (entries.length === 0) {
    throw new Error("没有可导出的条目。");
  }

  const safeTitle = session.title.replace(/[^\w.-]+/g, "_").slice(0, 60) || "会话";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (format === "har") {
    return {
      filename: `${safeTitle}-${timestamp}.har`,
      format: "har",
      content: createHar(entries, {
        title: session.title,
        url: session.url,
        capturePreferences: session.capturePreferences,
      }),
    };
  }

  return {
    filename: `${safeTitle}-${timestamp}.json`,
    format: "json",
    content: {
      exportedAt: new Date().toISOString(),
      session: {
        sessionId: session.sessionId,
        tabId: session.tabId,
        title: session.title,
        url: session.url,
        capturePreferences: session.capturePreferences,
      },
      entries,
    },
  };
}

function updateCapturePreferences(preferencesPatch = {}) {
  state.capturePreferences = mergeCapturePreferences(state.capturePreferences, preferencesPatch);

  for (const session of state.sessions.values()) {
    if (session.isRecording) {
      session.capturePreferences = structuredClone(state.capturePreferences);
      session.updatedAt = new Date().toISOString();
    }
  }

  state.lastError = "";
  schedulePersist();
  notifyStateChanged(state.activeSessionTabId);

  return {
    capturePreferences: structuredClone(state.capturePreferences),
  };
}

async function startRecording(tabId) {
  if (typeof tabId !== "number") {
    throw new Error("需要有效的 tabId。");
  }

  const tab = await chrome.tabs.get(tabId);

  if (state.activeSessionTabId && state.activeSessionTabId !== tabId) {
    await stopRecording(state.activeSessionTabId, { preserveData: true });
  }

  const existingSession = getSession(tabId);
  if (existingSession?.isRecording) {
    return {
      activeSessionTabId: state.activeSessionTabId,
      session: structuredClone(existingSession),
    };
  }

  await chrome.debugger.attach({ tabId }, DEBUGGER_TARGET_VERSION);

  try {
    await chrome.debugger.sendCommand({ tabId }, "Network.enable", {});
  } catch (error) {
    state.expectedDetachTabIds.add(tabId);
    await chrome.debugger.detach({ tabId }).catch(() => {});
    throw error;
  }

  let session = existingSession;
  if (!session) {
    session = createEmptySession(tab);
    state.sessions.set(tabId, session);
  } else {
    session.title = tab.title || session.title;
    session.url = tab.url || session.url;
    session.createdAt = new Date().toISOString();
    session.entries = [];
    session.detachedReason = "";
    session.capturePreferences = structuredClone(state.capturePreferences);
    session.exportQueueEntryIds = [];
  }

  session.isRecording = true;
  session.attachedAt = new Date().toISOString();
  session.updatedAt = new Date().toISOString();
  state.activeSessionTabId = tabId;
  state.lastError = "";
  schedulePersist();
  notifyStateChanged(tabId);

  return {
    activeSessionTabId: state.activeSessionTabId,
    session: structuredClone(session),
  };
}

async function stopRecording(tabId, options = {}) {
  if (typeof tabId !== "number") {
    throw new Error("需要有效的 tabId。");
  }

  const session = getSession(tabId);
  if (!session) {
    return getSessionPayload(tabId);
  }

  try {
    state.expectedDetachTabIds.add(tabId);
    await chrome.debugger.detach({ tabId });
  } catch {
    state.expectedDetachTabIds.delete(tabId);
    // The target can already be gone or detached. State should still be updated.
  }

  session.isRecording = false;
  session.updatedAt = new Date().toISOString();

  if (!options.preserveData && session.entries.length === 0) {
    state.sessions.delete(tabId);
  }

  if (state.activeSessionTabId === tabId) {
    state.activeSessionTabId = null;
  }

  schedulePersist();
  notifyStateChanged(tabId);

  return {
    activeSessionTabId: state.activeSessionTabId,
    session: getSession(tabId) ? structuredClone(getSession(tabId)) : null,
  };
}

async function clearSession(tabId) {
  if (typeof tabId !== "number") {
    throw new Error("需要有效的 tabId。");
  }

  if (state.activeSessionTabId === tabId) {
    await stopRecording(tabId, { preserveData: true });
  }

  state.sessions.delete(tabId);
  state.lastError = "";
  schedulePersist();
  notifyStateChanged(tabId);

  return getStatePayload();
}

function addToExportQueue(tabId, entryIds = []) {
  const session = getSession(tabId);
  if (!session) {
    throw new Error("当前没有可用会话。");
  }

  const validEntryIds = new Set(session.entries.map((entry) => entry.entryId));
  const queue = new Set(session.exportQueueEntryIds || []);

  for (const entryId of entryIds) {
    if (validEntryIds.has(entryId)) {
      queue.add(entryId);
    }
  }

  session.exportQueueEntryIds = [...queue];
  session.updatedAt = new Date().toISOString();
  schedulePersist();
  notifyStateChanged(tabId);

  return {
    session: structuredClone(session),
  };
}

function removeFromExportQueue(tabId, entryIds = []) {
  const session = getSession(tabId);
  if (!session) {
    throw new Error("当前没有可用会话。");
  }

  const removeSet = new Set(entryIds);
  session.exportQueueEntryIds = (session.exportQueueEntryIds || []).filter((entryId) => !removeSet.has(entryId));
  session.updatedAt = new Date().toISOString();
  schedulePersist();
  notifyStateChanged(tabId);

  return {
    session: structuredClone(session),
  };
}

function clearExportQueue(tabId) {
  const session = getSession(tabId);
  if (!session) {
    throw new Error("当前没有可用会话。");
  }

  session.exportQueueEntryIds = [];
  session.updatedAt = new Date().toISOString();
  schedulePersist();
  notifyStateChanged(tabId);

  return {
    session: structuredClone(session),
  };
}

function deleteEntry(tabId, entryId) {
  return deleteEntries(tabId, [entryId]);
}

function deleteEntries(tabId, entryIds = []) {
  const session = getSession(tabId);
  if (!session) {
    throw new Error("当前没有可用会话。");
  }

  const deleteSet = new Set(entryIds);
  session.entries = session.entries.filter((entry) => !deleteSet.has(entry.entryId));
  session.exportQueueEntryIds = (session.exportQueueEntryIds || []).filter((queuedId) => !deleteSet.has(queuedId));
  session.updatedAt = new Date().toISOString();
  schedulePersist();
  notifyStateChanged(tabId);

  return {
    session: structuredClone(session),
  };
}

async function handleDebuggerEvent(source, method, params) {
  await initPromise;

  const tabId = source.tabId;
  if (tabId == null) {
    return;
  }

  const session = getSession(tabId);
  if (!session || !session.isRecording) {
    return;
  }

  session.updatedAt = new Date().toISOString();

  switch (method) {
    case "Network.requestWillBeSent":
      await handleRequestWillBeSent(session, params);
      break;
    case "Network.requestWillBeSentExtraInfo":
      handleRequestExtraInfo(session, params);
      break;
    case "Network.responseReceived":
      handleResponseReceived(session, params);
      break;
    case "Network.responseReceivedExtraInfo":
      handleResponseExtraInfo(session, params);
      break;
    case "Network.loadingFinished":
      await handleLoadingFinished(session, params);
      break;
    case "Network.loadingFailed":
      handleLoadingFailed(session, params);
      break;
    default:
      return;
  }

  sortEntries(session);
  schedulePersist();
  notifyStateChanged(tabId);
}

async function handleRequestWillBeSent(session, params) {
  const resourceType = normalizeResourceType(params.type);
  if (!shouldCaptureRequest({ ...params, type: resourceType }, session.capturePreferences)) {
    return;
  }

  const entryId = createEntryId(session.tabId, params.requestId);
  const entry = upsertEntry(session, entryId, (draft) => {
    draft.resourceType = resourceType;
    draft.method = params.request?.method || draft.method;
    draft.url = params.request?.url || draft.url;
    draft.startedDateTime = safeIsoDateFromWallTime(params.wallTime);
    draft.wallTime = params.wallTime ?? draft.wallTime;
    draft.requestTimestamp = params.timestamp ?? draft.requestTimestamp;
    draft.requestHeaders = normalizeHeaders(params.request?.headers);
    draft.requestBody =
      params.request?.postData != null
        ? normalizeBodyPayload({
            text: params.request.postData,
            base64Encoded: false,
          })
        : draft.requestBody;
  });

  try {
    if (!entry.requestBody && params.request?.hasPostData) {
      const result = await chrome.debugger.sendCommand(
        { tabId: session.tabId },
        "Network.getRequestPostData",
        { requestId: params.requestId },
      );

      entry.requestBody = normalizeBodyPayload({
        text: result?.postData || "",
        base64Encoded: false,
      });
    }
  } catch {
    // Request body retrieval can fail for some requests. Ignore and keep the entry.
  }
}

function handleRequestExtraInfo(session, params) {
  const entry = findEntry(session, createEntryId(session.tabId, params.requestId));
  if (!entry) {
    return;
  }

  entry.requestHeaders = normalizeHeaders(params.headers);
}

function handleResponseReceived(session, params) {
  const entry = findEntry(session, createEntryId(session.tabId, params.requestId));
  if (!entry) {
    return;
  }

  entry.status = params.response?.status ?? entry.status;
  entry.statusText = params.response?.statusText || entry.statusText;
  entry.protocol = params.response?.protocol || entry.protocol;
  entry.mimeType = params.response?.mimeType || entry.mimeType;
  entry.remoteIPAddress = params.response?.remoteIPAddress || entry.remoteIPAddress;
  entry.fromDiskCache = Boolean(params.response?.fromDiskCache);
  entry.fromServiceWorker = Boolean(params.response?.fromServiceWorker);
  entry.responseHeaders = normalizeHeaders(params.response?.headers);
  entry.responseTimestamp = params.timestamp ?? entry.responseTimestamp;
}

function handleResponseExtraInfo(session, params) {
  const entry = findEntry(session, createEntryId(session.tabId, params.requestId));
  if (!entry) {
    return;
  }

  entry.responseHeaders = normalizeHeaders(params.headers);
  if (typeof params.statusCode === "number") {
    entry.status = params.statusCode;
  }
}

async function handleLoadingFinished(session, params) {
  const entry = findEntry(session, createEntryId(session.tabId, params.requestId));
  if (!entry) {
    return;
  }

  entry.finishedTimestamp = params.timestamp ?? entry.finishedTimestamp;
  if (typeof entry.finishedTimestamp === "number" && typeof entry.requestTimestamp === "number") {
    entry.durationMs = Math.max(0, Math.round((entry.finishedTimestamp - entry.requestTimestamp) * 1000));
  }

  if (!shouldCaptureResponseBody(entry, session.capturePreferences)) {
    return;
  }

  try {
    const result = await chrome.debugger.sendCommand(
      { tabId: session.tabId },
      "Network.getResponseBody",
      { requestId: params.requestId },
    );

    entry.responseBody = normalizeBodyPayload({
      text: result?.body || "",
      base64Encoded: Boolean(result?.base64Encoded),
    });
  } catch {
    // Response body retrieval can fail on redirects, cached resources, or empty bodies.
  }
}

function handleLoadingFailed(session, params) {
  const entry = findEntry(session, createEntryId(session.tabId, params.requestId));
  if (!entry) {
    return;
  }

  entry.failed = true;
  entry.errorText = params.errorText || "";
  entry.finishedTimestamp = params.timestamp ?? entry.finishedTimestamp;
  if (typeof entry.finishedTimestamp === "number" && typeof entry.requestTimestamp === "number") {
    entry.durationMs = Math.max(0, Math.round((entry.finishedTimestamp - entry.requestTimestamp) * 1000));
  }
}
