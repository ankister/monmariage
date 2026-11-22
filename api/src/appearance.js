/**
 * Apparence du site : polices, couleurs, CSS personnalisé et ordre des blocs de la page d'accueil.
 *
 * Les polices sont hébergées par le site lui-même (copiées depuis @fontsource à la construction
 * de l'image « web ») : aucun appel à Google Fonts.
 */
'use strict';

const { db } = require('./db');

/* ---------- Catalogue des polices disponibles ---------- */
// weights : graisses présentes dans /vendor/fonts ; italic : italique 400 disponible
const FONTS = [
  // Avec empattements
  { id: 'cormorant-garamond', family: 'Cormorant Garamond', cat: 'Avec empattements', fallback: 'Georgia, serif', weights: [400, 600, 700], italic: true },
  { id: 'playfair-display', family: 'Playfair Display', cat: 'Avec empattements', fallback: 'Georgia, serif', weights: [400, 600, 700], italic: true },
  { id: 'lora', family: 'Lora', cat: 'Avec empattements', fallback: 'Georgia, serif', weights: [400, 600, 700], italic: true },
  { id: 'eb-garamond', family: 'EB Garamond', cat: 'Avec empattements', fallback: 'Georgia, serif', weights: [400, 600, 700], italic: true },
  { id: 'libre-baskerville', family: 'Libre Baskerville', cat: 'Avec empattements', fallback: 'Georgia, serif', weights: [400, 600, 700], italic: true },
  { id: 'cinzel', family: 'Cinzel', cat: 'Avec empattements', fallback: 'Georgia, serif', weights: [400, 600, 700], italic: false },
  { id: 'marcellus', family: 'Marcellus', cat: 'Avec empattements', fallback: 'Georgia, serif', weights: [400], italic: false },
  // Sans empattements
  { id: 'lato', family: 'Lato', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 700], italic: true },
  { id: 'montserrat', family: 'Montserrat', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 600, 700], italic: true },
  { id: 'raleway', family: 'Raleway', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 600, 700], italic: true },
  { id: 'nunito', family: 'Nunito', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 600, 700], italic: true },
  { id: 'josefin-sans', family: 'Josefin Sans', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 600, 700], italic: true },
  { id: 'poppins', family: 'Poppins', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 600, 700], italic: true },
  { id: 'quicksand', family: 'Quicksand', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 600, 700], italic: false },
  { id: 'fredoka', family: 'Fredoka', cat: 'Sans empattements', fallback: 'system-ui, sans-serif', weights: [400, 600, 700], italic: false },
  // Manuscrites
  { id: 'great-vibes', family: 'Great Vibes', cat: 'Manuscrites', fallback: 'cursive', weights: [400], italic: false },
  { id: 'dancing-script', family: 'Dancing Script', cat: 'Manuscrites', fallback: 'cursive', weights: [400, 600, 700], italic: false },
  { id: 'parisienne', family: 'Parisienne', cat: 'Manuscrites', fallback: 'cursive', weights: [400], italic: false },
  { id: 'allura', family: 'Allura', cat: 'Manuscrites', fallback: 'cursive', weights: [400], italic: false },
  { id: 'sacramento', family: 'Sacramento', cat: 'Manuscrites', fallback: 'cursive', weights: [400], italic: false },
  { id: 'pinyon-script', family: 'Pinyon Script', cat: 'Manuscrites', fallback: 'cursive', weights: [400], italic: false },
  { id: 'alex-brush', family: 'Alex Brush', cat: 'Manuscrites', fallback: 'cursive', weights: [400], italic: false },
];
const FONT_BY_ID = Object.fromEntries(FONTS.map((f) => [f.id, f]));

/** Textes du site dont on peut choisir la police. */
const FONT_ROLES = [
  { key: 'couple', label: 'Prénoms des mariés', sample: 'Léa & Hugo' },
  { key: 'titles', label: 'Titres des sections', sample: 'Le programme' },
  { key: 'subtitles', label: 'Sous-titres', sample: 'Vin d’honneur' },
  { key: 'deco', label: 'Textes décoratifs (date, mot d’accueil, compte à rebours, menu)', sample: 'Samedi 15 juin 2030' },
  { key: 'body', label: 'Texte courant', sample: 'Merci de nous répondre avant le 30 avril.' },
  { key: 'nav', label: 'Menu de navigation', sample: 'Programme · Thème · Menu' },
  { key: 'buttons', label: 'Boutons', sample: 'Confirmer ma présence' },
];

/** Couleurs réglables (variables CSS du site). */
const COLOR_ROLES = [
  { key: 'bg', label: 'Fond de page' },
  { key: 'bg_soft', label: 'Fond des sections alternées' },
  { key: 'surface', label: 'Fond des cartes et champs' },
  { key: 'ink', label: 'Texte principal' },
  { key: 'muted', label: 'Texte secondaire' },
  { key: 'line', label: 'Bordures' },
  { key: 'accent', label: 'Couleur principale (boutons, liens)' },
  { key: 'accent_2', label: 'Couleur d’accent (ornements)' },
];

/** Blocs de la page d'accueil, dans l'ordre par défaut. */
const SECTIONS = [
  { id: 'programme', label: 'Programme et lieux' },
  { id: 'album', label: 'Album photo (encart)' },
  { id: 'jeux', label: 'Jeux (encart)' },
  { id: 'theme', label: 'Thème' },
  { id: 'menu', label: 'Menu' },
  { id: 'hebergement', label: 'Logement' },
  { id: 'faq', label: 'Questions fréquentes' },
  { id: 'rsvp', label: 'Formulaire de réponse' },
];

/** Liens de la barre de menu (le bouton « Répondre » reste toujours à la fin). */
const NAV_ITEMS = [
  { id: 'programme', label: 'Programme' },
  { id: 'theme', label: 'Thème' },
  { id: 'menu', label: 'Menu' },
  { id: 'hebergement', label: 'Logement' },
  { id: 'faq', label: 'FAQ' },
  { id: 'album', label: 'Album photo (affiché quand l’album est ouvert)' },
  { id: 'jeux', label: 'Jeux' },
];

/** Liste ordonnée [{id, visible}] : chaque élément connu une seule fois, les absents insérés à leur place par défaut. */
function orderList(input, defs) {
  const seen = new Set();
  const list = [];
  for (const s of Array.isArray(input) ? input : []) {
    const id = String(s?.id || '');
    if (!defs.some((x) => x.id === id) || seen.has(id)) continue;
    seen.add(id);
    list.push({ id, visible: s.visible !== false });
  }
  defs.forEach((d, k) => {
    if (seen.has(d.id)) return;
    let at = 0;
    for (let j = k - 1; j >= 0; j--) {
      const idx = list.findIndex((x) => x.id === defs[j].id);
      if (idx >= 0) { at = idx + 1; break; }
    }
    list.splice(at, 0, { id: d.id, visible: true });
    seen.add(d.id);
  });
  return list;
}

const fonts = (couple, titles, subtitles, deco, body, nav = body, buttons = body) => ({ couple, titles, subtitles, deco, body, nav, buttons });

/* ---------- Thèmes prédéfinis ---------- */
const PRESETS = [
  {
    id: 'champetre', name: 'Champêtre chic',
    colors: { bg: '#fbf8f3', bg_soft: '#efe6d8', surface: '#ffffff', ink: '#2f2a25', muted: '#6b6259', line: '#e4dccf', accent: '#56644a', accent_2: '#c9a46c' },
    fonts: fonts('cormorant-garamond', 'cormorant-garamond', 'cormorant-garamond', 'cormorant-garamond', 'lato'),
  },
  {
    id: 'elegance', name: 'Élégance noir et or',
    colors: { bg: '#faf9f7', bg_soft: '#f0ece4', surface: '#ffffff', ink: '#1c1b1a', muted: '#5f5a54', line: '#e2ddd3', accent: '#1f1f1f', accent_2: '#b8963e' },
    fonts: fonts('playfair-display', 'playfair-display', 'playfair-display', 'playfair-display', 'montserrat'),
  },
  {
    id: 'romantique', name: 'Romantique poudré',
    colors: { bg: '#fdf7f6', bg_soft: '#f6e4e1', surface: '#ffffff', ink: '#3b2a2c', muted: '#7a6265', line: '#eed9d6', accent: '#9c4f5c', accent_2: '#d8a7a0' },
    fonts: fonts('great-vibes', 'cormorant-garamond', 'cormorant-garamond', 'cormorant-garamond', 'nunito'),
  },
  {
    id: 'boheme', name: 'Bohème terracotta',
    colors: { bg: '#fbf6f0', bg_soft: '#f1e1d2', surface: '#fffdfa', ink: '#3a2b22', muted: '#74625a', line: '#ead9c9', accent: '#a4532f', accent_2: '#d9a55b' },
    fonts: fonts('parisienne', 'lora', 'lora', 'lora', 'raleway'),
  },
  {
    id: 'lavande', name: 'Provence lavande',
    colors: { bg: '#f9f8fc', bg_soft: '#e9e5f3', surface: '#ffffff', ink: '#2e2a3a', muted: '#66607a', line: '#e0dbec', accent: '#5f5290', accent_2: '#b3a6d6' },
    fonts: fonts('dancing-script', 'eb-garamond', 'eb-garamond', 'eb-garamond', 'quicksand'),
  },
  {
    id: 'mer', name: 'Bord de mer',
    colors: { bg: '#f6f9fa', bg_soft: '#dfecef', surface: '#ffffff', ink: '#1f3038', muted: '#57707a', line: '#d5e3e7', accent: '#2c6576', accent_2: '#e2b878' },
    fonts: fonts('sacramento', 'josefin-sans', 'josefin-sans', 'lora', 'poppins'),
  },
  {
    id: 'royal', name: 'Classique royal',
    colors: { bg: '#fbfaf6', bg_soft: '#ece7da', surface: '#ffffff', ink: '#1d2433', muted: '#5a6070', line: '#e1dccd', accent: '#1f3a5f', accent_2: '#c5a35a' },
    fonts: fonts('cinzel', 'cinzel', 'marcellus', 'eb-garamond', 'lato'),
  },
  {
    id: 'nuit', name: 'Nuit étoilée (sombre)',
    colors: { bg: '#14161f', bg_soft: '#1c2030', surface: '#232838', ink: '#ecebf2', muted: '#aeacbd', line: '#363c52', accent: '#d8b46a', accent_2: '#8c9be0' },
    fonts: fonts('pinyon-script', 'cormorant-garamond', 'cormorant-garamond', 'cormorant-garamond', 'lato'),
  },
];

/* ---------- Lecture / validation ---------- */
const HEX = /^#[0-9a-f]{6}$/i;
const ID = /^[a-z0-9-]{1,40}$/;
const CSS_MAX = 50_000;

function defaultAppearance() {
  const p = PRESETS[0];
  return {
    theme: p.id,
    colors: { ...p.colors },
    fonts: { ...p.fonts },
    css: '',
    sections: SECTIONS.map((s) => ({ id: s.id, visible: true })),
    nav: NAV_ITEMS.map((s) => ({ id: s.id, visible: true })),
  };
}

/** Normalise une apparence reçue (admin) ou stockée : rien d'inconnu ne passe. */
function sanitizeAppearance(input = {}) {
  const def = defaultAppearance();
  const colors = {};
  for (const { key } of COLOR_ROLES) {
    const v = String(input.colors?.[key] || '');
    colors[key] = HEX.test(v) ? v.toLowerCase() : def.colors[key];
  }
  const f = {};
  for (const { key } of FONT_ROLES) {
    const v = String(input.fonts?.[key] || '');
    f[key] = FONT_BY_ID[v] ? v : def.fonts[key];
  }
  // Ordre des blocs de la page et des liens du menu
  const sections = orderList(input.sections, SECTIONS);
  const nav = orderList(input.nav, NAV_ITEMS);
  const css = String(input.css || '').replace(/\u0000/g, '');
  return {
    theme: ID.test(String(input.theme || '')) ? String(input.theme) : '',
    colors,
    fonts: f,
    css: css.slice(0, CSS_MAX),
    sections,
    nav,
  };
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, JSON.stringify(value));
}

function getAppearance() {
  const stored = getSetting('appearance');
  return stored ? sanitizeAppearance(stored) : defaultAppearance();
}
const setAppearance = (a) => setSetting('appearance', sanitizeAppearance(a));

/** Thèmes enregistrés par les mariés. */
function getCustomThemes() {
  const list = getSetting('custom_themes');
  return Array.isArray(list) ? list : [];
}
const setCustomThemes = (list) => setSetting('custom_themes', list);

/* ---------- Génération du CSS ---------- */
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

const familyCss = (id) => {
  const f = FONT_BY_ID[id];
  return `'${f.family}', ${f.fallback}`;
};

/** Déclarations @font-face d'une police (une seule graisse = utilisée pour toutes, sans faux gras). */
function fontFaces(id) {
  const f = FONT_BY_ID[id];
  if (!f) return '';
  const face = (style, weight, file) =>
    `@font-face{font-family:'${f.family}';font-style:${style};font-weight:${weight};font-display:swap;src:url('/vendor/fonts/${file}') format('woff2')}`;
  const out = f.weights.length === 1
    ? [face('normal', '100 900', `${f.id}-latin-${f.weights[0]}-normal.woff2`)]
    : f.weights.map((w) => face('normal', w, `${f.id}-latin-${w}-normal.woff2`));
  if (f.italic) out.push(face('italic', 400, `${f.id}-latin-400-italic.woff2`));
  return out.join('\n');
}

/** Feuille de style de l'apparence choisie, chargée après style.css par les pages invités. */
function appearanceCss(a = getAppearance()) {
  const c = a.colors;
  const onAccent = contrast(c.accent, '#ffffff') >= contrast(c.accent, '#1c1b1a') ? '#ffffff' : '#1c1b1a';
  const dark = luminance(c.bg) < 0.2;
  const used = [...new Set(Object.values(a.fonts))];
  return [
    '/* Apparence choisie dans l’administration (générée automatiquement) */',
    ...used.map(fontFaces),
    `:root{`,
    `--bg:${c.bg};--bg-soft:${c.bg_soft};--surface:${c.surface};--ink:${c.ink};--muted:${c.muted};--line:${c.line};`,
    `--accent:${c.accent};--accent-raw:${c.accent};--accent-2:${c.accent_2};--on-accent:${onAccent};`,
    dark ? '--ok:#7fd18b;--error:#ff9b93;--shadow:0 6px 24px rgba(0,0,0,.35);color-scheme:dark;' : '',
    ...FONT_ROLES.map((r) => `--font-${r.key}:${familyCss(a.fonts[r.key])};`),
    `}`,
    a.css ? `\n/* ---------- CSS personnalisé ---------- */\n${a.css}` : '',
  ].join('\n');
}

/** Toutes les polices (aperçus dans l'administration). */
const allFontsCss = () => FONTS.map((f) => fontFaces(f.id)).join('\n');

module.exports = {
  FONTS, FONT_ROLES, COLOR_ROLES, SECTIONS, NAV_ITEMS, PRESETS,
  defaultAppearance, sanitizeAppearance, getAppearance, setAppearance, getCustomThemes, setCustomThemes,
  appearanceCss, allFontsCss, contrast,
};
