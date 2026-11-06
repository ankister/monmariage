// Site du mariage : pages publiques, API de réponses (RSVP) et espace admin
import express from "express";
import { readFileSync, existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ouvrirBase } from "./db.js";
import { pageAdmin, csvReponses } from "./admin.js";
import { pageGites } from "./admin-gites.js";
import { geocoder } from "./geocodage.js";

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

// Une seule fois : reprend les gîtes éventuellement saisis dans contenu.json (ancienne version)
if (!db.lireMeta("gites_importes")) {
  try {
    const anciens = JSON.parse(readFileSync(join(CONFIG_DIR, "contenu.json"), "utf8")).gites || [];
    if (!db.gites().length) anciens.filter(g => g?.nom).forEach(g => db.creerGite(normaliserGite(g)));
    if (anciens.length) console.log(`🏡 ${anciens.length} gîte(s) importé(s) depuis contenu.json — gère-les maintenant dans /admin/gites`);
  } catch { /* pas de contenu.json lisible : rien à importer */ }
  db.ecrireMeta("gites_importes", new Date().toISOString());
}

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));

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

function nettoyer(v, max = 300) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }

function coordonnee(v, min, max) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 1e6) / 1e6 : null;
}

// Nettoie une fiche gîte venant du formulaire admin (ou d'un ancien contenu.json)
function normaliserGite(g = {}) {
  const lien = nettoyer(g.lien, 500);
  const latitude = coordonnee(g.latitude, -90, 90), longitude = coordonnee(g.longitude, -180, 180);
  return {
    nom: nettoyer(g.nom, 120),
    adresse: nettoyer(g.adresse, 250),
    commune: nettoyer(g.commune, 120),
    latitude: latitude !== null && longitude !== null ? latitude : null,
    longitude: latitude !== null && longitude !== null ? longitude : null,
    capacite: nettoyer(g.capacite, 80),
    prix: nettoyer(g.prix, 80),
    telephone: nettoyer(g.telephone, 40),
    lien: /^https?:\/\//i.test(lien) ? lien : "",
    photo: nettoyer(g.photo, 300),
    note: nettoyer(g.note, 600),
    distance: nettoyer(g.distance, 80),
  };
}
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

// ----- Gestion des gîtes -----
app.get("/admin/gites", exigerAdmin, (_req, res) => {
  let contenu = {};
  try { contenu = lireContenu(); } catch { /* idem */ }
  res.set("Cache-Control", "no-store").type("html").send(pageGites(contenu));
});

app.get("/admin/api/gites", exigerAdmin, (_req, res) => res.set("Cache-Control", "no-store").json(db.gites()));

app.post("/admin/api/geocoder", exigerAdmin, async (req, res) => {
  try {
    res.json(await geocoder(nettoyer(req.body?.adresse, 250)));
  } catch (e) {
    res.status(502).json({ erreur: e.message });
  }
});

// Si aucune position n'est fournie, l'adresse est géocodée automatiquement
async function completerPosition(g) {
  if (g.latitude !== null || !g.adresse) return null;
  try {
    const [premier] = await geocoder(g.adresse);
    if (!premier) return "Adresse introuvable : le gîte est enregistré mais pas placé sur la carte. Modifiez-le et placez-le sur la carte.";
    g.latitude = premier.latitude;
    g.longitude = premier.longitude;
    g.commune ||= premier.commune;
    return null;
  } catch (e) {
    return `Géocodage impossible (${e.message}) : placez le gîte à la main sur la carte.`;
  }
}

app.post("/admin/api/gites", exigerAdmin, async (req, res) => {
  const g = normaliserGite(req.body);
  if (!g.nom) return res.status(400).json({ erreur: "Le nom du gîte est obligatoire." });
  const avertissement = await completerPosition(g);
  const id = db.creerGite(g);
  res.status(201).json({ gite: db.gite(id), avertissement });
});

app.put("/admin/api/gites/:id", exigerAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!db.gite(id)) return res.status(404).json({ erreur: "Gîte introuvable." });
  const g = normaliserGite(req.body);
  if (!g.nom) return res.status(400).json({ erreur: "Le nom du gîte est obligatoire." });
  const avertissement = await completerPosition(g);
  db.modifierGite(id, g);
  res.json({ gite: db.gite(id), avertissement });
});

app.delete("/admin/api/gites/:id", exigerAdmin, (req, res) => {
  res.json({ ok: db.supprimerGite(Number(req.params.id)) > 0 });
});

app.post("/admin/api/gites/:id/deplacer", exigerAdmin, (req, res) => {
  db.deplacerGite(Number(req.params.id), req.body?.sens === "haut" ? -1 : 1);
  res.json(db.gites());
});

// Bibliothèque de carte : publique, servie avant le contrôle du code d'accès (utilisée aussi par l'admin)
app.use("/vendor/leaflet", express.static(join(RACINE, "node_modules/leaflet/dist"), { maxAge: "30d" }));

// ---------- Code d'accès invités (facultatif) ----------

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
    const gites = db.gites().map(({ id, ordre, ...g }) => g);
    res.set("Cache-Control", "no-store").json({ ...lireContenu(), gites });
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

  const gitesConnus = db.gites().map(g => g.nom);
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
app.use("/images", express.static(join(CONFIG_DIR, "images"), { maxAge: "1d" }));
app.use(express.static(join(RACINE, "site"), { maxAge: "1h" }));

app.use((_req, res) => res.status(404).sendFile(join(RACINE, "site/index.html")));

app.listen(PORT, () => {
  console.log(`💍 Site du mariage sur le port ${PORT} — contenu : ${CONFIG_DIR}, données : ${DATA_DIR}` +
    (SITE_CODE ? " — code d'accès activé" : ""));
});
