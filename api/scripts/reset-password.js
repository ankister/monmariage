#!/usr/bin/env node
/**
 * Réinitialise le mot de passe admin directement en base (mot de passe oublié).
 * Usage : docker compose exec api node scripts/reset-password.js
 */
'use strict';

const { hashPassword, ask } = require('./hash-password');

(async () => {
  const pwd = await ask('Nouveau mot de passe admin (10 caractères min.) : ');
  if (pwd.length < 10) {
    console.error('Trop court.');
    process.exit(1);
  }
  const again = await ask('Confirmez : ');
  if (pwd !== again) {
    console.error('Les mots de passe ne correspondent pas.');
    process.exit(1);
  }
  const { setPrivate, db } = require('../src/db');
  setPrivate('admin_password_hash', hashPassword(pwd));
  db.prepare('DELETE FROM sessions').run(); // déconnecte toutes les sessions
  console.log('Mot de passe mis à jour. Toutes les sessions ont été fermées.');
})();
