/**
 * Site invités : charge le contenu depuis l'API et affiche chaque section.
 */
'use strict';

(() => {
  const { esc, api, KINDS, applyTheme, makeMap, pinIcon, hasCoords, directionsUrl, formatDateLong, formatDay } = window.MM;
  const $ = (sel, root = document) => root.querySelector(sel);

  let state = null;

  function bind(name, value) {
    document.querySelectorAll(`[data-bind="${name}"]`).forEach((el) => {
      el.textContent = value || '';
      el.hidden = !value;
    });
  }

  /* ---------- Compte à rebours ---------- */
  function startCountdown(iso) {
    const target = new Date(iso).getTime();
    const ids = ['days', 'hours', 'minutes', 'seconds'].map((k) => $('#cd-' + k));
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        $('.countdown').hidden = true;
        const done = $('#cd-done');
        done.hidden = false;
        // Le jour J (jusqu'à 24 h après le début) puis message de remerciement
        done.textContent = diff > -86400_000 ? "C'est aujourd'hui ! 🎉" : 'Merci d’avoir partagé ce jour avec nous ❤';
        return;
      }
      const s = Math.floor(diff / 1000);
      const values = [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
      values.forEach((v, i) => { ids[i].textContent = i === 0 ? v : String(v).padStart(2, '0'); });
      setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
  }

  /* ---------- Programme / lieux ---------- */
  function renderPlaces(places) {
    const list = $('#places-list');
    list.innerHTML = places.map((p) => {
      const k = KINDS[p.kind] || KINDS.autre;
      return `<li class="tl-item">
        <div class="tl-time">${esc(p.time)}</div>
        <div class="tl-dot" aria-hidden="true">${k.icon}</div>
        <div class="tl-body">
          <p class="tl-kind">${esc(k.label)}</p>
          <h3>${esc(p.name)}</h3>
          ${p.address ? `<p class="muted">${esc(p.address)}</p>` : ''}
          ${p.description ? `<p class="pre">${esc(p.description)}</p>` : ''}
          <a class="link-btn" href="${esc(directionsUrl(p))}" target="_blank" rel="noopener">Itinéraire →</a>
        </div>
      </li>`;
    }).join('');

    const located = places.filter(hasCoords);
    const mapEl = $('#map-places');
    if (!located.length) { mapEl.hidden = true; return; }
    const map = makeMap(mapEl);
    const bounds = [];
    located.forEach((p) => {
      const k = KINDS[p.kind] || KINDS.autre;
      L.marker([p.lat, p.lng], { icon: pinIcon(k.icon), title: p.name, alt: p.name })
        .addTo(map)
        .bindPopup(`<strong>${esc(p.name)}</strong>${p.time ? ' · ' + esc(p.time) : ''}<br>${esc(p.address)}<br>
                    <a href="${esc(directionsUrl(p))}" target="_blank" rel="noopener">Itinéraire</a>`);
      bounds.push([p.lat, p.lng]);
    });
    fit(map, bounds);
  }

  function fit(map, bounds) {
    if (bounds.length === 1) map.setView(bounds[0], 15);
    else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }

  /* ---------- Thème ---------- */
  function renderTheme(theme) {
    bind('themeTitle', theme.title);
    bind('themeDescription', theme.description);
    bind('dressCode', theme.dress_code);
    $('#dresscode-box').hidden = !theme.dress_code;
    $('#swatches').innerHTML = (theme.colors || [])
      .map((c) => `<li class="swatch"><span class="swatch-color" data-color="${esc(c)}"></span></li>`).join('');
    // Couleur appliquée via JS (compatible avec la politique de sécurité CSP)
    document.querySelectorAll('.swatch-color').forEach((el) => { el.style.background = el.dataset.color; });
  }

  /* ---------- Menu ---------- */
  function renderMenu(c) {
    bind('menuIntro', c.menu_intro);
    bind('menuNote', c.menu_note);
    const card = $('#menu-card');
    card.innerHTML = (c.menu || []).map((s) => `
      <div class="menu-course">
        <h3>${esc(s.title)}</h3>
        <ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>`).join('<div class="menu-sep" aria-hidden="true">✦</div>');
    $('#menu').hidden = !(c.menu || []).length;
  }

  /* ---------- Hébergements ---------- */
  function renderGites(gites, content) {
    const bookable = gites.filter((g) => g.bookable);
    $('#gites-list').innerHTML = gites.map((g) => {
      let badge = '';
      if (g.bookable) {
        badge = g.remaining > 0
          ? `<span class="badge badge-ok">${g.remaining} place${g.remaining > 1 ? 's' : ''} disponible${g.remaining > 1 ? 's' : ''}</span>`
          : '<span class="badge badge-full">Complet</span>';
      } else {
        badge = '<span class="badge">Réservation directe</span>';
      }
      return `<article class="card gite">
        <div class="gite-head"><h3>🏡 ${esc(g.name)}</h3>${badge}</div>
        ${g.address ? `<p class="muted">${esc(g.address)}</p>` : ''}
        ${g.description ? `<p class="pre">${esc(g.description)}</p>` : ''}
        <dl class="facts">
          ${g.capacity ? `<div><dt>Capacité</dt><dd>${g.capacity} pers.</dd></div>` : ''}
          ${g.price ? `<div><dt>Tarif</dt><dd>${esc(g.price)}</dd></div>` : ''}
          ${g.contact ? `<div><dt>Contact</dt><dd>${esc(g.contact)}</dd></div>` : ''}
        </dl>
        <div class="gite-actions">
          ${g.bookable && g.remaining > 0 && content.options.bookings_open
            ? `<button class="btn btn-small btn-primary" type="button" data-book="${g.id}">Réserver ici</button>` : ''}
          ${g.url ? `<a class="link-btn" href="${esc(g.url)}" target="_blank" rel="noopener">Site web →</a>` : ''}
          <a class="link-btn" href="${esc(directionsUrl(g))}" target="_blank" rel="noopener">Itinéraire →</a>
        </div>
      </article>`;
    }).join('');

    // Formulaire de réservation
    const form = $('#booking-form');
    const available = bookable.filter((g) => g.remaining > 0);
    if (!bookable.length) {
      form.hidden = true;
    } else {
      $('#booking-gite').innerHTML = available.length
        ? available.map((g) => `<option value="${g.id}">${esc(g.name)} — ${g.remaining} place(s)</option>`).join('')
        : '<option value="">Tous les hébergements sont complets</option>';
      const closed = !content.options.bookings_open || !available.length;
      $('#booking-closed').hidden = content.options.bookings_open;
      form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = closed; });
    }
    const nights = content.nights || [];
    $('#booking-nights').hidden = !nights.length;
    $('#nights-checks').innerHTML = nights
      .map((n) => `<label class="check"><input type="checkbox" name="nights" value="${esc(n)}"> ${esc(n)}</label>`).join('');

    document.querySelectorAll('[data-book]').forEach((btn) => btn.addEventListener('click', () => {
      $('#booking-gite').value = btn.dataset.book;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => form.querySelector('[name="name"]').focus({ preventScroll: true }), 500);
    }));

    // Carte
    const located = gites.filter(hasCoords);
    const mapEl = $('#map-gites');
    if (!located.length) { mapEl.hidden = true; return; }
    const map = makeMap(mapEl);
    const bounds = [];
    located.forEach((g) => {
      L.marker([g.lat, g.lng], { icon: pinIcon('🏡', 'pin-alt'), title: g.name, alt: g.name }).addTo(map)
        .bindPopup(`<strong>${esc(g.name)}</strong><br>${esc(g.address)}${g.price ? '<br>' + esc(g.price) : ''}`);
      bounds.push([g.lat, g.lng]);
    });
    // On affiche aussi la salle de réception comme repère
    state.places.filter((p) => p.kind === 'salle' && hasCoords(p)).forEach((p) => {
      L.marker([p.lat, p.lng], { icon: pinIcon('🥂'), title: p.name, alt: p.name }).addTo(map)
        .bindPopup(`<strong>${esc(p.name)}</strong><br>${esc(p.address)}`);
      bounds.push([p.lat, p.lng]);
    });
    fit(map, bounds);
  }

  /* ---------- Formulaires ---------- */
  function formData(form) {
    const fd = new FormData(form);
    const out = {};
    for (const [k, v] of fd.entries()) {
      if (k === 'nights') (out.nights ||= []).push(v);
      else out[k] = v;
    }
    return out;
  }

  function setupForm(form, path, onSuccess) {
    const status = form.querySelector('.form-status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status';
      // Validation native du navigateur (champs requis, e-mail…)
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      status.textContent = 'Envoi en cours…';
      try {
        const res = await api(path, { method: 'POST', body: formData(form) });
        status.textContent = res.message;
        status.classList.add('ok');
        onSuccess && onSuccess();
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function setupRsvp(content, codeRequired) {
    const form = $('#rsvp-form');
    const deadline = content.rsvp_deadline ? formatDay(content.rsvp_deadline) : '';
    $('#rsvp-deadline').textContent = deadline ? `Merci de nous répondre avant le ${deadline}.` : '';
    if (!content.options.rsvp_open) {
      $('#rsvp-closed').hidden = false;
      form.querySelectorAll('input, textarea, button').forEach((el) => { el.disabled = true; });
    }
    const toggle = () => {
      const yes = form.querySelector('[name="attending"]:checked')?.value === 'yes';
      form.querySelector('.attending-only').hidden = !yes;
    };
    form.querySelectorAll('[name="attending"]').forEach((r) => r.addEventListener('change', toggle));
    setupForm(form, '/rsvp', () => {
      const code = form.querySelector('[name="code"]').value;
      form.reset();
      form.querySelector('[name="code"]').value = code;
      toggle();
    });
    document.querySelectorAll('.code-field').forEach((f) => {
      f.hidden = !codeRequired;
      f.querySelector('input').required = codeRequired;
    });
  }

  function setupBooking() {
    const form = $('#booking-form');
    setupForm(form, '/bookings', async () => {
      // Rafraîchit les places restantes
      const fresh = await api('/content');
      state = fresh;
      const sel = $('#booking-gite');
      const keep = fresh.gites.filter((g) => g.bookable && g.remaining > 0);
      sel.innerHTML = keep.map((g) => `<option value="${g.id}">${esc(g.name)} — ${g.remaining} place(s)</option>`).join('')
        || '<option value="">Tous les hébergements sont complets</option>';
      document.querySelectorAll('.gite').forEach((card, i) => {
        const g = fresh.gites[i];
        const badge = card.querySelector('.badge');
        if (g && g.bookable && badge) {
          badge.textContent = g.remaining > 0 ? `${g.remaining} place${g.remaining > 1 ? 's' : ''} disponible${g.remaining > 1 ? 's' : ''}` : 'Complet';
          badge.className = 'badge ' + (g.remaining > 0 ? 'badge-ok' : 'badge-full');
          if (g.remaining <= 0) card.querySelector('[data-book]')?.remove();
        }
      });
      form.querySelectorAll('input:not([type=checkbox]):not([name=code]):not([name=website]), textarea').forEach((el) => {
        if (el.name !== 'persons') el.value = '';
      });
    });
  }

  /* ---------- Démarrage ---------- */
  async function init() {
    try {
      state = await api('/content');
    } catch (err) {
      document.body.insertAdjacentHTML('afterbegin', `<p class="load-error">Impossible de charger les informations (${esc(err.message)}). Réessayez dans un instant.</p>`);
      return;
    }
    const c = state.content;
    applyTheme(c.theme.colors);
    document.title = `Mariage ${c.couple}`;
    bind('couple', c.couple);
    bind('dateLong', c.date_utc ? formatDateLong(c.date_utc, c.timezone) : '');
    const first = state.places[0];
    bind('firstPlace', first ? (first.address.split(',').pop() || '').trim() : '');
    bind('welcome', c.welcome);
    if (c.date_utc) startCountdown(c.date_utc);

    renderPlaces(state.places);
    $('#programme').hidden = !state.places.length;
    renderTheme(c.theme);
    renderMenu(c);
    renderGites(state.gites, c);
    // Encart « Dormir sur place »
    if (c.onsite) {
      $('#onsite-promo-text').textContent = c.onsite.open
        ? `${c.onsite.venue} : choisissez votre chambre sur le plan`
        : `${c.onsite.venue} : voir les chambres (réservations closes)`;
    }
    $('#hebergement').hidden = !state.gites.length;
    setupRsvp(c, state.code_required);
    setupBooking();

    const contact = [c.contact_email && `<a href="mailto:${esc(c.contact_email)}">${esc(c.contact_email)}</a>`,
      c.contact_phone && `<a href="tel:${esc(c.contact_phone.replace(/\s/g, ''))}">${esc(c.contact_phone)}</a>`].filter(Boolean);
    $('#contact-line').innerHTML = contact.length ? 'Une question&nbsp;? ' + contact.join(' · ') : '';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
