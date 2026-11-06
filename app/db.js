// Stockage des réponses dans SQLite (module natif node:sqlite, aucune dépendance compilée)
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function ouvrirBase(dossier) {
  mkdirSync(dossier, { recursive: true });
  const db = new DatabaseSync(join(dossier, "reponses.sqlite"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS reponses (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cree_le     TEXT    NOT NULL DEFAULT (datetime('now')),
      nom         TEXT    NOT NULL,
      email       TEXT,
      telephone   TEXT,
      present     INTEGER NOT NULL,          -- 1 = présent, 0 = absent
      adultes     INTEGER NOT NULL DEFAULT 0,
      enfants     INTEGER NOT NULL DEFAULT 0,
      noms_accompagnants TEXT,
      regime      TEXT,
      gite        TEXT,
      brunch      INTEGER,                   -- NULL = non demandé
      message     TEXT,
      ip          TEXT
    );
    CREATE TABLE IF NOT EXISTS gites (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ordre     INTEGER NOT NULL DEFAULT 0,
      nom       TEXT    NOT NULL,
      adresse   TEXT,
      commune   TEXT,
      latitude  REAL,
      longitude REAL,
      capacite  TEXT,
      prix      TEXT,
      telephone TEXT,
      lien      TEXT,
      photo     TEXT,
      note      TEXT,
      distance  TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (cle TEXT PRIMARY KEY, valeur TEXT);
  `);

  const CHAMPS_GITE = ["nom", "adresse", "commune", "latitude", "longitude", "capacite",
    "prix", "telephone", "lien", "photo", "note", "distance"];

  const inserer = db.prepare(`
    INSERT INTO reponses (nom, email, telephone, present, adultes, enfants, noms_accompagnants, regime, gite, brunch, message, ip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // Une nouvelle réponse au même nom (casse et espaces ignorés) remplace l'ancienne
  const remplacer = db.prepare("DELETE FROM reponses WHERE lower(trim(nom)) = lower(trim(?))");

  return {
    ajouter: r => {
      db.exec("BEGIN");
      try {
        const remplacees = remplacer.run(r.nom).changes;
        const id = inserer.run(
          r.nom, r.email, r.telephone, r.present, r.adultes, r.enfants,
          r.noms_accompagnants, r.regime, r.gite, r.brunch, r.message, r.ip
        ).lastInsertRowid;
        db.exec("COMMIT");
        return { id, remplacees };
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    toutes: () => db.prepare("SELECT * FROM reponses ORDER BY cree_le DESC, id DESC").all(),
    supprimer: id => db.prepare("DELETE FROM reponses WHERE id = ?").run(id).changes,
    compterRecentesIp: ip => db.prepare(
      "SELECT COUNT(*) AS n FROM reponses WHERE ip = ? AND cree_le > datetime('now', '-1 hour')"
    ).get(ip).n,

    // ----- Gîtes -----
    gites: () => db.prepare("SELECT * FROM gites ORDER BY ordre, id").all(),
    gite: id => db.prepare("SELECT * FROM gites WHERE id = ?").get(id),
    creerGite: g => {
      const ordre = db.prepare("SELECT COALESCE(MAX(ordre), 0) + 1 AS o FROM gites").get().o;
      return db.prepare(`INSERT INTO gites (ordre, ${CHAMPS_GITE.join(", ")})
        VALUES (?, ${CHAMPS_GITE.map(() => "?").join(", ")})`)
        .run(ordre, ...CHAMPS_GITE.map(c => g[c] ?? null)).lastInsertRowid;
    },
    modifierGite: (id, g) => db.prepare(`UPDATE gites SET ${CHAMPS_GITE.map(c => `${c} = ?`).join(", ")} WHERE id = ?`)
      .run(...CHAMPS_GITE.map(c => g[c] ?? null), id).changes,
    supprimerGite: id => db.prepare("DELETE FROM gites WHERE id = ?").run(id).changes,
    deplacerGite: (id, sens) => {
      const liste = db.prepare("SELECT id FROM gites ORDER BY ordre, id").all().map(r => r.id);
      const i = liste.indexOf(id), j = i + sens;
      if (i < 0 || j < 0 || j >= liste.length) return;
      [liste[i], liste[j]] = [liste[j], liste[i]];
      const maj = db.prepare("UPDATE gites SET ordre = ? WHERE id = ?");
      db.exec("BEGIN");
      liste.forEach((gid, k) => maj.run(k + 1, gid));
      db.exec("COMMIT");
    },

    // ----- Réglages divers -----
    lireMeta: cle => db.prepare("SELECT valeur FROM meta WHERE cle = ?").get(cle)?.valeur,
    ecrireMeta: (cle, valeur) => db.prepare(
      "INSERT INTO meta (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur"
    ).run(cle, String(valeur)),
  };
}
