# Site du mariage — image unique : site statique + API des réponses + admin
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    CONFIG_DIR=/config \
    DATA_DIR=/data \
    TZ=Europe/Paris

RUN apk add --no-cache tzdata

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY app ./app
COPY site ./site
COPY exemple /config-exemple

# Dossiers montés depuis l'hôte : /config (contenu.json, images/) et /data (base des réponses)
RUN mkdir -p /config /data && chown -R node:node /config /data
USER node

EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "app/server.js"]
