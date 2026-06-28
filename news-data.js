
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

    title: "Ida-Virumaa Noorte Tunnustusgala toimub taas",

    excerpt:
      "17. oktoobril 2026 toimub Jõhvi Kontserdimajas taas Ida-Virumaa Noorte Tunnustusgala, kus tunnustatakse piirkonna aktiivseid, ettevõtlikke ja silmapaistvaid noori.",

    image: "/assets/news/tunnustusgala/tunnustusgala-2026.jpg",
    imageAlt: "Ida-Virumaa Noorte Tunnustusgala",

    featured: true,
    placeholder: false,
    published: true,

    content: [
      "17. oktoobril 2026 toimub Jõhvi Kontserdimajas taas Ida-Virumaa Noorte Tunnustusgala - pidulik sündmus, mille eesmärk on märgata ja tunnustada piirkonna aktiivseid, ettevõtlikke ning silmapaistvaid noori.",

      "Tunnustusgala toob kokku noored, noorte toetajad, organisatsioonid ja kogukonna esindajad. Sündmuse keskmes on Ida-Virumaa noorte saavutused, julgus, loovus ning panus kohaliku elu arendamisse.",

      "Gala kaudu soovitakse tuua esile häid eeskujusid, tutvustada noorte saavutusi ning innustada ka teisi noori oma ideid ellu viima ja kogukonnaelus aktiivselt osalema.",

      "2026. aastal saab kandidaate esitada kaheteistkümnes kategoorias, mis kajastavad noorte mitmekülgset tegevust kultuuri, spordi, hariduse, vabatahtliku töö ja kogukonna arendamise valdkonnas.",

      "Tunnustuskategooriad on aasta noormuusik, aasta noorvabatahtlik, aasta noorsportlane, aasta noorkunstnik, aasta noor visuaalne looja, aasta noortantsija, aasta noornäitleja, aasta noorjuht, aasta noor loodushoidja, aasta noor õppur, aasta noorte tegu ning aasta noor Euroopa väärtuste kandja.",

      "Kandidaadiks võib esitada noore, kes on oma tegevuse, saavutuste või algatustega silma paistnud ning andnud positiivse panuse Ida-Virumaa noorte või kogukonna arengusse.",

      "Kategoorias „Aasta noorte tegu“ saab tunnustamiseks esitada ka noortegrupi, kes on algatanud ja ellu viinud mõjuka projekti, sündmuse või muu ettevõtmise.",

      "Noorte tunnustusgala ei ole üksnes auhindade üleandmine. See on ühine pidulik õhtu, kus noorte lood, saavutused ja tulevikuideed saavad tähelepanu, mida need väärivad.",

      "Kandidaate saab esitada MTÜ Noortealgatuste Tugi veebilehel. Kohtume 17. oktoobril 2026 Jõhvi Kontserdimajas, et üheskoos tunnustada Ida-Virumaa silmapaistvaid noori."
    ]
  },


  {
    id: "projektikirjutamise-laager-toimub-esmakordselt",

    category: "events",
    categoryLabel: "Sündmused",

    date: "2026-06-28",
    displayDate: "28. juuni 2026",

    title: "Ida-Virumaal toimub esmakordselt projektikirjutamise laager",

    excerpt:
      "19.-20. septembril 2026 toimub Toila SPAs esmakordselt projektikirjutamise laager, mis aitab noortel arendada oma ideid ja õppida neid toimivateks projektideks kujundama.",

    image: "/assets/news/laager/projektikirjutamise-laager-2026.jpg",
    imageAlt: "Projektikirjutamise laager Toilas",

    featured: false,
    placeholder: false,
    published: true,

    content: [
      "19.-20. septembril 2026 toimub Toila SPAs esmakordselt projektikirjutamise laager, mille eesmärk on anda noortele praktilised teadmised ja oskused oma ideede arendamiseks ning projektide ettevalmistamiseks.",

      "Kahepäevane laager loob noortele võimaluse õppida, kuidas muuta esialgne idee selgeks ja teostatavaks projektiks. Osalejad saavad teadmisi projekti eesmärkide sõnastamisest, tegevuste planeerimisest, eelarve koostamisest ja tulemuste hindamisest.",

      "Projektikirjutamine võib esmapilgul tunduda keeruline, kuid laagri jooksul käsitletakse kogu protsessi samm-sammult. Praktilised ülesanded ja meeskonnatöö aitavad osalejatel saadud teadmisi kohe kasutada ning oma ideid edasi arendada.",

      "Laagri oluline osa on kogemuste vahetamine. Osalejad saavad tutvustada oma mõtteid, kuulata teiste noorte ideid ning saada tagasisidet, mis aitab projekte sisukamaks ja realistlikumaks muuta.",

      "Projektikirjutamise laager toimub sellisel kujul esimest korda. MTÜ Noortealgatuste Tugi soovib selle algatusega toetada Ida-Virumaa noorte ettevõtlikkust ning suurendada noorte valmisolekut ise projekte algatada ja kogukonna arengusse panustada.",

      "Laager sobib noortele, kes soovivad ellu viia sündmust, koolitust, kogukondlikku algatust või mõnda muud ideed, kuid vajavad selle kavandamisel teadmisi, tuge ja inspiratsiooni.",

      "Lisateavet laagri programmi, osalemise ja registreerimise kohta saab MTÜ Noortealgatuste Tugi projektikirjutamise laagri veebilehelt."
    ]
  }
];


/*
  
  {
    id: "saavutused-peagi",
    category: "achievements",
    categoryLabel: "Saavutused",
    date: "",
    displayDate: "Peagi",
    title: "Siin hakkame jagama meie suuremaid saavutusi",
    excerpt: "Organisatsiooni ja noorte tunnustused, koostööd ning olulised hetked saavad siin nähtavaks.",
    image: "/assets/news/news-01.jpg",
    imageAlt: "MTÜ Noortealgatuste Tugi saavutuse foto",
    featured: true,
    placeholder: true,
    published: true,
    content: [
      "See on ajutine näidis. Lisa esimene päris uudis faili news-data.js.",
      "Uudise juurde saad lisada pealkirja, kuupäeva, kategooria, foto, lühikirjelduse ja pikema teksti."
    ]
  },
  {
    id: "sundmused-peagi",
    category: "events",
    categoryLabel: "Sündmused",
    date: "",
    displayDate: "Peagi",
    title: "Sündmuste kokkuvõtted ja eredamad hetked",
    excerpt: "Jagame toimunud sündmuste tulemusi, fotosid ja osalejate kogemusi.",
    image: "/assets/news/news-02.jpg",
    imageAlt: "Noortealgatuste Tugi sündmuse foto",
    featured: false,
    placeholder: true,
    published: true,
    content: [
      "Siia saad hiljem lisada sündmuse põhjaliku kokkuvõtte.",
      "Kirjelda, mis toimus, kes osalesid, millised olid tulemused ja mida sellest õpiti."
    ]
  },
  {
    id: "noortealgatused-peagi",
    category: "initiatives",
    categoryLabel: "Noortealgatused",
    date: "",
    displayDate: "Peagi",
    title: "Uued ideed, võimalused ja koostööd",
    excerpt: "Uued projektid, partnerid, rahastusvõimalused ja noorte enda algatused.",
    image: "/assets/news/news-03.jpg",
    imageAlt: "Ida-Virumaa noortealgatuse foto",
    featured: false,
    placeholder: true,
    published: true,
    content: [
      "See koht sobib noorte uute ideede, koostööde ja võimaluste tutvustamiseks.",
      "Lisa uudis news-data.js faili ning avaleht ja uudiste leht uuenevad korraga."
    ]
  }
];

*/