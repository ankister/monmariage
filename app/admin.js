// Rendu de l'espace admin et export CSV
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const dateFr = iso => {
  const d = new Date(iso.replace(" ", "T") + "Z");
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
};

// Gabarit commun aux pages d'admin : styles + navigation
export function gabarit(titre, actif, corps, tete = "") {
  const lien = (href, cle, texte) => `<a href="${href}"${cle === actif ? ' class="actif"' : ""}>${texte}</a>`;
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(titre)}</title><link rel="icon" href="/favicon.svg">${tete}
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; background: #f6f4ef; color: #333; }
  .entete-admin { background: #fff; border-bottom: 1px solid #e3ddd0; }
  .entete-admin nav { max-width: 1300px; margin: 0 auto; padding: .7rem 1.5rem; display: flex; gap: 1.4rem; align-items: center; }
  .entete-admin nav a { color: #555; text-decoration: none; padding: .3rem 0; border-bottom: 2px solid transparent; }
  .entete-admin nav a.actif { color: #5f6f52; border-color: #5f6f52; font-weight: 600; }
  .entete-admin nav .site { margin-left: auto; font-size: .9rem; }
  main { max-width: 1300px; margin: 0 auto; padding: 1.5rem; }
  h1 { font-weight: 600; margin: 0 0 1rem; } h2 { margin: 2rem 0 .6rem; font-size: 1.15rem; }
  .tuiles { display: flex; gap: .8rem; flex-wrap: wrap; }
  .tuile { background: #fff; border: 1px solid #e3ddd0; border-radius: 8px; padding: .8rem 1.2rem; min-width: 130px; }
  .tuile b { display: block; font-size: 1.8rem; color: #5f6f52; } .tuile span { color: #777; font-size: .85rem; }
  .barre { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; }
  .btn { background: #5f6f52; color: #fff; padding: .5rem 1rem; border-radius: 6px; text-decoration: none; border: 0;
         font: inherit; cursor: pointer; display: inline-block; }
  .btn:hover { background: #4d5b42; } .btn:disabled { opacity: .6; cursor: wait; }
  .btn.secondaire { background: #fff; color: #5f6f52; border: 1px solid #b9c3ad; } .btn.secondaire:hover { background: #f2f4ee; }
  .btn.danger { background: #fff; color: #9b2c2c; border: 1px solid #e5b4b4; }
  .defile { overflow-x: auto; background: #fff; border: 1px solid #e3ddd0; border-radius: 8px; }
  table { border-collapse: collapse; width: 100%; } th, td { padding: .5rem .7rem; text-align: left; vertical-align: top; border-bottom: 1px solid #eee; }
  th { background: #faf8f3; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: #666; white-space: nowrap; }
  tr.non td { color: #999; } small { color: #888; }
  td button, .icone { background: none; border: 0; cursor: pointer; font-size: 1rem; opacity: .55; padding: .1rem .25rem; }
  td button:hover, .icone:hover { opacity: 1; }
  ul { margin: .3rem 0; padding-left: 1.2rem; }
</style></head><body>
<header class="entete-admin"><nav>
  ${lien("/admin", "reponses", "Réponses")}
  ${lien("/admin/gites", "gites", "Gîtes")}
  <a class="site" href="/" target="_blank">Voir le site ↗</a>
</nav></header>
<main>${corps}</main></body></html>`;
}

export function statistiques(reponses) {
  const presents = reponses.filter(r => r.present);
  const parGite = {};
  for (const r of presents) {
    if (!r.gite) continue;
    const cle = r.gite === "autre" ? "Autre hébergement" : r.gite === "aucun" ? "Pas besoin de logement" : r.gite;
    parGite[cle] ??= { foyers: 0, personnes: 0, noms: [] };
    parGite[cle].foyers++;
    parGite[cle].personnes += r.adultes + r.enfants;
    parGite[cle].noms.push(r.nom);
  }
  return {
    reponses: reponses.length,
    foyersPresents: presents.length,
    absents: reponses.length - presents.length,
    adultes: presents.reduce((s, r) => s + r.adultes, 0),
    enfants: presents.reduce((s, r) => s + r.enfants, 0),
    brunch: presents.filter(r => r.brunch === 1).reduce((s, r) => s + r.adultes + r.enfants, 0),
    regimes: presents.filter(r => r.regime),
    parGite,
  };
}

export function pageAdmin(reponses, contenu) {
  const st = statistiques(reponses);
  const titre = contenu.maries ? `Réponses — ${contenu.maries}` : "Réponses";
  const capacites = Object.fromEntries((contenu.gites || []).map(g => [g.nom, g.capacite]));

  const tuile = (valeur, libelle) => `<div class="tuile"><b>${valeur}</b><span>${libelle}</span></div>`;

  const lignesGites = Object.entries(st.parGite)
    .sort((a, b) => b[1].personnes - a[1].personnes)
    .map(([nom, g]) => `<tr><td>${esc(nom)}</td><td>${g.personnes}${capacites[nom] ? ` <small>/ ${esc(capacites[nom])}</small>` : ""}</td>
      <td>${g.noms.map(esc).join(", ")}</td></tr>`).join("");

  const lignes = reponses.map(r => `
    <tr class="${r.present ? "oui" : "non"}">
      <td>${dateFr(r.cree_le)}</td>
      <td><b>${esc(r.nom)}</b>${r.noms_accompagnants ? `<br><small>${esc(r.noms_accompagnants)}</small>` : ""}</td>
      <td>${r.present ? "✅" : "❌"}</td>
      <td>${r.present ? r.adultes : ""}</td>
      <td>${r.present ? r.enfants : ""}</td>
      <td>${esc(r.regime)}</td>
      <td>${esc(r.gite === "autre" ? "Autre" : r.gite === "aucun" ? "Aucun" : r.gite)}</td>
      ${st.brunch || reponses.some(x => x.brunch !== null) ? `<td>${r.brunch === 1 ? "oui" : r.brunch === 0 ? "non" : ""}</td>` : ""}
      <td>${esc(r.email)}${r.telephone ? `<br>${esc(r.telephone)}` : ""}</td>
      <td>${esc(r.message)}</td>
      <td><form method="post" action="/admin/supprimer/${r.id}" onsubmit="return confirm('Supprimer la réponse de ${esc(r.nom).replace(/'/g, "\\'")} ?')">
        <button title="Supprimer">🗑</button></form></td>
    </tr>`).join("");

  const avecBrunch = reponses.some(x => x.brunch !== null);

  return gabarit(titre, "reponses", `
<div class="barre"><h1>${esc(titre)}</h1><a class="btn" href="/admin/export.csv">⬇ Export CSV (Excel)</a></div>
<div class="tuiles">
  ${tuile(st.adultes + st.enfants, "personnes présentes")}
  ${tuile(st.adultes, "adultes")}
  ${tuile(st.enfants, "enfants")}
  ${tuile(st.foyersPresents, "réponses « présent »")}
  ${tuile(st.absents, "absents")}
  ${avecBrunch ? tuile(st.brunch, "au brunch") : ""}
</div>

${lignesGites ? `<h2>Hébergements</h2><div class="defile"><table>
  <tr><th>Gîte</th><th>Personnes</th><th>Qui</th></tr>${lignesGites}</table></div>` : ""}

${st.regimes.length ? `<h2>Régimes et allergies (pour le traiteur)</h2><ul>
  ${st.regimes.map(r => `<li><b>${esc(r.nom)}</b> : ${esc(r.regime)}</li>`).join("")}</ul>` : ""}

<h2>Toutes les réponses (${st.reponses})</h2>
<div class="defile"><table>
<tr><th>Date</th><th>Nom</th><th>Présent</th><th>Adultes</th><th>Enfants</th><th>Régime</th><th>Gîte</th>
${avecBrunch ? "<th>Brunch</th>" : ""}<th>Contact</th><th>Message</th><th></th></tr>
${lignes || `<tr><td colspan="11">Aucune réponse pour l'instant.</td></tr>`}
</table></div>`);
}

// CSV au format Excel français : séparateur « ; » et BOM UTF-8 pour les accents
export function csvReponses(reponses) {
  const colonnes = [
    ["cree_le", "Date"], ["nom", "Nom"], ["present", "Présent"], ["adultes", "Adultes"], ["enfants", "Enfants"],
    ["noms_accompagnants", "Accompagnants"], ["regime", "Régime / allergies"], ["gite", "Gîte"],
    ["brunch", "Brunch"], ["email", "Email"], ["telephone", "Téléphone"], ["message", "Message"],
  ];
  const cellule = v => {
    const s = String(v ?? "");
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const formater = (cle, r) => {
    if (cle === "present") return r.present ? "oui" : "non";
    if (cle === "brunch") return r.brunch === 1 ? "oui" : r.brunch === 0 ? "non" : "";
    if (cle === "cree_le") return dateFr(r.cree_le);
    return r[cle];
  };
  const lignes = [colonnes.map(c => c[1]).join(";")]
    .concat(reponses.map(r => colonnes.map(([cle]) => cellule(formater(cle, r))).join(";")));
  return "﻿" + lignes.join("\r\n") + "\r\n";
}
