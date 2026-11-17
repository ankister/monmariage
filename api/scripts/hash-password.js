#!/usr/bin/env node
/**
 * Génère un hash scrypt à coller dans ADMIN_PASSWORD_HASH (fichier .env).
 * Usage : docker compose run --rm api node scripts/hash-password.js
 * Le mot de passe est demandé de façon masquée (il n'apparaît pas dans l'historique du shell).
 */
'use strict';

const crypto = require('node:crypto');
const readline = require('node:readline');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Saisie masquée : les caractères tapés s'affichent sous forme d'astérisques. */
function ask(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      // Entrée redirigée (pipe) : lecture d'une ligne, sans écho
      const rl = readline.createInterface({ input: stdin });
      rl.once('line', (line) => { rl.close(); process.stdout.write('\n'); resolve(line); });
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') {
          if (value.length) { value = value.slice(0, -1); process.stdout.write('\b \b'); }
        } else {
          value += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

module.exports = { hashPassword, ask };

if (require.main === module) {
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
    const hash = hashPassword(pwd);
    // Les apostrophes empêchent Docker Compose d'interpréter les « $ » du hash
    console.log('\nCopiez cette ligne telle quelle dans votre fichier .env :\n');
    console.log(`ADMIN_PASSWORD_HASH='${hash}'\n`);
  })();
}
