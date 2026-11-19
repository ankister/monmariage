#!/bin/bash
# =====================================================================
#  Mise à jour automatique du site de mariage sur Bretzel (Unraid)
#
#  Vérifie s'il y a du nouveau sur GitHub ; si oui, récupère le code,
#  reconstruit et relance le site. Sinon, ne fait rien.
#  À lancer toutes les 10 minutes avec le plugin « User Scripts ».
#
#  Ne touche jamais à .env ni au dossier de données (ils ne sont pas
#  suivis par Git).
#
#  Variables modifiables (valeurs par défaut ci-dessous) :
#    REPO_DIR    dossier du site cloné
#    DEPLOY_DIR  dossier de la clé de déploiement et du journal
#    BRANCH      branche à suivre
# =====================================================================

# Tout le script est dans une fonction : Bash le lit entièrement avant de l'exécuter,
# ce qui évite tout problème quand la mise à jour remplace ce fichier pendant qu'il tourne.
main() {
  set -uo pipefail

  local REPO_DIR="${REPO_DIR:-/mnt/user/appdata/monmariage}"
  local DEPLOY_DIR="${DEPLOY_DIR:-/mnt/user/appdata/monmariage-deploy}"
  local BRANCH="${BRANCH:-main}"
  local LOG="$DEPLOY_DIR/mise-a-jour.log"
  local LOCK="$DEPLOY_DIR/.mise-a-jour.lock"

  log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

  mkdir -p "$DEPLOY_DIR"

  # Une seule mise à jour à la fois
  if ! mkdir "$LOCK" 2>/dev/null; then
    # Verrou de plus d'une heure : une exécution précédente a été interrompue
    if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
      rmdir "$LOCK" 2>/dev/null; mkdir "$LOCK" || exit 0
    else
      echo "Mise à jour déjà en cours, on passe."
      exit 0
    fi
  fi
  # Chemin du verrou écrit en dur dans le trap : il est exécuté après la fin de main()
  trap "rmdir '$LOCK' 2>/dev/null" EXIT

  # Accès SSH en lecture seule au dépôt privé (clé de déploiement)
  export GIT_SSH_COMMAND="ssh -i $DEPLOY_DIR/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=$DEPLOY_DIR/known_hosts -o StrictHostKeyChecking=accept-new -o BatchMode=yes"

  # Git : celui d'Unraid s'il existe, sinon un petit conteneur alpine/git
  if command -v git >/dev/null 2>&1; then
    g() { git -C "$REPO_DIR" "$@"; }
  else
    g() {
      docker run --rm -v "$REPO_DIR:$REPO_DIR" -v "$DEPLOY_DIR:$DEPLOY_DIR" -w "$REPO_DIR" \
        -e GIT_SSH_COMMAND -e HOME=/tmp alpine/git -c safe.directory="$REPO_DIR" "$@"
    }
  fi

  if [ ! -d "$REPO_DIR/.git" ]; then
    log "ERREUR : $REPO_DIR n'est pas un dépôt Git (voir la section « Installation sur Bretzel » du README)."
    exit 1
  fi

  if ! g fetch --quiet origin "$BRANCH"; then
    log "ERREUR : impossible de contacter GitHub (clé de déploiement ? réseau ?)."
    exit 1
  fi

  local LOCAL REMOTE
  LOCAL="$(g rev-parse HEAD)"
  REMOTE="$(g rev-parse "origin/$BRANCH")"
  if [ "$LOCAL" = "$REMOTE" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "Site déjà à jour (${LOCAL:0:7})."
    exit 0
  fi

  log "Nouvelle version : ${LOCAL:0:7} -> ${REMOTE:0:7} — $(g log -1 --format=%s "origin/$BRANCH")"

  # Aligne le code sur GitHub ; .env et les données (ignorés par Git) ne sont pas touchés
  if ! g reset --quiet --hard "origin/$BRANCH"; then
    log "ERREUR : échec de la récupération du code."
    exit 1
  fi

  cd "$REPO_DIR" || exit 1
  if docker compose up -d --build >>"$LOG" 2>&1; then
    log "Site reconstruit et relancé ✓"
    docker image prune -f >/dev/null 2>&1 # supprime les anciennes images inutilisées
  else
    log "ERREUR : la reconstruction a échoué, voir le détail ci-dessus. L'ancienne version peut encore tourner."
    exit 1
  fi

  # Le journal ne garde que les 500 dernières lignes
  tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
}

main "$@"
exit
