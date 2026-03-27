import { headerValue, queryStringToPairs } from "./shared.js";

function mapHeaders(headers) {
  return headers.map((header) => ({
    name: header.name,
    value: header.value,
  }));
}

function bodySize(body) {
  if (!body || typeof body.text !== "string") {
    return 0;
  }

  return body.text.length;
}

function toPostData(entry) {
  if (!entry.requestBody || typeof entry.requestBody.text !== "string") {
    return undefined;
  }

  return {
    mimeType: headerValue(entry.requestHeaders, "content-type") || "application/octet-stream",
    text: entry.requestBody.text,
  };
}

function toContent(entry) {
  if (!entry.responseBody || typeof entry.responseBody.text !== "string") {
    return {
      size: 0,
      mimeType: entry.mimeType || "application/octet-stream",
      text: "",
    };
  }

  return {
    size: bodySize(entry.responseBody),
    mimeType: entry.mimeType || headerValue(entry.responseHeaders, "content-type") || "application/octet-stream",
    text: entry.responseBody.text,
    encoding: entry.responseBody.base64Encoded ? "base64" : undefined,
  };
}

function toHarEntry(entry) {
  return {
    startedDateTime: entry.startedDateTime,
    time: entry.durationMs ?? 0,
    request: {
      method: entry.method,
      url: entry.url,
      httpVersion: entry.protocol || "HTTP/1.1",
      headers: mapHeaders(entry.requestHeaders),
      queryString: queryStringToPairs(entry.url),
      cookies: [],
      headersSize: -1,
      bodySize: bodySize(entry.requestBody),
      postData: toPostData(entry),
    },
    response: {
      status: entry.status ?? 0,
      statusText: entry.statusText || "",
      httpVersion: entry.protocol || "HTTP/1.1",
      headers: mapHeaders(entry.responseHeaders),
      cookies: [],
      content: toContent(entry),
      redirectURL: headerValue(entry.responseHeaders, "location") || "",
      headersSize: -1,
      bodySize: bodySize(entry.responseBody),
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: entry.durationMs ?? 0,
      receive: 0,
      ssl: -1,
    },
    serverIPAddress: entry.remoteIPAddress || "",
    _easyApiRecorder: {
      entryId: entry.entryId,
      resourceType: entry.resourceType,
      fromDiskCache: Boolean(entry.fromDiskCache),
      fromServiceWorker: Boolean(entry.fromServiceWorker),
      failed: Boolean(entry.failed),
      errorText: entry.errorText || "",
    },
  };
}

export function createHar(
  entries,
  { title = "Easy API Recorder Session", url = "", capturePreferences = null } = {},
) {
  const startedDateTime = entries[0]?.startedDateTime || new Date().toISOString();

  return {
    log: {
      version: "1.2",
      creator: {
        name: "easy-api-recorder",
        version: "0.1.0",
      },
      pages: [
        {
          id: "page_1",
          title,
          startedDateTime,
          pageTimings: {},
          _easyApiRecorder: {
            sourceUrl: url,
          },
        },
      ],
      _easyApiRecorder: {
        capturePreferences,
      },
      entries: entries.map((entry) => ({
        ...toHarEntry(entry),
        pageref: "page_1",
      })),
    },
  };
}
