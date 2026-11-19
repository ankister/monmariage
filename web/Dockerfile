# ---------- Étape 1 : récupération de Leaflet et des polices (hébergés localement) ----------
FROM node:24-bookworm-slim AS vendor
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY scripts ./scripts
RUN sh scripts/vendor.sh /out

# ---------- Étape 2 : serveur Nginx ----------
FROM nginx:1.28-alpine
# Prénoms affichés dans les jeux : valeurs par défaut fictives, à remplacer dans le fichier .env
ENV PRENOM_MARIE=Hugo \
    PRENOM_MARIEE=Léa
# Modèle de configuration : l'image nginx y insère les variables d'environnement au démarrage
COPY templates /etc/nginx/templates
COPY public /usr/share/nginx/html
COPY --from=vendor /out /usr/share/nginx/html/vendor
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
