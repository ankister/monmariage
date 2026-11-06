// Rendu du site à partir de /api/contenu (fichier contenu.json monté dans le conteneur)
"use strict";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = sel => document.querySelector(sel);
const itineraire = (lat, lon) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
const waze = (lat, lon) => `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
const aDesCoord = o => o && Number.isFinite(+o.latitude) && Number.isFinite(+o.longitude);

// Distance à vol d'oiseau en km (formule de haversine)
function distanceKm(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function fondCarte(div, options = {}) {
  const carte = L.map(div, { scrollWheelZoom: false, ...options });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">contributeurs OpenStreetMap</a>',
  }).addTo(carte);
  // Le zoom à la molette ne s'active qu'après un clic, pour ne pas bloquer le défilement de la page
  carte.on("click", () => carte.scrollWheelZoom.enable());
  carte.on("mouseout", () => carte.scrollWheelZoom.disable());
  return carte;
}

const icone = (texte, classe = "") => L.divIcon({
  className: "", html: `<div class="marqueur ${classe}"><span>${texte}</span></div>`,
  iconSize: classe ? [38, 38] : [30, 30], iconAnchor: classe ? [19, 38] : [15, 30], popupAnchor: [0, -32],
});

function compteARebours(dateIso) {
  const cible = new Date(dateIso).getTime();
  const el = $("#compte");
  const maj = () => {
    const d = cible - Date.now();
    if (d <= 0) { el.innerHTML = "<p>C'est le grand jour ! 🎉</p>"; return; }
    const j = Math.floor(d / 864e5), h = Math.floor(d / 36e5) % 24, m = Math.floor(d / 6e4) % 60;
    el.innerHTML = [[j, "jours"], [h, "heures"], [m, "minutes"]].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  };
  maj(); setInterval(maj, 30000);
}

// ---------- Sections ----------
function sectionLieu(l) {
  return `
    <div class="lieu">
      <div class="carte">
        <h3>${esc(l.nom)}</h3>
        <p>${esc(l.adresse)}</p>
        ${l.description ? `<p>${esc(l.description)}</p>` : ""}
        ${l.acces?.length ? `<ul class="puces">${l.acces.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}
        ${aDesCoord(l) ? `<div class="boutons">
          <a class="btn" href="${itineraire(l.latitude, l.longitude)}" target="_blank" rel="noopener">Itinéraire</a>
          <a class="btn contour" href="${waze(l.latitude, l.longitude)}" target="_blank" rel="noopener">Waze</a></div>` : ""}
        ${l.photo ? `<img class="photo-lieu" src="${esc(l.photo)}" alt="${esc(l.nom)}" loading="lazy">` : ""}
      </div>
      ${aDesCoord(l) ? `<div id="carte-lieu" class="carte-osm" role="region" aria-label="Carte du lieu"></div>` : ""}
    </div>`;
}

function sectionGites(c) {
  const lieu = c.lieu;
  return `
    ${c.gites_intro ? `<p class="intro">${esc(c.gites_intro)}</p>` : ""}
    <div id="carte-gites" class="carte-osm" role="region" aria-label="Carte des hébergements"></div>
    <div class="gites">${c.gites.map((g, i) => {
      const dist = g.distance || (aDesCoord(lieu) && aDesCoord(g) ? `${distanceKm(lieu, g).toFixed(1).replace(".", ",")} km à vol d'oiseau` : "");
      return `
      <article class="carte gite" data-index="${i}" tabindex="0">
        <span class="num">${i + 1}</span>
        ${g.photo ? `<img src="${esc(g.photo)}" alt="" loading="lazy">` : ""}
        <h3>${esc(g.nom)}</h3>
        <dl>
          ${g.commune ? `<dt>Commune</dt><dd>${esc(g.commune)}</dd>` : ""}
          ${dist ? `<dt>Distance</dt><dd>${esc(dist)}</dd>` : ""}
          ${g.capacite ? `<dt>Capacité</dt><dd>${esc(g.capacite)}</dd>` : ""}
          ${g.prix ? `<dt>Prix</dt><dd>${esc(g.prix)}</dd>` : ""}
          ${g.telephone ? `<dt>Tél.</dt><dd><a href="tel:${esc(g.telephone.replace(/\s/g, ""))}">${esc(g.telephone)}</a></dd>` : ""}
        </dl>
        ${g.note ? `<div class="remarque">${esc(g.note)}</div>` : ""}
        <div class="boutons">
          ${g.lien ? `<a class="btn" href="${esc(g.lien)}" target="_blank" rel="noopener">Réserver</a>` : ""}
          ${aDesCoord(g) ? `<a class="btn contour" href="${itineraire(g.latitude, g.longitude)}" target="_blank" rel="noopener">Y aller</a>` : ""}
        </div>
      </article>`;
    }).join("")}</div>`;
}

function sectionProgramme(p) {
  return `<ul class="programme carte">${p.map(e => `
    <li><span class="heure">${esc(e.heure)}</span>
        <span><b>${esc(e.titre)}</b>${e.detail ? `<br><span class="detail">${esc(e.detail)}</span>` : ""}</span></li>`).join("")}</ul>`;
}

function sectionMenu(c) {
  return `<div class="menu carte">${c.menu.map(m => `
    <h3>${esc(m.categorie)}</h3>${m.plats.map(p => `<p>${esc(p)}</p>`).join("")}`).join("")}</div>
    ${c.menu_note ? `<p class="note">${esc(c.menu_note)}</p>` : ""}`;
}

function sectionRsvp(c) {
  const r = c.rsvp || {};
  const limite = r.date_limite ? new Date(r.date_limite + "T23:59:59") : null;
  if (limite && new Date() > limite) {
    return `<div class="carte rsvp-form merci"><p>Les réponses sont closes</p><p>${esc(c.contact || "")}</p></div>`;
  }
  const optionsGites = (c.gites || []).map(g => `<option value="${esc(g.nom)}">${esc(g.nom)}</option>`).join("");
  return `
    ${limite ? `<p class="intro">Merci de nous répondre avant le <b>${limite.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</b>.</p>` : ""}
    <form class="carte rsvp-form" id="rsvp" novalidate>
      <div class="champ"><label for="nom">Votre nom et prénom</label>
        <input type="text" id="nom" name="nom" required maxlength="120" autocomplete="name"></div>

      <div class="champ"><span class="libelle">Serez-vous des nôtres ?</span>
        <div class="choix">
          <label><input type="radio" name="present" value="oui" required> Oui, avec joie !</label>
          <label><input type="radio" name="present" value="non"> Non, désolé·e</label>
        </div></div>

      <div id="si-present" hidden>
        <div class="deux">
          <div class="champ"><label for="adultes">Adultes <small>(vous compris)</small></label>
            <input type="number" id="adultes" name="adultes" min="1" max="20" value="1"></div>
          <div class="champ"><label for="enfants">Enfants</label>
            <input type="number" id="enfants" name="enfants" min="0" max="20" value="0"></div>
        </div>
        <div class="champ"><label for="noms_accompagnants">Prénoms des personnes qui vous accompagnent <small>(facultatif)</small></label>
          <input type="text" id="noms_accompagnants" name="noms_accompagnants" maxlength="500"></div>
        <div class="champ"><label for="regime">Régime alimentaire ou allergies <small>(facultatif)</small></label>
          <input type="text" id="regime" name="regime" maxlength="500" placeholder="Végétarien, sans gluten, allergie aux fruits à coque…"></div>
        ${c.gites?.length ? `<div class="champ"><label for="gite">Où dormirez-vous ? <small>(facultatif)</small></label>
          <select id="gite" name="gite">
            <option value="">Je ne sais pas encore</option>
            ${optionsGites}
            <option value="autre">Un autre hébergement</option>
            <option value="aucun">Je n'ai pas besoin de logement</option>
          </select></div>` : ""}
        ${r.demander_brunch ? `<div class="champ"><span class="libelle">${esc(r.libelle_brunch || "Serez-vous au brunch le lendemain ?")}</span>
          <div class="choix">
            <label><input type="radio" name="brunch" value="oui"> Oui</label>
            <label><input type="radio" name="brunch" value="non"> Non</label>
          </div></div>` : ""}
      </div>

      <div class="deux">
        <div class="champ"><label for="email">Email <small>(facultatif)</small></label>
          <input type="email" id="email" name="email" maxlength="160" autocomplete="email"></div>
        <div class="champ"><label for="telephone">Téléphone <small>(facultatif)</small></label>
          <input type="tel" id="telephone" name="telephone" maxlength="40" autocomplete="tel"></div>
      </div>
      <div class="champ"><label for="message">Un petit mot pour nous ? <small>(facultatif)</small></label>
        <textarea id="message" name="message" maxlength="2000"></textarea></div>
      <input class="piege" type="text" name="site_web" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn" type="submit">Envoyer ma réponse</button>
      <div id="retour" role="status"></div>
    </form>`;
}

function sectionInfos(infos) {
  return `<div class="carte">${infos.map(i => `
    <details><summary>${esc(i.question)}</summary><p>${esc(i.reponse)}</p></details>`).join("")}</div>`;
}

// ---------- Cartes ----------
function initCarteLieu(l) {
  if (!$("#carte-lieu")) return;
  const carte = fondCarte("carte-lieu").setView([l.latitude, l.longitude], 14);
  L.marker([l.latitude, l.longitude], { icon: icone("♥", "lieu-principal") })
    .addTo(carte).bindPopup(`<b>${esc(l.nom)}</b><br>${esc(l.adresse)}`);
}

function initCarteGites(c) {
  if (!$("#carte-gites")) return;
  const carte = fondCarte("carte-gites");
  const points = [];
  if (aDesCoord(c.lieu)) {
    L.marker([c.lieu.latitude, c.lieu.longitude], { icon: icone("♥", "lieu-principal"), zIndexOffset: 1000 })
      .addTo(carte).bindPopup(`<b>${esc(c.lieu.nom)}</b><br>Lieu du mariage`);
    points.push([c.lieu.latitude, c.lieu.longitude]);
  }
  const marqueurs = c.gites.map((g, i) => {
    if (!aDesCoord(g)) return null;
    points.push([g.latitude, g.longitude]);
    return L.marker([g.latitude, g.longitude], { icon: icone(i + 1) }).addTo(carte).bindPopup(`
      <b>${esc(g.nom)}</b><br>${[g.capacite, g.prix].filter(Boolean).map(esc).join(" · ")}
      ${g.lien ? `<br><a href="${esc(g.lien)}" target="_blank" rel="noopener">Réserver</a>` : ""}`)
      .on("click", () => surligner(i, false));
  });
  if (points.length > 1) carte.fitBounds(points, { padding: [40, 40] });
  else if (points.length === 1) carte.setView(points[0], 13);

  function surligner(i, voler = true) {
    document.querySelectorAll(".gite").forEach(el => el.classList.toggle("actif", +el.dataset.index === i));
    if (voler && marqueurs[i]) {
      $("#carte-gites").scrollIntoView({ behavior: "smooth", block: "center" });
      carte.flyTo(marqueurs[i].getLatLng(), 14, { duration: .8 });
      marqueurs[i].openPopup();
    }
  }
  document.querySelectorAll(".gite").forEach(el => {
    const action = e => { if (!e.target.closest("a")) surligner(+el.dataset.index); };
    el.addEventListener("click", action);
    el.addEventListener("keydown", e => { if (e.key === "Enter") action(e); });
  });
}

// ---------- Formulaire RSVP ----------
function initRsvp() {
  const form = $("#rsvp");
  if (!form) return;
  const blocPresent = $("#si-present");
  form.addEventListener("change", e => {
    if (e.target.name === "present") blocPresent.hidden = e.target.value !== "oui";
  });
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const retour = $("#retour");
    const donnees = Object.fromEntries(new FormData(form));
    if (!donnees.nom?.trim()) return afficher("Merci d'indiquer votre nom.", false);
    if (!donnees.present) return afficher("Merci d'indiquer si vous serez présent·e.", false);
    const bouton = form.querySelector("button[type=submit]");
    bouton.disabled = true; bouton.textContent = "Envoi…";
    try {
      const rep = await fetch("/api/rsvp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees),
      });
      const json = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(json.erreur || `Erreur ${rep.status}`);
      form.outerHTML = `<div class="carte rsvp-form merci">
        <p>${json.present ? "Merci, à très bientôt ! 🥂" : "Merci de nous avoir prévenus"}</p>
        <p>${json.present ? "Votre réponse est bien enregistrée." : "Vous nous manquerez, on pensera à vous."}</p>
        <p><small>Une erreur ? Répondez à nouveau avec le même nom : votre nouvelle réponse remplacera la précédente.</small></p></div>`;
    } catch (err) {
      afficher(err.message || "Impossible d'envoyer, réessayez dans un instant.", false);
      bouton.disabled = false; bouton.textContent = "Envoyer ma réponse";
    }
    function afficher(texte, ok) { retour.className = `message-form ${ok ? "ok" : "ko"}`; retour.textContent = texte; }
  });
}

// ---------- Assemblage ----------
function rendre(c) {
  document.title = `Mariage de ${c.maries}`;
  const h = $("#entete");
  if (c.photo_couverture) {
    h.classList.add("photo");
    h.style.backgroundImage = `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.35)), url('${encodeURI(c.photo_couverture)}')`;
  }
  h.innerHTML = `<p class="accroche">${esc(c.accroche)}</p><h1>${esc(c.maries)}</h1>
    <p class="date">${esc(c.date_texte)}</p><div id="compte"></div>
    <a class="btn" href="#reponse">Répondre à l'invitation</a>`;
  if (c.date) compteARebours(c.date);

  const sections = [];
  if (c.lieu) sections.push(["lieu", "Le lieu", sectionLieu(c.lieu)]);
  if (c.programme?.length) sections.push(["programme", "Programme", sectionProgramme(c.programme)]);
  if (c.menu?.length) sections.push(["menu", "Menu", sectionMenu(c)]);
  if (c.gites?.length) sections.push(["gites", "Où dormir", sectionGites(c)]);
  sections.push(["reponse", "Votre réponse", sectionRsvp(c)]);
  if (c.infos?.length) sections.push(["infos", "Infos pratiques", sectionInfos(c.infos)]);

  $("#nav").innerHTML = sections.map(([id, titre]) =>
    `<li><a href="#${id}"${id === "reponse" ? ' class="rsvp"' : ""}>${titre}</a></li>`).join("");
  $("#contenu").innerHTML = sections.map(([id, titre, html]) => `<section id="${id}"><h2>${titre}</h2>${html}</section>`).join("");
  $("#pied").innerHTML = `${c.contact ? `<p>${esc(c.contact)}</p>` : ""}<p>${esc(c.maries)} · ${esc(c.date_texte)}</p>`;

  if (c.lieu && aDesCoord(c.lieu)) initCarteLieu(c.lieu);
  if (c.gites?.length) initCarteGites(c);
  initRsvp();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

fetch("/api/contenu", { cache: "no-store" })
  .then(r => r.json().then(j => { if (!r.ok) throw new Error(j.erreur || `HTTP ${r.status}`); return j; }))
  .then(rendre)
  .catch(e => {
    $("#contenu").innerHTML = `<div class="erreur"><b>Le site n'a pas pu se charger.</b><br>${esc(e.message)}</div>`;
  });
