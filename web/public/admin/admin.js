/**
 * Interface d'administration (application monopage, sans framework).
 * Vues : Accueil, Invités, Gîtes & réservations, Lieux, Contenu, Sécurité.
 */
'use strict';

(() => {
  const { esc, api, KINDS, makeMap, pinIcon, hasCoords, formatDay } = window.MM;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const view = $('#view');

  const GUEST_STATUS = {
    yes: { label: 'Présent', cls: 'pill-ok' },
    no: { label: 'Absent', cls: 'pill-no' },
    pending: { label: 'Sans réponse', cls: 'pill-wait' },
  };
  const BOOKING_STATUS = {
    pending: { label: 'En attente', cls: 'pill-wait' },
    confirmed: { label: 'Confirmée', cls: 'pill-ok' },
    cancelled: { label: 'Annulée', cls: 'pill-no' },
  };

  /* =========================================================
     Utilitaires d'interface
     ========================================================= */
  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  /** Appel API avec gestion de la session expirée. */
  async function call(path, opts) {
    try {
      return await api(path, opts);
    } catch (err) {
      if (err.status === 401 && path !== '/admin/login') showLogin();
      throw err;
    }
  }

  const fmtDateTime = (s) => {
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + 'Z'); // SQLite stocke en UTC
    return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  /* ---------- Constructeur de formulaires ---------- */
  function fieldHtml(f, v) {
    const val = v ?? f.default ?? '';
    const req = f.required ? 'required' : '';
    const cls = `field ${f.full ? 'full' : ''}`;
    const help = f.help ? `<small class="help">${esc(f.help)}</small>` : '';
    switch (f.type) {
      case 'textarea':
        return `<label class="${cls}">${esc(f.label)}<textarea name="${f.name}" rows="${f.rows || 3}" ${req}>${esc(val)}</textarea>${help}</label>`;
      case 'select':
        return `<label class="${cls}">${esc(f.label)}<select name="${f.name}" ${req}>${f.options
          .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${help}</label>`;
      case 'checkbox':
        return `<label class="switch ${f.full ? 'full' : ''}"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>${esc(f.label)}${help}</span></label>`;
      case 'map':
        return `<div class="field full"><span>${esc(f.label)}</span>
          <div class="picker-map" data-map-picker></div>
          <div class="grid-2 coords"><label class="field">Latitude<input name="lat" inputmode="decimal" value="${esc(v?.lat ?? '')}"></label>
          <label class="field">Longitude<input name="lng" inputmode="decimal" value="${esc(v?.lng ?? '')}"></label></div>
          <small class="help">Cliquez (ou touchez) la carte pour placer le repère. Astuce : vous pouvez aussi coller des coordonnées « 43.61, 1.33 » dans le champ Latitude.</small></div>`;
      default:
        return `<label class="${cls}">${esc(f.label)}<input type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}" ${req}
          ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''}
          ${f.type === 'number' ? 'inputmode="numeric"' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${help}</label>`;
    }
  }

  function readForm(root, fields) {
    const out = {};
    for (const f of fields) {
      if (f.type === 'map') {
        out.lat = $('[name="lat"]', root).value.trim();
        out.lng = $('[name="lng"]', root).value.trim();
        continue;
      }
      const el = $(`[name="${f.name}"]`, root);
      if (!el) continue;
      out[f.name] = f.type === 'checkbox' ? el.checked : el.value;
    }
    return out;
  }

  /* ---------- Fenêtre modale ---------- */
  const modal = $('#modal');
  let modalSubmit = null;
  let modalOnClose = null;
  modal.addEventListener('close', () => {
    const fn = modalOnClose;
    modalOnClose = null;
    if (fn) fn();
  });

  /**
   * Ouvre un formulaire dans la modale.
   * buttons : [{ label, action: 'submit'|'delete', cls }]
   */
  function openModal({ title, html, onSubmit, submitLabel = 'Enregistrer', onDelete, deleteLabel = 'Supprimer', deleteConfirm = 'Cette action est définitive.', afterOpen, onClose }) {
    modalOnClose = onClose || null;
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = html;
    $('#modal-error').textContent = '';
    $('#modal-foot').innerHTML = `
      ${onDelete ? `<button type="button" class="btn btn-danger-ghost" id="modal-delete">${esc(deleteLabel)}</button>` : ''}
      <span class="spacer"></span>
      <button type="submit" value="cancel" class="btn btn-ghost" formnovalidate>Annuler</button>
      ${onSubmit ? `<button type="submit" value="ok" class="btn btn-primary">${esc(submitLabel)}</button>` : ''}`;
    modalSubmit = onSubmit;
    if (onDelete) {
      $('#modal-delete').addEventListener('click', async () => {
        if (!(await confirmBox('Confirmer la suppression ?', deleteConfirm))) return;
        try {
          await onDelete();
          modal.close();
        } catch (err) {
          $('#modal-error').textContent = err.message;
        }
      });
    }
    modal.showModal();
    afterOpen && afterOpen($('#modal-body'));
    // Focus sur le premier champ (sauf sur mobile, pour ne pas ouvrir le clavier)
    if (matchMedia('(hover: hover)').matches) $('#modal-body').querySelector('input, select, textarea')?.focus();
  }

  $('#modal-form').addEventListener('submit', async (e) => {
    if (e.submitter?.value === 'cancel') return; // fermeture standard
    e.preventDefault();
    const form = $('#modal-form');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const btn = e.submitter;
    btn && (btn.disabled = true);
    try {
      await modalSubmit($('#modal-body'));
      modal.close();
    } catch (err) {
      $('#modal-error').textContent = err.message;
    } finally {
      btn && (btn.disabled = false);
    }
  });

  /** Boîte de confirmation (remplace window.confirm, plus lisible sur mobile). */
  function confirmBox(title, text) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'modal modal-small';
      d.innerHTML = `<div class="modal-inner"><div class="modal-body"><h2>${esc(title)}</h2><p class="muted">${esc(text || '')}</p></div>
        <footer class="modal-foot"><span class="spacer"></span><button class="btn btn-ghost" data-r="0">Annuler</button>
        <button class="btn btn-danger" data-r="1">Confirmer</button></footer></div>`;
      document.body.append(d);
      d.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]');
        if (r) d.close(r.dataset.r);
      });
      d.addEventListener('close', () => { resolve(d.returnValue === '1'); d.remove(); });
      d.showModal();
    });
  }

  /** Carte pour choisir des coordonnées dans un formulaire. */
  function setupMapPicker(root, fallbackCenter) {
    const el = $('[data-map-picker]', root);
    if (!el) return;
    const latIn = $('[name="lat"]', root);
    const lngIn = $('[name="lng"]', root);
    const map = makeMap(el, { scrollWheelZoom: true });
    let marker = null;
    const place = (lat, lng, pan) => {
      if (!marker) marker = L.marker([lat, lng], { draggable: true }).addTo(map).on('dragend', () => {
        const p = marker.getLatLng();
        latIn.value = p.lat.toFixed(6);
        lngIn.value = p.lng.toFixed(6);
      });
      marker.setLatLng([lat, lng]);
      marker.setIcon(pinIcon('📍'));
      if (pan) map.setView([lat, lng], Math.max(map.getZoom() || 15, 15));
    };
    const lat = parseFloat(latIn.value), lng = parseFloat(lngIn.value);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], 15);
      place(lat, lng);
    } else {
      map.setView(fallbackCenter || [46.6, 2.4], fallbackCenter ? 13 : 5); // France entière par défaut
    }
    map.on('click', (e) => {
      latIn.value = e.latlng.lat.toFixed(6);
      lngIn.value = e.latlng.lng.toFixed(6);
      place(e.latlng.lat, e.latlng.lng);
    });
    const sync = () => {
      // Collage « lat, lng » dans un seul champ
      const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(latIn.value);
      if (m) { latIn.value = m[1].replace(',', '.'); lngIn.value = m[2].replace(',', '.'); }
      const a = parseFloat(latIn.value), b = parseFloat(lngIn.value);
      if (Number.isFinite(a) && Number.isFinite(b)) place(a, b, true);
    };
    latIn.addEventListener('change', sync);
    lngIn.addEventListener('change', sync);
    setTimeout(() => map.invalidateSize(), 150); // la modale vient de s'ouvrir
  }

  /** Centre par défaut des cartes de sélection : premier lieu connu. */
  let defaultCenter = null;
  async function loadDefaultCenter() {
    try {
      const places = await call('/admin/places');
      const p = places.find(hasCoords);
      if (p) defaultCenter = [p.lat, p.lng];
    } catch { /* sans importance */ }
  }

  /* =========================================================
     Navigation
     ========================================================= */
  const views = { dashboard, guests, lodging, places, content, security };
  // Les autres fichiers (admin-rooms.js) ajoutent leurs vues via MMAdmin.registerView
  let current = 'dashboard';

  function go(name) {
    if (!views[name]) name = 'dashboard';
    current = name;
    $$('.tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.view === name ? 'page' : 'false'));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    view.innerHTML = '<p class="loading">Chargement…</p>';
    window.scrollTo(0, 0);
    views[name]().catch((err) => {
      if (err.status !== 401) view.innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
    });
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  const refresh = () => go(current);

  /* =========================================================
     Vue : Accueil (tableau de bord)
     ========================================================= */
  async function dashboard() {
    const [s, c] = await Promise.all([call('/admin/stats'), call('/admin/content')]);
    const g = s.guests;
    const answered = g.yes + g.no;
    const pct = g.households ? Math.round((answered / g.households) * 100) : 0;
    const people = g.adults + g.children;
    const roomPct = s.onsite.rooms ? Math.round((s.onsite.taken / s.onsite.rooms) * 100) : 0;
    const lodgingPct = s.lodging.capacity ? Math.round((s.lodging.reserved / s.lodging.capacity) * 100) : 0;
    const daysLeft = (() => {
      const [y, m, d] = c.date.slice(0, 10).split('-').map(Number);
      const today = new Date();
      return Math.ceil((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400_000);
    })();

    view.innerHTML = `
      <div class="page-head">
        <h1>Bonjour 👋</h1>
        <p class="muted">${daysLeft > 0 ? `Plus que <strong>${plural(daysLeft, 'jour', 'jours')}</strong> avant le mariage.` : daysLeft === 0 ? "C'est le grand jour !" : 'Le mariage est passé.'}
        ${c.rsvp_deadline ? ` Date limite de réponse : <strong>${esc(formatDay(c.rsvp_deadline))}</strong>.` : ''}</p>
      </div>

      <div class="stats">
        <button class="stat stat-ok" data-goto="guests" data-filter="yes"><span class="stat-num">${people}</span><span class="stat-label">personnes attendues</span>
          <span class="stat-sub">${plural(g.adults, 'adulte', 'adultes')} · ${plural(g.children, 'enfant', 'enfants')}</span></button>
        <button class="stat" data-goto="guests" data-filter="yes"><span class="stat-num">${g.yes}</span><span class="stat-label">foyers présents</span></button>
        <button class="stat stat-no" data-goto="guests" data-filter="no"><span class="stat-num">${g.no}</span><span class="stat-label">foyers absents</span></button>
        <button class="stat stat-wait" data-goto="guests" data-filter="pending"><span class="stat-num">${g.pending}</span><span class="stat-label">sans réponse</span></button>
      </div>

      <div class="panel-grid">
        <section class="panel">
          <h2>Réponses reçues</h2>
          <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span data-w="${pct}"></span></div>
          <p class="muted small">${answered} réponse(s) sur ${plural(g.households, 'foyer', 'foyers')} enregistrés (${pct} %).</p>
          ${g.households === 0 ? `<p class="hint">Astuce : ajoutez votre liste d'invités dans l'onglet <a href="#guests" data-goto="guests">Invités</a> pour suivre qui n'a pas encore répondu.</p>` : ''}
        </section>

        <section class="panel">
          <h2>Gîtes alentours</h2>
          <div class="progress" role="progressbar" aria-valuenow="${lodgingPct}" aria-valuemin="0" aria-valuemax="100"><span data-w="${lodgingPct}"></span></div>
          <p class="muted small">${s.lodging.reserved} place(s) réservée(s) sur ${s.lodging.capacity}.</p>
          ${s.lodging.pending ? `<p><button class="btn btn-small btn-primary" data-goto="lodging">${plural(s.lodging.pending, 'demande', 'demandes')} à valider →</button></p>` : '<p class="muted small">Aucune demande en attente.</p>'}
        </section>

        <section class="panel">
          <h2>Chambres sur place</h2>
          <div class="progress" role="progressbar" aria-valuenow="${roomPct}" aria-valuemin="0" aria-valuemax="100"><span data-w="${roomPct}"></span></div>
          <p class="muted small">${s.onsite.taken} chambre(s) réservée(s) sur ${s.onsite.rooms} · ${s.onsite.persons} personne(s) logée(s)</p>
          ${s.onsite.pending ? `<p><button class="btn btn-small btn-primary" data-goto="rooms">${plural(s.onsite.pending, 'demande', 'demandes')} à valider →</button></p>` : '<p class="muted small">Aucune demande en attente.</p>'}
        </section>

        <section class="panel">
          <h2>Régimes &amp; allergies</h2>
          ${s.diets.length ? `<ul class="plain-list">${s.diets.map((d) => `<li><strong>${esc(d.name)}</strong> — ${esc(d.diet)}</li>`).join('')}</ul>`
            : '<p class="muted small">Aucun régime particulier signalé pour l’instant.</p>'}
        </section>

        <section class="panel">
          <h2>Derniers messages</h2>
          ${s.messages.length ? `<ul class="plain-list messages">${s.messages.map((m) => `<li><p>« ${esc(m.message)} »</p><small>${esc(m.name)} · ${fmtDateTime(m.responded_at)}</small></li>`).join('')}</ul>`
            : '<p class="muted small">Pas encore de message.</p>'}
        </section>
      </div>`;
    $$('.progress span', view).forEach((el) => { el.style.width = el.dataset.w + '%'; });
    $$('[data-goto]', view).forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      if (b.dataset.filter) guestFilter = b.dataset.filter;
      go(b.dataset.goto);
    }));
  }

  /* =========================================================
     Vue : Invités
     ========================================================= */
  let guestFilter = 'all';
  let guestSearch = '';

  const guestFields = [
    { name: 'name', label: 'Nom (personne ou foyer)', required: true, full: true },
    { name: 'status', label: 'Réponse', type: 'select', options: Object.entries(GUEST_STATUS).map(([value, s]) => ({ value, label: s.label })), default: 'pending' },
    { name: 'adults', label: 'Adultes', type: 'number', min: 0, max: 50, default: 1 },
    { name: 'children', label: 'Enfants', type: 'number', min: 0, max: 50, default: 0 },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'phone', label: 'Téléphone', type: 'tel' },
    { name: 'diet', label: 'Régime / allergies', full: true },
    { name: 'message', label: 'Message laissé', type: 'textarea', full: true },
    { name: 'notes', label: 'Notes internes (non visibles par l’invité)', type: 'textarea', full: true },
  ];

  function editGuest(g) {
    openModal({
      title: g ? 'Modifier l’invité' : 'Ajouter un invité',
      html: `<div class="grid-2">${guestFields.map((f) => fieldHtml(f, g?.[f.name])).join('')}</div>
             ${g ? `<p class="muted small">${g.source === 'web' ? 'Réponse envoyée depuis le site' : 'Ajouté depuis l’administration'}${g.responded_at ? ' · répondu le ' + fmtDateTime(g.responded_at) : ''}</p>` : ''}`,
      onSubmit: async (root) => {
        const data = readForm(root, guestFields);
        if (g) await call(`/admin/guests/${g.id}`, { method: 'PUT', body: data });
        else await call('/admin/guests', { method: 'POST', body: data });
        toast('Invité enregistré');
        refresh();
      },
      onDelete: g ? async () => { await call(`/admin/guests/${g.id}`, { method: 'DELETE' }); toast('Invité supprimé'); refresh(); } : null,
    });
  }

  function bulkGuests() {
    openModal({
      title: 'Ajouter une liste d’invités',
      html: `<p class="muted small">Un foyer par ligne. Vous pouvez coller une colonne depuis Excel.
             Pour indiquer le nombre d'adultes attendus, ajoutez « ;2 » après le nom.</p>
             <label class="field full">Liste<textarea name="text" rows="10" placeholder="Famille Martin;4&#10;Julie Bernard;2&#10;Tonton Jacques"></textarea></label>`,
      submitLabel: 'Ajouter',
      onSubmit: async (root) => {
        const r = await call('/admin/guests/bulk', { method: 'POST', body: { text: $('[name="text"]', root).value } });
        toast(`${r.added} ajouté(s)${r.skipped ? `, ${r.skipped} ignoré(s) (doublons ou vides)` : ''}`);
        refresh();
      },
    });
  }

  async function guests() {
    const list = await call('/admin/guests');
    const counts = { all: list.length, yes: 0, no: 0, pending: 0 };
    list.forEach((g) => counts[g.status]++);

    view.innerHTML = `
      <div class="page-head row">
        <h1>Invités</h1>
        <div class="actions">
          <button class="btn btn-primary btn-small" id="add-guest">+ Ajouter</button>
          <button class="btn btn-ghost btn-small" id="bulk-guest">Coller une liste</button>
          <a class="btn btn-ghost btn-small" href="/api/admin/guests.csv" download>Exporter (Excel)</a>
        </div>
      </div>
      <div class="toolbar">
        <input type="search" id="guest-search" placeholder="Rechercher un nom, un e-mail…" value="${esc(guestSearch)}" aria-label="Rechercher">
        <div class="chips" role="group" aria-label="Filtrer par réponse">
          ${[['all', 'Tous'], ['yes', 'Présents'], ['no', 'Absents'], ['pending', 'Sans réponse']]
            .map(([k, l]) => `<button class="chip" data-filter="${k}" aria-pressed="${guestFilter === k}">${l} <span>${counts[k]}</span></button>`).join('')}
        </div>
      </div>
      <div class="list" id="guest-list"></div>`;

    const render = () => {
      const q = guestSearch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const rows = list.filter((g) => (guestFilter === 'all' || g.status === guestFilter) &&
        (!q || `${g.name} ${g.email} ${g.phone}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)));
      $('#guest-list').innerHTML = rows.length ? rows.map((g) => `
        <button class="row-card" data-id="${g.id}">
          <span class="row-main"><strong>${esc(g.name)}</strong>
            <small>${g.status === 'yes' ? `${plural(g.adults, 'adulte', 'adultes')}${g.children ? ', ' + plural(g.children, 'enfant', 'enfants') : ''}` : ''}
            ${g.diet ? ` · 🍽️ ${esc(g.diet)}` : ''}${g.email ? ` · ${esc(g.email)}` : ''}${g.phone ? ` · ${esc(g.phone)}` : ''}</small>
            ${g.message ? `<small class="quote">« ${esc(g.message)} »</small>` : ''}</span>
          <span class="pill ${GUEST_STATUS[g.status].cls}">${GUEST_STATUS[g.status].label}</span>
        </button>`).join('') : '<p class="empty">Aucun invité ne correspond.</p>';
      $$('#guest-list .row-card').forEach((el) => el.addEventListener('click', () => editGuest(list.find((g) => g.id === +el.dataset.id))));
    };
    render();

    $('#guest-search').addEventListener('input', (e) => { guestSearch = e.target.value; render(); });
    $$('.chip', view).forEach((c) => c.addEventListener('click', () => {
      guestFilter = c.dataset.filter;
      $$('.chip', view).forEach((x) => x.setAttribute('aria-pressed', x === c));
      render();
    }));
    $('#add-guest').addEventListener('click', () => editGuest(null));
    $('#bulk-guest').addEventListener('click', bulkGuests);
  }

  /* =========================================================
     Vue : Gîtes & réservations
     ========================================================= */
  const giteFields = [
    { name: 'name', label: 'Nom', required: true, full: true },
    { name: 'address', label: 'Adresse', full: true },
    { name: 'capacity', label: 'Capacité (couchages)', type: 'number', min: 0, max: 1000, default: 0 },
    { name: 'price', label: 'Tarif (texte libre)', placeholder: '35 € / pers. / nuit' },
    { name: 'contact', label: 'Contact (tél. ou e-mail)' },
    { name: 'url', label: 'Site web', type: 'url', placeholder: 'https://…' },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
    { name: 'bookable', label: 'Réservable depuis le site (sinon : informations seulement)', type: 'checkbox', full: true, default: true },
    { name: 'sort', label: 'Ordre d’affichage', type: 'number', default: 0, help: 'Les plus petits nombres apparaissent en premier.' },
    { type: 'map', label: 'Position sur la carte' },
  ];

  function editGite(g) {
    openModal({
      title: g ? 'Modifier l’hébergement' : 'Ajouter un hébergement',
      html: `<div class="grid-2">${giteFields.map((f) => fieldHtml(f, f.type === 'map' ? g : g?.[f.name])).join('')}</div>`,
      afterOpen: (root) => setupMapPicker(root, defaultCenter),
      onSubmit: async (root) => {
        const data = readForm(root, giteFields);
        if (g) await call(`/admin/gites/${g.id}`, { method: 'PUT', body: data });
        else await call('/admin/gites', { method: 'POST', body: data });
        toast('Hébergement enregistré');
        refresh();
      },
      onDelete: g ? async () => { await call(`/admin/gites/${g.id}`, { method: 'DELETE' }); toast('Hébergement supprimé'); refresh(); } : null,
      deleteConfirm: 'L’hébergement et toutes ses réservations seront supprimés définitivement.',
    });
  }

  function bookingFields(gites) {
    return [
      { name: 'gite_id', label: 'Hébergement', type: 'select', full: true, options: gites.map((g) => ({ value: g.id, label: `${g.name} (${g.remaining} libre(s))` })) },
      { name: 'name', label: 'Nom', required: true },
      { name: 'persons', label: 'Personnes', type: 'number', min: 1, max: 100, default: 1 },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'phone', label: 'Téléphone', type: 'tel' },
      { name: 'nights', label: 'Nuits', full: true },
      { name: 'status', label: 'Statut', type: 'select', options: Object.entries(BOOKING_STATUS).map(([value, s]) => ({ value, label: s.label })), default: 'confirmed' },
      { name: 'message', label: 'Message', type: 'textarea', full: true },
    ];
  }

  function editBooking(b, gites) {
    const fields = bookingFields(gites);
    openModal({
      title: b ? 'Modifier la réservation' : 'Ajouter une réservation',
      html: `<div class="grid-2">${fields.map((f) => fieldHtml(f, b?.[f.name])).join('')}</div>
             ${b ? `<p class="muted small">Demande reçue le ${fmtDateTime(b.created_at)}</p>` : ''}`,
      onSubmit: async (root) => {
        const data = readForm(root, fields);
        if (b) await call(`/admin/bookings/${b.id}`, { method: 'PUT', body: data });
        else await call('/admin/bookings', { method: 'POST', body: data });
        toast('Réservation enregistrée');
        refresh();
      },
      onDelete: b ? async () => { await call(`/admin/bookings/${b.id}`, { method: 'DELETE' }); toast('Réservation supprimée'); refresh(); } : null,
    });
  }

  async function setBookingStatus(id, status) {
    try {
      await call(`/admin/bookings/${id}`, { method: 'PUT', body: { status } });
      toast(status === 'confirmed' ? 'Réservation confirmée' : status === 'cancelled' ? 'Réservation annulée' : 'Réservation remise en attente');
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function lodging() {
    const [gites, bookings] = await Promise.all([call('/admin/gites'), call('/admin/bookings')]);
    const pending = bookings.filter((b) => b.status === 'pending').length;

    view.innerHTML = `
      <div class="page-head row">
        <h1>Gîtes &amp; réservations</h1>
        <div class="actions">
          <button class="btn btn-primary btn-small" id="add-gite">+ Hébergement</button>
          <button class="btn btn-ghost btn-small" id="add-booking" ${gites.length ? '' : 'disabled'}>+ Réservation</button>
          <a class="btn btn-ghost btn-small" href="/api/admin/bookings.csv" download>Exporter (Excel)</a>
        </div>
      </div>
      ${pending ? `<p class="notice">📬 ${plural(pending, 'demande attend', 'demandes attendent')} votre validation.</p>` : ''}
      <div class="gite-list">
        ${gites.map((g) => {
          const own = bookings.filter((b) => b.gite_id === g.id);
          const pct = g.capacity ? Math.min(100, Math.round((g.reserved / g.capacity) * 100)) : 0;
          return `<section class="panel gite-panel">
            <header class="gite-panel-head">
              <div><h2>${esc(g.name)}</h2>
                <p class="muted small">${esc(g.address || 'Adresse non renseignée')}${hasCoords(g) ? '' : ' · ⚠️ pas de position sur la carte'}</p></div>
              <button class="btn btn-ghost btn-small" data-edit-gite="${g.id}">Modifier</button>
            </header>
            ${g.bookable ? `
              <div class="progress ${pct >= 100 ? 'full' : ''}"><span data-w="${pct}"></span></div>
              <p class="small"><strong>${g.reserved} / ${g.capacity}</strong> places réservées · <strong>${g.remaining}</strong> libre(s)</p>`
              : '<p class="small muted">Informations seulement (non réservable sur le site).</p>'}
            ${own.length ? `<ul class="bookings">${own.map((b) => `
              <li class="booking ${b.status}">
                <div class="booking-main">
                  <strong>${esc(b.name)}</strong> · ${plural(b.persons, 'pers.', 'pers.')}
                  <span class="pill ${BOOKING_STATUS[b.status].cls}">${BOOKING_STATUS[b.status].label}</span>
                  <small>${[b.nights, b.email, b.phone].filter(Boolean).map(esc).join(' · ')}</small>
                  ${b.message ? `<small class="quote">« ${esc(b.message)} »</small>` : ''}
                </div>
                <div class="booking-actions">
                  ${b.status !== 'confirmed' ? `<button class="btn btn-small btn-primary" data-status="confirmed" data-id="${b.id}">Valider</button>` : ''}
                  ${b.status !== 'cancelled' ? `<button class="btn btn-small btn-ghost" data-status="cancelled" data-id="${b.id}">Annuler</button>` : ''}
                  <button class="btn btn-small btn-ghost" data-edit-booking="${b.id}" aria-label="Modifier la réservation de ${esc(b.name)}">✏️</button>
                </div>
              </li>`).join('')}</ul>` : (g.bookable ? '<p class="muted small">Aucune réservation.</p>' : '')}
          </section>`;
        }).join('') || '<p class="empty">Aucun hébergement. Ajoutez-en un avec le bouton ci-dessus.</p>'}
      </div>`;

    $$('.progress span', view).forEach((el) => { el.style.width = el.dataset.w + '%'; });
    $('#add-gite').addEventListener('click', () => editGite(null));
    $('#add-booking').addEventListener('click', () => editBooking(null, gites));
    $$('[data-edit-gite]').forEach((b) => b.addEventListener('click', () => editGite(gites.find((g) => g.id === +b.dataset.editGite))));
    $$('[data-edit-booking]').forEach((b) => b.addEventListener('click', () => editBooking(bookings.find((x) => x.id === +b.dataset.editBooking), gites)));
    $$('[data-status]').forEach((b) => b.addEventListener('click', () => setBookingStatus(+b.dataset.id, b.dataset.status)));
  }

  /* =========================================================
     Vue : Lieux
     ========================================================= */
  const placeFields = [
    { name: 'kind', label: 'Type', type: 'select', options: Object.entries(KINDS).map(([value, k]) => ({ value, label: `${k.icon} ${k.label}` })) },
    { name: 'time', label: 'Heure', placeholder: '14h30' },
    { name: 'name', label: 'Nom', required: true, full: true },
    { name: 'address', label: 'Adresse', full: true },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
    { name: 'sort', label: 'Ordre dans le programme', type: 'number', default: 0, help: 'Les plus petits nombres apparaissent en premier.' },
    { type: 'map', label: 'Position sur la carte' },
  ];

  function editPlace(p) {
    openModal({
      title: p ? 'Modifier le lieu' : 'Ajouter un lieu',
      html: `<div class="grid-2">${placeFields.map((f) => fieldHtml(f, f.type === 'map' ? p : p?.[f.name])).join('')}</div>`,
      afterOpen: (root) => setupMapPicker(root, defaultCenter),
      onSubmit: async (root) => {
        const data = readForm(root, placeFields);
        if (p) await call(`/admin/places/${p.id}`, { method: 'PUT', body: data });
        else await call('/admin/places', { method: 'POST', body: data });
        toast('Lieu enregistré');
        await loadDefaultCenter();
        refresh();
      },
      onDelete: p ? async () => { await call(`/admin/places/${p.id}`, { method: 'DELETE' }); toast('Lieu supprimé'); refresh(); } : null,
    });
  }

  async function places() {
    const list = await call('/admin/places');
    view.innerHTML = `
      <div class="page-head row">
        <h1>Lieux &amp; programme</h1>
        <div class="actions"><button class="btn btn-primary btn-small" id="add-place">+ Ajouter un lieu</button></div>
      </div>
      <p class="muted small">Les lieux apparaissent dans le programme et sur la carte, dans l’ordre choisi.</p>
      <div class="list">
        ${list.map((p) => `<button class="row-card" data-id="${p.id}">
          <span class="row-icon" aria-hidden="true">${(KINDS[p.kind] || KINDS.autre).icon}</span>
          <span class="row-main"><strong>${esc(p.time ? p.time + ' — ' : '')}${esc(p.name)}</strong>
          <small>${esc(p.address || 'Adresse non renseignée')}${hasCoords(p) ? '' : ' · ⚠️ pas de position sur la carte'}</small></span>
          <span class="row-chevron" aria-hidden="true">›</span></button>`).join('') || '<p class="empty">Aucun lieu.</p>'}
      </div>`;
    $('#add-place').addEventListener('click', () => editPlace(null));
    $$('.row-card', view).forEach((el) => el.addEventListener('click', () => editPlace(list.find((p) => p.id === +el.dataset.id))));
  }

  /* =========================================================
     Vue : Contenu du site
     ========================================================= */
  async function content() {
    const c = await call('/admin/content');
    view.innerHTML = `
      <div class="page-head"><h1>Contenu du site</h1>
        <p class="muted small">Les modifications sont visibles immédiatement sur le site après enregistrement.</p></div>
      <form id="content-form" class="content-form" novalidate>
        <section class="panel">
          <h2>Informations générales</h2>
          <div class="grid-2">
            <label class="field full">Prénoms des mariés<input name="couple" required value="${esc(c.couple)}"></label>
            <label class="field">Date et heure (début)<input type="datetime-local" name="date" required value="${esc(c.date)}"></label>
            <label class="field">Date limite de réponse<input type="date" name="rsvp_deadline" value="${esc(c.rsvp_deadline)}"></label>
            <label class="field">Durée de la fête (heures)<input type="number" name="duration_hours" min="1" max="72" value="${esc(c.duration_hours)}">
              <small class="help">Sert uniquement au fichier « Ajouter à mon agenda ».</small></label>
            <label class="field">Fuseau horaire<input name="timezone" value="${esc(c.timezone)}"><small class="help">Laissez « Europe/Paris » pour la France.</small></label>
            <label class="field full">Mot d’accueil<textarea name="welcome" rows="4">${esc(c.welcome)}</textarea></label>
            <label class="field">E-mail de contact<input type="email" name="contact_email" value="${esc(c.contact_email)}"></label>
            <label class="field">Téléphone de contact<input type="tel" name="contact_phone" value="${esc(c.contact_phone)}"></label>
          </div>
        </section>

        <section class="panel">
          <h2>Ouverture des formulaires</h2>
          <label class="switch"><input type="checkbox" name="rsvp_open" ${c.options.rsvp_open ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Les invités peuvent répondre (RSVP)</span></label>
          <label class="switch"><input type="checkbox" name="bookings_open" ${c.options.bookings_open ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Les invités peuvent réserver un gîte</span></label>
          <label class="field">Nuits proposées à la réservation (une par ligne)
            <textarea name="nights" rows="3">${esc((c.nights || []).join('\n'))}</textarea></label>
        </section>

        <section class="panel">
          <h2>Page « Dormir sur place »</h2>
          <label class="switch"><input type="checkbox" name="onsite_open" ${c.onsite.open ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Les invités peuvent réserver une chambre</span></label>
          <label class="field">Nom du lieu<input name="onsite_venue" value="${esc(c.onsite.venue)}"></label>
          <label class="field">Texte d’introduction<textarea name="onsite_intro" rows="3">${esc(c.onsite.intro)}</textarea></label>
          <label class="field">Note (règlement, arrivée…)<textarea name="onsite_note" rows="2">${esc(c.onsite.note)}</textarea></label>
          <p class="muted small">Les chambres, leurs prix et leurs photos se gèrent dans l’onglet <a href="#rooms" data-goto-rooms>Chambres</a>.</p>
        </section>

        <section class="panel">
          <h2>Thème</h2>
          <label class="field">Nom du thème<input name="theme_title" value="${esc(c.theme.title)}"></label>
          <label class="field">Description<textarea name="theme_description" rows="4">${esc(c.theme.description)}</textarea></label>
          <label class="field">Code vestimentaire<textarea name="theme_dress_code" rows="3">${esc(c.theme.dress_code)}</textarea></label>
          <div class="field"><span>Couleurs <small class="help">La première couleur colore les boutons et titres du site.</small></span>
            <div class="colors" id="colors"></div>
            <button type="button" class="btn btn-ghost btn-small" id="add-color">+ Ajouter une couleur</button>
          </div>
        </section>

        <section class="panel">
          <h2>Menu du repas</h2>
          <label class="field">Introduction<input name="menu_intro" value="${esc(c.menu_intro)}"></label>
          <div id="courses"></div>
          <button type="button" class="btn btn-ghost btn-small" id="add-course">+ Ajouter une étape du repas</button>
          <label class="field">Note sous le menu<input name="menu_note" value="${esc(c.menu_note)}"></label>
        </section>

        <div class="savebar"><span class="muted small" id="dirty"></span><button class="btn btn-primary" type="submit">Enregistrer</button></div>
      </form>`;

    const form = $('#content-form');
    $('[data-goto-rooms]', form).addEventListener('click', (e) => { e.preventDefault(); go('rooms'); });

    // Couleurs
    const colorRow = (hex) => `<div class="color-row"><input type="color" value="${esc(hex)}" aria-label="Couleur">
      <input class="hex" value="${esc(hex)}" maxlength="7" aria-label="Code couleur"><button type="button" class="icon-btn" data-remove aria-label="Retirer">✕</button></div>`;
    const colors = $('#colors');
    colors.innerHTML = (c.theme.colors || []).map(colorRow).join('');
    colors.addEventListener('input', (e) => {
      const row = e.target.closest('.color-row');
      if (!row) return;
      if (e.target.type === 'color') $('.hex', row).value = e.target.value;
      else if (/^#[0-9a-f]{6}$/i.test(e.target.value)) $('[type=color]', row).value = e.target.value;
    });
    colors.addEventListener('click', (e) => { if (e.target.closest('[data-remove]')) e.target.closest('.color-row').remove(); markDirty(); });
    $('#add-color').addEventListener('click', () => { colors.insertAdjacentHTML('beforeend', colorRow('#c9a46c')); markDirty(); });

    // Étapes du menu
    const courseBlock = (s) => `<div class="course">
      <div class="course-head"><input class="course-title" placeholder="Ex. Entrée" value="${esc(s.title)}" aria-label="Nom de l'étape">
        <button type="button" class="icon-btn" data-up aria-label="Monter">↑</button>
        <button type="button" class="icon-btn" data-down aria-label="Descendre">↓</button>
        <button type="button" class="icon-btn" data-remove aria-label="Supprimer l'étape">✕</button></div>
      <textarea class="course-items" rows="3" placeholder="Un plat par ligne" aria-label="Plats (un par ligne)">${esc((s.items || []).join('\n'))}</textarea></div>`;
    const courses = $('#courses');
    courses.innerHTML = (c.menu || []).map(courseBlock).join('');
    courses.addEventListener('click', (e) => {
      const block = e.target.closest('.course');
      if (!block) return;
      if (e.target.closest('[data-remove]')) block.remove();
      if (e.target.closest('[data-up]') && block.previousElementSibling) block.previousElementSibling.before(block);
      if (e.target.closest('[data-down]') && block.nextElementSibling) block.nextElementSibling.after(block);
      markDirty();
    });
    $('#add-course').addEventListener('click', () => { courses.insertAdjacentHTML('beforeend', courseBlock({ title: '', items: [] })); markDirty(); });

    // Indicateur de modifications non enregistrées
    let dirty = false;
    function markDirty() { dirty = true; $('#dirty').textContent = 'Modifications non enregistrées'; }
    form.addEventListener('input', markDirty);
    window.onbeforeunload = () => (dirty && current === 'content' ? true : undefined);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const v = (n) => form.elements[n].value;
      const body = {
        couple: v('couple'), date: v('date'), rsvp_deadline: v('rsvp_deadline'), duration_hours: v('duration_hours'),
        timezone: v('timezone'), welcome: v('welcome'), contact_email: v('contact_email'), contact_phone: v('contact_phone'),
        nights: v('nights').split('\n').map((s) => s.trim()).filter(Boolean),
        options: { rsvp_open: form.elements.rsvp_open.checked, bookings_open: form.elements.bookings_open.checked },
        onsite: { open: form.elements.onsite_open.checked, venue: v('onsite_venue'), intro: v('onsite_intro'), note: v('onsite_note') },
        theme: {
          title: v('theme_title'), description: v('theme_description'), dress_code: v('theme_dress_code'),
          colors: $$('.color-row .hex', form).map((i) => i.value.trim()).filter((x) => /^#[0-9a-f]{6}$/i.test(x)),
        },
        menu_intro: v('menu_intro'), menu_note: v('menu_note'),
        menu: $$('.course', form).map((b) => ({
          title: $('.course-title', b).value.trim(),
          items: $('.course-items', b).value.split('\n').map((s) => s.trim()).filter(Boolean),
        })),
      };
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await call('/admin/content', { method: 'PUT', body });
        dirty = false;
        $('#dirty').textContent = 'Enregistré ✓';
        $('#brand-couple').textContent = body.couple;
        toast('Contenu enregistré');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* =========================================================
     Vue : Sécurité
     ========================================================= */
  async function security() {
    const s = await call('/admin/security');
    view.innerHTML = `
      <div class="page-head"><h1>Sécurité</h1></div>
      <div class="panel-grid">
        <form class="panel" id="code-form">
          <h2>Code d’invitation</h2>
          <p class="muted small">Si vous indiquez un code (par exemple imprimé sur le faire-part), les invités devront le saisir pour répondre ou réserver.
            Laissez vide pour ne pas en demander. Les majuscules ne comptent pas.</p>
          <label class="field">Code<input name="invite_code" value="${esc(s.invite_code)}" autocomplete="off" maxlength="100"></label>
          <button class="btn btn-primary" type="submit">Enregistrer le code</button>
        </form>
        <form class="panel" id="pwd-form">
          <h2>Mot de passe administrateur</h2>
          <label class="field">Mot de passe actuel<input type="password" name="current" autocomplete="current-password" required></label>
          <label class="field">Nouveau mot de passe<input type="password" name="next" autocomplete="new-password" minlength="10" required>
            <small class="help">10 caractères minimum. Une phrase de plusieurs mots est idéale.</small></label>
          <label class="field">Confirmer<input type="password" name="confirm" autocomplete="new-password" minlength="10" required></label>
          <button class="btn btn-primary" type="submit">Changer le mot de passe</button>
          <p class="form-error" role="alert"></p>
        </form>
      </div>`;

    $('#code-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await call('/admin/security/invite-code', { method: 'PUT', body: { invite_code: e.target.elements.invite_code.value } });
        toast(e.target.elements.invite_code.value ? 'Code d’invitation activé' : 'Code d’invitation désactivé');
      } catch (err) { toast(err.message, 'error'); }
    });
    $('#pwd-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const errEl = $('.form-error', f);
      errEl.textContent = '';
      if (!f.checkValidity()) { f.reportValidity(); return; }
      if (f.elements.next.value !== f.elements.confirm.value) { errEl.textContent = 'Les deux mots de passe ne correspondent pas.'; return; }
      try {
        await call('/admin/security/password', { method: 'PUT', body: { current: f.elements.current.value, next: f.elements.next.value } });
        f.reset();
        toast('Mot de passe modifié. Les autres appareils ont été déconnectés.');
      } catch (err) { errEl.textContent = err.message; }
    });
  }

  /* ---------- Utilitaires partagés avec admin-rooms.js ---------- */
  window.MMAdmin = {
    $, $$, call, toast, openModal, confirmBox, fieldHtml, readForm, fmtDateTime, plural, view,
    refresh: () => refresh(),
    registerView: (name, fn) => { views[name] = fn; },
  };

  /* =========================================================
     Connexion
     ========================================================= */
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    if (modal.open) modal.close();
    $('#login-form [name=password]').focus();
  }

  async function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    try {
      const c = await call('/admin/content');
      $('#brand-couple').textContent = c.couple;
    } catch { /* ignore */ }
    loadDefaultCenter();
    go(location.hash.slice(1) || 'dashboard');
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-form .form-error');
    err.textContent = '';
    try {
      await api('/admin/login', { method: 'POST', body: { password: e.target.elements.password.value } });
      e.target.reset();
      showApp();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  $('#logout').addEventListener('click', async () => {
    await api('/admin/logout', { method: 'POST', body: {} }).catch(() => {});
    showLogin();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      await api('/admin/me');
      showApp();
    } catch {
      showLogin();
    }
  });
})();
