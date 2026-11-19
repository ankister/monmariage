/**
 * Les 21 chambres du lieu de réception (bâtiment A), d'après le plan d'architecte.
 * Insérées une seule fois (table vide) ; tout est ensuite modifiable dans l'admin, sauf la géométrie du plan.
 *
 * capacity : nombre total de couchages (lit double = 2, lit simple / enfant / bébé = 1)
 * x, y, w, h : position sur le plan SVG (viewBox 1000 × 430)
 * bed_icon : schéma de lits dessiné sur le plan
 */
'use strict';

const RDC = 'rdc';
const ETAGE = 'etage';
const PRIV_RDC = 'Salle d’eau privative (douche, lavabo)';
const SHARED = 'Sanitaires partagés à l’étage (douches et WC)';

// [code, nom, nom court, étage, surface, capacité, lits, sanitaires, privative, lit bébé, description, x, y, w, h, icône]
const ROWS = [
  // ----- Rez-de-chaussée : 22 adultes + 1 enfant + 1 bébé = 24 couchages -----
  ['ch1', 'Chambre 1', 'CH. 1', RDC, '18,50 m²', 3, '1 lit double + 1 lit simple', 'Salle de bain privative (SdB 1, douche et WC)', 1, 0,
    'Façade nord, accès direct à sa salle de bain, grand placard.', 155, 26, 145, 148, 'double+single'],
  ['ch2', 'Chambre 2', 'CH. 2', RDC, '19,30 m²', 3, '1 lit double + 1 lit simple', 'Salle de bain privative (SdB 2, douche et WC)', 1, 0,
    'Façade nord, spacieuse et lumineuse.', 382, 26, 148, 148, 'double+single'],
  ['ch3', 'Chambre 3', 'CH. 3', RDC, '13,50 m²', 2, '2 lits simples', PRIV_RDC, 1, 0,
    'Aile est, façade nord, au calme.', 645, 26, 112, 148, 'twin'],
  ['ch4', 'Chambre 4', 'CH. 4', RDC, '13,60 m²', 2, '2 lits simples', PRIV_RDC, 1, 0,
    'Aile est, façade nord.', 757, 26, 112, 148, 'twin'],
  ['ch5', 'Chambre 5', 'CH. 5', RDC, '11,00 m²', 2, '1 lit double', PRIV_RDC, 1, 0,
    'Angle nord-est, double exposition.', 869, 26, 105, 148, 'double'],
  ['ch6', 'Chambre 6', 'CH. 6', RDC, '13,90 m²', 3, '1 lit double + 1 lit enfant', 'Salle de bain privative (SdB 6, douche et WC)', 1, 0,
    'Chambre familiale côté sud-ouest.', 110, 256, 140, 148, 'double+child'],
  ['ch7', 'Chambre 7', 'CH. 7', RDC, '14,20 m²', 3, '1 lit double + 1 lit bébé', PRIV_RDC, 1, 1,
    'Façade sud, équipée d’un lit bébé.', 250, 256, 125, 148, 'double+baby'],
  ['ch8', 'Chambre 8', 'CH. 8', RDC, '12,30 m²', 2, '1 lit double', PRIV_RDC, 1, 0,
    'Façade sud, proche de l’escalier.', 375, 256, 115, 148, 'double'],
  ['ch9', 'Chambre 9', 'CH. 9', RDC, '12,20 m²', 2, '1 lit double', PRIV_RDC, 1, 0,
    'Aile est, façade sud.', 750, 256, 114, 148, 'double'],
  ['ch10', 'Chambre 10', 'CH. 10', RDC, '9,60 m²', 2, '1 lit double', PRIV_RDC, 1, 0,
    'Angle sud-est.', 864, 256, 110, 148, 'double'],

  // ----- Étage : 34 adultes + 2 enfants + 2 bébés = 38 couchages -----
  ['ch11', 'Dortoir 11', 'DORTOIR 11', ETAGE, '26,60 m²', 5, '5 lits simples', SHARED, 0, 0,
    'Grand dortoir nord-ouest, idéal pour une bande d’amis.', 26, 26, 170, 148, 'dorm5'],
  ['ch13', 'Chambre 13', 'CH. 13', ETAGE, '18,60 m²', 4, '2 lits doubles', SHARED, 0, 0,
    'Grande chambre façade nord.', 196, 26, 132, 148, 'double2'],
  ['ch14', 'Chambre 14', 'CH. 14', ETAGE, '18,30 m²', 3, '1 lit double + 1 lit bébé', SHARED, 0, 1,
    'Chambre parentale façade nord, à côté des douches.', 328, 26, 126, 148, 'double+baby'],
  ['ch16', 'Chambre 16', 'CH. 16', ETAGE, '13,60 m²', 3, '1 lit double + 1 lit enfant', SHARED, 0, 0,
    'À côté de la kitchenette, idéale pour une jeune famille.', 656, 26, 106, 148, 'double+child'],
  ['ch17', 'Chambre 17', 'CH. 17', ETAGE, '15,20 m²', 4, '2 lits doubles', SHARED, 0, 0,
    'Façade nord-est.', 762, 26, 108, 148, 'double2'],
  ['ch18', 'Chambre 18', 'CH. 18', ETAGE, '12,40 m²', 3, '1 lit double + 1 lit simple', SHARED, 0, 0,
    'Angle nord-est.', 870, 26, 104, 148, 'double+single'],
  ['ch12', 'Dortoir 12', 'DORTOIR 12', ETAGE, '23,80 m²', 5, '5 lits simples', SHARED, 0, 0,
    'Grand dortoir sud-ouest, juste à côté des sanitaires.', 26, 256, 170, 148, 'dorm5'],
  ['ch15', 'Chambre 15', 'CH. 15', ETAGE, '12,60 m²', 3, '1 lit double + 1 lit simple', SHARED, 0, 0,
    'Façade sud, près de l’escalier.', 336, 256, 118, 148, 'double+single'],
  ['ch19', 'Chambre 19', 'CH. 19', ETAGE, '14,10 m²', 3, '1 lit double + 1 lit bébé', SHARED, 0, 1,
    'Façade sud, équipée d’un lit bébé.', 656, 256, 106, 148, 'double+baby'],
  ['ch20', 'Chambre 20', 'CH. 20', ETAGE, '14,00 m²', 3, '1 lit double + 1 lit simple', SHARED, 0, 0,
    'Façade sud.', 762, 256, 108, 148, 'double+single'],
  ['ch21', 'Chambre 21', 'CH. 21', ETAGE, '12,30 m²', 2, '1 lit double', SHARED, 0, 0,
    'Angle sud-est, calme et lumineux.', 870, 256, 104, 148, 'double'],
];

function defaultRooms() {
  return ROWS.map((r, i) => ({
    code: r[0], name: r[1], short_name: r[2], floor: r[3], area: r[4], capacity: r[5], beds: r[6], bath: r[7],
    private_bath: r[8], baby_bed: r[9], description: r[10], x: r[11], y: r[12], w: r[13], h: r[14], bed_icon: r[15], sort: i,
  }));
}

module.exports = { defaultRooms };
