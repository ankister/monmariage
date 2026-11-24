/**
 * Le grand jour se prépare — jeu de rapidité : installer la décoration de trois salles (mairie, église, jardin)
 * avant l'arrivée des invités, pendant que les témoins farceurs chipent la déco.
 * Prénoms et témoins : attributs data-* de <body>, remplis au démarrage du conteneur
 * (PRENOM_MARIE, PRENOM_MARIEE, TEMOINS_MARIE, TEMOINS_MARIEE). Sons synthétisés (Web Audio).
 */
'use strict';
{
const $ = (s) => document.querySelector(s);
const W = 600, H = 720; // plan logique (portrait : l'allée centrale descend de l'autel vers l'entrée)
const cv = $('#cv');
let ctx = cv.getContext('2d');
const mainCtx = ctx;

/* =====================================================================
   Configuration : noms
   ===================================================================== */
function parseWitnesses(str, team) {
  return String(str || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
    .map((s) => { const p = s.split(/\s*[:/]\s*/); return { name: (p[0] || 'Témoin').slice(0, 16), sex: /^f/i.test(p[1] || '') ? 'F' : 'H', team }; });
}
/** Valeur injectée par le serveur ; marqueur non remplacé ou vide = valeur d'exemple. */
const injected = (v, def) => (!v || /^__[A-Z_]+__$/.test(v) || v.includes('${') ? def : v);
let CFG;
function readCfg() {
  const D = document.body.dataset;
  const marie = injected(D.marie, 'Hugo').slice(0, 20), mariee = injected(D.mariee, 'Léa').slice(0, 20);
  let tm = parseWitnesses(injected(D.tm, 'Julien:H, Camille:F'), 'marie'), tf = parseWitnesses(injected(D.tf, 'Sarah:F, Thomas:H'), 'mariee');
  if (!tm.length) tm = [{ name: 'Le témoin', sex: 'H', team: 'marie' }];
  if (!tf.length) tf = [{ name: 'La témoin', sex: 'F', team: 'mariee' }];
  CFG = { marie, mariee, couple: `${mariee} & ${marie}`, pranksters: [...tm, ...tf] };
  $('#menuText').textContent = `Demain, ${CFG.couple} se disent oui… et rien n’est installé ! Mets en place la décoration de la mairie, de l’église puis du jardin avant l’arrivée des invités. `
    + `Méfie-toi de ${CFG.pranksters.map((p) => p.name).join(', ')} : les témoins ont décidé de jouer les farceurs.`;
}

/* =====================================================================
   Éléments de décoration (dessinés vus du dessus)
   ===================================================================== */
const PALETTE = { pink: '#f29bb6', pinkD: '#d9668c', white: '#fffaf4', cream: '#f4ead8', gold: '#e0b354', leaf: '#5f9a4c', leafD: '#3f7a35', wood: '#8a5a36' };
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function flower(x, y, r, c) {
  ctx.fillStyle = c;
  for (let i = 0; i < 5; i++) { const a = i * 1.2566; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .5, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x, y, r * .28, 0, 7); ctx.fill();
}
function bouquet(x, y, s, main, alt) {
  ctx.fillStyle = PALETTE.leafD;
  for (let i = 0; i < 6; i++) { const a = i * 1.047 + .3; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * s * .8, y + Math.sin(a) * s * .8, s * .42, s * .2, a, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#0002'; ctx.beginPath(); ctx.arc(x + 2, y + 3, s * .78, 0, 7); ctx.fill();
  const pts = [[0, 0], [-.45, -.3], [.45, -.3], [-.45, .35], [.45, .35], [0, -.55], [0, .55]];
  pts.forEach(([dx, dy], i) => flower(x + dx * s, y + dy * s, s * .42, i % 3 === 1 ? alt : main));
}
const ITEMS = {
  chaise: {
    art: 'une chaise', label: 'Chaise', w: 32, h: 32,
    draw(x, y) {
      ctx.fillStyle = '#0003'; rr(x - 14, y - 12, 30, 30, 6); ctx.fill();
      ctx.fillStyle = PALETTE.white; rr(x - 15, y - 15, 30, 28, 6); ctx.fill();
      ctx.strokeStyle = '#e6d8c6'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#e9dccb'; rr(x - 15, y + 9, 30, 7, 3); ctx.fill();
      ctx.fillStyle = PALETTE.pink; ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x - 7, y + 7); ctx.lineTo(x - 7, y + 17); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y + 12); ctx.lineTo(x + 7, y + 7); ctx.lineTo(x + 7, y + 17); ctx.closePath(); ctx.fill();
      ctx.fillStyle = PALETTE.pinkD; ctx.beginPath(); ctx.arc(x, y + 12, 2.6, 0, 7); ctx.fill();
    },
    ghost(x, y) { rr(x - 15, y - 15, 30, 31, 6); },
  },
  fauteuil: {
    art: 'un fauteuil', short: 'Fauteuil', label: 'Fauteuil des mariés', w: 44, h: 42,
    draw(x, y) {
      ctx.fillStyle = '#0003'; rr(x - 19, y - 16, 42, 40, 9); ctx.fill();
      ctx.fillStyle = '#7b2450'; rr(x - 21, y - 19, 42, 40, 9); ctx.fill();
      ctx.strokeStyle = PALETTE.gold; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#a33a6c'; rr(x - 13, y - 13, 26, 24, 6); ctx.fill();
      ctx.fillStyle = '#5e1a3c'; rr(x - 21, y + 12, 42, 9, 4); ctx.fill();
      ctx.fillStyle = PALETTE.white; ctx.beginPath(); ctx.arc(x, y - 1, 5, 0, 7); ctx.fill();
      ctx.fillStyle = PALETTE.gold; ctx.font = '700 9px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♥', x, y);
    },
    ghost(x, y) { rr(x - 21, y - 19, 42, 40, 9); },
  },
  bouquet_blanc: {
    art: 'un bouquet blanc', label: 'Bouquet blanc', w: 40, h: 40, tint: '#ffffff',
    draw(x, y) { bouquet(x, y, 17, PALETTE.white, '#f1e6d6'); },
    ghost(x, y) { ctx.beginPath(); ctx.arc(x, y, 19, 0, 7); },
  },
  bouquet_rose: {
    art: 'un bouquet rose', label: 'Bouquet rose', w: 40, h: 40, tint: '#f29bb6',
    draw(x, y) { bouquet(x, y, 17, PALETTE.pink, '#fbd3df'); },
    ghost(x, y) { ctx.beginPath(); ctx.arc(x, y, 19, 0, 7); },
  },
  cierge: {
    art: 'un cierge', label: 'Cierge', w: 26, h: 26,
    draw(x, y, t = 0) {
      const g = ctx.createRadialGradient(x, y, 2, x, y, 22); g.addColorStop(0, '#ffe3a088'); g.addColorStop(1, '#ffe3a000');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill();
      ctx.fillStyle = PALETTE.gold; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
      ctx.fillStyle = PALETTE.cream; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(x + Math.sin(t * 9) * .8, y, 3.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff4c2'; ctx.beginPath(); ctx.arc(x, y, 1.7, 0, 7); ctx.fill();
    },
    ghost(x, y) { ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); },
  },
  lanterne: {
    art: 'une lanterne', label: 'Lanterne', w: 30, h: 30,
    draw(x, y, t = 0) {
      const g = ctx.createRadialGradient(x, y, 3, x, y, 26); g.addColorStop(0, '#ffd98a99'); g.addColorStop(1, '#ffd98a00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#2f2a33'; rr(x - 12, y - 12, 24, 24, 4); ctx.fill();
      ctx.fillStyle = '#fff1c9'; rr(x - 8, y - 8, 16, 16, 3); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(x, y, 3.5 + Math.sin(t * 7) * .5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#2f2a33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.stroke();
    },
    ghost(x, y) { rr(x - 12, y - 12, 24, 24, 4); },
  },
  ruban: {
    art: 'un nœud de banc', short: 'Nœud', label: 'Nœud de banc', w: 30, h: 30,
    draw(x, y) {
      ctx.fillStyle = PALETTE.leafD; ctx.beginPath(); ctx.ellipse(x, y + 9, 5, 10, 0, 0, 7); ctx.fill();
      ctx.fillStyle = PALETTE.pink;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 13, y - 8); ctx.lineTo(x - 13, y + 8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 13, y - 8); ctx.lineTo(x + 13, y + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = PALETTE.pinkD; ctx.fillRect(x - 3, y + 2, 2.5, 11); ctx.fillRect(x + 1, y + 2, 2.5, 13);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      flower(x, y - 10, 6, PALETTE.white);
    },
    ghost(x, y) { ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); },
  },
  tapis: {
    art: 'le tapis', short: 'Tapis', label: 'Tapis d’allée', w: 40, h: 40,
    draw(x, y, t, tg) {
      const w = tg ? tg.w : 22, h = tg ? tg.h : 36, c = (tg && tg.color) || '#f6efe4';
      ctx.fillStyle = '#0002'; ctx.fillRect(x - w / 2 + 3, y - h / 2 + 3, w, h);
      ctx.fillStyle = c; ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeStyle = PALETTE.gold; ctx.lineWidth = tg ? 3 : 2; ctx.strokeRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6);
      if (tg) {
        ctx.fillStyle = (tg.color === '#b03045') ? '#d9506a' : '#f6b6c8';
        for (let yy = y - h / 2 + 22; yy < y + h / 2 - 10; yy += 46) { ctx.beginPath(); ctx.arc(x - w / 4, yy, 2.5, 0, 7); ctx.arc(x + w / 5, yy + 20, 2.5, 0, 7); ctx.fill(); }
      }
    },
    ghost(x, y, tg) { ctx.beginPath(); ctx.rect(x - tg.w / 2, y - tg.h / 2, tg.w, tg.h); },
  },
  arche: {
    art: 'l’arche', label: 'Arche fleurie', w: 44, h: 40,
    draw(x, y, t, tg) {
      const w = tg ? tg.w : 40, s = tg ? 1 : .2;
      ctx.fillStyle = '#0003'; rr(x - w / 2 + 3, y - 6, w, 16, 8); ctx.fill();
      ctx.fillStyle = PALETTE.wood; rr(x - w / 2, y - 9, w, 14, 7); ctx.fill();
      ctx.fillStyle = '#6b4126'; ctx.beginPath(); ctx.arc(x - w / 2 + 8, y - 2, 9 * (tg ? 1 : .5), 0, 7); ctx.arc(x + w / 2 - 8, y - 2, 9 * (tg ? 1 : .5), 0, 7); ctx.fill();
      if (!tg) { flower(x, y - 2, 8, PALETTE.pink); return; }
      ctx.fillStyle = PALETTE.leaf;
      for (let i = 0; i <= 14; i++) { const xx = x - w / 2 + 12 + i * (w - 24) / 14; ctx.beginPath(); ctx.ellipse(xx, y - 2 + (i % 2 ? 6 : -6), 9, 5, i, 0, 7); ctx.fill(); }
      for (let i = 0; i <= 9; i++) { const xx = x - w / 2 + 16 + i * (w - 32) / 9; flower(xx, y - 2 + (i % 2 ? 4 : -5), 7 + (i % 3), i % 3 ? PALETTE.pink : PALETTE.white); }
      void s;
    },
    ghost(x, y, tg) { rr(x - tg.w / 2, y - 12, tg.w, 22, 10); },
  },
  pancarte: {
    art: 'le panneau', short: 'Panneau', label: 'Panneau de bienvenue', w: 50, h: 40,
    draw(x, y) {
      ctx.fillStyle = '#0003'; ctx.fillRect(x - 27, y - 14, 58, 34);
      ctx.fillStyle = PALETTE.wood; ctx.fillRect(x - 30, y - 18, 60, 34);
      ctx.fillStyle = PALETTE.cream; ctx.fillRect(x - 26, y - 14, 52, 26);
      ctx.fillStyle = '#8a2c5c'; ctx.font = '400 15px "Great Vibes", cursive'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Bienvenue', x, y - 2);
    },
    ghost(x, y) { ctx.beginPath(); ctx.rect(x - 30, y - 18, 60, 34); },
  },
  panier: {
    art: 'le panier de pétales', short: 'Pétales', label: 'Panier de pétales', w: 36, h: 36,
    draw(x, y) {
      ctx.fillStyle = '#0003'; ctx.beginPath(); ctx.arc(x + 2, y + 3, 16, 0, 7); ctx.fill();
      ctx.fillStyle = '#c49a6c'; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a07a4f'; ctx.lineWidth = 2; for (let r = 6; r < 16; r += 4) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); }
      const c = [PALETTE.pink, PALETTE.white, PALETTE.pinkD];
      for (let i = 0; i < 9; i++) { ctx.fillStyle = c[i % 3]; ctx.beginPath(); ctx.ellipse(x + Math.cos(i * 2.4) * 8, y + Math.sin(i * 2.4) * 8, 4, 2.4, i, 0, 7); ctx.fill(); }
    },
    ghost(x, y) { ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); },
  },
};

/* =====================================================================
   Les trois salles
   ===================================================================== */
function grid(type, xs, ys) { const a = []; for (const y of ys) for (const x of xs) a.push({ type, x, y }); return a; }
const ROOMS = [
  {
    name: 'La salle des mariages', short: 'Mairie', time: 60, prankEvery: 12, floor: 'parquet', carpet: '#b03045',
    intro: (c) => `Première étape : la mairie ! Le maire arrive dans une minute. Chaises, fauteuils des mariés, bouquets blancs et tapis rouge.`,
    targets: () => [
      { type: 'fauteuil', x: 255, y: 160 }, { type: 'fauteuil', x: 345, y: 160 },
      { type: 'bouquet_blanc', x: 150, y: 84 }, { type: 'bouquet_blanc', x: 450, y: 84 },
      { type: 'tapis', x: 300, y: 450, w: 58, h: 470 },
      ...grid('chaise', [80, 135, 190, 410, 465, 520], [270, 330, 390]),
      { type: 'pancarte', x: 520, y: 660 },
    ],
  },
  {
    name: 'L’église', short: 'Église', time: 55, prankEvery: 10, floor: 'pierre', carpet: '#f6efe4',
    intro: (c) => `À l’église maintenant : un nœud au bout de chaque banc, les cierges près de l’autel, les bouquets blancs devant, les roses à l’entrée.`,
    targets: () => [
      { type: 'cierge', x: 185, y: 120 }, { type: 'cierge', x: 225, y: 120 }, { type: 'cierge', x: 375, y: 120 }, { type: 'cierge', x: 415, y: 120 },
      { type: 'bouquet_blanc', x: 110, y: 84 }, { type: 'bouquet_blanc', x: 490, y: 84 },
      { type: 'tapis', x: 300, y: 420, w: 58, h: 520 },
      ...[220, 285, 350, 415, 480].flatMap((y) => [{ type: 'ruban', x: 255, y }, { type: 'ruban', x: 345, y }]),
      { type: 'bouquet_rose', x: 90, y: 640 }, { type: 'bouquet_rose', x: 510, y: 640 },
      { type: 'panier', x: 225, y: 665 },
    ],
  },
  {
    name: 'Le jardin', short: 'Jardin', time: 80, prankEvery: 8, floor: 'herbe', carpet: '#f8f1e6',
    intro: (c) => `Dernière ligne droite : la cérémonie laïque au jardin ! L’arche fleurie, les chaises, les lanternes le long de l’allée et les bouquets roses.`,
    targets: () => [
      { type: 'arche', x: 300, y: 70, w: 240 },
      { type: 'bouquet_rose', x: 155, y: 82 }, { type: 'bouquet_rose', x: 445, y: 82 },
      { type: 'tapis', x: 300, y: 405, w: 58, h: 520 },
      ...grid('chaise', [70, 125, 180, 420, 475, 530], [200, 255, 310, 365]),
      ...grid('lanterne', [250, 350], [455, 540, 625]),
      { type: 'pancarte', x: 85, y: 665 }, { type: 'panier', x: 515, y: 665 },
    ],
  },
];
const DOORS = [{ x: 560, y: 760 }, { x: 40, y: 760 }];

/* =====================================================================
   Sons et musique (synthétisés)
   ===================================================================== */
let actx = null, soundOn = true, musicOn = true, musicTimer = null, musicStep = 0, musicNext = 0, master = null;
function audio() {
  actx = actx || new (window.AudioContext || window.webkitAudioContext)();
  if (!master) { master = actx.createGain(); master.gain.value = .5; master.connect(actx.destination); }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function note(f, t, d, type = 'triangle', vol = .1, dest) {
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g).connect(dest || master); o.start(t); o.stop(t + d + .05);
}
function sfx(kind, combo = 1) {
  if (!soundOn) return;
  try {
    audio(); const t = actx.currentTime;
    const up = Math.min(combo, 8) * 30;
    const seq = {
      place: [[660 + up, .07], [990 + up, .11]], error: [[180, .14], [140, .22]], steal: [[523, .08], [392, .08], [262, .22]],
      shoo: [[784, .05], [1046, .05], [1318, .12]], done: [[523, .1], [659, .1], [784, .1], [1046, .3]], tick: [[1400, .03]], select: [[880, .04]],
    }[kind] || [];
    let tt = t;
    for (const [f, d] of seq) { note(f, tt, d, kind === 'error' ? 'square' : 'triangle', kind === 'error' ? .06 : .1); tt += d * .85; }
  } catch { /* son indisponible */ }
}
// Petite valse originale en fa majeur (mesure à 3 temps) : basse + accord + mélodie
const MEL = [72, 0, 74, 76, 0, 72, 77, 0, 76, 74, 0, 72, 70, 0, 72, 74, 0, 69, 72, 0, 70, 69, 0, 67, 65, 0, 69, 72, 0, 77, 76, 0, 74, 72, 0, 0];
const BASS = [41, 46, 41, 36, 41, 46, 43, 36, 41, 46, 36, 41];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
function musicTick() {
  if (!musicOn || !actx || !game || !game.running || game.paused) return;
  const beat = 60 / 132;
  while (musicNext < actx.currentTime + .25) {
    const s = musicStep % 36, bar = Math.floor(musicStep / 3) % 12, t = musicNext;
    if (s % 3 === 0) note(midi(BASS[bar]), t, beat * 1.4, 'triangle', .07);
    else note(midi(BASS[bar] + 12 + (s % 3 === 1 ? 4 : 7)), t, beat * .5, 'sine', .03);
    if (MEL[s]) note(midi(MEL[s]), t, beat * .9, 'sine', .045);
    musicNext += beat; musicStep++;
  }
}
function startMusic() {
  if (!musicOn) return;
  try { audio(); musicNext = actx.currentTime + .1; clearInterval(musicTimer); musicTimer = setInterval(musicTick, 80); } catch { /* rien */ }
}
function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

/* =====================================================================
   Partie
   ===================================================================== */
let game = null, held = null, hover = null, drag = null;
const tray = $('#tray');
const trayIcons = {};

function newGame() {
  game = { running: false, paused: false, room: 0, score: 0, totalPlaced: 0, shooed: 0, stolen: 0, errors: 0, roomsDone: 0, perfect: 0 };
  startRoom(0);
}
function startRoom(i) {
  const R = ROOMS[i];
  Object.assign(game, {
    room: i, t: R.time, targets: R.targets().map((tg) => ({ ...tg, filled: false, pop: 0, color: tg.type === 'tapis' ? R.carpet : undefined })),
    pranksters: [], nextPrank: 6, combo: 0, lastPlace: -9, roomErrors: 0, parts: [], floaters: [], warned: false, tick: 10, clock: 0,
    running: true, paused: false,
  });
  game.counts = {};
  for (const tg of game.targets) game.counts[tg.type] = (game.counts[tg.type] || 0) + 1;
  held = null;
  buildTray();
  say(`<b>${esc(CFG.mariee)} :</b> ${esc(R.intro())}`);
  hud();
}
const filledCount = () => game.targets.filter((t) => t.filled).length;

function buildTray() {
  tray.textContent = '';
  Object.keys(game.counts).forEach((type, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.type = type;
    b.setAttribute('aria-label', `${ITEMS[type].label} (touche ${i + 1})`);
    const c = document.createElement('canvas'); c.width = 80; c.height = 80;
    const lab = document.createElement('span'); lab.textContent = ITEMS[type].short || ITEMS[type].label;
    const n = document.createElement('span'); n.className = 'n';
    b.append(c, lab, n); tray.append(b);
    trayIcons[type] = c; drawIcon(c, type);
  });
  updateTray();
}
function drawIcon(c, type) {
  const g = c.getContext('2d'), saved = ctx;
  const k = { pancarte: .62, fauteuil: .85, arche: .95 }[type] || 1; // les grands éléments sont réduits pour tenir dans l'icône
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 80, 80);
  g.setTransform(2 * k, 0, 0, 2 * k, 40 - 40 * k, 40 - 40 * k);
  // Les fonctions de dessin utilisent « ctx » : on le remplace le temps de dessiner l'icône
  ctxSwap(g, () => ITEMS[type].draw(20, 20, 0));
  void saved;
}
let ctxRef = mainCtx;
function ctxSwap(g, fn) { const keep = ctxRef; ctxRef = g; try { fn(); } finally { ctxRef = keep; } }
function updateTray() {
  for (const b of tray.children) {
    const n = game.counts[b.dataset.type] || 0;
    b.querySelector('.n').textContent = n;
    b.disabled = n === 0;
    b.classList.toggle('sel', held === b.dataset.type);
    b.setAttribute('aria-pressed', String(held === b.dataset.type));
  }
}
function select(type) {
  if (!game || !game.running || game.paused || !game.counts[type]) return;
  held = held === type ? null : type;
  if (held) sfx('select');
  updateTray();
}
tray.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && !drag?.moved) select(b.dataset.type); });

/* ---------- Placer un élément ---------- */
function targetAt(x, y, pred, maxD) {
  let best = null, bd = maxD;
  for (const tg of game.targets) {
    if (!pred(tg)) continue;
    let d;
    if (tg.type === 'tapis') d = Math.abs(x - tg.x) < tg.w / 2 + 24 && Math.abs(y - tg.y) < tg.h / 2 ? 0 : 999;
    else if (tg.type === 'arche') d = Math.abs(x - tg.x) < tg.w / 2 + 10 && Math.abs(y - tg.y) < 30 ? 0 : 999;
    else d = Math.hypot(x - tg.x, y - tg.y);
    if (d < bd) { bd = d; best = tg; }
  }
  return best;
}
function place(x, y, strict) {
  if (!held) {
    const tg = targetAt(x, y, (t) => !t.filled, 30);
    if (tg) say(`<b>${esc(CFG.marie)} :</b> Choisis d’abord dans le chariot ce qui va là : ${esc(ITEMS[tg.type].label.toLowerCase())}.`);
    return;
  }
  const tg = targetAt(x, y, (t) => !t.filled && t.type === held, strict ? 60 : 95);
  if (tg) {
    tg.filled = true; tg.pop = 1;
    game.counts[held]--;
    const now = game.clock;
    game.combo = now - game.lastPlace < 1.8 ? game.combo + 1 : 1;
    game.lastPlace = now;
    const pts = 100 + 20 * (Math.min(game.combo, 10) - 1);
    game.score += pts; game.totalPlaced++;
    floater(tg.x, tg.y - 24, game.combo > 1 ? `+${pts} ×${game.combo}` : `+${pts}`, PALETTE.gold);
    burst(tg.x, tg.y, held.startsWith('bouquet_rose') || held === 'ruban' ? PALETTE.pink : PALETTE.gold);
    sfx('place', game.combo);
    if (!game.counts[held]) held = null;
    updateTray(); hud();
    if (filledCount() === game.targets.length) roomDone();
    return;
  }
  const wrong = targetAt(x, y, (t) => !t.filled && t.type !== held, 26);
  if (wrong) {
    game.t = Math.max(0, game.t - 3); game.errors++; game.roomErrors++; game.combo = 0;
    floater(x, y - 20, '−3 s', '#ff8fa8');
    sfx('error');
    const hint = held.startsWith('bouquet') && wrong.type.startsWith('bouquet') ? 'Regarde bien la couleur des pointillés !' : `Là, c’est pour : ${ITEMS[wrong.type].label.toLowerCase()}.`;
    say(`<b>${esc(CFG.mariee)} :</b> Non, pas là ! ${esc(hint)}`);
    hud();
  }
}

/* ---------- Témoins farceurs ---------- */
let prankIndex = 0;
function spawnPrankster() {
  const filled = game.targets.filter((t) => t.filled && !game.pranksters.some((p) => p.goal === t));
  if (!filled.length) return;
  const who = CFG.pranksters[prankIndex++ % CFG.pranksters.length];
  const door = DOORS[Math.floor(Math.random() * DOORS.length)];
  const goal = filled[Math.floor(Math.random() * filled.length)];
  const speed = 70 + game.room * 18;
  game.pranksters.push({ ...who, x: door.x, y: door.y, goal, state: 'in', carry: null, speed, door, bob: Math.random() * 6 });
  sfx('steal');
  say(`<b>${esc(CFG.marie)} :</b> Attention, ${esc(who.name)} arrive… touche-le pour le chasser !`);
}
function updatePranksters(dt) {
  for (const p of game.pranksters) {
    const tx = p.state === 'in' ? p.goal.x : p.door.x, ty = p.state === 'in' ? p.goal.y : p.door.y;
    const d = Math.hypot(tx - p.x, ty - p.y), sp = p.speed * (p.state === 'flee' ? 2.4 : 1) * dt;
    p.bob += dt * 10;
    if (d > sp) { p.x += (tx - p.x) / d * sp; p.y += (ty - p.y) / d * sp; continue; }
    p.x = tx; p.y = ty;
    if (p.state === 'in') {
      if (p.goal.filled) {
        p.goal.filled = false; p.carry = p.goal.type; game.counts[p.carry]++; game.stolen++;
        sfx('steal'); floater(p.x, p.y - 30, 'Chipé !', '#ff8fa8');
        say(`<b>${esc(CFG.mariee)} :</b> ${esc(p.name)} a chipé ${esc(ITEMS[p.carry].art)} ! Touche-le pour qu’il le rende, ou remets un élément à sa place.`);
        updateTray(); hud();
      }
      p.state = 'out';
    } else p.done = true;
  }
  game.pranksters = game.pranksters.filter((p) => !p.done);
}
function shoo(x, y) {
  const p = game.pranksters.find((q) => q.state !== 'flee' && Math.hypot(q.x - x, q.y - 4 - y) < 36);
  if (!p) return false;
  if (p.carry) { // il rend l'objet : retour à sa place
    p.goal.filled = true; p.goal.pop = 1; game.counts[p.carry]--; p.carry = null; game.score += 80;
    floater(p.x, p.y - 34, 'Rendu ! +80', PALETTE.gold);
    if (filledCount() === game.targets.length) { setTimeout(roomDone, 0); }
  } else { game.score += 50; floater(p.x, p.y - 34, 'Ouste ! +50', PALETTE.gold); }
  p.state = 'flee'; game.shooed++;
  sfx('shoo'); burst(p.x, p.y, PALETTE.white);
  say(`<b>${esc(CFG.marie)} :</b> Bien joué, ${esc(p.name)} file sans demander son reste !`);
  updateTray(); hud();
  return true;
}

/* ---------- Fin de salle, fin de partie ---------- */
function roomDone() {
  if (!game.running) return;
  game.running = false;
  const left = Math.ceil(game.t), timeBonus = left * 10, perfect = game.roomErrors === 0 ? 300 : 0;
  game.score += timeBonus + perfect; game.roomsDone++; if (perfect) game.perfect++;
  sfx('done'); stopMusic(); hud();
  const R = ROOMS[game.room];
  if (game.room === ROOMS.length - 1) return endGame(true);
  $('#betweenTitle').textContent = `${R.name} est prête !`;
  $('#betweenText').textContent = perfect ? 'Sans une seule erreur : les mariés sont ravis !' : 'Les invités peuvent entrer. Direction la salle suivante !';
  $('#betweenStats').innerHTML = stat('Temps restant', `${left} s`) + stat('Bonus', `+${timeBonus + perfect}`) + stat('Points', game.score.toLocaleString('fr-FR'));
  $('#between').hidden = false; $('#next').focus();
}
const stat = (l, v) => `<div>${esc(l)}<b>${esc(String(v))}</b></div>`;
let lastScore = null, saved = false;
function endGame(won) {
  game.running = false; stopMusic(); held = null; updateTray();
  $('#endTitle').textContent = won ? 'Tout est prêt, bravo !' : 'Les invités sont là…';
  $('#endText').textContent = won
    ? `Mairie, église et jardin sont décorés à temps. ${CFG.couple} peuvent se dire oui sereinement : merci pour le coup de main !`
    : `${ROOMS[game.room].name} n’était pas tout à fait prête. Les invités s’installent quand même… mais ${CFG.mariee} a remarqué les chaises manquantes !`;
  $('#endStats').innerHTML = stat('Salles prêtes', `${game.roomsDone} / 3`) + stat('Éléments posés', game.totalPlaced) + stat('Témoins chassés', game.shooed);
  lastScore = game.score > 0 ? { score: game.score, level: game.roomsDone, won } : null;
  saved = false;
  if (lastScore) { $('#scoreTxt').textContent = game.score.toLocaleString('fr-FR'); $('#pseudo').value = readPseudo(); }
  $('#saveForm').hidden = !lastScore; $('#saveMsg').textContent = '';
  setTimeout(() => { $('#end').hidden = false; (lastScore ? $('#pseudo') : $('#again')).focus(); }, 400);
}

/* ---------- Interface : bulle, compteurs ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function say(html) { $('#bubble').innerHTML = html; }
function hud() {
  if (!game) return;
  const s = Math.max(0, Math.ceil(game.t));
  $('#time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  $('#hudTime').classList.toggle('warn', s <= 10);
  $('#score').textContent = game.score.toLocaleString('fr-FR');
  $('#room').textContent = `${game.room + 1} / 3`;
  $('#done').textContent = `${filledCount()} / ${game.targets.length}`;
}
function floater(x, y, txt, color) { game.floaters.push({ x, y, txt, color, life: 1 }); }
function burst(x, y, color) {
  for (let i = 0; i < 12; i++) { const a = Math.random() * 7, v = 40 + Math.random() * 80; game.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: .7, color }); }
}

/* =====================================================================
   Pointeur : toucher, cliquer, glisser depuis le chariot
   ===================================================================== */
function toLogical(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H, inside: ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom };
}
cv.addEventListener('pointerdown', (ev) => {
  if (!game || !game.running || game.paused) return;
  audio();
  const p = toLogical(ev);
  if (shoo(p.x, p.y)) return;
  place(p.x, p.y, false);
});
cv.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') hover = toLogical(ev); });
cv.addEventListener('pointerleave', () => { hover = null; });
tray.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('button');
  if (!b || b.disabled || !game || !game.running) return;
  drag = { type: b.dataset.type, x0: ev.clientX, y0: ev.clientY, moved: false, pos: null };
});
addEventListener('pointermove', (ev) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 10) { drag.moved = true; held = drag.type; updateTray(); }
  if (drag.moved) { const p = toLogical(ev); drag.pos = p.inside ? p : null; }
});
addEventListener('pointerup', (ev) => {
  if (!drag) return;
  const d = drag;
  if (d.moved) { const p = toLogical(ev); if (p.inside && game.running && !game.paused) place(p.x, p.y, true); }
  setTimeout(() => { drag = null; }, 0); // laisse le « click » ignorer la fin d'un glisser
});
addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') { togglePause(); return; }
  if (!game || !game.running || game.paused || ev.target.matches('input')) return;
  const n = +ev.key;
  if (n >= 1 && n <= 9) { const b = tray.children[n - 1]; if (b) select(b.dataset.type); }
});

/* =====================================================================
   Dessin
   ===================================================================== */
function drawFloor(R, time) {
  const g = ctxRef;
  if (R.floor === 'parquet') {
    g.fillStyle = '#b98a5e'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? -40 : 0; x < W; x += 80) {
      g.fillStyle = ((x + y) / 8) % 3 < 1 ? '#c49468' : ((x + y) / 8) % 3 < 2 ? '#b2845a' : '#bd8f63';
      g.fillRect(x + 1, y + 1, 78, 22);
    }
  } else if (R.floor === 'pierre') {
    g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 48) for (let x = (y / 48) % 2 ? -24 : 0; x < W; x += 48) {
      g.fillStyle = ((x * 7 + y * 3) % 5) < 2 ? '#d8cfc1' : '#c7bdae'; g.fillRect(x + 1.5, y + 1.5, 45, 45);
    }
  } else {
    g.fillStyle = '#7fb36a'; g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 60) { g.fillStyle = (x / 60) % 2 ? '#86b970' : '#7aad65'; g.fillRect(x, 0, 60, H); }
    g.fillStyle = '#6fa45c';
    for (let i = 0; i < 160; i++) { const x = (i * 97) % W, y = (i * 211) % H; g.fillRect(x, y, 2, 6); }
  }
  void time;
}
function drawDecor(R, time) {
  const g = ctxRef;
  if (R.floor === 'parquet') { // mairie
    g.fillStyle = '#f1e7dc'; g.fillRect(0, 0, W, 34);
    g.fillStyle = '#d8c9b6'; g.fillRect(0, 34, W, 4);
    // drapeau et table du maire
    g.fillStyle = '#1f3f8c'; g.fillRect(278, 4, 15, 24); g.fillStyle = '#fff'; g.fillRect(293, 4, 15, 24); g.fillStyle = '#d6303f'; g.fillRect(308, 4, 15, 24);
    g.fillStyle = '#0003'; g.fillRect(203, 66, 200, 46);
    g.fillStyle = '#5e3a22'; g.fillRect(200, 62, 200, 46);
    g.fillStyle = '#2f5d46'; g.fillRect(206, 68, 188, 34);
    g.fillStyle = '#fffaf4'; g.fillRect(286, 76, 30, 20); g.fillStyle = PALETTE.gold; g.fillRect(250, 82, 22, 3);
    g.fillStyle = '#7b2450'; g.beginPath(); g.roundRect(285, 36, 32, 24, 6); g.fill(); // fauteuil du maire
    doorDraw(560, H);
  } else if (R.floor === 'pierre') { // église
    g.fillStyle = '#b4a996'; g.fillRect(0, 0, W, 40);
    const glass = ['#6d8fd6', '#d66d8f', '#e0b354', '#6dbf9a'];
    for (let i = 0; i < 4; i++) { g.fillStyle = glass[i]; g.beginPath(); g.roundRect(40 + i * 150, 6, 70, 26, [14, 14, 2, 2]); g.fill(); }
    g.fillStyle = '#0003'; g.fillRect(183, 52, 240, 44);
    g.fillStyle = '#e9e1d3'; g.fillRect(180, 48, 240, 44); g.strokeStyle = PALETTE.gold; g.lineWidth = 3; g.strokeRect(184, 52, 232, 36);
    g.fillStyle = PALETTE.gold; g.fillRect(296, 54, 8, 30); g.fillRect(286, 62, 28, 7);
    for (const y of [220, 285, 350, 415, 480]) {
      for (const [x0, x1] of [[40, 242], [358, 560]]) {
        g.fillStyle = '#0003'; g.fillRect(x0 + 3, y - 9, x1 - x0, 24);
        g.fillStyle = '#7a4a2a'; g.fillRect(x0, y - 12, x1 - x0, 24);
        g.fillStyle = '#946039'; g.fillRect(x0, y - 12, x1 - x0, 8);
      }
    }
    doorDraw(560, H); doorDraw(40, H);
  } else { // jardin
    for (const [x, y, r] of [[30, 120, 34], [570, 150, 38], [25, 330, 30], [575, 380, 34], [40, 520, 32], [565, 560, 30]]) {
      g.fillStyle = '#0003'; g.beginPath(); g.arc(x + 6, y + 8, r, 0, 7); g.fill();
      g.fillStyle = '#4e8a45'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.fillStyle = '#5f9a4c'; g.beginPath(); g.arc(x - r / 3, y - r / 3, r * .55, 0, 7); g.fill();
    }
    g.fillStyle = '#e8dcc2'; g.fillRect(0, 700, W, 20);
    g.fillStyle = '#c9b892'; for (let x = 0; x < W; x += 18) g.fillRect(x + 4, 706, 6, 4);
    // guirlande lumineuse
    g.strokeStyle = '#2f2a33'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 30); g.quadraticCurveTo(150, 52, 300, 30); g.quadraticCurveTo(450, 52, 600, 30); g.stroke();
    for (let i = 0; i <= 12; i++) {
      const x = i * 50, y = 30 + Math.sin(i / 12 * Math.PI * 2) * 0 + (i % 6 === 3 ? 11 : i % 6 ? 7 : 0);
      g.fillStyle = (Math.sin(time * 3 + i) > 0) ? '#fff3b0' : '#ffe08a'; g.beginPath(); g.arc(x, y + 3, 3.5, 0, 7); g.fill();
    }
  }
}
function doorDraw(x) {
  const g = ctxRef;
  g.fillStyle = '#5e3a22'; g.fillRect(x - 30, H - 10, 60, 10);
  g.fillStyle = '#e0b35466'; g.fillRect(x - 26, H - 6, 52, 6);
}
function drawGhost(tg, time, active) {
  const g = ctxRef, it = ITEMS[tg.type];
  g.save();
  const pulse = active ? .55 + .35 * Math.sin(time * 6) : .35;
  g.globalAlpha = pulse;
  it.ghost(tg.x, tg.y, tg);
  g.fillStyle = it.tint ? it.tint + '66' : '#ffffff33'; g.fill();
  g.setLineDash([6, 5]); g.lineWidth = active ? 3 : 2; g.strokeStyle = it.tint === '#f29bb6' ? '#d9668c' : active ? PALETTE.gold : '#2b0e22aa'; g.stroke();
  g.restore();
}
function drawPerson(p, time) {
  const g = ctxRef, bob = Math.sin(p.bob) * 2;
  const suit = p.sex === 'F' ? (p.team === 'mariee' ? '#c4587d' : '#6d5aa8') : (p.team === 'marie' ? '#2c3d66' : '#4a6b5a');
  g.fillStyle = '#0003'; g.beginPath(); g.ellipse(p.x + 3, p.y + 6, 16, 10, 0, 0, 7); g.fill();
  g.fillStyle = suit; g.beginPath(); g.ellipse(p.x, p.y + bob, 17, 11, 0, 0, 7); g.fill();
  g.fillStyle = '#f0c8a2'; g.beginPath(); g.arc(p.x - 15, p.y + bob, 4, 0, 7); g.arc(p.x + 15, p.y + bob, 4, 0, 7); g.fill();
  g.fillStyle = '#f0c8a2'; g.beginPath(); g.arc(p.x, p.y - 2 + bob, 9, 0, 7); g.fill();
  g.fillStyle = p.sex === 'F' ? '#7a4a22' : '#2c1d17'; g.beginPath(); g.arc(p.x, p.y - 4 + bob, 8.5, Math.PI, 0); g.fill();
  if (p.sex === 'F') { g.beginPath(); g.arc(p.x, p.y + 2 + bob, 5, 0, 7); g.fill(); }
  if (p.carry) ctxSwap(g, () => { g.save(); g.translate(p.x, p.y + 16 + bob); g.scale(.6, .6); ITEMS[p.carry].draw(0, 0, time); g.restore(); });
  // étiquette
  g.font = '600 12px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(p.name).width + 14;
  g.fillStyle = p.state === 'flee' ? '#ffffffcc' : '#2b0e22e6'; g.beginPath(); g.roundRect(p.x - w / 2, p.y - 34, w, 18, 9); g.fill();
  g.fillStyle = p.state === 'flee' ? '#2b0e22' : '#fbeff2'; g.fillText(p.state === 'flee' ? `${p.name} 💨` : p.name, p.x, p.y - 25);
  if (p.state === 'in') { // repère sur l'objet visé
    g.save(); g.globalAlpha = .5 + .3 * Math.sin(time * 8); g.strokeStyle = '#ff8fa8'; g.lineWidth = 2; g.setLineDash([4, 4]);
    g.beginPath(); g.arc(p.goal.x, p.goal.y, 24, 0, 7); g.stroke(); g.restore();
  }
}
function render(time) {
  if (!game) { ctxRef = mainCtx; drawFloor(ROOMS[0], time); drawDecor(ROOMS[0], time); return; }
  const R = ROOMS[game.room];
  ctxRef = mainCtx;
  drawFloor(R, time); drawDecor(R, time);
  // tapis d'abord (sous le reste)
  const order = [...game.targets].sort((a, b) => (a.type === 'tapis' ? -1 : 0) - (b.type === 'tapis' ? -1 : 0));
  for (const tg of order) {
    if (tg.filled) {
      const s = 1 + tg.pop * .25;
      ctx.save(); ctx.translate(tg.x, tg.y); ctx.scale(s, s); ITEMS[tg.type].draw(0, 0, time, tg); ctx.restore();
    } else drawGhost(tg, time, held === tg.type);
  }
  // aperçu de l'élément tenu (souris ou glisser)
  const pos = drag?.moved ? drag.pos : held ? hover : null;
  if (held && pos && game.running) { ctx.save(); ctx.globalAlpha = .7; ITEMS[held].draw(pos.x, pos.y, time, held === 'tapis' || held === 'arche' ? null : undefined); ctx.restore(); }
  for (const p of game.pranksters) drawPerson(p, time);
  for (const q of game.parts) { ctx.globalAlpha = Math.max(0, q.life / .7); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.font = '700 18px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of game.floaters) {
    ctx.globalAlpha = Math.min(1, f.life * 2); ctx.lineWidth = 4; ctx.strokeStyle = '#2b0e22'; ctx.strokeText(f.txt, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  if (game.running && game.t <= 10) { ctx.fillStyle = `rgba(200,40,80,${.08 + .06 * Math.sin(time * 8)})`; ctx.fillRect(0, 0, W, H); }
}
// Les fonctions de dessin des éléments utilisent la variable « ctx » : on l'aiguille vers le bon canevas
Object.values(ITEMS).forEach((it) => {
  const d = it.draw, gh = it.ghost;
  it.draw = (...a) => { const keep = ctx; ctx = ctxRef; try { d(...a); } finally { ctx = keep; } };
  it.ghost = (...a) => { const keep = ctx; ctx = ctxRef; try { gh(...a); } finally { ctx = keep; } };
});

/* =====================================================================
   Boucle
   ===================================================================== */
let lastT = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
  const time = now / 1000;
  if (game && game.running && !game.paused) {
    game.clock += dt; game.t -= dt;
    game.nextPrank -= dt;
    if (game.nextPrank <= 0) { spawnPrankster(); game.nextPrank = ROOMS[game.room].prankEvery * (.8 + Math.random() * .4); }
    updatePranksters(dt);
    if (game.t <= 10 && Math.ceil(game.t) < game.tick) { game.tick = Math.ceil(game.t); sfx('tick'); if (!game.warned) { game.warned = true; say(`<b>${esc(CFG.mariee)} :</b> Vite, j’entends les invités sur le parvis !`); } }
    if (game.t <= 0) { game.t = 0; hud(); endGame(false); }
    else if (Math.floor(game.t * 4) !== Math.floor((game.t + dt) * 4)) hud();
  }
  if (game) {
    for (const tg of game.targets) tg.pop = Math.max(0, tg.pop - dt * 4);
    for (const q of game.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 120 * dt; q.life -= dt; }
    game.parts = game.parts.filter((q) => q.life > 0);
    for (const f of game.floaters) { f.y -= 30 * dt; f.life -= dt * .9; }
    game.floaters = game.floaters.filter((f) => f.life > 0);
  }
  render(time);
  requestAnimationFrame(loop);
}

/* =====================================================================
   Tableau d'honneur (partagé via l'API du site, sinon sur l'appareil)
   ===================================================================== */
const API = 'api/scores', LS_SCORES = 'jeu-ceremonie-scores', LS_NAME = 'jeu-pseudo';
let board = [], online = false, lastEntry = null;
function readPseudo() { try { return localStorage.getItem(LS_NAME) || ''; } catch { return ''; } }
function readLocal() { try { const a = JSON.parse(localStorage.getItem(LS_SCORES) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }
function writeLocal(a) { try { localStorage.setItem(LS_SCORES, JSON.stringify(a)); } catch { /* stockage indisponible */ } }
const sortBoard = (a) => a.filter((x) => x && typeof x.name === 'string' && Number.isFinite(x.score)).sort((a, b) => b.score - a.score || a.t - b.t);
async function loadBoard() {
  try {
    const r = await fetch(API, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!r.ok) throw 0; const j = await r.json(); if (!Array.isArray(j)) throw 0;
    online = true; board = sortBoard(j);
  } catch { online = false; board = sortBoard(readLocal()); }
  renderBoard();
}
function renderBoard() {
  $('#boardNote').textContent = online ? 'Classement partagé entre tous les invités.' : 'Scores enregistrés sur cet appareil.';
  const ol = $('#boardList'); ol.textContent = '';
  if (!board.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Personne n’a encore décoré les salles. À toi de jouer !'; ol.append(li); return; }
  board.slice(0, 10).forEach((e, i) => {
    const li = document.createElement('li');
    if (lastEntry && e.t === lastEntry.t && e.name === lastEntry.name) li.className = 'me';
    const c = (cls, txt) => { const sp = document.createElement('span'); sp.className = cls; sp.textContent = txt; li.append(sp); };
    c('rk', (i + 1) + (i ? 'e' : 'er')); c('nm', e.name); c('st', e.won ? '3 salles prêtes' : `${e.level || 0} salle${e.level > 1 ? 's' : ''} prête${e.level > 1 ? 's' : ''}`); c('sc', Math.floor(e.score).toLocaleString('fr-FR'));
    ol.append(li);
  });
}
const rankOf = (e) => board.findIndex((x) => x === e || (x.t === e.t && x.name === e.name)) + 1;
async function saveScore(name) {
  const entry = { name, ...lastScore, t: Date.now() };
  if (online) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
      if (r.ok) {
        board = sortBoard(await r.json());
        lastEntry = board.find((e) => e.name === entry.name && e.score === entry.score && Math.abs(e.t - entry.t) < 60000) || entry;
        renderBoard(); return rankOf(lastEntry);
      }
      if (r.status === 429) return -2;
    } catch { /* hors ligne */ }
  }
  const l = sortBoard(readLocal().concat(entry)).slice(0, 100); writeLocal(l);
  if (!online) board = l; lastEntry = entry; renderBoard();
  return online ? -1 : rankOf(entry);
}
$('#saveForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); if (saved || !lastScore) return;
  const name = $('#pseudo').value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20);
  if (!name) { $('#pseudo').focus(); return; }
  try { localStorage.setItem(LS_NAME, name); } catch { /* rien */ }
  saved = true; $('#saveForm').hidden = true; $('#saveMsg').textContent = 'Enregistrement…';
  const rk = await saveScore(name);
  try { if (window.parent !== window) parent.postMessage({ jeu: 'score' }, '*'); } catch { /* rien */ }
  $('#saveMsg').textContent = rk > 0 ? `Score enregistré, ${name} : ${rk === 1 ? '1re' : rk + 'e'} place !`
    : rk === -2 ? 'Doucement ! Réessaie dans quelques secondes.'
    : rk === -1 ? 'Le classement partagé ne répond pas : score gardé sur cet appareil.' : 'Score enregistré.';
  if (rk === -2) { saved = false; $('#saveForm').hidden = false; }
  $('#again').focus();
});

/* =====================================================================
   Boutons
   ===================================================================== */
function begin() {
  audio();
  ['#menu', '#end', '#between'].forEach((s) => { $(s).hidden = true; });
  prankIndex = 0;
  newGame(); startMusic();
}
$('#start').addEventListener('click', begin);
$('#again').addEventListener('click', begin);
$('#next').addEventListener('click', () => { $('#between').hidden = true; startRoom(game.room + 1); startMusic(); });
function togglePause() {
  if (!game || !game.running) return;
  game.paused = !game.paused;
  $('#pause').hidden = !game.paused;
  if (game.paused) { stopMusic(); $('#resume').focus(); } else startMusic();
}
$('#pauseBtn').addEventListener('click', togglePause);
$('#resume').addEventListener('click', togglePause);
$('#quit').addEventListener('click', () => { $('#pause').hidden = true; game.paused = false; endGame(false); });
$('#musicBtn').addEventListener('click', (e) => {
  musicOn = !musicOn; e.currentTarget.textContent = `Musique : ${musicOn ? 'oui' : 'non'}`; e.currentTarget.setAttribute('aria-pressed', musicOn);
  if (musicOn && game && game.running && !game.paused) startMusic(); else stopMusic();
});
$('#soundBtn').addEventListener('click', (e) => {
  soundOn = !soundOn; e.currentTarget.textContent = `Bruitages : ${soundOn ? 'oui' : 'non'}`; e.currentTarget.setAttribute('aria-pressed', soundOn);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.running && !game.paused) togglePause(); });

/* ---------- Canevas net sur écran haute définition ---------- */
function fit() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit();
addEventListener('resize', fit);

readCfg(); loadBoard();
say(`<b>${esc(CFG.mariee)} :</b> Merci de venir nous aider ! On a trois salles à préparer avant l’arrivée des invités.`);
requestAnimationFrame(loop);
// Intégré à la page des jeux : on indique notre hauteur pour ajuster le cadre
if (document.documentElement.classList.contains('embed') && window.parent !== window) {
  const tell = () => { try { parent.postMessage({ jeu: 'hauteur', h: Math.ceil(document.body.getBoundingClientRect().height) }, '*'); } catch { /* rien */ } };
  const embedObserver = new ResizeObserver(tell); embedObserver.observe(document.body); tell();
}
}
