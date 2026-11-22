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
    waitlist: { label: 'Liste d’attente', cls: 'pill-waitlist' },
    pending: { label: 'En attente', cls: 'pill-wait' },
    payment: { label: 'Règlement en cours', cls: 'pill-pay' },
    confirmed: { label: 'Confirmée', cls: 'pill-ok' },
    cancelled: { label: 'Annulée', cls: 'pill-no' },
  };
  let tab = 'bookings';      // bookings | rooms | plan
  let statusFilter = 'all';
  let planFloor = 'rdc';

  let stayInfo = { short: '2 nuits', label: '', dates: '' }; // formule unique, fournie par l'API
  const priceOf = (b) => b.amount ?? null; // calculé par l'API (prix du lit × lits pour un dortoir)
  const unitOf = (b) => (b.nights === 'sat' ? b.price_sat : b.price_both);
  const bedsLabel = (n) => `${n} lit${n > 1 ? 's' : ''}`;
  const whoCount = (b) => (b.price_mode === 'bed' ? bedsLabel(b.persons) : `${b.persons} pers.`);
  /** Occupation affichée : nom de l'occupant (chambre entière) ou lits occupés (dortoir). */
  const occupancyPill = (r) => {
    if (r.per_bed) {
      const cls = r.full ? 'pill-no' : r.beds_taken ? 'pill-wait' : 'pill-ok';
      return `<span class="pill ${cls}">${r.beds_taken}/${r.capacity} lits pris</span>`;
    }
    return r.booking ? `<span class="pill ${STATUS[r.booking.status].cls}">${esc(fullName(r.booking))}</span>` : '<span class="pill pill-ok">Libre</span>';
  };
  const fullName = (b) => `${b.first_name} ${b.last_name}`.trim();
  const priceInput = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

  /* =========================================================
     Vue principale
     ========================================================= */
  async function roomsView() {
    const [{ rooms, nights, stay, priority }, bookings] = await Promise.all([A.call('/admin/rooms'), A.call('/admin/room-bookings')]);
    stayInfo = stay;
    const active = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'waitlist');
    const waiting = bookings.filter((b) => b.status === 'waitlist').length;
    const offered = rooms.filter((r) => r.bookable);
    const taken = offered.filter((r) => r.full).length;
    const pending = bookings.filter((b) => b.status === 'pending').length;
    const paying = bookings.filter((b) => b.status === 'payment').length;
    const persons = active.reduce((s, b) => s + b.persons, 0);
    const amount = active.reduce((s, b) => s + (priceOf(b) || 0), 0);
    const missingPrices = offered.filter((r) => r.price_both === null).length;

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
        <div class="stat stat-wait"><span class="stat-num">${pending}<small>${paying ? ` +${paying}` : ''}</small></span><span class="stat-label">à valider${paying ? ` · ${paying} règlement${paying > 1 ? 's' : ''} en cours` : ''}${waiting ? ` · ${waiting} en liste d’attente` : ''}</span></div>
        <div class="stat"><span class="stat-num stat-money">${esc(euro(amount, '0 €'))}</span><span class="stat-label">montant attendu</span></div>
      </div>
      <p class="stay-banner">🌙 Formule unique : <strong>${esc(stay.short)}</strong>${stay.dates ? ` · ${esc(stay.dates)}` : ''}
        <small>(réglable dans <a href="#content" data-goto-content>Contenu → Dormir sur place</a>)</small></p>
      ${priority.enabled ? `<p class="notice ${priority.active ? '' : 'notice-ok'}">${priority.active
        ? `⭐ <strong>Priorité famille &amp; témoins jusqu’au ${esc(priority.until_label)}</strong> : les autres invités sont inscrits en liste d’attente${waiting ? ` (${waiting} actuellement)` : ''}. Réservations ouvertes à tous à partir du ${esc(priority.open_label)}.`
        : `✅ Période de priorité terminée (${esc(priority.until_label)}) : réservations ouvertes à tous.${waiting ? ` ${A.plural(waiting, 'demande reste', 'demandes restent')} en liste d’attente : acceptez-les selon les disponibilités.` : ''}`}</p>` : ''}
      ${missingPrices ? `<p class="notice">💶 ${A.plural(missingPrices, 'chambre n’a', 'chambres n’ont')} pas encore de prix. Renseignez-les dans « Chambres &amp; prix ».</p>` : ''}

      <div class="segmented" role="tablist">
        <button role="tab" data-tab="bookings" aria-selected="${tab === 'bookings'}">Réservations <span>${bookings.length}</span></button>
        <button role="tab" data-tab="rooms" aria-selected="${tab === 'rooms'}">Chambres &amp; prix</button>
        <button role="tab" data-tab="plan" aria-selected="${tab === 'plan'}">Plan</button>
      </div>
      <div id="rooms-pane"></div>`;

    $$('.segmented [data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; roomsView(); }));
    $('[data-goto-content]')?.addEventListener('click', (e) => { e.preventDefault(); document.querySelector('.tabs [data-view=content]')?.click(); });
    $('#add-room-booking').addEventListener('click', () => editBooking(null, rooms, nights));

    const pane = $('#rooms-pane');
    if (tab === 'bookings') renderBookings(pane, bookings, rooms, nights);
    else if (tab === 'rooms') renderRooms(pane, rooms);
    else renderPlanPane(pane, rooms);
  }

  /* ---------- Réservations ---------- */
  function renderBookings(pane, bookings, rooms, nights) {
    const counts = { all: bookings.length, waitlist: 0, pending: 0, payment: 0, confirmed: 0, cancelled: 0 };
    bookings.forEach((b) => counts[b.status]++);
    pane.innerHTML = `
      <div class="chips" role="group" aria-label="Filtrer par statut">
        ${[['all', 'Toutes'], ['waitlist', 'Liste d’attente'], ['pending', 'En attente'], ['payment', 'Règlement en cours'], ['confirmed', 'Confirmées'], ['cancelled', 'Annulées']]
          .filter(([k]) => k !== 'waitlist' || counts.waitlist || statusFilter === 'waitlist')
          .map(([k, l]) => `<button class="chip" data-st="${k}" aria-pressed="${statusFilter === k}">${l} <span>${counts[k]}</span></button>`).join('')}
      </div>
      <ul class="bookings room-bookings" id="rb-list"></ul>
      <section class="panel mail-panel" id="mail-panel" aria-labelledby="mail-title"><p class="muted">Chargement des réglages d’e-mail…</p></section>`;
    renderMailPanel($('#mail-panel'));
    // Liste d'attente : rang de chaque demande pour sa chambre, par ordre d'arrivée
    const chrono = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id);
    const queues = new Map(); // room_id → demandes en attente, de la plus ancienne à la plus récente
    bookings.filter((b) => b.status === 'waitlist').sort(chrono).forEach((b) => {
      if (!queues.has(b.room_id)) queues.set(b.room_id, []);
      queues.get(b.room_id).push(b);
    });
    const rankOf = (b) => {
      const q = queues.get(b.room_id) || [];
      return { rank: q.indexOf(b) + 1, total: q.length };
    };
    const rankPill = (b) => {
      if (b.status !== 'waitlist') return '';
      const { rank, total } = rankOf(b);
      return total > 1 ? `<span class="pill pill-rank" title="Ordre d’arrivée des demandes pour cette chambre">${rank === 1 ? '1re' : `${rank}e`} demande sur ${total}</span>` : '';
    };
    const item = (b) => `
        <li class="booking ${b.status}">
          <div class="booking-main">
            <strong>${esc(b.room_name)}</strong> — ${esc(fullName(b))} · ${whoCount(b)}
            <span class="pill ${STATUS[b.status].cls}">${STATUS[b.status].label}</span>
            ${rankPill(b)}
            ${b.priority ? '<span class="pill pill-prio" title="Nom reconnu parmi la famille et les témoins (liste des invités)">⭐ Famille / témoin</span>' : ''}
            <small>🌙 ${esc(nights[b.nights])} · ${esc(euro(priceOf(b), 'prix non défini'))}${b.price_mode === 'bed' && unitOf(b) !== null ? ` (${b.persons} × ${esc(euro(unitOf(b)))})` : ''}
              ${[b.email, b.phone].filter(Boolean).map((x) => ' · ' + esc(x)).join('')}</small>
            ${b.message ? `<small class="quote">« ${esc(b.message)} »</small>` : ''}
            ${b.notes ? `<small>📝 ${esc(b.notes)}</small>` : ''}
            ${b.mail_sent_at ? `<small>📧 Mail de règlement envoyé le ${A.fmtDateTime(b.mail_sent_at)}</small>` : ''}
            ${b.status === 'waitlist' ? `<small>⏳ Demande reçue le ${A.fmtDateTime(b.created_at)} · chambre souhaitée, non bloquée${
              rooms.find((r) => r.id === b.room_id)?.full ? ' · <b class="warn-text">chambre déjà prise : changez-la (✏️) avant d’accepter</b>' : ''}</small>` : ''}
          </div>
          <div class="booking-actions">
            ${b.status === 'waitlist' ? `<button class="btn btn-small btn-primary" data-set="pending" data-id="${b.id}" title="Sort de la liste d’attente : la chambre est réservée (si elle est libre)">Accepter</button>` : ''}
            ${b.status === 'pending' ? `<button class="btn btn-small btn-pay" data-set="payment" data-id="${b.id}" title="Passe la réservation en « Règlement en cours » et envoie le mail à l’invité">Règlement en cours</button>` : ''}
            ${b.status === 'payment' ? `<button class="btn btn-small btn-ghost" data-mail="${b.id}" title="Renvoyer le mail de règlement">📧 Renvoyer</button>` : ''}
            ${b.status !== 'confirmed' && b.status !== 'waitlist' ? `<button class="btn btn-small btn-primary" data-set="confirmed" data-id="${b.id}">${b.status === 'payment' ? 'Payé · Valider' : 'Valider'}</button>` : ''}
            ${b.status !== 'cancelled' ? `<button class="btn btn-small btn-ghost" data-set="cancelled" data-id="${b.id}">Annuler</button>` : ''}
            <button class="btn btn-small btn-ghost" data-edit="${b.id}" aria-label="Modifier la réservation de ${esc(fullName(b))}">✏️</button>
          </div>
        </li>`;
    const draw = () => {
      const list = bookings.filter((b) => statusFilter === 'all' || b.status === statusFilter);
      if (statusFilter === 'waitlist') {
        // Regroupée par chambre souhaitée, dans l'ordre d'arrivée des demandes
        const roomOrder = new Map(rooms.map((r, i) => [r.id, i]));
        const groups = [...queues.entries()].sort((a, b) => (roomOrder.get(a[0]) ?? 0) - (roomOrder.get(b[0]) ?? 0));
        $('#rb-list').innerHTML = groups.map(([roomId, q]) => {
          const room = rooms.find((r) => r.id === roomId);
          return `<li class="wl-group"><h3>${esc(room?.name || q[0].room_name)}
              <small>${A.plural(q.length, 'demande', 'demandes')}${q.length > 1 ? ', par ordre d’arrivée' : ''}
              · ${room?.full ? '<b class="warn-text">chambre déjà prise</b>' : 'chambre libre'}</small></h3>
            <ol class="wl-queue">${q.map(item).join('')}</ol></li>`;
        }).join('') || '<li class="empty">Aucune demande en liste d’attente.</li>';
      } else {
        $('#rb-list').innerHTML = list.map(item).join('') || '<li class="empty">Aucune réservation.</li>';
      }
      $$('[data-set]', pane).forEach((btn) => btn.addEventListener('click', async () => {
        const b = bookings.find((x) => x.id === +btn.dataset.id);
        // Accepter une demande alors qu'une plus ancienne attend la même chambre : on demande confirmation
        if (btn.dataset.set === 'pending' && b?.status === 'waitlist') {
          const first = (queues.get(b.room_id) || [])[0];
          if (first && first !== b && !(await A.confirmBox('Une demande plus ancienne attend', `${fullName(first)} a demandé « ${b.room_name} » le ${A.fmtDateTime(first.created_at)}, avant ${fullName(b)}. Accepter quand même cette demande ?`, { ok: 'Accepter quand même' }))) return;
        }
        setStatus(+btn.dataset.id, btn.dataset.set);
      }));
      $$('[data-mail]', pane).forEach((btn) => btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const r = await A.call(`/admin/room-bookings/${btn.dataset.mail}/mail`, { method: 'POST', body: {} });
          A.toast(`Mail renvoyé à ${r.to}`);
          roomsView();
        } catch (err) {
          A.toast(err.message, 'error');
          btn.disabled = false;
        }
      }));
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

  /** Message selon le résultat de l'envoi automatique du mail de règlement. */
  function mailToast(r) {
    if (!r || !r.mail) return false;
    if (r.mail === 'sent') A.toast(`Règlement en cours : mail envoyé à ${r.to}`);
    else if (r.mail === 'no-email') A.toast('Règlement en cours enregistré, mais pas de mail : cette réservation n’a pas d’adresse e-mail.', 'error');
    else if (r.mail === 'not-configured') A.toast('Règlement en cours enregistré, mais le mail n’est pas parti : configurez le bloc « Mail » ci-dessous.', 'error');
    else A.toast(`Règlement en cours enregistré, mais le mail n’est pas parti : ${r.mail_error}`, 'error');
    return true;
  }

  async function setStatus(id, status) {
    try {
      const r = await A.call(`/admin/room-bookings/${id}`, { method: 'PUT', body: { status } });
      if (!mailToast(r)) {
        A.toast(status === 'confirmed' ? 'Réservation confirmée' : status === 'payment' ? 'Règlement en cours'
          : status === 'pending' ? 'Demande acceptée : la chambre est réservée'
          : 'Réservation annulée : la chambre est de nouveau libre');
      }
      roomsView();
    } catch (err) {
      A.toast(err.message, 'error');
    }
  }

  function editBooking(b, rooms, nights) {
    const fields = [
      { name: 'room_id', label: 'Chambre', type: 'select', full: true, options: rooms.map((r) => ({
        value: r.id,
        label: r.per_bed
          ? `${r.name} — dortoir, ${r.beds_free + (b && b.room_id === r.id && b.status !== 'cancelled' ? b.persons : 0)} lit(s) libre(s) sur ${r.capacity}`
          : `${r.name} — ${r.capacity} pers.${r.booking && (!b || r.booking.id !== b.id) ? ' (réservée)' : ''}`,
      })) },
      { name: 'first_name', label: 'Prénom', required: true },
      { name: 'last_name', label: 'Nom', required: true },
      { name: 'persons', label: 'Personnes (lits pour un dortoir)', type: 'number', min: 1, max: 20, default: 2 },
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
        const r = b ? await A.call(`/admin/room-bookings/${b.id}`, { method: 'PUT', body: data })
          : await A.call('/admin/room-bookings', { method: 'POST', body: data });
        if (!mailToast(r)) A.toast('Réservation enregistrée');
        roomsView();
      },
      onDelete: b ? async () => { await A.call(`/admin/room-bookings/${b.id}`, { method: 'DELETE' }); A.toast('Réservation supprimée'); roomsView(); } : null,
    });
  }

  /* ---------- Bloc « Mail » : serveur d'envoi et modèle du mail de règlement ---------- */
  const SMTP_PRESETS = {
    gmail: { label: 'Gmail', host: 'smtp.gmail.com', port: 465, security: 'ssl', help: 'Utilisez un « mot de passe d’application » Google (validation en 2 étapes requise), pas votre mot de passe habituel.' },
    ovh: { label: 'OVH (e-mail de domaine)', host: 'ssl0.ovh.net', port: 465, security: 'ssl', help: 'Identifiant : l’adresse e-mail complète.' },
    outlook: { label: 'Outlook / Hotmail', host: 'smtp-mail.outlook.com', port: 587, security: 'starttls', help: 'Microsoft peut bloquer l’envoi SMTP sur les comptes personnels : préférez Gmail ou votre hébergeur.' },
    orange: { label: 'Orange', host: 'smtp.orange.fr', port: 465, security: 'ssl', help: 'Identifiant : l’adresse e-mail Orange complète.' },
    free: { label: 'Free', host: 'smtp.free.fr', port: 465, security: 'ssl', help: 'Activez l’envoi SMTP authentifié dans l’espace abonné Free.' },
    icloud: { label: 'iCloud', host: 'smtp.mail.me.com', port: 587, security: 'starttls', help: 'Utilisez un mot de passe pour app créé sur appleid.apple.com.' },
  };
  const VARS = [
    ['prenom', 'Prénom de l’invité'], ['nom', 'Nom'], ['chambre', 'Chambre ou dortoir'], ['quantite', '« 2 personnes » ou « 3 lits »'],
    ['nuits', 'Nuits réservées'], ['montant', 'Montant à régler'], ['couple', 'Vos prénoms'], ['date_mariage', 'Date du mariage'],
  ];
  let SAMPLE = {}; // réservation fictive fournie par l'API (vos prénoms, la vraie date)
  const fillSample = (t, html) => String(t).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k) => {
    const v = SAMPLE[k.toLowerCase()];
    return v === undefined ? m : html ? esc(v) : v;
  });

  async function renderMailPanel(box) {
    let data;
    try { data = await A.call('/admin/mail-settings'); } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
    const { smtp, template, default_template: def } = data;
    SAMPLE = data.sample || {};
    box.innerHTML = `
      <h2 id="mail-title">✉️ Mail</h2>
      <p class="muted small">Quand une réservation passe en <b>« Règlement en cours »</b>, ce mail part automatiquement à l’adresse donnée par l’invité.
        Les réglages sont enregistrés ici, sans variable à ajouter au conteneur.</p>
      <div class="mail-grid">
        <form class="mail-smtp" id="smtp-form" autocomplete="off">
          <h3>Serveur d’envoi (SMTP)
            <span class="pill ${smtp.configured ? 'pill-ok' : 'pill-wait'}">${smtp.configured ? 'Configuré' : 'À configurer'}</span></h3>
          <label class="field">Préréglage
            <select name="preset"><option value="">— Choisir un fournisseur (facultatif) —</option>
              ${Object.entries(SMTP_PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join('')}</select>
            <small class="muted" id="preset-help"></small></label>
          <div class="grid-3">
            <label class="field span-2">Serveur<input name="host" value="${esc(smtp.host)}" placeholder="smtp.exemple.fr" spellcheck="false"></label>
            <label class="field">Port<input name="port" type="number" min="1" max="65535" value="${smtp.port || ''}" placeholder="465"></label>
          </div>
          <fieldset class="field"><legend>Sécurité</legend>
            <div class="seg-radio">
              ${[['ssl', 'SSL/TLS (465)'], ['starttls', 'STARTTLS (587)'], ['none', 'Aucune']].map(([v, l]) =>
                `<label><input type="radio" name="security" value="${v}" ${smtp.security === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
            </div></fieldset>
          <div class="grid-2">
            <label class="field">Identifiant<input name="user" value="${esc(smtp.user)}" autocomplete="off" spellcheck="false" placeholder="souvent l’adresse e-mail"></label>
            <label class="field">Mot de passe<input name="pass" type="password" autocomplete="new-password" placeholder="${smtp.has_pass ? '•••••••• (enregistré, laisser vide pour garder)' : ''}"></label>
          </div>
          <div class="grid-2">
            <label class="field">Adresse d’expédition<input name="from_email" type="email" value="${esc(smtp.from_email)}" placeholder="vous@exemple.fr"></label>
            <label class="field">Nom affiché<input name="from_name" value="${esc(smtp.from_name)}" placeholder="ex. Les mariés"></label>
          </div>
          <label class="field">Adresse de réponse <small class="muted">(facultatif : si différente de l’expédition)</small>
            <input name="reply_to" type="email" value="${esc(smtp.reply_to)}"></label>
          <div class="row-actions">
            <button class="btn btn-primary" type="submit">Enregistrer</button>
            ${smtp.has_pass ? '<button class="btn btn-ghost btn-small" type="button" id="smtp-clear">Effacer le mot de passe</button>' : ''}
          </div>
          <div class="mail-test">
            <label class="field">Envoyer un mail d’essai à<input name="test_to" type="email" placeholder="votre adresse" value="${esc(smtp.from_email)}"></label>
            <button class="btn btn-ghost" type="button" id="mail-test">📨 Envoyer l’essai</button>
          </div>
          <p class="form-status" id="smtp-status" role="status" aria-live="polite"></p>
        </form>

        <form class="mail-template" id="tpl-form">
          <h3>Mail « Règlement en cours »</h3>
          <label class="switch"><input type="checkbox" name="auto" ${template.auto ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span>
            <span>Envoyer automatiquement au passage en « Règlement en cours »</span></label>
          <label class="field">Objet<input name="subject" value="${esc(template.subject)}" maxlength="300"></label>
          <label class="field">Contenu (HTML)
            <textarea name="html" class="code tpl-html" rows="16" spellcheck="false">${esc(template.html)}</textarea></label>
          <details class="tpl-vars" open><summary>Variables (cliquer pour insérer)</summary>
            <div class="chips">${VARS.map(([k, l]) => `<button type="button" class="chip" data-var="${k}" title="${esc(l)}">{{${k}}}</button>`).join('')}</div>
            <p class="muted small">Remplacées pour chaque invité. Pensez à compléter vos <b>modalités de règlement</b> (IBAN, Lydia, chèque…).</p></details>
          <div class="row-actions">
            <button class="btn btn-primary" type="submit">Enregistrer le modèle</button>
            <button class="btn btn-ghost btn-small" type="button" id="tpl-reset">Rétablir le modèle d’origine</button>
          </div>
          <p class="tpl-preview-title"><strong>Aperçu</strong> <small class="muted">(exemple : Camille, Chambre 3, 80 €)</small></p>
          <p class="tpl-subject" id="tpl-subject"></p>
          <iframe class="tpl-preview" id="tpl-preview" sandbox title="Aperçu du mail"></iframe>
        </form>
      </div>`;

    const sf = $('#smtp-form', box), tf = $('#tpl-form', box);
    const status = $('#smtp-status', box);
    const say = (msg, err) => { status.textContent = msg; status.className = `form-status${err ? ' error' : ' ok'}`; };
    sf.elements.preset.addEventListener('change', () => {
      const p = SMTP_PRESETS[sf.elements.preset.value];
      $('#preset-help', box).textContent = p ? p.help : '';
      if (!p) return;
      sf.elements.host.value = p.host;
      sf.elements.port.value = p.port;
      sf.elements.security.value = p.security;
    });
    sf.addEventListener('change', (e) => {
      if (e.target.name !== 'security') return;
      const ports = { ssl: 465, starttls: 587, none: 25 };
      if (!sf.elements.port.value || Object.values(ports).includes(+sf.elements.port.value)) sf.elements.port.value = ports[e.target.value];
    });
    const smtpBody = () => {
      const f = sf.elements;
      return { host: f.host.value, port: f.port.value, security: f.security.value, user: f.user.value, pass: f.pass.value,
        from_email: f.from_email.value, from_name: f.from_name.value, reply_to: f.reply_to.value };
    };
    sf.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await A.call('/admin/mail-settings/smtp', { method: 'PUT', body: smtpBody() });
        A.toast('Réglages d’envoi enregistrés');
        renderMailPanel(box);
      } catch (err) { say(err.message, true); }
    });
    $('#smtp-clear', box)?.addEventListener('click', async () => {
      if (!(await A.confirmBox('Effacer le mot de passe SMTP ?', 'Les mails ne pourront plus partir tant qu’un nouveau mot de passe n’est pas enregistré.'))) return;
      await A.call('/admin/mail-settings/smtp', { method: 'PUT', body: { ...smtpBody(), pass: '', clear_pass: true } });
      A.toast('Mot de passe effacé');
      renderMailPanel(box);
    });
    $('#mail-test', box).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      say('Enregistrement des réglages puis envoi en cours…');
      try {
        await A.call('/admin/mail-settings/smtp', { method: 'PUT', body: smtpBody() });
        await A.call('/admin/mail-settings/template', { method: 'PUT', body: tplBody() });
        await A.call('/admin/mail-settings/test', { method: 'POST', body: { to: sf.elements.test_to.value } });
        say(`✓ Mail d’essai envoyé à ${sf.elements.test_to.value}. Vérifiez aussi le dossier « Indésirables ».`);
      } catch (err) { say(`✗ ${err.message}`, true); }
      btn.disabled = false;
    });

    /* Modèle */
    const preview = () => {
      $('#tpl-subject', box).textContent = `Objet : ${fillSample(tf.elements.subject.value, false)}`;
      $('#tpl-preview', box).srcdoc = `<!doctype html><meta charset="utf-8"><body style="margin:16px;background:#fff">${fillSample(tf.elements.html.value, true)}</body>`;
    };
    const tplBody = () => ({ subject: tf.elements.subject.value, html: tf.elements.html.value, auto: tf.elements.auto.checked });
    let t = 0;
    tf.addEventListener('input', () => { clearTimeout(t); t = setTimeout(preview, 250); });
    tf.addEventListener('click', (e) => {
      const v = e.target.closest('[data-var]');
      if (!v) return;
      const ta = tf.elements.html, tag = `{{${v.dataset.var}}}`;
      const [a, b] = [ta.selectionStart ?? ta.value.length, ta.selectionEnd ?? ta.value.length];
      ta.setRangeText(tag, a, b, 'end');
      ta.focus();
      preview();
    });
    tf.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await A.call('/admin/mail-settings/template', { method: 'PUT', body: tplBody() });
        A.toast('Modèle de mail enregistré');
      } catch (err) { A.toast(err.message, 'error'); }
    });
    $('#tpl-reset', box).addEventListener('click', async () => {
      if (!(await A.confirmBox('Rétablir le modèle d’origine ?', 'Votre objet et votre contenu actuels seront remplacés (pas encore enregistrés).'))) return;
      tf.elements.subject.value = def.subject;
      tf.elements.html.value = def.html;
      preview();
    });
    preview();
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
              <small>${r.capacity} ${r.per_bed ? 'lits' : 'pers.'} · ${esc(r.beds)} · ${r.photos.length} photo${r.photos.length > 1 ? 's' : ''}</small>
              <small>${!r.bookable ? '⛔ Non proposée' : occupancyPill(r)}</small>
            </span>
          </button>
          <div class="rr-prices">
            <label class="rr-mode">Prix
              <select data-mode data-id="${r.id}" aria-label="Type de prix ${esc(r.name)}">
                <option value="room" ${r.per_bed ? '' : 'selected'}>par chambre</option>
                <option value="bed" ${r.per_bed ? 'selected' : ''}>par lit</option>
              </select></label>
            <label>Séjour ${esc(stayInfo.short)}<span class="euro"><input inputmode="decimal" data-price="price_both" data-id="${r.id}" value="${esc(priceInput(r.price_both))}" placeholder="—" aria-label="Prix du séjour ${esc(r.name)}"></span></label>
          </div>
        </div>`).join('')}</div>`;
    pane.innerHTML = `
      <p class="muted small">Prix en euros <b>pour tout le séjour (${esc(stayInfo.short)})</b>, pour la chambre entière ou <b>par lit</b> (dortoirs : chaque invité réserve le nombre de lits voulu).
        Ils s'enregistrent automatiquement quand vous quittez le champ. Touchez une chambre pour modifier sa fiche et ses photos.</p>
      ${block('rdc', 'Rez-de-chaussée')}${block('etage', 'Étage')}
      <div class="panel rooms-total" id="rooms-total" aria-live="polite"></div>`;

    /** Somme des prix si toutes les chambres proposées sont louées (dortoir : prix du lit × nombre de lits). */
    const drawTotal = () => {
      const offered = rooms.filter((r) => r.bookable);
      const sum = (key) => offered.reduce((t, r) => t + (r[key] ?? 0) * (r.per_bed ? r.capacity : 1), 0);
      const missing = (key) => offered.filter((r) => r[key] === null || r[key] === undefined).length;
      const beds = offered.reduce((t, r) => t + r.capacity, 0);
      const line = (key, label, sub) => `<div class="rt-cell"><span class="rt-label">${label}<small>${sub}</small></span>
        <strong class="rt-sum">${esc(euro(sum(key), '0 €'))}</strong>
        ${missing(key) ? `<small class="warn-text">${A.plural(missing(key), 'chambre sans prix', 'chambres sans prix')}</small>` : ''}</div>`;
      $('#rooms-total').innerHTML = `
        <h2>Total si tout est loué</h2>
        <p class="muted small">${A.plural(offered.length, 'chambre proposée', 'chambres proposées')}, ${beds} couchages.
          Les dortoirs comptent pour le prix du lit × leur nombre de lits.</p>
        <div class="rt-grid">${line('price_both', `Séjour ${stayInfo.short}`, stayInfo.label)}</div>`;
    };
    drawTotal();
    $$('[data-mode]', pane).forEach((sel) => sel.addEventListener('change', async () => {
      const room = rooms.find((r) => r.id === +sel.dataset.id);
      const prev = room.per_bed ? 'bed' : 'room';
      if (sel.value === 'room' && room.bookings?.length > 1) {
        A.toast(`« ${room.name} » a ${room.bookings.length} réservations : gardez une seule réservation avant de la louer en entier.`, 'error');
        sel.value = prev;
        return;
      }
      try {
        await A.call(`/admin/rooms/${room.id}`, { method: 'PUT', body: { price_mode: sel.value } });
        A.toast(sel.value === 'bed' ? `« ${room.name} » : prix par lit` : `« ${room.name} » : prix de la chambre entière`);
        roomsView();
      } catch (err) {
        A.toast(err.message, 'error');
        sel.value = prev;
      }
    }));

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
          drawTotal();
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
        statusOf: (r) => (!r.bookable ? 'off' : r.full ? 'taken' : 'free'),
        // Sur le plan d'administration, la pastille indique l'occupant (ou les lits pris d'un dortoir)
        badge: (r) => (!r.bookable ? 'Non proposée' : r.per_bed ? `${r.beds_taken}/${r.capacity} lits`
          : r.booking ? r.booking.last_name.slice(0, 12) || 'Réservée' : 'Libre'),
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
    { name: 'price_mode', label: 'Type de prix', type: 'select', full: true, options: [
      { value: 'room', label: 'Prix de la chambre entière (une seule réservation)' },
      { value: 'bed', label: 'Prix par lit — dortoir (les invités réservent des lits)' },
    ] },
    { name: 'price_both', label: 'Prix du séjour (€)', placeholder: 'ex. 80' },
    { name: 'beds', label: 'Couchage', full: true },
    { name: 'bath', label: 'Sanitaires', full: true },
    { name: 'description', label: 'Description', type: 'textarea', full: true },
    { name: 'private_bath', label: 'Salle d’eau privative', type: 'checkbox' },
    { name: 'baby_bed', label: 'Lit bébé', type: 'checkbox' },
    { name: 'pmr', label: '♿ Accessible PMR (personnes à mobilité réduite)', type: 'checkbox', full: true },
    { name: 'bookable', label: 'Proposée à la réservation', type: 'checkbox', full: true },
  ];

  async function editRoom(stale) {
    let r = stale;
    try {
      const { rooms } = await A.call('/admin/rooms');
      r = rooms.find((x) => x.id === stale.id) || stale;
    } catch { /* on garde la version affichée */ }
    const values = { ...r, price_both: priceInput(r.price_both), price_mode: r.per_bed ? 'bed' : 'room' };
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
        ${r.per_bed && r.bookings.length ? `<p class="notice">${r.beds_taken}/${r.capacity} lits réservés : ${r.bookings.map((b) => `${esc(fullName(b))} (${bedsLabel(b.persons)})`).join(', ')}.</p>`
          : r.booking ? `<p class="notice">Réservée par ${esc(fullName(r.booking))} (${STATUS[r.booking.status].label.toLowerCase()}).</p>` : ''}
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
