/**
 * Page « Dormir sur place » : plan interactif, fiches chambres avec photos, demande de réservation.
 */
'use strict';

(() => {
  const { esc, api, loadAnalytics } = window.MM;
  const { render, bind, euro } = window.MMPlan;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const state = { rooms: [], nights: {}, onsite: {}, codeRequired: false, floor: 'rdc', filter: 'all', selectedId: null };

  const statusOf = (r) => (!r.bookable ? 'off' : r.available ? 'free' : 'taken');
  const FILTERS = {
    all: () => true,
    available: (r) => r.available,
    private_bath: (r) => r.private_bath,
    baby_bed: (r) => r.baby_bed,
    large: (r) => r.capacity >= 3,
  };
  const matches = (r) => FILTERS[state.filter](r);
  const floorLabel = (f) => (f === 'rdc' ? 'Rez-de-chaussée' : 'Étage');

  function bindText(name, value) {
    $$(`[data-bind="${name}"]`).forEach((el) => {
      el.textContent = value || '';
      if (el.tagName !== 'SPAN') el.hidden = !value;
    });
  }

  /** Prix le plus bas affichable sur une carte. */
  function priceHint(r) {
    const prices = [r.price_sat, r.price_both].filter((p) => p !== null && p !== undefined);
    if (!prices.length) return '';
    return prices.length > 1 ? `dès ${euro(Math.min(...prices))}` : euro(prices[0]);
  }

  /* ---------- En-tête : statistiques et formules ---------- */
  function renderHeader() {
    const bookable = state.rooms.filter((r) => r.bookable);
    const free = bookable.filter((r) => r.available);
    const beds = bookable.reduce((s, r) => s + r.capacity, 0);
    $('#onsite-stats').innerHTML = `
      <span class="stat-chip"><strong>${free.length}</strong> chambre${free.length > 1 ? 's' : ''} disponible${free.length > 1 ? 's' : ''} sur ${bookable.length}</span>
      <span class="stat-chip"><strong>${beds}</strong> couchages au total</span>`;
    $('#nights-info').innerHTML = `
      <div class="night-card"><span aria-hidden="true">🌙🌙</span><div><strong>${esc(state.nights.both)}</strong><small>2 nuits</small></div></div>
      <div class="night-card"><span aria-hidden="true">🌙</span><div><strong>${esc(state.nights.sat)}</strong><small>1 nuit</small></div></div>`;
    $('#closed-banner').hidden = !!state.onsite.open;
    ['rdc', 'etage'].forEach((f) => {
      const list = state.rooms.filter((r) => r.floor === f && r.bookable);
      $(`#tab-${f}-sub`).textContent = `${list.filter((r) => r.available).length} libre(s) sur ${list.length}`;
    });
  }

  /* ---------- Plan + liste ---------- */
  function renderPlan() {
    $('#plan').innerHTML = render(state.floor, state.rooms, {
      selectedId: state.selectedId,
      matches,
      statusOf,
      badge: (r) => (statusOf(r) === 'free' ? `${r.capacity} pers.` : statusOf(r) === 'taken' ? 'Réservée' : 'Indisponible'),
    });
  }

  function renderList() {
    const list = state.rooms.filter((r) => r.floor === state.floor && matches(r));
    $('#list-title').textContent = `${floorLabel(state.floor)} — ${list.length} chambre${list.length > 1 ? 's' : ''}`;
    $('#room-grid').innerHTML = list.map((r) => {
      const st = statusOf(r);
      const cover = r.photos[0];
      return `<button type="button" class="room-card is-${st}" data-room="${r.id}">
        <span class="rc-photo">${cover ? `<img src="${esc(cover.url)}" alt="" loading="lazy">` : '<span class="rc-placeholder" aria-hidden="true">🛏️</span>'}
          ${r.photos.length > 1 ? `<span class="rc-count">📷 ${r.photos.length}</span>` : ''}</span>
        <span class="rc-body">
          <span class="rc-top"><strong>${esc(r.name)}</strong>
            <span class="badge ${st === 'free' ? 'badge-ok' : 'badge-full'}">${st === 'free' ? 'Disponible' : st === 'taken' ? 'Réservée' : 'Indisponible'}</span></span>
          <span class="rc-line">👥 ${r.capacity} pers. · ${esc(r.beds)}</span>
          <span class="rc-line">${r.private_bath ? '🚿 Salle d’eau privative' : '🚿 Sanitaires partagés'}${r.baby_bed ? ' · 👶 Lit bébé' : ''}</span>
          ${priceHint(r) ? `<span class="rc-price">${esc(priceHint(r))}</span>` : ''}
        </span>
      </button>`;
    }).join('') || '<p class="muted center">Aucune chambre ne correspond à ce filtre à cet étage.</p>';
  }

  function refresh() {
    renderHeader();
    renderPlan();
    renderList();
  }

  /* ---------- Fiche chambre ---------- */
  const dialog = $('#room-dialog');

  function openRoom(id) {
    const r = state.rooms.find((x) => x.id === id);
    if (!r) return;
    state.selectedId = id;
    if (r.floor !== state.floor) setFloor(r.floor);
    else renderPlan();
    $('#rd-floor').textContent = `${floorLabel(r.floor)} · ${r.area}`;
    $('#rd-title').textContent = r.name;
    const st = statusOf(r);
    const canBook = st === 'free' && state.onsite.open;

    const gallery = r.photos.length
      ? `<div class="gallery" aria-roledescription="carrousel" aria-label="Photos de ${esc(r.name)}">
          <div class="gallery-track" id="gallery-track">
            ${r.photos.map((p, i) => `<img src="${esc(p.url)}" alt="${esc(r.name)}, photo ${i + 1} sur ${r.photos.length}" loading="${i ? 'lazy' : 'eager'}">`).join('')}
          </div>
          ${r.photos.length > 1 ? `<button type="button" class="g-nav g-prev" aria-label="Photo précédente">‹</button>
            <button type="button" class="g-nav g-next" aria-label="Photo suivante">›</button>
            <span class="g-count" id="g-count">1 / ${r.photos.length}</span>` : ''}
        </div>`
      : '<div class="gallery gallery-empty"><span aria-hidden="true">🛏️</span><small>Photos à venir</small></div>';

    const price = (key) => (r[key] === null || r[key] === undefined ? '<em>à préciser</em>' : esc(euro(r[key])));
    const options = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((n) => n <= r.capacity);

    $('#rd-body').innerHTML = `
      ${gallery}
      <div class="rd-content">
        <ul class="rd-facts">
          <li><span aria-hidden="true">👥</span><div><small>Capacité</small><strong>${r.capacity} personne${r.capacity > 1 ? 's' : ''}</strong></div></li>
          <li><span aria-hidden="true">🛏️</span><div><small>Couchage</small><strong>${esc(r.beds)}</strong></div></li>
          <li><span aria-hidden="true">🚿</span><div><small>Sanitaires</small><strong>${esc(r.bath)}</strong></div></li>
        </ul>
        ${r.description ? `<p class="pre">${esc(r.description)}</p>` : ''}
        <table class="price-table">
          <caption>Tarif de la chambre</caption>
          <tr><th scope="row">${esc(state.nights.both)}</th><td>${price('price_both')}</td></tr>
          <tr><th scope="row">${esc(state.nights.sat)}</th><td>${price('price_sat')}</td></tr>
        </table>

        ${canBook ? `
        <form class="form rd-form" id="rd-form" novalidate>
          <h3>Réserver ${esc(r.name)}</h3>
          <div class="grid-2">
            <label class="field">Prénom<input name="first_name" autocomplete="given-name" required maxlength="80"></label>
            <label class="field">Nom<input name="last_name" autocomplete="family-name" required maxlength="80"></label>
          </div>
          <label class="field">Nombre de personnes
            <select name="persons" required>${options.map((n) => `<option value="${n}" ${n === Math.min(2, r.capacity) ? 'selected' : ''}>${n} personne${n > 1 ? 's' : ''}</option>`).join('')}</select>
          </label>
          <fieldset class="field">
            <legend>Nuits</legend>
            <div class="choice">
              <label class="choice-item"><input type="radio" name="nights" value="both" required>
                <span><strong>${esc(state.nights.both)}</strong><small>${r.price_both !== null ? esc(euro(r.price_both)) : '2 nuits'}</small></span></label>
              <label class="choice-item"><input type="radio" name="nights" value="sat">
                <span><strong>${esc(state.nights.sat)}</strong><small>${r.price_sat !== null ? esc(euro(r.price_sat)) : '1 nuit'}</small></span></label>
            </div>
          </fieldset>
          <div class="grid-2">
            <label class="field">E-mail <small class="opt">(facultatif)</small><input name="email" type="email" autocomplete="email" maxlength="200"></label>
            <label class="field">Téléphone <small class="opt">(facultatif)</small><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
          </div>
          <label class="field">Message <small class="opt">(facultatif)</small><textarea name="message" rows="2" maxlength="2000"></textarea></label>
          ${state.codeRequired ? `<label class="field">Code d'invitation<input name="code" required autocomplete="off" maxlength="100" placeholder="Indiqué sur votre faire-part"></label>` : ''}
          <div class="hp" aria-hidden="true"><label>Site web <input name="website" tabindex="-1" autocomplete="off"></label></div>
          <button class="btn btn-primary" type="submit">Envoyer ma demande</button>
          <p class="form-status" role="status" aria-live="polite"></p>
          ${state.onsite.note ? `<p class="muted small pre">${esc(state.onsite.note)}</p>` : ''}
        </form>`
        : `<p class="rd-unavailable">${st === 'taken' ? 'Cette chambre est déjà réservée.' : st === 'off' ? 'Cette chambre n’est pas proposée à la réservation.' : 'Les réservations en ligne sont closes.'}</p>
           <button type="button" class="btn btn-ghost" id="rd-other">Voir les autres chambres</button>`}
      </div>`;

    setupGallery();
    const form = $('#rd-form');
    if (form) setupForm(form, r);
    $('#rd-other')?.addEventListener('click', () => {
      dialog.close();
      setFilter('available');
    });
    if (!dialog.open) dialog.showModal();
    $('#rd-body').scrollTop = 0;
  }

  function setupGallery() {
    const track = $('#gallery-track');
    if (!track) return;
    const count = $('#g-count');
    const n = track.children.length;
    const index = () => Math.round(track.scrollLeft / track.clientWidth);
    const go = (i) => track.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * track.clientWidth, behavior: 'smooth' });
    $('.g-prev')?.addEventListener('click', () => go(index() - 1));
    $('.g-next')?.addEventListener('click', () => go(index() + 1));
    track.addEventListener('scroll', () => { if (count) count.textContent = `${index() + 1} / ${n}`; }, { passive: true });
  }

  function setupForm(form, room) {
    const status = $('.form-status', form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status';
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const data = Object.fromEntries(new FormData(form).entries());
      data.room_id = room.id;
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      status.textContent = 'Envoi en cours…';
      try {
        const res = await api('/room-bookings', { method: 'POST', body: data });
        form.innerHTML = `<div class="rd-success"><span aria-hidden="true">✓</span><p>${esc(res.message)}</p>
          ${state.onsite.note ? `<p class="muted small pre">${esc(state.onsite.note)}</p>` : ''}
          <button type="button" class="btn btn-primary" id="rd-done">Fermer</button></div>`;
        $('#rd-done').addEventListener('click', () => dialog.close());
        await load(); // met à jour les disponibilités
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('error');
        if (err.status === 409) await load();
      } finally {
        btn.disabled = false;
      }
    });
  }

  dialog.addEventListener('close', () => {
    state.selectedId = null;
    renderPlan();
  });
  $('#rd-close').addEventListener('click', () => dialog.close());
  // Clic sur le fond assombri : fermeture
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  /* ---------- Contrôles ---------- */
  function setFloor(f) {
    state.floor = f;
    $$('.floor-tabs [data-floor]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.floor === f)));
    renderPlan();
    renderList();
  }
  function setFilter(f) {
    state.filter = f;
    $$('.filter-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === f)));
    renderPlan();
    renderList();
  }
  $$('.floor-tabs [data-floor]').forEach((b) => b.addEventListener('click', () => setFloor(b.dataset.floor)));
  $$('.filter-chip').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  bind($('#plan'), openRoom);
  $('#room-grid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-room]');
    if (card) openRoom(+card.dataset.room);
  });

  /* ---------- Chargement ---------- */
  async function load() {
    const data = await api('/rooms');
    state.rooms = data.rooms;
    state.nights = data.nights;
    state.onsite = data.onsite;
    state.codeRequired = data.code_required;
    refresh();
  }

  async function init() {
    try {
      const [site] = await Promise.all([api('/content'), load()]);
      loadAnalytics();
      bindText('couple', site.content.couple);
      document.title = `Dormir sur place — Mariage ${site.content.couple}`;
      bindText('venue', state.onsite.venue);
      bindText('intro', state.onsite.intro);
      bindText('note', state.onsite.note);
      // Lien direct vers une chambre : /dormir-sur-place/#ch7
      const code = location.hash.slice(1);
      const target = state.rooms.find((r) => r.code === code);
      if (target) openRoom(target.id);
    } catch (err) {
      document.body.insertAdjacentHTML('afterbegin', `<p class="load-error">Impossible de charger les chambres (${esc(err.message)}).</p>`);
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
