/**
 * Point d'entrée de l'API du site de mariage.
 * Nginx (conteneur « web ») sert les fichiers statiques et relaie /api/* vers ce serveur.
 */
'use strict';

const express = require('express');
require('./db'); // crée le schéma + données d'exemple
const auth = require('./auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const roomRoutes = require('./routes/rooms');
const siteRoutes = require('./routes/site');
const gameRoutes = require('./routes/games');
const appearanceRoutes = require('./routes/appearance');
const access = require('./access');
const musicRoutes = require('./routes/music');
const { HttpError } = require('./util');

auth.initAdminPassword();
auth.initInviteCode();

const app = express();
app.disable('x-powered-by');
// Fait confiance aux proxys du réseau local (Nginx du conteneur web + Nginx Proxy Manager)
// pour récupérer la vraie IP du visiteur et savoir si la connexion est en HTTPS.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');
app.use(express.json({ limit: '200kb' }));

/**
 * Protection CSRF : les requêtes qui modifient des données doivent être en JSON
 * et provenir du même site (en-tête Origin). Combiné au cookie SameSite=Strict.
 */
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // DELETE sans corps : un formulaire HTML ne peut pas émettre de DELETE, et fetch cross-site déclenche un preflight CORS refusé
  const hasBody = Number(req.get('content-length') || 0) > 0 || req.get('transfer-encoding');
  // Seul l'envoi de photos (admin) accepte un corps image ; tout le reste est en JSON
  const isPhotoUpload = /^\/api\/admin\/(rooms\/\d+\/photos|logo)$/.test(req.path) && req.is(['image/jpeg', 'image/png', 'image/webp']);
  if ((req.method !== 'DELETE' || hasBody) && !isPhotoUpload && !req.is('application/json')) {
    return res.status(415).json({ error: 'Format de requête non supporté.' });
  }
  const origin = req.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origine refusée.' });
    } catch {
      return res.status(403).json({ error: 'Origine refusée.' });
    }
  }
  next();
});

app.use('/api/admin', adminRoutes);
// Site réservé aux invités (si activé) : les routes publiques demandent une session
app.use('/api', access.publicRouter);
app.use('/api', appearanceRoutes.publicRouter);
app.use('/api', access.guard);
app.use('/api', publicRoutes);
app.use('/api', musicRoutes.publicRouter);
app.use('/api', roomRoutes.publicRouter);
app.use('/api', siteRoutes.publicRouter);
app.use('/api', gameRoutes.publicRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Ressource introuvable.' }));

// Gestion centralisée des erreurs (Express 5 transmet aussi les erreurs des fonctions async)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500 && !(err instanceof HttpError)) console.error(err);
  // Nos messages (HttpError) sont rédigés pour l'utilisateur ; les autres erreurs restent génériques
  const message = err instanceof HttpError ? err.message : status < 500 ? 'Requête invalide.' : 'Erreur interne du serveur.';
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`[api] à l'écoute sur le port ${PORT}`));
