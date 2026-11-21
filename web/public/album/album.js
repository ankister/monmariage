/**
 * Album photo partagé des invités : envoi (photos réduites dans le navigateur), galerie en direct,
 * visionneuse et diaporama pour l'écran de la salle.
 */
'use strict';

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS_NAME = 'album-prenom';
  let st = null, items = [], lastId = 0, pendingNew = [], viewIdx = -1;

  async function getJSON(url) {
    const r = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.access === 'required') { location.href = '/acces/?r=/album/'; throw new Error('accès'); }
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    return j;
  }
  const fmtDay = (iso) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* ---------- Avant l'ouverture : compte à rebours ---------- */
  function countdown() {
    const end = new Date(st.opens_at).getTime();
    const tick = () => {
      let s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      if (s === 0) { location.reload(); return; }
      const d = Math.floor(s / 86400); s -= d * 86400;
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60);
      $('#countdown').innerHTML = [[d, 'jours'], [h, 'heures'], [m, 'minutes']]
        .map(([n, l]) => `<div class="cd-box"><span class="cd-num">${String(n).padStart(2, '0')}</span><span class="cd-label">${l}</span></div>`).join('');
    };
    tick(); setInterval(tick, 30_000);
  }

  /* ---------- Préparation des fichiers ---------- */
  const isVideo = (f) => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
  function canvasBlob(source, w, h, max, quality) {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob((b) => ok({ blob: b, w: c.width, h: c.height }), 'image/jpeg', quality));
  }
  async function preparePhoto(file) {
    // GIF animé : envoyé tel quel
    if (/gif$/i.test(file.type)) return { kind: 'photo', main: file, thumb: null, w: 0, h: 0 };
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new Error('Format de photo non pris en charge par ce navigateur (essayez en JPEG).'); }
    const main = await canvasBlob(bmp, bmp.width, bmp.height, 3000, 0.88);
    const thumb = await canvasBlob(bmp, bmp.width, bmp.height, 480, 0.78);
    bmp.close?.();
    return { kind: 'photo', main: main.blob, thumb: thumb.blob, w: main.w, h: main.h };
  }
  function videoThumb(file) {
    return new Promise((ok) => {
      const v = document.createElement('video'), url = URL.createObjectURL(file);
      const done = (r) => { URL.revokeObjectURL(url); ok(r); };
      v.muted = true; v.playsInline = true; v.preload = 'metadata'; v.src = url;
      v.addEventListener('loadeddata', () => { v.currentTime = Math.min(1, (v.duration || 2) / 3); });
      v.addEventListener('seeked', async () => { try { const t = await canvasBlob(v, v.videoWidth, v.videoHeight, 480, 0.78); done({ ...t }); } catch { done(null); } }, { once: true });
      v.addEventListener('error', () => done(null));
      setTimeout(() => done(null), 8000);
    });
  }
  async function prepare(file) {
    if (isVideo(file)) {
      if (!st.allow_video) throw new Error('Les vidéos ne sont pas acceptées dans cet album.');
      if (file.size > st.max_video_mb * 1024 * 1024) throw new Error(`Vidéo trop lourde (${st.max_video_mb} Mo maximum).`);
      const t = await videoThumb(file);
      return { kind: 'video', main: file, thumb: t ? t.blob : null, w: t ? t.w : 0, h: t ? t.h : 0 };
    }
    return preparePhoto(file);
  }

  /* ---------- Envoi (2 fichiers à la fois, avec progression) ---------- */
  const queue = [];
  let running = 0;
  function upload(p, onProgress) {
    return new Promise((ok, ko) => {
      const thumb = p.thumb || new Blob([]);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/album/upload');
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-Kind', p.kind);
      xhr.setRequestHeader('X-Thumb-Length', String(thumb.size));
      xhr.setRequestHeader('X-Name', encodeURIComponent($('#uploader').value.trim()));
      xhr.setRequestHeader('X-Width', String(p.w || 0));
      xhr.setRequestHeader('X-Height', String(p.h || 0));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let j = {}; try { j = JSON.parse(xhr.responseText); } catch { /* réponse non JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) ok(j);
        else ko(new Error(j.error || (xhr.status === 413 ? 'Fichier trop lourd.' : `Erreur ${xhr.status}`)));
      };
      xhr.onerror = () => ko(new Error('Connexion perdue : réessayez.'));
      xhr.send(new Blob([thumb, p.main]));
    });
  }
  function addFiles(files) {
    for (const f of files) {
      const li = document.createElement('li');
      li.className = 'q-item';
      li.innerHTML = `<span class="q-name">${esc(f.name)}</span><span class="q-state">En attente…</span><span class="q-bar"><i></i></span>`;
      $('#queue').prepend(li);
      queue.push({ f, li });
    }
    pump();
  }
  function pump() {
    while (running < 2 && queue.length) {
      const { f, li } = queue.shift(); running++;
      const state = $('.q-state', li), bar = $('.q-bar i', li);
      (async () => {
        try {
          state.textContent = 'Préparation…';
          const p = await prepare(f);
          state.textContent = 'Envoi…';
          const r = await upload(p, (k) => { bar.style.width = `${Math.round(k * 100)}%`; state.textContent = `Envoi… ${Math.round(k * 100)} %`; });
          li.classList.add('ok'); bar.style.width = '100%';
          state.textContent = r.test ? 'Envoyé ✓ (test, invisible pour les invités)' : r.pending ? 'Envoyé ✓ (visible après validation des mariés)' : 'Envoyé ✓';
          refresh();
        } catch (err) {
          li.classList.add('ko'); state.textContent = err.message;
        } finally {
          running--; pump();
          if (!running && !queue.length) setTimeout(() => $$('.q-item.ok').forEach((x) => x.remove()), 6000);
        }
      })();
    }
  }
  const $$ = (s) => [...document.querySelectorAll(s)];

  /* ---------- Galerie ---------- */
  function tile(it, i) {
    const img = it.thumb || (it.kind === 'photo' ? it.src : '');
    return `<button type="button" class="tile ${it.kind}" data-i="${i}" aria-label="${it.kind === 'video' ? 'Vidéo' : 'Photo'}${it.by ? ` de ${esc(it.by)}` : ''}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async">` : '<span class="tile-ph">🎬</span>'}
      ${it.kind === 'video' ? '<span class="tile-play" aria-hidden="true">▶</span>' : ''}
      ${it.test ? '<span class="tile-test">Test</span>' : ''}
      ${it.by ? `<span class="tile-by">${esc(it.by)}</span>` : ''}
    </button>`;
  }
  function drawGrid() {
    $('#grid').innerHTML = items.map(tile).join('');
    $('#count').textContent = items.length ? `· ${items.length} souvenir${items.length > 1 ? 's' : ''}` : '';
    $('#empty').hidden = items.length > 0;
    $('#slideshow-btn').hidden = !items.some((i) => i.kind === 'photo');
  }
  async function refresh(showNow = true) {
    try {
      const r = await getJSON(`/api/album/items?since=${lastId}`);
      if (!r.items.length) return;
      lastId = Math.max(lastId, ...r.items.map((x) => x.id));
      if (showNow || !items.length || window.scrollY < 200) { items = [...r.items, ...pendingNew, ...items]; pendingNew = []; drawGrid(); $('#new-items').hidden = true; }
      else { pendingNew = [...r.items, ...pendingNew]; $('#new-items').hidden = false; $('#new-items').textContent = `↑ ${pendingNew.length} nouveau${pendingNew.length > 1 ? 'x' : ''} souvenir${pendingNew.length > 1 ? 's' : ''}`; }
      if (slideOn) slideQueue.unshift(...r.items.filter((x) => x.kind === 'photo'));
    } catch { /* réseau : on réessaiera */ }
  }

  /* ---------- Visionneuse ---------- */
  function show(i) {
    viewIdx = (i + items.length) % items.length;
    const it = items[viewIdx];
    $('#viewer-media').innerHTML = it.kind === 'video'
      ? `<video src="${esc(it.src)}" controls autoplay playsinline ${it.thumb ? `poster="${esc(it.thumb)}"` : ''}></video>`
      : `<img src="${esc(it.src)}" alt="Photo${it.by ? ` de ${esc(it.by)}` : ''}">`;
    $('#viewer-info').textContent = `${it.by ? `${it.by} · ` : ''}${viewIdx + 1} / ${items.length}`;
    $('#viewer-dl').href = `${it.src}?dl=1`;
    if (!$('#viewer').open) $('#viewer').showModal();
  }
  function setupViewer() {
    $('#grid').addEventListener('click', (e) => { const t = e.target.closest('[data-i]'); if (t) show(+t.dataset.i); });
    $('#viewer-prev').addEventListener('click', () => show(viewIdx - 1));
    $('#viewer-next').addEventListener('click', () => show(viewIdx + 1));
    $('#viewer-close').addEventListener('click', () => $('#viewer').close());
    $('#viewer').addEventListener('close', () => { $('#viewer-media').innerHTML = ''; });
    $('#viewer').addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') show(viewIdx - 1); if (e.key === 'ArrowRight') show(viewIdx + 1); });
    let x0 = null;
    $('#viewer').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    $('#viewer').addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(viewIdx + (dx < 0 ? 1 : -1)); x0 = null; });
  }

  /* ---------- Diaporama ---------- */
  let slideOn = false, slideTimer = null, slideQueue = [], slidePos = 0, front = 'a';
  function nextSlide() {
    const photos = items.filter((x) => x.kind === 'photo');
    if (!photos.length) return;
    const it = slideQueue.shift() || photos[slidePos++ % photos.length];
    const img = new Image();
    img.onload = () => {
      const el = $(`#slide-${front === 'a' ? 'b' : 'a'}`), old = $(`#slide-${front}`);
      el.style.backgroundImage = `url("${it.src}")`;
      el.classList.add('on'); old.classList.remove('on');
      front = front === 'a' ? 'b' : 'a';
      $('#slide-caption').textContent = it.by ? `Photo de ${it.by}` : '';
    };
    img.src = it.src;
  }
  function slideshow(on) {
    slideOn = on;
    $('#slideshow').hidden = !on;
    clearInterval(slideTimer);
    if (on) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      nextSlide(); slideTimer = setInterval(nextSlide, 6000);
    } else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  const route = () => slideshow(location.hash === '#diaporama' && st.open);

  /* ---------- Démarrage ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    try { st = await getJSON('/api/album/status'); } catch (err) { $('#lead').textContent = err.message; return; }
    if (st.couple) { $('#couple').textContent = st.couple; document.title = `Album de ${st.couple}`; }
    if (!st.enabled) { $('#lead').textContent = 'L’album photo n’est pas disponible.'; return; }
    if (st.preview) {
      $('#preview').hidden = false;
      $('#preview').textContent = `Aperçu réservé aux mariés : l’album ouvrira aux invités le ${st.opens_at ? fmtDay(st.opens_at) : 'jour du mariage'}. Vos envois pendant l’aperçu portent l’étiquette « Test » : ils ne seront jamais montrés aux invités (supprimez-les ensuite dans l’administration).`;
    }
    if (!st.open) {
      $('#closed').hidden = false;
      $('#opens').textContent = st.opens_at ? `Rendez-vous le ${fmtDay(st.opens_at)}.` : 'La date du mariage n’est pas encore fixée.';
      if (st.opens_at) countdown();
      return;
    }
    $('#open').hidden = false;
    $('#upload-box').hidden = !st.upload_open;
    $('#ended').hidden = st.upload_open;
    $('#drop-help').textContent = st.allow_video
      ? `Photos et vidéos (${st.max_video_mb} Mo maximum par vidéo). Les photos sont allégées avant l’envoi.`
      : 'Photos uniquement. Elles sont allégées avant l’envoi.';
    $('#files').accept = st.allow_video ? 'image/*,video/*' : 'image/*';
    try { $('#uploader').value = localStorage.getItem(LS_NAME) || ''; } catch { /* rien */ }
    $('#uploader').addEventListener('change', () => { try { localStorage.setItem(LS_NAME, $('#uploader').value.trim()); } catch { /* rien */ } });
    $('#files').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
    const drop = $('#drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
    $('#new-items').addEventListener('click', () => { items = [...pendingNew, ...items]; pendingNew = []; drawGrid(); $('#new-items').hidden = true; });
    setupViewer();
    $('#slide-exit').addEventListener('click', () => { location.hash = ''; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && slideOn) location.hash = ''; });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && slideOn) location.hash = ''; });
    addEventListener('hashchange', route);
    await refresh(true);
    drawGrid();
    route();
    setInterval(() => refresh(false), 20_000);
  });
})();
