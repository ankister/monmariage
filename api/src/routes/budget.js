/**
 * Budget du mariage (administration) : catégories, dépenses, paiements,
 * recettes des chambres sur place déduites du lieu de réception, export Excel (.xlsx).
 */
'use strict';

const express = require('express');
const ExcelJS = require('exceljs');
const { db, bookingAmount } = require('../db');
const { HttpError, str, int } = require('../util');

db.exec(`
CREATE TABLE IF NOT EXISTS budget_categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  icon      TEXT NOT NULL DEFAULT '',
  sort      INTEGER NOT NULL DEFAULT 0,
  ref       TEXT NOT NULL DEFAULT '',          -- repère indicatif (« 15–20 % »)
  is_venue  INTEGER NOT NULL DEFAULT 0          -- 1 = lieu de réception (reçoit la déduction des chambres)
);
CREATE TABLE IF NOT EXISTS budget_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES budget_categories(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  supplier    TEXT NOT NULL DEFAULT '',
  planned     REAL,                             -- estimation
  actual      REAL,                             -- montant réel (devis signé, facture)
  paid        REAL NOT NULL DEFAULT 0,          -- déjà payé (acomptes compris)
  due_date    TEXT NOT NULL DEFAULT '',         -- prochaine échéance (AAAA-MM-JJ)
  notes       TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_budget_items_cat ON budget_items(category_id);
`);

/* Catégories proposées au départ (modifiables, supprimables). Repères indicatifs de répartition
   relevés dans des guides budget mariage publiés en 2025-2026 (France). */
const DEFAULT_CATEGORIES = [
  ['Lieu de réception', '🏰', '15–20 %', 1, ['Location de la salle']],
  ['Traiteur', '🍽️', '35–50 %', 0, ['Repas', 'Vin d’honneur / cocktail']],
  ['Vins et boissons', '🍷', '', 0, ['Vins', 'Champagne', 'Softs']],
  ['Photographe et vidéaste', '📸', '8–12 %', 0, ['Photographe']],
  ['Tenues et beauté', '👗', '6–10 %', 0, ['Robe', 'Costume', 'Coiffure et maquillage']],
  ['Décoration et fleurs', '💐', '5–8 %', 0, []],
  ['Musique et animation', '🎶', '', 0, ['DJ']],
  ['Alliances', '💍', '', 0, []],
  ['Faire-part et papeterie', '✉️', '', 0, []],
  ['Gâteau et desserts', '🎂', '', 0, []],
  ['Transport', '🚗', '', 0, []],
  ['Imprévus', '🛟', '10–15 %', 0, []],
];

(function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM budget_categories').get().n) return;
  const insC = db.prepare('INSERT INTO budget_categories (name, icon, sort, ref, is_venue) VALUES (?, ?, ?, ?, ?)');
  const insI = db.prepare('INSERT INTO budget_items (category_id, label, sort) VALUES (?, ?, ?)');
  db.transaction(() => {
    DEFAULT_CATEGORIES.forEach(([name, icon, ref, venue, items], i) => {
      const id = insC.run(name, icon, i, ref, venue).lastInsertRowid;
      items.forEach((label, j) => insI.run(id, label, j));
    });
  })();
})();

/* ---------- Réglages ---------- */
function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'budget'").get();
  let s = {};
  try { s = row ? JSON.parse(row.value) : {}; } catch { /* valeurs par défaut */ }
  return {
    total: typeof s.total === 'number' ? s.total : null,
    deduct_rooms: s.deduct_rooms !== false,
    include_pending: !!s.include_pending,
  };
}
function setSettings(s) {
  db.prepare(`INSERT INTO settings (key, value) VALUES ('budget', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(s));
}

/** Montant en euros (accepte « 1 234,50 », vide = null). */
function money(v, { nullable = true } = {}) {
  if (v === null || v === undefined || String(v).trim() === '') return nullable ? null : 0;
  const n = Number(String(v).replace(/\s| |€/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new HttpError(400, `Montant invalide : « ${String(v).slice(0, 20)} ».`);
  return Math.round(n * 100) / 100;
}
const round2 = (n) => Math.round(n * 100) / 100;
const engagedOf = (it) => (it.actual ?? it.planned ?? 0);

/* ---------- Chambres sur place ---------- */
function roomBookings() {
  return db.prepare(`SELECT b.id, b.first_name, b.last_name, b.persons, b.nights, b.status,
                            r.name AS room_name, r.floor, r.price_both, r.price_sat, r.price_mode
                     FROM room_bookings b JOIN rooms r ON r.id = b.room_id
                     WHERE b.status != 'cancelled' ORDER BY r.floor DESC, r.id`).all()
    .map((b) => ({ ...b, price: bookingAmount(b) }));
}

/** Calcule toutes les sommes du budget. */
function summary() {
  const settings = getSettings();
  const cats = db.prepare('SELECT * FROM budget_categories ORDER BY sort, id').all();
  const items = db.prepare('SELECT * FROM budget_items ORDER BY sort, id').all();
  const bookings = roomBookings();

  const roomSum = (st) => round2(bookings.filter((b) => b.status === st).reduce((s, b) => s + (b.price || 0), 0));
  const rooms = {
    confirmed_total: roomSum('confirmed'),
    confirmed_count: bookings.filter((b) => b.status === 'confirmed').length,
    pending_total: roomSum('pending'),
    pending_count: bookings.filter((b) => b.status === 'pending').length,
    missing_price: bookings.filter((b) => b.price === null).length,
  };
  rooms.counted = settings.deduct_rooms
    ? round2(rooms.confirmed_total + (settings.include_pending ? rooms.pending_total : 0))
    : 0;

  const categories = cats.map((c) => {
    const its = items.filter((i) => i.category_id === c.id).map((i) => ({
      ...i,
      engaged: engagedOf(i),
      to_pay: round2(Math.max(engagedOf(i) - i.paid, 0)),
    }));
    const sum = (k) => round2(its.reduce((s, i) => s + (i[k] || 0), 0));
    return {
      ...c,
      is_venue: !!c.is_venue,
      items: its,
      planned: sum('planned'), actual: sum('actual'), engaged: sum('engaged'), paid: sum('paid'), to_pay: sum('to_pay'),
    };
  });
  const tot = (k) => round2(categories.reduce((s, c) => s + c[k], 0));
  const engaged = tot('engaged');
  const net = round2(engaged - rooms.counted);
  const venue = categories.find((c) => c.is_venue);
  return {
    settings,
    categories,
    rooms,
    totals: {
      budget: settings.total,
      planned: tot('planned'),
      actual: tot('actual'),
      engaged,
      paid: tot('paid'),
      to_pay: tot('to_pay'),
      rooms_deduction: rooms.counted,
      net,
      remaining: settings.total === null ? null : round2(settings.total - net),
      venue_net: venue ? round2(venue.engaged - rooms.counted) : null,
    },
  };
}

/* =========================================================
   Routes (montées sous /api/admin, donc réservées aux mariés)
   ========================================================= */
const router = express.Router();

router.get('/budget', (req, res) => res.json(summary()));

router.put('/budget/settings', (req, res) => {
  const b = req.body || {};
  const cur = getSettings();
  setSettings({
    total: 'total' in b ? money(b.total) : cur.total,
    deduct_rooms: 'deduct_rooms' in b ? !!b.deduct_rooms : cur.deduct_rooms,
    include_pending: 'include_pending' in b ? !!b.include_pending : cur.include_pending,
  });
  res.json(summary());
});

/* ---------- Catégories ---------- */
function categoryData(b, cur = {}) {
  const name = str(b.name ?? cur.name, 80);
  if (!name) throw new HttpError(400, 'Donnez un nom à la catégorie.');
  return { name, icon: str(b.icon ?? cur.icon ?? '', 8), ref: str(b.ref ?? cur.ref ?? '', 30) };
}

router.post('/budget/categories', (req, res) => {
  const d = categoryData(req.body || {});
  const sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM budget_categories').get().s;
  db.prepare('INSERT INTO budget_categories (name, icon, ref, sort) VALUES (@name, @icon, @ref, @sort)').run({ ...d, sort });
  res.status(201).json(summary());
});

router.put('/budget/categories/:id', (req, res) => {
  const id = int(req.params.id, 1, 1e9);
  const cur = db.prepare('SELECT * FROM budget_categories WHERE id = ?').get(id);
  if (!cur) throw new HttpError(404, 'Catégorie introuvable.');
  const d = categoryData(req.body || {}, cur);
  db.transaction(() => {
    db.prepare('UPDATE budget_categories SET name=@name, icon=@icon, ref=@ref WHERE id=@id').run({ ...d, id });
    if (req.body?.is_venue === true) {
      db.prepare('UPDATE budget_categories SET is_venue = (id = ?)').run(id);
    }
  })();
  res.json(summary());
});

router.post('/budget/categories/order', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => int(x, 1, 1e9)) : [];
  const upd = db.prepare('UPDATE budget_categories SET sort = ? WHERE id = ?');
  db.transaction(() => ids.forEach((id, i) => upd.run(i, id)))();
  res.json(summary());
});

router.delete('/budget/categories/:id', (req, res) => {
  const r = db.prepare('DELETE FROM budget_categories WHERE id = ?').run(int(req.params.id, 1, 1e9));
  if (!r.changes) throw new HttpError(404, 'Catégorie introuvable.');
  res.json(summary());
});

/* ---------- Dépenses ---------- */
function itemData(b, cur = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const label = str(has('label') ? b.label : cur.label, 120);
  if (!label) throw new HttpError(400, 'Donnez un nom à la dépense.');
  const due = str(has('due_date') ? b.due_date : cur.due_date ?? '', 10);
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new HttpError(400, 'Date d’échéance invalide.');
  const category_id = int(has('category_id') ? b.category_id : cur.category_id, 1, 1e9);
  if (!db.prepare('SELECT 1 FROM budget_categories WHERE id = ?').get(category_id)) throw new HttpError(400, 'Catégorie introuvable.');
  return {
    category_id,
    label,
    supplier: str(has('supplier') ? b.supplier : cur.supplier ?? '', 120),
    planned: has('planned') ? money(b.planned) : cur.planned ?? null,
    actual: has('actual') ? money(b.actual) : cur.actual ?? null,
    paid: has('paid') ? money(b.paid, { nullable: false }) : cur.paid ?? 0,
    due_date: due,
    notes: str(has('notes') ? b.notes : cur.notes ?? '', 1000),
  };
}

router.post('/budget/items', (req, res) => {
  const d = itemData(req.body || {});
  d.sort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM budget_items WHERE category_id = ?').get(d.category_id).s;
  db.prepare(`INSERT INTO budget_items (category_id, label, supplier, planned, actual, paid, due_date, notes, sort)
              VALUES (@category_id, @label, @supplier, @planned, @actual, @paid, @due_date, @notes, @sort)`).run(d);
  res.status(201).json(summary());
});

router.put('/budget/items/:id', (req, res) => {
  const id = int(req.params.id, 1, 1e9);
  const cur = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id);
  if (!cur) throw new HttpError(404, 'Dépense introuvable.');
  const d = itemData(req.body || {}, cur);
  db.prepare(`UPDATE budget_items SET category_id=@category_id, label=@label, supplier=@supplier, planned=@planned,
              actual=@actual, paid=@paid, due_date=@due_date, notes=@notes WHERE id=@id`).run({ ...d, id });
  res.json(summary());
});

router.delete('/budget/items/:id', (req, res) => {
  const r = db.prepare('DELETE FROM budget_items WHERE id = ?').run(int(req.params.id, 1, 1e9));
  if (!r.changes) throw new HttpError(404, 'Dépense introuvable.');
  res.json(summary());
});

/* =========================================================
   Export Excel : Synthèse (formules), Dépenses, Chambres
   ========================================================= */
const EUR = '#,##0.00 "€";-#,##0.00 "€";"–"';
const PCT = '0 %';
const HEAD = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF56644A' } };
const SOFT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFE6D8' } };

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = HEAD;
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
}

router.get('/budget/export.xlsx', async (req, res) => {
  const s = summary();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Site du mariage';
  wb.created = new Date();
  const sy = wb.addWorksheet('Synthèse'); // première feuille, remplie à la fin (elle référence les deux autres)

  /* --- Feuille « Dépenses » --- */
  const dep = wb.addWorksheet('Dépenses', { views: [{ state: 'frozen', ySplit: 1 }] });
  dep.columns = [
    { header: 'Catégorie', key: 'cat', width: 26 },
    { header: 'Dépense', key: 'label', width: 30 },
    { header: 'Prestataire', key: 'supplier', width: 24 },
    { header: 'Prévu', key: 'planned', width: 13, style: { numFmt: EUR } },
    { header: 'Réel (devis / facture)', key: 'actual', width: 15, style: { numFmt: EUR } },
    { header: 'Engagé', key: 'engaged', width: 13, style: { numFmt: EUR } },
    { header: 'Payé', key: 'paid', width: 13, style: { numFmt: EUR } },
    { header: 'Reste à payer', key: 'to_pay', width: 14, style: { numFmt: EUR } },
    { header: 'Échéance', key: 'due', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  styleHeader(dep.getRow(1));
  for (const c of s.categories) {
    for (const it of c.items) {
      const r = dep.addRow({
        cat: c.name, label: it.label, supplier: it.supplier, planned: it.planned, actual: it.actual,
        paid: it.paid, due: it.due_date ? new Date(Date.UTC(...it.due_date.split('-').map((x, i) => +x - (i === 1 ? 1 : 0)))) : null, notes: it.notes,
      });
      const n = r.number;
      // Engagé = réel s'il est connu, sinon prévu ; reste = engagé − payé (jamais négatif)
      r.getCell('engaged').value = { formula: `IF(E${n}="",N(D${n}),E${n})`, result: it.engaged };
      r.getCell('to_pay').value = { formula: `MAX(F${n}-N(G${n}),0)`, result: it.to_pay };
    }
  }
  const last = Math.max(dep.rowCount, 2);
  const totalRow = dep.addRow({ cat: 'TOTAL' });
  for (const [col, key] of [['D', 'planned'], ['E', 'actual'], ['F', 'engaged'], ['G', 'paid'], ['H', 'to_pay']]) {
    totalRow.getCell(col).value = { formula: `SUM(${col}2:${col}${last})`, result: s.totals[key] ?? 0 };
  }
  totalRow.font = { bold: true };
  totalRow.fill = SOFT;
  dep.autoFilter = { from: 'A1', to: `J${last}` };

  /* --- Feuille « Chambres » (recettes) --- */
  const ch = wb.addWorksheet('Chambres', { views: [{ state: 'frozen', ySplit: 1 }] });
  ch.columns = [
    { header: 'Chambre', key: 'room', width: 22 },
    { header: 'Étage', key: 'floor', width: 16 },
    { header: 'Réservé par', key: 'name', width: 26 },
    { header: 'Personnes', key: 'persons', width: 11 },
    { header: 'Nuits', key: 'nights', width: 22 },
    { header: 'Statut', key: 'status', width: 13 },
    { header: 'Prix', key: 'price', width: 12, style: { numFmt: EUR } },
    { header: 'Déduit du lieu', key: 'counted', width: 14 },
  ];
  styleHeader(ch.getRow(1));
  const counts = (b) => s.settings.deduct_rooms && (b.status === 'confirmed' || (s.settings.include_pending && b.status === 'pending'));
  for (const b of roomBookings()) {
    ch.addRow({
      room: b.room_name, floor: b.floor === 'etage' ? 'Étage' : 'Rez-de-chaussée', name: `${b.first_name} ${b.last_name}`,
      persons: b.persons, nights: b.nights === 'sat' ? 'Samedi seul' : 'Vendredi + samedi',
      status: b.status === 'confirmed' ? 'Validée' : 'En attente', price: b.price, counted: counts(b) ? 'Oui' : 'Non',
    });
  }
  const chLast = Math.max(ch.rowCount, 2);
  const chTot = ch.addRow({ room: 'TOTAL DÉDUIT' });
  chTot.getCell('price').value = { formula: `SUMIF(H2:H${chLast},"Oui",G2:G${chLast})`, result: s.rooms.counted };
  chTot.font = { bold: true };
  chTot.fill = SOFT;

  /* --- Feuille « Synthèse » (en premier) --- */
  sy.columns = [
    { key: 'a', width: 34 }, { key: 'b', width: 14 }, { key: 'c', width: 16 }, { key: 'd', width: 14 },
    { key: 'e', width: 14 }, { key: 'f', width: 15 }, { key: 'g', width: 12 }, { key: 'h', width: 14 },
  ];
  sy.addRow(['Budget du mariage']).font = { bold: true, size: 16 };
  sy.addRow([`Export du ${new Date().toLocaleDateString('fr-FR')}`]).font = { italic: true, color: { argb: 'FF6B6259' } };
  sy.addRow([]);
  const hdr = sy.addRow(['Catégorie', 'Prévu', 'Réel (devis / facture)', 'Engagé', 'Payé', 'Reste à payer', 'Part', 'Repère indicatif']);
  styleHeader(hdr);
  const first = sy.rowCount + 1;
  for (const c of s.categories) {
    const r = sy.addRow([`${c.icon ? c.icon + ' ' : ''}${c.name}`]);
    const n = r.number;
    const q = `Dépenses!$A:$A,"${c.name.replace(/"/g, '""')}"`;
    r.getCell(2).value = { formula: `SUMIF(${q},Dépenses!D:D)`, result: c.planned };
    r.getCell(3).value = { formula: `SUMIF(${q},Dépenses!E:E)`, result: c.actual };
    r.getCell(4).value = { formula: `SUMIF(${q},Dépenses!F:F)`, result: c.engaged };
    r.getCell(5).value = { formula: `SUMIF(${q},Dépenses!G:G)`, result: c.paid };
    r.getCell(6).value = { formula: `SUMIF(${q},Dépenses!H:H)`, result: c.to_pay };
    r.getCell(7).value = { formula: `IF($D$TOT=0,0,D${n}/$D$TOT)`, result: s.totals.engaged ? c.engaged / s.totals.engaged : 0 };
    r.getCell(8).value = c.ref || '';
  }
  const lastCat = sy.rowCount;
  const tot = sy.addRow(['Total des dépenses']);
  const T = tot.number;
  ['B', 'C', 'D', 'E', 'F'].forEach((col, i) => {
    const key = ['planned', 'actual', 'engaged', 'paid', 'to_pay'][i];
    tot.getCell(col).value = { formula: `SUM(${col}${first}:${col}${lastCat})`, result: s.totals[key] };
  });
  tot.font = { bold: true };
  tot.fill = SOFT;
  // Formule de part : référence au total une fois sa ligne connue
  for (let n = first; n <= lastCat; n++) {
    const cell = sy.getCell(`G${n}`);
    cell.value = { formula: cell.value.formula.replaceAll('$D$TOT', `$D$${T}`), result: cell.value.result };
  }
  sy.addRow([]);
  const rooms = sy.addRow(['Recettes des chambres sur place (déduites)']);
  rooms.getCell(4).value = { formula: `-Chambres!G${chTot.number}`, result: -s.rooms.counted };
  const netRow = sy.addRow(['Coût net du mariage']);
  netRow.getCell(4).value = { formula: `D${T}+D${rooms.number}`, result: s.totals.net };
  netRow.font = { bold: true };
  const budRow = sy.addRow(['Budget prévu', null, null, s.totals.budget ?? null]);
  const remRow = sy.addRow(['Budget restant']);
  remRow.getCell(4).value = { formula: `IF(D${budRow.number}="","",D${budRow.number}-D${netRow.number})`, result: s.totals.remaining ?? '' };
  remRow.font = { bold: true };
  const venue = s.categories.find((c) => c.is_venue);
  if (venue) {
    sy.addRow([]);
    sy.addRow([`Lieu de réception net (${venue.name} − chambres)`, null, null,
      { formula: `SUMIF(Dépenses!$A:$A,"${venue.name.replace(/"/g, '""')}",Dépenses!F:F)+D${rooms.number}`, result: s.totals.venue_net }]);
  }
  for (let n = first; n <= sy.rowCount; n++) {
    ['B', 'C', 'D', 'E', 'F'].forEach((col) => { sy.getCell(`${col}${n}`).numFmt = EUR; });
    sy.getCell(`G${n}`).numFmt = PCT;
  }

  const buf = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="budget-mariage-${date}.xlsx"`);
  res.set('Cache-Control', 'no-store');
  res.send(Buffer.from(buf));
});

module.exports = router;
