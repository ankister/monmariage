#!/bin/sh
# Démarrage du conteneur API.
# Lancé en root, il donne le dossier de données à l'utilisateur PUID:PGID (Unraid : 99:100),
# puis lance l'application avec cet utilisateur. Plus besoin de « chown » à la main.
set -e

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  mkdir -p "$DATA_DIR"
  chown -R "$PUID:$PGID" "$DATA_DIR"
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups -- "$@"
fi

exec "$@"
