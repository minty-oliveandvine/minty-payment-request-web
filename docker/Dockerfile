# Development image for minty-payment-request-web (Payment Request, Module 2; Next.js 16).
# Optimized for local dev with hot-reload — source is bind-mounted at runtime
# (see docker/stack/docker-compose.yml in the Minty repo), so we only bake in
# the dependencies here.
# Node 24: what every Vercel project builds with, and what CI uses (.github's next-web.yml)
# - the container runs the app on the runtime it is deployed on.
FROM node:24-alpine

WORKDIR /app

# Install dependencies first so this layer is cached unless the lockfile changes.
# Copy only the manifest + lockfile to maximize cache hits.
COPY package.json package-lock.json ./
RUN npm ci

# App source is bind-mounted over /app at runtime for hot-reload, so we don't
# COPY it here. The bind mount excludes node_modules (see compose) to keep the
# container's installed deps.

# Next.js dev server port (minty-onboarding-web uses 3030).
EXPOSE 3020

# Bound to 0.0.0.0 so the dev server is reachable from the host; the port is the
# host-injected PORT, else 3020 (the same as `npm run dev`). Shell form so
# ${PORT} expands.
CMD npx next dev -H 0.0.0.0 -p ${PORT:-3020}
