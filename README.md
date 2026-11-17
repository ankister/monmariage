# 💍 monmariage — site de mariage auto-hébergé

Site pour les invités (compte à rebours, programme et cartes, thème, menu, hébergements, réponse)
et interface d'administration responsive (invités, réservations de gîtes, contenu, sécurité).
Tout tourne chez vous, en deux conteneurs Docker, sans service tiers (hors tuiles de carte OpenStreetMap).

---

## Sommaire

1. [Architecture et choix techniques](#1-architecture-et-choix-techniques)
2. [Arborescence](#2-arborescence)
3. [Déploiement pas à pas](#3-déploiement-pas-à-pas)
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
- Hébergements : carte, fiches, places restantes en temps réel, demande de réservation
  (refusée automatiquement si le gîte est complet)
- Formulaire de réponse (présence, adultes/enfants, régime, message)
- Anti-spam : champ piège invisible + limitation de débit + code d'invitation optionnel
- `noindex` : le site n'est pas référencé par les moteurs de recherche

**Côté administration** (`https://paulineetantoine.fr/admin/`)
- Tableau de bord : personnes attendues, foyers présents / absents / sans réponse, taux de réponse,
  remplissage des gîtes, régimes alimentaires, derniers messages
- Invités : recherche, filtres, ajout / modification / suppression, **collage d'une liste depuis Excel**,
  export CSV (s'ouvre directement dans Excel)
- Gîtes : ajout / modification avec **placement sur carte d'un simple clic**, capacité, validation /
  annulation des réservations en un bouton, export CSV
- Lieux : programme et positions sur la carte
- Contenu : date, textes, thème et couleurs, menu (étapes réordonnables), ouverture/fermeture des formulaires
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
│       ├── auth.js             # mot de passe (scrypt) et sessions
│       ├── util.js             # validation, CSV, fuseaux horaires, anti-spam
│       └── routes/
│           ├── public.js       # contenu, RSVP, réservations, agenda .ics
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
        ├── admin/index.html, admin.css, admin.js   # administration
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
| Voir combien de personnes viennent | **Accueil** |
| Ajouter ma liste d'invités | **Invités → Coller une liste** (un nom par ligne, « Nom;2 » pour 2 adultes) |
| Noter une réponse reçue par téléphone | **Invités → cliquer sur le nom → Réponse** |
| Donner les chiffres au traiteur | **Accueil** (régimes) ou **Invités → Exporter (Excel)** |
| Valider une demande de gîte | **Gîtes → Valider** |
| Agrandir un gîte complet | **Gîtes → Modifier → Capacité** |
| Changer la date, le menu, les couleurs | **Contenu → Enregistrer** |
| Fermer les réponses après la date limite | **Contenu → Ouverture des formulaires** |
| Exiger un code (imprimé sur le faire-part) | **Sécurité → Code d'invitation** |

Placer un lieu ou un gîte sur la carte : dans la fenêtre de modification, cliquez sur la carte
(le repère est ensuite déplaçable). Vous pouvez aussi coller des coordonnées copiées depuis
OpenStreetMap ou Google Maps (« 43.6112, 1.3349 ») dans le champ *Latitude*.

---

## 6. Sauvegardes

Toutes les données tiennent dans `DATA_PATH` (`mariage.sqlite` + fichiers `-wal`/`-shm`).
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
| Modifs du site non visibles chez un invité | Cache navigateur (1 h max pour CSS/JS) → actualisation forcée |
