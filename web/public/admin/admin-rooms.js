/**
 * Administration — onglet « Chambres » (dormir sur place) :
 * réservations, prix, fiches des chambres et photos.
 * Chargé après admin.js, qui lui fournit ses utilitaires via window.MMAdmin.
 */
'use strict';

(() => {
  const { esc } = window.MM;
  const { render: renderPlan, bind: bindPlan, euro } = window.MMPlan;
  const A = window.MMAdmin; // { $, $$, call, toast, openModal, confirmBox, fieldHtml, readForm, fmtDateTime, plural, refresh, view }
  const { $, $$ } = A;

  const STATUS = {
    pending: { label: 'En attente', cls: 'pill-wait' },
    confirmed: { label: 'Confirmée', cls: 'pill-ok' },
    cancelled: { label: 'Annulée', cls: 'pill-no' },
  };
  let tab = 'bookings';      // bookings | rooms | plan
  let statusFilter = 'all';
  let planFloor = 'rdc';

  const priceOf = (b) => (b.nights === 'sat' ? b.price_sat : b.price_both);
  const fullName = (b) => `${b.first_name} ${b.last_name}`.trim();
  const priceInput = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

  /* =========================================================
     Vue principale
     ========================================================= */
  async function roomsView() {
    const [{ rooms, nights }, bookings] = await Promise.all([A.call('/admin/rooms'), A.call('/admin/room-bookings')]);
    const active = bookings.filter((b) => b.status !== 'cancelled');
    const offered = rooms.filter((r) => r.bookable);
    const taken = offered.filter((r) => r.booking).length;
    const pending = bookings.filter((b) => b.status === 'pending').length;
    const persons = active.reduce((s, b) => s + b.persons, 0);
    const amount = active.reduce((s, b) => s + (priceOf(b) || 0), 0);
    const missingPrices = offered.filter((r) => r.price_both === null || r.price_sat === null).length;

    A.view.innerHTML = `
      <div class="page-head row">
        <h1>Chambres sur place</h1>
        <div class="actions">
          <button class="btn btn-primary btn-small" id="add-room-booking">+ Réservation</button>
          <a class="btn btn-ghost btn-small" href="/api/admin/room-bookings.csv" download>Exporter (Excel)</a>
          <a class="btn btn-ghost btn-small" href="/dormir-sur-place/" target="_blank" rel="noopener">Voir la page</a>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><span class="stat-num">${taken}<small>/${offered.length}</small></span><span class="stat-label">chambres réservées</span></div>
        <div class="stat stat-ok"><span class="stat-num">${persons}</span><span class="stat-label">personnes logées</span></div>
        <div class="stat stat-wait"><span class="stat-num">${pending}</span><span class="stat-label">à valider</span></div>
        <div class="stat"><span class="stat-num stat-money">${esc(euro(amount, '0 €'))}</span><span class="stat-label">montant attendu</span></div>
      </div>
      ${missingPrices ? `<p class="notice">💶 ${A.plural(missingPrices, 'chambre n’a', 'chambres n’ont')} pas encore tous ses prix. Renseignez-les dans « Chambres &amp; prix ».</p>` : ''}

      <div class="segmented" role="tablist">
        <button role="tab" data-tab="bookings" aria-selected="${tab === 'bookings'}">Réservations <span>${bookings.length}</span></button>
        <button role="tab" data-tab="rooms" aria-selected="${tab === 'rooms'}">Chambres &amp; prix</button>
        <button role="tab" data-tab="plan" aria-selected="${tab === 'plan'}">Plan</button>
      </div>
      <div id="rooms-pane"></div>`;

    $$('.segmented [data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; roomsView(); }));
    $('#add-room-booking').addEventListener('click', () => editBooking(null, rooms, nights));

    const pane = $('#rooms-pane');
    if (tab === 'bookings') renderBookings(pane, bookings, rooms, nights);
    else if (tab === 'rooms') renderRooms(pane, rooms);
    else renderPlanPane(pane, rooms);
  }

  /* ---------- Réservations ---------- */
  function renderBookings(pane, bookings, rooms, nights) {
    const counts = { all: bookings.length, pending: 0, confirmed: 0, cancelled: 0 };
    bookings.forEach((b) => counts[b.status]++);
    pane.innerHTML = `
      <div class="chips" role="group" aria-label="Filtrer par statut">
        ${[['all', 'Toutes'], ['pending', 'En attente'], ['confirmed', 'Confirmées'], ['cancelled', 'Annulées']]
          .map(([k, l]) => `<button class="chip" data-st="${k}" aria-pressed="${statusFilter === k}">${l} <span>${counts[k]}</span></button>`).join('')}
      </div>
      <ul class="bookings room-bookings" id="rb-list"></ul>`;
    const draw = () => {
      const list = bookings.filter((b) => statusFilter === 'all' || b.status === statusFilter);
      $('#rb-list').innerHTML = list.map((b) => `
        <li class="booking ${b.status}">
          <div class="booking-main">
            <strong>${esc(b.room_name)}</strong> — ${esc(fullName(b))} · ${b.persons} pers.
            <span class="pill ${STATUS[b.status].cls}">${STATUS[b.status].label}</span>
            <small>🌙 ${esc(nights[b.nights])} · ${esc(euro(priceOf(b), 'prix non défini'))}
              ${[b.email, b.phone].filter(Boolean).map((x) => ' · ' + esc(x)).join('')}</small>
            ${b.message ? `<small class="quote">« ${esc(b.message)} »</small>` : ''}
            ${b.notes ? `<small>📝 ${esc(b.notes)}</small>` : ''}
          </div>
          <div class="booking-actions">
            ${b.status !== 'confirmed' ? `<button class="btn btn-small btn-primary" data-set="confirmed" data-id="${b.id}">Valider</button>` : ''}
            ${b.status !== 'cancelled' ? `<button class="btn btn-small btn-ghost" data-set="cancelled" data-id="${b.id}">Annuler</button>` : ''}
            <button class="btn btn-small btn-ghost" data-edit="${b.id}" aria-label="Modifier la réservation de ${esc(fullName(b))}">✏️</button>
          </div>
        </li>`).join('') || '<li class="empty">Aucune réservation.</li>';
      $$('[data-set]', pane).forEach((btn) => btn.addEventListener('click', () => setStatus(+btn.dataset.id, btn.dataset.set)));
      $$('[data-edit]', pane).forEach((btn) => btn.addEventListener('click', () =>
        editBooking(bookings.find((x) => x.id === +btn.dataset.edit), rooms, nights)));
    };
    $$('.chip', pane).forEach((c) => c.addEventListener('click', () => {
      statusFilter = c.dataset.st;
      $$('.chip', pane).forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
      draw();
    }));
    draw();
  }

  async function setStatus(id, status) {
    try {
      await A.call(`/admin/room-bookings/${id}`, { method: 'PUT', body: { status } });
      A.toast(status === 'confirmed' ? 'Réservation confirmée' : 'Réservation annulée : la chambre est de nouveau libre');
      roomsView();
    } catch (err) {
      A.toast(err.message, 'error');
    }
  }

  function editBooking(b, rooms, nights) {
    const fields = [
      { name: 'room_id', label: 'Chambre', type: 'select', full: true, options: rooms.map((r) => ({
        value: r.id,
        label: `${r.name} — ${r.capacity} pers.${r.booking && (!b || r.booking.id !== b.id) ? ' (réservée)' : ''}`,
      })) },
      { name: 'first_name', label: 'Prénom', required: true },
      { name: 'last_name', label: 'Nom', required: true },
      { name: 'persons', label: 'Personnes', type: 'number', min: 1, max: 20, default: 2 },
      { name: 'nights', label: 'Nuits', type: 'select', options: [{ value: 'both', label: nights.both }, { value: 'sat', label: nights.sat }] },
      { name: 'email', label: 'E-mail', type: 'email' },
      { name: 'phone', label: 'Téléphone', type: 'tel' },
      { name: 'status', label: 'Statut', type: 'select', options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })), default: 'confirmed' },
      { name: 'message', label: 'Message de l’invité', type: 'textarea', full: true },
      { name: 'notes', label: 'Notes internes (paiement, arrivée…)', type: 'textarea', full: true },
    ];
    A.openModal({
      title: b ? 'Modifier la réservation' : 'Ajouter une réservation',
      html: `<div class="grid-2">${fields.map((f) => A.fieldHtml(f, b?.[f.name])).join('')}</div>
             ${b ? `<p class="muted small">Demande reçue le ${A.fmtDateTime(b.created_at)}</p>` : ''}`,
      onSubmit: async (root) => {
        const data = A.readForm(root, fields);
        if (b) await A.call(`/admin/room-bookings/${b.id}`, { method: 'PUT', body: data });
        else await A.call('/admin/room-bookings', { method: 'POST', body: data });
        A.toast('Réservation enregistrée');
        roomsView();
      },
      onDelete: b ? async () => { await A.call(`/admin/room-bookings/${b.id}`, { method: 'DELETE' }); A.toast('Réservation supprimée'); roomsView(); } : null,
    });
  }

  /* ---------- Chambres & prix (édition rapide des prix) ---------- */
  function renderRooms(pane, rooms) {
    const block = (floor, title) => `
      <h2 class="floor-title">${title}</h2>
      <div class="room-rows">${rooms.filter((r) => r.floor === floor).map((r) => `
        <div class="room-row ${r.bookable ? '' : 'is-off'}">
          <button class="rr-main" data-room="${r.id}" aria-label="Modifier ${esc(r.name)} et ses photos">
            <span class="rr-thumb">${r.photos[0] ? `<img src="${esc(r.photos[0].url)}" alt="" loading="lazy">` : '<span aria-hidden="true">📷</span>'}</span>
            <span class="row-main"><strong>${esc(r.name)}</strong>
              <small>${r.capacity} pers. · ${esc(r.beds)} · ${r.photos.length} photo${r.photos.length > 1 ? 's' : ''}</small>
              <small>${!r.bookable ? '⛔ Non proposée' : r.booking
                ? `<span class="pill ${STATUS[r.booking.status].cls}">${esc(fullName(r.booking))}</span>` : '<span class="pill pill-ok">Libre</span>'}</small>
            </span>
          </button>
          <div class="rr-prices">
            <label>2 nuits<span class="euro"><input inputmode="decimal" data-price="price_both" data-id="${r.id}" value="${esc(priceInput(r.price_both))}" placeholder="—" aria-label="Prix 2 nuits ${esc(r.name)}"></span></label>
            <label>Samedi<span class="euro"><input inputmode="decimal" data-price="price_sat" data-id="${r.id}" value="${esc(priceInput(r.price_sat))}" placeholder="—" aria-label="Prix samedi seul ${esc(r.name)}"></span></label>
          </div>
        </div>`).join('')}</div>`;
    pane.innerHTML = `
      <p class="muted small">Prix de la chambre entière, en euros. Ils s'enregistrent automatiquement quand vous quittez le champ.
        Touchez une chambre pour modifier sa fiche et ses photos.</p>
      ${block('rdc', 'Rez-de-chaussée')}${block('etage', 'Étage')}`;

    $$('[data-room]', pane).forEach((b) => b.addEventListener('click', () => editRoom(rooms.find((r) => r.id === +b.dataset.room))));
    $$('[data-price]', pane).forEach((input) => {
      input.dataset.saved = input.value;
      input.addEventListener('change', async () => {
        const v = input.value.trim().replace(',', '.');
        try {
          await A.call(`/admin/rooms/${input.dataset.id}`, { method: 'PUT', body: { [input.dataset.price]: v } });
          // Garde les données locales à jour : la fiche ouverte ensuite affichera ce prix
          const room = rooms.find((r) => r.id === +input.dataset.id);
          if (room) room[input.dataset.price] = v === '' ? null : Number(v);
          input.dataset.saved = input.value;
          input.classList.add('saved');
          setTimeout(() => input.classList.remove('saved'), 1200);
          A.toast('Prix enregistré');
        } catch (err) {
          A.toast(err.message, 'error');
          input.value = input.dataset.saved;
        }
      });
    });
  }

  /* ---------- Plan ---------- */
  function renderPlanPane(pane, rooms) {
    pane.innerHTML = `
      <div class="segmented small-seg">
        <button data-floor="rdc" aria-selected="${planFloor === 'rdc'}">Rez-de-chaussée</button>
        <button data-floor="etage" aria-selected="${planFloor === 'etage'}">Étage</button>
      </div>
      <div class="panel plan-panel"><div class="plan-scroll"><div id="admin-plan"></div></div>
        <ul class="legend"><li><span class="lg lg-free"></span>Libre</li><li><span class="lg lg-taken"></span>Réservée</li></ul>
        <p class="muted small">Touchez une chambre pour modifier sa fiche, ses prix et ses photos.</p></div>`;
    const draw = () => {
      $('#admin-plan').innerHTML = renderPlan(planFloor, rooms, {
        statusOf: (r) => (!r.bookable ? 'off' : r.booking ? 'taken' : 'free'),
        // Sur le plan d'administration, la pastille indique l'occupant
        badge: (r) => (!r.bookable ? 'Non proposée' : r.booking ? r.booking.last_name.slice(0, 12) || 'Réservée' : 'Libre'),
      });
    };
    $$('[data-floor]', pane).forEach((b) => b.addEventListener('click', () => {
      planFloor = b.dataset.floor;
      $$('[data-floor]', pane).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      draw();
    }));
    bindPlan($('#admin-plan'), (id) => editRoom(rooms.find((r) => r.id === id)));
    draw();
  }

  /* =========================================================
     Fiche chambre + photos
     ========================================================= */
  const roomFields = [
    { name: 'name', label: 'Nom', required: true },
    { name: 'short_name', label: 'Libellé sur le plan', help: 'Court : 10 caractères environ.' },
    { name: 'capacity', label: 'Capacité (couchages, bébé compris)', type: 'number', min: 1, max: 20 },
    { name: 'area', label: 'Surface' },
    { name: 'price_both', label: 'Prix 2 nuits (€)', placeholder: 'ex. 120' },
    { name: 'price_sat', label: 'Prix samedi seul (€)', placeholder: 'ex. 70' },
    { name: 'beds', label: 'Couchage', full: true },
    { name: 'bath', label: 'Sanitaires', full: true },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
    { name: 'private_bath', label: 'Salle d’eau privative', type: 'checkbox' },
    { name: 'baby_bed', label: 'Lit bébé', type: 'checkbox' },
    { name: 'bookable', label: 'Proposée à la réservation', type: 'checkbox', full: true },
  ];

  async function editRoom(stale) {
    let r = stale;
    try {
      const { rooms } = await A.call('/admin/rooms');
      r = rooms.find((x) => x.id === stale.id) || stale;
    } catch { /* on garde la version affichée */ }
    const values = { ...r, price_both: priceInput(r.price_both), price_sat: priceInput(r.price_sat) };
    A.openModal({
      title: r.name,
      html: `
        <section class="photo-manager" aria-label="Photos">
          <div class="pm-head"><h3>Photos</h3>
            <label class="btn btn-primary btn-small pm-add">+ Ajouter des photos
              <input type="file" accept="image/jpeg,image/png,image/webp,image/*" multiple id="pm-input" hidden></label></div>
          <p class="muted small">La première photo sert de couverture. Les photos sont réduites automatiquement avant l'envoi.</p>
          <p class="pm-progress" id="pm-progress" aria-live="polite"></p>
          <div class="pm-grid" id="pm-grid"></div>
        </section>
        ${r.booking ? `<p class="notice">Réservée par ${esc(fullName(r.booking))} (${STATUS[r.booking.status].label.toLowerCase()}).</p>` : ''}
        <div class="grid-2">${roomFields.map((f) => A.fieldHtml(f, values[f.name])).join('')}</div>`,
      onSubmit: async (root) => {
        await A.call(`/admin/rooms/${r.id}`, { method: 'PUT', body: A.readForm(root, roomFields) });
        A.toast('Chambre enregistrée');
        roomsView();
      },
      afterOpen: (root) => setupPhotos(root, r),
      onClose: () => roomsView(), // les photos sont enregistrées immédiatement
    });
  }

  function setupPhotos(root, room) {
    const grid = $('#pm-grid', root);
    const progress = $('#pm-progress', root);
    let photos = room.photos.slice();

    const draw = () => {
      grid.innerHTML = photos.map((p, i) => `
        <figure class="pm-item">
          <img src="${esc(p.url)}" alt="Photo ${i + 1}" loading="lazy">
          ${i === 0 ? '<span class="pm-cover">Couverture</span>' : ''}
          <figcaption>
            <button type="button" class="icon-btn" data-move="-1" data-id="${p.id}" ${i === 0 ? 'disabled' : ''} aria-label="Déplacer avant">←</button>
            <button type="button" class="icon-btn" data-move="1" data-id="${p.id}" ${i === photos.length - 1 ? 'disabled' : ''} aria-label="Déplacer après">→</button>
            <button type="button" class="icon-btn danger" data-del="${p.id}" aria-label="Supprimer la photo">🗑</button>
          </figcaption>
        </figure>`).join('') || '<p class="empty small">Aucune photo pour l’instant.</p>';
    };
    const reload = async () => {
      const { rooms } = await A.call('/admin/rooms');
      photos = rooms.find((x) => x.id === room.id)?.photos || [];
      draw();
    };

    grid.addEventListener('click', async (e) => {
      const mv = e.target.closest('[data-move]');
      const del = e.target.closest('[data-del]');
      try {
        if (mv) {
          await A.call(`/admin/photos/${mv.dataset.id}/move`, { method: 'PUT', body: { dir: +mv.dataset.move } });
          await reload();
        } else if (del) {
          if (!(await A.confirmBox('Supprimer cette photo ?', 'Elle sera retirée de la fiche de la chambre.'))) return;
          await A.call(`/admin/photos/${del.dataset.del}`, { method: 'DELETE' });
          await reload();
          A.toast('Photo supprimée');
        }
      } catch (err) {
        A.toast(err.message, 'error');
      }
    });

    $('#pm-input', root).addEventListener('change', async (e) => {
      const files = [...e.target.files];
      e.target.value = '';
      let ok = 0;
      for (const [i, file] of files.entries()) {
        progress.textContent = `Envoi de la photo ${i + 1} sur ${files.length}…`;
        try {
          const blob = await shrink(file);
          const res = await fetch(`/api/admin/rooms/${room.id}/photos`, {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type }, body: blob,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
          ok++;
        } catch (err) {
          A.toast(`${file.name} : ${err.message}`, 'error');
        }
      }
      progress.textContent = ok ? `${A.plural(ok, 'photo ajoutée', 'photos ajoutées')}.` : '';
      await reload();
    });

    draw();
  }

  /**
   * Réduit une photo (1600 px max, JPEG 85 %) avant l'envoi : une photo de téléphone de 5 Mo passe à ~300 Ko.
   * L'orientation EXIF est appliquée (photos prises en portrait).
   */
  async function shrink(file) {
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      throw new Error('format non pris en charge par ce navigateur (utilisez JPEG ou PNG).');
    }
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('impossible de convertir la photo.');
    return blob;
  }

  A.registerView('rooms', roomsView);
})();
