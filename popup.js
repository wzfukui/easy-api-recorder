import { normalizeCapturePreferences, summarizeEnabledResourceTypes } from "./lib/shared.js";

const APP_VERSION = chrome.runtime.getManifest().version;

const state = {
  currentTab: null,
  recorderState: null,
  capturePreferences: normalizeCapturePreferences(),
};

const popupVersionElement = document.querySelector("#popup-version");
const tabTitleElement = document.querySelector("#tab-title");
const recordingStatusElement = document.querySelector("#recording-status");
const entryCountElement = document.querySelector("#entry-count");
const scopeSummaryElement = document.querySelector("#scope-summary");
const scopeDetailElement = document.querySelector("#scope-detail");
const errorElement = document.querySelector("#error-text");
const startButton = document.querySelector("#start-button");
const stopButton = document.querySelector("#stop-button");
const openButton = document.querySelector("#open-button");

startButton.addEventListener("click", () => void startRecording());
stopButton.addEventListener("click", () => void stopRecording());
openButton.addEventListener("click", () => void openRecorderPage());

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "recorder/state-changed") {
    void refresh();
  }
});

void refresh();

async function refresh() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    state.currentTab = activeTab || null;

    const recorderStateResponse = await chrome.runtime.sendMessage({
      type: "recorder/get-state",
    });

    state.recorderState = recorderStateResponse;
    state.capturePreferences = normalizeCapturePreferences(recorderStateResponse.capturePreferences);
    render();
  } catch (error) {
    state.recorderState = {
      sessions: [],
      lastError: error?.message || String(error),
    };
    render();
  }
}

function render() {
  const currentTab = state.currentTab;
  const currentSession =
    currentTab && state.recorderState?.sessions
      ? state.recorderState.sessions.find((session) => session.tabId === currentTab.id)
      : null;

  popupVersionElement.textContent = `版本 v${APP_VERSION}`;
  tabTitleElement.textContent = currentTab?.title || "当前没有活动标签页";
  recordingStatusElement.textContent = currentSession?.isRecording ? "录制中" : "空闲";
  entryCountElement.textContent = String(currentSession?.entryCount || 0);
  scopeSummaryElement.textContent = summarizeEnabledResourceTypes(state.capturePreferences);
  scopeDetailElement.textContent = summarizeEnabledResourceTypes(state.capturePreferences, 8);

  const errorMessage = state.recorderState?.lastError || "";
  errorElement.textContent = errorMessage;
  errorElement.classList.toggle("hidden", !errorMessage);

  const hasTab = Boolean(currentTab?.id);
  startButton.disabled = !hasTab || Boolean(currentSession?.isRecording);
  stopButton.disabled = !hasTab || !currentSession?.isRecording;
}

async function startRecording() {
  if (!state.currentTab?.id) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "recorder/start",
      tabId: state.currentTab.id,
    });

    if (!response.ok) {
      throw new Error(response.error || "启动录制失败。");
    }

    await refresh();
  } catch (error) {
    state.recorderState = {
      ...(state.recorderState || {}),
      lastError: error?.message || String(error),
    };
    render();
  }
}

async function stopRecording() {
  if (!state.currentTab?.id) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "recorder/stop",
      tabId: state.currentTab.id,
    });

    if (!response.ok) {
      throw new Error(response.error || "停止录制失败。");
    }

    await refresh();
  } catch (error) {
    state.recorderState = {
      ...(state.recorderState || {}),
      lastError: error?.message || String(error),
    };
    render();
  }
}

async function openRecorderPage() {
  await chrome.tabs.create({
    url: chrome.runtime.getURL("./pages/recorder.html"),
  });
}
