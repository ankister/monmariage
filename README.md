# 💍 monmariage — site de mariage auto-hébergé

Site pour les invités (compte à rebours, programme et cartes, thème, menu, hébergements, réponse)
et interface d'administration responsive (invités, réservations de gîtes, contenu, sécurité).
Tout tourne chez vous, en deux conteneurs Docker, sans service tiers (hors tuiles de carte OpenStreetMap).

---

## Sommaire

1. [Architecture et choix techniques](#1-architecture-et-choix-techniques)
2. [Arborescence](#2-arborescence)
3. [Déploiement pas à pas](#3-déploiement-pas-à-pas)
   - [Installation sur Bretzel avec mises à jour automatiques](#3-bis-installation-sur-bretzel-unraid-avec-mises-à-jour-automatiques)
4. [Configuration de Nginx Proxy Manager](#4-configuration-de-nginx-proxy-manager)
5. [Utilisation de l'administration](#5-utilisation-de-ladministration)
6. [Sauvegardes](#6-sauvegardes)
7. [Mises à jour et maintenance](#7-mises-à-jour-et-maintenance)
8. [Sécurité](#8-sécurité)
9. [Dépannage](#9-dépannage)

---

## 1. Architecture et choix techniques

```
Invité / Admin ──HTTPS──► Nginx Proxy Manager ──HTTP──► conteneur « web » (Nginx, port 8095)
                                                        ├── fichiers statiques  (/ et /admin/)
                                                        └── /api/*  ──►  conteneur « api » (Node.js + SQLite)
                                                                          └── /data/mariage.sqlite (volume)
```

**Front statique** (HTML/CSS/JS sans framework) servi par Nginx. Leaflet et les polices sont
copiés dans l'image au moment de la construction : aucun appel à un CDN ni à Google Fonts.

**Backend : Node.js + Express + SQLite (better-sqlite3)** plutôt que PocketBase. Pourquoi :

| Critère | Node/Express + SQLite (retenu) | PocketBase |
|---|---|---|
| Admin pour non-technicien | Interface sur mesure, en français, pensée pour le mariage | Admin générique de base de données (tables, enregistrements) : peu adapté à un public non technique |
| Règles métier (capacité des gîtes, rapprochement des réponses) | Code simple, transactions SQLite | Règles d'API + hooks JS à apprendre |
| Maintenance | ~1 000 lignes de code serveur commentées, 2 dépendances | Un binaire à suivre, migrations de schéma |
| Sauvegarde | Un seul fichier `.sqlite` | Un dossier `pb_data` |

PocketBase aurait été plus rapide à démarrer, mais il aurait fallu construire une admin sur mesure
de toute façon pour respecter l'exigence « facile à prendre en main » ; l'intérêt disparaît.

**Volume attendu** : quelques centaines d'invités → SQLite est largement suffisant (mode WAL activé).

### Fonctionnalités

**Côté invités** (`https://paulineetantoine.fr`)
- Compte à rebours en direct, date en toutes lettres, bouton « Ajouter à mon agenda » (.ics avec rappel J-7)
- Programme (frise horaire) + carte OpenStreetMap des lieux (mairie, église, salle…) avec liens d'itinéraire
- Thème : description, code vestimentaire, pastilles de couleurs ; **les couleurs du thème colorent le site**
- Menu présenté comme une carte de restaurant
- Gîtes alentours : carte et fiches avec un bouton « Lien » (adresse saisie dans l'admin : page de réservation, site…)
- Formulaire de réponse : présence, adultes/enfants, nombre de menus végétariens, allergies et intolérances.
  **Seuls les noms de la liste d'invités peuvent répondre** (accents, majuscules et ordre prénom/nom ignorés ;
  option désactivable dans Contenu) et une **question anti-robot** (addition, vérifiée par le serveur, sans service tiers)
  doit être résolue
- Programme : mairie, église, **séance photos**, réception ou autre lieu
- **Jeux** (`/jeux/`) : « Antoine est en retard » et « Antoine en cavale », avec **tableaux d'honneur partagés** entre tous les invités
  (enregistrés par le serveur), bouton « Jeux » dans le menu et bouton de retour vers le site
- **Questions fréquentes** (FAQ) en accordéon, entrée « FAQ » dans le menu ; masquée tant qu'aucune question n'a de réponse
- **Page « Dormir sur place »** (`/dormir-sur-place/`) : plan interactif du gîte du Grand Breuil
  (rez-de-chaussée et étage, d'après le plan d'architecte), filtres, fiche de chaque chambre avec photos
  et tarifs, réservation avec prénom, nom, nombre de personnes et formule de nuits
  (vendredi + samedi, ou samedi seul). Une chambre réservée disparaît des chambres disponibles.
- Anti-spam : question anti-robot, liste d'invités, champ piège invisible, limitation de débit, code d'invitation optionnel
- `noindex` : le site n'est pas référencé par les moteurs de recherche

**Côté administration** (`https://paulineetantoine.fr/admin/`)
- Tableau de bord : personnes attendues, foyers présents / absents / sans réponse, taux de réponse,
  chambres sur place, nombre de menus classiques / végétariens, allergies
- Invités : recherche, filtres, ajout / modification / suppression, **collage d'une liste depuis Excel**,
  export CSV (s'ouvre directement dans Excel)
- Gîtes alentours : ajout / modification avec **placement sur carte d'un simple clic** et le lien du bouton « Lien »
- Chambres (dormir sur place) : réservations (valider / annuler / modifier, notes internes),
  **prix saisis directement dans la liste**, fiche de chaque chambre, **ajout de photos depuis le téléphone**
  (réduites automatiquement, réordonnables), plan avec le nom des occupants, montant attendu, export CSV
- Lieux : programme et positions sur la carte
- Contenu : date, textes, thème et couleurs, menu (étapes réordonnables), ouverture/fermeture des formulaires,
  **logo** (image PNG envoyée depuis l'admin, ou code HTML/CSS avec aperçu) affiché au-dessus de « Nous nous marions »,
  **statistiques de visite Umami** (adresse du script + identifiant du site, bouton de test)
- Sécurité : code d'invitation, changement du mot de passe
- Barre d'onglets en bas d'écran sur téléphone, barre latérale sur ordinateur

> **Rapprochement des réponses** : si un invité répond avec un nom déjà présent dans la liste
> (accents et majuscules ignorés) ou le même e-mail, sa fiche est mise à jour au lieu d'être dupliquée.
> Ajoutez donc votre liste d'invités avec les noms tels qu'ils figurent sur les faire-part.

---

## 2. Arborescence

```
monmariage/
├── docker-compose.yml          # les deux services
├── .env.example                # modèle de configuration (à copier en .env)
├── .gitignore
├── README.md
├── deploy/mise-a-jour.sh     # mise à jour automatique sur Bretzel (plugin User Scripts)
├── api/                        # backend Node.js
│   ├── Dockerfile
│   ├── package.json / package-lock.json
│   ├── scripts/
│   │   ├── hash-password.js    # génère le hash du mot de passe admin
│   │   └── reset-password.js   # réinitialise le mot de passe (oublié)
│   └── src/
│       ├── server.js           # point d'entrée, protection CSRF, erreurs
│       ├── db.js               # schéma SQLite, données d'exemple
│       ├── seed.js             # contenu d'exemple du premier démarrage
│       ├── rooms-seed.js       # les 21 chambres du Grand Breuil (d'après le plan)
│       ├── auth.js             # mot de passe (scrypt) et sessions
│       ├── util.js             # validation, CSV, fuseaux horaires, anti-spam
│       └── routes/
│           ├── public.js       # contenu, RSVP, réservations, agenda .ics
│           ├── rooms.js        # chambres sur place : réservations, prix, photos
│           ├── games.js        # tableaux d'honneur des jeux
│           ├── site.js         # logo et statistiques Umami
│           └── admin.js        # toutes les routes d'administration
└── web/                        # front statique + Nginx
    ├── Dockerfile
    ├── nginx.conf              # statique, relais /api, en-têtes de sécurité
    ├── package.json            # Leaflet + polices (copiées à la construction)
    ├── scripts/vendor.sh
    └── public/
        ├── index.html          # site invités
        ├── css/style.css, css/fonts.css
        ├── js/common.js        # fonctions partagées (API, cartes, thème)
        ├── js/app.js           # site invités
        ├── js/onsite-plan.js   # plan SVG du gîte (partagé site / admin)
        ├── js/onsite.js        # page « Dormir sur place »
        ├── css/plan.css, css/onsite.css
        ├── dormir-sur-place/index.html
        ├── jeux/                # page des jeux + retard/ et cavale/ (un dossier par jeu)
        ├── admin/index.html, admin.css, admin.js   # administration
        ├── admin/admin-rooms.js                    # onglet Chambres
        ├── favicon.svg
        └── robots.txt
```

---

## 3. Déploiement pas à pas

Prérequis : un serveur avec Docker et Docker Compose v2 (Unraid avec Compose Manager, Debian…),
Nginx Proxy Manager déjà en place, le domaine `paulineetantoine.fr` chez OVH.

### 3.1 Récupérer le code

```bash
# Exemple Unraid ; adaptez le chemin sur Debian (ex. /opt/monmariage)
cd /mnt/user/appdata
git clone git@github.com:<votre-compte>/monmariage.git
cd monmariage
```

> Le dépôt est privé : utilisez une clé SSH « deploy key » en lecture seule ou un jeton GitHub.

### 3.2 Configurer

```bash
cp .env.example .env
nano .env
```

- **Unraid** : `PUID=99`, `PGID=100`, `DATA_PATH=/mnt/user/appdata/monmariage/data`
- **Debian** : laissez `PUID=1000`, `PGID=1000` (ou l'UID de votre utilisateur : `id -u`)
- `WEB_PORT` : un port libre sur le serveur (8095 par défaut)

Créez le dossier de données avec le bon propriétaire :

```bash
mkdir -p data            # ou le chemin de DATA_PATH
chown 99:100 data        # Unraid ; sur Debian : chown 1000:1000 data
```

### 3.3 Définir le mot de passe administrateur

```bash
docker compose build
docker compose run --rm api node scripts/hash-password.js
```

Tapez votre mot de passe (10 caractères minimum, il s'affiche en `*`), puis copiez la ligne
`ADMIN_PASSWORD_HASH='scrypt$…'` produite dans `.env`, **apostrophes comprises**
(elles empêchent Docker Compose d'interpréter les `$`).

### 3.4 Démarrer

```bash
docker compose up -d
docker compose ps          # les deux conteneurs doivent être « healthy »
docker compose logs api    # doit afficher « Mot de passe admin initialisé… »
```

Test local : `http://<IP_DU_SERVEUR>:8095` (site) et `http://<IP_DU_SERVEUR>:8095/admin/`.

> Le mot de passe de `.env` ne sert **qu'au premier démarrage** ; il est ensuite stocké (haché) dans
> la base et se change depuis l'admin. Modifier `.env` ensuite n'a plus d'effet (voir §9 pour le réinitialiser).

### 3.5 Remplacer les données d'exemple

Au premier lancement, le site contient des lieux, gîtes et un menu **d'exemple** (marqués « exemple »).
Connectez-vous à l'admin et remplacez-les : onglets **Lieux**, **Gîtes**, **Contenu**.

### 3.6 Avec Compose Manager (Unraid)

Créez une nouvelle pile, choisissez comme dossier `/mnt/user/appdata/monmariage` (là où se trouve
`docker-compose.yml`) puis « Compose Up ». Les commandes `docker compose run/exec` ci-dessus se lancent
depuis le terminal Unraid, dans ce même dossier.

---

## 3 bis. Installation sur Bretzel (Unraid) avec mises à jour automatiques

Le code est récupéré depuis le dépôt privé GitHub grâce à une **clé de déploiement en lecture seule**,
puis un script vérifie GitHub toutes les 10 minutes et reconstruit le site quand il y a une nouvelle version.
Toutes les commandes se tapent dans le **terminal d'Unraid** (icône `>_` en haut à droite de l'interface).

### Étape 1 — Créer la clé de déploiement (sur Bretzel)

```bash
mkdir -p /mnt/user/appdata/monmariage-deploy
cd /mnt/user/appdata/monmariage-deploy
ssh-keygen -t ed25519 -N "" -C "bretzel-monmariage" -f id_ed25519
cat id_ed25519.pub
```

Copiez la ligne affichée (elle commence par `ssh-ed25519`). La clé privée ne quitte jamais Bretzel.

### Étape 2 — Autoriser la clé sur GitHub

<https://github.com/ankister/monmariage/settings/keys/new> → **Title** : `Bretzel` → **Key** : collez la ligne →
laissez **« Allow write access » décoché** → **Add key**.

### Étape 3 — Récupérer le site

```bash
cd /mnt/user/appdata/monmariage-deploy
export GIT_SSH_COMMAND="ssh -i $PWD/id_ed25519 -o IdentitiesOnly=yes -o UserKnownHostsFile=$PWD/known_hosts -o StrictHostKeyChecking=accept-new"
if command -v git >/dev/null; then
  git clone git@github.com:ankister/monmariage.git /mnt/user/appdata/monmariage
else
  # Unraid sans git : on passe par un petit conteneur
  docker run --rm -v /mnt/user/appdata:/mnt/user/appdata -v "$PWD:$PWD" -e GIT_SSH_COMMAND -e HOME=/tmp \
    alpine/git clone git@github.com:ankister/monmariage.git /mnt/user/appdata/monmariage
fi
ls /mnt/user/appdata/monmariage   # doit afficher README.md, api, deploy, docker-compose.yml, web
```

### Étape 4 — Configurer

```bash
cd /mnt/user/appdata/monmariage
cp .env.example .env
nano .env        # Ctrl+O puis Entrée pour enregistrer, Ctrl+X pour quitter
```

Valeurs pour Bretzel :

```ini
WEB_PORT=8095
PUID=99
PGID=100
DATA_PATH=/mnt/user/appdata/monmariage/data
```

> **Base SQLite et couche FUSE d'Unraid** : comme pour Plex, une base SQLite sur `/mnt/user/…` peut souffrir
> de la couche `shfs`. Si le partage `appdata` est sur un pool de cache, préférez le chemin direct du pool,
> par exemple `DATA_PATH=/mnt/<nom_du_pool>/appdata/monmariage/data` (`ls /mnt` affiche le nom des pools).

```bash
mkdir -p /mnt/user/appdata/monmariage/data          # ou le chemin choisi pour DATA_PATH
chown -R 99:100 /mnt/user/appdata/monmariage/data
```

### Étape 5 — Mot de passe admin et démarrage

```bash
cd /mnt/user/appdata/monmariage
docker compose build
docker compose run --rm api node scripts/hash-password.js   # tapez le mot de passe, copiez la ligne ADMIN_PASSWORD_HASH='…'
nano .env                                                    # collez-la à la place de « ADMIN_PASSWORD_HASH= »
docker compose up -d
docker compose ps                                            # les deux conteneurs doivent être « healthy »
```

Test : `http://192.168.1.55:8095` puis `http://192.168.1.55:8095/admin/`.
Ensuite, configurez Nginx Proxy Manager (section 4) avec **Forward Hostname/IP** `192.168.1.55` et **Forward Port** `8095`.

### Étape 6 — Mises à jour automatiques

1. **Apps** → installez le plugin **User Scripts** (s'il ne l'est pas déjà).
2. **Settings → User Scripts → Add New Script** → nom : `monmariage-mise-a-jour`.
3. Survolez l'engrenage du script → **Edit Script**, remplacez tout le contenu par :

   ```bash
   #!/bin/bash
   bash /mnt/user/appdata/monmariage/deploy/mise-a-jour.sh
   ```

4. **Save Changes**, puis dans la liste déroulante du planning choisissez **Custom** et indiquez `*/10 * * * *`
   (toutes les 10 minutes) → **Apply**.
5. Cliquez sur **Run Script** une première fois : le message doit être « Site déjà à jour ».

À chaque nouvelle version envoyée sur GitHub, le site est reconstruit dans les 10 minutes.
Le journal se trouve dans `/mnt/user/appdata/monmariage-deploy/mise-a-jour.log`.

- Forcer une reconstruction immédiate : `FORCE=1 bash /mnt/user/appdata/monmariage/deploy/mise-a-jour.sh`
- Revenir à une version précédente : `cd /mnt/user/appdata/monmariage && git log --oneline` puis
  `git reset --hard <code>` et `docker compose up -d --build` (désactivez le script entre-temps, sinon il revient à la dernière version)

> Ne modifiez pas les fichiers du site directement sur Bretzel : le script les remplace par la version GitHub.
> Seuls `.env` et le dossier de données vous appartiennent sur le serveur.

## 4. Configuration de Nginx Proxy Manager

### 4.1 DNS chez OVH

Dans la zone DNS de `paulineetantoine.fr` :

| Type | Sous-domaine | Cible |
|---|---|---|
| A | *(vide)* | votre IP publique |
| CNAME | `www` | `paulineetantoine.fr.` |

Supprimez les enregistrements A/AAAA par défaut d'OVH qui pointeraient ailleurs.
Les ports 80 et 443 de la box doivent être redirigés vers NPM (normalement déjà fait).

### 4.2 Proxy Host

**Hosts → Proxy Hosts → Add Proxy Host**

Onglet **Details**
- Domain Names : `paulineetantoine.fr` et `www.paulineetantoine.fr`
- Scheme : `http`
- Forward Hostname / IP : IP du serveur qui fait tourner le site (ex. `192.168.1.55`)
  — ou `monmariage-web` si NPM est sur le même réseau Docker que le site
- Forward Port : `8095` (valeur de `WEB_PORT`) — ou `80` si vous utilisez le nom du conteneur
- ☑ Block Common Exploits
- ☐ Websockets Support (inutile)
- ☑ Cache Assets : facultatif

Onglet **SSL**
- SSL Certificate : *Request a new SSL Certificate* (Let's Encrypt)
- ☑ Force SSL ☑ HTTP/2 Support ☑ HSTS Enabled
- Acceptez les conditions, indiquez votre e-mail, **Save**.

Onglet **Advanced** : rien d'obligatoire. NPM transmet déjà `Host`, `X-Forwarded-For` et
`X-Forwarded-Proto`, dont le site a besoin pour les cookies sécurisés et la limitation de débit.

Facultatif — réserver l'admin au réseau local (ajouter dans **Advanced**) :

```nginx
location /admin/ {
    allow 192.168.1.0/24;
    deny all;
    include conf.d/include/proxy.conf;
}
location /api/admin/ {
    allow 192.168.1.0/24;
    deny all;
    include conf.d/include/proxy.conf;
}
```

(Si vous voulez gérer les réponses depuis votre téléphone en 4G, ne l'activez pas, ou passez par votre VPN WireGuard.)

### 4.3 Vérification

- `https://paulineetantoine.fr` affiche le site, cadenas valide
- `https://paulineetantoine.fr/admin/` affiche la connexion
- Envoyez une réponse test depuis le site, vérifiez qu'elle apparaît dans l'admin, puis supprimez-la

---

## 5. Utilisation de l'administration

| Je veux… | Où |
|---|---|
| Fixer le prix des chambres sur place | **Chambres → Chambres & prix** (2 nuits / samedi seul, enregistrement automatique) |
| Ajouter des photos d'une chambre | **Chambres → Chambres & prix → toucher la chambre → + Ajouter des photos** |
| Valider une réservation de chambre | **Chambres → Réservations → Valider** |
| Libérer une chambre | **Chambres → Réservations → Annuler** (la chambre redevient disponible) |
| Bloquer une chambre (pour vous, la famille…) | **Chambres → fiche → décocher « Proposée à la réservation »**, ou ajouter une réservation vous-même |
| Ouvrir / fermer les réservations de chambres | **Contenu → Page « Dormir sur place »** |
| Voir combien de personnes viennent | **Accueil** |
| Ajouter ma liste d'invités | **Invités → Coller une liste** (un nom par ligne, « Nom;2 » pour 2 adultes) |
| Noter une réponse reçue par téléphone | **Invités → cliquer sur le nom → Réponse** |
| Donner les chiffres au traiteur | **Accueil** (régimes) ou **Invités → Exporter (Excel)** |
| Ajouter / modifier une question de la FAQ | **Contenu → Questions fréquentes** (une question sans réponse reste masquée) |
| Effacer les scores de test des jeux | **Contenu → Jeux → Tout effacer** (ou 🗑 pour un score) |
| Masquer le bouton « Jeux » | **Contenu → Jeux → décocher l'option** |
| Changer le lien d'un gîte | **Gîtes → toucher le gîte → Lien** |
| Changer la date, le menu, les couleurs | **Contenu → Enregistrer** |
| Fermer les réponses après la date limite | **Contenu → Formulaire de réponse** |
| Autoriser des noms hors liste | **Contenu → Formulaire de réponse → décocher « Seuls les noms de la liste… »** |
| Exiger un code (imprimé sur le faire-part) | **Sécurité → Code d'invitation** |

Placer un lieu ou un gîte sur la carte : dans la fenêtre de modification, cliquez sur la carte
(le repère est ensuite déplaçable). Vous pouvez aussi coller des coordonnées copiées depuis
OpenStreetMap ou Google Maps (« 43.6112, 1.3349 ») dans le champ *Latitude*.

---

## 5 bis. Statistiques de visite (Umami)

Dans **Contenu → Statistiques de visite (Umami)** :

1. Dans Umami, ajoutez un site (Paramètres → Sites web → Ajouter), puis ouvrez son **code de suivi**.
2. Copiez la valeur de `src` dans « Adresse du script » et celle de `data-website-id` dans « Identifiant du site ».
3. **Enregistrer**, puis **Tester la connexion**.

Le script et les mesures transitent par le serveur du site (`/api/stats/…`), qui les relaie à Umami :
la politique de sécurité du site reste stricte, l'adresse de votre Umami n'est jamais visible des invités
et le suivi n'est pas bloqué par les bloqueurs de publicité courants. L'administration n'est jamais suivie.

> Comme c'est le serveur du site qui contacte Umami, vous pouvez indiquer une **adresse du réseau local**
> (ex. `http://192.168.1.55:3001/script.js`) si l'adresse publique ne fonctionne pas depuis Docker
> (problème de « hairpin NAT »). « Tester la connexion » vous le dira.

## 6. Sauvegardes

Toutes les données tiennent dans `DATA_PATH` : `mariage.sqlite` (+ fichiers `-wal`/`-shm`)
et le dossier `media/` qui contient les photos des chambres et le logo.
Incluez ce dossier dans vos sauvegardes habituelles (Backrest/restic, Appdata Backup…).

Pour une copie garantie cohérente pendant que le site tourne :

```bash
docker compose exec api node -e "require('./src/db').db.backup('/data/backup-' + new Date().toISOString().slice(0,10) + '.sqlite').then(() => console.log('OK'))"
```

Les exports CSV de l'admin constituent en plus une copie lisible des invités et réservations.

---

## 7. Mises à jour et maintenance

```bash
cd /mnt/user/appdata/monmariage
git pull
docker compose up -d --build
```

La base n'est jamais écrasée par une mise à jour (le schéma n'est créé que s'il n'existe pas).

Développement local sans Docker :

```bash
cd api && npm install && ADMIN_PASSWORD=motdepasse-local DATA_DIR=./data node src/server.js
cd web && npm install && npm run vendor   # puis servir web/public avec un serveur qui relaie /api vers :3000
```

---

## 8. Sécurité

- Mot de passe admin haché avec **scrypt** ; jamais stocké en clair (sauf si vous utilisez
  `ADMIN_PASSWORD`, à retirer de `.env` après le premier démarrage)
- Session : cookie `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, valable 14 jours ;
  changer le mot de passe déconnecte les autres appareils
- Protection CSRF : requêtes JSON uniquement + contrôle de l'en-tête `Origin`
- Limitation de débit : 10 tentatives de connexion / 15 min, 10 envois de formulaire / 10 min par IP
- Échappement systématique des textes affichés (XSS) + Content-Security-Policy stricte
- Export CSV protégé contre l'injection de formules Excel
- L'API n'est pas exposée directement : seul le conteneur `web` publie un port
- Conteneur API non-root

---

## 9. Dépannage

| Symptôme | Solution |
|---|---|
| `SQLITE_CANTOPEN` / permission refusée au démarrage | Le dossier `DATA_PATH` n'appartient pas à `PUID:PGID` → `chown 99:100 data` (Unraid) |
| « Aucun mot de passe administrateur n'est configuré » | `ADMIN_PASSWORD_HASH` vide ou mal collé (apostrophes ?) → corrigez `.env`, puis `docker compose up -d` |
| Mot de passe oublié | `docker compose exec api node scripts/reset-password.js` |
| « Origine refusée » dans l'admin | Le nom de domaine reçu ne correspond pas : vérifiez que NPM transmet bien l'en-tête Host (comportement par défaut) |
| La carte reste grise | Le navigateur ne joint pas `tile.openstreetmap.org` (bloqueur, réseau filtré) |
| Les cartes n'affichent pas un lieu | Le lieu n'a pas de coordonnées : un ⚠️ l'indique dans l'admin |
| Umami : « injoignable depuis le serveur du site » | Le conteneur `api` ne joint pas l'adresse indiquée : essayez l'adresse locale de Umami (IP:port) |
| Le logo HTML n'affiche pas une image externe | Seules les images du site sont autorisées : envoyez plutôt l'image en mode « Image PNG » |
| Photo refusée « format non pris en charge » | Photo HEIC d'iPhone ouverte sur un PC Windows : envoyez-la depuis l'iPhone directement (Safari la convertit), ou en JPEG |
| Modifs du site non visibles | Les fichiers sont revérifiés à chaque visite ; si besoin, actualisation forcée (Ctrl+F5) |
