FROM node:24.17.0-bookworm-slim

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node src/ ./src/
COPY --chown=node:node scripts/ ./scripts/
USER node
CMD ["node", "src/index.mjs"]
