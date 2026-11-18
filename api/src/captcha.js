/**
 * Captcha maison (aucun service tiers) : une petite addition à résoudre.
 * Le serveur ne stocke pas la réponse : elle est scellée dans un jeton signé (HMAC),
 * valable 30 minutes et utilisable une seule fois.
 */
'use strict';

const crypto = require('node:crypto');
const { getPrivate, setPrivate } = require('./db');
const { HttpError, str } = require('./util');

const TTL_MS = 30 * 60_000;
const used = new Map(); // nonce -> expiration (anti-rejeu)

/** Clé de signature conservée en base pour survivre aux redémarrages. */
function secret() {
  let s = getPrivate('captcha_secret');
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    setPrivate('captcha_secret', s);
  }
  return s;
}

const sign = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('base64url');

function createCaptcha() {
  const a = crypto.randomInt(2, 10);
  const b = crypto.randomInt(2, 10);
  const exp = Date.now() + TTL_MS;
  const nonce = crypto.randomBytes(9).toString('base64url');
  return {
    question: `Combien font ${a} + ${b} ?`,
    token: `${exp}.${nonce}.${sign(`${exp}.${nonce}.${a + b}`)}`,
  };
}

/** Lève une erreur 400 si la réponse est fausse, expirée ou déjà utilisée. */
function verifyCaptcha(token, answer) {
  const [exp, nonce, mac] = str(token, 200).split('.');
  const value = Number.parseInt(str(answer, 5), 10);
  const fail = (msg) => { throw new HttpError(400, msg); };
  if (!exp || !nonce || !mac || !Number.isFinite(value)) fail('Merci de répondre à la question anti-robot.');
  if (Number(exp) < Date.now()) fail('La question anti-robot a expiré : une nouvelle question vous est proposée.');
  if (used.has(nonce)) fail('Cette question a déjà servi : une nouvelle question vous est proposée.');
  const expected = Buffer.from(sign(`${exp}.${nonce}.${value}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    used.set(nonce, Number(exp));
    fail('Réponse incorrecte à la question anti-robot.');
  }
  used.set(nonce, Number(exp));
}

setInterval(() => {
  const now = Date.now();
  for (const [n, exp] of used) if (exp < now) used.delete(n);
}, 10 * 60_000).unref();

module.exports = { createCaptcha, verifyCaptcha };
