/**
 * Administration — onglet « Style » : thèmes, couleurs, polices, CSS personnalisé
 * et ordre des blocs de la page d'accueil, avec aperçu en direct.
 */
'use strict';

(() => {
  const A = window.MMAdmin;
  const { esc } = window.MM;
  const { $, $$, call, toast, openModal, confirmBox } = A;

  /* ---------- Couleurs : contraste (WCAG) ---------- */
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const HEX = /^#[0-9a-f]{6}$/i;

  async function appearanceView() {
    const [data, content] = await Promise.all([call('/admin/appearance'), call('/admin/content')]);
    const { presets, fonts, font_roles: fontRoles, color_roles: colorRoles, sections: sectionDefs } = data;
    let customThemes = data.custom_themes;
    // Copie de travail : modifiée par le formulaire, enregistrée avec le bouton
    const cur = structuredClone(data.appearance);
    const fontById = Object.fromEntries(fonts.map((f) => [f.id, f]));
    const family = (id) => (fontById[id] ? `'${fontById[id].family}'` : 'inherit');
    const sectionLabel = Object.fromEntries(sectionDefs.map((s) => [s.id, s.label]));
    const samples = { couple: content.couple || 'Léa & Hugo' };

    const fontOptions = (selected) => {
      const cats = [...new Set(fonts.map((f) => f.cat))];
      return cats.map((cat) => `<optgroup label="${esc(cat)}">${fonts.filter((f) => f.cat === cat)
        .map((f) => `<option value="${esc(f.id)}" ${f.id === selected ? 'selected' : ''}>${esc(f.family)}</option>`).join('')}</optgroup>`).join('');
    };

    A.view.innerHTML = `
      <div class="page-head"><h1>Style du site</h1>
        <p class="muted small">Thème, couleurs, polices, CSS et ordre des blocs de la page d’accueil. L’aperçu se met à jour en direct ;
          le site change pour les invités après « Enregistrer ».</p></div>
      <form id="ap-form" class="content-form ap-layout" novalidate>
        <div class="ap-settings">
          <section class="panel">
            <h2>Thèmes</h2>
            <p class="muted small">Choisissez un point de départ, puis ajustez couleurs et polices ci-dessous.
              « Créer un thème » ajoute vos réglages à cette liste.</p>
            <div class="theme-grid" id="theme-grid"></div>
          </section>

          <section class="panel" id="fav-panel">
            <h2>Icône de l’onglet (favicon)</h2>
            <p class="muted small">Petite image affichée dans l’onglet du navigateur et dans les favoris. Image carrée conseillée
              (PNG de 512 × 512 px, ICO ou SVG, 1 Mo maximum). Elle est enregistrée dès l’envoi.</p>
            <div class="fav-row">
              <div class="fav-preview" aria-hidden="true">
                <span class="fav-tab"><img id="fav-img" src="/api/favicon" alt="" width="16" height="16"><span>Notre mariage</span></span>
                <img id="fav-big" src="/api/favicon" alt="" width="64" height="64">
              </div>
              <div class="fav-actions">
                <label class="btn btn-ghost btn-small fav-upload">Choisir une image…
                  <input type="file" id="fav-file" accept="image/png,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico,image/webp,image/jpeg"></label>
                <button type="button" class="btn btn-ghost btn-small" id="fav-reset" hidden>Revenir à l’icône par défaut</button>
                <p class="small muted" id="fav-status" role="status"></p>
              </div>
            </div>
          </section>

          <section class="panel">
            <h2>Couleurs</h2>
            <div class="ap-colors" id="ap-colors"></div>
            <p class="small ap-contrast" id="ap-contrast" role="status"></p>
          </section>

          <section class="panel">
            <h2>Polices</h2>
            <p class="muted small">Toutes les polices sont hébergées par votre serveur (aucun service extérieur).</p>
            <div id="ap-fonts"></div>
          </section>

          <section class="panel">
            <h2>Blocs de la page d’accueil</h2>
            <p class="muted small">Ordre d’affichage sur la page et dans le menu. Décochez un bloc pour le masquer.</p>
            <ol class="section-order" id="ap-sections"></ol>
          </section>

          <section class="panel">
            <h2>CSS personnalisé</h2>
            <p class="muted small">Ajouté après le style du thème, sur toutes les pages invités. Variables utilisables :
              <code>--bg</code>, <code>--bg-soft</code>, <code>--surface</code>, <code>--ink</code>, <code>--muted</code>, <code>--line</code>,
              <code>--accent</code>, <code>--accent-2</code>, <code>--font-couple</code>, <code>--font-titles</code>, <code>--font-body</code>…
              Exemple : <code>.couple { letter-spacing: .05em; }</code></p>
            <textarea name="css" class="code ap-css" rows="14" spellcheck="false" autocomplete="off"
              placeholder="/* Votre CSS */&#10;.section-title span { text-transform: uppercase; letter-spacing: .15em; }">${esc(cur.css)}</textarea>
            <p class="muted small"><span id="ap-css-count"></span> · Tabulation = 2 espaces (Échap puis Tab pour quitter le champ).</p>
          </section>
        </div>

        <section class="panel ap-preview-panel">
          <div class="ap-preview-head"><h2>Aperçu</h2>
            <div class="seg-radio ap-size" role="radiogroup" aria-label="Taille de l’aperçu">
              <label><input type="radio" name="ap_size" value="mobile" checked><span>Mobile</span></label>
              <label><input type="radio" name="ap_size" value="desktop"><span>Ordinateur</span></label>
            </div></div>
          <div class="ap-frame-wrap"><iframe id="ap-preview" src="/" title="Aperçu du site" loading="lazy"></iframe></div>
          <p class="muted small">L’ordre des blocs et le CSS sont appliqués à l’aperçu ; les liens fonctionnent normalement.</p>
        </section>

        <div class="savebar"><span class="muted small" id="ap-dirty"></span>
          <div class="actions"><button type="button" class="btn btn-ghost" id="ap-save-theme">Créer un thème…</button>
          <button class="btn btn-primary" type="submit">Enregistrer</button></div></div>
      </form>`;

    const form = $('#ap-form');
    const frame = $('#ap-preview');
    let dirty = false;
    const markDirty = () => { dirty = true; $('#ap-dirty').textContent = 'Modifications non enregistrées'; preview(); };

    /* ---------- Thèmes ---------- */
    function themeCard(t, custom) {
      const c = t.colors;
      const active = cur.theme === t.id;
      return `<div class="theme-card ${active ? 'active' : ''}">
        <button type="button" class="theme-pick" data-theme="${esc(t.id)}" aria-pressed="${active}">
          <span class="theme-swatch" data-bg="${esc(c.bg)}" data-ink="${esc(c.ink)}">
            <span class="theme-sample" data-font="${esc(t.fonts.couple)}">Aa</span>
            <span class="theme-dots"><i data-c="${esc(c.accent)}"></i><i data-c="${esc(c.accent_2)}"></i><i data-c="${esc(c.bg_soft)}"></i></span>
          </span>
          <span class="theme-name">${active ? '✓ ' : ''}${esc(t.name)}</span>
        </button>
        ${custom ? `<button type="button" class="icon-btn theme-del" data-del="${esc(t.id)}" aria-label="Supprimer le thème ${esc(t.name)}">🗑</button>` : ''}
      </div>`;
    }
    function drawThemes() {
      const grid = $('#theme-grid');
      grid.innerHTML = presets.map((t) => themeCard(t, false)).join('')
        + (customThemes.length ? `<p class="theme-sep small muted">Vos thèmes</p>` + customThemes.map((t) => themeCard(t, true)).join('') : '');
      // Couleurs et polices appliquées par script (compatible avec la politique de sécurité CSP)
      $$('.theme-swatch', grid).forEach((el) => { el.style.background = el.dataset.bg; el.style.color = el.dataset.ink; });
      $$('.theme-sample', grid).forEach((el) => { el.style.fontFamily = family(el.dataset.font); });
      $$('.theme-dots i', grid).forEach((el) => { el.style.background = el.dataset.c; });
    }
    $('#theme-grid').addEventListener('click', async (e) => {
      const del = e.target.closest('[data-del]');
      if (del) {
        if (!(await confirmBox('Supprimer ce thème ?', 'Le site garde son apparence actuelle ; seul le thème enregistré disparaît de la liste.'))) return;
        try {
          await call(`/admin/themes/${encodeURIComponent(del.dataset.del)}`, { method: 'DELETE' });
          customThemes = customThemes.filter((t) => t.id !== del.dataset.del);
          drawThemes();
          toast('Thème supprimé');
        } catch (err) { toast(err.message, 'error'); }
        return;
      }
      const pick = e.target.closest('[data-theme]');
      if (!pick) return;
      const t = [...presets, ...customThemes].find((x) => x.id === pick.dataset.theme);
      if (!t) return;
      cur.theme = t.id;
      cur.colors = { ...t.colors };
      cur.fonts = { ...t.fonts };
      if (t.css) { cur.css = t.css; form.elements.css.value = t.css; updateCssCount(); }
      drawThemes(); drawColors(); drawFonts();
      markDirty();
    });

    /* ---------- Couleurs ---------- */
    function drawColors() {
      $('#ap-colors').innerHTML = colorRoles.map((r) => `
        <div class="color-row" data-key="${esc(r.key)}">
          <input type="color" value="${esc(cur.colors[r.key])}" aria-label="${esc(r.label)}">
          <input class="hex" value="${esc(cur.colors[r.key])}" maxlength="7" aria-label="Code couleur : ${esc(r.label)}">
          <span class="color-label">${esc(r.label)}</span>
        </div>`).join('');
      checkContrast();
    }
    $('#ap-colors').addEventListener('input', (e) => {
      const row = e.target.closest('.color-row');
      if (!row) return;
      const v = e.target.value.trim();
      if (e.target.type === 'color') $('.hex', row).value = v;
      else if (HEX.test(v)) $('[type=color]', row).value = v;
      if (!HEX.test(v)) return;
      cur.colors[row.dataset.key] = v.toLowerCase();
      checkContrast();
      markDirty();
    });
    function checkContrast() {
      const c = cur.colors;
      const checks = [
        ['Texte principal sur le fond', c.ink, c.bg],
        ['Texte principal sur les cartes', c.ink, c.surface],
        ['Couleur principale (liens) sur le fond', c.accent, c.bg],
        ['Texte secondaire sur le fond', c.muted, c.bg],
      ].map(([label, a, b]) => ({ label, ratio: contrast(a, b) }));
      const weak = checks.filter((x) => x.ratio < 4.5);
      $('#ap-contrast').textContent = weak.length
        ? '⚠️ Lisibilité insuffisante : ' + weak.map((x) => `${x.label} (${x.ratio.toFixed(1)}:1, 4,5:1 conseillé)`).join(' ; ')
        : '✅ Contrastes suffisants pour une bonne lisibilité.';
      $('#ap-contrast').classList.toggle('warn', weak.length > 0);
    }

    /* ---------- Polices ---------- */
    function drawFonts() {
      $('#ap-fonts').innerHTML = fontRoles.map((r) => `
        <div class="font-row" data-role="${esc(r.key)}">
          <label class="field">${esc(r.label)}
            <select name="font_${esc(r.key)}">${fontOptions(cur.fonts[r.key])}</select></label>
          <div class="font-sample">${esc(samples[r.key] || r.sample)}</div>
        </div>`).join('');
      paintSamples();
    }
    function paintSamples() {
      $$('.font-row').forEach((row) => {
        const s = $('.font-sample', row);
        s.style.fontFamily = family(cur.fonts[row.dataset.role]);
        s.style.background = cur.colors.surface;
        s.style.color = row.dataset.role === 'titles' ? cur.colors.accent : cur.colors.ink;
      });
    }
    $('#ap-fonts').addEventListener('change', (e) => {
      const row = e.target.closest('.font-row');
      if (!row) return;
      cur.fonts[row.dataset.role] = e.target.value;
      paintSamples();
      markDirty();
    });

    /* ---------- Ordre des blocs ---------- */
    function drawSections() {
      const n = cur.sections.length;
      $('#ap-sections').innerHTML = cur.sections.map((s, i) => `
        <li class="section-item ${s.visible ? '' : 'off'}" data-i="${i}">
          <label class="section-check"><input type="checkbox" data-visible ${s.visible ? 'checked' : ''}>
            <span>${esc(sectionLabel[s.id] || s.id)}</span></label>
          <span class="section-moves">
            <button type="button" class="icon-btn" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter « ${esc(sectionLabel[s.id])} »">↑</button>
            <button type="button" class="icon-btn" data-move="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre « ${esc(sectionLabel[s.id])} »">↓</button>
          </span>
        </li>`).join('');
    }
    $('#ap-sections').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-move]');
      if (!btn) return;
      const i = +btn.closest('[data-i]').dataset.i;
      const j = i + +btn.dataset.move;
      if (j < 0 || j >= cur.sections.length) return;
      [cur.sections[i], cur.sections[j]] = [cur.sections[j], cur.sections[i]];
      drawSections();
      $(`[data-i="${j}"] [data-move="${btn.dataset.move}"]`)?.focus();
      markDirty();
    });
    $('#ap-sections').addEventListener('change', (e) => {
      if (!e.target.matches('[data-visible]')) return;
      const i = +e.target.closest('[data-i]').dataset.i;
      cur.sections[i].visible = e.target.checked;
      e.target.closest('li').classList.toggle('off', !e.target.checked);
      if (cur.sections[i].id === 'rsvp' && !e.target.checked) {
        toast('Formulaire de réponse masqué : les invités ne pourront plus répondre en ligne.', 'error');
      }
      markDirty();
    });

    /* ---------- CSS personnalisé ---------- */
    const cssBox = form.elements.css;
    const updateCssCount = () => { $('#ap-css-count').textContent = `${cssBox.value.length.toLocaleString('fr-FR')} / 50 000 caractères`; };
    let escPressed = false;
    cssBox.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { escPressed = true; return; }
      if (e.key === 'Tab' && !e.shiftKey && !escPressed) {
        e.preventDefault();
        cssBox.setRangeText('  ', cssBox.selectionStart, cssBox.selectionEnd, 'end');
        cssBox.dispatchEvent(new Event('input'));
      }
      escPressed = false;
    });
    let cssTimer = null;
    cssBox.addEventListener('input', () => {
      cur.css = cssBox.value;
      updateCssCount();
      dirty = true;
      $('#ap-dirty').textContent = 'Modifications non enregistrées';
      clearTimeout(cssTimer);
      cssTimer = setTimeout(preview, 300);
    });

    /* ---------- Aperçu en direct (même origine : on injecte le style dans la page) ---------- */
    function liveCss() {
      const c = cur.colors;
      const onAccent = contrast(c.accent, '#ffffff') >= contrast(c.accent, '#1c1b1a') ? '#ffffff' : '#1c1b1a';
      const dark = luminance(c.bg) < 0.2;
      return `:root{--bg:${c.bg};--bg-soft:${c.bg_soft};--surface:${c.surface};--ink:${c.ink};--muted:${c.muted};--line:${c.line};`
        + `--accent:${c.accent};--accent-raw:${c.accent};--accent-2:${c.accent_2};--on-accent:${onAccent};`
        + (dark ? '--ok:#7fd18b;--error:#ff9b93;--shadow:0 6px 24px rgba(0,0,0,.35);color-scheme:dark;' : '')
        + fontRoles.map((r) => `--font-${r.key}:${family(cur.fonts[r.key])}, serif;`).join('') + '}\n' + cur.css;
    }
    function preview() {
      let doc;
      try { doc = frame.contentDocument; } catch { return; }
      if (!doc || !doc.head) return;
      if (!doc.getElementById('ap-fonts-all')) {
        const link = doc.createElement('link');
        link.id = 'ap-fonts-all'; link.rel = 'stylesheet'; link.href = '/api/fonts.css';
        doc.head.append(link);
      }
      let style = doc.getElementById('ap-live');
      if (!style) { style = doc.createElement('style'); style.id = 'ap-live'; doc.head.append(style); }
      style.textContent = liveCss();
      // Ordre et affichage des blocs
      const main = doc.getElementById('contenu');
      const navList = doc.querySelector('.topnav ul');
      const jeux = doc.getElementById('nav-jeux');
      if (!main) return;
      const shown = [];
      cur.sections.forEach((s) => {
        const el = doc.getElementById(s.id);
        if (!el || el.parentElement !== main) return;
        main.append(el);
        el.toggleAttribute('data-off', !s.visible);
        const li = navList?.querySelector(`a[href="#${s.id}"]`)?.parentElement;
        if (li && jeux) { navList.insertBefore(li, jeux); li.toggleAttribute('data-off', !s.visible); }
        if (s.visible && !el.hidden) shown.push(el);
      });
      shown.forEach((el, i) => el.classList.toggle('section-soft', i % 2 === 1));
    }
    frame.addEventListener('load', () => setTimeout(preview, 50));
    form.addEventListener('change', (e) => {
      if (e.target.name === 'ap_size') $('.ap-frame-wrap').classList.toggle('desktop', e.target.value === 'desktop');
    });

    /* ---------- Enregistrement ---------- */
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = await call('/admin/appearance', { method: 'PUT', body: cur });
        Object.assign(cur, r.appearance);
        dirty = false;
        $('#ap-dirty').textContent = 'Enregistré ✓';
        toast('Style enregistré : le site est à jour.');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    $('#ap-save-theme').addEventListener('click', () => {
      openModal({
        title: 'Enregistrer comme thème',
        html: `<label class="field">Nom du thème<input name="theme_name" required maxlength="60" placeholder="Ex. Notre thème d’automne"></label>
          <p class="muted small">Le thème reprend les couleurs, les polices et le CSS personnalisé actuels.</p>`,
        submitLabel: 'Enregistrer le thème',
        onSubmit: async (body) => {
          const t = await call('/admin/themes', { method: 'POST', body: { ...cur, name: $('[name=theme_name]', body).value } });
          customThemes.push(t);
          cur.theme = t.id;
          drawThemes();
          // L'apparence active pointe désormais sur ce thème
          await call('/admin/appearance', { method: 'PUT', body: cur });
          dirty = false;
          $('#ap-dirty').textContent = 'Enregistré ✓';
          toast(`Thème « ${t.name} » enregistré et appliqué`);
        },
      });
    });

    window.addEventListener('beforeunload', (e) => { if (dirty && document.body.contains(form)) e.preventDefault(); });

    /* ---------- Favicon ---------- */
    const favStatus = $('#fav-status');
    const refreshFav = (custom) => {
      const src = `/api/favicon?v=${Date.now()}`;
      $('#fav-img').src = src; $('#fav-big').src = src;
      $('#fav-reset').hidden = !custom;
      // L'onglet de l'administration suit aussi le changement
      document.querySelectorAll('link[rel~="icon"]').forEach((l) => { l.href = src; });
      try { frame.contentDocument?.querySelectorAll('link[rel~="icon"]').forEach((l) => { l.href = src; }); } catch { /* aperçu pas encore chargé */ }
    };
    call('/admin/favicon').then((f) => { $('#fav-reset').hidden = !f.custom; favStatus.textContent = f.custom ? 'Icône personnalisée.' : 'Icône par défaut du site.'; }).catch(() => {});
    $('#fav-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 1024 * 1024) { toast('Image trop lourde : 1 Mo maximum.', 'error'); return; }
      favStatus.textContent = 'Envoi…';
      try {
        const type = file.type || (/\.ico$/i.test(file.name) ? 'image/x-icon' : /\.svg$/i.test(file.name) ? 'image/svg+xml' : 'application/octet-stream');
        const r = await fetch('/api/admin/favicon', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': type }, body: file });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        refreshFav(true); favStatus.textContent = 'Icône personnalisée.'; toast('Favicon mis à jour');
      } catch (err) { favStatus.textContent = ''; toast(err.message, 'error'); }
    });
    $('#fav-reset').addEventListener('click', async () => {
      try { await call('/admin/favicon', { method: 'DELETE' }); refreshFav(false); favStatus.textContent = 'Icône par défaut du site.'; toast('Icône par défaut rétablie'); }
      catch (err) { toast(err.message, 'error'); }
    });

    drawThemes();
    drawColors();
    drawFonts();
    drawSections();
    updateCssCount();
  }

  A.registerView('appearance', appearanceView);
})();
