#!/bin/sh
# Copie Leaflet et les polices depuis node_modules vers le dossier « vendor » servi par Nginx.
# Usage : sh scripts/vendor.sh [dossier_de_sortie]   (par défaut : public/vendor, pour le développement)
set -eu
OUT="${1:-public/vendor}"
NM="node_modules"

mkdir -p "$OUT/leaflet" "$OUT/fonts"
cp -r "$NM/leaflet/dist/leaflet.css" "$NM/leaflet/dist/leaflet.js" "$NM/leaflet/dist/images" "$OUT/leaflet/"
for f in latin-400-normal latin-400-italic latin-600-normal; do
  cp "$NM/@fontsource/cormorant-garamond/files/cormorant-garamond-$f.woff2" "$OUT/fonts/"
done
for f in latin-400-normal latin-700-normal; do
  cp "$NM/@fontsource/lato/files/lato-$f.woff2" "$OUT/fonts/"
done
# Polices de la page des jeux
for f in latin-500-normal latin-600-normal latin-700-normal; do
  cp "$NM/@fontsource/fredoka/files/fredoka-$f.woff2" "$OUT/fonts/"
done
cp "$NM/@fontsource/great-vibes/files/great-vibes-latin-400-normal.woff2" "$OUT/fonts/"
echo "Fichiers copiés dans $OUT"
