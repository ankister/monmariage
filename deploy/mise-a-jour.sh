#!/bin/bash
# =====================================================================
#  Mise à jour automatique du site de mariage sur Unraid
#
#  Télécharge les dernières images publiées par GitHub ; s'il y a du
#  nouveau, relance la pile. Sinon, ne fait rien.
#  À coller dans le plugin « User Scripts », planning */10 * * * *.
#
#  Le dossier de la pile est trouvé automatiquement (Compose Manager) ;
#  on peut aussi l'imposer : STACK_DIR=/chemin/vers/la/pile
# =====================================================================

main() {
  set -uo pipefail
  local NAME="monmariage"
  local LOG="${LOG:-/mnt/user/appdata/monmariage/mise-a-jour.log}"
  mkdir -p "$(dirname "$LOG")"
  log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

  # Dossier contenant docker-compose.yml : réglage manuel, sinon recherche dans Compose Manager
  local DIR="${STACK_DIR:-}"
  if [ -z "$DIR" ]; then
    local base cand
    for base in /boot/config/plugins/compose.manager/projects /boot/config/plugins/compose.manager.plus/projects; do
      cand="$base/$NAME"
      [ -d "$cand" ] || continue
      # Pile « indirecte » : le fichier indirect contient le vrai dossier
      if [ -f "$cand/indirect" ]; then DIR="$(cat "$cand/indirect")"; else DIR="$cand"; fi
      break
    done
  fi
  if [ -z "$DIR" ] || { [ ! -f "$DIR/docker-compose.yml" ] && [ ! -f "$DIR/compose.yaml" ]; }; then
    log "ERREUR : pile « $NAME » introuvable. Indiquez son dossier : STACK_DIR=/chemin bash $0"
    exit 1
  fi
  cd "$DIR" || exit 1

  # Images utilisées avant la mise à jour
  local before after
  before="$(docker compose images -q 2>/dev/null | sort | tr '\n' ' ')"

  if ! docker compose pull -q >>"$LOG" 2>&1; then
    log "ERREUR : téléchargement des images impossible (réseau ? images encore privées ?)."
    exit 1
  fi
  docker compose up -d >>"$LOG" 2>&1
  after="$(docker compose images -q 2>/dev/null | sort | tr '\n' ' ')"

  if [ "$before" != "$after" ]; then
    log "Nouvelle version installée ✓"
    docker image prune -f >/dev/null 2>&1
  else
    echo "Site déjà à jour."
  fi

  tail -n 500 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
}

main "$@"
exit
