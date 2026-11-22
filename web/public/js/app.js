/**
 * Site invités : charge le contenu depuis l'API et affiche chaque section.
 */
'use strict';

(() => {
  const { esc, api, KINDS, loadAnalytics, renderLogo, makeMap, pinIcon, hasCoords, directionsUrl, formatDateLong, formatDay } = window.MM;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

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

  /* ---------- Questions fréquentes ---------- */
  function renderFaq(faq) {
    const items = (faq || []).filter((f) => f.q && f.a); // une question sans réponse n'est pas affichée
    $('#faq').hidden = !items.length;
    $$('a[href="#faq"]').forEach((a) => { a.parentElement.hidden = !items.length; });
    $('#faq-list').innerHTML = items.map((f) => `
      <details class="faq-item">
        <summary>${esc(f.q)}</summary>
        <div class="faq-answer pre">${esc(f.a)}</div>
      </details>`).join('');
  }

  /* ---------- Hébergements alentours (informations + lien) ---------- */
  function renderGites(gites) {
    $('#gites-list').innerHTML = gites.map((g) => `<article class="card gite">
        <div class="gite-head"><h3>🏡 ${esc(g.name)}</h3></div>
        ${g.address ? `<p class="muted">${esc(g.address)}</p>` : ''}
        ${g.description ? `<p class="pre">${esc(g.description)}</p>` : ''}
        <dl class="facts">
          ${g.capacity ? `<div><dt>Capacité</dt><dd>${g.capacity} pers.</dd></div>` : ''}
          ${g.price ? `<div><dt>Tarif</dt><dd>${esc(g.price)}</dd></div>` : ''}
          ${g.contact ? `<div><dt>Contact</dt><dd>${esc(g.contact)}</dd></div>` : ''}
        </dl>
        <div class="gite-actions">
          ${g.url ? `<a class="btn btn-small btn-primary" href="${esc(g.url)}" target="_blank" rel="noopener">Lien</a>` : ''}
          <a class="link-btn" href="${esc(directionsUrl(g))}" target="_blank" rel="noopener">Itinéraire →</a>
        </div>
      </article>`).join('');

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

  /* ---------- Formulaire de réponse ---------- */
  /** Captcha maison : question de calcul générée et vérifiée par notre serveur (aucun service tiers). */
  async function loadCaptcha(form) {
    const q = $('#captcha-question');
    try {
      const c = await api('/captcha');
      q.textContent = c.question;
      form.querySelector('[name="captcha_token"]').value = c.token;
      form.querySelector('[name="captcha_answer"]').value = '';
    } catch {
      q.textContent = 'Question indisponible, réessayez.';
    }
  }

  function setupRsvp(content, codeRequired) {
    const form = $('#rsvp-form');
    const status = form.querySelector('.form-status');
    const deadline = content.rsvp_deadline ? formatDay(content.rsvp_deadline) : '';
    $('#rsvp-deadline').textContent = deadline ? `Merci de nous répondre avant le ${deadline}.` : '';
    if (!content.options.rsvp_open) {
      $('#rsvp-closed').hidden = false;
      form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = true; });
    }
    document.querySelectorAll('.code-field').forEach((f) => {
      f.hidden = !codeRequired;
      f.querySelector('input').required = codeRequired;
    });

    const toggle = () => {
      const yes = form.querySelector('[name="attending"]:checked')?.value === 'yes';
      form.querySelector('.attending-only').hidden = !yes;
    };
    // Le nombre de menus végétariens ne peut pas dépasser le nombre de personnes
    const veggie = $('#veggie-select');
    const updateVeggie = () => {
      const total = (+form.elements.adults.value || 0) + (+form.elements.children.value || 0);
      const current = Math.min(+veggie.value || 0, total);
      veggie.innerHTML = Array.from({ length: total + 1 }, (_, n) =>
        `<option value="${n}" ${n === current ? 'selected' : ''}>${n === 0 ? 'Aucun' : n === total && total > 1 ? `${n} (tout le monde)` : n}</option>`).join('');
    };
    form.querySelectorAll('[name="attending"]').forEach((r) => r.addEventListener('change', toggle));
    form.elements.adults.addEventListener('input', updateVeggie);
    form.elements.children.addEventListener('input', updateVeggie);
    updateVeggie();

    // Nombre d'adultes et d'enfants prévus dans la liste des invités (réglés dans l'admin) : préremplis d'après le nom,
    // tant que l'invité n'a pas modifié ces champs lui-même
    let countsTouched = false, lookupTimer = 0, lookupSeq = 0;
    const note = $('#rsvp-prefill');
    const markTouched = (e) => { if (e.isTrusted) countsTouched = true; };
    form.elements.adults.addEventListener('input', markTouched);
    form.elements.children.addEventListener('input', markTouched);
    const lookup = async () => {
      const name = form.elements.name.value.trim();
      const seq = ++lookupSeq;
      if (name.length < 2 || countsTouched) return;
      try {
        const r = await api('/rsvp/lookup', { method: 'POST', body: { name, code: form.elements.code?.value || '' } });
        if (seq !== lookupSeq || countsTouched) return;
        if (!r.found) { note.hidden = true; return; }
        form.elements.adults.value = r.adults;
        form.elements.children.value = r.children;
        updateVeggie();
        const pl = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
        note.textContent = `D’après notre liste : ${pl(r.adults, 'adulte')}${r.children ? ` et ${pl(r.children, 'enfant')}` : ''}. Modifiez si besoin.`;
        note.hidden = false;
      } catch { /* préremplissage facultatif */ }
    };
    const scheduleLookup = () => { clearTimeout(lookupTimer); lookupTimer = setTimeout(lookup, 500); };
    form.elements.name.addEventListener('input', scheduleLookup);
    form.elements.name.addEventListener('change', lookup);
    form.elements.code?.addEventListener('change', lookup);
    const songs = setupSongs(form);
    $('#captcha-new').addEventListener('click', () => loadCaptcha(form));
    if (content.options.rsvp_open) loadCaptcha(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status';
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      status.textContent = 'Envoi en cours…';
      try {
        const res = await api('/rsvp', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) });
        status.textContent = res.message;
        status.classList.add('ok');
        const code = form.elements.code.value;
        form.reset();
        form.elements.code.value = code;
        songs.reset();
        countsTouched = false; note.hidden = true;
        toggle();
        updateVeggie();
      } catch (err) {
        status.textContent = err.message;
        status.classList.add('error');
      } finally {
        btn.disabled = false;
        loadCaptcha(form); // une question ne sert qu'une fois
      }
    });
  }

  /* ---------- Chansons proposées pour la piste de danse ---------- */
  function setupSongs(form) {
    const list = $('#song-list'), q = $('#song-q'), results = $('#song-results'), hidden = form.elements.songs;
    const MAX = 3;
    let chosen = [], canSearch = false, timer = null, seq = 0, options = [];
    api('/music/config').then((c) => { canSearch = !!c.search; }).catch(() => {});

    const sync = () => {
      hidden.value = JSON.stringify(chosen.map(({ title, artist, spotify_id: id, image }) => ({ title, artist, spotify_id: id, image })));
      q.disabled = chosen.length >= MAX;
      q.placeholder = chosen.length >= MAX ? 'Merci pour vos 3 chansons !' : 'Titre, artiste ou lien Spotify';
    };
    const cover = (s) => (s.image ? `<img src="${esc(s.image)}" alt="" width="48" height="48" loading="lazy">` : '<span class="song-cover" aria-hidden="true">♪</span>');
    const draw = () => {
      list.innerHTML = chosen.map((s, i) => `
        <li class="song">
          <div class="song-row">
            ${cover(s)}
            <span class="song-txt"><strong>${esc(s.title || 'Titre Spotify')}</strong>${s.artist ? `<span>${esc(s.artist)}</span>` : ''}</span>
            ${s.spotify_id ? `<button type="button" class="song-btn" data-play="${i}" aria-expanded="${!!s.open}" aria-label="${s.open ? 'Masquer' : 'Écouter'} l’extrait de ${esc(s.title || 'ce titre')}">${s.open ? '■' : '▶'}</button>` : ''}
            <button type="button" class="song-btn" data-del="${i}" aria-label="Retirer ${esc(s.title || 'ce titre')}">✕</button>
          </div>
          ${s.open ? `<iframe class="song-player" title="Extrait sur Spotify : ${esc(s.title)}" src="https://open.spotify.com/embed/track/${esc(s.spotify_id)}?utm_source=generator&amp;theme=0" height="80" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>` : ''}
        </li>`).join('');
      sync();
    };
    const close = () => { results.hidden = true; results.innerHTML = ''; options = []; q.removeAttribute('aria-activedescendant'); };
    const add = (s) => {
      if (chosen.length >= MAX) return;
      if (s.spotify_id && chosen.some((c) => c.spotify_id === s.spotify_id)) { close(); q.value = ''; return; }
      chosen.push(s); q.value = ''; close(); draw(); q.focus();
    };
    const showOptions = (opts) => {
      options = opts;
      results.innerHTML = opts.map((o, i) => `<li role="option" id="song-opt-${i}" data-opt="${i}" class="${o.free ? 'free' : ''}">
        ${o.free ? '<span class="song-cover" aria-hidden="true">＋</span>' : cover(o)}
        <span class="song-txt"><strong>${esc(o.free ? `Ajouter « ${o.title} »` : o.title)}</strong><span>${esc(o.free ? 'sans lien Spotify' : o.artist)}</span></span></li>`).join('');
      results.hidden = !opts.length;
    };
    const SPOTIFY_LINK = /(open\.spotify\.com\/(intl-[a-z-]+\/)?track\/|spotify:track:)[A-Za-z0-9]{22}/;
    q.addEventListener('input', () => {
      clearTimeout(timer);
      const v = q.value.trim(), mine = ++seq;
      if (v.length < 2) { close(); return; }
      timer = setTimeout(async () => {
        if (SPOTIFY_LINK.test(v)) {
          try {
            const t = await api(`/music/lookup?url=${encodeURIComponent(v)}`);
            if (mine === seq) add({ title: t.title, artist: t.artist, spotify_id: t.id, image: t.image });
          } catch (err) {
            if (mine !== seq) return;
            options = [];
            results.innerHTML = `<li class="song-msg">${esc(err.message)}</li>`;
            results.hidden = false;
          }
          return;
        }
        let found = [];
        if (canSearch) { try { found = await api(`/music/search?q=${encodeURIComponent(v)}`); } catch { found = []; } }
        if (mine !== seq) return;
        showOptions([...found.map((t) => ({ title: t.title, artist: t.artist, spotify_id: t.id, image: t.image })), { free: true, title: v }]);
      }, canSearch ? 300 : 150);
    });
    let active = -1;
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const o = options[Math.max(0, active)]; if (o) add(o.free ? { title: o.title, artist: '', spotify_id: '', image: '' } : o); else if (q.value.trim().length >= 2) add({ title: q.value.trim(), artist: '', spotify_id: '', image: '' }); active = -1; return; }
      if (e.key === 'Escape') { close(); return; }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && options.length) {
        e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        $$('[role=option]', results).forEach((li, i) => li.setAttribute('aria-selected', i === active));
        q.setAttribute('aria-activedescendant', `song-opt-${active}`);
      }
    });
    results.addEventListener('mousedown', (e) => e.preventDefault()); // garder le focus dans le champ
    results.addEventListener('click', (e) => {
      const li = e.target.closest('[data-opt]'); if (!li) return;
      const o = options[+li.dataset.opt];
      add(o.free ? { title: o.title, artist: '', spotify_id: '', image: '' } : o);
    });
    q.addEventListener('blur', () => setTimeout(close, 150));
    list.addEventListener('click', (e) => {
      const play = e.target.closest('[data-play]'), del = e.target.closest('[data-del]');
      if (play) { const s = chosen[+play.dataset.play]; s.open = !s.open; draw(); }
      if (del) { chosen.splice(+del.dataset.del, 1); draw(); q.focus(); }
    });
    sync();
    return { reset() { chosen = []; draw(); close(); } };
  }

  /* ---------- Ordre et affichage des blocs (réglés dans l'admin, onglet Apparence) ---------- */
  function applyLayout(sections, nav) {
    const main = $('#contenu');
    const navList = $('.topnav ul');
    (sections || []).forEach((s) => {
      const el = document.getElementById(s.id);
      if (!el || el.parentElement !== main) return;
      main.append(el); // déplacé à la suite, dans l'ordre choisi
      el.toggleAttribute('data-off', !s.visible);
    });
    // Barre de menu : ordre et liens choisis dans l'admin ; un lien vers un bloc masqué est masqué aussi
    const sectionOff = new Set((sections || []).filter((s) => !s.visible).map((s) => s.id));
    (nav || []).forEach((n) => {
      const li = $(`[data-nav="${n.id}"]`, navList);
      if (!li) return;
      navList.append(li);
      const toSection = $('a', li)?.getAttribute('href')?.startsWith('#');
      li.toggleAttribute('data-off', !n.visible || (toSection && sectionOff.has(n.id)));
    });
    // Formulaire de réponse masqué : on retire aussi les boutons qui y mènent
    const rsvpOff = sectionOff.has('rsvp');
    $$('a[href="#rsvp"]').forEach((a) => a.toggleAttribute('data-off', rsvpOff));
  }

  /** Fond alterné d'une section visible sur deux, quel que soit l'ordre choisi. */
  function stripeSections() {
    $$('#contenu > section')
      .filter((el) => !el.hidden && !el.hasAttribute('data-off'))
      .forEach((el, i) => el.classList.toggle('section-soft', i % 2 === 1));
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
    renderLogo($('#hero-logo'), c.logo);
    loadAnalytics();
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
    renderFaq(c.faq);
    $('#nav-jeux').hidden = c.options.games === false;
    renderGites(state.gites);
    $('#gites-block').hidden = !state.gites.length;
    // Encart « Dormir sur place »
    if (c.onsite) {
      $('#onsite-promo-text').textContent = c.onsite.open
        ? `${c.onsite.venue} : choisissez votre chambre sur le plan`
        : `${c.onsite.venue} : voir les chambres (réservations closes)`;
    }
    $('#hebergement').hidden = !state.gites.length && !c.onsite;
    setupRsvp(c, state.code_required);
    applyLayout(state.sections, state.nav);
    stripeSections();
    // Album photo : lien dans le menu à partir du jour du mariage
    api('/album/status').then((a) => {
      if (a.open) $('#nav-album').hidden = false;
      if (!a.enabled) return; // album désactivé : pas d'encart
      const text = $('#album-card-text'), cta = $('#album-card-cta');
      if (a.uploads_live) {
        text.textContent = 'Ajoutez vos photos et vidéos de la journée et retrouvez celles de tous les invités.';
        cta.textContent = 'Ajouter mes photos →';
      } else if (a.live) {
        text.textContent = 'Retrouvez toutes les photos et vidéos de la journée, prises par les invités.';
        cta.textContent = 'Voir l’album →';
      } else if (a.opens_at) {
        text.textContent = `Le jour J, partagez ici vos photos et vidéos de la journée. Ouverture le ${formatDateLong(a.opens_at, state.content.timezone).toLowerCase()}.`;
      }
      $('#album').hidden = false;
      stripeSections();
    }).catch(() => {});

    const contact = [c.contact_email && `<a href="mailto:${esc(c.contact_email)}">${esc(c.contact_email)}</a>`,
      c.contact_phone && `<a href="tel:${esc(c.contact_phone.replace(/\s/g, ''))}">${esc(c.contact_phone)}</a>`].filter(Boolean);
    $('#contact-line').innerHTML = contact.length ? 'Une question&nbsp;? ' + contact.join(' · ') : '';
  }

  document.addEventListener('DOMContentLoaded', init);
})();
