export const RESOURCE_TYPE_OPTIONS = [
  { key: "Document", label: "页面", hint: "HTML 页面和页面跳转" },
  { key: "XHR", label: "XHR", hint: "老页面常见的接口请求" },
  { key: "Fetch", label: "Fetch", hint: "新页面常见的接口请求" },
  { key: "Script", label: "脚本", hint: "JS 文件和模块资源" },
  { key: "Stylesheet", label: "样式", hint: "CSS 样式文件" },
  { key: "Image", label: "图片", hint: "图片、图标等资源" },
  { key: "Font", label: "字体", hint: "字体文件" },
  { key: "Media", label: "媒体", hint: "视频和音频资源" },
  { key: "Manifest", label: "站点配置", hint: "PWA 配置和站点元数据" },
  { key: "WebSocket", label: "WebSocket", hint: "长连接和实时消息" },
  { key: "EventSource", label: "SSE", hint: "服务端推送事件流" },
  { key: "Other", label: "其他", hint: "其他网络资源" },
];

export const DEFAULT_CAPTURE_PREFERENCES = {
  resourceTypes: {
    Document: true,
    XHR: true,
    Fetch: true,
    Script: false,
    Stylesheet: false,
    Image: false,
    Font: false,
    Media: false,
    Manifest: false,
    WebSocket: false,
    EventSource: false,
    Other: false,
  },
  includeRules: [],
  excludeRules: [],
  captureBinaryBodies: false,
};

export const TEXT_RESPONSE_RESOURCE_TYPES = new Set([
  "Document",
  "XHR",
  "Fetch",
  "Script",
  "Stylesheet",
  "Manifest",
  "EventSource",
]);

export const BODY_TEXT_LIMIT = 200_000;
export const STORAGE_KEY = "easyApiRecorderState";

export function createSessionId(tabId) {
  return `tab-${tabId}`;
}

export function createEntryId(tabId, requestId) {
  return `${tabId}:${requestId}`;
}

export function normalizeResourceType(resourceType) {
  if (!resourceType) {
    return "Other";
  }

  return RESOURCE_TYPE_OPTIONS.some((option) => option.key === resourceType) ? resourceType : "Other";
}

export function normalizeCapturePreferences(preferences = {}) {
  const resourceTypes = {};

  for (const option of RESOURCE_TYPE_OPTIONS) {
    const explicit = preferences.resourceTypes?.[option.key];
    resourceTypes[option.key] =
      typeof explicit === "boolean"
        ? explicit
        : DEFAULT_CAPTURE_PREFERENCES.resourceTypes[option.key];
  }

  return {
    resourceTypes,
    includeRules: normalizeRuleList(preferences.includeRules),
    excludeRules: normalizeRuleList(preferences.excludeRules),
    captureBinaryBodies:
      typeof preferences.captureBinaryBodies === "boolean"
        ? preferences.captureBinaryBodies
        : DEFAULT_CAPTURE_PREFERENCES.captureBinaryBodies,
  };
}

export function mergeCapturePreferences(current, patch = {}) {
  const normalizedCurrent = normalizeCapturePreferences(current);
  return normalizeCapturePreferences({
    ...normalizedCurrent,
    ...patch,
    resourceTypes: {
      ...normalizedCurrent.resourceTypes,
      ...(patch.resourceTypes || {}),
    },
  });
}

export function normalizeRuleList(rules) {
  const source =
    typeof rules === "string"
      ? rules.split(/\r?\n/g)
      : Array.isArray(rules)
        ? rules
        : [];

  return [...new Set(source.map((rule) => String(rule).trim()).filter(Boolean))];
}

export function rulesToMultiline(rules) {
  return normalizeRuleList(rules).join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createRuleRegex(rule) {
  const normalizedRule = String(rule).trim();
  if (!normalizedRule) {
    return null;
  }

  const expression = escapeRegExp(normalizedRule).replaceAll("\\*", ".*");
  return new RegExp(expression, "i");
}

export function matchesUrlRules(url, rules) {
  const haystack = String(url || "");
  return normalizeRuleList(rules).some((rule) => {
    const expression = createRuleRegex(rule);
    return expression ? expression.test(haystack) : false;
  });
}

export function shouldCaptureRequest(params, preferences) {
  const normalizedPreferences = normalizeCapturePreferences(preferences);
  const resourceType = normalizeResourceType(params?.type);
  const url = params?.request?.url || params?.url || "";

  if (!normalizedPreferences.resourceTypes[resourceType]) {
    return false;
  }

  if (
    normalizedPreferences.includeRules.length > 0 &&
    !matchesUrlRules(url, normalizedPreferences.includeRules)
  ) {
    return false;
  }

  if (
    normalizedPreferences.excludeRules.length > 0 &&
    matchesUrlRules(url, normalizedPreferences.excludeRules)
  ) {
    return false;
  }

  return true;
}

export function shouldCaptureResponseBody(entry, preferences) {
  const normalizedPreferences = normalizeCapturePreferences(preferences);
  if (normalizedPreferences.captureBinaryBodies) {
    return true;
  }

  return TEXT_RESPONSE_RESOURCE_TYPES.has(normalizeResourceType(entry?.resourceType));
}

export function summarizeEnabledResourceTypes(preferences, maxVisible = 4) {
  const normalizedPreferences = normalizeCapturePreferences(preferences);
  const enabled = RESOURCE_TYPE_OPTIONS
    .filter((option) => normalizedPreferences.resourceTypes[option.key])
    .map((option) => option.label);

  if (enabled.length === 0) {
    return "还没启用任何类型";
  }

  if (enabled.length <= maxVisible) {
    return enabled.join("、");
  }

  return `${enabled.slice(0, maxVisible).join("、")} +${enabled.length - maxVisible}`;
}

export function normalizeHeaders(headers) {
  if (!headers) {
    return [];
  }

  if (Array.isArray(headers)) {
    return headers
      .filter((header) => header && header.name)
      .map((header) => ({
        name: String(header.name),
        value: header.value == null ? "" : String(header.value),
      }));
  }

  return Object.entries(headers).map(([name, value]) => ({
    name,
    value: value == null ? "" : String(value),
  }));
}

export function headerValue(headers, targetName) {
  const lower = targetName.toLowerCase();
  const match = headers.find((header) => header.name.toLowerCase() === lower);
  return match ? match.value : "";
}

export function normalizeBodyPayload(payload) {
  if (!payload || typeof payload.text !== "string") {
    return null;
  }

  const originalLength = payload.text.length;
  const truncated = originalLength > BODY_TEXT_LIMIT;

  return {
    text: truncated ? payload.text.slice(0, BODY_TEXT_LIMIT) : payload.text,
    base64Encoded: Boolean(payload.base64Encoded),
    truncated,
    originalLength,
  };
}

export function safeIsoDateFromWallTime(wallTimeSeconds) {
  if (typeof wallTimeSeconds !== "number") {
    return new Date().toISOString();
  }

  return new Date(wallTimeSeconds * 1000).toISOString();
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function queryStringToPairs(url) {
  try {
    const parsed = new URL(url);
    return Array.from(parsed.searchParams.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  } catch {
    return [];
  }
}

export function serializeErrorMessage(error) {
  if (!error) {
    return "发生了未知错误";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}
