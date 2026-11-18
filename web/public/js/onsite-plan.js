/**
 * Plan SVG du gîte Grand Breuil (bâtiment A), d'après le plan d'architecte.
 * Partagé entre la page « Dormir sur place » et l'administration.
 * Les couleurs sont gérées en CSS (classes .room, .z-*) pour suivre le thème du site.
 */
'use strict';

window.MMPlan = (() => {
  const esc = (s) => window.MM.esc(s);

  /* ---------- Parties fixes de chaque niveau (murs, couloirs, sanitaires…) ---------- */
  const zone = (cls, x, y, w, h) => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  const label = (x, y, text, cls = 'z-label', size = 10) =>
    `<text class="${cls}" x="${x}" y="${y}" text-anchor="middle" font-size="${size}">${text}</text>`;
  const stairs = (x, w, ys) => `<g class="z-steps">${ys.map((y) => `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}"/>`).join('')}</g>`;

  const RDC_BG = `
    ${zone('z-common', 26, 174, 504, 82)}${label(275, 219, 'COULOIR', 'z-label z-spaced')}
    ${zone('z-hall', 530, 26, 115, 378)}${label(587, 200, 'HALL', 'z-label z-strong', 11)}${label(587, 214, 'D’ENTRÉE', 'z-label z-strong', 11)}
    <path class="z-arrow" d="M587 22 L587 42 M582 36 L587 42 L592 36"/>${label(587, 56, 'Entrée', 'z-label', 8)}
    <path class="z-arrow" d="M587 408 L587 388 M582 394 L587 388 L592 394"/>${label(587, 380, 'Entrée', 'z-label', 8)}
    ${zone('z-common', 645, 174, 329, 82)}${label(810, 219, 'COULOIR 2', 'z-label z-spaced')}
    ${zone('z-tech', 26, 26, 129, 148)}${label(90, 103, 'BUANDERIE', 'z-label z-strong')}
    ${zone('z-bath', 300, 26, 41, 148)}${label(320, 103, 'SdB', 'z-bathlabel', 8.5)}
    ${zone('z-bath', 341, 26, 41, 148)}${label(361, 103, 'SdB', 'z-bathlabel', 8.5)}
    ${zone('z-tech', 26, 256, 84, 72)}${label(68, 296, 'LAVERIE', 'z-label z-strong', 9)}
    ${zone('z-bath', 26, 328, 84, 76)}${label(68, 370, 'SdB 6', 'z-bathlabel', 9)}
    ${zone('z-stair', 490, 256, 40, 148)}${stairs(490, 40, [280, 292, 304, 316, 328, 340, 352, 364])}
    ${label(510, 390, 'ESCALIER', 'z-label z-strong', 7)}
    ${zone('z-bath', 645, 256, 105, 62)}${label(697, 291, 'WC', 'z-bathlabel', 9)}
    ${zone('z-bath', 645, 318, 105, 86)}${label(697, 365, 'SANITAIRES', 'z-bathlabel', 8.5)}`;

  // Petites salles d'eau intégrées aux chambres du RDC (dessinées par-dessus, non cliquables)
  const RDC_FG = `<g pointer-events="none">${[
    [647, 146], [759, 146], [871, 146], [252, 378], [377, 378], [752, 378], [866, 378],
  ].map(([x, y]) => `<rect class="z-bath" x="${x}" y="${y}" width="36" height="24"/>${label(x + 18, y + 15, 'SdE', 'z-bathlabel', 7)}`).join('')}</g>`;

  const ETAGE_BG = `
    ${zone('z-common', 26, 174, 538, 82)}${label(240, 219, 'DÉGAGEMENT 1', 'z-label z-spaced')}
    ${zone('z-common', 564, 174, 410, 82)}${label(795, 219, 'DÉGAGEMENT 2', 'z-label z-spaced')}
    ${zone('z-bath', 454, 26, 84, 148)}${label(496, 98, 'DOUCHES', 'z-bathlabel', 9)}${label(496, 111, '& WC', 'z-bathlabel', 8)}
    ${zone('z-kitchen', 538, 26, 118, 148)}${label(597, 98, 'KITCHENETTE', 'z-kitchenlabel', 9.5)}
    ${zone('z-bath', 196, 256, 140, 148)}${label(266, 328, 'SANITAIRES', 'z-bathlabel', 9.5)}${label(266, 341, 'WC + douches', 'z-bathlabel', 8)}
    ${zone('z-stair', 454, 256, 110, 148)}${stairs(454, 110, [280, 294, 308, 322, 336, 350])}
    ${label(509, 380, 'ESCALIER', 'z-label z-strong', 8)}
    ${zone('z-bath', 564, 256, 92, 148)}${label(610, 328, 'SANITAIRES', 'z-bathlabel', 9)}`;

  /* ---------- Schémas de lits façon plan d'architecte ---------- */
  function beds(r) {
    const x = r.x + 8, y = r.y + 8, right = r.x + r.w, bottom = r.y + r.h;
    const dbl = (bx, by) => `<rect x="${bx}" y="${by}" width="34" height="38" rx="2"/><rect x="${bx + 4}" y="${by + 3}" width="11" height="7" rx="1"/><rect x="${bx + 19}" y="${by + 3}" width="11" height="7" rx="1"/>`;
    const sgl = (bx, by) => `<rect x="${bx}" y="${by}" width="20" height="34" rx="2"/><rect x="${bx + 4}" y="${by + 3}" width="12" height="6" rx="1"/>`;
    const crib = (bx, by) => `<rect class="crib" x="${bx}" y="${by}" width="18" height="24" rx="2"/>`;
    let g = '';
    switch (r.bed_icon) {
      case 'dorm5': g = sgl(x, y) + sgl(x + 34, y) + sgl(x + 68, y) + sgl(x, bottom - 42) + sgl(right - 28, bottom - 42); break;
      case 'double2': g = dbl(x, y) + dbl(right - 42, bottom - 46); break;
      case 'twin': g = sgl(x, y) + sgl(right - 28, y); break;
      case 'double+single': g = dbl(x, y) + sgl(right - 28, y); break;
      case 'double+child': g = dbl(x, y) + sgl(right - 28, y).replace('<rect ', '<rect class="child" '); break;
      case 'double+baby': g = dbl(x, y) + crib(right - 26, y); break;
      default: g = dbl(x, y);
    }
    return `<g class="beds">${g}</g>`;
  }

  /**
   * Construit le SVG d'un niveau.
   * opts.selectedId : chambre mise en avant ; opts.matches(room) : false = chambre estompée (filtre)
   * opts.statusOf(room) : 'free' | 'taken' | 'off' ; opts.badge(room) : texte de la pastille
   */
  function render(floor, rooms, opts = {}) {
    const list = rooms.filter((r) => r.floor === floor);
    const roomSvg = list.map((r) => {
      const status = opts.statusOf ? opts.statusOf(r) : 'free';
      const cls = ['room', `is-${status}`];
      if (opts.selectedId === r.id) cls.push('is-selected');
      if (opts.matches && !opts.matches(r)) cls.push('is-dim');
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const badge = opts.badge ? opts.badge(r) : `${r.capacity} pers.`;
      const state = status === 'free' ? 'disponible' : status === 'taken' ? 'déjà réservée' : 'non proposée';
      return `<g class="${cls.join(' ')}" data-room="${r.id}" tabindex="0" role="button"
                aria-label="${esc(r.name)}, ${r.capacity} personnes, ${state}">
        <rect class="bg" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="3"/>
        ${beds(r)}
        <text class="name" x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="12">${esc(r.short_name)}</text>
        <text class="area" x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="9.5">${esc(r.area)}</text>
        <rect class="pill" x="${cx - 40}" y="${cy + 28}" width="80" height="18" rx="9"/>
        <text class="pill-text" x="${cx}" y="${cy + 40.5}" text-anchor="middle" font-size="9.5">${esc(badge)}</text>
      </g>`;
    }).join('');
    return `<svg class="floor-plan" viewBox="0 0 1000 430" xmlns="http://www.w3.org/2000/svg" role="group"
              aria-label="Plan ${floor === 'rdc' ? 'du rez-de-chaussée' : 'de l’étage'}">
      <rect class="z-wall" x="16" y="16" width="968" height="398" rx="4"/>
      ${floor === 'rdc' ? RDC_BG : ETAGE_BG}
      ${roomSvg}
      ${floor === 'rdc' ? RDC_FG : ''}
    </svg>`;
  }

  /** Clic ou Entrée/Espace sur une chambre du plan. */
  function bind(container, onPick) {
    container.addEventListener('click', (e) => {
      const g = e.target.closest('[data-room]');
      if (g) onPick(+g.dataset.room);
    });
    container.addEventListener('keydown', (e) => {
      const g = e.target.closest('[data-room]');
      if (g && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        onPick(+g.dataset.room);
      }
    });
  }

  /** Formate un prix en euros (null → texte de remplacement). */
  const euro = (n, fallback = 'Tarif à venir') =>
    n === null || n === undefined ? fallback
      : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);

  return { render, bind, euro };
})();
