# Technical Design

## Goals

- Capture browser traffic from the current tab with `chrome.debugger`
- Normalize request lifecycle data into a stable internal model
- Filter capture scope by resource type and URL rules
- Let engineers inspect payloads before export
- Support `JSON` and `HAR` export without a build step

## Non-goals

- No request replay in this phase
- No auth secret masking in this phase
- No cross-tab orchestration in this phase
- No advanced search, diff, or rule engine in this phase

## Runtime model

### 1. Popup

The popup is only a control surface:

- discover active tab
- start recording
- stop recording
- show current capture scope summary
- open the recorder page

It never owns request data.

### 2. Background service worker

The service worker owns the recording lifecycle:

- attach and detach `chrome.debugger`
- subscribe to `Network.*` events
- correlate events by `tabId + requestId`
- pull request / response bodies through the debugger protocol
- persist a lightweight session snapshot into `chrome.storage.session`

### 3. Recorder page

The recorder page is the operator UI:

- render session metadata
- edit capture preferences in a collapsed settings section
- search the request list
- filter existing captured results by resource type without changing stored session data
- move shortlisted packets into an export queue
- delete unwanted captured packets directly from the session
- open request / response detail in a drawer
- select items for export
- transform export data into JSON or HAR

## Capture preferences

The recorder keeps a persisted capture preference object:

- `resourceTypes`: booleans for `Document`, `XHR`, `Fetch`, `Script`, `Stylesheet`, `Image`, `Font`, `Media`, `Manifest`, `WebSocket`, `EventSource`, `Other`
- `includeRules`: URL rules that must match first when present
- `excludeRules`: URL rules that cut out known noise
- `captureBinaryBodies`: whether binary-like responses should fetch body content

Rules are evaluated as case-insensitive wildcard patterns, one per line.

## Normalized entry shape

```json
{
  "sessionId": "tab-123",
  "entryId": "123:request-42",
  "tabId": 123,
  "requestId": "request-42",
  "resourceType": "XHR",
  "method": "POST",
  "url": "https://example.com/api/login",
  "status": 200,
  "statusText": "OK",
  "startedDateTime": "2026-03-27T08:00:00.000Z",
  "durationMs": 281,
  "requestHeaders": [],
  "responseHeaders": [],
  "requestBody": {
    "text": "{\"foo\":\"bar\"}",
    "base64Encoded": false,
    "truncated": false
  },
  "responseBody": {
    "text": "{\"ok\":true}",
    "base64Encoded": false,
    "truncated": false
  }
}
```

## Key protocol events

- `Network.requestWillBeSent`
- `Network.requestWillBeSentExtraInfo`
- `Network.responseReceived`
- `Network.responseReceivedExtraInfo`
- `Network.loadingFinished`
- `Network.loadingFailed`

## Export strategy

The system stores normalized JSON first, then derives HAR on demand.

Why:

- the normalized model is easier to debug
- it maps better to LLM prompting
- HAR transformation becomes a pure export concern
- future exporters can reuse the same capture model

## Data retention strategy

Because MV3 service workers can be suspended, the recorder writes session snapshots into `chrome.storage.session`.

To keep the snapshot small enough:

- only tracked resource types are stored
- only requests that pass the current resource type and URL rules are stored
- export queue membership is stored with the session so operators can shortlist packets progressively
- request and response bodies are truncated after a configured threshold
- metadata is normalized into compact arrays and scalars

## Error handling

- Failed `attach` or protocol commands are surfaced in popup / recorder state
- Missing bodies are stored as `null` instead of breaking export
- When `getResponseBody` or `getRequestPostData` fails, the entry still remains exportable

## Planned evolution path

1. Stabilize capture quality and export shape
2. Add search / filters / field copy helpers
3. Add replay-oriented export presets
4. Add masking / security policies
5. Add multi-tab or workspace sessions
