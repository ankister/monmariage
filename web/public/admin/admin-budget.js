/**
 * Administration — onglet « Budget » : budget total, catégories et dépenses,
 * paiements et échéances, recettes des chambres déduites du lieu de réception, export Excel.
 */
'use strict';

(() => {
  const A = window.MMAdmin;
  const { esc } = window.MM;
  const { $, $$, call, toast, openModal, confirmBox } = A;

  const nf = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
  const eur = (n) => (n === null || n === undefined ? '—' : nf.format(n));
  const num = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
  const fmtDate = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const today = () => new Date().toISOString().slice(0, 10);
  const open = new Set(); // catégories dépliées (conservées entre deux rafraîchissements)

  async function budgetView() {
    let data = await call('/admin/budget');

    const render = () => {
      const { totals: t, rooms: r, settings: s, categories: cats } = data;
      const budgetPct = t.budget ? Math.min(100, Math.round((t.net / t.budget) * 100)) : 0;
      const over = t.remaining !== null && t.remaining < 0;
      const upcoming = cats.flatMap((c) => c.items.filter((i) => i.due_date && i.to_pay > 0).map((i) => ({ ...i, cat: c })))
        .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5);

      A.view.innerHTML = `
        <div class="page-head row"><h1>Budget</h1>
          <a class="btn btn-ghost btn-small" href="/api/admin/budget/export.xlsx" download>⬇ Exporter (Excel)</a></div>

        <div class="stats budget-stats">
          <button type="button" class="stat" data-edit-total>
            <span class="stat-num stat-money">${t.budget === null ? '—' : eur(t.budget)}</span>
            <span class="stat-label">Budget prévu ✏️</span>
            <span class="stat-sub">${t.budget === null ? 'Toucher pour le fixer' : 'Toucher pour modifier'}</span></button>
          <div class="stat ${over ? 'stat-no' : 'stat-ok'}">
            <span class="stat-num stat-money">${t.remaining === null ? '—' : eur(t.remaining)}</span>
            <span class="stat-label">${over ? 'Dépassement' : 'Reste disponible'}</span>
            <span class="stat-sub">budget − coût net</span></div>
          <div class="stat"><span class="stat-num stat-money">${eur(t.net)}</span><span class="stat-label">Coût net</span>
            <span class="stat-sub">${eur(t.engaged)} de dépenses${t.rooms_deduction ? ` − ${eur(t.rooms_deduction)} de chambres` : ''}</span></div>
          <div class="stat stat-wait"><span class="stat-num stat-money">${eur(t.to_pay)}</span><span class="stat-label">Reste à payer</span>
            <span class="stat-sub">${eur(t.paid)} déjà payés</span></div>
        </div>
        ${t.budget ? `<div class="panel budget-gauge"><div class="progress ${over ? 'full' : ''}"><span data-w="${budgetPct}"></span></div>
          <p class="small muted">${budgetPct} % du budget engagé (coût net)</p></div>` : ''}

        <section class="panel">
          <h2>🛏️ Chambres sur place</h2>
          <p class="small">Les chambres payées par les invités viennent en déduction du <strong>${esc(cats.find((c) => c.is_venue)?.name || 'lieu de réception')}</strong>.</p>
          <div class="budget-rooms">
            <div><strong>${eur(r.confirmed_total)}</strong><span class="small muted">${r.confirmed_count} réservation(s) validée(s)</span></div>
            <div><strong>${eur(r.pending_total)}</strong><span class="small muted">${r.pending_count} en attente</span></div>
            <div><strong>− ${eur(r.counted)}</strong><span class="small muted">déduits</span></div>
          </div>
          ${r.missing_price ? `<p class="small warn-text">⚠️ ${r.missing_price} réservation(s) sur une chambre sans prix : fixez-le dans Chambres → Chambres & prix.</p>` : ''}
          <label class="switch"><input type="checkbox" data-setting="deduct_rooms" ${s.deduct_rooms ? 'checked' : ''}><span class="switch-ui" aria-hidden="true"></span>
            <span>Déduire les chambres du lieu de réception</span></label>
          <label class="switch"><input type="checkbox" data-setting="include_pending" ${s.include_pending ? 'checked' : ''} ${s.deduct_rooms ? '' : 'disabled'}><span class="switch-ui" aria-hidden="true"></span>
            <span>Compter aussi les réservations en attente</span></label>
        </section>

        ${upcoming.length ? `<section class="panel"><h2>📅 Prochaines échéances</h2><ul class="budget-due">
          ${upcoming.map((i) => `<li class="${i.due_date < today() ? 'late' : ''}"><span>${esc(fmtDate(i.due_date))}</span>
            <span>${esc(i.cat.icon)} ${esc(i.label)}${i.supplier ? ` · ${esc(i.supplier)}` : ''}</span><strong>${eur(i.to_pay)}</strong></li>`).join('')}
        </ul></section>` : ''}

        <div class="page-head row budget-cats-head"><h2>Dépenses par catégorie</h2>
          <button type="button" class="btn btn-ghost btn-small" data-add-cat>+ Catégorie</button></div>
        <div class="budget-cats">${cats.map((c, i) => catHtml(c, i, cats.length, t)).join('')}</div>
        <p class="small muted">Engagé = montant réel (devis signé, facture) s’il est saisi, sinon montant prévu.
          Repères de répartition indicatifs, relevés dans des guides budget mariage 2025-2026.</p>`;

      $$('.budget-gauge [data-w]').forEach((el) => { el.style.width = el.dataset.w + '%'; });
    };

    function catHtml(c, i, n, t) {
      const share = t.engaged ? Math.round((c.engaged / t.engaged) * 100) : 0;
      const roomsLine = c.is_venue && t.rooms_deduction
        ? `<div class="budget-venue-net"><span>Chambres sur place</span><strong>− ${eur(t.rooms_deduction)}</strong></div>
           <div class="budget-venue-net total"><span>Coût net du lieu</span><strong>${eur(t.venue_net)}</strong></div>` : '';
      return `
        <details class="panel budget-cat" data-cat="${c.id}" ${open.has(c.id) ? 'open' : ''}>
          <summary>
            <span class="budget-cat-name">${esc(c.icon)} ${esc(c.name)}${c.is_venue ? ' <span class="pill pill-ok">lieu</span>' : ''}</span>
            <span class="budget-cat-sum"><strong>${eur(c.engaged)}</strong>
              <span class="small muted">${share} %${c.ref ? ` · repère ${esc(c.ref)}` : ''}${c.to_pay ? ` · reste ${eur(c.to_pay)}` : ''}</span></span>
          </summary>
          <div class="budget-items">
            ${c.items.length ? c.items.map(itemHtml).join('') : '<p class="small muted">Aucune dépense pour l’instant.</p>'}
            ${roomsLine}
          </div>
          <div class="budget-cat-actions">
            <button type="button" class="btn btn-primary btn-small" data-add-item="${c.id}">+ Dépense</button>
            <span class="spacer"></span>
            <button type="button" class="icon-btn" data-move-cat="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter la catégorie">↑</button>
            <button type="button" class="icon-btn" data-move-cat="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Descendre la catégorie">↓</button>
            <button type="button" class="icon-btn" data-edit-cat="${c.id}" aria-label="Modifier la catégorie">✏️</button>
          </div>
        </details>`;
    }

    function itemHtml(it) {
      const late = it.due_date && it.to_pay > 0 && it.due_date < today();
      const state = it.engaged && it.paid >= it.engaged ? '<span class="pill pill-ok">payé</span>'
        : it.paid ? '<span class="pill pill-wait">acompte</span>' : '';
      return `
        <button type="button" class="budget-item" data-item="${it.id}">
          <span class="budget-item-main"><strong>${esc(it.label)}</strong> ${state}
            <span class="small muted">${[it.supplier, it.due_date && it.to_pay ? `échéance ${fmtDate(it.due_date)}${late ? ' ⚠️' : ''}` : ''].filter(Boolean).map(esc).join(' · ')}</span></span>
          <span class="budget-item-nums">
            <span><small>Prévu</small>${eur(it.planned)}</span>
            <span><small>Réel</small>${eur(it.actual)}</span>
            <span><small>Payé</small>${eur(it.paid)}</span>
            <span><small>Reste</small><b>${eur(it.to_pay)}</b></span>
          </span>
        </button>`;
    }

    /* ---------- Formulaires ---------- */
    const moneyField = (name, label, v, help = '') => `<label class="field">${label}
      <input name="${name}" inputmode="decimal" value="${esc(num(v))}" placeholder="0" autocomplete="off">${help ? `<small class="help">${help}</small>` : ''}</label>`;

    function itemForm(it = {}, categoryId) {
      const cats = data.categories;
      openModal({
        title: it.id ? 'Modifier la dépense' : 'Nouvelle dépense',
        html: `
          <label class="field">Dépense<input name="label" required maxlength="120" value="${esc(it.label || '')}" placeholder="Ex. Location de la salle"></label>
          <label class="field">Catégorie<select name="category_id">${cats.map((c) =>
            `<option value="${c.id}" ${c.id === (it.category_id || categoryId) ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field">Prestataire<input name="supplier" maxlength="120" value="${esc(it.supplier || '')}" placeholder="Nom, téléphone…"></label>
          <div class="grid-2">
            ${moneyField('planned', 'Prévu (€)', it.planned, 'Estimation')}
            ${moneyField('actual', 'Réel (€)', it.actual, 'Devis signé ou facture')}
          </div>
          <div class="grid-2">
            ${moneyField('paid', 'Déjà payé (€)', it.paid, 'Acomptes compris')}
            <label class="field">Prochaine échéance<input type="date" name="due_date" value="${esc(it.due_date || '')}"></label>
          </div>
          <label class="field">Notes<textarea name="notes" rows="3" maxlength="1000">${esc(it.notes || '')}</textarea></label>`,
        onSubmit: async (body) => {
          const v = (n) => $(`[name=${n}]`, body).value;
          const payload = {
            label: v('label'), category_id: +v('category_id'), supplier: v('supplier'),
            planned: v('planned'), actual: v('actual'), paid: v('paid'), due_date: v('due_date'), notes: v('notes'),
          };
          data = await call(it.id ? `/admin/budget/items/${it.id}` : '/admin/budget/items', { method: it.id ? 'PUT' : 'POST', body: payload });
          open.add(payload.category_id);
          render();
          toast(it.id ? 'Dépense mise à jour' : 'Dépense ajoutée');
        },
        onDelete: it.id ? async () => {
          data = await call(`/admin/budget/items/${it.id}`, { method: 'DELETE' });
          render();
          toast('Dépense supprimée');
        } : null,
        deleteConfirm: 'La dépense sera supprimée du budget.',
      });
    }

    function catForm(c = {}) {
      openModal({
        title: c.id ? 'Modifier la catégorie' : 'Nouvelle catégorie',
        html: `
          <div class="grid-2 budget-cat-form">
            <label class="field">Icône<input name="icon" maxlength="8" value="${esc(c.icon || '')}" placeholder="🎁"></label>
            <label class="field">Nom<input name="name" required maxlength="80" value="${esc(c.name || '')}" placeholder="Ex. Cadeaux invités"></label>
          </div>
          <label class="field">Repère de répartition (facultatif)<input name="ref" maxlength="30" value="${esc(c.ref || '')}" placeholder="Ex. 5–8 %"></label>
          ${c.id ? `<label class="switch"><input type="checkbox" name="is_venue" ${c.is_venue ? 'checked' : ''} ${c.is_venue ? 'disabled' : ''}>
            <span class="switch-ui" aria-hidden="true"></span><span>Lieu de réception (les chambres sont déduites de cette catégorie)</span></label>` : ''}`,
        onSubmit: async (body) => {
          const payload = { icon: $('[name=icon]', body).value, name: $('[name=name]', body).value, ref: $('[name=ref]', body).value };
          const venue = $('[name=is_venue]', body);
          if (venue && venue.checked && !c.is_venue) payload.is_venue = true;
          data = await call(c.id ? `/admin/budget/categories/${c.id}` : '/admin/budget/categories', { method: c.id ? 'PUT' : 'POST', body: payload });
          render();
          toast(c.id ? 'Catégorie mise à jour' : 'Catégorie ajoutée');
        },
        onDelete: c.id ? async () => {
          data = await call(`/admin/budget/categories/${c.id}`, { method: 'DELETE' });
          render();
          toast('Catégorie supprimée');
        } : null,
        deleteConfirm: c.items?.length ? `Ses ${c.items.length} dépense(s) seront aussi supprimées.` : 'La catégorie est vide.',
      });
    }

    /* ---------- Événements ---------- */
    A.view.onclick = async (e) => {
      const tgt = e.target;
      if (tgt.closest('[data-edit-total]')) {
        openModal({
          title: 'Budget prévu',
          html: `${moneyField('total', 'Budget total du mariage (€)', data.settings.total,
            'Montant que vous vous fixez. Les guides relevaient en 2025-2026 un coût moyen d’environ 15 000 à 20 000 € en France.')}`,
          onSubmit: async (body) => {
            data = await call('/admin/budget/settings', { method: 'PUT', body: { total: $('[name=total]', body).value } });
            render();
            toast('Budget enregistré');
          },
        });
        return;
      }
      if (tgt.closest('[data-add-cat]')) return catForm();
      const addItem = tgt.closest('[data-add-item]');
      if (addItem) return itemForm({}, +addItem.dataset.addItem);
      const editCat = tgt.closest('[data-edit-cat]');
      if (editCat) return catForm(data.categories.find((c) => c.id === +editCat.dataset.editCat));
      const item = tgt.closest('[data-item]');
      if (item) {
        const it = data.categories.flatMap((c) => c.items).find((x) => x.id === +item.dataset.item);
        return it && itemForm(it);
      }
      const move = tgt.closest('[data-move-cat]');
      if (move) {
        const ids = data.categories.map((c) => c.id);
        const id = +move.closest('[data-cat]').dataset.cat;
        const i = ids.indexOf(id);
        const j = i + +move.dataset.moveCat;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        try { data = await call('/admin/budget/categories/order', { method: 'POST', body: { ids } }); render(); }
        catch (err) { toast(err.message, 'error'); }
      }
    };
    A.view.onchange = async (e) => {
      const k = e.target.dataset.setting;
      if (!k) return;
      try {
        data = await call('/admin/budget/settings', { method: 'PUT', body: { [k]: e.target.checked } });
        render();
      } catch (err) { toast(err.message, 'error'); }
    };
    // Mémorise les catégories ouvertes
    A.view.addEventListener('toggle', (e) => {
      const d = e.target.closest?.('[data-cat]');
      if (!d) return;
      d.open ? open.add(+d.dataset.cat) : open.delete(+d.dataset.cat);
    }, true);

    render();
  }

  // Ne pas garder les gestionnaires de la vue Budget sur les autres onglets
  const reset = () => { A.view.onclick = null; A.view.onchange = null; };
  A.registerView('budget', async () => { reset(); await budgetView(); });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-view]:not([data-view="budget"])')) reset(); }, true);
})();
