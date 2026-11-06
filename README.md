# monmariage

Site du mariage de Pauline & Antoine, pour **paulineetantoine.fr**.

- **Le lieu** avec une carte OpenStreetMap, un bouton Itinéraire et un bouton Waze
- **Le programme** de la journée, **le menu** et une **FAQ**
- **Où dormir** : une carte avec le lieu et tous les gîtes. Cliquer sur une fiche centre la carte sur le gîte. Si tu ne précises pas la distance, elle est calculée automatiquement.
- **Le formulaire de réponse** : présent ou absent, adultes, enfants, régime, gîte choisi, brunch, message. Une nouvelle réponse au même nom remplace l'ancienne.
- **L'espace `/admin`** : totaux, occupation de chaque gîte, liste des régimes pour le traiteur, export CSV pour Excel, suppression d'une réponse
- **`/admin/gites`** : ajouter un gîte avec simplement son nom et son adresse. Il est placé automatiquement sur la carte du site. Le marqueur peut être ajusté à la main, et la page permet aussi de modifier, réordonner ou supprimer un gîte.
- **Options** : un code d'accès pour les invités, et une notification Discord ou ntfy à chaque réponse

Le tout tient dans une seule image Docker : Node 24, Express et SQLite (module natif, rien à compiler).

## Où sont les données

| Quoi | Où | Dans le dépôt ? |
|---|---|---|
| Code du site | ce dépôt | oui |
| Textes, lieu, menu, programme | `/config/contenu.json` sur Bretzel | **non** |
| Gîtes (saisis dans `/admin/gites`) | `/data/reponses.sqlite` sur Bretzel | **non** |
| Photos | `/config/images/` sur Bretzel, servies en `/images/...` | **non** |
| Réponses des invités | `/data/reponses.sqlite` sur Bretzel | **non** |

Modifier `contenu.json` prend effet immédiatement : il suffit de recharger la page, sans reconstruire ni redémarrer.

## Installation sur Bretzel

### 1. Autoriser Bretzel à télécharger l'image privée (une seule fois)

Sur GitHub, va dans *Settings → Developer settings → Personal access tokens → Tokens (classic)* et crée un token avec le seul scope **`read:packages`**. Ensuite, dans le terminal d'Unraid :

```bash
docker login ghcr.io -u ankister    # colle le token comme mot de passe
```

### 2. Créer les dossiers

```bash
mkdir -p /mnt/user/appdata/monmariage/{config,data}
chown -R 99:100 /mnt/user/appdata/monmariage
```

### 3. Lancer

Dans Compose Manager Plus, crée une stack `monmariage` :

1. Colle le contenu de `docker-compose.yml`.
2. Crée le `.env` à partir de `.env.exemple`. Pour générer les secrets : `openssl rand -hex 24`.
3. Lance la stack.

Au premier démarrage, un `contenu.json` d'exemple est créé dans `/mnt/user/appdata/monmariage/config/`. Il ne reste qu'à le personnaliser.

Pour vérifier : le site répond sur `http://192.168.1.55:3030` et l'admin sur `http://192.168.1.55:3030/admin`. Le navigateur demande un identifiant : mets ce que tu veux, avec le mot de passe `ADMIN_PASSWORD`.

## Mettre le site en ligne sur paulineetantoine.fr

### Option A : Cloudflare Tunnel (recommandée : aucun port ouvert, IP cachée)

1. Sur Cloudflare, ajoute le domaine `paulineetantoine.fr` (offre gratuite). Cloudflare te donne 2 serveurs DNS.
2. Dans l'espace client OVH, va dans *Domaines → paulineetantoine.fr → Serveurs DNS → Modifier* et remplace les serveurs DNS d'OVH par ceux de Cloudflare. La propagation prend de quelques minutes à 24 h. Le domaine reste enregistré et facturé chez OVH.
3. Dans *Zero Trust → Networks → Tunnels*, ouvre ton tunnel existant et ajoute deux *Public Hostnames* :
   - `paulineetantoine.fr` → `http://192.168.1.55:3030`
   - `www.paulineetantoine.fr` → `http://192.168.1.55:3030`

### Option B : DNS chez OVH + Nginx Proxy Manager

1. Dans la zone DNS OVH, crée un enregistrement `A` pour `paulineetantoine.fr` et un pour `www`, tous deux vers ton IP publique Freebox. Si ton IP change, utilise DynHost.
2. Sur la Freebox, redirige les ports 80 et 443 vers NPM.
3. Dans NPM, crée un proxy host pour `paulineetantoine.fr` et `www.paulineetantoine.fr` vers `192.168.1.55:3030`. Active *Websockets* et un certificat SSL Let's Encrypt avec *Force SSL*.

## Personnaliser `contenu.json`

- **Coordonnées GPS** : clic droit dans OpenStreetMap ou Google Maps pour les copier. Le format est décimal avec un point (`43.6045`).
- **Gîtes** : ils ne se gèrent plus dans ce fichier, mais dans **`/admin/gites`** (voir plus bas). Seul le texte d'introduction `gites_intro` reste ici.
- **Photos** : dépose-les dans `config/images/` et indique `"/images/nom-du-fichier.jpg"`.
- **Réponses** :
  - `rsvp.date_limite` (`AAAA-MM-JJ`) : après cette date, le formulaire se ferme.
  - `rsvp.demander_brunch` : à `false`, la question du brunch disparaît.
- Une section que tu supprimes (`programme`, `infos`…) disparaît du site et du menu.
- En cas de JSON invalide (virgule en trop, guillemet oublié), le site affiche une erreur. Pour vérifier le fichier : `python3 -m json.tool contenu.json`.

## Gérer les gîtes (`/admin/gites`)

1. Saisis le **nom** et l'**adresse**, puis clique sur **Enregistrer**. Le gîte apparaît aussitôt sur la carte du site.
2. Pour vérifier la position avant d'enregistrer, clique sur **📍 Localiser**. La meilleure correspondance est placée (marqueur rouge) et les autres propositions s'affichent en liste.
3. Si l'adresse est imprécise (lieu-dit, chemin sans numéro), **déplace le marqueur rouge** ou **clique sur la carte** pour le placer.
4. Le bloc *Plus d'informations* sert à ajouter la capacité, le prix, le téléphone, le lien de réservation, une photo et une remarque.
5. Les boutons ▲ ▼ changent l'ordre d'affichage, qui donne aussi les numéros sur la carte. ✏️ modifie, 🗑 supprime.

Le géocodage interroge d'abord la **Géoplateforme de l'IGN** (Base Adresse Nationale), qui est précise pour les adresses françaises. Si elle ne trouve rien, il essaie **Nominatim (OpenStreetMap)**, qui connaît aussi les lieux-dits et les noms d'établissements. Aucune clé n'est nécessaire.

Les gîtes saisis dans le `contenu.json` d'une ancienne version sont importés automatiquement, une seule fois, au premier démarrage.

## Options (`.env`)

| Variable | Rôle |
|---|---|
| `ADMIN_PASSWORD` | mot de passe de `/admin` (obligatoire) |
| `SESSION_SECRET` | sert à signer le cookie du code d'accès |
| `SITE_CODE` | si renseigné, les invités doivent saisir ce code (sans tenir compte des majuscules) avant de voir le site. Pratique pour garder l'adresse privée. |
| `DISCORD_WEBHOOK_URL` | notification Discord à chaque réponse |
| `NTFY_URL` | notification ntfy, par ex. `https://ntfy.sh/un-sujet-secret` |
| `GEOCODER_USER_AGENT` | identifiant envoyé à Nominatim. Sa politique d'usage demande un contact, par ex. `monmariage/1.0 (contact@paulineetantoine.fr)` |

## Mettre à jour le site

Après un `git push` sur `main`, GitHub Actions construit l'image `ghcr.io/ankister/monmariage:latest`, qui reste privée comme le dépôt. Sur Bretzel :

```bash
docker compose pull && docker compose up -d
```

Watchtower ou Diun peuvent faire cette mise à jour automatiquement.

## Sauvegarde

Tout ce qu'il faut sauvegarder se trouve dans `/mnt/user/appdata/monmariage/`, que le plugin Appdata Backup couvre déjà. Pense aussi à faire régulièrement un export CSV depuis `/admin`.

## Développement local

```bash
npm install
npm run dev     # http://localhost:8080 — contenu d'exemple, admin : mot de passe « admin »
```
