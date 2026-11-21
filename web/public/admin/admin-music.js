/**
 * Administration — onglet « Musiques » : chansons proposées par les invités,
 * connexion au compte Spotify des mariés et ajout à une playlist.
 */
'use strict';

(() => {
  const A = window.MMAdmin;
  const { esc } = window.MM;
  const { $, $$, call, toast, openModal, confirmBox } = A;
  const fmt = (d) => (d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');
  const open = new Set(); // extraits affichés

  async function musicView() {
    let data = await call('/admin/music');
    // Retour de l'autorisation Spotify
    const back = new URLSearchParams(location.search).get('spotify');
    if (back) {
      history.replaceState(null, '', location.pathname + location.hash);
      const msg = { ok: 'Spotify est connecté.', refus: 'Connexion à Spotify annulée.', expire: 'La demande a expiré : relancez la connexion.', erreur: 'Spotify a refusé la connexion : vérifiez le Client Secret et l’adresse de redirection.' }[back];
      if (msg) toast(msg, back === 'ok' ? undefined : 'error');
    }

    const render = () => {
      const { songs, spotify: sp } = data;
      const added = songs.filter((s) => s.added_at).length;
      const linked = songs.filter((s) => s.spotify_id && !s.added_at).length;
      const missing = songs.filter((s) => !s.spotify_id).length;
      const ready = sp.connected && sp.playlist;

      A.view.innerHTML = `
        <div class="page-head row"><h1>Musiques</h1>
          ${ready && linked ? `<button type="button" class="btn btn-primary btn-small" data-add-all>➕ Tout ajouter à la playlist (${linked})</button>` : ''}</div>
        <div class="stats">
          <div class="stat"><span class="stat-num">${songs.length}</span><span class="stat-label">Chansons proposées</span></div>
          <div class="stat stat-ok"><span class="stat-num">${added}</span><span class="stat-label">Dans la playlist</span></div>
          <div class="stat stat-wait"><span class="stat-num">${missing}</span><span class="stat-label">Sans lien Spotify</span></div>
        </div>
        ${spotifyPanel(sp)}
        <section class="panel">
          <h2>Propositions des invités</h2>
          ${songs.length ? `<ul class="music-list">${songs.map((s) => songHtml(s, sp)).join('')}</ul>`
            : '<p class="muted">Aucune chanson proposée pour l’instant. Les invités peuvent en suggérer jusqu’à 3 dans le formulaire de réponse.</p>'}
        </section>`;
    };

    function spotifyPanel(sp) {
      if (sp.connected) {
        return `<section class="panel spotify-panel">
          <h2><span class="spotify-dot" aria-hidden="true"></span> Spotify</h2>
          <p>Connecté au compte <strong>${esc(sp.user || 'Spotify')}</strong>. Les invités peuvent chercher un titre directement dans le formulaire.</p>
          ${sp.playlist
            ? `<p>Playlist : <a href="${esc(sp.playlist.url)}" target="_blank" rel="noopener">${esc(sp.playlist.name || 'Playlist')} ↗</a>
                <button type="button" class="btn btn-ghost btn-small" data-change-playlist>Changer</button></p>`
            : playlistForm()}
          <div class="actions"><button type="button" class="btn btn-ghost btn-small" data-disconnect>Déconnecter Spotify</button></div>
        </section>`;
      }
      return `<details class="panel spotify-panel" open>
        <summary><h2><span class="spotify-dot off" aria-hidden="true"></span> Connecter Spotify (facultatif)</h2></summary>
        <p class="small muted">Sans connexion, les invités collent un lien Spotify ou écrivent le titre, et vous écoutez les extraits ici.
          La connexion ajoute la recherche de titres pour les invités et l’ajout direct à votre playlist.</p>
        <ol class="spotify-steps">
          <li>Sur <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a>, créez une application
            (cochez « Web API »). Spotify exige que son propriétaire ait un abonnement <strong>Premium</strong>.</li>
          <li>Dans ses réglages, ajoutez cette adresse de redirection :
            <span class="copy-line"><input readonly value="${esc(sp.redirect_uri)}" aria-label="Adresse de redirection"><button type="button" class="btn btn-ghost btn-small" data-copy>Copier</button></span>
            <small class="muted">Spotify exige une adresse en <strong>https</strong> : utilisez celle de votre nom de domaine.</small></li>
          <li>Copiez le <strong>Client ID</strong> et le <strong>Client Secret</strong> de l’application ici :</li>
        </ol>
        <form class="grid-2" id="sp-form">
          <label class="field">Client ID<input name="client_id" value="${esc(sp.client_id)}" maxlength="32" autocomplete="off" spellcheck="false" required></label>
          <label class="field">Client Secret<input name="client_secret" type="password" maxlength="32" autocomplete="off" placeholder="${sp.configured ? '•••••••• (enregistré)' : ''}" ${sp.configured ? '' : 'required'}></label>
          <div class="actions"><button class="btn btn-ghost" type="submit">Enregistrer</button>
            ${sp.configured ? '<button type="button" class="btn btn-primary" data-login>Se connecter à Spotify</button>' : ''}</div>
        </form>
        ${sp.configured ? '<p class="small muted">4. « Se connecter à Spotify » ouvre la page d’autorisation de Spotify, puis vous ramène ici.</p>' : ''}
      </details>`;
    }
    const playlistForm = () => `<form class="playlist-form" id="pl-form">
        <p class="small">Choisissez la playlist où ajouter les chansons :</p>
        <div class="actions"><button type="button" class="btn btn-primary btn-small" data-create-playlist>Créer « Mariage – propositions des invités »</button></div>
        <label class="field">…ou collez le lien d’une de vos playlists
          <span class="copy-line"><input name="url" placeholder="https://open.spotify.com/playlist/…" autocomplete="off"><button class="btn btn-ghost btn-small" type="submit">Utiliser</button></span></label>
      </form>`;

    function songHtml(s, sp) {
      const who = s.guest_current || s.guest_name;
      return `<li class="music-item ${s.added_at ? 'done' : ''}" data-id="${s.id}">
        <div class="music-row">
          ${s.image ? `<img src="${esc(s.image)}" alt="" width="52" height="52" loading="lazy">` : '<span class="song-cover" aria-hidden="true">♪</span>'}
          <span class="music-txt"><strong>${esc(s.title)}</strong>
            <span>${esc(s.artist || (s.spotify_id ? '' : 'Artiste non précisé'))}</span>
            <small class="muted">${who ? `Proposée par ${esc(who)}` : 'Proposée'} · ${esc(fmt(s.created_at))}</small></span>
          <span class="music-actions">
            ${s.added_at ? '<span class="pill pill-ok">✓ Dans la playlist</span>' : ''}
            ${s.spotify_id ? `<button type="button" class="icon-btn" data-play aria-expanded="${open.has(s.id)}" aria-label="${open.has(s.id) ? 'Masquer' : 'Écouter'} l’extrait">${open.has(s.id) ? '■' : '▶'}</button>` : ''}
            ${!s.added_at && s.spotify_id && sp.connected && sp.playlist ? '<button type="button" class="btn btn-primary btn-small" data-add>➕ Playlist</button>' : ''}
            ${!s.spotify_id ? '<button type="button" class="btn btn-ghost btn-small" data-find>🔎 Trouver sur Spotify</button>' : ''}
            <button type="button" class="icon-btn" data-del aria-label="Supprimer la proposition">🗑</button>
          </span>
        </div>
        ${open.has(s.id) && s.spotify_id ? `<iframe class="song-player" title="Extrait : ${esc(s.title)}" src="https://open.spotify.com/embed/track/${esc(s.spotify_id)}?utm_source=generator" height="80" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>` : ''}
      </li>`;
    }

    /** Associer une proposition sans lien à un morceau Spotify. */
    function findForm(s) {
      const sp = data.spotify;
      openModal({
        title: 'Trouver sur Spotify',
        html: `<p class="small">Proposition : <strong>${esc(s.title)}</strong>${s.artist ? ` — ${esc(s.artist)}` : ''}${s.guest_name ? ` (${esc(s.guest_name)})` : ''}</p>
          ${sp.connected ? `<label class="field">Rechercher<input name="q" value="${esc([s.title, s.artist].filter(Boolean).join(' '))}" autocomplete="off"></label>
            <ul class="music-search" data-results><li class="muted small">Recherche…</li></ul>` : ''}
          <label class="field">${sp.connected ? '…ou collez' : 'Collez'} le lien du titre
            <input name="url" placeholder="https://open.spotify.com/track/…" autocomplete="off">
            <small class="help"><a href="https://open.spotify.com/search/${encodeURIComponent([s.title, s.artist].filter(Boolean).join(' '))}" target="_blank" rel="noopener">Chercher sur open.spotify.com ↗</a>,
              puis Partager → Copier le lien du titre.</small></label>`,
        submitLabel: 'Associer ce lien',
        onSubmit: async (body) => {
          const url = $('[name=url]', body).value.trim();
          if (!url) throw new Error('Collez un lien ou choisissez un titre dans la liste.');
          data = await call(`/admin/music/${s.id}`, { method: 'PUT', body: { url } });
          render(); toast('Titre associé');
        },
      });
      if (!sp.connected) return;
      const body = $('#modal-body'), ul = $('[data-results]', body), input = $('[name=q]', body);
      let timer = null, results = [];
      const run = async () => {
        try {
          results = await call(`/admin/music/search?q=${encodeURIComponent(input.value)}`);
          ul.innerHTML = results.length ? results.map((t, i) => `<li><button type="button" data-pick="${i}">
              ${t.image ? `<img src="${esc(t.image)}" alt="" width="40" height="40">` : '<span class="song-cover">♪</span>'}
              <span><strong>${esc(t.title)}</strong><small>${esc(t.artist)}</small></span></button></li>`).join('')
            : '<li class="muted small">Aucun résultat.</li>';
        } catch (err) { ul.innerHTML = `<li class="small">${esc(err.message)}</li>`; }
      };
      input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 300); });
      ul.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-pick]'); if (!b) return;
        const t = results[+b.dataset.pick];
        try {
          data = await call(`/admin/music/${s.id}`, { method: 'PUT', body: { spotify_id: t.id, title: t.title, artist: t.artist, image: t.image } });
          $('#modal').close(); render(); toast('Titre associé');
        } catch (err) { toast(err.message, 'error'); }
      });
      run();
    }

    A.view.onclick = async (e) => {
      const t = e.target, item = t.closest('[data-id]'), s = item && data.songs.find((x) => x.id === +item.dataset.id);
      try {
        if (t.closest('[data-copy]')) {
          const inp = t.closest('.copy-line').querySelector('input');
          try { await navigator.clipboard.writeText(inp.value); toast('Adresse copiée'); } catch { inp.select(); }
        } else if (t.closest('[data-login]')) {
          const r = await call('/admin/music/spotify/login', { method: 'POST', body: {} });
          location.href = r.url;
        } else if (t.closest('[data-disconnect]')) {
          if (!(await confirmBox('Déconnecter Spotify ?', 'Les propositions sont conservées. Les invités ne pourront plus chercher de titre, seulement coller un lien.'))) return;
          data = await call('/admin/music/spotify/disconnect', { method: 'POST', body: {} }); render();
        } else if (t.closest('[data-create-playlist]')) {
          data = await call('/admin/music/playlist', { method: 'POST', body: { name: 'Mariage – propositions des invités' } }); render(); toast('Playlist créée');
        } else if (t.closest('[data-change-playlist]')) {
          data.spotify.playlist = null; render();
        } else if (t.closest('[data-add-all]')) {
          const r = await call('/admin/music/add-all', { method: 'POST', body: {} }); data = r; render(); toast(`${r.added} chanson(s) ajoutée(s) à la playlist`);
        } else if (s && t.closest('[data-play]')) {
          open.has(s.id) ? open.delete(s.id) : open.add(s.id); render();
        } else if (s && t.closest('[data-add]')) {
          data = await call(`/admin/music/${s.id}/add`, { method: 'POST', body: {} }); render(); toast('Ajoutée à la playlist');
        } else if (s && t.closest('[data-find]')) {
          findForm(s);
        } else if (s && t.closest('[data-del]')) {
          if (!(await confirmBox('Supprimer cette proposition ?', `« ${s.title} » sera retirée de la liste (pas de la playlist Spotify).`))) return;
          data = await call(`/admin/music/${s.id}`, { method: 'DELETE' }); render();
        }
      } catch (err) { toast(err.message, 'error'); }
    };
    A.view.onsubmit = async (e) => {
      e.preventDefault();
      try {
        if (e.target.id === 'sp-form') {
          const f = e.target;
          data = await call('/admin/music/spotify', { method: 'PUT', body: { client_id: f.client_id.value.trim(), client_secret: f.client_secret.value.trim() } });
          render(); toast('Identifiants enregistrés : connectez-vous à Spotify');
        } else if (e.target.id === 'pl-form') {
          data = await call('/admin/music/playlist', { method: 'POST', body: { url: e.target.url.value.trim() } }); render(); toast('Playlist choisie');
        }
      } catch (err) { toast(err.message, 'error'); }
    };
    render();
  }

  const reset = () => { A.view.onclick = null; A.view.onsubmit = null; };
  A.registerView('music', async () => { reset(); await musicView(); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-view]:not([data-view="music"])')) reset(); }, true);
})();
