
/* =========================================================
   NEWS-DATA.JS — ÜHINE UUDISTE ANDMEFAIL

   Seda faili kasutavad:
   1) avaleht — news-home.js;
   2) uudiste leht — news.js.

   Uue uudise lisamiseks kopeeri üks objekt ja muuda andmed.

   Kategooriad:
   achievements  = Saavutused
   events        = Sündmused
   initiatives   = Noortealgatused
   opportunities = Võimalused
   ========================================================= */

window.NEWS_CATEGORIES = {
  all: "Kõik",
  achievements: "Saavutused",
  events: "Sündmused",
  initiatives: "Noortealgatused",
  opportunities: "Võimalused"
};

window.NEWS_ITEMS = [
  {
    id: "ida-virumaa-noorte-tunnustusgala-toimub-taas",

    category: "events",
    categoryLabel: "Sündmused",

    date: "2026-06-28",
    displayDate: "28. juuni 2026",

    title: "Ida-Virumaa noorte tunnustusgala toimub taas",

    excerpt:
      "17. oktoobril 2026 toimub Jõhvi Kontserdimajas taas Ida-Virumaa noorte tunnustusgala, kus tunnustatakse piirkonna aktiivseid, ettevõtlikke ja silmapaistvaid noori.",

    image: "/assets/news/tunnustusgala/tunnustusgala-2026.webp",
    imageAlt: "Ida-Virumaa noorte tunnustusgala",

    // Optional: author: "Autori nimi",

    featured: true,
    placeholder: false,
    published: true,

    content: [
      "17. oktoobril 2026 toimub Jõhvi Kontserdimajas taas Ida-Virumaa noorte tunnustusgala – pidulik sündmus, mille eesmärk on märgata ja tunnustada piirkonna aktiivseid, ettevõtlikke ning silmapaistvaid noori.",

      "Tunnustusgala toob kokku noored, noorte toetajad, organisatsioonid ja kogukonna esindajad. Õhtu keskmes on Ida-Virumaa noorte saavutused, julgus, loovus ja panus kohaliku elu arengusse.",

      "Gala kaudu soovime tuua esile inspireerivaid eeskujusid, tutvustada noorte saavutusi ning innustada ka teisi noori oma ideid ellu viima ja kogukonnaelus aktiivselt osalema.",

      "Tunnustuskategooriad:",

      "2026. aastal saab kandidaate esitada kaheteistkümnes kategoorias: aasta noormuusik, aasta noorvabatahtlik, aasta noorsportlane, aasta noorkunstnik, aasta noor visuaalne looja, aasta noortantsija, aasta noornäitleja, aasta noorjuht, aasta noor loodushoidja, aasta noor õppur, aasta noorte tegu ning aasta noor Euroopa väärtuste kandja.",

      "Keda saab kandidaadiks esitada?",

      "Kandidaadiks võib esitada noore, kes on oma tegevuse, saavutuste või algatustega silma paistnud ning andnud positiivse panuse Ida-Virumaa noorte või kohaliku kogukonna arengusse.",

      "Kategoorias „Aasta noorte tegu“ võib tunnustamiseks esitada ka noorterühma, kes on algatanud ja ellu viinud mõjuka projekti, sündmuse või muu olulise ettevõtmise.",

      "Ida-Virumaa noorte tunnustusgala ei ole üksnes auhindade üleandmine. See on ühine pidulik õhtu, kus noorte lood, saavutused ja tulevikuideed saavad tähelepanu, mida need väärivad.",

      "Kandidaadi esitamine:",

      "Esita kandidaat ning aita meil märgata Ida-Virumaa silmapaistvaid noori. Kohtume 17. oktoobril 2026 Jõhvi Kontserdimajas!",

      "https://docs.google.com/forms/d/e/1FAIpQLSeJxa0RjIKa-miMDRpP4hx5gI6USiVyNYKo6N9B6dXmEahfLw/viewform"
    ]
  },


  {
    id: "projektikirjutamise-laager-toimub-esmakordselt",

    category: "events",
    categoryLabel: "Sündmused",

    date: "2026-06-28",
    displayDate: "28. juuni 2026",

    title: "Ida-Virumaa noorte projektikirjutamise laager toimub esmakordselt",

    excerpt:
      "19.–20. septembril 2026 toimub hotellis Toila SPA Hotell esmakordselt Ida-Virumaa noorte projektikirjutamise laager, mis aitab noortel arendada oma ideid ja õppida neid toimivateks projektideks kujundama.",

    image: "/assets/news/laager/laager.jpg",
    imageAlt: "Ida-Virumaa noorte projektikirjutamise laager Toila SPA Hotellis",

    featured: false,
    placeholder: false,
    published: true,

    content: [
      "19.–20. septembril 2026 toimub hotellis Toila SPA Hotell esmakordselt Ida-Virumaa noorte projektikirjutamise laager, mille eesmärk on anda noortele praktilised teadmised ja oskused oma ideede arendamiseks ning projektide ettevalmistamiseks.",

      "Kahepäevane laager loob noortele võimaluse õppida, kuidas muuta esialgne idee selgeks ja teostatavaks projektiks. Osalejad saavad teadmisi projekti eesmärkide sõnastamisest, tegevuste planeerimisest, eelarve koostamisest ja tulemuste hindamisest.",

      "Projektikirjutamine võib esmapilgul tunduda keeruline, kuid laagri jooksul käsitletakse kogu protsessi samm-sammult. Praktilised ülesanded ja meeskonnatöö aitavad osalejatel saadud teadmisi kohe kasutada ning oma ideid edasi arendada.",

      "Laagri oluline osa on kogemuste vahetamine. Osalejad saavad tutvustada oma mõtteid, kuulata teiste noorte ideid ning saada tagasisidet, mis aitab projekte sisukamaks ja realistlikumaks muuta.",

      "Ida-Virumaa noorte projektikirjutamise laager toimub sellisel kujul esimest korda. MTÜ Noortealgatuste Tugi soovib selle algatusega toetada Ida-Virumaa noorte ettevõtlikkust ning suurendada noorte valmisolekut ise projekte algatada ja kogukonna arengusse panustada.",

      "Laager sobib noortele, kes soovivad ellu viia sündmust, koolitust, kogukondlikku algatust või mõnda muud ideed, kuid vajavad selle kavandamisel teadmisi, tuge ja inspiratsiooni.",

      "Lisateavet laagri programmi, osalemise ja registreerimise kohta saab MTÜ Noortealgatuste Tugi projektikirjutamise laagri veebilehelt."
    ]
  },

  {
    id: "avasta-erasmus-voimalused-vitatiimis",

    category: "opportunities",
    categoryLabel: "Võimalused",

    date: "2026-07-01",
    displayDate: "1. juuli 2026",

    title: "Avasta Erasmus+ võimalused VitaTiimis",

    excerpt:
      "8. juulil toimub Narvas VitaTiimis tasuta infokohtumine, kus 15–30-aastased Ida-Virumaa noored saavad tutvuda Erasmus+ programmi võimalustega.",

    image: "/assets/news/erasmus-vitatiim/erasmus-vitatiim.webp",
    imageAlt: "Erasmus+ võimalusi tutvustav noorteüritus VitaTiimis Narvas",

    featured: false,
    placeholder: false,
    published: true,

    content: [
      "Maailm on täis võimalusi ning mõned neist võivad olla mõeldud just sulle.",
      "8. juulil kell 12.00 toimub Narvas VitaTiimis infokohtumine, kus Ida-Virumaa noored saavad tutvuda Erasmus+ programmi pakutavate võimalustega.",
      "Kohtumise käigus saad teada, millised rahvusvahelised noorteprojektid, noortevahetused, koolitused, vabatahtliku tegevuse võimalused ja teised Erasmus+ programmi tegevused sind ootavad.",
      "Üritus on tasuta ja mõeldud kõigile 15–30-aastastele Ida-Virumaa noortele. Varasem rahvusvahelistes projektides osalemise kogemus ei ole vajalik.",
      "Ürituse info:",
      "Kuupäev: 8. juuli 2026",
      "Kellaaeg: 12.00",
      "Asukoht: VitaTiim, Tuleviku tn 7, Narva",
      "Osalemine: tasuta",
      "Vanus: 15–30 aastat",
      "Kohapeal pakutakse osalejatele suupisteid.",
      "Kui soovid osaleda, kuid elad teises Ida-Virumaa linnas, on vajaduse korral võimalik katta ka transpordikulud.",
      "Registreerimislink:",
      "https://docs.google.com/forms/d/e/1FAIpQLScLBHt-C4bzJBltpdP1iwX7Aqv6BTwgzOP_uRXw8rNMB3NQpg/viewform",
      "Noortealgatust toetavad Erasmus+ ja Euroopa Solidaarsuskorpuse Agentuur koostöös EuroPeers Eesti võrgustikuga Euroopa noortenädala 2026 tegevuste raames."
    ]
  },

  {
    id: "narvas-toimus-koolitus-erasmus-ja-rohkem-avasta-mis-euroopa-sulle-pakub",

    category: "events",
    categoryLabel: "Sündmused",

    date: "2026-07-16",
    displayDate: "16. juuli 2026",

    title: "Narvas toimus koolitus „Erasmus+ ja rohkem: avasta, mis Euroopa sulle pakub",

    excerpt:
      "Narvas toimunud koolitusel tutvustati noortele Erasmus+ programmi ja teisi Euroopa Liidu võimalusi õppimiseks, reisimiseks ning rahvusvahelistes projektides osalemiseks.",

    image: "assets/news/erasmus-vitatiim/erasmus-koolitus.jpg",
    imageAlt: "Erasmus+ võimalusi tutvustav noorteüritus VitaTiimis Narvas",

    featured: false,
    placeholder: false,
    published: true,

    content: [
      "8. juulil toimus Narvas VitaTiimis koolitus „Erasmus+ ja rohkem: avasta, mis Euroopa sulle pakub“, mis oli suunatud Ida-Virumaa noortele.",
      "Koolitusel rääkis Erasmus+ ja Euroopa Solidaarsuskorpuse Eurodeski ja EuroPeersi koordinaator Natalja Klimenkova Erasmus+ ja Euroopa Solidaarsuskorpuse pakutavatest võimalustest ning sellest, kuidas noored saavad nendes programmides osaleda. Oma inspireerivat kogemuslugu jagas Marika Karnetova, kes on mitmes noorteprogrammis osalenud.",
      "Suur aitäh kõigile koolitusel osalenud noortele ning meie suurepärastele esinejatele!",
      "Koolitus toimus Ida-Virumaa noorteühenduste koolitusprogrammi raames. Järgmiste koolituste ja teiste tegevuste kohta leiad infot MTÜ Noortealgatuste Tugi sotsiaalmeediakanalitest.",
      "Noortealgatust toetab Erasmus+ ja Euroopa Solidaarsuskorpuse Agentuur koostöös EuroPeers Eesti võrgustikuga Euroopa noortenädala 2026 tegevuste raames."
    ]
  }
];
