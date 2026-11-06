// Géocodage d'une adresse : Géoplateforme IGN (Base Adresse Nationale) puis Nominatim en secours
const IGN_URL = process.env.GEOCODER_IGN_URL || "https://data.geopf.fr/geocodage/search";
const NOMINATIM_URL = process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org/search";
// Nominatim exige un User-Agent identifiant l'application et un moyen de contact
const USER_AGENT = process.env.GEOCODER_USER_AGENT || "monmariage/1.0 (site de mariage auto-hébergé)";

async function getJson(url, entetes = {}) {
  const rep = await fetch(url, { headers: { Accept: "application/json", ...entetes }, signal: AbortSignal.timeout(8000) });
  if (!rep.ok) throw new Error(`HTTP ${rep.status}`);
  return rep.json();
}

async function ign(q) {
  // Index « address » par défaut : même format de réponse que l'ancienne API Adresse (GeoJSON)
  const url = `${IGN_URL}?${new URLSearchParams({ q, limit: "5" })}`;
  const json = await getJson(url);
  return (json.features || [])
    .filter(f => Array.isArray(f.geometry?.coordinates))
    .map(f => {
      const p = f.properties || {};
      const commune = [p.city].flat()[0] || "";
      return {
        libelle: p.label || [p.name, p.postcode, commune].filter(Boolean).join(" ") || q,
        commune,
        latitude: f.geometry.coordinates[1],
        longitude: f.geometry.coordinates[0],
        score: typeof p.score === "number" ? Math.round(p.score * 100) : null,
        source: "IGN",
      };
    });
}

async function nominatim(q) {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q, format: "jsonv2", limit: "5", addressdetails: "1", "accept-language": "fr",
  })}`;
  const json = await getJson(url, { "User-Agent": USER_AGENT });
  return (Array.isArray(json) ? json : []).map(r => ({
    libelle: r.display_name,
    commune: r.address?.village || r.address?.town || r.address?.city || r.address?.municipality || "",
    latitude: Number(r.lat),
    longitude: Number(r.lon),
    score: null,
    source: "OpenStreetMap",
  }));
}

// Renvoie une liste de propositions (meilleure en premier) ; liste vide si rien trouvé
export async function geocoder(adresse) {
  const q = String(adresse || "").trim().slice(0, 200);
  if (q.length < 3) return [];
  const erreurs = [];
  for (const source of [ign, nominatim]) {
    try {
      const res = (await source(q)).filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
      if (res.length) return res;
    } catch (e) {
      erreurs.push(`${source.name} : ${e.message}`);
    }
  }
  if (erreurs.length === 2) throw new Error(`Géocodage indisponible (${erreurs.join(" ; ")})`);
  return [];
}
