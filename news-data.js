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
  /*
  PÄRIS UUDISE NÄIDE

  {
    id: "unikaalne-uudise-nimi",
    category: "events",
    categoryLabel: "Sündmused",
    date: "2026-09-20",
    title: "Uudise pealkiri",
    excerpt: "Lühike kirjeldus, mida näidatakse kaardil.",
    image: "/assets/news/uudise-foto.jpg",
    imageAlt: "Foto kirjeldus",
    featured: true,
    placeholder: false,
    published: true,
    content: [
      "Esimene pikem lõik.",
      "Teine pikem lõik."
    ]
  },
  */

  /* Ajutised näidised. Need aitavad kujundust näha enne päris uudiseid. */
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
