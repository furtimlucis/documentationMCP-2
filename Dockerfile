FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm install tsx typescript

COPY index.ts ./
COPY docs ./docs

ENV NODE_ENV=production
ENV TRANSPORT=sse
ENV PORT=3100
ENV DOCS_FOLDER=docs
ENV LANCEDB_PATH=/data/lancedb
ENV SYNC_INTERVAL_MINUTES=60

EXPOSE 3100

# /data/lancedb — mount a persistent volume here so the cache survives restarts
RUN mkdir -p /data/lancedb && chown -R node:node /data

USER node

CMD ["node", "node_modules/tsx/dist/cli.mjs", "index.ts"]
