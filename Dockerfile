# FD Tone Notify - Docker image
#
# See docs/docker.md for build/run instructions, first-login, where config
# lives, and how to point Rdio Scanner / SDRTrunk / Thin Line Radio at this
# container's call-upload endpoint.
#
# Two stages:
#   1. ui-builder - builds the Vue UI (user-interface/) into static assets
#   2. runtime    - the actual backend process, serving the API and the
#                    built UI as static files (see server/index.js's
#                    express.static(PUBLIC_PATH), PUBLIC_PATH = server/public)
#
# The command run by this image is the same command the 2.0 "manager" system
# itself spawns as the real backend process (see manager/process-manager.js
# startBackend()): `node index.js --legacy --web-server --port <port>`.
# Despite the name, --legacy is the actual 2.0 backend entrypoint - it is
# required for --web-server to be accepted (see index.js validateOptions()).
# The "manager" wrapper (bin/manager.js) additionally spawns a Vite UI dev
# server, which is a development-only concern and is intentionally not used
# here since the UI is prebuilt in stage 1 and served statically.

#############################################
# Stage 1: build the Vue UI
#############################################
FROM node:24-bookworm-slim AS ui-builder

WORKDIR /ui

COPY user-interface/package.json user-interface/package-lock.json ./
RUN npm ci

COPY user-interface/ ./
RUN npm run build

#############################################
# Stage 2: runtime
#############################################
FROM node:24-bookworm-slim AS runtime

# ffmpeg: audio conversion for the Rdio Scanner call-upload endpoint and
#         recording/stitching (see server/util/audio.conversion.util.js)
# openssl: the backend generates its own self-signed HTTPS certificate on
#          first boot by spawning the openssl CLI (see util/ssl-manager.js)
# curl: used by the HEALTHCHECK below
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg openssl curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install production Node dependencies only. --ignore-scripts skips the root
# package's postinstall (which installs the Vue UI's *dev* toolchain via
# `cd user-interface && npm install`) - the UI is already built in stage 1
# and copied in below as static files, so none of that is needed here.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Application source (deliberately not `COPY . .` - see .dockerignore and the
# exclusions below; test/, docs/, manager/ and the UI source are not needed
# to run the backend).
COPY index.js ./
COPY bin ./bin
COPY server ./server
COPY service ./service
COPY notifiers ./notifiers
COPY obj ./obj
COPY util ./util
COPY config ./config

# config.audio.disabled defaults to false (config/default.json), which makes
# the backend try to spawn `arecord` for live microphone capture on startup
# and crash (ENOENT) - containers have no sound device by default. local.json
# is node-config's standard override file (merged on top of default.json) and
# is what config/.gitignore-excludes from the repo, so it's baked in here
# instead, disabling live audio for a headless/API+Rdio-only deployment. It's
# part of the seeded /app/config volume (see docs/docker.md) - delete it or
# set "disabled": false if you've mounted a real sound device.
RUN node -e "require('fs').writeFileSync('config/local.json', JSON.stringify({audio:{disabled:true}}, null, 2))"

# Built UI: server/index.js serves server/public as static files
# (`express.static(path.join(__dirname, './public'))`), so the Vue build
# output (user-interface/dist, per user-interface/vite.config.js's
# `build.outDir`) is copied there, overlaying the placeholder
# server/public/index.html. See docs/docker.md.
COPY --from=ui-builder /ui/dist/ ./server/public/

# util/licence.js blocks main() on an interactive "type YES to acknowledge
# the GPL" stdin prompt until a ./license.txt file exists with this exact
# text, which would otherwise hang forever in a detached/headless container
# (no TTY attached to stdin). This image is itself the official GPL-3.0
# distribution of FD Tone Notify, so it bakes in that one-time acknowledgment
# on behalf of the containerized deployment; the full license text ships at
# /app/LICENSE regardless. See docs/docker.md.
COPY LICENSE ./LICENSE
RUN node -e "const {LICENCE} = require('./util/licence'); require('fs').writeFileSync('license.txt', LICENCE);"

# Config (detector config, secrets, generated SSL certs) and recordings are
# meant to persist across restarts/upgrades - see the VOLUME below.
RUN mkdir -p /app/recordings /app/config \
    && groupadd --system fdtn \
    && useradd --system --gid fdtn --home-dir /app --shell /usr/sbin/nologin fdtn \
    && chown -R fdtn:fdtn /app

USER fdtn

EXPOSE 3000

# /app/config holds config/default.json (detector config), config/secrets.json
# and the generated SSL certificate; /app/recordings holds captured audio.
VOLUME ["/app/config", "/app/recordings"]

# The backend always serves HTTPS with a self-signed certificate by default
# (util/ssl-manager.js) - probe it with -k to skip certificate verification.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -kfs https://localhost:3000/api/health || exit 1

CMD ["node", "index.js", "--legacy", "--web-server", "--port", "3000"]
