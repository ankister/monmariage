/**
 * Données d'exemple insérées au premier démarrage.
 * Tout est modifiable ensuite depuis l'interface d'administration (/admin).
 */
'use strict';

function defaultContent() {
  return {
    couple: 'Pauline & Antoine',
    // Date et heure locales (fuseau ci-dessous) du début de la cérémonie
    date: '2028-08-19T14:30',
    timezone: 'Europe/Paris',
    duration_hours: 12, // utilisé pour le fichier agenda .ics
    rsvp_deadline: '2028-06-30',
    welcome:
      "Nous avons la joie de vous annoncer notre mariage ! Vous trouverez sur ce site toutes les informations pratiques : programme, lieux, menu et hébergements. Merci de nous confirmer votre présence avant la date limite.",
    contact_email: 'contact@paulineetantoine.fr',
    contact_phone: '',
    nights: ['Vendredi 18 août', 'Samedi 19 août', 'Dimanche 20 août'],
    theme: {
      title: 'Champêtre chic',
      description:
        "Une journée simple et lumineuse, entre fleurs des champs, bois naturel et lumières douces. Nous rêvons d'une ambiance de fête de village, élégante mais sans chichis.",
      dress_code:
        'Tenue de cocktail, couleurs claires ou pastel bienvenues. Prévoyez des chaussures confortables : la soirée se passe en partie sur l’herbe !',
      colors: ['#6f7f5e', '#c9a46c', '#efe6d8', '#b5654a'],
    },
    menu_intro: 'Le repas est préparé par un traiteur local avec des produits de saison.',
    menu: [
      { title: "Vin d'honneur", items: ['Pièces cocktail salées', 'Bar à fromages de la région', 'Citronnade maison'] },
      { title: 'Entrée', items: ['Velouté de petits pois, menthe fraîche', 'Option végétarienne : idem'] },
      { title: 'Plat', items: ['Suprême de volaille, jus corsé', 'Option végétarienne : risotto aux asperges'] },
      { title: 'Dessert', items: ['Pièce montée', 'Buffet de douceurs'] },
    ],
    menu_note: 'Allergies ou régime particulier ? Indiquez-le dans le formulaire de réponse.',
    // Questions fréquentes : une question sans réponse n'est pas affichée sur le site
    faq: [
      { q: 'Puis-je venir avec des enfants ?', a: '' },
      { q: 'Quelles sont les possibilités de stationnement ?', a: '' },
      { q: 'Le lieu est-il accessible ?', a: '' },
    ],
    options: {
      rsvp_open: true,
      rsvp_guest_list_only: true, // seuls les noms de la liste d'invités peuvent répondre
      games: true,                // bouton « Jeux » dans le menu du site
    },
    // Logo affiché au-dessus de « Nous nous marions » : ornement par défaut, image envoyée ou code HTML/CSS
    logo: {
      mode: 'ornament', // ornament | image | html
      image: '',        // nom du fichier envoyé depuis l'admin
      height: 110,      // hauteur d'affichage de l'image, en pixels
      html: '',
    },
    // Page « Dormir sur place » (chambres du lieu de réception)
    onsite: {
      open: true,
      venue: 'Gîte du Grand Breuil',
      intro:
        'Le gîte du Grand Breuil, où a lieu la réception, compte 21 chambres. Choisissez la vôtre sur le plan, puis indiquez vos nuits : vendredi et samedi, ou samedi uniquement.',
      note: 'Les modalités de règlement vous seront communiquées une fois votre réservation validée.',
    },
  };
}

function defaultPlaces() {
  return [
    {
      kind: 'mairie', name: 'Mairie (exemple)', address: '18000 Bourges',
      lat: 47.0815, lng: 2.3980, time: '14h30', description: 'Cérémonie civile.',
    },
    {
      kind: 'eglise', name: 'Église (exemple)', address: '18000 Bourges',
      lat: 47.0822, lng: 2.3995, time: '15h30', description: 'Cérémonie religieuse.',
    },
    {
      kind: 'salle', name: 'Salle de réception (exemple)', address: '18000 Bourges',
      lat: 47.0700, lng: 2.4200, time: '18h00', description: "Vin d'honneur, dîner et soirée dansante.",
    },
  ];
}

function defaultGites() {
  return [
    {
      name: 'Gîte des Tilleuls (exemple)', address: '18000 Bourges',
      lat: 47.0680, lng: 2.4250, capacity: 10, price: '35 € / pers. / nuit', contact: '06 00 00 00 00',
      url: '', description: 'À 5 minutes à pied de la salle. Draps fournis.', bookable: 1,
    },
    {
      name: 'La Grange (exemple)', address: '18000 Bourges',
      lat: 47.0750, lng: 2.4100, capacity: 6, price: '40 € / pers. / nuit', contact: 'lagrange@example.com',
      url: '', description: 'Petit-déjeuner inclus.', bookable: 1,
    },
    {
      name: 'Hôtel du Centre (exemple)', address: '18000 Bourges',
      lat: 47.0835, lng: 2.3960, capacity: 20, price: 'à partir de 75 € / chambre', contact: '05 00 00 00 00',
      url: 'https://example.com', description: 'Réservation directement auprès de l’hôtel.', bookable: 0,
    },
  ];
}

module.exports = { defaultContent, defaultPlaces, defaultGites };
