# 💍 monmariage — site de mariage auto-hébergé

Site pour les invités (compte à rebours, programme et cartes, thème, menu, hébergements, réponse)
et interface d'administration responsive (invités, réservations de gîtes, contenu, sécurité).
Tout tourne chez vous, en deux conteneurs Docker, sans service tiers (hors tuiles de carte OpenStreetMap).

---

## Sommaire

1. [Architecture et choix techniques](#1-architecture-et-choix-techniques)
2. [Arborescence](#2-arborescence)
3. [Déploiement pas à pas](#3-déploiement-pas-à-pas)
   - [Installation sur Unraid avec Compose Manager](#3-bis-installation-sur-unraid-avec-compose-manager-images-github-mises-à-jour-automatiques)
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

**Côté invités** (`https://votre-domaine.fr`)
- Compte à rebours en direct, date en toutes lettres, bouton « Ajouter à mon agenda » (.ics avec rappel J-7)
- Programme (frise horaire) + carte OpenStreetMap des lieux (mairie, église, salle…) avec liens d'itinéraire
- Thème : description, code vestimentaire, pastilles de couleurs
- **Apparence au choix** : 8 thèmes prêts à l'emploi (dont un sombre), couleurs, polices de chaque texte (22 polices hébergées localement), CSS personnalisé, ordre et affichage des blocs de la page d'accueil
- **Site réservé aux invités** (option) : mot de passe commun demandé une fois par appareil (`/acces/`), lien direct `…/acces/?code=…` pour un QR code ; protège les pages, les jeux, les chambres et l'API
- Menu présenté comme une carte de restaurant
- Gîtes alentours : carte et fiches avec un bouton « Lien » (adresse saisie dans l'admin : page de réservation, site…)
- Formulaire de réponse : présence, adultes/enfants, nombre de menus végétariens, allergies et intolérances.
  **Seuls les noms de la liste d'invités peuvent répondre** (accents, majuscules et ordre prénom/nom ignorés ;
  option désactivable dans Contenu) et une **question anti-robot** (addition, vérifiée par le serveur, sans service tiers)
  doit être résolue
- Programme : mairie, église, **séance photos**, réception ou autre lieu
- **Jeux** (`/jeux/`) : « … est en retard », « … en cavale » **« Le combat des témoins »** (combat en relais témoins du marié contre témoins de la mariée, 1 ou 2 joueurs, musique originale) et **« Livraison sous haute tension »** (conduite vue du ciel : livrer la pièce montée en échappant aux voitures des témoins) ; prénoms et témoins réglés dans `.env` : `PRENOM_MARIE`, `PRENOM_MARIEE`, `TEMOINS_MARIE`, `TEMOINS_MARIEE` (format `Prénom:H|F[:peau 1-6[:cheveux]]`) ; **tableaux d'honneur partagés** entre tous les invités
  (enregistrés par le serveur), bouton « Jeux » dans le menu et bouton de retour vers le site
- **Questions fréquentes** (FAQ) en accordéon, entrée « FAQ » dans le menu ; masquée tant qu'aucune question n'a de réponse
- **Page « Dormir sur place »** (`/dormir-sur-place/`) : plan interactif du lieu de réception
  (rez-de-chaussée et étage, d'après le plan d'architecte), filtres, fiche de chaque chambre avec photos
  et tarifs, réservation avec prénom, nom, nombre de personnes et formule de nuits
  (vendredi + samedi, ou samedi seul). Une chambre réservée disparaît des chambres disponibles.
- Anti-spam : question anti-robot, liste d'invités, champ piège invisible, limitation de débit, code d'invitation optionnel
- `noindex` : le site n'est pas référencé par les moteurs de recherche

**Côté administration** (`https://votre-domaine.fr/admin/`)
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
- **Musiques** : les invités proposent jusqu'à 3 chansons pour la piste de danse dans leur réponse (recherche, lien Spotify ou titre libre), avec écoute de l'extrait par le lecteur Spotify intégré ; l'onglet admin liste les propositions et, si le compte Spotify des mariés est connecté (application Spotify « Development Mode », propriétaire Premium), permet la recherche pour les invités et l'ajout direct à une playlist
- **Encarts « Album photo » et « Jeux »** sur la page d'accueil (rectangle illustré cliquable, déplaçable et masquable dans Style → Blocs ; le texte de l'encart album suit la période d'ouverture)
- **Barre de menu** : ordre des liens et liens affichés réglables dans Style → Barre de menu, indépendamment de l'ordre des blocs
- **Album photo partagé** (`/album/`) : les invités envoient photos et vidéos depuis leur téléphone (sans compte, prénom facultatif), galerie commune actualisée en direct, visionneuse, **diaporama plein écran** pour un écran ou un vidéoprojecteur ; ouverture **à partir du jour J** (durée en jours) ou **à des dates choisies** ; avant l'ouverture, compte à rebours pour les invités et **mode test** pour les mariés (envois marqués « Test », jamais montrés aux invités) ; dans l'admin : **QR code** à imprimer (cartes de table A6, mot de passe du site inclus en option), modération facultative, masquage, suppression (une par une, envois de test, ou **tous les médias** avec double confirmation), **téléchargement ZIP**, et bouton **« Vérifier que tout fonctionne »** (stockage, envoi réel, gros fichiers à travers le proxy, https)
- **Budget** : budget prévu, dépenses par catégorie (12 catégories proposées, ajout / modification / suppression / réordonnancement), montants prévu, réel et payé, échéances, **recettes des chambres sur place déduites du lieu de réception** (validées, et en option celles en attente), **export Excel** (.xlsx : synthèse avec formules, dépenses, chambres)
- Style : favicon personnalisable (envoi d’une image PNG, ICO ou SVG), thèmes prédéfinis et thèmes personnels, couleurs avec contrôle de lisibilité, polices par texte, éditeur CSS, ordre des blocs, **aperçu en direct** (mobile / ordinateur)
- Sécurité : accès au site par mot de passe invités (activable), code d'invitation, changement du mot de passe
- Barre d'onglets en bas d'écran sur téléphone, barre latérale sur ordinateur

> **Préremplissage** : quand un invité tape son nom (et le code d'invitation s'il y en a un), le formulaire reprend
> le nombre d'adultes et d'enfants prévu pour lui dans la liste des invités ; il peut le modifier.
>
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
├── .github/workflows/images.yml  # construction des images + contrôle d'anonymat
├── deploy/unraid/            # pile Compose Manager (docker-compose.yml + env.exemple)
├── deploy/mise-a-jour.sh      # mise à jour automatique (plugin User Scripts)
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
│       ├── rooms-seed.js       # les 21 chambres du lieu de réception (d'après le plan)
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
Nginx Proxy Manager déjà en place, le domaine `votre-domaine.fr` chez OVH.

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

## 3 bis. Installation sur Unraid avec Compose Manager (images GitHub, mises à jour automatiques)

À chaque modification envoyée sur la branche `main`, une GitHub Action (`.github/workflows/images.yml`)
vérifie qu'aucune donnée personnelle ne se trouve dans les fichiers des images, puis publie deux images :
`ghcr.io/ankister/monmariage-api` et `ghcr.io/ankister/monmariage-web`.
Les images ne contiennent ni prénoms, ni date, ni lieu, ni nom de serveur : tout cela vient du `.env`
et de la base de données du serveur. Le dépôt GitHub, lui, reste privé.

### Étape 1 — Rendre les images publiques (une seule fois)

Après la première construction (onglet **Actions** du dépôt, coche verte) :
GitHub → votre profil → **Packages** → `monmariage-api` → **Package settings** → **Change visibility** → **Public**.
Même chose pour `monmariage-web`.

### Étape 2 — Créer la pile dans Compose Manager Plus

1. Onglet **Docker** → **Add New Stack** → nom : `monmariage`.
2. **Edit Stack** → **Compose File** : collez le contenu de `deploy/unraid/docker-compose.yml`.
3. **Edit Stack** → **ENV File** : collez le contenu de `deploy/unraid/env.exemple` et remplissez :
   les deux prénoms, et un mot de passe provisoire dans `ADMIN_PASSWORD`.
4. **Compose Up**. Les images sont téléchargées, le dossier de données est créé avec les bons droits.

Test : `http://<IP_DU_SERVEUR>:8095` et `/admin/` avec le mot de passe provisoire.
Changez-le aussitôt dans l'admin (onglet **Sécurité**), puis videz `ADMIN_PASSWORD` dans l'ENV File.
Ensuite : Proxy Host dans Nginx Proxy Manager vers `<IP_DU_SERVEUR>:8095` (section 4).

### Étape 3 — Mises à jour automatiques

Plugin **User Scripts** → **Add New Script** `monmariage-mise-a-jour` → **Edit Script** :
collez **tout** le contenu de `deploy/mise-a-jour.sh` → **Save** → planning **Custom** `*/10 * * * *` → **Apply**.
**Run Script** une fois pour vérifier (« Site déjà à jour » attendu).

Le script trouve tout seul la pile Compose Manager, télécharge les nouvelles images et relance la pile
seulement s'il y a du nouveau. Journal : `/mnt/user/appdata/monmariage/mise-a-jour.log`.

> Revenir à une version précédente : remplacez `:latest` par l'identifiant d'un commit
> (ex. `ghcr.io/ankister/monmariage-web:4f2c…`) dans la pile, puis **Compose Up**.

> Commandes à lancer dans le conteneur API (mot de passe oublié…) : ajoutez `--user 99:100`,
> ex. `docker exec -it --user 99:100 monmariage-api node scripts/reset-password.js`.

## 4. Configuration de Nginx Proxy Manager

### 4.1 DNS chez OVH

Dans la zone DNS de `votre-domaine.fr` :

| Type | Sous-domaine | Cible |
|---|---|---|
| A | *(vide)* | votre IP publique |
| CNAME | `www` | `votre-domaine.fr.` |

Supprimez les enregistrements A/AAAA par défaut d'OVH qui pointeraient ailleurs.
Les ports 80 et 443 de la box doivent être redirigés vers NPM (normalement déjà fait).

### 4.2 Proxy Host

**Hosts → Proxy Hosts → Add Proxy Host**

Onglet **Details**
- Domain Names : `votre-domaine.fr` et `www.votre-domaine.fr`
- Scheme : `http`
- Forward Hostname / IP : IP du serveur qui fait tourner le site (ex. `<IP_DU_SERVEUR>`)
  — ou `monmariage-web` si NPM est sur le même réseau Docker que le site
- Forward Port : `8095` (valeur de `WEB_PORT`) — ou `80` si vous utilisez le nom du conteneur
- ☑ Block Common Exploits
- ☐ Websockets Support (inutile)
- ☑ Cache Assets : facultatif

Onglet **SSL**
- SSL Certificate : *Request a new SSL Certificate* (Let's Encrypt)
- ☑ Force SSL ☑ HTTP/2 Support ☑ HSTS Enabled
- Acceptez les conditions, indiquez votre e-mail, **Save**.

Onglet **Advanced** : NPM transmet déjà `Host`, `X-Forwarded-For` et
`X-Forwarded-Proto`, dont le site a besoin pour les cookies sécurisés et la limitation de débit.
Pour l'**album photo**, autorisez les gros envois de vidéos (sinon NPM refuse les fichiers de plus
d'environ 1 Mo à 100 Mo selon sa configuration) en ajoutant dans **Advanced** :

```nginx
client_max_body_size 2000m;
proxy_request_buffering off;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
```

Puis lancez **Album → Vérifier que tout fonctionne** depuis l'adresse publique (et depuis un téléphone en 4G).

Facultatif — réserver l'admin au réseau local (ajouter dans **Advanced**) :

```nginx
location /admin/ {
    allow <RESEAU_LOCAL>;   # votre réseau local, au format adresse/masque
    deny all;
    include conf.d/include/proxy.conf;
}
location /api/admin/ {
    allow <RESEAU_LOCAL>;   # votre réseau local, au format adresse/masque
    deny all;
    include conf.d/include/proxy.conf;
}
```

(Si vous voulez gérer les réponses depuis votre téléphone en 4G, ne l'activez pas, ou passez par votre VPN WireGuard.)

### 4.3 Vérification

- `https://votre-domaine.fr` affiche le site, cadenas valide
- `https://votre-domaine.fr/admin/` affiche la connexion
- Envoyez une réponse test depuis le site, vérifiez qu'elle apparaît dans l'admin, puis supprimez-la

---

## 5. Utilisation de l'administration

| Je veux… | Où |
|---|---|
| Fixer le prix des chambres sur place | **Chambres → Chambres & prix** (2 nuits / samedi seul, **par chambre ou par lit** pour les dortoirs, total en bas de la liste, enregistrement automatique) |
| Indiquer où se garer (dont places PMR) | **Lieux → 🅿️ Stationnement** : parkings et places PMR placés sur la carte ; page « Où se garer ? » liée sous l'itinéraire de la mairie (case dans la fiche du lieu) |
| Envoyer les modalités de règlement par e-mail | **Chambres → Réservations → Règlement en cours** : mail automatique à l'invité ; serveur SMTP et modèle HTML dans le bloc **Mail** (sous les réservations), sans variable de conteneur |
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
| Changer la date, le menu | **Contenu → Enregistrer** |
| Changer le thème, les couleurs, les polices | **Style → choisir un thème, ajuster → Enregistrer** |
| Réordonner ou masquer un bloc de l'accueil | **Style → Blocs de la page d'accueil** (↑ ↓, case à cocher) |
| Ajouter du CSS personnalisé | **Style → CSS personnalisé** |
| Suivre le budget, exporter vers Excel | **Budget** (toucher une dépense pour la modifier ; ⬇ Exporter) |
| Réserver le site aux invités | **Sécurité → Accès au site** (mot de passe + interrupteur) |
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
> (ex. `http://<IP_DU_SERVEUR>:3001/script.js`) si l'adresse publique ne fonctionne pas depuis Docker
> (problème de « hairpin NAT »). « Tester la connexion » vous le dira.

## 6. Sauvegardes

Toutes les données tiennent dans `DATA_PATH` : `mariage.sqlite` (+ fichiers `-wal`/`-shm`)
et le dossier `media/` qui contient les photos des chambres, le logo et les photos et vidéos
de l'album (`media/album/`, prévoyez l'espace disque : plusieurs Go le jour J).
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
| Mot de passe oublié | `docker exec -it --user 99:100 monmariage-api node scripts/reset-password.js` (Unraid) |
| « Origine refusée » dans l'admin | Le nom de domaine reçu ne correspond pas : vérifiez que NPM transmet bien l'en-tête Host (comportement par défaut) |
| La carte reste grise | Le navigateur ne joint pas `tile.openstreetmap.org` (bloqueur, réseau filtré) |
| Les cartes n'affichent pas un lieu | Le lieu n'a pas de coordonnées : un ⚠️ l'indique dans l'admin |
| Umami : « injoignable depuis le serveur du site » | Le conteneur `api` ne joint pas l'adresse indiquée : essayez l'adresse locale de Umami (IP:port) |
| Le logo HTML n'affiche pas une image externe | Seules les images du site sont autorisées : envoyez plutôt l'image en mode « Image PNG » |
| Photo refusée « format non pris en charge » | Photo HEIC d'iPhone ouverte sur un PC Windows : envoyez-la depuis l'iPhone directement (Safari la convertit), ou en JPEG |
| Modifs du site non visibles | Les fichiers sont revérifiés à chaque visite ; si besoin, actualisation forcée (Ctrl+F5) |
