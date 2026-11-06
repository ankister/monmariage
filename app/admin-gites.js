// Page d'admin : saisie des gîtes (nom + adresse → placés automatiquement sur la carte)
import { gabarit, esc } from "./admin.js";

export function pageGites(contenu) {
  const lieu = contenu.lieu && Number.isFinite(+contenu.lieu.latitude) && Number.isFinite(+contenu.lieu.longitude)
    ? { nom: contenu.lieu.nom || "Lieu du mariage", latitude: +contenu.lieu.latitude, longitude: +contenu.lieu.longitude }
    : null;
  const titre = contenu.maries ? `Gîtes — ${contenu.maries}` : "Gîtes";

  const tete = `<link rel="stylesheet" href="/vendor/leaflet/leaflet.css">
<style>
  .grille { display: grid; grid-template-columns: minmax(340px, 430px) 1fr; gap: 1.2rem; align-items: start; }
  @media (max-width: 900px) { .grille { grid-template-columns: 1fr; } #carte { height: 380px !important; } }
  .panneau { background: #fff; border: 1px solid #e3ddd0; border-radius: 8px; padding: 1.2rem; }
  .panneau h2 { margin: 0 0 .9rem; }
  #carte { height: 620px; border-radius: 8px; border: 1px solid #e3ddd0; position: sticky; top: 1rem; }
  label { display: block; font-weight: 600; font-size: .88rem; margin: .7rem 0 .25rem; }
  label small { font-weight: 400; }
  input, textarea { width: 100%; box-sizing: border-box; padding: .5rem .6rem; border: 1px solid #d9d2c3; border-radius: 6px; font: inherit; }
  input:focus, textarea:focus { outline: 2px solid #8a9a7b; border-color: #8a9a7b; }
  textarea { min-height: 60px; resize: vertical; }
  .ligne { display: flex; gap: .5rem; } .ligne > * { flex: 1; } .ligne > .btn { flex: 0 0 auto; }
  .coord { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
  .coord input { font-size: .85rem; color: #555; }
  details { margin-top: .9rem; border-top: 1px solid #eee; padding-top: .6rem; }
  summary { cursor: pointer; font-weight: 600; font-size: .9rem; color: #5f6f52; }
  .actions { display: flex; gap: .5rem; margin-top: 1.1rem; flex-wrap: wrap; }
  .aide { font-size: .82rem; color: #777; margin: .35rem 0 0; }
  #propositions { list-style: none; padding: 0; margin: .4rem 0 0; border: 1px solid #e3ddd0; border-radius: 6px; overflow: hidden; }
  #propositions:empty { display: none; }
  #propositions li { padding: .45rem .6rem; cursor: pointer; font-size: .88rem; border-bottom: 1px solid #f0ece3; }
  #propositions li:last-child { border-bottom: 0; }
  #propositions li:hover { background: #f2f4ee; }
  #propositions small { float: right; margin-left: .5rem; }
  #message { margin-top: .8rem; padding: .55rem .75rem; border-radius: 6px; font-size: .9rem; }
  #message:empty { display: none; }
  #message.ok { background: #eef3e8; color: #4d5b42; } #message.ko { background: #fde8e8; color: #9b2c2c; }
  #message.info { background: #fff7e6; color: #7a5a12; }
  .liste { margin-top: 1.2rem; }
  .liste td:first-child { width: 2rem; font-weight: 600; color: #5f6f52; }
  .liste tr.edition td { background: #f2f4ee; }
  .liste .outils { white-space: nowrap; text-align: right; }
  .marqueur { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50% 50% 50% 0;
              transform: rotate(-45deg); background: #5f6f52; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.35); }
  .marqueur span { transform: rotate(45deg); color: #fff; font: 600 12px system-ui; }
  .marqueur.lieu { background: #c9a96e; width: 34px; height: 34px; } .marqueur.lieu span { font-size: 16px; }
  .marqueur.edite { background: #c0533a; width: 34px; height: 34px; }
</style>`;

  const corps = `
<h1>${esc(titre)}</h1>
<div class="grille">
  <div>
    <form class="panneau" id="form" autocomplete="off">
      <h2 id="titre-form">Ajouter un gîte</h2>
      <input type="hidden" name="id">
      <label for="nom">Nom du gîte *</label>
      <input id="nom" name="nom" required maxlength="120" placeholder="Gîte des Tilleuls">

      <label for="adresse">Adresse</label>
      <div class="ligne">
        <input id="adresse" name="adresse" maxlength="250" placeholder="12 route de Toulouse, 31530 Lévignac">
        <button type="button" class="btn secondaire" id="localiser">📍 Localiser</button>
      </div>
      <ul id="propositions"></ul>
      <p class="aide">« Localiser » propose les adresses trouvées. Vous pouvez aussi cliquer sur la carte ou déplacer le marqueur rouge.
        Si vous enregistrez sans localiser, l'adresse est placée automatiquement.</p>

      <div class="coord">
        <div><label for="latitude">Latitude</label><input id="latitude" name="latitude" inputmode="decimal"></div>
        <div><label for="longitude">Longitude</label><input id="longitude" name="longitude" inputmode="decimal"></div>
      </div>

      <details id="plus">
        <summary>Plus d'informations (facultatif)</summary>
        <label for="commune">Commune</label><input id="commune" name="commune" maxlength="120">
        <div class="coord">
          <div><label for="capacite">Capacité</label><input id="capacite" name="capacite" maxlength="80" placeholder="8 personnes"></div>
          <div><label for="prix">Prix</label><input id="prix" name="prix" maxlength="80" placeholder="≈ 250 € / nuit"></div>
        </div>
        <label for="telephone">Téléphone</label><input id="telephone" name="telephone" maxlength="40">
        <label for="lien">Lien de réservation <small>(https://…)</small></label><input id="lien" name="lien" maxlength="500" type="url">
        <label for="distance">Distance affichée <small>(sinon calculée à vol d'oiseau)</small></label>
        <input id="distance" name="distance" maxlength="80" placeholder="10 min en voiture">
        <label for="photo">Photo <small>(/images/fichier.jpg ou https://…)</small></label><input id="photo" name="photo" maxlength="300">
        <label for="note">Remarque pour les invités</label>
        <textarea id="note" name="note" maxlength="600" placeholder="Option posée à notre nom jusqu'au 1er mars…"></textarea>
      </details>

      <div class="actions">
        <button class="btn" type="submit" id="enregistrer">Enregistrer</button>
        <button class="btn secondaire" type="button" id="annuler" hidden>Annuler</button>
      </div>
      <div id="message" role="status"></div>
    </form>

    <div class="defile liste"><table>
      <thead><tr><th>#</th><th>Gîte</th><th>Carte</th><th></th></tr></thead>
      <tbody id="liste"><tr><td colspan="4">Chargement…</td></tr></tbody>
    </table></div>
  </div>
  <div id="carte"></div>
</div>

<script src="/vendor/leaflet/leaflet.js"></script>
<script>
"use strict";
const LIEU = ${JSON.stringify(lieu).replace(/</g, "\\u003c")};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const $ = s => document.querySelector(s);
const form = $("#form");
let gites = [], marqueurs = L.layerGroup(), edition = null;

const icone = (txt, cls = "") => L.divIcon({ className: "", html: '<div class="marqueur ' + cls + '"><span>' + txt + '</span></div>',
  iconSize: cls ? [34, 34] : [28, 28], iconAnchor: cls ? [17, 34] : [14, 28], popupAnchor: [0, -30] });

const carte = L.map("carte");
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; contributeurs OpenStreetMap" }).addTo(carte);
marqueurs.addTo(carte);
if (LIEU) {
  L.marker([LIEU.latitude, LIEU.longitude], { icon: icone("♥", "lieu"), zIndexOffset: 1000 })
    .addTo(carte).bindTooltip(esc(LIEU.nom));
  carte.setView([LIEU.latitude, LIEU.longitude], 12);
} else carte.setView([46.6, 2.4], 6);

// Marqueur rouge du gîte en cours de saisie, déplaçable
const pointeur = L.marker([0, 0], { icon: icone("✎", "edite"), draggable: true, zIndexOffset: 2000 });
function placer(lat, lon, centrer = true) {
  $("#latitude").value = (+lat).toFixed(6);
  $("#longitude").value = (+lon).toFixed(6);
  pointeur.setLatLng([lat, lon]).addTo(carte);
  if (centrer) carte.setView([lat, lon], Math.max(carte.getZoom(), 14));
}
pointeur.on("dragend", () => { const p = pointeur.getLatLng(); placer(p.lat, p.lng, false); });
carte.on("click", e => placer(e.latlng.lat, e.latlng.lng, false));
["latitude", "longitude"].forEach(id => $("#" + id).addEventListener("change", () => {
  const lat = parseFloat($("#latitude").value.replace(",", ".")), lon = parseFloat($("#longitude").value.replace(",", "."));
  if (Number.isFinite(lat) && Number.isFinite(lon)) placer(lat, lon);
}));

function message(texte, type = "ok") { const m = $("#message"); m.className = type; m.textContent = texte; }

async function api(url, options = {}) {
  const rep = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const json = await rep.json().catch(() => ({}));
  if (!rep.ok) throw new Error(json.erreur || "Erreur " + rep.status);
  return json;
}

function dessiner() {
  marqueurs.clearLayers();
  const points = LIEU ? [[LIEU.latitude, LIEU.longitude]] : [];
  gites.forEach((g, i) => {
    if (g.latitude === null || g.longitude === null) return;
    points.push([g.latitude, g.longitude]);
    if (edition === g.id) return;                       // remplacé par le pointeur rouge
    L.marker([g.latitude, g.longitude], { icon: icone(i + 1) })
      .bindTooltip(esc(g.nom)).on("click", () => editer(g.id)).addTo(marqueurs);
  });
  $("#liste").innerHTML = gites.length ? gites.map((g, i) => \`
    <tr class="\${edition === g.id ? "edition" : ""}">
      <td>\${i + 1}</td>
      <td><b>\${esc(g.nom)}</b><br><small>\${esc(g.adresse || g.commune || "")}</small></td>
      <td>\${g.latitude !== null ? "📍" : '<span title="Pas de position : modifier et localiser">⚠️ non placé</span>'}</td>
      <td class="outils">
        <button title="Modifier" data-action="editer" data-id="\${g.id}">✏️</button>
        <button title="Monter" data-action="haut" data-id="\${g.id}" \${i === 0 ? "disabled" : ""}>▲</button>
        <button title="Descendre" data-action="bas" data-id="\${g.id}" \${i === gites.length - 1 ? "disabled" : ""}>▼</button>
        <button title="Supprimer" data-action="supprimer" data-id="\${g.id}">🗑</button>
      </td></tr>\`).join("")
    : '<tr><td colspan="4">Aucun gîte pour l\\'instant : ajoutez le premier avec le formulaire.</td></tr>';
  return points;
}

async function charger(ajuster = false) {
  gites = await api("/admin/api/gites");
  const points = dessiner();
  if (ajuster && points.length > 1) carte.fitBounds(points, { padding: [40, 40] });
}

function vider() {
  form.reset();
  form.elements.id.value = "";
  edition = null;
  carte.removeLayer(pointeur);
  $("#titre-form").textContent = "Ajouter un gîte";
  $("#enregistrer").textContent = "Enregistrer";
  $("#annuler").hidden = true;
  $("#propositions").innerHTML = "";
  $("#plus").open = false;
  dessiner();
}

function editer(id) {
  const g = gites.find(x => x.id === id);
  if (!g) return;
  vider();
  edition = id;
  for (const [cle, valeur] of Object.entries(g)) if (form.elements[cle]) form.elements[cle].value = valeur ?? "";
  $("#titre-form").textContent = "Modifier « " + g.nom + " »";
  $("#enregistrer").textContent = "Enregistrer les modifications";
  $("#annuler").hidden = false;
  $("#plus").open = ["capacite", "prix", "telephone", "lien", "distance", "photo", "note"].some(c => g[c]);
  if (g.latitude !== null) placer(g.latitude, g.longitude);
  dessiner();
  $("#message").textContent = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#localiser").addEventListener("click", async () => {
  const adresse = $("#adresse").value.trim();
  if (adresse.length < 3) return message("Saisissez d'abord une adresse.", "ko");
  const bouton = $("#localiser"); bouton.disabled = true; bouton.textContent = "…";
  try {
    const res = await api("/admin/api/geocoder", { method: "POST", body: JSON.stringify({ adresse }) });
    if (!res.length) { $("#propositions").innerHTML = ""; return message("Adresse introuvable : cliquez directement sur la carte pour placer le gîte.", "info"); }
    $("#propositions").innerHTML = res.map((r, i) => \`<li data-i="\${i}">\${esc(r.libelle)}
      <small>\${r.score !== null ? r.score + " %" : ""} \${esc(r.source)}</small></li>\`).join("");
    const appliquer = r => {
      placer(r.latitude, r.longitude);
      if (r.commune) $("#commune").value = r.commune;
    };
    $("#propositions").onclick = e => {
      const li = e.target.closest("li"); if (!li) return;
      appliquer(res[+li.dataset.i]);
      $("#propositions").innerHTML = "";
      message("Position placée. Ajustez le marqueur rouge si besoin, puis enregistrez.", "ok");
    };
    appliquer(res[0]);                                   // la meilleure proposition est appliquée d'office
    if (res.length > 1) message("Meilleure correspondance placée. Si ce n'est pas la bonne, choisissez dans la liste ou déplacez le marqueur.", "info");
    else { $("#propositions").innerHTML = ""; message("Position placée. Ajustez le marqueur rouge si besoin, puis enregistrez.", "ok"); }
  } catch (e) {
    message(e.message + " — cliquez sur la carte pour placer le gîte.", "ko");
  } finally { bouton.disabled = false; bouton.textContent = "📍 Localiser"; }
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  const donnees = Object.fromEntries(new FormData(form));
  if (!donnees.nom.trim()) return message("Le nom est obligatoire.", "ko");
  const id = donnees.id; delete donnees.id;
  const bouton = $("#enregistrer"); bouton.disabled = true;
  try {
    const res = await api(id ? "/admin/api/gites/" + id : "/admin/api/gites",
      { method: id ? "PUT" : "POST", body: JSON.stringify(donnees) });
    vider();
    await charger();
    const g = res.gite;
    if (g.latitude !== null) carte.setView([g.latitude, g.longitude], Math.max(carte.getZoom(), 13));
    message(res.avertissement || "« " + g.nom + " » enregistré et affiché sur la carte du site.", res.avertissement ? "info" : "ok");
  } catch (err) { message(err.message, "ko"); }
  finally { bouton.disabled = false; }
});

$("#annuler").addEventListener("click", () => { vider(); $("#message").textContent = ""; });

$("#liste").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  const id = +b.dataset.id, g = gites.find(x => x.id === id);
  try {
    if (b.dataset.action === "editer") return editer(id);
    if (b.dataset.action === "supprimer") {
      if (!confirm("Supprimer « " + g.nom + " » ?")) return;
      await api("/admin/api/gites/" + id, { method: "DELETE" });
      if (edition === id) vider();
      await charger();
      return message("« " + g.nom + " » supprimé.", "ok");
    }
    gites = await api("/admin/api/gites/" + id + "/deplacer", { method: "POST", body: JSON.stringify({ sens: b.dataset.action }) });
    dessiner();
  } catch (err) { message(err.message, "ko"); }
});

charger(true).catch(e => message(e.message, "ko"));
</script>`;

  return gabarit(titre, "gites", corps, tete);
}
