# Running FD Tone Notify in Docker

This is the operational guide for the `Dockerfile` / `docker-compose.yml` in
the repo root. For the HTTP API contract (routes, auth, the detection
webhook), see [docs/api.md](./api.md).

## What the image runs

The image's `CMD` is `node index.js --legacy --web-server --port 3000`.
Despite the name, `--legacy` is the actual 2.0 backend entrypoint - it's the
same command the 2.0 "manager" system itself spawns as the real backend
process (`manager/process-manager.js` `startBackend()`), and `index.js`
requires `--legacy` to be set for `--web-server` to be accepted at all (see
`validateOptions()` in `index.js`). The "manager" wrapper (`bin/manager.js`)
additionally spawns a Vite UI *dev* server, which only matters for local
development - this image instead builds the Vue UI once at image build time
and serves it as static files from the backend itself (see below).

The backend always serves **HTTPS** with a self-signed certificate it
generates on first boot (`util/ssl-manager.js`, via the `openssl` CLI) -
there is no plain-HTTP mode for the main API. `curl` examples below use `-k`
to skip certificate verification.

## Build

```bash
docker build -t fdtn:latest .
```

or with Compose:

```bash
docker compose build
```

This is a two-stage build: stage 1 (`ui-builder`) runs `npm ci && npm run
build` in `user-interface/` (Vite outputs to `user-interface/dist`, per
`user-interface/vite.config.js`'s `build.outDir`); stage 2 copies that
`dist/` output into `server/public/`, which is exactly the directory the
backend serves statically (`server/index.js`:
`app.use('/', express.static(path.join(__dirname, './public')))`). If you
ever change where the backend serves static files from, update the
`COPY --from=ui-builder /ui/dist/ ./server/public/` line in the `Dockerfile`
to match.

## First run

Config (detector config, secrets, the generated SSL certificate) lives at
`/app/config` inside the container, and recordings at `/app/recordings` -
both are declared `VOLUME`s so they survive container recreation/upgrades.

**Named volumes** (`docker volume create`, or letting Compose create them)
are auto-seeded by Docker from the image's baked-in `/app/config` the first
time the volume is created - nothing else to do.

**Bind mounts** to a local directory (what `docker-compose.yml` in this repo
uses, so `./config` and `./recordings` are plain folders you can edit/browse
directly) are **not** auto-seeded - Docker only ever hides the image's
existing directory contents behind an empty host folder. Seed it once before
first start:

```bash
mkdir -p config recordings
docker run --rm -v "$(pwd)/config:/target" fdtn:latest \
  sh -c "cp -rn /app/config/. /target/"
```

(`cp -rn` never overwrites existing files, so re-running this later - e.g.
after pulling a new image - is always safe and only adds files you don't
already have.)

Then create your secrets file from the template it just seeded:

```bash
cp config/secrets.template.json config/secrets.json
```

`config/secrets.template.json`'s `UI_PASSWORD_HASH` is the bcrypt hash of
`admin123` - the default UI login is **admin / admin123**. Change it before
exposing the container (see "Changing the UI password" below).

Now start it:

```bash
docker compose up -d
```

or without Compose:

```bash
docker run -d --name fdtn -p 3000:3000 \
  -v "$(pwd)/config:/app/config" \
  -v "$(pwd)/recordings:/app/recordings" \
  --env-file .env \
  fdtn:latest
```

## First login

Open `https://localhost:3000/` (accept the self-signed certificate warning)
and log in with `admin` / `admin123`.

Over the API directly (see [docs/api.md](./api.md) for the full contract):

```bash
curl -k https://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"admin123"}'
```

The "token" returned is just the password again - there's no session/JWT
here, so every subsequent request sends `Authorization: Bearer <password>`
directly.

### Changing the UI password

```bash
docker compose exec fdtn node -e \
  "console.log(require('bcrypt').hashSync(process.argv[1], 10))" -- 'your-new-password'
```

Put the printed hash into `config/secrets.json`'s `UI_PASSWORD_HASH`, then
restart the container (`docker compose restart fdtn`, or
`POST /api/system/restart` - see docs/api.md) - config file changes are
picked up on process start, not live.

## Where config lives

| Path (in container) | What | Persisted via |
|---|---|---|
| `/app/config/default.json` (or `config/<NODE_ENV>.json`) | Detector config, audio/recording/notification defaults | `/app/config` volume |
| `/app/config/secrets.json` | `FD_*` secrets (Pushbullet key, SMTP creds, `UI_PASSWORD_HASH`, `FD_RDIO_API_KEY_HASH`, `FD_DETECTION_WEBHOOK_SECRET`, ...) | `/app/config` volume |
| `/app/config/local.json` | **Shipped by this image**, disables live microphone capture (`{"audio":{"disabled":true}}`) - see "Live audio" below | `/app/config` volume |
| `/app/config/ssl/` | Self-signed cert/key, generated on first boot | `/app/config` volume |
| `/app/recordings/` | Captured call audio | `/app/recordings` volume |

Edit `config/default.json` (or `config/secrets.json`) on the host, then
restart the container to apply changes - or use `PUT /api/config` /
`POST|PUT|DELETE /api/detectors` over the API, which write to the same
files (see docs/api.md).

### Environment variables and secrets

Anything under `env_file: .env` (Compose) or `--env-file .env` (`docker
run`) sets `FD_*` config overrides and secrets - see `.env.template` in the
repo root for the full list, and `config/custom-environment-variables.js`
for how each `FD_*` name maps to a config path. `FD_DETECTION_WEBHOOK_URL`,
`FD_DETECTION_WEBHOOK_SECRET`, `FD_RDIO_API_KEY_HASH`, and
`UI_PASSWORD_HASH` can be set either way - as an env var, or as a key in
`config/secrets.json` (loaded the same way, see `util/config.secrets.js`).
Env vars win if both are set.

### Live audio (microphone) in a container

`config/default.json`'s `audio.disabled` is `false` by default, which makes
the backend try to spawn `arecord` for live microphone input on startup -
containers have no sound device by default, and that crashes the process.
This image ships `/app/config/local.json` with `{"audio":{"disabled":true}}`
(node-config's standard override file, merged on top of `default.json`) so
a fresh, headless deployment (API + Rdio Scanner ingestion only) just works.
If you *have* mounted a real capture device (e.g. `--device /dev/snd` plus
ALSA userspace tools you install yourself - not present in this image).
delete `config/local.json` or set `"disabled": false` in it.

## Pointing Rdio Scanner / SDRTrunk / Thin Line Radio at this container

FD Tone Notify implements the Rdio Scanner call-upload API at
`POST /api/call-upload` (full request/response shape in
[docs/api.md](./api.md#post-apicall-upload)). Point any of the following at
it as if it were an Rdio Scanner server:

- **Rdio Scanner's own "downstream" forwarding**: set the downstream URL to
  `https://<host>:3000/api/call-upload` and the downstream API key to the
  plaintext key you hashed below.
- **SDRTrunk's Rdio Scanner broadcaster**: URL
  `https://<host>:3000/api/call-upload`, API Key = the plaintext key.
  SDRTrunk sends a connectivity probe on save/start (no audio file, just a
  key/talkgroup check) - the endpoint replies `417` if no talkgroup was
  supplied (this is the expected "I'm alive" response SDRTrunk itself checks
  for) and `200` otherwise.
- **Thin Line Radio's uploader**: same URL and key, configured wherever it
  exposes an "Rdio Scanner compatible upload endpoint" setting.

If your scanner software can't do HTTPS / can't accept a self-signed
certificate, set `FD_INSECURE_HTTP_RDIO_CALL_UPLOAD_PORT` (e.g. `8080`) -
this starts a **second, plain-HTTP** server that serves *only*
`/api/call-upload`, nothing else. Publish that port too
(`-p 8080:8080` / add it to `docker-compose.yml`'s `ports:`), and use
`http://<host>:8080/api/call-upload` instead. Only do this on a trusted
network - it's unencrypted.

### Setting the Rdio API key

The call-upload endpoint checks the request's `key` field against a
bcrypt-hashed secret in `FD_RDIO_API_KEY_HASH`
(`server/middleware/rdio-auth.middleware.js`). **If it's unset, the endpoint
accepts every request unauthenticated** (logged as a warning) - set it
before exposing this port to anything but a trusted network.

Generate a hash the same way as the UI password:

```bash
docker compose exec fdtn node -e \
  "console.log(require('bcrypt').hashSync(process.argv[1], 10))" -- 'your-rdio-api-key'
```

Put the printed hash into `config/secrets.json` as `FD_RDIO_API_KEY_HASH`
(or set the `FD_RDIO_API_KEY_HASH` env var directly to the hash - not the
plaintext key), restart the container, and configure your scanner software
with the **plaintext** key you started from.

## Detection webhook

To have FDTN push every detection to your own control plane instead of (or
in addition to) polling `GET /api/detections`, set in `.env` or
`config/secrets.json`:

```
FD_DETECTION_WEBHOOK_URL=https://your-control-plane.example.com/webhooks/fdtn
FD_DETECTION_WEBHOOK_SECRET=<a long random string>
```

Full payload shape, headers, and HMAC verification example:
[docs/api.md](./api.md#system-wide-detection-webhook).

## Verifying the container is healthy

```bash
docker compose ps        # HEALTHCHECK status
curl -k https://localhost:3000/api/health
```

The `HEALTHCHECK` in the `Dockerfile` probes `/api/health` with `curl -k`
every 30s (60s grace period on start, to allow the SSL certificate and UI
config to initialize).

## Known limitations

- The image is built for the platform you build it on. For multi-arch (e.g.
  building an amd64 image on Apple Silicon for a Raspberry Pi/ARM host), use
  `docker buildx build --platform linux/amd64,linux/arm64 ...`.
