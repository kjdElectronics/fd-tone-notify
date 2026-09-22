# FD Tone Notify - HTTP API Reference

This document is the contract for anything that talks to FD Tone Notify only
over HTTP - most importantly a hosted control plane running FDTN as a black
box (e.g. in Docker, see [docs/docker.md](./docker.md)). It lists every route
mounted in `server/routes/router.js`, the system-wide detection webhook
contract, and known gaps/bugs a client should be aware of.

All routes below are relative to the backend's base URL, e.g.
`https://<host>:3000`. The backend serves HTTPS with a self-signed
certificate by default (`util/ssl-manager.js`) - HTTP clients must either
trust that certificate or skip verification (`curl -k`, `rejectUnauthorized:
false`, etc.). If `FD_INSECURE_HTTP_RDIO_CALL_UPLOAD_PORT` is set, a second,
plain-HTTP server is started that serves **only** `POST /api/call-upload` on
that port - see [Rdio Scanner call-upload](#post-apicall-upload) below.

## Authentication

Three schemes are in use, and most routes accept the first two
interchangeably:

- **UI session** (`server/auth/sessions.js`, `server/middleware/auth.middleware.js`):
  `POST /api/auth/login` exchanges the UI password for a random, opaque
  session token (an in-memory session, 24h TTL - **not** the password, and
  **not** a JWT; it doesn't survive a backend restart and isn't shared
  across instances). Send it as `Authorization: Bearer <token>` (or just
  `Authorization: <token>`). A session satisfies every scope below - this is
  what the Vue UI itself uses, and it hasn't changed.
- **API keys with scopes** (`server/auth/apiKeys.js`): a key looks like
  `fdtn_<keyId>.<secret>` and carries one or more scopes - `admin`, `read`,
  or `ingest`. Send it the same way, `Authorization: Bearer fdtn_...`. Only
  `sha256(secret)` is ever persisted (`config/secrets.json`'s `apiKeys`
  array), compared with a constant-time comparison; the full key is
  returned exactly once, at creation time (`POST /api/keys`), and is not
  recoverable after that. An `admin`-scoped key satisfies every scope.
  Manage keys with `GET/POST/DELETE /api/keys` (below) - those routes
  themselves require `admin` scope or a UI session.
- **Rdio Scanner key auth** (`server/middleware/rdio-auth.middleware.js`):
  only applies to `POST /api/call-upload`, which Rdio Scanner's wire format
  can't put a bearer token on. It accepts either an `ingest`- or
  `admin`-scoped API key, or the legacy bcrypt-hashed shared secret
  (`FD_RDIO_API_KEY_HASH`), both in the multipart form's `key` field. See
  that route's section.

The default password shipped in `config/secrets.template.json` is
`admin123` for the username `admin` (checked against the bcrypt hash in
`UI_PASSWORD_HASH` - `config/secrets.json`, or the `UI_PASSWORD_HASH` env
var/secret) - **change it before exposing the API**.

Routes below are marked **Auth: none**, **Auth: read** (UI session or a
`read`/`admin`-scoped key), **Auth: admin** (UI session or an
`admin`-scoped key), or **Auth: Rdio key** (see above).

> Deviation from earlier 2.0 builds: `authenticate()` no longer accepts the
> raw UI password directly as a bearer token. That only ever worked because
> `POST /api/auth/login`'s "token" used to literally be the password; now
> that login returns a real session token, sending the password itself is
> rejected (401) - call `/login` for a session, or use an API key.

## Routes

### `GET /api/health`

**Auth: none.**

Liveness/readiness probe (this is what the Dockerfile's `HEALTHCHECK` calls).

```json
{
  "success": true,
  "service": "fd-tone-notify-api",
  "timestamp": "2025-01-15T10:30:45.123Z",
  "version": "0.1.0"
}
```

### `POST /api/auth/login`

**Auth: none.**

Request: `{ "password": "admin123" }`

Response (200): `{ "success": true, "token": "<random opaque session token>", "message": "Authentication successful" }`
Response (401): `{ "success": false, "error": "Invalid password" }`

The returned `token` is a random session token (`server/auth/sessions.js`,
24h TTL, in-memory only), not the password.

### `GET /api/config`

**Auth: read.**

Returns the full contents of the active config file (`config/<NODE_ENV>.json`,
`default.json` unless `NODE_ENV` is set) plus non-sensitive secrets
(`UI_PASSWORD_HASH` is stripped from the response).

```json
{
  "success": true,
  "configuration": { "audio": { ... }, "detection": { "detectors": [ ... ] }, ... },
  "secrets": { "FD_PUSHBULLET_API_KEY": "...", "...": "..." },
  "configFile": "/app/config/default.json",
  "secretsFile": "/app/config/secrets.json",
  "lastModified": "2025-01-15T10:30:45.123Z"
}
```

### `PUT /api/config`

**Auth: admin.**

Updates a fixed set of `FD_*`-named fields (see
`server/controllers/config.controller.js` `updateConfigFromData()` /
`updateSecretsFromData()` for the exact allow-list) against `audio`,
`recording`, `detection`, `email`, `coralogix` config sections and the
secrets file. It does **not** accept arbitrary nested JSON - only the flat
`FD_*` keys that function recognizes.

Request: `{ "configuration": { "FD_SAMPLE_RATE": "48000", "FD_EMAIL_FROM": "alerts@example.com" } }`

Response (200): `{ "success": true, "message": "Configuration updated successfully", "timestamp": "...", "updatedKeys": ["FD_SAMPLE_RATE", "FD_EMAIL_FROM"] }`

`restartBackend: true` in the body is accepted but currently a no-op (logged,
not implemented).

### `GET /api/detectors`

**Auth: read.**

```json
{ "success": true, "detectors": [ { "id": "6f8...", "name": "Engine 1", "tones": [911, 2938], "...": "..." } ], "count": 1, "timestamp": "..." }
```

### `GET /api/detectors/:id`

**Auth: read.**

`:id` is the detector's stable UUID `id` (see [Stable detector ids](#stable-detector-ids)
below). For backwards compatibility, if no detector's `id` matches, `:id` is
retried as a numeric array index into `detection.detectors[]`.

Response (200): `{ "success": true, "detector": { "id": "6f8...", "name": "Engine 1", "...": "..." }, "timestamp": "..." }`
Response (404): `{ "success": false, "error": "Detector not found", "details": "..." }`

### `POST /api/detectors`

**Auth: admin.**

Creates a detector. The server always assigns the `id` (any `id` in the
request body is ignored) and applies defaults for any omitted field (see
`applyDefaults()` in `server/controllers/detector.controller.js`).

Request (minimum): `{ "name": "Engine 1", "tones": [911, 2938] }`

Response (200): `{ "success": true, "message": "Detector created successfully", "detector": { "id": "<new uuid>", "name": "Engine 1", "tones": [911, 2938], "...": "..." }, "timestamp": "..." }`
Response (400): validation error (duplicate name, bad tone frequency, invalid email in `notifications`, etc.) - `{ "success": false, "error": "Validation failed", "details": ["..."] }`

### `PUT /api/detectors/:id`

**Auth: admin.**

Same `:id` resolution as `GET /api/detectors/:id` (UUID first, numeric index
fallback). Merges the request body onto the existing detector (missing
fields keep their current value); the detector's `id` is always preserved
from the URL, not the body. A detector found by numeric index that never had
an `id` is assigned one as part of this update.

Response (200): `{ "success": true, "message": "Detector updated successfully", "detector": { "...": "..." }, "timestamp": "..." }`
Response (404): `{ "success": false, "error": "Detector not found" }`

### `DELETE /api/detectors/:id`

**Auth: admin.**

Same `:id` resolution. Response (200): `{ "success": true, "message": "Detector deleted successfully", "deletedDetector": { "...": "..." } }`

### `POST /api/detect-tones`

**Auth: none** (this endpoint is intentionally open - see Deviations in the
project's PR/commit history; treat it as trusted-network-only, same caveat
as the Rdio insecure HTTP port).

`multipart/form-data` upload for one-off tone detection against an audio
file, without touching the persisted config.

Form fields:
- `file` (required): WAV or MP3 audio file
- `enableNotifications` (optional, default `false`): boolean
- `detectors` (optional): JSON array of detector configs overriding
  `config.detection.detectors` for this request only
- `matchThreshold`, `tolerancePercent` (optional): global overrides

```json
{
  "success": true,
  "requestId": "6f8e...",
  "processed": "2025-01-15T10:30:45.123Z",
  "filename": "uploaded-file.wav",
  "duration": "00:04.474",
  "durationSeconds": 4.474,
  "detections": [
    {
      "detector": "Fire Station 1",
      "tones": [567, 378],
      "timestamp": "00:01.250",
      "timestampSeconds": 1.25,
      "matchAverages": [567.2, 378.1],
      "message": "Fire Station 1 tone detected"
    }
  ]
}
```

### `GET /api/detections`

**Auth: read.** (Previously unauthenticated - see "Deviation" note above;
now requires a UI session or a `read`/`admin`-scoped API key.)

Recent detections from the in-memory detection store (mic, file, and Rdio
detections all land here - capacity and TTL are set in
`server/detection-store.js`).

Query: `limit` (default 50, max 50).

```json
{
  "success": true,
  "detections": [ { "id": "det_...", "type": "configured", "timestamp": "...", "detector": { "name": "Fire Station 1", "type": "configured" }, "tones": [567, 378], "...": "..." } ],
  "meta": { "count": 25, "limit": 50, "oldestTimestamp": "...", "newestTimestamp": "..." }
}
```

### `POST /api/notifications/test`

**Auth: admin.**

Body: `{ "testAll": true }` to test every configured notification for every
detector, or `{ "detectorName", "trigger": "preRecording"|"postRecording",
"type": "pushbullet"|"webhooks"|"externalCommands"|"emails", "index": 0 }`
to test one specific notification.

### `GET /api/system/status`

**Auth: read.** Process uptime/memory/PID/Node version/env.

### `POST /api/system/restart`

**Auth: admin.** Spawns `bin/restart-helper.js` and gracefully shuts
the backend down for it to relaunch (with `--legacy --web-server`, plus
`--port`/`--instance-name`/`--recording-directory` if those were set on the
current process - `index.js` requires `--legacy` for `--web-server` to be
accepted at all, see `validateOptions()`).

### `POST /api/system/stop`

**Auth: admin.** Gracefully shuts the backend down; nothing restarts
it unless the process supervisor does (e.g. Docker's `restart: unless-stopped`).

### `GET /api/keys`

**Auth: admin.**

List API keys. Never includes hashes or plaintext secrets.

```json
{ "success": true, "keys": [ { "id": "a1b2c3d4e5f60718", "name": "Control Plane", "scopes": ["admin"], "createdAt": "2025-01-15T10:30:45.123Z", "lastUsedAt": "2025-01-15T11:00:00.000Z" } ] }
```

### `POST /api/keys`

**Auth: admin.**

Creates a new API key. **The full plaintext key is only ever returned in
this response** - only `sha256(secret)` is persisted, so it cannot be
recovered later; if it's lost, delete the key and create a new one.

Request: `{ "name": "Control Plane", "scopes": ["admin"] }` (`scopes` is a
non-empty array of `"admin"`, `"read"`, `"ingest"`)

Response (201): `{ "success": true, "key": { "id": "a1b2c3d4e5f60718", "name": "Control Plane", "scopes": ["admin"], "createdAt": "...", "key": "fdtn_a1b2c3d4e5f60718.<48 hex chars>" } }`
Response (400): `{ "success": false, "error": "..." }` (missing `name`, or `scopes` isn't a non-empty array of valid scopes)

### `DELETE /api/keys/:id`

**Auth: admin.**

Revokes a key by its `id` (not the full key) immediately.

Response (200): `{ "success": true, "message": "API key deleted" }`
Response (404): `{ "success": false, "error": "API key not found" }`

### `POST /api/call-upload`

**Auth: Rdio key** (`server/middleware/rdio-auth.middleware.js`).

Rdio Scanner-compatible call-upload endpoint. Point an Rdio Scanner
downstream, SDRTrunk's Rdio Scanner broadcaster, or Thin Line Radio's
uploader at this URL. This is also the one route additionally exposed on a
**plain HTTP** port when `FD_INSECURE_HTTP_RDIO_CALL_UPLOAD_PORT` is set
(for scanner hardware/software that can't do HTTPS) - see docs/docker.md.

`multipart/form-data` fields (standard Rdio Scanner call-upload payload):
`key`, `audio` (the call's audio file), `dateTime`, `talkgroup`,
`talkgroupLabel` (used to match against each detector's `talkgroupFilter`),
`talkgroupGroup`, `talkgroupTag`, `system`, `systemLabel`, `source`,
`frequency`.

`key` is checked two ways, in order:

1. A scoped API key (`fdtn_<id>.<secret>`, `ingest` or `admin` scope -
   create one via `POST /api/keys`). This is the current, preferred way to
   authenticate an ingest source - it also tags the resulting detections
   with the key's `id`/`name` as a `sourceId`/`sourceName` (see
   [Per-source ingest keys](#per-source-ingest-keys) below).
2. If `key` isn't one of those, the legacy shared secret: checked against
   the bcrypt hash in `FD_RDIO_API_KEY_HASH`. If `FD_RDIO_API_KEY_HASH` is
   unset, the endpoint allows all requests unauthenticated (logged as a
   warning) - set it, or require an API key instead, before exposing this
   route.

Response: `200 "Call imported successfully"` on success (also on a
talkgroup with no matching detector, and on SDRTrunk's connectivity probe
when it includes a talkgroup); `417` on SDRTrunk's connectivity probe when
it has no talkgroup (this is the response SDRTrunk expects to confirm
connectivity, not a real error); `400`/`401`/`403`/`500` JSON error bodies
otherwise (`403` for a well-formed API key that lacks `ingest`/`admin`
scope).

---

## System-wide detection webhook

Unlike the routes above, this is an **outbound** webhook FDTN calls, not a
route it serves - the single integration point for learning about
detections without polling `GET /api/detections`.

### Configuration

Set both as env vars, or via `config/secrets.json` (loaded the same way as
every other `FD_*` secret - see `util/config.secrets.js` /
`config/secrets.template.json`):

| Variable | Required | Description |
|---|---|---|
| `FD_DETECTION_WEBHOOK_URL` | No | If unset (or empty), the webhook is a no-op - nothing is ever sent. |
| `FD_DETECTION_WEBHOOK_SECRET` | No | HMAC signing secret. If unset, an empty string is used as the HMAC key (the signature is still sent, just with a predictable key - set a real secret). |

### When it fires

On **every** tone detection from a configured detector - live microphone
audio, `POST /api/detect-tones` file uploads, and Rdio Scanner call-upload
ingestion alike (`service/DetectionService.js`, the single dispatch point
all three paths share). It fires once per detection, **independent of**
whether that detector or the detection service has any per-detector
notifications (Pushbullet/email/webhook/external command) configured -
those are a separate system this does not replace.

It does **not** fire for the "All Tone Detector" / discovery mode
(`service/AllToneDetectionService.js`'s `multiToneDetected` event) - that
mode has no stable detector identity and is meant for interactively finding
tones to configure, not for a control plane to consume.

It is fire-and-forget: dispatch never blocks or delays tone detection, and a
webhook outage can never crash the detection pipeline.

### Request

`POST` to `FD_DETECTION_WEBHOOK_URL` with a 5 second timeout. On a network
error or a 5xx response, it is retried exactly once after a 2 second delay;
a 4xx response is not retried (the request itself is wrong - retrying it
would just fail the same way again). If both attempts fail, the failure is
logged at `warn` and swallowed.

Headers:

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-FDTN-Event` | `detection` |
| `X-FDTN-Timestamp` | Unix epoch **milliseconds**, as a string, of when this specific request was sent (changes between the initial attempt and the retry) |
| `X-FDTN-Signature` | `sha256=<hex HMAC-SHA256>` - see below |

Signature: `X-FDTN-Signature` is
`sha256=` + `hex(HMAC_SHA256(secret, "<X-FDTN-Timestamp value>." + <exact JSON body bytes>))`.
To verify: read `X-FDTN-Timestamp` and the raw request body exactly as
received (don't re-serialize the parsed JSON - re-stringifying can produce
different bytes), recompute the HMAC the same way, and compare.

Body (`application/json`):

```json
{
  "event": "detection",
  "detectorId": "6f8e2c3a-....",
  "detectorName": "Engine 1",
  "tones": [911, 2938],
  "matchAverages": [909.5, 2932.6],
  "timestamp": "2025-01-15T10:30:45.123Z",
  "source": {
    "type": "mic",
    "epochBaseSeconds": 1712754541,
    "talkgroup": { "id": "1001", "label": "Fire Dispatch", "group": null, "tag": null, "system": null, "systemLabel": null, "source": null, "frequency": null }
  },
  "recordingRelativePath": "1712754541123-Engine 1.wav",
  "fdtnVersion": "0.1.0"
}
```

Field notes:
- `detectorId`: the detector's stable `id` (see below). Will be `undefined`/
  absent if the detector configuration predates ids being assigned and
  hasn't been touched via `GET/PUT/DELETE /api/detectors/:id` or
  `GET/PUT /api/config` yet (those self-heal missing ids on read - see
  below). Once assigned, it is stable across restarts.
- `source.type` is `"mic"` (live audio), `"file"` (an API file upload, or
  the CLI's `--detect-from-files`), or `"rdio"` (Rdio Scanner ingestion).
- `source.epochBaseSeconds` / `source.talkgroup` are only present for
  `"rdio"` sources - they carry whatever `obj/SourceContext.js` recorded
  from the Rdio call metadata (`dateTime`, `talkgroup`, `talkgroupLabel`,
  `talkgroupGroup`, `talkgroupTag`, `system`, `systemLabel`, `source`,
  `frequency`).
- `source.sourceId` / `source.sourceName` are only present for `"rdio"`
  sources authenticated with a scoped API key (not the legacy
  `FD_RDIO_API_KEY_HASH` shared secret) - see
  [Per-source ingest keys](#per-source-ingest-keys).
- `recordingRelativePath` is the filename (relative to
  `FD_RECORDING_DIRECTORY`) the recording **will be** written to, or `null`
  if recording is disabled for that detection. It reflects the intended
  filename at detection time - it is not a guarantee the file has finished
  writing yet.

### Example verification (Node)

```js
const crypto = require('crypto');

function isValidDetectionWebhook(req, secret) {
  const timestamp = req.headers['x-fdtn-timestamp'];
  const signature = req.headers['x-fdtn-signature']; // "sha256=<hex>"
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${req.rawBody}`) // raw bytes, not re-serialized JSON
    .digest('hex');
  return signature === expected;
}
```

---

## Stable detector ids

Every detector in `detection.detectors[]` has a stable `id` (a UUID v4,
`crypto.randomUUID()`). Detectors created via `POST /api/detectors` always
get one. Detectors that predate this feature get one assigned the first
time the config is read through `server/util/config.file.util.js`'s
`readConfigFile()` (which every `/api/config` and `/api/detectors*` route
goes through) - if any detector is missing an `id`, one is generated and
immediately persisted back to the config file, so it's stable from then on.
A quick `GET /api/config` or `GET /api/detectors` after upgrading is enough
to backfill ids for an existing installation.

`detectorId` in the detection webhook payload and in the WebSocket/`toneDetected`
event data (`detectionData.detector.id`) both come from this same `id`.

---

## Per-source ingest keys

An ingest-scoped API key (`ingest` or `admin` scope, `POST /api/keys` - see
[Authentication](#authentication)) used to authenticate
`POST /api/call-upload` carries its own identity through the whole
detection pipeline, distinct from the legacy `FD_RDIO_API_KEY_HASH` shared
secret (which has no per-source identity at all):

- The call's `SourceContext` (`obj/SourceContext.js`) is tagged with
  `sourceId` (the key's `id`) and `sourceName` (the key's `name`).
- Both fields appear in the detection webhook payload's `source` object
  (`source.sourceId`/`source.sourceName`) and in `GET /api/detections` /
  the WebSocket `toneDetected` event's `sourceContext` - wherever
  `source`/`sourceContext` already appears, alongside `talkgroup`.
- A detector can optionally be restricted to specific ingest sources with
  `sources: ["<keyId>", ...]` (`POST`/`PUT /api/detectors`, default `[]`).
  A non-empty `sources` array means the detector only matches Rdio calls
  authenticated with one of those key ids; `[]` (the default) matches
  every source, same as before this feature existed. A call authenticated
  via the legacy shared secret has no `sourceId`, so it never matches a
  source-restricted detector - only ingest-key-authenticated calls can.

Example: two Rdio Scanner instances forwarding to the same FDTN backend,
each with its own key, and a detector that should only fire for one of
them:

```bash
# One ingest key per physical source
curl -sk https://<host>:3000/api/keys -H "Authorization: Bearer <admin key or UI session>" \
  -d '{"name": "Site A Rdio Scanner", "scopes": ["ingest"]}'
# -> {"success":true,"key":{"id":"a1b2c3d4e5f60718", ..., "key":"fdtn_a1b2c3d4e5f60718.<secret>"}}

curl -sk https://<host>:3000/api/keys -H "Authorization: Bearer <admin key or UI session>" \
  -d '{"name": "Site B Rdio Scanner", "scopes": ["ingest"]}'
# -> {"success":true,"key":{"id":"b2c3d4e5f6071829", ..., "key":"fdtn_b2c3d4e5f6071829.<secret>"}}
```

Configure each Rdio Scanner instance's downstream API key to the
corresponding `fdtn_...` key, then restrict a detector to Site A only:

```json
{ "name": "Site A Only", "tones": [850, 950], "sources": ["a1b2c3d4e5f60718"] }
```

## Known gaps for a control plane to be aware of

- `PUT /api/config` only accepts a fixed, flat set of `FD_*` keys, not the
  full nested JSON shape `GET /api/config` returns.
- `POST /api/detect-tones` is unauthenticated by design in the current
  implementation (treat it as trusted-network-only). `GET /api/detections`
  now requires `read` scope (see "Deviation" note under Authentication).
- UI sessions are in-memory only (`server/auth/sessions.js`) - they reset on
  every backend restart and aren't shared across instances. A
  multi-instance control-plane deployment should prefer API keys (which
  persist in `config/secrets.json`) over UI sessions for anything that
  needs to survive a restart.
