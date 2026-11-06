// Site du mariage : pages publiques, API de réponses (RSVP) et espace admin
import express from "express";
import { readFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ouvrirBase } from "./db.js";
import { pageAdmin, csvReponses } from "./admin.js";

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = join(ICI, "..");

const PORT = Number(process.env.PORT || 8080);
const CONFIG_DIR = process.env.CONFIG_DIR || "/config";
const DATA_DIR = process.env.DATA_DIR || "/data";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SITE_CODE = (process.env.SITE_CODE || "").trim();          // facultatif : code d'accès invités
const SECRET = process.env.SESSION_SECRET || ADMIN_PASSWORD || "change-moi";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";
const NTFY_URL = process.env.NTFY_URL || "";                      // ex. https://ntfy.sh/mon-sujet-secret

if (!ADMIN_PASSWORD) {
  console.warn("⚠️  ADMIN_PASSWORD n'est pas défini : l'espace /admin est désactivé.");
}

// Premier démarrage : dépose un contenu.json d'exemple à personnaliser
const EXEMPLE = process.env.EXEMPLE_DIR || "/config-exemple";
try {
  const cible = join(CONFIG_DIR, "contenu.json");
  if (!existsSync(cible) && existsSync(join(EXEMPLE, "contenu.json"))) {
    mkdirSync(join(CONFIG_DIR, "images"), { recursive: true });
    copyFileSync(join(EXEMPLE, "contenu.json"), cible);
    console.log(`📝 contenu.json d'exemple copié dans ${CONFIG_DIR} : personnalise-le.`);
  }
} catch (e) {
  console.warn(`Impossible de créer ${CONFIG_DIR}/contenu.json : ${e.message}`);
}

const db = ouvrirBase(DATA_DIR);
const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");

// ---------- Utilitaires ----------
function lireContenu() {
  const fichier = join(CONFIG_DIR, "contenu.json");
  if (!existsSync(fichier)) throw new Error(`Fichier introuvable : ${fichier}`);
  return JSON.parse(readFileSync(fichier, "utf8"));
}

const ipClient = req => req.get("cf-connecting-ip") || req.ip || "";

function egaliteSure(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function lireCookies(req) {
  return Object.fromEntries((req.get("cookie") || "").split(";").map(c => {
    const i = c.indexOf("=");
    return i < 0 ? [c.trim(), ""] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
  }));
}

const jetonAcces = () => createHmac("sha256", SECRET).update("acces:" + SITE_CODE).digest("hex");

const nettoyer = (v, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const entier = (v, min, max) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};

// ---------- Santé (pour le healthcheck Docker) ----------
app.get("/health", (_req, res) => res.json({ ok: true }));

// ---------- Espace admin (authentification HTTP Basic) ----------
function exigerAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).send("Admin désactivé : définir ADMIN_PASSWORD.");
  const [type, valeur] = (req.get("authorization") || "").split(" ");
  if (type === "Basic" && valeur) {
    const [, mdp] = Buffer.from(valeur, "base64").toString().split(/:(.*)/s);
    if (mdp !== undefined && egaliteSure(mdp, ADMIN_PASSWORD)) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Admin mariage", charset="UTF-8"').status(401).send("Accès réservé.");
}

app.get("/admin", exigerAdmin, (_req, res) => {
  let contenu = {};
  try { contenu = lireContenu(); } catch { /* l'admin reste utilisable */ }
  res.set("Cache-Control", "no-store").type("html").send(pageAdmin(db.toutes(), contenu));
});

app.get("/admin/export.csv", exigerAdmin, (_req, res) => {
  res.set({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="reponses-mariage-${new Date().toISOString().slice(0, 10)}.csv"`,
    "Cache-Control": "no-store",
  }).send(csvReponses(db.toutes()));
});

app.post("/admin/supprimer/:id", exigerAdmin, (req, res) => {
  db.supprimer(Number(req.params.id));
  res.redirect(303, "/admin");
});

// ---------- Code d'accès invités (facultatif) ----------
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));

app.post("/acces", (req, res) => {
  if (SITE_CODE && egaliteSure(nettoyer(req.body.code, 100).toLowerCase(), SITE_CODE.toLowerCase())) {
    const securise = req.secure || req.get("x-forwarded-proto") === "https";
    res.set("Set-Cookie",
      `acces=${jetonAcces()}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax${securise ? "; Secure" : ""}`);
    return res.redirect(303, "/");
  }
  res.redirect(303, "/acces.html?erreur=1");
});

app.use((req, res, next) => {
  if (!SITE_CODE) return next();
  const libre = ["/acces.html", "/style.css", "/favicon.svg", "/health"];
  if (libre.includes(req.path)) return next();
  if (egaliteSure(lireCookies(req).acces || "", jetonAcces())) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ erreur: "Code d'accès requis." });
  res.redirect(303, "/acces.html");
});

// ---------- API publique ----------
app.get("/api/contenu", (_req, res) => {
  try {
    res.set("Cache-Control", "no-store").json(lireContenu());
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: "contenu.json illisible : vérifie la syntaxe JSON." });
  }
});

app.post("/api/rsvp", async (req, res) => {
  const b = req.body || {};
  if (nettoyer(b.site_web)) return res.json({ ok: true });       // champ piège à robots

  let contenu;
  try { contenu = lireContenu(); } catch { return res.status(500).json({ erreur: "Configuration invalide." }); }

  const limite = contenu.rsvp?.date_limite;
  if (limite && new Date() > new Date(limite + "T23:59:59")) {
    return res.status(400).json({ erreur: "La date limite de réponse est passée, contactez-nous directement." });
  }

  const ip = ipClient(req);
  if (db.compterRecentesIp(ip) >= 15) {
    return res.status(429).json({ erreur: "Trop de réponses depuis cette connexion, réessayez plus tard." });
  }

  const nom = nettoyer(b.nom, 120);
  if (!nom) return res.status(400).json({ erreur: "Merci d'indiquer votre nom." });
  if (b.present !== "oui" && b.present !== "non") {
    return res.status(400).json({ erreur: "Merci d'indiquer si vous serez présent·e." });
  }
  const present = b.present === "oui" ? 1 : 0;

  const gitesConnus = (contenu.gites || []).map(g => g.nom);
  const gite = nettoyer(b.gite, 120);
  const giteValide = present && (gitesConnus.includes(gite) || ["autre", "aucun"].includes(gite)) ? gite : "";

  const reponse = {
    nom,
    email: nettoyer(b.email, 160),
    telephone: nettoyer(b.telephone, 40),
    present,
    adultes: present ? entier(b.adultes, 1, 20) : 0,
    enfants: present ? entier(b.enfants, 0, 20) : 0,
    noms_accompagnants: present ? nettoyer(b.noms_accompagnants, 500) : "",
    regime: present ? nettoyer(b.regime, 500) : "",
    gite: giteValide,
    brunch: present && contenu.rsvp?.demander_brunch && ["oui", "non"].includes(b.brunch) ? (b.brunch === "oui" ? 1 : 0) : null,
    message: nettoyer(b.message, 2000),
    ip,
  };

  const { id, remplacees } = db.ajouter(reponse);
  console.log(`RSVP #${id} : ${reponse.nom} — ${present ? `présent (${reponse.adultes}+${reponse.enfants})` : "absent"}` +
    (remplacees ? " (remplace une réponse précédente)" : ""));
  notifier(reponse, remplacees > 0).catch(e => console.warn("Notification échouée :", e.message));
  res.json({ ok: true, present: !!present });
});

async function notifier(r, modification) {
  const texte = (modification ? "✏️ Réponse modifiée — " : "") + (r.present
    ? `✅ ${r.nom} sera présent·e — ${r.adultes} adulte(s), ${r.enfants} enfant(s)` +
      (r.gite && !["autre", "aucun"].includes(r.gite) ? ` · gîte : ${r.gite}` : "") +
      (r.regime ? ` · régime : ${r.regime}` : "")
    : `❌ ${r.nom} ne pourra pas venir`);
  const complet = r.message ? `${texte}\n💬 ${r.message}` : texte;
  const envois = [];
  if (DISCORD_WEBHOOK_URL) {
    envois.push(fetch(DISCORD_WEBHOOK_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Mariage", content: complet.slice(0, 1900) }),
    }));
  }
  if (NTFY_URL) {
    envois.push(fetch(NTFY_URL, { method: "POST", headers: { Title: "Nouvelle réponse mariage" }, body: complet }));
  }
  await Promise.all(envois);
}

// ---------- Fichiers statiques ----------
app.use("/vendor/leaflet", express.static(join(RACINE, "node_modules/leaflet/dist"), { maxAge: "30d" }));
app.use("/images", express.static(join(CONFIG_DIR, "images"), { maxAge: "1d" }));
app.use(express.static(join(RACINE, "site"), { maxAge: "1h" }));

app.use((_req, res) => res.status(404).sendFile(join(RACINE, "site/index.html")));

app.listen(PORT, () => {
  console.log(`💍 Site du mariage sur le port ${PORT} — contenu : ${CONFIG_DIR}, données : ${DATA_DIR}` +
    (SITE_CODE ? " — code d'accès activé" : ""));
});
