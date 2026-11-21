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
    PRENOM_MARIEE=Léa \
    TEMOINS_MARIE="" \
    TEMOINS_MARIEE=""
# Modèle de configuration : l'image nginx y insère les variables d'environnement au démarrage
COPY templates /etc/nginx/templates
COPY public /usr/share/nginx/html
COPY --from=vendor /out /usr/share/nginx/html/vendor
# Numéro de version ajouté aux liens CSS/JS des pages (?v=…) : après une mise à jour, navigateurs et caches
# (y compris « Cache Assets » de Nginx Proxy Manager) chargent forcément les nouveaux fichiers.
RUN cd /usr/share/nginx/html \
 && V="$(find . -path ./vendor -prune -o -type f \( -name '*.css' -o -name '*.js' \) -exec md5sum {} + | sort | md5sum | cut -c1-10)" \
 && find . -path ./vendor -prune -o -name '*.html' -type f -exec sed -i -E \
      "s#(href|src)=\"((/(css|js|admin|acces|jeux|dormir-sur-place)/[^\"?:]*|[a-z0-9-]+)\.(css|js))\"#\1=\"\2?v=$V\"#g" {} + \
 && grep -q "/js/app.js?v=$V" index.html && grep -q "/admin/admin.css?v=$V" admin/index.html \
 && echo "Version des fichiers : $V"
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
