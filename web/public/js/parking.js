/**
 * Page « Où se garer ? » : carte de la mairie, de l'église et des stationnements (dont places PMR).
 */
'use strict';

(() => {
  const { esc, api, KINDS, loadAnalytics, makeMap, pinIcon, hasCoords, directionsUrl } = window.MM;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = { places: [], parkings: [], filter: 'all', map: null, markers: new Map() };
  const FILTERS = {
    all: () => true,
    pmr: (p) => p.pmr_spots > 0,
    free: (p) => p.fee === 'free',
  };

  /** Distance à vol d'oiseau (mètres) et temps à pied approximatif (4,5 km/h, détours compris). */
  function distance(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = (m) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
  const walk = (m) => Math.max(1, Math.round((m * 1.3) / 75)); // 75 m/min, ×1,3 pour les rues

  const iconOf = (p) => (p.kind === 'pmr' ? pinIcon('♿', 'pin-pmr') : pinIcon('<b>P</b>', 'pin-park'));

  function badges(p) {
    const out = [];
    if (p.kind === 'pmr') out.push(`<span class="pk-badge pk-pmr">♿ ${p.pmr_spots} place${p.pmr_spots > 1 ? 's' : ''} PMR</span>`);
    else {
      if (p.spots) out.push(`<span class="pk-badge">${p.spots} places</span>`);
      if (p.pmr_spots) out.push(`<span class="pk-badge pk-pmr">♿ dont ${p.pmr_spots} PMR</span>`);
    }
    if (p.fee === 'free') out.push('<span class="pk-badge pk-free">Gratuit</span>');
    else if (p.fee === 'paid') out.push('<span class="pk-badge pk-paid">Payant</span>');
    return out.join('');
  }

  function distances(p) {
    if (!hasCoords(p)) return '';
    return state.places.filter(hasCoords).map((pl) => {
      const d = distance(p, pl);
      const k = KINDS[pl.kind] || KINDS.autre;
      return `<li>${k.icon} ${esc(k.label)} : <strong>${fmtDist(d)}</strong> <small>(≈ ${walk(d)} min à pied)</small></li>`;
    }).join('');
  }

  function renderList() {
    const list = state.parkings.filter(FILTERS[state.filter]);
    $('#pk-title').textContent = `${list.length} stationnement${list.length > 1 ? 's' : ''}`;
    $('#pk-list').innerHTML = list.map((p) => `
      <article class="pk-item ${p.kind === 'pmr' ? 'is-pmr' : ''}" data-id="${p.id}">
        <div class="pk-head">
          <span class="pk-icon" aria-hidden="true">${p.kind === 'pmr' ? '♿' : 'P'}</span>
          <div><h3>${esc(p.name)}</h3>${p.address ? `<p class="muted">${esc(p.address)}</p>` : ''}</div>
        </div>
        <div class="pk-badges">${badges(p)}</div>
        ${distances(p) ? `<ul class="pk-dist">${distances(p)}</ul>` : ''}
        ${p.description ? `<p class="pre pk-desc">${esc(p.description)}</p>` : ''}
        <div class="pk-actions">
          ${hasCoords(p) ? `<button type="button" class="link-btn" data-show="${p.id}">Voir sur la carte</button>` : ''}
          <a class="link-btn" href="${esc(directionsUrl(p))}" target="_blank" rel="noopener">Itinéraire →</a>
        </div>
      </article>`).join('') || '<p class="muted center">Aucun stationnement ne correspond à ce filtre.</p>';
  }

  function renderMap() {
    const el = $('#pk-map');
    const located = [...state.places, ...state.parkings].filter(hasCoords);
    if (!located.length) { el.hidden = true; $('.pk-legend').hidden = true; return; }
    if (!state.map) state.map = makeMap(el);
    const map = state.map;
    state.markers.forEach((m) => m.remove());
    state.markers.clear();
    const bounds = [];
    state.places.filter(hasCoords).forEach((pl) => {
      const k = KINDS[pl.kind] || KINDS.autre;
      L.marker([pl.lat, pl.lng], { icon: pinIcon(k.icon), title: pl.name, alt: pl.name, zIndexOffset: 1000 }).addTo(map)
        .bindPopup(`<strong>${esc(pl.name)}</strong>${pl.time ? ` · ${esc(pl.time)}` : ''}<br>${esc(pl.address)}`);
      bounds.push([pl.lat, pl.lng]);
    });
    state.parkings.filter(hasCoords).filter(FILTERS[state.filter]).forEach((p) => {
      const m = L.marker([p.lat, p.lng], { icon: iconOf(p), title: p.name, alt: p.name }).addTo(map)
        .bindPopup(`<strong>${esc(p.name)}</strong><div class="pk-badges">${badges(p)}</div>
          <a href="${esc(directionsUrl(p))}" target="_blank" rel="noopener">Itinéraire</a>`);
      state.markers.set(p.id, m);
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 16);
    else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
  }

  function setFilter(f) {
    state.filter = f;
    $$('.filter-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
    renderList();
    renderMap();
  }

  async function init() {
    try {
      const data = await api('/parking');
      Object.assign(state, { places: data.places, parkings: data.parkings });
      loadAnalytics();
      $$('[data-bind="couple"]').forEach((el) => { el.textContent = data.couple || ''; });
      document.title = `Où se garer ? — Mariage ${data.couple || ''}`;
      $('#pk-intro').textContent = data.intro || '';
      $('#pk-intro').hidden = !data.intro;
      $$('.filter-chip').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
      $('#pk-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-show]');
        if (!b) return;
        const m = state.markers.get(+b.dataset.show);
        if (!m) return;
        $('#pk-map').scrollIntoView({ behavior: 'smooth', block: 'center' });
        state.map.setView(m.getLatLng(), 17);
        m.openPopup();
      });
      renderList();
      renderMap();
    } catch (err) {
      document.body.insertAdjacentHTML('afterbegin', `<p class="load-error">Impossible de charger les stationnements (${esc(err.message)}).</p>`);
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
