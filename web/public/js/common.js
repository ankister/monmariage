/**
 * Fonctions partagées entre le site invités et l'administration.
 */
'use strict';

window.MM = (() => {
  /** Échappe le texte avant insertion dans du HTML (protection XSS). */
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Appel à l'API en JSON ; lève une erreur avec le message renvoyé par le serveur. */
  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* réponse vide */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Erreur ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const KINDS = {
    mairie: { label: 'Mairie', icon: '🏛️' },
    eglise: { label: 'Église', icon: '⛪' },
    photos: { label: 'Séance photos', icon: '📸' },
    salle: { label: 'Réception', icon: '🥂' },
    autre: { label: 'Lieu', icon: '📍' },
  };

  /* ---------- Couleurs du thème ---------- */
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  /** Assombrit une couleur jusqu'à obtenir un contraste suffisant sur fond clair (WCAG AA ≥ 4,5:1, y compris sur le fond crème). */
  function inkFor(hex) {
    let [r, g, b] = hexToRgb(hex);
    for (let i = 0; i < 20 && (1.05 / (luminance(toHex(r, g, b)) + 0.05)) < 5.5; i++) {
      r *= 0.88; g *= 0.88; b *= 0.88;
    }
    return toHex(r, g, b);
  }
  function toHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  }

  /** Applique les couleurs du thème (choisies dans l'admin) aux variables CSS. */
  function applyTheme(colors) {
    const valid = (colors || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    if (!valid.length) return;
    const root = document.documentElement.style;
    const primary = valid[0];
    const ink = inkFor(primary);
    root.setProperty('--accent', ink);
    root.setProperty('--accent-raw', primary);
    root.setProperty('--on-accent', '#ffffff');
    if (valid[1]) root.setProperty('--accent-2', valid[1]);
    // Une couleur très claire de la palette sert de fond doux pour les sections alternées
    const light = valid.find((c) => luminance(c) > 0.7);
    if (light) root.setProperty('--bg-soft', light);
  }

  /* ---------- Cartes Leaflet / OpenStreetMap ---------- */
  function makeMap(el, options = {}) {
    const map = L.map(el, { scrollWheelZoom: false, ...options });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    // Molette active seulement après un clic (évite de « piéger » le défilement de la page)
    map.on('click', () => map.scrollWheelZoom.enable());
    map.on('mouseout', () => map.scrollWheelZoom.disable());
    return map;
  }

  function pinIcon(content, cls = '') {
    return L.divIcon({
      className: 'pin-wrap',
      html: `<span class="pin ${cls}"><span>${content}</span></span>`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -34],
    });
  }

  const hasCoords = (p) => typeof p.lat === 'number' && typeof p.lng === 'number';

  /** Lien d'itinéraire universel (ouvre l'application GPS sur mobile). */
  const directionsUrl = (p) =>
    hasCoords(p)
      ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address || p.name)}`;

  /* ---------- Dates ---------- */
  function formatDateLong(iso, tz) {
    if (!iso) return '';
    const d = new Date(iso);
    const s = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function formatTime(iso, tz) {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso)).replace(':', 'h');
  }
  /** "2028-06-30" -> "30 juin 2028" */
  function formatDay(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  }

  /* ---------- Statistiques de visite (Umami, relayé par notre serveur) ---------- */
  async function loadAnalytics() {
    try {
      const cfg = await api('/stats/config');
      if (!cfg.enabled) return;
      const s = document.createElement('script');
      s.defer = true;
      s.src = '/api/stats/script.js';
      s.dataset.websiteId = cfg.website_id;
      s.dataset.hostUrl = '/api/stats'; // le script enverra à /api/stats/api/send
      document.head.append(s);
    } catch { /* les statistiques ne doivent jamais gêner l'affichage */ }
  }

  /* ---------- Logo (image envoyée ou code HTML/CSS) ---------- */
  function renderLogo(host, logo) {
    if (!host || !logo) return;
    if (logo.mode === 'image' && logo.image) {
      const img = document.createElement('img');
      img.src = `/api/media/site/${logo.image}`;
      img.alt = 'Logo';
      img.className = 'logo-img';
      img.style.height = `${logo.height || 110}px`;
      host.replaceChildren(img);
    } else if (logo.mode === 'html' && logo.html) {
      // Shadow DOM : le CSS du logo n'affecte pas le reste du site (et inversement)
      const box = document.createElement('div');
      box.className = 'logo-html';
      box.attachShadow({ mode: 'open' }).innerHTML = logo.html;
      host.replaceChildren(box);
    }
  }

  return { esc, api, KINDS, applyTheme, loadAnalytics, renderLogo, makeMap, pinIcon, hasCoords, directionsUrl, formatDateLong, formatTime, formatDay };
})();
