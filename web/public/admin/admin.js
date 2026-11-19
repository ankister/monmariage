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
    const [s, c, um] = await Promise.all([call('/admin/stats'), call('/admin/content'), call('/admin/umami')]);
    const g = s.guests;
    const answered = g.yes + g.no;
    const pct = g.households ? Math.round((answered / g.households) * 100) : 0;
    const people = g.adults + g.children;
    const roomPct = s.onsite.rooms ? Math.round((s.onsite.taken / s.onsite.rooms) * 100) : 0;
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
        ${um.dashboard_url ? `<a class="btn btn-ghost btn-small" href="${esc(um.dashboard_url)}" target="_blank" rel="noopener">📈 Statistiques de visite</a>` : ''}
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
          <h2>Chambres sur place</h2>
          <div class="progress" role="progressbar" aria-valuenow="${roomPct}" aria-valuemin="0" aria-valuemax="100"><span data-w="${roomPct}"></span></div>
          <p class="muted small">${s.onsite.taken} chambre(s) réservée(s) sur ${s.onsite.rooms} · ${s.onsite.persons} personne(s) logée(s)</p>
          ${s.onsite.pending ? `<p><button class="btn btn-small btn-primary" data-goto="rooms">${plural(s.onsite.pending, 'demande', 'demandes')} à valider →</button></p>` : '<p class="muted small">Aucune demande en attente.</p>'}
        </section>

        <section class="panel">
          <h2>Repas</h2>
          <p class="meal-count"><span>🍽️ <strong>${people - g.veggie}</strong> menus classiques</span><span>🥗 <strong>${g.veggie}</strong> menus végétariens</span></p>
          <h3 class="panel-sub">Allergies et intolérances</h3>
          ${s.diets.length ? `<ul class="plain-list">${s.diets.map((d) => `<li><strong>${esc(d.name)}</strong> — ${esc(d.diet)}</li>`).join('')}</ul>`
            : '<p class="muted small">Aucune allergie signalée pour l’instant.</p>'}
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
    { name: 'veggie', label: 'Dont menus végétariens', type: 'number', min: 0, max: 100, default: 0 },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'phone', label: 'Téléphone', type: 'tel' },
    { name: 'diet', label: 'Allergies et intolérances', full: true },
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
            ${g.status === 'yes' && g.veggie ? ` · 🥗 ${g.veggie} végé` : ''}${g.diet ? ` · ⚠️ ${esc(g.diet)}` : ''}${g.email ? ` · ${esc(g.email)}` : ''}${g.phone ? ` · ${esc(g.phone)}` : ''}</small>
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
    { name: 'url', label: 'Lien (bouton « Lien » sur le site)', type: 'url', placeholder: 'https://… (page de réservation, site web, annonce…)', full: true },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
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
      deleteConfirm: 'L’hébergement sera retiré du site définitivement.',
    });
  }

  async function lodging() {
    const gites = await call('/admin/gites');
    view.innerHTML = `
      <div class="page-head row">
        <h1>Gîtes alentours</h1>
        <div class="actions"><button class="btn btn-primary btn-small" id="add-gite">+ Hébergement</button></div>
      </div>
      <p class="muted small">Hébergements proposés aux invités autour du lieu. Sur le site, le bouton « Lien » ouvre l’adresse que vous indiquez
        (page de réservation, site du gîte, annonce…).</p>
      <div class="list">
        ${gites.map((g) => `<button class="row-card" data-edit-gite="${g.id}">
          <span class="row-icon" aria-hidden="true">🏡</span>
          <span class="row-main"><strong>${esc(g.name)}</strong>
            <small>${esc(g.address || 'Adresse non renseignée')}${hasCoords(g) ? '' : ' · ⚠️ pas de position sur la carte'}</small>
            <small>${g.url ? `🔗 ${esc(g.url)}` : '⚠️ Aucun lien : le bouton « Lien » n’apparaît pas'}</small></span>
          <span class="row-chevron" aria-hidden="true">›</span></button>`).join('') || '<p class="empty">Aucun hébergement. Ajoutez-en un avec le bouton ci-dessus.</p>'}
      </div>`;
    $('#add-gite').addEventListener('click', () => editGite(null));
    $$('[data-edit-gite]').forEach((b) => b.addEventListener('click', () => editGite(gites.find((g) => g.id === +b.dataset.editGite))));
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
    const [c, um] = await Promise.all([call('/admin/content'), call('/admin/umami')]);
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

        <section class="panel" id="logo-panel">
          <h2>Logo</h2>
          <p class="muted small">Affiché en haut du site, au-dessus de « Nous nous marions ».</p>
          <div class="seg-radio" role="radiogroup" aria-label="Type de logo">
            <label><input type="radio" name="logo_mode" value="ornament" ${c.logo.mode === 'ornament' ? 'checked' : ''}><span>Trait décoratif</span></label>
            <label><input type="radio" name="logo_mode" value="image" ${c.logo.mode === 'image' ? 'checked' : ''}><span>Image PNG</span></label>
            <label><input type="radio" name="logo_mode" value="html" ${c.logo.mode === 'html' ? 'checked' : ''}><span>Code HTML/CSS</span></label>
          </div>
          <div class="logo-opt" data-for="image">
            <div class="logo-preview" id="logo-image-preview"></div>
            <div class="actions">
              <label class="btn btn-primary btn-small">Envoyer une image<input type="file" id="logo-file" accept="image/png,image/jpeg,image/webp" hidden></label>
              <button type="button" class="btn btn-ghost btn-small" id="logo-remove">Retirer l’image</button>
            </div>
            <p class="muted small">PNG à fond transparent conseillé. L’image est envoyée telle quelle (4 Mo maximum).</p>
            <label class="field">Hauteur d’affichage : <output id="logo-height-out">${esc(c.logo.height)}</output> px
              <input type="range" name="logo_height" min="40" max="300" step="5" value="${esc(c.logo.height)}"></label>
          </div>
          <div class="logo-opt" data-for="html">
            <label class="field">Code HTML et CSS du logo
              <textarea name="logo_html" rows="8" class="code" spellcheck="false" placeholder="&lt;style&gt;.monogramme { font: 48px Georgia; color: #b5654a; }&lt;/style&gt;&#10;&lt;div class=&quot;monogramme&quot;&gt;P &amp;amp; A&lt;/div&gt;">${esc(c.logo.html)}</textarea>
              <small class="help">Le CSS n’agit que sur le logo. Les scripts ne sont pas exécutés et seules les images du site sont autorisées.</small></label>
            <p class="small"><strong>Aperçu</strong></p>
            <div class="logo-preview" id="logo-html-preview"></div>
          </div>
        </section>

        <section class="panel">
          <h2>Formulaire de réponse</h2>
          <label class="switch"><input type="checkbox" name="rsvp_open" ${c.options.rsvp_open ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Les invités peuvent répondre (RSVP)</span></label>
          <label class="switch"><input type="checkbox" name="rsvp_guest_list_only" ${c.options.rsvp_guest_list_only ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Seuls les noms de la liste d’invités peuvent répondre</span></label>
          <p class="muted small">Le nom saisi est comparé à votre liste (onglet Invités) sans tenir compte des accents, des majuscules ni de l’ordre prénom/nom.</p>
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

        <section class="panel">
          <h2>Questions fréquentes (FAQ)</h2>
          <p class="muted small">Une question sans réponse n’apparaît pas sur le site : vous pouvez la préparer et la compléter plus tard.</p>
          <div id="faq-items"></div>
          <button type="button" class="btn btn-ghost btn-small" id="add-faq">+ Ajouter une question</button>
        </section>

        <section class="panel" id="games-panel">
          <h2>Jeux</h2>
          <label class="switch"><input type="checkbox" name="games_menu" ${c.options.games !== false ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Afficher le bouton « Jeux » dans le menu du site</span></label>
          <p class="muted small">Tableaux d’honneur partagés entre tous les invités. Les suppressions sont immédiates. <a href="/jeux/" target="_blank" rel="noopener">Ouvrir la page des jeux</a></p>
          <div id="game-scores"></div>
        </section>

        <section class="panel" id="umami-panel">
        <h2>Statistiques de visite (Umami)</h2>
        <p class="muted small">Renseignez votre instance <strong>Umami</strong> pour suivre les visites du site et de la page « Dormir sur place »
          (l’administration n’est jamais suivie). Le suivi passe par le serveur du site : rien à modifier ailleurs.</p>
        <label class="field">Adresse du script de suivi
          <input name="umami_script_url" type="url" value="${esc(um.script_url)}" placeholder="https://stats.exemple.fr/script.js">
          <small class="help">Dans Umami : Paramètres → Sites web → Modifier → Code de suivi, valeur de <code>src</code>.</small></label>
        <label class="field">Identifiant du site (Website ID)
          <input name="umami_website_id" value="${esc(um.website_id)}" placeholder="1a2b3c4d-1234-5678-9abc-1234567890ab" autocomplete="off" spellcheck="false">
          <small class="help">Valeur de <code>data-website-id</code> dans le même code.</small></label>
        <label class="field">Lien vers le tableau de bord Umami <span class="help">(facultatif, bouton sur l’Accueil)</span>
          <input name="umami_dashboard_url" type="url" value="${esc(um.dashboard_url)}" placeholder="https://stats.exemple.fr/websites/…"></label>
        <div class="actions">
          <button class="btn btn-ghost" type="button" id="umami-test">Enregistrer et tester la connexion</button>
        </div>
        <p class="small umami-status" id="umami-status">${um.script_url && um.website_id ? '✅ Suivi actif' : 'Suivi désactivé (laissez vide pour ne pas suivre).'}</p>
        </section>
        <div class="savebar"><span class="muted small" id="dirty"></span><button class="btn btn-primary" type="submit">Enregistrer</button></div>
      </form>`;



    const form = $('#content-form');
    setupLogoEditor(form, c);
    setupUmami(form);
    loadGameScores();
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

    // Questions fréquentes
    const faqBlock = (f) => `<div class="course faq-edit">
      <div class="course-head"><input class="faq-q" placeholder="Question, ex. Puis-je venir avec des enfants ?" value="${esc(f.q)}" aria-label="Question">
        <button type="button" class="icon-btn" data-up aria-label="Monter">↑</button>
        <button type="button" class="icon-btn" data-down aria-label="Descendre">↓</button>
        <button type="button" class="icon-btn" data-remove aria-label="Supprimer la question">✕</button></div>
      <textarea class="faq-a" rows="3" placeholder="Réponse (la question reste masquée sur le site tant que la réponse est vide)" aria-label="Réponse">${esc(f.a)}</textarea>
      ${f.a ? '' : '<small class="help faq-hidden">Masquée sur le site : pas encore de réponse.</small>'}</div>`;
    const faqItems = $('#faq-items');
    faqItems.innerHTML = (c.faq || []).map(faqBlock).join('');
    faqItems.addEventListener('click', (e) => {
      const block = e.target.closest('.faq-edit');
      if (!block) return;
      if (e.target.closest('[data-remove]')) block.remove();
      if (e.target.closest('[data-up]') && block.previousElementSibling) block.previousElementSibling.before(block);
      if (e.target.closest('[data-down]') && block.nextElementSibling) block.nextElementSibling.after(block);
      markDirty();
    });
    faqItems.addEventListener('input', (e) => {
      const block = e.target.closest('.faq-edit');
      const hint = block && $('.faq-hidden', block);
      if (hint) hint.hidden = !!$('.faq-a', block).value.trim();
    });
    $('#add-faq').addEventListener('click', () => {
      faqItems.insertAdjacentHTML('beforeend', faqBlock({ q: '', a: '' }));
      $('.faq-edit:last-child .faq-q', faqItems).focus();
      markDirty();
    });

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
        nights: c.nights || [],
        options: { rsvp_open: form.elements.rsvp_open.checked, rsvp_guest_list_only: form.elements.rsvp_guest_list_only.checked, games: form.elements.games_menu.checked },
        onsite: { open: form.elements.onsite_open.checked, venue: v('onsite_venue'), intro: v('onsite_intro'), note: v('onsite_note') },
        theme: {
          title: v('theme_title'), description: v('theme_description'), dress_code: v('theme_dress_code'),
          colors: $$('.color-row .hex', form).map((i) => i.value.trim()).filter((x) => /^#[0-9a-f]{6}$/i.test(x)),
        },
        menu_intro: v('menu_intro'), menu_note: v('menu_note'),
        faq: $$('.faq-edit', form).map((b) => ({ q: $('.faq-q', b).value.trim(), a: $('.faq-a', b).value.trim() })),
        logo: { mode: form.querySelector('[name=logo_mode]:checked')?.value || 'ornament', height: v('logo_height'), html: v('logo_html') },
        menu: $$('#courses .course', form).map((b) => ({
          title: $('.course-title', b).value.trim(),
          items: $('.course-items', b).value.split('\n').map((s) => s.trim()).filter(Boolean),
        })),
      };
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await call('/admin/content', { method: 'PUT', body });
        await saveUmami(form);
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

  /* ---------- Éditeur de logo ---------- */
  function setupLogoEditor(form, c) {
    let image = c.logo.image;
    const imgPrev = $('#logo-image-preview');
    const htmlPrev = $('#logo-html-preview');
    const height = form.elements.logo_height;
    const showOpt = () => {
      const mode = form.querySelector('[name=logo_mode]:checked').value;
      $$('.logo-opt', form).forEach((o) => { o.hidden = o.dataset.for !== mode; });
    };
    const drawImage = () => {
      imgPrev.innerHTML = image ? `<img src="/api/media/site/${esc(image)}" alt="Logo actuel">` : '<span class="muted small">Aucune image envoyée.</span>';
      const img = $('img', imgPrev);
      if (img) img.style.height = `${height.value}px`;
      $('#logo-remove').hidden = !image;
    };
    const drawHtml = () => {
      const box = document.createElement('div');
      box.attachShadow({ mode: 'open' }).innerHTML = form.elements.logo_html.value || '<span style="color:#888;font:14px sans-serif">Aperçu du code</span>';
      htmlPrev.replaceChildren(box);
    };
    form.querySelectorAll('[name=logo_mode]').forEach((r) => r.addEventListener('change', showOpt));
    height.addEventListener('input', () => { $('#logo-height-out').textContent = height.value; drawImage(); });
    form.elements.logo_html.addEventListener('input', drawHtml);

    $('#logo-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const res = await fetch('/api/admin/logo', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type || 'image/png' }, body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        image = data.url.split('/').pop();
        form.querySelector('[name=logo_mode][value=image]').checked = true;
        showOpt();
        drawImage();
        toast('Logo envoyé et affiché sur le site');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    $('#logo-remove').addEventListener('click', async () => {
      if (!(await confirmBox('Retirer le logo ?', 'Le trait décoratif sera de nouveau affiché.'))) return;
      try {
        await call('/admin/logo', { method: 'DELETE' });
        image = '';
        form.querySelector('[name=logo_mode][value=ornament]').checked = true;
        showOpt();
        drawImage();
        toast('Logo retiré');
      } catch (err) { toast(err.message, 'error'); }
    });
    showOpt();
    drawImage();
    drawHtml();
  }

  /* ---------- Statistiques Umami ---------- */
  /* ---------- Tableaux d'honneur des jeux ---------- */
  const GAME_NAMES = { retard: 'Antoine est en retard', cavale: 'Antoine en cavale' };
  async function loadGameScores() {
    const box = $('#game-scores');
    if (!box) return;
    let data;
    try { data = await call('/admin/games/scores'); } catch (err) { box.textContent = err.message; return; }
    box.innerHTML = Object.entries(GAME_NAMES).map(([g, title]) => `
      <div class="game-board">
        <div class="pm-head"><h3>${esc(title)}</h3>
          ${data[g].length ? `<button type="button" class="btn btn-ghost btn-small" data-reset="${g}">Tout effacer</button>` : ''}</div>
        ${data[g].length ? `<ol class="game-scores">${data[g].map((s) => `<li>
            <span><strong>${esc(s.name)}</strong> · ${s.score.toLocaleString('fr-FR')} pts
            <small>${g === 'retard' ? (s.won ? 'à l’heure' : 'en retard') : `niveau ${s.level}`} · ${fmtDateTime(s.created_at)}</small></span>
            <button type="button" class="icon-btn danger" data-del-score="${s.id}" aria-label="Supprimer le score de ${esc(s.name)}">🗑</button></li>`).join('')}</ol>`
          : '<p class="muted small">Aucun score pour l’instant.</p>'}
      </div>`).join('');
    $$('[data-del-score]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Supprimer ce score ?', 'Il disparaîtra du tableau d’honneur.'))) return;
      try { await call(`/admin/games/scores/${b.dataset.delScore}`, { method: 'DELETE' }); toast('Score supprimé'); loadGameScores(); }
      catch (err) { toast(err.message, 'error'); }
    }));
    $$('[data-reset]', box).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox(`Effacer tous les scores de « ${GAME_NAMES[b.dataset.reset]} » ?`, 'Pratique pour repartir de zéro après vos essais.'))) return;
      try { await call(`/admin/games/${b.dataset.reset}/scores`, { method: 'DELETE' }); toast('Tableau d’honneur remis à zéro'); loadGameScores(); }
      catch (err) { toast(err.message, 'error'); }
    }));
  }

  /* Réglages Umami : enregistrés avec le reste du contenu, ou via le bouton de test */
  const umamiBody = (form) => ({
    script_url: form.elements.umami_script_url.value.trim(),
    website_id: form.elements.umami_website_id.value.trim(),
    dashboard_url: form.elements.umami_dashboard_url.value.trim(),
  });
  async function saveUmami(form) {
    const r = await call('/admin/umami', { method: 'PUT', body: umamiBody(form) });
    $('#umami-status').textContent = r.enabled ? '✅ Suivi actif' : 'Suivi désactivé (laissez vide pour ne pas suivre).';
    return r;
  }
  function setupUmami(form) {
    const status = $('#umami-status');
    $('#umami-test').addEventListener('click', async () => {
      status.textContent = 'Test en cours…';
      try {
        await saveUmami(form);
        const r = await call('/admin/umami/test', { method: 'POST', body: {} });
        status.textContent = r.message;
      } catch (err) { status.textContent = '❌ ' + err.message; }
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
