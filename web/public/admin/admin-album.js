/**
 * Administration — onglet « Album » : ouverture au jour J, réglages, modération des photos et vidéos,
 * téléchargement de tout l'album (ZIP), QR code et cartes de table à imprimer.
 */
'use strict';

(() => {
  const A = window.MMAdmin;
  const { esc } = window.MM;
  const { $, $$, call, toast, confirmBox } = A;
  let filter = 'all';
  const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  // Date ISO ↔ valeur d'un champ datetime-local (heure du navigateur)
  const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fmtSize = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} Go` : b >= 1e6 ? `${Math.round(b / 1e6)} Mo` : `${Math.max(b ? 1 : 0, Math.round(b / 1e3))} ko`);

  async function albumView() {
    let [data, access, appearance, content] = await Promise.all([
      call('/admin/album'), call('/admin/access'), call('/admin/appearance'), call('/admin/content'),
    ]);
    const coupleFont = appearance.fonts.find((f) => f.id === appearance.appearance.fonts.couple)?.family || 'Great Vibes';
    const albumUrl = `${location.origin}/album/`;

    const render = () => {
      const { status: st, settings: s, items, stats } = data;
      const now = Date.now(), opens = st.opens_at ? new Date(st.opens_at).getTime() : null, closes = st.closes_at ? new Date(st.closes_at).getTime() : null;
      const phase = !s.enabled ? ['Désactivé', 'pill-no'] : !opens ? ['Date du mariage à renseigner', 'pill-wait']
        : now < opens ? ['Fermé jusqu’au jour J', 'pill-wait'] : now < closes ? ['Ouvert aux invités', 'pill-ok'] : ['Envois terminés, galerie visible', 'pill-ok'];
      const shown = items.filter((i) => (filter === 'pending' ? !i.approved : filter === 'hidden' ? i.hidden : true));

      A.view.innerHTML = `
        <div class="page-head row"><h1>Album photo</h1>
          <a class="btn btn-ghost btn-small" href="/album/" target="_blank" rel="noopener">${now < (opens || 0) ? 'Essayer l’album (aperçu) ↗' : 'Voir l’album ↗'}</a></div>

        <section class="panel album-state">
          <p><span class="pill ${phase[1]}">${phase[0]}</span></p>
          <p>Ouverture : <strong>${esc(fmtDT(st.opens_at))}</strong><br>
             Envois possibles jusqu’au <strong>${esc(fmtDT(st.closes_at))}</strong>, puis la galerie reste visible.</p>
          <p class="small muted">Avant l’ouverture, les invités voient un compte à rebours. Vous, connectés à l’administration, pouvez déjà utiliser l’album :
            vos envois portent l’étiquette « Test » et ne seront jamais montrés aux invités.</p>
        </section>

        <div class="stats">
          <div class="stat"><span class="stat-num">${stats.photos}</span><span class="stat-label">Photos</span></div>
          <div class="stat"><span class="stat-num">${stats.videos}</span><span class="stat-label">Vidéos</span></div>
          <div class="stat stat-wait"><span class="stat-num">${stats.pending}</span><span class="stat-label">À valider</span></div>
          <div class="stat"><span class="stat-num stat-money">${fmtSize(stats.bytes)}</span><span class="stat-label">Espace utilisé</span></div>
        </div>

        <div class="panel-grid">
          <form class="panel" id="album-settings">
            <h2>Réglages</h2>
            <label class="switch"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Album activé</span></label>
            <fieldset class="field">
              <legend>Période d’ouverture</legend>
              <div class="seg-radio">
                <label><input type="radio" name="schedule" value="auto" ${s.schedule !== 'custom' ? 'checked' : ''}><span>À partir du jour J</span></label>
                <label><input type="radio" name="schedule" value="custom" ${s.schedule === 'custom' ? 'checked' : ''}><span>Dates choisies</span></label>
              </div>
            </fieldset>
            <div data-sched="auto" ${s.schedule === 'custom' ? 'hidden' : ''}>
              <label class="field">Envois possibles pendant (jours, à partir du jour du mariage à 0 h)
                <input name="upload_days" type="number" min="1" max="365" value="${s.upload_days}"></label>
            </div>
            <div class="grid-2" data-sched="custom" ${s.schedule === 'custom' ? '' : 'hidden'}>
              <label class="field">Ouverture aux invités<input name="open_at" type="datetime-local" value="${esc(toLocalInput(s.open_at || st.opens_at))}"></label>
              <label class="field">Fin des envois<input name="close_at" type="datetime-local" value="${esc(toLocalInput(s.close_at || st.closes_at))}">
                <small class="help">Ensuite, la galerie reste visible.</small></label>
            </div>
            <label class="switch"><input type="checkbox" name="allow_video" ${s.allow_video ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Accepter les vidéos</span></label>
            <label class="field">Taille maximale d’une vidéo (Mo)
              <input name="max_video_mb" type="number" min="10" max="2000" value="${s.max_video_mb}">
              <small class="help">Une minute de vidéo de téléphone pèse souvent 100 à 200 Mo. Vérifiez aussi la limite de votre proxy (Nginx Proxy Manager).</small></label>
            <label class="switch"><input type="checkbox" name="moderation" ${s.moderation ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span><span>Valider chaque envoi avant de l’afficher</span></label>
            <div class="actions"><button class="btn btn-primary" type="submit">Enregistrer</button></div>
          </form>

          <section class="panel" id="qr-panel">
            <h2>QR code pour les tables</h2>
            <p class="small muted">Les invités le scannent avec l’appareil photo de leur téléphone pour ouvrir directement l’album.</p>
            ${access.enabled ? `<label class="switch"><input type="checkbox" id="qr-pass"><span class="switch-ui" aria-hidden="true"></span>
                <span>Le site est réservé aux invités : inclure le mot de passe dans le QR code</span></label>
              <label class="field" id="qr-pass-field" hidden>Mot de passe des invités<input id="qr-pass-value" autocomplete="off" spellcheck="false"></label>` : ''}
            <div class="qr-box"><img id="qr-img" alt="QR code de l’album" width="200" height="200"><code id="qr-url"></code></div>
            <div class="actions">
              <a class="btn btn-ghost btn-small" id="qr-dl" download>⬇ QR code (SVG)</a>
              <button type="button" class="btn btn-primary btn-small" id="qr-print">🖨 Imprimer les cartes de table</button>
            </div>
          </section>
        </div>

        <section class="panel" id="check-panel">
          <div class="pm-head"><h2>Vérifier que tout fonctionne</h2>
            <a class="btn btn-ghost btn-small" href="/album/" target="_blank" rel="noopener">Ouvrir l’album en mode test ↗</a></div>
          <p class="small muted">Teste toute la chaîne avant d’ouvrir aux invités : réglages, stockage, envoi d’une vraie photo, envoi de gros fichiers à travers
            votre proxy (Nginx Proxy Manager) jusqu’au serveur, puis nettoyage. Pour un test complet, lancez-le depuis l’adresse publique
            (votre nom de domaine) et aussi depuis un téléphone en 4G.</p>
          <label class="switch"><input type="checkbox" id="check-full"><span class="switch-ui" aria-hidden="true"></span>
            <span>Tester aussi un fichier de la taille maximale des vidéos (${s.max_video_mb} Mo, plus long)</span></label>
          <div class="actions"><button type="button" class="btn btn-primary" id="check-run">Lancer les vérifications</button></div>
          <ol class="checks" id="checks" aria-live="polite"></ol>
        </section>

        <section class="panel">
          <div class="pm-head"><h2>Photos et vidéos</h2>
            ${items.length ? `<a class="btn btn-ghost btn-small" href="/api/admin/album/zip">⬇ Tout télécharger (ZIP)</a>` : ''}</div>
          <div class="seg-radio" role="radiogroup" aria-label="Filtrer">
            ${[['all', `Tout (${items.length})`], ['pending', `À valider (${stats.pending})`], ['hidden', `Masqués (${items.filter((i) => i.hidden).length})`]]
              .map(([v, l]) => `<label><input type="radio" name="album_filter" value="${v}" ${filter === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
          </div>
          <div class="actions">
            ${stats.pending ? '<button type="button" class="btn btn-primary btn-small" data-approve-all>Tout valider</button>' : ''}
            ${stats.tests ? `<button type="button" class="btn btn-ghost btn-small" data-del-tests>Supprimer les envois de test (${stats.tests})</button>` : ''}
          </div>
          ${shown.length ? `<div class="album-admin-grid">${shown.map((it) => `
            <figure class="aa-item ${it.hidden ? 'is-hidden' : ''} ${it.approved ? '' : 'is-pending'}" data-id="${it.id}">
              <a href="${esc(it.src)}" target="_blank" rel="noopener" class="aa-thumb">
                ${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : `<span>${it.kind === 'video' ? '🎬' : '🖼'}</span>`}
                ${it.kind === 'video' ? '<b class="aa-play">▶</b>' : ''}
                ${it.test ? '<em class="aa-flag aa-test">Test</em>' : !it.approved ? '<em class="aa-flag">À valider</em>' : it.hidden ? '<em class="aa-flag">Masqué</em>' : ''}
              </a>
              <figcaption><span>${esc(it.by || 'Anonyme')}</span>
                <span class="aa-actions">
                  ${!it.approved ? '<button type="button" class="icon-btn" data-approve aria-label="Valider">✓</button>' : ''}
                  <button type="button" class="icon-btn" data-hide aria-label="${it.hidden ? 'Afficher' : 'Masquer'}">${it.hidden ? '👁' : '🙈'}</button>
                  <button type="button" class="icon-btn" data-del aria-label="Supprimer">🗑</button>
                </span></figcaption>
            </figure>`).join('')}</div>`
            : `<p class="muted">${items.length ? 'Rien dans ce filtre.' : 'Aucune photo pour l’instant. Le jour J, les envois des invités apparaîtront ici.'}</p>`}
        </section>`;
      updateQr();
    };

    /* ---------- QR code et cartes ---------- */
    const qrTarget = () => {
      const pass = $('#qr-pass')?.checked && $('#qr-pass-value')?.value.trim();
      return pass ? `${location.origin}/acces/?code=${encodeURIComponent(pass)}&r=${encodeURIComponent('/album/')}` : albumUrl;
    };
    function updateQr() {
      const url = qrTarget(), src = `/api/admin/album/qr.svg?url=${encodeURIComponent(url)}`;
      $('#qr-img').src = src; $('#qr-dl').href = `${src}&dl=1`;
      $('#qr-url').textContent = url.replace(/code=[^&]+/, 'code=•••');
    }
    function printCards() {
      const url = qrTarget(), src = `/api/admin/album/qr.svg?url=${encodeURIComponent(url)}`;
      let area = $('#print-area');
      if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.append(area); }
      const card = `<div class="pc-card">
          <p class="pc-eyebrow">Partagez vos souvenirs</p>
          <p class="pc-couple">${esc(content.couple || '')}</p>
          <img src="${src}" alt="">
          <ol><li>Scannez ce code avec l’appareil photo de votre téléphone</li><li>Ajoutez vos photos et vidéos</li><li>Regardez celles de tous les invités</li></ol>
          <p class="pc-url">${esc(albumUrl.replace(/^https?:\/\//, ''))}</p>
        </div>`;
      area.innerHTML = `<div class="pc-sheet">${card.repeat(4)}</div>`;
      $$('.pc-couple', area).forEach((el) => { el.style.fontFamily = `'${coupleFont}', cursive`; });
      const imgs = $$('img', area);
      Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((ok) => { i.onload = i.onerror = ok; })))).then(() => window.print());
    }

    /* ---------- Vérifications ---------- */
    function step(label) {
      const li = document.createElement('li');
      li.className = 'check run';
      li.innerHTML = `<span class="check-ico" aria-hidden="true">⏳</span><span class="check-txt"><strong>${esc(label)}</strong><small></small></span>`;
      $('#checks').append(li);
      const set = (cls, ico, msg) => { li.className = `check ${cls}`; $('.check-ico', li).textContent = ico; $('small', li).textContent = msg || ''; };
      return { ok: (m) => set('ok', '✅', m), warn: (m) => set('warn', '⚠️', m), ko: (m) => set('ko', '❌', m), info: (m) => { $('small', li).textContent = m; } };
    }
    function xhrUpload(url, blob, headers, onProgress) {
      return new Promise((ok, ko) => {
        const x = new XMLHttpRequest();
        x.open('POST', url);
        for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
        x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
        x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { /* proxy : page HTML */ } (x.status < 300 ? ok : ko)({ status: x.status, body: j }); };
        x.onerror = () => ko({ status: 0, body: {} });
        x.send(blob);
      });
    }
    async function testImage() {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 1600, 1200);
      gr.addColorStop(0, '#f3c6cf'); gr.addColorStop(1, '#56644a'); g.fillStyle = gr; g.fillRect(0, 0, 1600, 1200);
      g.fillStyle = '#fff'; g.font = 'bold 90px sans-serif'; g.textAlign = 'center'; g.fillText('Photo de test', 800, 600);
      g.font = '50px sans-serif'; g.fillText(new Date().toLocaleString('fr-FR'), 800, 700);
      const blob = (q, w) => new Promise((ok) => { const t = document.createElement('canvas'); t.width = w; t.height = w * .75; t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); t.toBlob(ok, 'image/jpeg', q); });
      return { main: await blob(.88, 1600), thumb: await blob(.78, 480) };
    }
    let checking = false;
    async function runChecks() {
      if (checking) return; checking = true;
      $('#checks').innerHTML = ''; $('#check-run').disabled = true;
      let errors = 0, warnings = 0;
      try {
        // 1. Réglages
        const d = await call('/admin/album/diagnostic');
        let s1 = step('Réglages de l’album');
        if (!d.enabled) { s1.ko('L’album est désactivé : les invités ne le verront pas.'); errors++; }
        else if (!d.opens_at) { s1.ko('Aucune date d’ouverture : renseignez la date du mariage (onglet Contenu) ou des dates choisies.'); errors++; }
        else s1.ok(`Ouverture le ${fmtDT(d.opens_at)}, envois jusqu’au ${fmtDT(d.closes_at)}.`);
        // 2. Stockage
        const s2 = step('Stockage sur le serveur');
        if (!d.writable) { s2.ko('Le dossier de l’album n’est pas accessible en écriture (droits PUID/PGID du conteneur ?).'); errors++; }
        else if (d.free !== null && d.free < 5e9) { s2.warn(`Écriture possible, mais seulement ${fmtSize(d.free)} libres : prévoyez plus de place pour les vidéos.`); warnings++; }
        else s2.ok(d.free !== null ? `Écriture possible, ${fmtSize(d.free)} libres sur ${fmtSize(d.total)}.` : 'Écriture possible.');
        // 3. Envoi d'une vraie photo (comme un invité), relecture puis suppression
        const s3 = step('Envoi d’une photo comme un invité');
        let testId = null;
        try {
          const img = await testImage();
          const r = await xhrUpload('/api/album/upload', new Blob([img.thumb, img.main]), {
            'Content-Type': 'application/octet-stream', 'X-Kind': 'photo', 'X-Test': '1', 'X-Thumb-Length': String(img.thumb.size),
            'X-Name': encodeURIComponent('Vérification'), 'X-Width': '1600', 'X-Height': '1200' });
          testId = r.body.id;
          const fresh = await call('/admin/album');
          const it = fresh.items.find((x) => x.id === testId);
          const [a, b] = await Promise.all([fetch(it.src, { cache: 'no-store' }), fetch(it.thumb, { cache: 'no-store' })]);
          if (!a.ok || !b.ok) throw { status: a.ok ? b.status : a.status, body: { error: 'Photo envoyée mais illisible.' } };
          s3.ok('Photo reçue, vignette créée et relue correctement.');
        } catch (err) {
          errors++;
          s3.ko(err.status === 413 ? 'Refusée : fichier trop gros pour le proxy.' : err.body?.error || `Échec (code ${err.status || 'réseau'}).`);
        }
        // 4. Gros fichiers à travers le proxy
        const sizes = [10, 100, ...($('#check-full').checked && data.settings.max_video_mb > 100 ? [data.settings.max_video_mb] : [])];
        const s4 = step('Envoi de gros fichiers (vidéos) jusqu’au serveur');
        let okUpTo = 0, failAt = null, failCode = 0;
        for (const mb of sizes) {
          if (mb > data.settings.max_video_mb && mb !== 10) break;
          try {
            const t0 = performance.now();
            const r = await xhrUpload('/api/admin/album/test-upload', new Blob([new Uint8Array(mb * 1024 * 1024)]), { 'Content-Type': 'application/octet-stream' },
              (k) => s4.info(`Envoi de ${mb} Mo… ${Math.round(k * 100)} %`));
            if (r.body.bytes !== mb * 1024 * 1024) throw { status: 0 };
            okUpTo = mb;
            s4.info(`${mb} Mo reçus en ${((performance.now() - t0) / 1000).toFixed(1).replace('.', ',')} s.`);
          } catch (err) { failAt = mb; failCode = err.status; break; }
        }
        if (failAt === null) s4.ok(`Fichiers de ${okUpTo} Mo acceptés de bout en bout.${okUpTo < data.settings.max_video_mb ? ` Cochez l’option pour tester ${data.settings.max_video_mb} Mo.` : ''}`);
        else if (failCode === 413) { s4.ko(`Le proxy refuse les fichiers de ${failAt} Mo${okUpTo ? ` (${okUpTo} Mo passent)` : ''} : augmentez « client_max_body_size » dans Nginx Proxy Manager (onglet Advanced du Proxy Host).`); errors++; }
        else { s4.ko(`L’envoi de ${failAt} Mo a échoué (code ${failCode || 'réseau'})${okUpTo ? ` ; ${okUpTo} Mo passent` : ''}. Délai trop court ou limite du proxy ?`); errors++; }
        // 5. Connexion sécurisée
        const s5 = step('Connexion sécurisée (https)');
        if (location.protocol === 'https:') s5.ok('Le site est servi en https.');
        else { s5.warn('Vous testez en http (adresse locale ?). Refaites le test depuis votre nom de domaine en https : c’est ce que les invités utiliseront.'); warnings++; }
        // 6. Nettoyage
        const s6 = step('Nettoyage');
        if (testId) { await call(`/admin/album/${testId}`, { method: 'DELETE' }); s6.ok('La photo de test a été supprimée.'); }
        else s6.ok('Rien à nettoyer.');
        const sum = step(errors ? 'Des problèmes sont à corriger avant le jour J' : warnings ? 'Tout fonctionne, avec des points d’attention' : 'Tout fonctionne : l’album est prêt');
        errors ? sum.ko() : warnings ? sum.warn() : sum.ok();
        data = await call('/admin/album');
      } catch (err) {
        step('Vérification interrompue').ko(err.message);
      } finally {
        checking = false;
        const list = $('#checks').innerHTML;
        render();
        $('#checks').innerHTML = list;
      }
    }

    A.view.onclick = async (e) => {
      const t = e.target, fig = t.closest('[data-id]'), id = fig && +fig.dataset.id;
      const it = id && data.items.find((x) => x.id === id);
      try {
        if (t.closest('#qr-print')) return printCards();
        if (t.closest('#check-run')) return runChecks();
        if (t.closest('[data-del-tests]')) {
          if (!(await confirmBox('Supprimer les envois de test ?', 'Les photos et vidéos marquées « Test » seront effacées du serveur.'))) return;
          const r = await call('/admin/album/tests', { method: 'DELETE' }); data = r; render(); toast(`${r.removed} envoi(s) de test supprimé(s)`);
        }
        if (t.closest('[data-approve-all]')) { data = await call('/admin/album/approve-all', { method: 'POST', body: {} }); render(); toast('Tout est validé'); }
        if (it && t.closest('[data-approve]')) { data = await call(`/admin/album/${id}`, { method: 'PUT', body: { approved: true } }); render(); }
        if (it && t.closest('[data-hide]')) { data = await call(`/admin/album/${id}`, { method: 'PUT', body: { hidden: !it.hidden } }); render(); }
        if (it && t.closest('[data-del]')) {
          if (!(await confirmBox('Supprimer définitivement ?', 'Le fichier sera effacé du serveur. Pour simplement le retirer de la galerie, utilisez « Masquer ».'))) return;
          data = await call(`/admin/album/${id}`, { method: 'DELETE' }); render(); toast('Supprimé');
        }
      } catch (err) { toast(err.message, 'error'); }
    };
    A.view.onchange = (e) => {
      if (e.target.name === 'album_filter') { filter = e.target.value; render(); }
      if (e.target.id === 'qr-pass') { $('#qr-pass-field').hidden = !e.target.checked; updateQr(); }
      if (e.target.name === 'schedule') $$('[data-sched]').forEach((el) => { el.hidden = el.dataset.sched !== e.target.value; });
    };
    A.view.oninput = (e) => { if (e.target.id === 'qr-pass-value') updateQr(); };
    A.view.onsubmit = async (e) => {
      if (e.target.id !== 'album-settings') return;
      e.preventDefault();
      const f = e.target;
      try {
        const custom = f.schedule.value === 'custom';
        if (custom && (!f.open_at.value || !f.close_at.value)) throw new Error('Indiquez la date d’ouverture et la date de fin des envois.');
        data = await call('/admin/album/settings', { method: 'PUT', body: {
          schedule: f.schedule.value,
          ...(custom ? { open_at: new Date(f.open_at.value).toISOString(), close_at: new Date(f.close_at.value).toISOString() } : {}),
          enabled: f.enabled.checked, upload_days: +f.upload_days.value, allow_video: f.allow_video.checked,
          max_video_mb: +f.max_video_mb.value, moderation: f.moderation.checked } });
        render(); toast('Réglages de l’album enregistrés');
      } catch (err) { toast(err.message, 'error'); }
    };
    render();
  }

  const reset = () => { A.view.onclick = A.view.onchange = A.view.oninput = A.view.onsubmit = null; };
  A.registerView('album', async () => { reset(); await albumView(); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-view]:not([data-view="album"])')) reset(); }, true);
})();
