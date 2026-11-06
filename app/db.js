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
  `);

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
  };
}
