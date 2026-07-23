(function (windowObject) {
  "use strict";

  /*
   * Central translation catalogue.
   *
   * Every entry uses a clear dotted key and stores values in this order:
   * [Estonian, English, Russian].
   *
   * Keep organisation names, personal names, addresses, email addresses,
   * bank details, file paths and official project names unchanged.
   */
  const entries = {
    /* ========================= Shared interface ========================= */
    "common.a11y.homeLink": [
      "MTÜ Noortealgatuste Tugi avaleht",
      "MTÜ Noortealgatuste Tugi homepage",
      "Главная страница MTÜ Noortealgatuste Tugi"
    ],
    "common.a11y.languageSelection": [
      "Keele valik",
      "Language selection",
      "Выбор языка"
    ],
    "common.a11y.openMenu": [
      "Ava menüü",
      "Open menu",
      "Открыть меню"
    ],
    "common.a11y.mainNavigation": [
      "Põhinavigatsioon",
      "Main navigation",
      "Основная навигация"
    ],
    "common.a11y.projectsMenu": [
      "Projektid",
      "Projects",
      "Проекты"
    ],
    "common.a11y.footerLinks": [
      "Jaluse lingid",
      "Footer links",
      "Ссылки в подвале"
    ],
    "common.a11y.officialDetails": [
      "Organisatsiooni ametlikud andmed",
      "Official organisation details",
      "Официальные данные организации"
    ],
    "common.a11y.backToTop": [
      "Tagasi lehe algusesse",
      "Back to the top of the page",
      "Вернуться к началу страницы"
    ],
    "common.a11y.backToTopTitle": [
      "Tagasi üles",
      "Back to top",
      "Наверх"
    ],
    "common.a11y.closePhoto": [
      "Sulge foto",
      "Close photo",
      "Закрыть фотографию"
    ],
    "common.a11y.closeLargePhoto": [
      "Sulge suur foto",
      "Close enlarged photo",
      "Закрыть увеличенную фотографию"
    ],
    "common.a11y.photoHint": [
      "Sulgemiseks vajuta ristile, taustale või klahvile Esc",
      "To close, select the cross, the backdrop or press Esc",
      "Чтобы закрыть окно, нажмите на крестик, фон или клавишу Esc"
    ],
    "common.nav.home": ["Avaleht", "Home", "Главная"],
    "common.nav.news": ["Uudised", "News", "Новости"],
    "common.nav.projects": ["Projektid", "Projects", "Проекты"],
    "common.nav.gala": [
      "Noorte tunnustusgala",
      "Youth Recognition Gala",
      "Гала-вечер признания молодёжи"
    ],
    "common.nav.camp": [
      "Projektikirjutamise laager",
      "Project Writing Camp",
      "Лагерь по написанию проектов"
    ],
    "common.nav.street": [
      "Street Dance Jam",
      "Street Dance Jam",
      "Street Dance Jam"
    ],
    "common.nav.network": ["Võrgustik", "Network", "Сеть"],
    "common.nav.contact": ["Kontakt", "Contact", "Контакты"],
    "common.nav.documents": ["Dokumendid", "Documents", "Документы"],
    "common.nav.privacy": [
      "Privaatsuspoliitika",
      "Privacy Policy",
      "Политика конфиденциальности"
    ],
    "common.buttons.contact": [
      "Võta ühendust",
      "Get in touch",
      "Связаться с нами"
    ],
    "common.newsletter.label": ["INFOKIRI", "NEWSLETTER", "РАССЫЛКА"],
    "common.newsletter.title": [
      "Hoia end kursis meie tegemistega",
      "Keep up with our work",
      "Следите за нашей деятельностью"
    ],
    "common.newsletter.titleAlternative": [
      "Hoia end meie tegemistega kursis",
      "Keep up with our work",
      "Следите за нашей деятельностью"
    ],
    "common.newsletter.body": [
      "Liitu infokirjaga, et saada teavet meie sündmuste, projektide, noortealgatuste ja võimaluste kohta Ida-Virumaal.",
      "Subscribe to receive news about our events, projects, youth initiatives and opportunities in Ida-Viru County.",
      "Подпишитесь на рассылку, чтобы получать информацию о наших мероприятиях, проектах, молодёжных инициативах и возможностях в Ида-Вирумаа."
    ],
    "common.newsletter.join": [
      "Liitu infokirjaga",
      "Subscribe to the newsletter",
      "Подписаться на рассылку"
    ],
    "common.newsletter.embedTitle": [
      "Liitu meie infokirjaga",
      "Subscribe to our newsletter",
      "Подписаться на нашу рассылку"
    ],
    "common.newsletter.unavailable": [
      "Liitumisvorm on ajutiselt kättesaamatu. Kirjuta ",
      "The subscription form is temporarily unavailable. Email ",
      "Форма подписки временно недоступна. Напишите на адрес "
    ],
    "common.footer.brandText": [
      "Toetame noorte ideid, algatusi ja kogukondlikke projekte Ida-Virumaal. Aitame noortel tegutseda, õppida ja oma algatusi ellu viia.",
      "We support young people’s ideas, initiatives and community projects in Ida-Viru County. We help young people take action, learn and bring their initiatives to life.",
      "Мы поддерживаем идеи молодёжи, инициативы и общественные проекты в Ида-Вирумаа. Мы помогаем молодым людям действовать, учиться и воплощать свои инициативы."
    ],
    "common.footer.quickLinks": [
      "Kiirlingid",
      "Quick links",
      "Быстрые ссылки"
    ],
    "common.footer.about": ["Meist", "About us", "О нас"],
    "common.footer.newsletter": ["Infokiri", "Newsletter", "Рассылка"],
    "common.footer.location": [
      "📍 Ida-Virumaa, Eesti",
      "📍 Ida-Viru County, Estonia",
      "📍 Ида-Вирумаа, Эстония"
    ],
    "common.footer.copyright": [
      "© 2026 MTÜ Noortealgatuste Tugi. Kõik õigused kaitstud.",
      "© 2026 MTÜ Noortealgatuste Tugi. All rights reserved.",
      "© 2026 MTÜ Noortealgatuste Tugi. Все права защищены."
    ],
    "common.footer.officialTitle": [
      "Ametlik info",
      "Official information",
      "Официальная информация"
    ],
    "common.footer.registrationCode": [
      "Registrikood: 80652930",
      "Registry code: 80652930",
      "Регистрационный код: 80652930"
    ],
    "common.footer.emailLabel": ["E-post:", "Email:", "Эл. почта:"],
    "common.footer.donations": ["Annetused", "Donations", "Пожертвования"],
    "common.footer.officialWebsite": [
      "Ametlik veebileht: noortetugi.ee",
      "Official website: noortetugi.ee",
      "Официальный сайт: noortetugi.ee"
    ],
    "common.footer.officialWebsiteStatement": [
      "Noortetugi.ee on MTÜ Noortealgatuste Tugi ametlik veebileht ja domeen.",
      "Noortetugi.ee is the official website and domain of MTÜ Noortealgatuste Tugi.",
      "Noortetugi.ee — официальный сайт и домен MTÜ Noortealgatuste Tugi."
    ],
    "common.form.unconfigured": [
      "Kontaktvorm ei ole veel teenusega ühendatud. Palun kirjuta aadressile juhatus@noortetugi.ee.",
      "The contact form is not connected yet. Please email juhatus@noortetugi.ee.",
      "Контактная форма пока не подключена. Напишите нам на juhatus@noortetugi.ee."
    ],
    "common.countdown.days": ["Päeva", "Days", "Дней"],
    "common.countdown.hours": ["Tundi", "Hours", "Часов"],
    "common.countdown.minutes": ["Minutit", "Minutes", "Минут"],
    "common.countdown.seconds": ["Sekundit", "Seconds", "Секунд"],

    /* ========================= Home page ========================= */
    "home.meta.title": [
      "MTÜ Noortealgatuste Tugi",
      "MTÜ Noortealgatuste Tugi",
      "MTÜ Noortealgatuste Tugi"
    ],
    "home.meta.description": [
      "MTÜ Noortealgatuste Tugi aitab Ida-Virumaa noortel arendada ideid, algatada projekte ja kujundada kohalikku elu.",
      "MTÜ Noortealgatuste Tugi helps young people in Ida-Viru County develop ideas, launch projects and shape local life.",
      "MTÜ Noortealgatuste Tugi помогает молодёжи Ида-Вирумаа развивать идеи, запускать проекты и участвовать в жизни региона."
    ],
    "home.meta.ogDescription": [
      "Aitame Ida-Virumaa noortel arendada ideid, algatada projekte ja kujundada kohalikku elu.",
      "We help young people in Ida-Viru County develop ideas, launch projects and shape local life.",
      "Мы помогаем молодёжи Ида-Вирумаа развивать идеи, запускать проекты и участвовать в жизни региона."
    ],
    "home.modal.close": [
      "Sulge fotoaken",
      "Close photo window",
      "Закрыть окно с фотографией"
    ],
    "home.modal.kicker": ["MEIE MEESKOND", "OUR TEAM", "НАША КОМАНДА"],
    "home.modal.member": [
      "Meeskonnaliige",
      "Team member",
      "Участник команды"
    ],
    "home.hero.kicker": [
      "NOORTE IDEEDEST PÄRIS MUUTUS",
      "YOUNG IDEAS, REAL CHANGE",
      "ИДЕИ МОЛОДЁЖИ — РЕАЛЬНЫЕ ПЕРЕМЕНЫ"
    ],
    "home.hero.titlePrefix": [
      "Aitame noortel",
      "We help young people",
      "Мы помогаем молодёжи"
    ],
    "home.hero.titleAccent": [
      "tegutseda, kasvada ja mõjutada",
      "act, grow and make an impact",
      "действовать, развиваться и влиять"
    ],
    "home.hero.description": [
      "MTÜ Noortealgatuste Tugi loob Ida-Virumaa noortele võimalusi, toetab julgeid algatusi ning aitab ideedel kasvada päriselt teostatavateks projektideks – pakkudes samal ajal teadmisi ja oskusi, mis aitavad noortel oma potentsiaali täiel määral avada.",
      "MTÜ Noortealgatuste Tugi creates opportunities for young people in Ida-Viru County, supports bold initiatives and helps ideas grow into viable projects, while providing the knowledge and skills young people need to realise their full potential.",
      "MTÜ Noortealgatuste Tugi создаёт возможности для молодёжи Ида-Вирумаа, поддерживает смелые инициативы и помогает превращать идеи в осуществимые проекты, одновременно давая знания и навыки для полного раскрытия потенциала."
    ],
    "home.hero.projectsButton": [
      "Vaata meie projekte",
      "Explore our projects",
      "Посмотреть наши проекты"
    ],
    "home.hero.processLabel": [
      "Meie tööprotsess",
      "How we work",
      "Как мы работаем"
    ],
    "home.hero.idea": ["Idee", "Idea", "Идея"],
    "home.hero.support": ["Tugi", "Support", "Поддержка"],
    "home.hero.impact": ["Mõju", "Impact", "Результат"],
    "home.hero.logoOpen": [
      "Ava MTÜ Noortealgatuste Tugi logo suurelt",
      "Open the MTÜ Noortealgatuste Tugi logo in a larger view",
      "Открыть логотип MTÜ Noortealgatuste Tugi в увеличенном виде"
    ],
    "home.hero.value1Title": [
      "Noortelt noortele",
      "By young people, for young people",
      "Молодёжь для молодёжи"
    ],
    "home.hero.value1Text": [
      "Noored ei ole ainult osalejad, vaid ka ideede autorid ja eestvedajad.",
      "Young people are not only participants; they are also the authors and leaders of ideas.",
      "Молодые люди — не только участники, но и авторы идей и лидеры инициатив."
    ],
    "home.hero.value2Title": [
      "Ideest teostuseni",
      "From idea to delivery",
      "От идеи до воплощения"
    ],
    "home.hero.value2Text": [
      "Aitame planeerida, leida ressursse ja viia algatused päriselt ellu.",
      "We help with planning, finding resources and turning initiatives into reality.",
      "Мы помогаем планировать, находить ресурсы и воплощать инициативы в жизнь."
    ],
    "home.hero.value3Title": [
      "Kogukonnale kasulik",
      "Valuable to the community",
      "Польза для сообщества"
    ],
    "home.hero.value3Text": [
      "Loome võimalusi, mis lähtuvad kohalike noorte vajadustest ja unistustest.",
      "We create opportunities rooted in the needs and aspirations of local young people.",
      "Мы создаём возможности, основанные на потребностях и мечтах местной молодёжи."
    ],
    "home.hero.valuesLabel": [
      "Meie põhimõtted",
      "Our principles",
      "Наши принципы"
    ],
    "home.hero.scrollLabel": [
      "Liigu järgmise sektsioonini",
      "Go to the next section",
      "Перейти к следующему разделу"
    ],
    "home.hero.discover": [
      "Avasta rohkem",
      "Discover more",
      "Узнать больше"
    ],
    "home.hero.routeLabel": [
      "IDEEST MÕJUNI",
      "FROM IDEA TO IMPACT",
      "ОТ ИДЕИ К РЕЗУЛЬТАТУ"
    ],
    "home.news.label": [
      "UUDISED JA SAAVUTUSED",
      "NEWS AND ACHIEVEMENTS",
      "НОВОСТИ И ДОСТИЖЕНИЯ"
    ],
    "home.news.title": [
      "Meie tegemised, hetked ja järgmised sammud",
      "Our work, memorable moments and next steps",
      "Наши дела, яркие моменты и следующие шаги"
    ],
    "home.news.description": [
      "Organisatsiooni uudised, sündmuste kokkuvõtted, noorte saavutused ja uued võimalused Ida-Virumaal.",
      "Organisation news, event highlights, young people’s achievements and new opportunities in Ida-Viru County.",
      "Новости организации, итоги мероприятий, достижения молодёжи и новые возможности в Ида-Вирумаа."
    ],
    "home.news.all": [
      "Vaata kõiki uudiseid",
      "View all news",
      "Все новости"
    ],
    "home.news.topicsLabel": [
      "Uudiste teemad",
      "News topics",
      "Темы новостей"
    ],
    "home.news.noScript": [
      "Uudiste kuvamiseks peab JavaScript olema lubatud.",
      "JavaScript must be enabled to display the news.",
      "Для отображения новостей необходимо включить JavaScript."
    ],
    "home.news.backgroundLabel": ["UUDISED", "NEWS", "НОВОСТИ"],
    "home.about.label": ["MEIST", "ABOUT US", "О НАС"],
    "home.about.title": [
      "Koht, kus noore idee saab hoo sisse",
      "Where a young person’s idea gains momentum",
      "Место, где идея молодого человека набирает силу"
    ],
    "home.about.description": [
      "Me usume, et noortel peab olema võimalus mitte ainult ideid jagada, vaid ka neid katsetada, arendada ja päriselt ellu viia. Selleks ühendame nõustamise, praktilise toe, partnerid ja kogukonna.",
      "We believe young people should have the opportunity not only to share ideas, but also to test, develop and bring them to life. We combine guidance, practical support, partners and community to make this possible.",
      "Мы верим, что у молодёжи должна быть возможность не только делиться идеями, но и проверять, развивать и воплощать их. Для этого мы объединяем консультации, практическую поддержку, партнёров и сообщество."
    ],
    "home.about.supportTitle": ["Toetame", "We support", "Поддерживаем"],
    "home.about.supportText": [
      "Aitame noortel oma idee selgelt sõnastada, tegevused läbi mõelda ja järgmised sammud paika panna.",
      "We help young people articulate their idea, think through the activities and define the next steps.",
      "Мы помогаем молодым людям чётко сформулировать идею, продумать действия и определить следующие шаги."
    ],
    "home.about.developTitle": ["Arendame", "We develop", "Развиваем"],
    "home.about.developText": [
      "Loome praktilisi õpikogemusi, kus noored saavad uusi oskusi, kontakte ja enesekindlust.",
      "We create practical learning experiences where young people gain skills, connections and confidence.",
      "Мы создаём практические образовательные возможности, где молодёжь приобретает навыки, связи и уверенность."
    ],
    "home.about.connectTitle": ["Ühendame", "We connect", "Объединяем"],
    "home.about.connectText": [
      "Toome kokku noored, spetsialistid, organisatsioonid ja toetajad, et head ideed jõuaksid suurema mõjuni.",
      "We bring together young people, professionals, organisations and supporters so good ideas can have a greater impact.",
      "Мы объединяем молодёжь, специалистов, организации и партнёров, чтобы хорошие идеи давали больший результат."
    ],
    "home.marquee.label": ["Meie väärtused", "Our values", "Наши ценности"],
    "home.marquee.ideas": ["NOORTE IDEED", "YOUNG IDEAS", "ИДЕИ МОЛОДЁЖИ"],
    "home.marquee.initiatives": [
      "JULGED ALGATUSED",
      "BOLD INITIATIVES",
      "СМЕЛЫЕ ИНИЦИАТИВЫ"
    ],
    "home.marquee.experience": [
      "PÄRIS KOGEMUS",
      "REAL EXPERIENCE",
      "РЕАЛЬНЫЙ ОПЫТ"
    ],
    "home.marquee.community": [
      "TUGEV KOGUKOND",
      "STRONG COMMUNITY",
      "СИЛЬНОЕ СООБЩЕСТВО"
    ],
    "home.team.label": ["MEESKOND", "TEAM", "КОМАНДА"],
    "home.team.title": [
      "Inimesed, kes aitavad ideedel kasvada",
      "The people who help ideas grow",
      "Люди, которые помогают идеям расти"
    ],
    "home.team.description": [
      "Meie meeskond ühendab projektijuhtimise, kommunikatsiooni, turunduse, finantsid ja noorsootöö kogemuse.",
      "Our team brings together experience in project management, communications, marketing, finance and youth work.",
      "Наша команда объединяет опыт в управлении проектами, коммуникации, маркетинге, финансах и работе с молодёжью."
    ],
    "home.team.leadershipLabel": ["JUHTKOND", "LEADERSHIP", "РУКОВОДСТВО"],
    "home.team.leadershipTitle": [
      "Organisatsiooni eestvedajad",
      "Organisation leaders",
      "Руководители организации"
    ],
    "home.team.teamLabel": ["TIIM", "TEAM", "КОМАНДА"],
    "home.team.specialistsTitle": [
      "Meie spetsialistid",
      "Our specialists",
      "Наши специалисты"
    ],
    "home.team.executiveDirector": [
      "Tegevjuht",
      "Executive Director",
      "Исполнительный директор"
    ],
    "home.team.executiveDirectorText": [
      "Vastutab ürituste korralduse, meeskonna töö koordineerimise ja projektide elluviimise eest.",
      "Responsible for organising events, coordinating the team and delivering projects.",
      "Отвечает за организацию мероприятий, координацию работы команды и реализацию проектов."
    ],
    "home.team.publicRelations": [
      "Avalike suhete juht",
      "Head of Public Relations",
      "Руководитель по связям с общественностью"
    ],
    "home.team.publicRelationsText": [
      "Aitab juhtida noorteprojekte, sündmusi ja kogukondlike algatuste elluviimist.",
      "Helps lead youth projects, events and community initiatives.",
      "Помогает руководить молодёжными проектами, мероприятиями и общественными инициативами."
    ],
    "home.team.finance": ["Finantsjuht", "Finance Manager", "Финансовый руководитель"],
    "home.team.financeText": [
      "Tegeleb organisatsiooni rahaliste küsimuste, eelarve koostamise ja finantsaruandlusega.",
      "Manages the organisation’s finances, budgeting and financial reporting.",
      "Занимается финансовыми вопросами организации, бюджетированием и финансовой отчётностью."
    ],
    "home.team.communication": [
      "Kommunikatsioonijuht",
      "Communications Manager",
      "Руководитель по коммуникациям"
    ],
    "home.team.communicationText": [
      "Vastutab kommunikatsiooni, avaliku info ja organisatsiooni nähtavuse arendamise eest.",
      "Responsible for communications, public information and developing the organisation’s visibility.",
      "Отвечает за коммуникацию, публичную информацию и повышение узнаваемости организации."
    ],
    "home.team.marketing": [
      "Turundusjuht",
      "Marketing Manager",
      "Руководитель по маркетингу"
    ],
    "home.team.marketingText": [
      "Vastutab organisatsiooni turundustegevuste, sotsiaalmeedia ja avalike suhete eest.",
      "Responsible for the organisation’s marketing, social media and public relations.",
      "Отвечает за маркетинг организации, социальные сети и связи с общественностью."
    ],
    "home.team.communicationAssistant": [
      "Kommunikatsioonijuhi assistent",
      "Communications Assistant",
      "Ассистент руководителя по коммуникациям"
    ],
    "home.team.communicationAssistantText": [
      "Aitab kaasa kommunikatsiooni, info jagamise ja kogukondlike tegevuste elluviimisele.",
      "Supports communications, information sharing and community activities.",
      "Помогает в коммуникации, распространении информации и реализации общественных мероприятий."
    ],
    "home.team.openMario": [
      "Ava Mario Polshini täispikk foto",
      "Open a full-length photo of Mario Polshin",
      "Открыть фотографию Mario Polshin в полный рост"
    ],
    "home.team.openMihhail": [
      "Ava Mihhail Semiyanovi täispikk foto",
      "Open a full-length photo of Mihhail Semiyanov",
      "Открыть фотографию Mihhail Semiyanov в полный рост"
    ],
    "home.team.openEgor": [
      "Ava Egor Stepanovi täispikk foto",
      "Open a full-length photo of Egor Stepanov",
      "Открыть фотографию Egor Stepanov в полный рост"
    ],
    "home.team.openSofia": [
      "Ava Sofia Germi täispikk foto",
      "Open a full-length photo of Sofia Germ",
      "Открыть фотографию Sofia Germ в полный рост"
    ],
    "home.team.openJekaterina": [
      "Ava Jekaterina Rogožini täispikk foto",
      "Open a full-length photo of Jekaterina Rogožina",
      "Открыть фотографию Jekaterina Rogožina в полный рост"
    ],
    "home.team.openAndrei": [
      "Ava Andrei Ostretsovi täispikk foto",
      "Open a full-length photo of Andrei Ostretsov",
      "Открыть фотографию Andrei Ostretsov в полный рост"
    ],
    "home.projects.label": ["PROJEKTID", "PROJECTS", "ПРОЕКТЫ"],
    "home.projects.title": [
      "Ideed, mis on saanud päris sündmusteks",
      "Ideas that became real events",
      "Идеи, ставшие реальными событиями"
    ],
    "home.projects.description": [
      "Meie projektid ühendavad tunnustamise, praktilise õppimise, loovuse ja noorte omaalgatuse.",
      "Our projects combine recognition, practical learning, creativity and youth-led initiative.",
      "Наши проекты объединяют признание достижений, практическое обучение, творчество и молодёжную инициативу."
    ],
    "home.projects.galaLabel": [
      "TUNNUSTUSÜRITUS",
      "RECOGNITION EVENT",
      "ЦЕРЕМОНИЯ ПРИЗНАНИЯ"
    ],
    "home.projects.galaTitle": [
      "Ida-Virumaa noorte tunnustusgala",
      "Ida-Virumaa noorte tunnustusgala",
      "Ida-Virumaa noorte tunnustusgala"
    ],
    "home.projects.galaText": [
      "Pidulik sündmus, kus tunnustame aktiivseid, silmapaistvaid ja kogukonda panustavaid Ida-Virumaa noori.",
      "A celebratory event recognising active, outstanding young people who contribute to their communities in Ida-Viru County.",
      "Торжественное событие, на котором мы отмечаем активную, яркую молодёжь Ида-Вирумаа, вносящую вклад в своё сообщество."
    ],
    "home.projects.campLabel": [
      "PRAKTILINE LAAGER",
      "PRACTICAL CAMP",
      "ПРАКТИЧЕСКИЙ ЛАГЕРЬ"
    ],
    "home.projects.campTitle": [
      "Ida-Virumaa noorte projektikirjutamise laager",
      "Ida-Virumaa noorte projektikirjutamise laager",
      "Ida-Virumaa noorte projektikirjutamise laager"
    ],
    "home.projects.campText": [
      "Kahepäevane praktiline kogemus, kus noored arendavad ideid, kirjutavad projekte ja õpivad rahastust leidma.",
      "A two-day practical experience where young people develop ideas, write projects and learn how to find funding.",
      "Два дня практики, во время которых молодёжь развивает идеи, пишет проекты и учится находить финансирование."
    ],
    "home.projects.streetLabel": [
      "TANTSUÜRITUS",
      "DANCE EVENT",
      "ТАНЦЕВАЛЬНОЕ СОБЫТИЕ"
    ],
    "home.projects.streetText": [
      "Noortelt noortele loodud tänavatantsusündmus, mis ühendab töötoad, tantsulahingud ja hiphop-kultuuri.",
      "A street dance event created by young people for young people, combining workshops, dance battles and hip-hop culture.",
      "Событие уличного танца, созданное молодёжью для молодёжи и объединившее мастер-классы, танцевальные баттлы и хип-хоп-культуру."
    ],
    "home.projects.view": ["Vaata projekti", "View project", "Открыть проект"],
    "home.contact.label": ["KONTAKT", "CONTACT", "КОНТАКТЫ"],
    "home.contact.title": [
      "Kas sul on idee, mida tahaksid ellu viia?",
      "Do you have an idea you would like to bring to life?",
      "У вас есть идея, которую хочется воплотить?"
    ],
    "home.contact.description": [
      "Kirjuta meile. Arutame koos, millist tuge vajad ja milline võiks olla sinu järgmine samm.",
      "Write to us. Together we will discuss what support you need and what your next step could be.",
      "Напишите нам. Вместе обсудим, какая поддержка вам нужна и каким может быть следующий шаг."
    ],
    "home.contact.email": ["E-post", "Email", "Эл. почта"],
    "home.contact.region": ["Piirkond", "Region", "Регион"],
    "home.contact.regionValue": [
      "Ida-Virumaa, Eesti",
      "Ida-Viru County, Estonia",
      "Ида-Вирумаа, Эстония"
    ],
    "home.contact.formLabel": ["SAADA SÕNUM", "SEND A MESSAGE", "ОТПРАВИТЬ СООБЩЕНИЕ"],
    "home.contact.formTitle": [
      "Räägi meile oma ideest",
      "Tell us about your idea",
      "Расскажите нам о своей идее"
    ],
    "home.contact.name": ["Teie nimi *", "Your name *", "Ваше имя *"],
    "home.contact.namePlaceholder": ["Maria Tamm", "Maria Tamm", "Maria Tamm"],
    "home.contact.emailAddress": [
      "E-posti aadress *",
      "Email address *",
      "Адрес эл. почты *"
    ],
    "home.contact.emailPlaceholder": [
      "maria@example.ee",
      "maria@example.ee",
      "maria@example.ee"
    ],
    "home.contact.phone": ["Telefon", "Phone", "Телефон"],
    "home.contact.subject": ["Teema *", "Subject *", "Тема *"],
    "home.contact.subjectPlaceholder": ["Minu idee", "My idea", "Моя идея"],
    "home.contact.message": ["Sõnum *", "Message *", "Сообщение *"],
    "home.contact.messagePlaceholder": [
      "Kirjelda lühidalt oma ideed või küsimust...",
      "Briefly describe your idea or question...",
      "Кратко опишите свою идею или вопрос..."
    ],
    "home.contact.submit": ["Saada sõnum", "Send message", "Отправить сообщение"],

    /* ========================= News page ========================= */
    "newsPage.meta.title": [
      "Uudised ja saavutused | MTÜ Noortealgatuste Tugi",
      "News and achievements | MTÜ Noortealgatuste Tugi",
      "Новости и достижения | MTÜ Noortealgatuste Tugi"
    ],
    "newsPage.meta.description": [
      "MTÜ Noortealgatuste Tugi uudised, saavutused, sündmused ja noortealgatused Ida-Virumaal.",
      "News, achievements, events and youth initiatives from MTÜ Noortealgatuste Tugi in Ida-Viru County.",
      "Новости, достижения, мероприятия и молодёжные инициативы MTÜ Noortealgatuste Tugi в Ида-Вирумаа."
    ],
    "newsPage.meta.ogDescription": [
      "Uudised, saavutused, sündmused ja noortealgatused Ida-Virumaal.",
      "News, achievements, events and youth initiatives in Ida-Viru County.",
      "Новости, достижения, мероприятия и молодёжные инициативы в Ида-Вирумаа."
    ],
    "newsPage.hero.eyebrow": [
      "UUDISED · SAAVUTUSED · VÕIMALUSED",
      "NEWS · ACHIEVEMENTS · OPPORTUNITIES",
      "НОВОСТИ · ДОСТИЖЕНИЯ · ВОЗМОЖНОСТИ"
    ],
    "newsPage.hero.titlePrefix": [
      "Meie lood liiguvad",
      "Our stories move",
      "Наши истории проходят путь"
    ],
    "newsPage.hero.titleAccent": [
      "ideest mõjuni",
      "from idea to impact",
      "от идеи к результату"
    ],
    "newsPage.hero.description": [
      "Siit leiad organisatsiooni värskemad uudised, sündmuste kokkuvõtted, noorte saavutused, koostööd ja järgmised võimalused.",
      "Discover the organisation’s latest news, event highlights, youth achievements, partnerships and upcoming opportunities.",
      "Здесь вы найдёте свежие новости организации, итоги мероприятий, достижения молодёжи, информацию о сотрудничестве и новых возможностях."
    ],
    "newsPage.hero.viewNews": ["Vaata uudiseid", "View news", "Смотреть новости"],
    "newsPage.hero.shareStory": [
      "Jaga meiega oma lugu",
      "Share your story with us",
      "Поделитесь своей историей"
    ],
    "newsPage.hero.dashboard": ["MEIE UUDISED", "OUR NEWS", "НАШИ НОВОСТИ"],
    "newsPage.hero.backgroundLabel": ["UUDISED", "NEWS", "НОВОСТИ"],
    "newsPage.hero.publishedStory": [
      "avaldatud lugu",
      "published stories",
      "опубликованных материалов"
    ],
    "newsPage.list.label": ["UUSIMAD LOOD", "LATEST STORIES", "СВЕЖИЕ МАТЕРИАЛЫ"],
    "newsPage.list.title": [
      "Uudised, mida tasub märgata",
      "News worth noticing",
      "Новости, заслуживающие внимания"
    ],
    "newsPage.search.label": ["Otsi uudiseid", "Search news", "Поиск новостей"],
    "newsPage.search.placeholder": [
      "Otsi pealkirja või teema järgi...",
      "Search by title or topic...",
      "Поиск по заголовку или теме..."
    ],
    "newsPage.filters.label": [
      "Uudiste kategooriad",
      "News categories",
      "Категории новостей"
    ],
    "newsPage.results.all": ["Kõik uudised", "All news", "Все новости"],
    "newsPage.story.label": ["KAS SUL ON UUDIS?", "DO YOU HAVE NEWS?", "ЕСТЬ НОВОСТЬ?"],
    "newsPage.story.title": [
      "Aitame noorte tegemised nähtavaks muuta",
      "We help make young people’s work visible",
      "Мы помогаем рассказывать о делах молодёжи"
    ],
    "newsPage.story.description": [
      "Anna meile teada saavutusest, uuest algatusest, sündmusest või koostöövõimalusest, mida võiks kogukonnaga jagada.",
      "Tell us about an achievement, new initiative, event or partnership opportunity worth sharing with the community.",
      "Расскажите нам о достижении, новой инициативе, событии или возможности для сотрудничества, которыми стоит поделиться с сообществом."
    ],
    "newsPage.story.write": ["Kirjuta meile", "Write to us", "Написать нам"],
    "news.categories.all": ["Kõik", "All", "Все"],
    "news.categories.achievements": [
      "Saavutused",
      "Achievements",
      "Достижения"
    ],
    "news.categories.events": ["Sündmused", "Events", "События"],
    "news.categories.initiatives": [
      "Noortealgatused",
      "Youth initiatives",
      "Молодёжные инициативы"
    ],
    "news.categories.opportunities": [
      "Võimalused",
      "Opportunities",
      "Возможности"
    ],
    "news.ui.soon": ["Peagi", "Coming soon", "Скоро"],
    "news.ui.author": ["Autor: {{author}}", "Author: {{author}}", "Автор: {{author}}"],
    "news.ui.photo": ["Uudise foto", "News photo", "Фотография к новости"],
    "news.ui.addPhoto": [
      "Lisa uudise foto",
      "Add a news photo",
      "Добавьте фотографию к новости"
    ],
    "news.ui.addFeaturedPhoto": [
      "Lisa põhiuudise foto",
      "Add a featured news photo",
      "Добавьте фотографию главной новости"
    ],
    "news.ui.readLabel": [
      "Loe uudist: {{title}}",
      "Read the news item: {{title}}",
      "Читать новость: {{title}}"
    ],
    "news.ui.openLabel": [
      "Ava uudis: {{title}}",
      "Open the news item: {{title}}",
      "Открыть новость: {{title}}"
    ],
    "news.ui.comingSoon": [
      "Uudis ilmub peagi",
      "Coming soon",
      "Новость скоро появится"
    ],
    "news.ui.readMore": ["Loe edasi", "Read more", "Читать дальше"],
    "news.ui.readNews": ["Loe uudist", "Read story", "Читать новость"],
    "news.ui.openNews": ["Ava uudis", "Open story", "Открыть новость"],
    "news.ui.openLink": ["Ava link", "Open link", "Открыть ссылку"],
    "news.ui.registerHere": [
      "Registreeru siin",
      "Register here",
      "Зарегистрироваться"
    ],
    "news.ui.submitCandidate": [
      "Esita kandidaat",
      "Nominate a candidate",
      "Выдвинуть кандидата"
    ],
    "news.ui.emptyTitle": [
      "Selles kategoorias uudiseid veel ei ole",
      "There are no news items in this category yet",
      "В этой категории пока нет новостей"
    ],
    "news.ui.emptyText": [
      "Vali teine kategooria või eemalda otsingusõna.",
      "Choose another category or clear the search term.",
      "Выберите другую категорию или удалите поисковый запрос."
    ],
    "news.ui.resultOne": ["uudis", "news item", "новость"],
    "news.ui.resultFew": ["uudist", "news items", "новости"],
    "news.ui.resultMany": ["uudist", "news items", "новостей"],
    "news.ui.back": [
      "Tagasi uudiste juurde",
      "Back to news",
      "Вернуться к новостям"
    ],
    "news.ui.placeholderTitle": [
      "See on ajutine näidis.",
      "This is a temporary example.",
      "Это временный пример."
    ],
    "news.ui.placeholderText": [
      "Lisa päris uudis faili news-data.js. Sama uudis ilmub automaatselt ka avalehele.",
      "Add the real news item to news-data.js. It will also appear on the homepage automatically.",
      "Добавьте настоящую новость в файл news-data.js. Она автоматически появится и на главной странице."
    ],
    "news.ui.shareLabel": ["JAGA IDEED", "SHARE AN IDEA", "ПОДЕЛИТЬСЯ ИДЕЕЙ"],
    "news.ui.shareTitle": [
      "Kas sul on uudis või saavutus, mida jagada?",
      "Do you have news or an achievement to share?",
      "Хотите рассказать о новости или достижении?"
    ],
    "news.ui.shareText": [
      "Kirjuta meile ning aitame sinu loo organisatsiooni kanalites nähtavaks teha.",
      "Write to us and we will help share your story through the organisation’s channels.",
      "Напишите нам, и мы поможем рассказать вашу историю на каналах организации."
    ],
    "news.ui.moreLabel": ["VEEL UUDISEID", "MORE NEWS", "ЕЩЁ НОВОСТИ"],
    "news.ui.moreTitle": [
      "Järgmised lood ja tegemised",
      "More stories and activities",
      "Другие истории и события"
    ],
    "news.ui.firstSoon": [
      "Esimene uudis ilmub peagi",
      "The first news item is coming soon",
      "Первая новость скоро появится"
    ],
    "news.ui.firstSoonText": [
      "Lisa esimene uudis faili news-data.js.",
      "Add the first news item to news-data.js.",
      "Добавьте первую новость в файл news-data.js."
    ],
    "news.lightbox.kicker": ["UUDISE FOTO", "NEWS PHOTO", "ФОТОГРАФИЯ К НОВОСТИ"],
    "news.lightbox.open": [
      "Ava uudise foto suurelt",
      "Open the news photo in a larger view",
      "Открыть фотографию к новости в увеличенном виде"
    ],

    /* ========================= Project-writing camp ========================= */
    "camp.meta.title": [
      "Ida-Virumaa noorte projektikirjutamise laager 2026 | MTÜ Noortealgatuste Tugi",
      "Ida-Virumaa noorte projektikirjutamise laager 2026 | MTÜ Noortealgatuste Tugi",
      "Ida-Virumaa noorte projektikirjutamise laager 2026 | MTÜ Noortealgatuste Tugi"
    ],
    "camp.meta.description": [
      "Ida-Virumaa noorte projektikirjutamise laager aitab noortel muuta ideed selgeteks, teostatavateks ja mõjusateks projektideks.",
      "Ida-Virumaa noorte projektikirjutamise laager helps young people turn ideas into clear, feasible and impactful projects.",
      "Ida-Virumaa noorte projektikirjutamise laager помогает молодёжи превращать идеи в понятные, осуществимые и значимые проекты."
    ],
    "camp.meta.ogDescription": [
      "Kahepäevane laager aitab noortel muuta ideed selgeteks ja teostatavateks projektideks.",
      "A two-day camp that helps young people turn ideas into clear and feasible projects.",
      "Двухдневный лагерь помогает молодёжи превращать идеи в понятные и осуществимые проекты."
    ],
    "camp.decor.heroWords": [
      "IDEE • TEADMINE • PROJEKT • MÕJU",
      "IDEA • KNOWLEDGE • PROJECT • IMPACT",
      "ИДЕЯ • ЗНАНИЯ • ПРОЕКТ • РЕЗУЛЬТАТ"
    ],
    "camp.decor.ideaToProject": [
      "IDEEST PROJEKTINI",
      "FROM IDEA TO PROJECT",
      "ОТ ИДЕИ К ПРОЕКТУ"
    ],
    "camp.decor.audience": ["KELLELE?", "WHO IS IT FOR?", "ДЛЯ КОГО?"],
    "camp.decor.next": ["EDASI", "NEXT", "ДАЛЬШЕ"],
    "camp.decor.yourIdea": ["SINU IDEE", "YOUR IDEA", "ТВОЯ ИДЕЯ"],
    "camp.hero.eyebrow": [
      "19.–20. SEPTEMBER 2026 · TOILA SPA HOTELL",
      "19–20 SEPTEMBER 2026 · TOILA SPA HOTELL",
      "19–20 СЕНТЯБРЯ 2026 · TOILA SPA HOTELL"
    ],
    "camp.hero.title": [
      "Ida-Virumaa noorte projektikirjutamise laager",
      "Ida-Virumaa noorte projektikirjutamise laager",
      "Ida-Virumaa noorte projektikirjutamise laager"
    ],
    "camp.hero.titleAccent": [
      "aktiivsetele noortele",
      "for active young people",
      "для активной молодёжи"
    ],
    "camp.hero.description": [
      "Kahepäevane praktiline laager noortele, kellel on idee, mida nad soovivad arendada, või tiim, kellega koos oma projekt ellu viia.",
      "A two-day practical camp for young people who have an idea they want to develop or a team with whom they want to deliver a project.",
      "Двухдневный практический лагерь для молодых людей, у которых есть идея для развития или команда, вместе с которой хочется реализовать проект."
    ],
    "camp.hero.registrationClosed": [
      "Registreerimine ei ole veel avatud",
      "Registration is not open yet",
      "Регистрация пока не открыта"
    ],
    "camp.hero.discover": [
      "Tutvu laagriga",
      "Explore the camp",
      "Узнать о лагере"
    ],
    "camp.hero.progressLabel": [
      "Idee areng laagris",
      "How an idea develops at the camp",
      "Развитие идеи в лагере"
    ],
    "camp.hero.plan": ["Plaan", "Plan", "План"],
    "camp.hero.project": ["Projekt", "Project", "Проект"],
    "camp.hero.mapLabel": [
      "Projekti arengukaart",
      "Project development map",
      "Карта развития проекта"
    ],
    "camp.hero.start": ["START", "START", "СТАРТ"],
    "camp.hero.yourIdea": ["Sinu idee", "Your idea", "Ваша идея"],
    "camp.hero.mapText": [
      "Laagris anname sellele struktuuri, suuna ja järgmised sammud.",
      "At the camp, we give it structure, direction and clear next steps.",
      "В лагере мы придадим ей структуру, направление и определим следующие шаги."
    ],
    "camp.hero.goal": ["Eesmärk", "Goal", "Цель"],
    "camp.hero.activities": ["Tegevused", "Activities", "Действия"],
    "camp.hero.budget": ["Eelarve", "Budget", "Бюджет"],
    "camp.hero.funding": ["Rahastus", "Funding", "Финансирование"],
    "camp.hero.scrollLabel": [
      "Liigu laagri kirjelduse juurde",
      "Go to the camp description",
      "Перейти к описанию лагеря"
    ],
    "camp.hero.program": [
      "Avasta programm",
      "Explore the programme",
      "Посмотреть программу"
    ],
    "camp.info.date": ["Kuupäev", "Date", "Дата"],
    "camp.info.location": ["Asukoht", "Location", "Место"],
    "camp.info.duration": ["Kestus", "Duration", "Продолжительность"],
    "camp.info.twoDays": ["2 päeva", "2 days", "2 дня"],
    "camp.info.organiser": ["Korraldaja", "Organiser", "Организатор"],
    "camp.about.label": ["LAAGRIST", "ABOUT THE CAMP", "О ЛАГЕРЕ"],
    "camp.about.title": [
      "Ideest läbimõeldud projektini",
      "From an idea to a well-designed project",
      "От идеи к продуманному проекту"
    ],
    "camp.about.lead": [
      "Projektikirjutamise laagri eesmärk on aidata noortel muuta esialgne idee selgeks ja teostatavaks projektiks.",
      "The project-writing camp helps young people turn an initial idea into a clear and feasible project.",
      "Лагерь по написанию проектов помогает молодёжи превратить первоначальную идею в понятный и осуществимый проект."
    ],
    "camp.about.text1": [
      "Kahe päeva jooksul õpivad osalejad sõnastama projekti eesmärki, määrama sihtrühma, kavandama tegevusi, koostama eelarvet ning leidma oma ideele sobivaid rahastusvõimalusi.",
      "Over two days, participants learn to define a project goal and target group, plan activities, prepare a budget and find suitable funding opportunities.",
      "За два дня участники научатся формулировать цель проекта, определять целевую группу, планировать действия, составлять бюджет и находить подходящие возможности финансирования."
    ],
    "camp.about.text2": [
      "Laagris töötatakse nii iseseisvalt kui ka tiimides. Osaleja võib tulla juba olemasoleva projektidee või meeskonnaga. Täielikult valmis projektiplaan ei ole osalemiseks vajalik.",
      "Participants work both independently and in teams. You may arrive with an existing project idea or team; a finished project plan is not required.",
      "В лагере участники работают как самостоятельно, так и в командах. Можно приехать с готовой идеей проекта или своей командой; полностью разработанный план для участия не нужен."
    ],
    "camp.about.stat": [
      "praktilist ja arendavat päeva",
      "practical days of development",
      "дня практики и развития"
    ],
    "camp.countdown.label": [
      "LAAGRI ALGUSENI ON JÄÄNUD",
      "UNTIL THE CAMP BEGINS",
      "ДО НАЧАЛА ЛАГЕРЯ"
    ],
    "camp.countdown.meet": [
      "Kohtume 19.–20. septembril 2026",
      "See you on 19–20 September 2026",
      "Встречаемся 19–20 сентября 2026 года"
    ],
    "camp.countdown.invalid": [
      "Laagri kuupäev ei ole õigesti määratud.",
      "The camp date has not been set correctly.",
      "Дата лагеря указана неверно."
    ],
    "camp.countdown.started": [
      "Laager on alanud!",
      "The camp has begun!",
      "Лагерь начался!"
    ],
    "camp.audience.label": ["KELLELE?", "WHO IS IT FOR?", "ДЛЯ КОГО?"],
    "camp.audience.title": [
      "Ootame aktiivseid noori ja noortetiime",
      "We welcome active young people and youth teams",
      "Мы ждём активную молодёжь и молодёжные команды"
    ],
    "camp.audience.description": [
      "Laager sobib osalejale, kes soovib oma idee arendamisel praktilist tuge, uusi teadmisi ja tagasisidet.",
      "The camp is for participants seeking practical support, new knowledge and feedback to develop their idea.",
      "Лагерь подойдёт тем, кто хочет получить практическую поддержку, новые знания и обратную связь для развития своей идеи."
    ],
    "camp.audience.ideaTitle": [
      "Noor, kellel on idee",
      "A young person with an idea",
      "Молодой человек с идеей"
    ],
    "camp.audience.ideaText": [
      "Sul on idee sündmuse, projekti või algatuse jaoks, kuid sa ei tea veel täpselt, kuidas sellega edasi liikuda.",
      "You have an idea for an event, project or initiative but are not yet sure how to take it forward.",
      "У вас есть идея мероприятия, проекта или инициативы, но пока неясно, как двигаться дальше."
    ],
    "camp.audience.teamTitle": [
      "Juba tegutsev tiim",
      "An existing team",
      "Уже действующая команда"
    ],
    "camp.audience.teamText": [
      "Teil on olemas meeskond ja ühine idee, mida soovite laagri jooksul põhjalikumalt läbi töötada.",
      "You have a team and a shared idea that you want to develop in greater depth during the camp.",
      "У вас есть команда и общая идея, которую вы хотите подробно проработать во время лагеря."
    ],
    "camp.audience.activeTitle": [
      "Aktiivne ja ettevõtlik noor",
      "An active, enterprising young person",
      "Активный и инициативный молодой человек"
    ],
    "camp.audience.activeText": [
      "Soovid õppida projektide koostamist, leida uusi koostööpartnereid ning tulevikus oma algatusi ellu viia.",
      "You want to learn how to design projects, find new partners and deliver your own initiatives in the future.",
      "Вы хотите научиться составлять проекты, найти новых партнёров и в будущем воплощать собственные инициативы."
    ],
    "camp.skills.label": ["MIDA ÕPID?", "WHAT WILL YOU LEARN?", "ЧЕМУ ВЫ НАУЧИТЕСЬ?"],
    "camp.skills.title": [
      "Praktilised oskused oma idee elluviimiseks",
      "Practical skills to bring your idea to life",
      "Практические навыки для воплощения идеи"
    ],
    "camp.skills.problemTitle": [
      "Probleemi ja eesmärgi sõnastamine",
      "Defining the problem and goal",
      "Формулировка проблемы и цели"
    ],
    "camp.skills.problemText": [
      "Õpid kirjeldama, millist probleemi sinu projekt lahendab ja millist tulemust soovid saavutada.",
      "Learn to describe the problem your project addresses and the result you want to achieve.",
      "Вы научитесь описывать проблему, которую решает проект, и результат, которого хотите достичь."
    ],
    "camp.skills.planTitle": [
      "Tegevuskava koostamine",
      "Creating an action plan",
      "Составление плана действий"
    ],
    "camp.skills.planText": [
      "Paned paika projekti põhitegevused, ajakava, vastutajad ja vajalikud ressursid.",
      "Define the project’s key activities, timeline, responsibilities and required resources.",
      "Вы определите основные действия проекта, график, ответственных и необходимые ресурсы."
    ],
    "camp.skills.budgetTitle": [
      "Eelarve planeerimine",
      "Budget planning",
      "Планирование бюджета"
    ],
    "camp.skills.budgetText": [
      "Õpid hindama projekti kulusid ning koostama arusaadavat ja realistlikku eelarvet.",
      "Learn to estimate project costs and prepare a clear, realistic budget.",
      "Вы научитесь оценивать расходы проекта и составлять понятный и реалистичный бюджет."
    ],
    "camp.skills.fundingTitle": [
      "Rahastusvõimaluste leidmine",
      "Finding funding opportunities",
      "Поиск возможностей финансирования"
    ],
    "camp.skills.fundingText": [
      "Saad ülevaate sellest, kust otsida projektile rahastust ning kuidas valida sobiv toetusprogramm.",
      "Find out where to look for project funding and how to choose a suitable support programme.",
      "Вы узнаете, где искать финансирование проекта и как выбрать подходящую программу поддержки."
    ],
    "camp.skills.pitchTitle": [
      "Idee esitlemine",
      "Presenting your idea",
      "Презентация идеи"
    ],
    "camp.skills.pitchText": [
      "Harjutad oma projekti selget ja veenvat tutvustamist mentoritele, partneritele ja võimalikele rahastajatele.",
      "Practise presenting your project clearly and persuasively to mentors, partners and potential funders.",
      "Вы потренируетесь ясно и убедительно представлять проект менторам, партнёрам и потенциальным финансирующим организациям."
    ],
    "camp.skills.teamworkTitle": ["Meeskonnatöö", "Teamwork", "Командная работа"],
    "camp.skills.teamworkText": [
      "Õpid jagama ülesandeid, määrama rolle ning tegema koostööd ühise eesmärgi saavutamiseks.",
      "Learn to divide tasks, define roles and collaborate towards a shared goal.",
      "Вы научитесь распределять задачи, определять роли и работать вместе ради общей цели."
    ],
    "camp.program.label": ["PROGRAMM", "PROGRAMME", "ПРОГРАММА"],
    "camp.program.title": [
      "Kahe päeva jooksul viime idee järgmisele tasemele",
      "Two days to take your idea to the next level",
      "За два дня выведем идею на новый уровень"
    ],
    "camp.program.note": [
      "Täpsem programm ja kellajad lisatakse enne laagri toimumist.",
      "A detailed programme and timetable will be added before the camp.",
      "Подробная программа и расписание будут опубликованы до начала лагеря."
    ],
    "camp.program.day1": ["1. päev", "Day 1", "День 1"],
    "camp.program.day1Title": [
      "Idee ja projekti ülesehitus",
      "Idea and project structure",
      "Идея и структура проекта"
    ],
    "camp.program.day1Item1": [
      "Saabumine ja osalejate tutvumine",
      "Arrival and introductions",
      "Заезд и знакомство участников"
    ],
    "camp.program.day1Item2": [
      "Ideede ning tiimide tutvustamine",
      "Introducing ideas and teams",
      "Представление идей и команд"
    ],
    "camp.program.day1Item3": [
      "Probleemi, eesmärgi ja sihtrühma määramine",
      "Defining the problem, goal and target group",
      "Определение проблемы, цели и целевой группы"
    ],
    "camp.program.day1Item4": [
      "Projekti tegevuste kavandamine",
      "Planning project activities",
      "Планирование действий проекта"
    ],
    "camp.program.day1Item5": [
      "Mentorite tagasiside",
      "Mentor feedback",
      "Обратная связь от менторов"
    ],
    "camp.program.day2": ["2. päev", "Day 2", "День 2"],
    "camp.program.day2Title": [
      "Eelarve, rahastus ja esitlus",
      "Budget, funding and presentation",
      "Бюджет, финансирование и презентация"
    ],
    "camp.program.day2Item1": [
      "Projekti eelarve koostamine",
      "Preparing the project budget",
      "Составление бюджета проекта"
    ],
    "camp.program.day2Item2": [
      "Rahastusvõimaluste otsimine",
      "Finding funding opportunities",
      "Поиск возможностей финансирования"
    ],
    "camp.program.day2Item3": [
      "Riskide ja võimalike lahenduste analüüs",
      "Analysing risks and possible solutions",
      "Анализ рисков и возможных решений"
    ],
    "camp.program.day2Item4": [
      "Projekti esitluse ettevalmistamine",
      "Preparing the project presentation",
      "Подготовка презентации проекта"
    ],
    "camp.program.day2Item5": [
      "Ideede esitlemine ja lõplik tagasiside",
      "Presenting ideas and final feedback",
      "Презентация идей и итоговая обратная связь"
    ],
    "camp.support.label": [
      "TUGI PÄRAST LAAGRIT",
      "SUPPORT AFTER THE CAMP",
      "ПОДДЕРЖКА ПОСЛЕ ЛАГЕРЯ"
    ],
    "camp.support.title": [
      "Laager on algus, mitte lõpp",
      "The camp is a beginning, not an end",
      "Лагерь — это начало, а не конец"
    ],
    "camp.support.description": [
      "Hea projekt vajab vahel veel ühte küsimust, kontakti või julgustavat tagasisidet. Soovime, et sinu idee liiguks edasi ka pärast laagrit.",
      "A good project may need one more question, useful contact or encouraging piece of feedback. We want your idea to keep moving after the camp.",
      "Хорошему проекту иногда нужен ещё один вопрос, полезный контакт или поддерживающая обратная связь. Мы хотим, чтобы ваша идея развивалась и после лагеря."
    ],
    "camp.support.feedbackTitle": ["Tagasiside", "Feedback", "Обратная связь"],
    "camp.support.feedbackText": [
      "Aitame sul pärast laagrit oma projektiplaani täpsustada ja järgmised sammud selgemaks muuta.",
      "After the camp, we can help refine your project plan and clarify the next steps.",
      "После лагеря мы поможем уточнить план проекта и сделать следующие шаги понятнее."
    ],
    "camp.support.contactsTitle": ["Kontaktid", "Contacts", "Контакты"],
    "camp.support.contactsText": [
      "Jagame võimalikke koostööpartnereid, mentoreid ja rahastusallikaid, mis võivad sinu ideed edasi aidata.",
      "We share potential partners, mentors and funding sources that could help your idea progress.",
      "Мы поделимся контактами возможных партнёров, менторов и источников финансирования, которые помогут развить идею."
    ],
    "camp.support.nextTitle": ["Järgmine samm", "Next step", "Следующий шаг"],
    "camp.support.nextText": [
      "Kui soovid projektiga jätkata, saad meiega ühendust võtta ning koos läbi arutada, kuidas ideest päris tegevuseni jõuda.",
      "If you want to continue with your project, contact us and we can discuss how to move from idea to action.",
      "Если вы хотите продолжить работу над проектом, свяжитесь с нами, и мы вместе обсудим путь от идеи к реальным действиям."
    ],
    "camp.contact.label": ["KÜSIMUSED JA IDEED", "QUESTIONS AND IDEAS", "ВОПРОСЫ И ИДЕИ"],
    "camp.contact.title": [
      "Kas vajad oma projektile nõu või tuge?",
      "Does your project need advice or support?",
      "Нужны совет или поддержка для проекта?"
    ],
    "camp.contact.description": [
      "Kirjuta meile laagri või oma idee kohta. Vastame, aitame mõtteid korrastada ja arutame koos, milline võiks olla sinu järgmine samm.",
      "Write to us about the camp or your idea. We will respond, help organise your thoughts and discuss your next step.",
      "Напишите нам о лагере или своей идее. Мы ответим, поможем упорядочить мысли и вместе обсудим следующий шаг."
    ],
    "camp.newsletter.body": [
      "Liitu infokirjaga, et saada teavet meie sündmuste, projektide, laagrite ja noortele suunatud võimaluste kohta.",
      "Subscribe to receive information about our events, projects, camps and opportunities for young people.",
      "Подпишитесь на рассылку, чтобы получать информацию о наших мероприятиях, проектах, лагерях и возможностях для молодёжи."
    ],
    "camp.lightbox.defaultCaption": [
      "Ida-Virumaa noorte projektikirjutamise laager",
      "Ida-Virumaa noorte projektikirjutamise laager",
      "Ida-Virumaa noorte projektikirjutamise laager"
    ],

    /* ========================= Youth Recognition Gala ========================= */
    "gala.meta.title": [
      "Ida-Virumaa noorte tunnustusgala 2026 | MTÜ Noortealgatuste Tugi",
      "Ida-Virumaa noorte tunnustusgala 2026 | MTÜ Noortealgatuste Tugi",
      "Ida-Virumaa noorte tunnustusgala 2026 | MTÜ Noortealgatuste Tugi"
    ],
    "gala.meta.description": [
      "Ida-Virumaa noorte tunnustusgala annab piirkonna noortele võimaluse särada ning toob esile nende teod, ideed ja saavutused.",
      "Ida-Virumaa noorte tunnustusgala gives young people in the region a chance to shine and highlights their actions, ideas and achievements.",
      "Ida-Virumaa noorte tunnustusgala даёт молодёжи региона возможность проявить себя и рассказывает об их делах, идеях и достижениях."
    ],
    "gala.meta.ogDescription": [
      "Tunnustame Ida-Virumaa aktiivseid, loovaid ja silmapaistvaid noori.",
      "Celebrating active, creative and outstanding young people in Ida-Viru County.",
      "Отмечаем активную, творческую и выдающуюся молодёжь Ида-Вирумаа."
    ],
    "gala.decor.heroWords": [
      "TUNNUSTAME • INSPIREERIME • ÜHENDAME",
      "CELEBRATE • INSPIRE • CONNECT",
      "ПРИЗНАЁМ • ВДОХНОВЛЯЕМ • ОБЪЕДИНЯЕМ"
    ],
    "gala.hero.date": [
      "17. oktoober 2026",
      "17 October 2026",
      "17 октября 2026 года"
    ],
    "gala.hero.title": [
      "Ida-Virumaa noorte tunnustusgala",
      "Ida-Virumaa noorte tunnustusgala",
      "Ida-Virumaa noorte tunnustusgala"
    ],
    "gala.hero.description": [
      "Ida-Virumaa noorte tunnustusgala toob kokku aktiivsed noored, noorte toetajad, organisatsioonid ja kogukonna esindajad, et märgata ning tunnustada noorte panust Ida-Virumaa arengusse.",
      "Ida-Virumaa noorte tunnustusgala brings together active young people, youth supporters, organisations and community representatives to recognise young people’s contribution to the development of Ida-Viru County.",
      "Ida-Virumaa noorte tunnustusgala объединяет активную молодёжь, тех, кто её поддерживает, организации и представителей сообщества, чтобы отметить вклад молодых людей в развитие Ида-Вирумаа."
    ],
    "gala.hero.nominate": [
      "Esita kandidaat",
      "Nominate a candidate",
      "Выдвинуть кандидата"
    ],
    "gala.hero.read": [
      "Loe sündmusest",
      "About the event",
      "О событии"
    ],
    "gala.hero.addPhoto": [
      "Lisa gala peafoto",
      "Add the gala’s main photo",
      "Добавьте главную фотографию гала-вечера"
    ],
    "gala.hero.photoCaption": [
      "Ida-Virumaa noorte tunnustusgala – ühispilt",
      "Ida-Virumaa noorte tunnustusgala – group photo",
      "Ida-Virumaa noorte tunnustusgala — общее фото"
    ],
    "gala.hero.photoCredit": [
      "Foto: Alissa Linter",
      "Photo: Alissa Linter",
      "Фото: Alissa Linter"
    ],
    "gala.hero.openPhoto": [
      "Ava Ida-Virumaa noorte tunnustusgala ühispilt suurelt",
      "Open the Ida-Virumaa noorte tunnustusgala group photo in a larger view",
      "Открыть общее фото Ida-Virumaa noorte tunnustusgala в увеличенном виде"
    ],
    "gala.hero.photoAlt": [
      "Ida-Virumaa noorte tunnustusgala ühispilt",
      "Ida-Virumaa noorte tunnustusgala group photo",
      "Общее фото Ida-Virumaa noorte tunnustusgala"
    ],
    "gala.hero.celebration": [
      "Pidulik tunnustusõhtu",
      "An evening of celebration and recognition",
      "Торжественный вечер признания"
    ],
    "gala.info.label": [
      "Sündmuse põhiinfo",
      "Key event information",
      "Основная информация о событии"
    ],
    "gala.info.date": ["Kuupäev", "Date", "Дата"],
    "gala.info.location": ["Asukoht", "Location", "Место"],
    "gala.info.organiser": ["Korraldaja", "Organiser", "Организатор"],
    "gala.about.label": ["SÜNDMUSEST", "ABOUT THE EVENT", "О СОБЫТИИ"],
    "gala.about.title": [
      "Mis on noorte tunnustusgala?",
      "What is the Youth Recognition Gala?",
      "Что такое гала-вечер признания молодёжи?"
    ],
    "gala.about.lead": [
      "Gala on õhtu, kus noorte saavutused, julgus, loovus ja panus kogukonda saavad tähelepanu, mida need väärivad.",
      "The gala is an evening where young people’s achievements, courage, creativity and contributions to the community receive the recognition they deserve.",
      "Гала-вечер — это событие, на котором достижения, смелость, творчество и вклад молодёжи в сообщество получают заслуженное признание."
    ],
    "gala.about.text1": [
      "Ida-Virumaal on nii palju noori, kelle tegudest, ideedest ja saavutustest võiks rääkida palju rohkem, kui seni räägitakse. Sageli jäävad just need lood varju ja meie tahame seda muuta.",
      "Ida-Viru County is home to many young people whose actions, ideas and achievements deserve far more attention. Too often, these stories remain unseen, and we want to change that.",
      "В Ида-Вирумаа живёт много молодых людей, о делах, идеях и достижениях которых стоит говорить гораздо больше. Часто эти истории остаются в тени, и мы хотим это изменить."
    ],
    "gala.about.text2": [
      "Ida-Virumaa noorte tunnustusgala annab Ida-Virumaa noortele võimaluse särada. Tunnustame aktiivseid, ettevõtlikke ja silmapaistvaid noori, aga ka inimesi, kes seisavad nende kõrval ja toetavad nende arengut ning algatusi.",
      "Ida-Virumaa noorte tunnustusgala gives young people in Ida-Viru County a chance to shine. We recognise active, enterprising and outstanding young people, as well as those who stand beside them and support their growth and initiatives.",
      "Ida-Virumaa noorte tunnustusgala даёт молодёжи Ида-Вирумаа возможность проявить себя. Мы отмечаем активных, инициативных и выдающихся молодых людей, а также тех, кто находится рядом и поддерживает их развитие и начинания."
    ],
    "gala.about.text3": [
      "Gala kaudu tahame tuua nähtavale head eeskujud, jagada noorte saavutuste lugusid ning innustada veel rohkemaid noori julgelt kogukonnaelus kaasa lööma. Sest iga tunnustatud noor on ka väike samm selle poole, et Ida-Virumaast räägitaks kui piirkonnast, kus sünnivad julged ideed ja tegusad inimesed.",
      "Through the gala, we want to highlight positive role models, share stories of young people’s achievements and inspire even more young people to participate confidently in community life. Every recognised young person is another step towards Ida-Viru County being known as a region of bold ideas and active people.",
      "С помощью гала-вечера мы хотим показать достойные примеры, поделиться историями достижений молодёжи и вдохновить ещё больше молодых людей смело участвовать в жизни сообщества. Каждый отмеченный молодой человек — ещё один шаг к тому, чтобы об Ида-Вирумаа говорили как о регионе смелых идей и деятельных людей."
    ],
    "gala.about.slogan": [
      "Tunnustame. Inspireerime. Ühendame.",
      "We recognise. We inspire. We connect.",
      "Признаём. Вдохновляем. Объединяем."
    ],
    "gala.about.categoriesStat": [
      "tunnustuskategooriat",
      "recognition categories",
      "номинаций"
    ],
    "gala.about.yearStat": [
      "noorte saavutuste aasta",
      "a year of youth achievement",
      "год достижений молодёжи"
    ],
    "gala.countdown.label": [
      "Kandidaatide esitamiseks on jäänud",
      "Time left to submit nominations",
      "До окончания приёма заявок"
    ],
    "gala.countdown.meet": [
      "Kohtume 17. oktoobril 2026",
      "See you on 17 October 2026",
      "Встречаемся 17 октября 2026 года"
    ],
    "gala.countdown.invalid": [
      "Kuupäev ei ole õigesti määratud.",
      "The date has not been set correctly.",
      "Дата указана неверно."
    ],
    "gala.countdown.finished": [
      "Kandidaatide esitamise aeg on läbi!",
      "The nomination period has ended!",
      "Приём заявок завершён!"
    ],
    "gala.evening.label": ["GALAÕHTU", "GALA EVENING", "ГАЛА-ВЕЧЕР"],
    "gala.evening.title": [
      "Rohkem kui auhindade üleandmine",
      "More than an awards ceremony",
      "Больше, чем вручение наград"
    ],
    "gala.evening.description": [
      "See on pidulik kohtumine, kus noorte lood, saavutused ja tulevikuideed saavad üheks inspireerivaks õhtuks.",
      "A celebratory gathering where young people’s stories, achievements and ideas for the future come together in one inspiring evening.",
      "Это торжественная встреча, на которой истории, достижения и идеи молодёжи о будущем объединяются в один вдохновляющий вечер."
    ],
    "gala.evening.recognitionTitle": ["Tunnustamine", "Recognition", "Признание"],
    "gala.evening.recognitionText": [
      "Toome lavale noored, kelle tegevus ja saavutused väärivad märkamist.",
      "We bring to the stage young people whose work and achievements deserve recognition.",
      "Мы приглашаем на сцену молодых людей, чьи дела и достижения заслуживают внимания."
    ],
    "gala.evening.inspirationTitle": ["Inspiratsioon", "Inspiration", "Вдохновение"],
    "gala.evening.inspirationText": [
      "Jagame lugusid, mis julgustavad teisi noori oma ideid ellu viima.",
      "We share stories that encourage other young people to bring their ideas to life.",
      "Мы делимся историями, которые вдохновляют других молодых людей воплощать свои идеи."
    ],
    "gala.evening.togetherTitle": ["Ühine õhtu", "An evening together", "Общий вечер"],
    "gala.evening.togetherText": [
      "Ühendame noored, kogukonnad ja toetajad pidulikus ning soojas õhkkonnas.",
      "We bring together young people, communities and supporters in a warm, celebratory atmosphere.",
      "Мы объединяем молодёжь, сообщества и тех, кто их поддерживает, в тёплой праздничной атмосфере."
    ],
    "gala.categories.label": ["KATEGOORIAD", "CATEGORIES", "НОМИНАЦИИ"],
    "gala.categories.title": [
      "Tunnustuskategooriad",
      "Recognition categories",
      "Номинации"
    ],
    "gala.categories.description": [
      "Kandidaate saab esitada kaheteistkümnes kategoorias, mis toovad esile noorte mitmekülgse panuse kultuuri, spordi, hariduse ja kogukonna arengusse.",
      "Candidates can be nominated in twelve categories highlighting the many ways young people contribute to culture, sport, education and community development.",
      "Кандидатов можно выдвинуть в двенадцати номинациях, которые отражают разнообразный вклад молодёжи в культуру, спорт, образование и развитие сообщества."
    ],
    "gala.categories.musicianTitle": [
      "Aasta noormuusik",
      "Young Musician of the Year",
      "Молодой музыкант года"
    ],
    "gala.categories.musicianText": [
      "Noor, kes on silma paistnud muusika loomise, esitamise või arendamisega ning rikastanud kultuurielu oma loomingulisuse ja tegevusega.",
      "A young person who has stood out in creating, performing or developing music and enriched cultural life through their creativity and work.",
      "Молодой человек, проявивший себя в создании, исполнении или развитии музыки и обогативший культурную жизнь своим творчеством и деятельностью."
    ],
    "gala.categories.volunteerTitle": [
      "Aasta noorvabatahtlik",
      "Young Volunteer of the Year",
      "Молодой волонтёр года"
    ],
    "gala.categories.volunteerText": [
      "Noor, kes on vabatahtliku tegevusega panustanud kogukonda, aidanud teisi või algatanud ühiskondlikult olulisi tegevusi.",
      "A young person who has contributed to the community through volunteering, helped others or launched socially important activities.",
      "Молодой человек, который внёс вклад в сообщество через волонтёрство, помогал другим или инициировал общественно значимые дела."
    ],
    "gala.categories.athleteTitle": [
      "Aasta noorsportlane",
      "Young Athlete of the Year",
      "Молодой спортсмен года"
    ],
    "gala.categories.athleteText": [
      "Noor, kes on saavutanud silmapaistvaid tulemusi spordis ja olnud eeskujuks aktiivse ning pühendunud sportliku tegevusega.",
      "A young person who has achieved outstanding results in sport and set an example through active, dedicated participation.",
      "Молодой человек, добившийся выдающихся результатов в спорте и ставший примером благодаря активности и целеустремлённости."
    ],
    "gala.categories.artistTitle": [
      "Aasta noorkunstnik",
      "Young Artist of the Year",
      "Молодой художник года"
    ],
    "gala.categories.artistText": [
      "Noor, kes on silma paistnud visuaalse, kaasaegse või muu loomingulise kunstilise tegevusega ning väljendanud end omanäoliselt ja loovalt.",
      "A young person who has stood out in visual, contemporary or another form of artistic work and expressed themselves in an original, creative way.",
      "Молодой человек, проявивший себя в визуальном, современном или другом виде искусства и выразивший себя оригинально и творчески."
    ],
    "gala.categories.visualTitle": [
      "Aasta noor visuaalne looja",
      "Young Visual Creator of the Year",
      "Молодой визуальный автор года"
    ],
    "gala.categories.visualText": [
      "Noor, kes on silma paistnud fotograafia, video- või filmiloominguga ning kelle visuaalsed tööd on pälvinud tähelepanu või inspireerinud teisi.",
      "A young person recognised for photography, video or filmmaking whose visual work has attracted attention or inspired others.",
      "Молодой человек, проявивший себя в фотографии, видео или кино, чьи визуальные работы привлекли внимание или вдохновили других."
    ],
    "gala.categories.dancerTitle": [
      "Aasta noortantsija",
      "Young Dancer of the Year",
      "Молодой танцор года"
    ],
    "gala.categories.dancerText": [
      "Noor, kes on silma paistnud tantsuvaldkonnas oma pühendumuse, loomingulisuse või esinemistegevusega.",
      "A young person who has stood out in dance through dedication, creativity or performance.",
      "Молодой человек, проявивший себя в танце благодаря целеустремлённости, творчеству или выступлениям."
    ],
    "gala.categories.actorTitle": [
      "Aasta noornäitleja",
      "Young Actor of the Year",
      "Молодой актёр года"
    ],
    "gala.categories.actorText": [
      "Noor, kes on silma paistnud näitlemise, lavalise tegevuse või etenduskunstiga ning panustanud kultuuri- või teatrivaldkonda.",
      "A young person who has stood out in acting, stage work or performance art and contributed to culture or theatre.",
      "Молодой человек, проявивший себя в актёрском мастерстве, сценической деятельности или исполнительском искусстве и внёсший вклад в культуру или театр."
    ],
    "gala.categories.leaderTitle": [
      "Aasta noorjuht",
      "Young Leader of the Year",
      "Молодой лидер года"
    ],
    "gala.categories.leaderText": [
      "Noor, kes on oma eestvedamise ja juhtimisoskustega panustanud kogukonna või organisatsiooni arengusse.",
      "A young person who has contributed to the development of a community or organisation through leadership and management skills.",
      "Молодой человек, который благодаря инициативности и лидерским навыкам внёс вклад в развитие сообщества или организации."
    ],
    "gala.categories.environmentTitle": [
      "Aasta noor loodushoidja",
      "Young Environmental Advocate of the Year",
      "Молодой защитник природы года"
    ],
    "gala.categories.environmentText": [
      "Noor, kes on panustanud keskkonna, kliima, kestliku eluviisi ja maailmahariduse kaudu planeedi ning inimeste heaolu loomisesse.",
      "A young person who has contributed to the wellbeing of people and the planet through work on the environment, climate, sustainable living or global education.",
      "Молодой человек, который вносит вклад в благополучие людей и планеты через заботу об окружающей среде, климате, устойчивом образе жизни или глобальном образовании."
    ],
    "gala.categories.studentTitle": [
      "Aasta noor õppur",
      "Young Student of the Year",
      "Молодой учащийся года"
    ],
    "gala.categories.studentText": [
      "Noor, kes on silma paistnud õppeedukuse, teadmishimu, enesearengu või aktiivse osalemisega haridus- ja teadustegevustes.",
      "A young person who has stood out through academic achievement, curiosity, self-development or active participation in education and science.",
      "Молодой человек, проявивший себя успехами в учёбе, стремлением к знаниям, саморазвитием или активным участием в образовательной и научной деятельности."
    ],
    "gala.categories.actionTitle": [
      "Aasta noorte tegu",
      "Youth Initiative of the Year",
      "Молодёжная инициатива года"
    ],
    "gala.categories.actionText": [
      "Noor või noortegrupp, kes on algatanud ja ellu viinud silmapaistva ettevõtmise, projekti või tegevuse, millel on olnud positiivne mõju kogukonnale või noortele.",
      "A young person or group who initiated and delivered an outstanding undertaking, project or activity with a positive impact on the community or young people.",
      "Молодой человек или группа молодых людей, которые инициировали и реализовали выдающееся дело, проект или мероприятие, положительно повлиявшее на сообщество или молодёжь."
    ],
    "gala.categories.europeTitle": [
      "Aasta noor Euroopa väärtuste kandja",
      "Young Champion of European Values of the Year",
      "Молодой носитель европейских ценностей года"
    ],
    "gala.categories.europeText": [
      "Noor, kes seisab oma tegude ja hoiakutega Euroopa väärtuste eest – demokraatia, inimõigused, võrdsus ja solidaarsus – ning innustab ka teisi neid järgima.",
      "A young person whose actions and attitudes uphold European values—democracy, human rights, equality and solidarity—and inspire others to do the same.",
      "Молодой человек, который своими поступками и взглядами отстаивает европейские ценности — демократию, права человека, равенство и солидарность — и вдохновляет других следовать им."
    ],
    "gala.gallery.label": ["FOTOGALERII", "PHOTO GALLERY", "ФОТОГАЛЕРЕЯ"],
    "gala.gallery.title": [
      "Hetked, mis jäävad meelde",
      "Moments to remember",
      "Моменты, которые останутся в памяти"
    ],
    "gala.gallery.photos": ["Fotod:", "Photos:", "Фото:"],
    "gala.gallery.count": ["12 fotokohta", "12 photos", "12 фотографий"],
    "gala.gallery.note": [
      "Klõpsa fotol, et avada see täissuuruses.",
      "Select a photo to open it at full size.",
      "Нажмите на фотографию, чтобы открыть её в полном размере."
    ],
    "gala.gallery.addPhoto": [
      "Lisa foto {{number}}",
      "Add photo {{number}}",
      "Добавить фото {{number}}"
    ],
    "gala.gallery.openPhoto": [
      "Ava foto: {{caption}}",
      "Open photo: {{caption}}",
      "Открыть фото: {{caption}}"
    ],
    "gala.gallery.gala": [
      "Noorte Tunnustusgala",
      "Youth Recognition Gala",
      "Гала-вечер признания молодёжи"
    ],
    "gala.gallery.guests": ["Külalised", "Guests", "Гости"],
    "gala.gallery.inspiration": [
      "Hetked täis inspiratsiooni",
      "Moments full of inspiration",
      "Моменты вдохновения"
    ],
    "gala.gallery.improv": ["Improteater", "Improvisational theatre", "Импровизационный театр"],
    "gala.gallery.evening": ["Pidulik õhtu", "Celebratory evening", "Торжественный вечер"],
    "gala.gallery.recognition": [
      "Laureaatide tunnustamine",
      "Recognising the laureates",
      "Награждение лауреатов"
    ],
    "gala.gallery.headliner": ["Peaesineja", "Headline performer", "Главный исполнитель"],
    "gala.gallery.volunteers": ["Vabatahtlikud", "Volunteers", "Волонтёры"],
    "gala.gallery.team": ["Korraldusmeeskond", "Organising team", "Команда организаторов"],
    "gala.gallery.atmosphere": ["Gala õhkkond", "Gala atmosphere", "Атмосфера гала-вечера"],
    "gala.gallery.awards": ["Autasustamine", "Awards", "Награждение"],
    "gala.gallery.memories": ["Mälestused", "Memories", "Воспоминания"],
    "gala.gallery.item01Add": ["Lisa foto 01", "Add photo 01", "Добавить фото 01"],
    "gala.gallery.item01Open": [
      "Ava foto: Ida-Virumaa noorte tunnustusgala",
      "Open photo: Ida-Virumaa noorte tunnustusgala",
      "Открыть фото: Ida-Virumaa noorte tunnustusgala"
    ],
    "gala.gallery.item02Add": ["Lisa foto 02", "Add photo 02", "Добавить фото 02"],
    "gala.gallery.item02Open": ["Ava foto: Külalised", "Open photo: Guests", "Открыть фото: Гости"],
    "gala.gallery.item03Add": ["Lisa foto 03", "Add photo 03", "Добавить фото 03"],
    "gala.gallery.item03Open": [
      "Ava foto: Hetked täis inspiratsiooni",
      "Open photo: Moments full of inspiration",
      "Открыть фото: Моменты вдохновения"
    ],
    "gala.gallery.item04Add": ["Lisa foto 04", "Add photo 04", "Добавить фото 04"],
    "gala.gallery.item04Open": [
      "Ava foto: Improteater",
      "Open photo: Improvisational theatre",
      "Открыть фото: Импровизационный театр"
    ],
    "gala.gallery.item05Add": ["Lisa foto 05", "Add photo 05", "Добавить фото 05"],
    "gala.gallery.item05Open": [
      "Ava foto: Pidulik õhtu",
      "Open photo: Celebratory evening",
      "Открыть фото: Торжественный вечер"
    ],
    "gala.gallery.item06Add": ["Lisa foto 06", "Add photo 06", "Добавить фото 06"],
    "gala.gallery.item06Open": [
      "Ava foto: Laureaatide tunnustamine",
      "Open photo: Recognising the laureates",
      "Открыть фото: Награждение лауреатов"
    ],
    "gala.gallery.item07Add": ["Lisa foto 07", "Add photo 07", "Добавить фото 07"],
    "gala.gallery.item07Open": [
      "Ava foto: Peaesineja",
      "Open photo: Headline performer",
      "Открыть фото: Главный исполнитель"
    ],
    "gala.gallery.item08Add": ["Lisa foto 08", "Add photo 08", "Добавить фото 08"],
    "gala.gallery.item08Open": [
      "Ava foto: Vabatahtlikud",
      "Open photo: Volunteers",
      "Открыть фото: Волонтёры"
    ],
    "gala.gallery.item09Add": ["Lisa foto 09", "Add photo 09", "Добавить фото 09"],
    "gala.gallery.item09Open": [
      "Ava foto: Korraldusmeeskond",
      "Open photo: Organising team",
      "Открыть фото: Команда организаторов"
    ],
    "gala.gallery.item10Add": ["Lisa foto 10", "Add photo 10", "Добавить фото 10"],
    "gala.gallery.item10Open": [
      "Ava foto: Gala õhkkond",
      "Open photo: Gala atmosphere",
      "Открыть фото: Атмосфера гала-вечера"
    ],
    "gala.gallery.item11Add": ["Lisa foto 11", "Add photo 11", "Добавить фото 11"],
    "gala.gallery.item11Open": [
      "Ava foto: Autasustamine",
      "Open photo: Awards",
      "Открыть фото: Награждение"
    ],
    "gala.gallery.item12Add": ["Lisa foto 12", "Add photo 12", "Добавить фото 12"],
    "gala.gallery.item12Open": [
      "Ava foto: Mälestused",
      "Open photo: Memories",
      "Открыть фото: Воспоминания"
    ],
    "gala.nomination.label": [
      "KANDIDAADI ESITAMINE",
      "NOMINATIONS",
      "ВЫДВИЖЕНИЕ КАНДИДАТА"
    ],
    "gala.nomination.title": [
      "Kas tead tunnustamist väärivat noort?",
      "Do you know a young person who deserves recognition?",
      "Знаете молодого человека, достойного признания?"
    ],
    "gala.nomination.description": [
      "Esita kandidaat Ida-Virumaa noorte tunnustusgalale. Enne vormi täitmist tutvu kategooriate ja kandidaatide esitamise tingimustega.",
      "Nominate a candidate for Ida-Virumaa noorte tunnustusgala. Before completing the form, review the categories and nomination terms.",
      "Выдвиньте кандидата на Ida-Virumaa noorte tunnustusgala. Перед заполнением формы ознакомьтесь с номинациями и условиями подачи заявки."
    ],
    "gala.nomination.openForm": [
      "Ava kandidaadi esitamise vorm",
      "Open the nomination form",
      "Открыть форму выдвижения кандидата"
    ],
    "gala.nomination.self": [
      "Kandidaadiks võib esitada ka iseennast.",
      "You may also nominate yourself.",
      "Можно выдвинуть и собственную кандидатуру."
    ],
    "gala.contact.label": ["KÜSIMUSED", "QUESTIONS", "ВОПРОСЫ"],
    "gala.contact.title": [
      "Võta meiega ühendust",
      "Get in touch",
      "Свяжитесь с нами"
    ],
    "gala.contact.description": [
      "Küsimuste korral kirjuta meile. Aitame kandidaatide esitamise, kategooriate ja sündmuse korraldusega seotud küsimustes.",
      "If you have questions, write to us. We can help with nominations, categories and event arrangements.",
      "Если у вас есть вопросы, напишите нам. Мы поможем с выдвижением кандидатов, номинациями и организацией события."
    ],
    "gala.newsletter.body": [
      "Liitu infokirjaga, et saada teavet meie sündmuste, projektide ja noortele suunatud võimaluste kohta.",
      "Subscribe to receive information about our events, projects and opportunities for young people.",
      "Подпишитесь на рассылку, чтобы получать информацию о наших мероприятиях, проектах и возможностях для молодёжи."
    ],

    /* ========================= Street Dance Jam ========================= */
    "street.meta.title": [
      "Street Dance Jam 2025 | MTÜ Noortealgatuste Tugi",
      "Street Dance Jam 2025 | MTÜ Noortealgatuste Tugi",
      "Street Dance Jam 2025 | MTÜ Noortealgatuste Tugi"
    ],
    "street.meta.description": [
      "Street Dance Jam tõi Ida-Virumaa noored kokku tänavatantsu, töötubade, tantsulahingute ja noorte omaalgatuse kaudu.",
      "Street Dance Jam brought young people from Ida-Viru County together through street dance, workshops, dance battles and youth-led initiative.",
      "Street Dance Jam объединил молодёжь Ида-Вирумаа благодаря уличным танцам, мастер-классам, танцевальным баттлам и молодёжной инициативе."
    ],
    "street.meta.ogDescription": [
      "Tänavatants, töötoad, tantsulahingud ja noorte omaalgatus Ida-Virumaal.",
      "Street dance, workshops, dance battles and youth-led initiative in Ida-Viru County.",
      "Уличные танцы, мастер-классы, танцевальные баттлы и молодёжная инициатива в Ида-Вирумаа."
    ],
    "street.decor.thankYou": ["AITÄH", "THANK YOU", "СПАСИБО"],
    "street.hero.eyebrow": [
      "NOORTELT NOORTELE",
      "BY YOUNG PEOPLE, FOR YOUNG PEOPLE",
      "МОЛОДЁЖЬ ДЛЯ МОЛОДЁЖИ"
    ],
    "street.hero.openLogo": [
      "Ava Street Dance Jam 2025 logo suurelt",
      "Open the Street Dance Jam 2025 logo in a larger view",
      "Открыть логотип Street Dance Jam 2025 в увеличенном виде"
    ],
    "street.hero.logoKicker": [
      "SÜNDMUSE LOGO",
      "EVENT LOGO",
      "ЛОГОТИП СОБЫТИЯ"
    ],
    "street.hero.title": [
      "Tänavatants, energia ja noorte omaalgatus",
      "Street dance, energy and youth-led initiative",
      "Уличные танцы, энергия и молодёжная инициатива"
    ],
    "street.hero.description": [
      "17. augustil 2025 toimus Kohtla-Järve Koolinoorte Loomemajas esmakordselt noorte korraldatud tänavatantsufestival Street Dance Jam 2025.",
      "On 17 August 2025, the youth-organised street dance festival Street Dance Jam 2025 took place for the first time at Kohtla-Järve Koolinoorte Loomemaja.",
      "17 августа 2025 года в Kohtla-Järve Koolinoorte Loomemaja впервые прошёл организованный молодёжью фестиваль уличных танцев Street Dance Jam 2025."
    ],
    "street.hero.read": ["Loe sündmusest", "About the event", "О событии"],
    "street.hero.gallery": ["Vaata galeriid", "View gallery", "Смотреть галерею"],
    "street.hero.openPoster": [
      "Ava Street Dance Jam 2025 plakat suurelt",
      "Open the Street Dance Jam 2025 poster in a larger view",
      "Открыть плакат Street Dance Jam 2025 в увеличенном виде"
    ],
    "street.hero.posterKicker": [
      "ÜRITUSE PLAKAT",
      "EVENT POSTER",
      "ПЛАКАТ СОБЫТИЯ"
    ],
    "street.hero.posterCaption": [
      "Street Dance Jam 2025 ürituse plakat",
      "Street Dance Jam 2025 event poster",
      "Плакат события Street Dance Jam 2025"
    ],
    "street.hero.first": [
      "Esimene Street Dance Jam",
      "The first Street Dance Jam",
      "Первый Street Dance Jam"
    ],
    "street.info.date": ["Kuupäev", "Date", "Дата"],
    "street.info.dateValue": [
      "17. august 2025",
      "17 August 2025",
      "17 августа 2025 года"
    ],
    "street.info.location": ["Asukoht", "Location", "Место"],
    "street.info.program": ["Programm", "Programme", "Программа"],
    "street.info.battles": ["Tantsulahingud", "Dance battles", "Танцевальные баттлы"],
    "street.info.organisers": ["Korraldajad", "Organisers", "Организаторы"],
    "street.info.organisersValue": [
      "Noored koostöös partneritega",
      "Young people working with partners",
      "Молодёжь вместе с партнёрами"
    ],
    "street.about.label": ["Sündmusest", "About the event", "О событии"],
    "street.about.title": [
      "Noorte ideest sündis tõeline tänavatantsufestival",
      "A young idea became a real street dance festival",
      "Молодёжная идея стала настоящим фестивалем уличных танцев"
    ],
    "street.about.text1": [
      "17. augustil 2025 toimus Kohtla-Järve Koolinoorte Loomemajas esmakordselt noortelt noortele korraldatud tänavatantsufestival <strong>Street Dance Jam 2025</strong>. Sündmus valmis MTÜ Noortealgatuste Tugi ja Kohtla-Järve Noortevolikogu aktiivsete noorte ühise algatusena.",
      "On 17 August 2025, the street dance festival <strong>Street Dance Jam 2025</strong>—organised by young people for young people—was held for the first time at Kohtla-Järve Koolinoorte Loomemaja. The event grew from a joint initiative by MTÜ Noortealgatuste Tugi and active young people from Kohtla-Järve Noortevolikogu.",
      "17 августа 2025 года в Kohtla-Järve Koolinoorte Loomemaja впервые прошёл фестиваль уличных танцев <strong>Street Dance Jam 2025</strong>, организованный молодёжью для молодёжи. Событие стало совместной инициативой MTÜ Noortealgatuste Tugi и активных молодых людей из Kohtla-Järve Noortevolikogu."
    ],
    "street.about.text2": [
      "Ürituse eesmärk oli tuua kokku tänavatantsu ja hiphop-kultuuri huvilised noored, pakkudes neile võimalust õppida, ennast proovile panna ning veeta aktiivselt aega loovas ja toetavas keskkonnas.",
      "The event brought together young people interested in street dance and hip-hop culture, giving them an opportunity to learn, challenge themselves and spend active time in a creative, supportive environment.",
      "Целью события было объединить молодых людей, увлечённых уличными танцами и хип-хоп-культурой, дать им возможность учиться, пробовать свои силы и активно проводить время в творческой и поддерживающей среде."
    ],
    "street.about.text3": [
      "Kogu sündmus oli noorte endi planeeritud ja ellu viidud – alates idee väljatöötamisest kuni programmi koostamise, partneritega suhtlemise ja sündmuse korraldamiseni.",
      "Young people planned and delivered the entire event themselves—from developing the idea to creating the programme, working with partners and managing the event.",
      "Молодёжь самостоятельно спланировала и провела всё событие — от разработки идеи и программы до общения с партнёрами и организации мероприятия."
    ],
    "street.about.quote": [
      "Noorte ideed võivad kasvada suurteks, kvaliteetseteks ja inspireerivateks projektideks.",
      "Young people’s ideas can grow into ambitious, high-quality and inspiring projects.",
      "Идеи молодёжи могут вырасти в масштабные, качественные и вдохновляющие проекты."
    ],
    "street.program.label": ["Päeva programm", "Day programme", "Программа дня"],
    "street.program.title": [
      "Üks päev täis liikumist, muusikat ja emotsioone",
      "A day full of movement, music and emotion",
      "День, полный движения, музыки и эмоций"
    ],
    "street.program.description": [
      "Festival ühendas praktilised töötoad, tänavatantsulahingud, muusika ja noorte omavahelise suhtlemise.",
      "The festival combined practical workshops, street dance battles, music and connections between young people.",
      "Фестиваль объединил практические мастер-классы, баттлы по уличным танцам, музыку и общение молодёжи."
    ],
    "street.program.breakingTitle": ["Breaking’u töötoad", "Breaking workshops", "Мастер-классы по брейкингу"],
    "street.program.breakingText": [
      "Algajad ja kogenumad osalejad õppisid uusi liikumisi ning tutvusid breaking’u põhielementidega.",
      "Beginners and more experienced participants learned new moves and explored the fundamentals of breaking.",
      "Начинающие и более опытные участники освоили новые движения и познакомились с основами брейкинга."
    ],
    "street.program.hiphopTitle": ["Hip-hopi töötoad", "Hip-hop workshops", "Мастер-классы по хип-хопу"],
    "street.program.hiphopText": [
      "Osalejad said arendada oma tehnikat, rütmitunnetust, eneseväljendust ja lavalist julgust.",
      "Participants developed their technique, sense of rhythm, self-expression and confidence on stage.",
      "Участники развивали технику, чувство ритма, самовыражение и уверенность на сцене."
    ],
    "street.program.battlesText": [
      "Noored võistlesid neljas kategoorias, näidates üles loovust, julgust ja sportlikku vaimu.",
      "Young people competed in four categories, showing creativity, courage and sporting spirit.",
      "Молодые люди соревновались в четырёх категориях, проявляя творчество, смелость и спортивный дух."
    ],
    "street.program.djTitle": ["DJ ja MC", "DJ and MC", "DJ и MC"],
    "street.program.djText": [
      "Kogu päeva jooksul hoidsid meeleolu üleval DJ ja MC, kes lõid tõelise tänavafestivali atmosfääri.",
      "Throughout the day, the DJ and MC kept the energy high and created an authentic street-festival atmosphere.",
      "Весь день настроение поддерживали DJ и MC, создавая атмосферу настоящего уличного фестиваля."
    ],
    "street.battles.label": ["Dance battles", "Dance battles", "Dance battles"],
    "street.battles.title": ["Neli võistluskategooriat", "Four competition categories", "Четыре конкурсные категории"],
    "street.battles.description": [
      "Tantsulahingutes said osaleda nii algajad kui ka juba kogenumad noored tantsijad.",
      "Both beginners and more experienced young dancers could take part in the dance battles.",
      "В танцевальных баттлах могли участвовать как начинающие, так и более опытные молодые танцоры."
    ],
    "street.battles.breakingBeginners": [
      "Breaking’u kategooria alustavatele tantsijatele.",
      "A breaking category for beginner dancers.",
      "Категория брейкинга для начинающих танцоров."
    ],
    "street.battles.breakingJuniors": [
      "Breaking’u kategooria noortele edasijõudnutele.",
      "A breaking category for advanced young dancers.",
      "Категория брейкинга для опытных молодых танцоров."
    ],
    "street.battles.hiphopBeginners": [
      "Hip-hopi kategooria alustavatele tantsuhuvilistele.",
      "A hip-hop category for beginner dance enthusiasts.",
      "Категория хип-хопа для начинающих любителей танца."
    ],
    "street.battles.hiphopJuniors": [
      "Hip-hopi kategooria kogenumatele noortele tantsijatele.",
      "A hip-hop category for more experienced young dancers.",
      "Категория хип-хопа для более опытных молодых танцоров."
    ],
    "street.impact.label": ["Noorte omaalgatus", "Youth-led initiative", "Молодёжная инициатива"],
    "street.impact.title": [
      "Sündmus, mis andis noortele võimaluse ise juhtida ja korraldada",
      "An event that let young people lead and organise",
      "Событие, которое дало молодёжи возможность руководить и организовывать"
    ],
    "street.impact.text1": [
      "Street Dance Jam 2025 oli märgilise tähtsusega sündmus, sest tegemist oli ühe esimese suurema noortealgatusega, mis viidi ellu MTÜ Noortealgatuste Tugi toetusel.",
      "Street Dance Jam 2025 was a milestone: one of the first major youth initiatives delivered with support from MTÜ Noortealgatuste Tugi.",
      "Street Dance Jam 2025 стал знаковым событием — одной из первых крупных молодёжных инициатив, реализованных при поддержке MTÜ Noortealgatuste Tugi."
    ],
    "street.impact.text2": [
      "Organisatsioon aitas noortel oma idee reaalsuseks muuta ning pakkus vajalikku nõustamist ja tuge kogu ettevalmistusprotsessi jooksul.",
      "The organisation helped young people turn their idea into reality and provided guidance and support throughout the preparation process.",
      "Организация помогла молодёжи воплотить идею и предоставляла необходимые консультации и поддержку на всём этапе подготовки."
    ],
    "street.impact.location": [
      "Street Dance Jam Kohtla-Järvel",
      "Street Dance Jam in Kohtla-Järve",
      "Street Dance Jam в Кохтла-Ярве"
    ],
    "street.impact.categories": [
      "tantsulahingu kategooriat",
      "dance-battle categories",
      "категории танцевальных баттлов"
    ],
    "street.impact.youthLed": [
      "noorte enda algatus ja korraldus",
      "initiated and organised by young people",
      "инициатива и организация молодёжи"
    ],
    "street.gallery.label": ["Galerii", "Gallery", "Галерея"],
    "street.gallery.title": [
      "Hetked Street Dance Jamilt",
      "Moments from Street Dance Jam",
      "Моменты Street Dance Jam"
    ],
    "street.gallery.description": [
      "Lisa siia fotod töötubadest, tantsulahingutest, osalejatest, publikust ja autasustamisest.",
      "Add photos of workshops, dance battles, participants, the audience and awards here.",
      "Добавьте сюда фотографии мастер-классов, танцевальных баттлов, участников, зрителей и награждения."
    ],
    "street.gallery.battleAlt": [
      "Street Dance Jam 2025 tantsulahing",
      "Street Dance Jam 2025 dance battle",
      "Танцевальный баттл Street Dance Jam 2025"
    ],
    "street.gallery.breakingAlt": [
      "Street Dance Jam 2025 breaking'u töötuba",
      "Street Dance Jam 2025 breaking workshop",
      "Мастер-класс по брейкингу на Street Dance Jam 2025"
    ],
    "street.gallery.hiphopAlt": [
      "Street Dance Jam 2025 hip-hopi töötuba",
      "Street Dance Jam 2025 hip-hop workshop",
      "Мастер-класс по хип-хопу на Street Dance Jam 2025"
    ],
    "street.gallery.participantsAlt": [
      "Street Dance Jam 2025 osalejad",
      "Street Dance Jam 2025 participants",
      "Участники Street Dance Jam 2025"
    ],
    "street.gallery.audienceAlt": [
      "Street Dance Jam 2025 publik",
      "Street Dance Jam 2025 audience",
      "Зрители Street Dance Jam 2025"
    ],
    "street.gallery.teamAlt": [
      "Street Dance Jam 2025 korraldajad ja võitjad",
      "Street Dance Jam 2025 organisers and winners",
      "Организаторы и победители Street Dance Jam 2025"
    ],
    "street.gallery.professionals": ["Professionalid", "Professionals", "Профессионалы"],
    "street.gallery.fun": ["Naljakad noored", "Young people having fun", "Весёлая молодёжь"],
    "street.gallery.hiphop": ["Hip-hopi töötuba", "Hip-hop workshop", "Мастер-класс по хип-хопу"],
    "street.gallery.posters": ["Posterid", "Posters", "Плакаты"],
    "street.gallery.participants": ["Osalejad", "Participants", "Участники"],
    "street.gallery.moreParticipants": ["Veel osalejad", "More participants", "Другие участники"],
    "street.thanks.label": ["Suur tänu", "Thank you", "Большое спасибо"],
    "street.thanks.title": [
      "Täname kõiki, kes aitasid sündmuse ellu viia",
      "Thank you to everyone who helped make the event happen",
      "Благодарим всех, кто помог провести событие"
    ],
    "street.thanks.description": [
      "Täname südamest kõiki osalejaid, vabatahtlikke, koostööpartnereid ja toetajaid. Tänu ühisele tööle oli võimalik kutsuda DJ, korraldada auhinnad võitjatele ning luua noortele meeldejääv ja kvaliteetne sündmus.",
      "Our heartfelt thanks to every participant, volunteer, partner and supporter. Working together made it possible to invite a DJ, provide prizes for the winners and create a memorable, high-quality event for young people.",
      "От всей души благодарим участников, волонтёров, партнёров и тех, кто нас поддержал. Благодаря общей работе удалось пригласить DJ, подготовить призы для победителей и создать для молодёжи яркое и качественное событие."
    ],
    "street.cta.title": [
      "Kohtla-Järvel on aktiivsed, loovad ja ettevõtlikud noored.",
      "Kohtla-Järve has active, creative and enterprising young people.",
      "В Кохтла-Ярве живёт активная, творческая и инициативная молодёжь."
    ],
    "street.cta.description": [
      "Street Dance Jam oli alles algus ning andis tugeva aluse uute noortealgatuste ja tänavatantsu traditsioonide kujunemisele linnas.",
      "Street Dance Jam was only the beginning and laid a strong foundation for new youth initiatives and street-dance traditions in the city.",
      "Street Dance Jam стал лишь началом и заложил прочную основу для новых молодёжных инициатив и традиций уличного танца в городе."
    ],
    "street.lightbox.close": [
      "Sulge suur foto",
      "Close enlarged photo",
      "Закрыть увеличенную фотографию"
    ],
    "street.lightbox.gallery": ["GALERII", "GALLERY", "ГАЛЕРЕЯ"],
    "street.lightbox.identity": [
      "Sündmuse visuaalne identiteet",
      "Event visual identity",
      "Визуальный стиль события"
    ],

    /* ========================= Privacy policy ========================= */
    "privacy.meta.title": [
      "Privaatsuspoliitika | MTÜ Noortealgatuste Tugi",
      "Privacy Policy | MTÜ Noortealgatuste Tugi",
      "Политика конфиденциальности | MTÜ Noortealgatuste Tugi"
    ],
    "privacy.meta.description": [
      "MTÜ Noortealgatuste Tugi privaatsuspoliitika kirjeldab isikuandmete töötlemist, säilitamist ja sinu õigusi.",
      "The MTÜ Noortealgatuste Tugi Privacy Policy explains how personal data is processed and retained, and describes your rights.",
      "Политика конфиденциальности MTÜ Noortealgatuste Tugi объясняет, как обрабатываются и хранятся персональные данные, а также описывает ваши права."
    ],
    "privacy.meta.ogDescription": [
      "Tutvu MTÜ Noortealgatuste Tugi isikuandmete töötlemise põhimõtetega.",
      "Read the MTÜ Noortealgatuste Tugi principles for processing personal data.",
      "Ознакомьтесь с принципами обработки персональных данных MTÜ Noortealgatuste Tugi."
    ],
    "privacy.decor.heroWords": [
      "SELGE • VAJALIK • TURVALINE",
      "CLEAR • NECESSARY • SECURE",
      "ПОНЯТНО • НЕОБХОДИМО • БЕЗОПАСНО"
    ],
    "privacy.hero.badge": [
      "PRIVAATSUS JA ANDMEKAITSE",
      "PRIVACY AND DATA PROTECTION",
      "КОНФИДЕНЦИАЛЬНОСТЬ И ЗАЩИТА ДАННЫХ"
    ],
    "privacy.hero.title": ["Privaatsuspoliitika", "Privacy Policy", "Политика конфиденциальности"],
    "privacy.hero.description": [
      "Selgitame lihtsalt ja arusaadavalt, milliseid andmeid MTÜ Noortealgatuste Tugi võib veebilehe, kontaktivormide, registreerimiste ja infokirja kaudu töödelda.",
      "We explain in clear language what data MTÜ Noortealgatuste Tugi may process through the website, contact forms, registrations and newsletter.",
      "Мы простыми словами объясняем, какие данные MTÜ Noortealgatuste Tugi может обрабатывать через сайт, контактные формы, регистрации и рассылку."
    ],
    "privacy.hero.controller": ["Andmetöötleja", "Data controller", "Оператор данных"],
    "privacy.hero.updated": ["Viimati uuendatud", "Last updated", "Последнее обновление"],
    "privacy.hero.contact": ["Kontakt", "Contact", "Контакты"],
    "privacy.hero.principlesLabel": [
      "Meie andmekaitse põhimõtted",
      "Our data-protection principles",
      "Наши принципы защиты данных"
    ],
    "privacy.hero.clarity": ["Selgus", "Clarity", "Прозрачность"],
    "privacy.hero.minimum": ["Vajalik miinimum", "Necessary minimum", "Необходимый минимум"],
    "privacy.hero.security": ["Turvalisus", "Security", "Безопасность"],
    "privacy.hero.rights": ["Teie õigused", "Your rights", "Ваши права"],
    "privacy.intro.label": ["Meie põhimõte", "Our principle", "Наш принцип"],
    "privacy.intro.title": [
      "Kogume ainult seda, mida on päriselt vaja",
      "We collect only what is genuinely necessary",
      "Мы собираем только действительно необходимые данные"
    ],
    "privacy.intro.description": [
      "Kasutame isikuandmeid ainult selleks, et vastata pöördumistele, korraldada sündmusi, hallata registreerimisi ja saata infot meie tegevuste kohta juhul, kui inimene on selleks nõusoleku andnud.",
      "We use personal data only to respond to enquiries, organise events, manage registrations and send information about our activities when the person has consented.",
      "Мы используем персональные данные только для ответов на обращения, организации мероприятий, управления регистрациями и отправки информации о нашей деятельности, если человек дал на это согласие."
    ],
    "privacy.overview.title": ["Kiire ülevaade", "At a glance", "Кратко"],
    "privacy.overview.item1": [
      "Me ei müü isikuandmeid.",
      "We do not sell personal data.",
      "Мы не продаём персональные данные."
    ],
    "privacy.overview.item2": [
      "Infokirjast saab igal ajal loobuda.",
      "You can unsubscribe from the newsletter at any time.",
      "От рассылки можно отказаться в любое время."
    ],
    "privacy.overview.item3": [
      "Andmeid kasutatakse ainult selgel eesmärgil.",
      "Data is used only for a clearly defined purpose.",
      "Данные используются только для ясно обозначенной цели."
    ],
    "privacy.overview.item4": [
      "Küsimuste korral saab kirjutada meile e-posti teel.",
      "You can email us with any questions.",
      "По вопросам можно написать нам по электронной почте."
    ],
    "privacy.cards.collectedTitle": [
      "Milliseid andmeid võime koguda?",
      "What data may we collect?",
      "Какие данные мы можем собирать?"
    ],
    "privacy.cards.collectedText": [
      "Kui võtate meiega ühendust, liitute infokirjaga või registreerute sündmusele, võime töödelda teie nime, e-posti aadressi, telefoninumbrit, organisatsiooni või kooli nime, sõnumi sisu ja muud infot, mille te ise meile edastate.",
      "When you contact us, subscribe to the newsletter or register for an event, we may process your name, email address, phone number, organisation or school, message content and any other information you provide.",
      "Когда вы связываетесь с нами, подписываетесь на рассылку или регистрируетесь на событие, мы можем обрабатывать ваше имя, адрес электронной почты, номер телефона, название организации или школы, содержание сообщения и другую информацию, которую вы сами предоставляете."
    ],
    "privacy.cards.purposeTitle": [
      "Milleks me andmeid kasutame?",
      "How do we use data?",
      "Для чего мы используем данные?"
    ],
    "privacy.cards.purposeText": [
      "Kasutame andmeid selleks, et vastata kirjadele, kinnitada registreerimisi, korraldada sündmusi, saata vajalikke teateid, hallata koostööd ning jagada infot noorteprojektide, koolituste ja võimaluste kohta.",
      "We use data to answer messages, confirm registrations, organise events, send necessary notices, manage partnerships and share information about youth projects, training and opportunities.",
      "Мы используем данные, чтобы отвечать на письма, подтверждать регистрации, организовывать мероприятия, отправлять необходимые уведомления, координировать сотрудничество и делиться информацией о молодёжных проектах, обучении и возможностях."
    ],
    "privacy.cards.newsletterTitle": ["Infokiri", "Newsletter", "Рассылка"],
    "privacy.cards.newsletterHtml": [
      "Infokirjaga liitumine on vabatahtlik. Saadame infokirju ainult inimestele, kes on selleks nõusoleku andnud. Infokirjast saab loobuda kirjas oleva loobumislingi kaudu või kirjutades aadressile <a href=\"mailto:juhatus@noortetugi.ee\">juhatus@noortetugi.ee</a>.",
      "Subscribing to the newsletter is voluntary. We send newsletters only to people who have given their consent. You can unsubscribe through the link in any newsletter or by emailing <a href=\"mailto:juhatus@noortetugi.ee\">juhatus@noortetugi.ee</a>.",
      "Подписка на рассылку добровольна. Мы отправляем письма только людям, которые дали на это согласие. Отписаться можно по ссылке в письме или написав на адрес <a href=\"mailto:juhatus@noortetugi.ee\">juhatus@noortetugi.ee</a>."
    ],
    "privacy.cards.legalTitle": ["Õiguslik alus", "Legal basis", "Правовое основание"],
    "privacy.cards.legalText": [
      "Infokirja puhul töötleme andmeid nõusoleku alusel. Kontaktpäringute, registreerimiste ja sündmuste korraldamise puhul töötleme andmeid selleks, et täita inimese enda algatatud pöördumist või korraldada meie tegevust õigustatud huvi alusel.",
      "For the newsletter, we process data on the basis of consent. For contact enquiries, registrations and event organisation, we process data to respond to a person’s request or to manage our activities on the basis of legitimate interest.",
      "Данные для рассылки мы обрабатываем на основании согласия. При контактных запросах, регистрациях и организации мероприятий данные обрабатываются для выполнения обращения самого человека или организации нашей деятельности на основании законного интереса."
    ],
    "privacy.cards.retentionTitle": [
      "Kui kaua andmeid säilitame?",
      "How long do we retain data?",
      "Как долго мы храним данные?"
    ],
    "privacy.cards.retentionText": [
      "Säilitame isikuandmeid kuni kolm aastat alates nende kogumisest või kuni konkreetse eesmärgi täitmiseni, sõltuvalt sellest, kumb saabub varem. Seadusest tuleneva kohustuse korral võime andmeid säilitada pikema aja jooksul.",
      "We retain personal data for up to three years from collection or until the relevant purpose has been fulfilled, whichever comes first. We may retain data longer where required by law.",
      "Мы храним персональные данные до трёх лет с момента сбора или до достижения конкретной цели — в зависимости от того, что наступит раньше. Если этого требует закон, данные могут храниться дольше."
    ],
    "privacy.cards.providersTitle": ["Teenusepakkujad", "Service providers", "Поставщики услуг"],
    "privacy.cards.providersText": [
      "Mõned andmed võivad liikuda läbi tehniliste teenusepakkujate, näiteks veebimajutuse, e-posti, vormide või infokirja tööriistade kaudu. Kasutame neid teenuseid ainult veebilehe ja organisatsiooni töö korraldamiseks.",
      "Some data may pass through technical service providers, such as web hosting, email, forms or newsletter tools. We use these services only to operate the website and the organisation.",
      "Некоторые данные могут проходить через технических поставщиков услуг — например, хостинг, электронную почту, формы или инструменты рассылки. Мы используем эти сервисы только для работы сайта и организации."
    ],
    "privacy.cards.cookiesTitle": ["Küpsised", "Cookies", "Файлы cookie"],
    "privacy.cards.cookiesText": [
      "Veebileht võib kasutada tehniliselt vajalikke küpsiseid, mis aitavad lehel korrektselt toimida. Kui tulevikus lisame analüütika- või turundusküpsised, teavitame sellest kasutajat eraldi ning küsime vajaduse korral nõusolekut.",
      "The website may use technically necessary cookies that help it function correctly. If analytics or marketing cookies are added in the future, we will inform users separately and request consent where required.",
      "Сайт может использовать технически необходимые файлы cookie для корректной работы. Если в будущем будут добавлены аналитические или маркетинговые cookie, мы отдельно сообщим об этом и при необходимости запросим согласие."
    ],
    "privacy.cards.rightsTitle": ["Teie õigused", "Your rights", "Ваши права"],
    "privacy.cards.rightsText": [
      "Teil on õigus küsida, milliseid andmeid me teie kohta töötleme, paluda andmete parandamist, kustutamist või töötlemise piiramist ning võtta tagasi antud nõusolek. Samuti on teil õigus pöörduda Andmekaitse Inspektsiooni poole.",
      "You have the right to ask what data we process about you, request correction, deletion or restriction of processing, and withdraw consent. You also have the right to contact the Estonian Data Protection Inspectorate.",
      "Вы имеете право узнать, какие данные мы о вас обрабатываем, потребовать их исправления, удаления или ограничения обработки, а также отозвать согласие. Вы также вправе обратиться в Инспекцию по защите данных Эстонии."
    ],
    "privacy.contact.label": [
      "Küsimused andmete kohta?",
      "Questions about your data?",
      "Есть вопросы о данных?"
    ],
    "privacy.contact.title": [
      "Võtke meiega ühendust",
      "Contact us",
      "Свяжитесь с нами"
    ],
    "privacy.contact.description": [
      "Kui teil on küsimusi privaatsuspoliitika või isikuandmete töötlemise kohta, kirjutage meile. Vastame esimesel võimalusel.",
      "If you have questions about this Privacy Policy or the processing of personal data, write to us. We will respond as soon as possible.",
      "Если у вас есть вопросы о политике конфиденциальности или обработке персональных данных, напишите нам. Мы ответим при первой возможности."
    ],
    "privacy.contact.write": ["Kirjuta meile", "Write to us", "Написать нам"],

    /* ========================= Documents ========================= */
    "documents.meta.title": [
      "Dokumendid | MTÜ Noortealgatuste Tugi",
      "Documents | MTÜ Noortealgatuste Tugi",
      "Документы | MTÜ Noortealgatuste Tugi"
    ],
    "documents.meta.description": [
      "MTÜ Noortealgatuste Tugi avalikud dokumendid, sealhulgas organisatsiooni kehtiv põhikiri.",
      "Public documents of MTÜ Noortealgatuste Tugi, including the organisation’s current articles of association.",
      "Публичные документы MTÜ Noortealgatuste Tugi, включая действующий устав организации."
    ],
    "documents.meta.ogDescription": [
      "Tutvu MTÜ Noortealgatuste Tugi avalike dokumentidega.",
      "View the public documents of MTÜ Noortealgatuste Tugi.",
      "Ознакомьтесь с публичными документами MTÜ Noortealgatuste Tugi."
    ],
    "documents.decor.heroWords": [
      "AVALIK • AJAKOHANE • USALDUSVÄÄRNE",
      "PUBLIC • CURRENT • RELIABLE",
      "ОТКРЫТО • АКТУАЛЬНО • НАДЁЖНО"
    ],
    "documents.hero.badge": [
      "AVALIKUD DOKUMENDID",
      "PUBLIC DOCUMENTS",
      "ПУБЛИЧНЫЕ ДОКУМЕНТЫ"
    ],
    "documents.hero.title": ["Dokumendid", "Documents", "Документы"],
    "documents.hero.description": [
      "Siit leiad MTÜ Noortealgatuste Tugi avalikud alusdokumendid. Kõik failid on koondatud ühte selgesse ja mugavalt allalaaditavasse nimekirja.",
      "Here you will find the public governing documents of MTÜ Noortealgatuste Tugi. All files are collected in one clear, convenient download list.",
      "Здесь собраны публичные учредительные документы MTÜ Noortealgatuste Tugi. Все файлы представлены в одном понятном и удобном для скачивания списке."
    ],
    "documents.hero.organisation": ["Organisatsioon", "Organisation", "Организация"],
    "documents.hero.registryCode": ["Registrikood", "Registry code", "Регистрационный код"],
    "documents.hero.officialSource": ["Ametlik allikas", "Official source", "Официальный источник"],
    "documents.hero.register": ["Eesti e-Äriregister", "Estonian e-Business Register", "Эстонский электронный коммерческий регистр"],
    "documents.hero.principlesLabel": [
      "Dokumentide avaldamise põhimõtted",
      "Document publication principles",
      "Принципы публикации документов"
    ],
    "documents.hero.public": ["Avalik", "Public", "Открыто"],
    "documents.hero.clear": ["Selge", "Clear", "Понятно"],
    "documents.hero.current": ["Ajakohane", "Current", "Актуально"],
    "documents.hero.downloadable": ["Allalaaditav", "Downloadable", "Доступно для скачивания"],
    "documents.intro.label": ["Dokumendikogu", "Document library", "Библиотека документов"],
    "documents.intro.title": [
      "Oluline info ühes kohas",
      "Important information in one place",
      "Важная информация в одном месте"
    ],
    "documents.intro.description": [
      "Avaldame organisatsiooni dokumendid PDF-vormingus, et neid oleks lihtne avada, salvestada ja jagada. Iga dokumendi juures on näidatud selle liik, kehtivus ja ametlik allikas.",
      "We publish the organisation’s documents as PDFs so they are easy to open, save and share. Each document shows its type, validity and official source.",
      "Мы публикуем документы организации в формате PDF, чтобы их было удобно открывать, сохранять и передавать. Для каждого документа указаны тип, срок действия и официальный источник."
    ],
    "documents.overview.title": ["Kiire ülevaade", "At a glance", "Кратко"],
    "documents.overview.item1": [
      "Failid avanevad otse brauseris.",
      "Files open directly in the browser.",
      "Файлы открываются прямо в браузере."
    ],
    "documents.overview.item2": [
      "PDF-faile saab ühe klõpsuga alla laadida.",
      "PDF files can be downloaded with one click.",
      "PDF-файлы можно скачать одним нажатием."
    ],
    "documents.overview.item3": [
      "Kehtivus ja päritolu on selgelt märgitud.",
      "Validity and source are clearly identified.",
      "Срок действия и источник указаны ясно."
    ],
    "documents.overview.item4": [
      "Nimekiri täieneb uute dokumentidega.",
      "New documents will be added to the list.",
      "Список будет пополняться новыми документами."
    ],
    "documents.library.label": ["Alusdokumendid", "Governing documents", "Учредительные документы"],
    "documents.library.title": [
      "Organisatsiooni alusdokumendid",
      "The organisation’s governing documents",
      "Учредительные документы организации"
    ],
    "documents.library.description": [
      "Ametlikud dokumendid on esitatud lühikese kirjelduse, kehtivusinfo ning eraldi vaatamis- ja allalaadimislingiga.",
      "Official documents include a short description, validity information, and separate links to view and download the file.",
      "Для официальных документов приведены краткое описание, сведения о сроке действия и отдельные ссылки для просмотра и скачивания."
    ],
    "documents.item.type": ["Põhikiri · PDF", "Articles of association · PDF", "Устав · PDF"],
    "documents.item.title": ["Põhikiri", "Articles of association", "Устав"],
    "documents.item.description": [
      "MTÜ Noortealgatuste Tugi kehtiv põhikiri Eesti e-Äriregistrist.",
      "The current articles of association of MTÜ Noortealgatuste Tugi from the Estonian e-Business Register.",
      "Действующий устав MTÜ Noortealgatuste Tugi из Эстонского электронного коммерческого регистра."
    ],
    "documents.item.detailsLabel": ["Dokumendi andmed", "Document details", "Сведения о документе"],
    "documents.item.validFrom": [
      "Kehtiv alates 20.05.2026",
      "Effective from 20 May 2026",
      "Действует с 20.05.2026"
    ],
    "documents.item.official": [
      "Ametlik registridokument",
      "Official registry document",
      "Официальный документ регистра"
    ],
    "documents.item.viewLabel": [
      "Vaata MTÜ Noortealgatuste Tugi põhikirja PDF-faili",
      "View the MTÜ Noortealgatuste Tugi articles of association PDF",
      "Открыть устав MTÜ Noortealgatuste Tugi в формате PDF"
    ],
    "documents.item.view": ["Vaata PDF-i", "View PDF", "Открыть PDF"],
    "documents.item.downloadLabel": [
      "Laadi alla MTÜ Noortealgatuste Tugi põhikirja PDF-fail",
      "Download the MTÜ Noortealgatuste Tugi articles of association PDF",
      "Скачать устав MTÜ Noortealgatuste Tugi в формате PDF"
    ],
    "documents.item.download": ["Laadi alla", "Download", "Скачать"],
    "documents.source.html": [
      "Põhikiri on alla laaditud <a href=\"https://ariregister.rik.ee/eng/company/80652930\" target=\"_blank\" rel=\"noopener noreferrer\">MTÜ Noortealgatuste Tugi ametlikult e-Äriregistri lehelt</a>. Registri järgi on selle versiooni kehtivuse algus 20.05.2026.",
      "The articles of association were downloaded from the <a href=\"https://ariregister.rik.ee/eng/company/80652930\" target=\"_blank\" rel=\"noopener noreferrer\">official e-Business Register page of MTÜ Noortealgatuste Tugi</a>. According to the register, this version took effect on 20 May 2026.",
      "Устав загружен с <a href=\"https://ariregister.rik.ee/eng/company/80652930\" target=\"_blank\" rel=\"noopener noreferrer\">официальной страницы MTÜ Noortealgatuste Tugi в электронном коммерческом регистре</a>. Согласно регистру, эта версия действует с 20.05.2026."
    ],
    "documents.contact.label": [
      "Ei leia vajalikku dokumenti?",
      "Cannot find the document you need?",
      "Не нашли нужный документ?"
    ],
    "documents.contact.title": ["Kirjuta meile", "Write to us", "Напишите нам"],
    "documents.contact.description": [
      "Kui vajad täiendavat dokumenti või soovid avaldatud faili kohta täpsustust, võta meie juhatusega ühendust.",
      "If you need an additional document or clarification about a published file, contact our board.",
      "Если вам нужен дополнительный документ или уточнение о опубликованном файле, свяжитесь с нашим правлением."
    ],

    /* ========================= Network ========================= */
    "network.meta.title": [
      "Võrgustik | MTÜ Noortealgatuste Tugi",
      "Network | MTÜ Noortealgatuste Tugi",
      "Сеть | MTÜ Noortealgatuste Tugi"
    ],
    "network.meta.description": [
      "Tutvu Ida-Virumaa noorteühenduste võrgustikku kuuluvate organisatsioonidega ning leia uusi koostöövõimalusi.",
      "Meet the organisations in the Ida-Viru County youth network and discover new opportunities for collaboration.",
      "Познакомьтесь с организациями молодёжной сети Ида-Вирумаа и найдите новые возможности для сотрудничества."
    ],
    "network.meta.ogDescription": [
      "Tutvu Ida-Virumaa noorteühendustega ja leia uusi koostöövõimalusi.",
      "Meet youth organisations in Ida-Viru County and find new opportunities for collaboration.",
      "Познакомьтесь с молодёжными организациями Ида-Вирумаа и найдите новые возможности для сотрудничества."
    ],
    "network.hero.kickerPrefix": [
      "Ida-Virumaa noored",
      "Young people in Ida-Viru County",
      "Молодёжь Ида-Вирумаа"
    ],
    "network.hero.kickerAccent": [
      "üks tugev võrgustik",
      "one strong network",
      "единая сильная сеть"
    ],
    "network.hero.titlePrefix": [
      "Koos sünnivad",
      "Together we create",
      "Вместе рождаются"
    ],
    "network.hero.titleAccent": [
      "suuremad ideed",
      "bigger ideas",
      "большие идеи"
    ],
    "network.hero.description": [
      "MTÜ Noortealgatuste Tugi võrgustik ühendab Ida-Virumaa organisatsioone, kes loovad noortele võimalusi, arendavad kogukonda ja viivad ellu tähenduslikke algatusi.",
      "The MTÜ Noortealgatuste Tugi network connects organisations in Ida-Viru County that create opportunities for young people, develop communities and deliver meaningful initiatives.",
      "Сеть MTÜ Noortealgatuste Tugi объединяет организации Ида-Вирумаа, которые создают возможности для молодёжи, развивают сообщества и реализуют значимые инициативы."
    ],
    "network.hero.explore": [
      "Tutvu võrgustikuga",
      "Explore the network",
      "Познакомиться с сетью"
    ],
    "network.hero.join": ["Soovin liituda", "I want to join", "Хочу присоединиться"],
    "network.hero.tagline": [
      "Koostöö, kogemuste jagamine ja ühine mõju Ida-Virumaal",
      "Collaboration, shared experience and collective impact in Ida-Viru County",
      "Сотрудничество, обмен опытом и общее влияние в Ида-Вирумаа"
    ],
    "network.hero.ourNetwork": ["Meie võrgustik", "Our network", "Наша сеть"],
    "network.hero.cooperation": ["Koostöö", "Collaboration", "Сотрудничество"],
    "network.hero.opportunities": ["Uued võimalused", "New opportunities", "Новые возможности"],
    "network.hero.impact": ["Ühine mõju", "Collective impact", "Общий результат"],
    "network.hero.backgroundLabel": ["VÕRGUSTIK", "NETWORK", "СЕТЬ"],
    "network.about.label": ["Meie ühine eesmärk", "Our shared goal", "Наша общая цель"],
    "network.about.title": [
      "Usume, et koostöös peitub jõud.",
      "We believe in the power of collaboration.",
      "Мы верим в силу сотрудничества."
    ],
    "network.about.lead": [
      "Ida-Virumaa noortevaldkond vajab tähelepanu just siin ja praegu – sest just noored kujundavad homset maakonda.",
      "Youth work in Ida-Viru County needs attention here and now, because young people are shaping the county’s future.",
      "Молодёжной сфере Ида-Вирумаа нужно внимание здесь и сейчас, ведь именно молодёжь формирует будущее региона."
    ],
    "network.about.text1": [
      "MTÜ Noortealgatuste Tugi on algatanud ja kokku kutsunud Ida-Virumaa noorteühenduste maakondliku võrgustiku, mille eesmärk on koondada ja vahendada ajakohast infot noorteprojektide, sündmuste, rahastusvõimaluste ning teiste noortele suunatud algatuste kohta.",
      "MTÜ Noortealgatuste Tugi established and convened the county-wide network of youth organisations in Ida-Viru County to collect and share current information about youth projects, events, funding opportunities and other youth-focused initiatives.",
      "MTÜ Noortealgatuste Tugi инициировала и собрала региональную сеть молодёжных объединений Ида-Вирумаа. Её задача — собирать и распространять актуальную информацию о молодёжных проектах, событиях, возможностях финансирования и других инициативах для молодёжи."
    ],
    "network.about.text2": [
      "Lisaks loob võrgustik võimalusi osaleda ühistes aruteludes ja kohtumistel, teha ettepanekuid uute koostööalgatuste käivitamiseks ning jagada üksteise tegevusi ja saavutusi oma infokanalites.",
      "The network also creates opportunities to join shared discussions and meetings, propose new collaborative initiatives, and share one another’s activities and achievements through members’ communication channels.",
      "Сеть также даёт возможность участвовать в общих обсуждениях и встречах, предлагать новые совместные инициативы и рассказывать о деятельности и достижениях друг друга на своих информационных каналах."
    ],
    "network.about.text3": [
      "Võrgustikku kuuluvad nii noortevolikogud kui ka teised noorteorganisatsioonid, kellega on võimalik tutvuda allpool.",
      "The network includes youth councils and other youth organisations, which you can explore below.",
      "В сеть входят молодёжные советы и другие молодёжные организации, с которыми можно познакомиться ниже."
    ],
    "network.about.joinTitle": ["Kuidas liituda?", "How can I join?", "Как присоединиться?"],
    "network.about.joinText": [
      "Kui ka sinu noorteühendus soovib panustada maakondliku koostöö arendamisse ja Ida-Virumaa noortevaldkonna tugevdamisse, siis liitu meie võrgustikuga.",
      "If your youth organisation would like to strengthen county-wide collaboration and youth work in Ida-Viru County, join our network.",
      "Если ваша молодёжная организация хочет развивать региональное сотрудничество и укреплять молодёжную сферу Ида-Вирумаа, присоединяйтесь к нашей сети."
    ],
    "network.marquee.label": [
      "Võrgustiku märksõnad",
      "Network themes",
      "Ключевые темы сети"
    ],
    "network.marquee.cooperation": ["KOOSTÖÖ", "COLLABORATION", "СОТРУДНИЧЕСТВО"],
    "network.marquee.ideas": ["NOORTE IDEED", "YOUNG IDEAS", "ИДЕИ МОЛОДЁЖИ"],
    "network.marquee.impact": ["ÜHINE MÕJU", "COLLECTIVE IMPACT", "ОБЩИЙ РЕЗУЛЬТАТ"],
    "network.marquee.growth": ["ARENG", "GROWTH", "РАЗВИТИЕ"],
    "network.members.label": ["Meie liikmed", "Our members", "Наши участники"],
    "network.members.title": [
      "Organisatsioonid meie võrgustikus",
      "Organisations in our network",
      "Организации в нашей сети"
    ],
    "network.members.description": [
      "Võrgustikus on kokku kuus organisatsiooni ning kõigi liikmete profiilid on nüüd avaldatud.",
      "The network has six member organisations, and every member profile is now available.",
      "В сеть входят шесть организаций, и профили всех участников уже опубликованы."
    ],
    "network.members.visible": [
      "avaldatud profiili nähtaval",
      "published profiles visible",
      "опубликованных профилей показано"
    ],
    "network.members.searchPlaceholder": [
      "Otsi nime, linna või tegevuse järgi...",
      "Search by name, town or activity...",
      "Поиск по названию, городу или деятельности..."
    ],
    "network.members.filterLabel": [
      "Filtreeri organisatsioone",
      "Filter organisations",
      "Фильтр организаций"
    ],
    "network.members.all": ["Kõik", "All", "Все"],
    "network.members.organisations": [
      "Noorteühendused",
      "Youth organisations",
      "Молодёжные организации"
    ],
    "network.members.councils": [
      "Osaluskogud",
      "Youth participation bodies",
      "Органы молодёжного участия"
    ],
    "network.members.council": [
      "Osaluskogu",
      "Youth participation body",
      "Орган молодёжного участия"
    ],
    "network.members.organisation": [
      "Noorteühendus",
      "Youth organisation",
      "Молодёжная организация"
    ],
    "network.members.representation": [
      "Noorte esindamine",
      "Youth representation",
      "Представительство молодёжи"
    ],
    "network.members.participation": [
      "Noorte osalus",
      "Youth participation",
      "Участие молодёжи"
    ],
    "network.members.volunteering": [
      "Vabatahtlik tegevus",
      "Volunteering",
      "Волонтёрство"
    ],
    "network.members.initiatives": [
      "Noorte algatused",
      "Youth initiatives",
      "Молодёжные инициативы"
    ],
    "network.members.projects": [
      "Noorte projektid",
      "Youth projects",
      "Молодёжные проекты"
    ],
    "network.members.location": ["Asukoht", "Location", "Адрес"],
    "network.members.phone": ["Telefon", "Phone", "Телефон"],
    "network.members.email": ["E-post", "Email", "Эл. почта"],
    "network.members.social": ["Sotsiaalmeedia", "Social media", "Социальные сети"],
    "network.members.write": ["Kirjuta", "Write", "Написать"],
    "network.members.website": ["Koduleht", "Website", "Сайт"],
    "network.members.openLogo": [
      "Ava {{name}} logo suurelt",
      "Open the {{name}} logo in full size",
      "Открыть логотип {{name}} в полном размере"
    ],
    "network.members.allLinks": ["Kõik lingid", "All links", "Все ссылки"],
    "network.members.noWebsite": ["Koduleht puudub", "No website", "Сайта нет"],
    "network.members.empty": [
      "Otsingule vastavaid organisatsioone ei leitud.",
      "No organisations match your search.",
      "Организации по вашему запросу не найдены."
    ],
    "network.members.sillamaeDescription": [
      "Esindame noorte huve linnatasandil, aitame korraldada erinevaid üritusi ning suhtleme aktiivselt kohalike noortega.",
      "We represent young people’s interests at city level, help organise a variety of events and actively engage with local young people.",
      "Мы представляем интересы молодёжи на городском уровне, помогаем организовывать разные мероприятия и активно общаемся с местной молодёжью."
    ],
    "network.members.alutaguseDescription": [
      "Noortevolikogu arutab noori puudutavaid valla pädevusse kuuluvaid küsimusi ning teeb vallavolikogule noorte huvidest ja vajadustest lähtuvaid ettepanekuid. Samuti tehakse koostööd teiste omavalitsuste noortevolikogude ja noortekogudega, korraldatakse noortele üritusi ning viiakse ellu omaalgatuslikke projekte.",
      "The youth council discusses municipal matters affecting young people and submits proposals to the municipal council based on young people’s interests and needs. It also works with youth councils in other municipalities, organises events for young people and delivers youth-led projects.",
      "Молодёжный совет обсуждает относящиеся к компетенции волости вопросы, затрагивающие молодёжь, и вносит в волостное собрание предложения, исходя из интересов и потребностей молодых людей. Совет также сотрудничает с молодёжными советами других самоуправлений, организует мероприятия и реализует инициативные проекты."
    ],
    "network.members.kohtlaDescription": [
      "Noortevolikogu kaitseb noorte huve, julgustab kodanikualgatust ja kaasab noori linna otsustusprotsessidesse. Samuti arutatakse noori puudutavaid küsimusi ning tehakse linnavolikogule ettepanekuid lähtudes noorte vajadustest ja huvidest.",
      "The youth council protects young people’s interests, encourages civic initiative and involves young people in city decision-making. It also discusses issues affecting young people and submits proposals to the city council based on their needs and interests.",
      "Молодёжный совет защищает интересы молодёжи, поддерживает гражданские инициативы и вовлекает молодых людей в принятие городских решений. Совет также обсуждает вопросы, касающиеся молодёжи, и вносит предложения городскому собранию, исходя из её потребностей и интересов."
    ],
    "network.members.volunteezyDescription": [
      "Volunteezy on vabatahtlike kogukond, mis ühendab noori ja organisatsioone ning vahendab vabatahtliku töö võimalusi eri valdkondades. Osalemine aitab arendada juhtimis-, projektijuhtimis- ja suhtlemisoskusi, saada kogemusi ning leida uusi tuttavaid.",
      "Volunteezy is a volunteer community connecting young people and organisations with volunteering opportunities in different fields. Taking part helps develop leadership, project-management and communication skills, gain experience and meet new people.",
      "Volunteezy — сообщество волонтёров, которое объединяет молодёжь и организации и помогает находить возможности волонтёрской работы в разных сферах. Участие развивает лидерские навыки, управление проектами и коммуникацию, даёт опыт и новые знакомства."
    ],
    "network.members.noorteaegDescription": [
      "MTÜ Noorteaeg on Ida-Virumaal tegutsev noorteühendus, mis korraldab noortele hariduslikke, kultuuri-, spordi- ja kogukonnaüritusi. Eesmärk on anda noortele võimalusi algatada ideid, arendada oskusi ja osaleda aktiivselt kohaliku elu kujundamises.",
      "MTÜ Noorteaeg is a youth organisation in Ida-Viru County that organises educational, cultural, sports and community events. Its aim is to give young people opportunities to launch ideas, develop skills and take an active role in shaping local life.",
      "MTÜ Noorteaeg — молодёжная организация Ида-Вирумаа, которая проводит образовательные, культурные, спортивные и общественные мероприятия. Её цель — дать молодёжи возможность предлагать идеи, развивать навыки и активно участвовать в жизни своего региона."
    ],
    "network.members.nvaDescription": [
      "MTÜ Noorte Vaba Algatus tegeleb noorte projektide algatamise ja elluviimisega Narvas.",
      "MTÜ Noorte Vaba Algatus initiates and delivers youth projects in Narva.",
      "MTÜ Noorte Vaba Algatus инициирует и реализует молодёжные проекты в Нарве."
    ],
    "network.members.logoAlutaguse": [
      "Alutaguse valla noortevolikogu logo",
      "Alutaguse valla noortevolikogu logo",
      "Логотип Alutaguse valla noortevolikogu"
    ],
    "network.members.logoKohtla": [
      "Kohtla-Järve noortevolikogu logo",
      "Kohtla-Järve noortevolikogu logo",
      "Логотип Kohtla-Järve noortevolikogu"
    ],
    "network.members.logoVolunteezy": [
      "MTÜ Volunteezy logo",
      "MTÜ Volunteezy logo",
      "Логотип MTÜ Volunteezy"
    ],
    "network.members.logoNoorteaeg": [
      "MTÜ Noorteaeg logo",
      "MTÜ Noorteaeg logo",
      "Логотип MTÜ Noorteaeg"
    ],
    "network.members.logoNva": [
      "MTÜ Noorte Vaba Algatus logo",
      "MTÜ Noorte Vaba Algatus logo",
      "Логотип MTÜ Noorte Vaba Algatus"
    ],
    "network.steps.label": [
      "Kuidas koostöö algab?",
      "How does collaboration begin?",
      "Как начинается сотрудничество?"
    ],
    "network.steps.title": [
      "Kolm lihtsat sammu ühise algatuseni",
      "Three simple steps to a shared initiative",
      "Три простых шага к общей инициативе"
    ],
    "network.steps.description": [
      "Võrgustik ei ole ainult nimekiri. See on koht, kus kontaktist võib kasvada ühine projekt, sündmus või pikaajaline partnerlus.",
      "The network is more than a list. It is a place where a new contact can grow into a shared project, event or long-term partnership.",
      "Сеть — это не просто список. Здесь новое знакомство может перерасти в общий проект, событие или долгосрочное партнёрство."
    ],
    "network.steps.findTitle": [
      "Leia sobiv organisatsioon",
      "Find the right organisation",
      "Найдите подходящую организацию"
    ],
    "network.steps.findText": [
      "Tutvu liikmete tegevusvaldkondade ja piirkondadega.",
      "Explore members’ fields of activity and locations.",
      "Познакомьтесь с направлениями работы и регионами участников."
    ],
    "network.steps.contactTitle": ["Võta ühendust", "Get in touch", "Свяжитесь"],
    "network.steps.contactText": [
      "Kirjuta otse organisatsioonile või küsi meilt sobivat kontakti.",
      "Write directly to an organisation or ask us for the right contact.",
      "Напишите организации напрямую или попросите у нас подходящий контакт."
    ],
    "network.steps.createTitle": ["Loo midagi uut", "Create something new", "Создайте что-то новое"],
    "network.steps.createText": [
      "Sõnastage ühine eesmärk ning viige idee koos ellu.",
      "Define a shared goal and bring the idea to life together.",
      "Сформулируйте общую цель и вместе воплотите идею."
    ],
    "network.join.label": ["Liitu võrgustikuga", "Join the network", "Присоединиться к сети"],
    "network.join.title": [
      "Kas teie organisatsioon võiks olla järgmine?",
      "Could your organisation be next?",
      "Ваша организация может стать следующей?"
    ],
    "network.join.description": [
      "Kui tegutsete noorte, kogukonna või hariduse valdkonnas ning soovite Ida-Virumaal rohkem koostööd teha, võtke meiega ühendust.",
      "If you work with young people, communities or education and want to collaborate more in Ida-Viru County, contact us.",
      "Если вы работаете с молодёжью, сообществами или в сфере образования и хотите больше сотрудничать в Ида-Вирумаа, свяжитесь с нами."
    ],
    "network.join.write": ["Kirjuta meile", "Write to us", "Написать нам"],
    "network.join.contacts": ["Vaata kontakte", "View contacts", "Посмотреть контакты"],
    "network.lightbox.close": ["Sulge logo", "Close logo", "Закрыть логотип"],
    "network.lightbox.kicker": ["Võrgustiku liige", "Network member", "Участник сети"],
    "network.lightbox.title": ["Organisatsiooni logo", "Organisation logo", "Логотип организации"],
    "network.lightbox.organisation": ["Organisatsioon", "Organisation", "Организация"],
    "network.lightbox.logoAlt": [
      "{{name}} logo",
      "{{name}} logo",
      "Логотип {{name}}"
    ],

    /* ========================= News articles ========================= */
    "news.items.ida-virumaa-noorte-tunnustusgala-toimub-taas": [
      {
        displayDate: "28. juuni 2026",
        title: "Ida-Virumaa noorte tunnustusgala toimub taas",
        excerpt: "17. oktoobril 2026 toimub Jõhvi Kontserdimajas taas Ida-Virumaa noorte tunnustusgala, kus tunnustatakse piirkonna aktiivseid, ettevõtlikke ja silmapaistvaid noori.",
        imageAlt: "Ida-Virumaa noorte tunnustusgala",
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
        displayDate: "28 June 2026",
        title: "Ida-Virumaa noorte tunnustusgala returns",
        excerpt: "On 17 October 2026, Jõhvi Concert Hall will once again host Ida-Virumaa noorte tunnustusgala, recognising active, enterprising and outstanding young people from the region.",
        imageAlt: "Ida-Virumaa noorte tunnustusgala",
        content: [
          "On 17 October 2026, Jõhvi Concert Hall will once again host Ida-Virumaa noorte tunnustusgala—a celebratory event dedicated to recognising active, enterprising and outstanding young people from the region.",
          "The gala brings together young people, youth supporters, organisations and community representatives. The evening focuses on the achievements, courage, creativity and contributions of young people in Ida-Viru County.",
          "Through the gala, we aim to highlight inspiring role models, share young people’s achievements and encourage others to bring their ideas to life and participate actively in their communities.",
          "Recognition categories:",
          "In 2026, nominations are open in twelve categories: Young Musician of the Year, Young Volunteer of the Year, Young Athlete of the Year, Young Artist of the Year, Young Visual Creator of the Year, Young Dancer of the Year, Young Actor of the Year, Young Leader of the Year, Young Environmental Advocate of the Year, Young Student of the Year, Youth Initiative of the Year, and Young Champion of European Values of the Year.",
          "Who can be nominated?",
          "You can nominate a young person whose work, achievements or initiatives have stood out and made a positive contribution to young people or the local community in Ida-Viru County.",
          "In the Youth Initiative of the Year category, you may also nominate a group of young people who initiated and delivered an impactful project, event or other important undertaking.",
          "Ida-Virumaa noorte tunnustusgala is more than an awards ceremony. It is a shared celebratory evening where young people’s stories, achievements and ideas for the future receive the attention they deserve.",
          "Submitting a nomination:",
          "Nominate a candidate and help us recognise the outstanding young people of Ida-Viru County. See you on 17 October 2026 at Jõhvi Concert Hall!",
          "https://docs.google.com/forms/d/e/1FAIpQLSeJxa0RjIKa-miMDRpP4hx5gI6USiVyNYKo6N9B6dXmEahfLw/viewform"
        ]
      },
      {
        displayDate: "28 июня 2026 года",
        title: "Ida-Virumaa noorte tunnustusgala снова состоится",
        excerpt: "17 октября 2026 года в Концертном доме «Йыхви» вновь состоится Ida-Virumaa noorte tunnustusgala, где отметят активную, инициативную и выдающуюся молодёжь региона.",
        imageAlt: "Ida-Virumaa noorte tunnustusgala",
        content: [
          "17 октября 2026 года в Концертном доме «Йыхви» вновь состоится Ida-Virumaa noorte tunnustusgala — торжественное событие, цель которого заметить и отметить активную, инициативную и выдающуюся молодёжь региона.",
          "Гала-вечер объединит молодых людей, тех, кто их поддерживает, организации и представителей сообщества. В центре внимания будут достижения, смелость, творчество и вклад молодёжи Ида-Вирумаа в развитие местной жизни.",
          "С помощью гала-вечера мы хотим показать вдохновляющие примеры, рассказать о достижениях молодёжи и побудить других молодых людей воплощать свои идеи и активно участвовать в жизни сообщества.",
          "Номинации:",
          "В 2026 году кандидатов можно выдвинуть в двенадцати номинациях: «Молодой музыкант года», «Молодой волонтёр года», «Молодой спортсмен года», «Молодой художник года», «Молодой визуальный автор года», «Молодой танцор года», «Молодой актёр года», «Молодой лидер года», «Молодой защитник природы года», «Молодой учащийся года», «Молодёжная инициатива года» и «Молодой носитель европейских ценностей года».",
          "Кого можно выдвинуть?",
          "Кандидатом может стать молодой человек, который проявил себя своими делами, достижениями или инициативами и внёс положительный вклад в развитие молодёжи Ида-Вирумаа или местного сообщества.",
          "В номинации «Молодёжная инициатива года» можно также выдвинуть группу молодых людей, которая инициировала и реализовала значимый проект, событие или другое важное дело.",
          "Ida-Virumaa noorte tunnustusgala — это не только вручение наград. Это общий торжественный вечер, на котором истории, достижения и идеи молодёжи о будущем получают заслуженное внимание.",
          "Подача заявки:",
          "Выдвиньте кандидата и помогите нам отметить выдающуюся молодёжь Ида-Вирумаа. Встречаемся 17 октября 2026 года в Концертном доме «Йыхви»!",
          "https://docs.google.com/forms/d/e/1FAIpQLSeJxa0RjIKa-miMDRpP4hx5gI6USiVyNYKo6N9B6dXmEahfLw/viewform"
        ]
      }
    ],
    "news.items.projektikirjutamise-laager-toimub-esmakordselt": [
      {
        displayDate: "28. juuni 2026",
        title: "Ida-Virumaa noorte projektikirjutamise laager toimub esmakordselt",
        excerpt: "19.–20. septembril 2026 toimub hotellis Toila SPA Hotell esmakordselt Ida-Virumaa noorte projektikirjutamise laager, mis aitab noortel arendada oma ideid ja õppida neid toimivateks projektideks kujundama.",
        imageAlt: "Ida-Virumaa noorte projektikirjutamise laager Toila SPA Hotellis",
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
        displayDate: "28 June 2026",
        title: "The first Ida-Virumaa noorte projektikirjutamise laager",
        excerpt: "On 19–20 September 2026, Toila SPA Hotell will host the first Ida-Virumaa noorte projektikirjutamise laager, helping young people develop their ideas and learn how to turn them into workable projects.",
        imageAlt: "Ida-Virumaa noorte projektikirjutamise laager at Toila SPA Hotell",
        content: [
          "On 19–20 September 2026, Toila SPA Hotell will host the first Ida-Virumaa noorte projektikirjutamise laager, designed to give young people practical knowledge and skills for developing ideas and preparing projects.",
          "The two-day camp gives young people an opportunity to learn how to turn an initial idea into a clear, feasible project. Participants will learn to define project goals, plan activities, prepare a budget and evaluate results.",
          "Project writing may seem difficult at first, but the camp works through the entire process step by step. Practical tasks and teamwork help participants apply what they learn immediately and develop their ideas further.",
          "Sharing experience is an important part of the camp. Participants can present their thoughts, hear other young people’s ideas and receive feedback that makes projects more meaningful and realistic.",
          "This is the first time Ida-Virumaa noorte projektikirjutamise laager will be held in this format. Through the initiative, MTÜ Noortealgatuste Tugi aims to support enterprising young people in Ida-Viru County and increase their readiness to launch projects and contribute to community development.",
          "The camp is for young people who want to deliver an event, training course, community initiative or another idea but need knowledge, support and inspiration to plan it.",
          "Further information about the programme, participation and registration is available on the MTÜ Noortealgatuste Tugi project-writing camp page."
        ]
      },
      {
        displayDate: "28 июня 2026 года",
        title: "Впервые пройдёт Ida-Virumaa noorte projektikirjutamise laager",
        excerpt: "19–20 сентября 2026 года в Toila SPA Hotell впервые пройдёт Ida-Virumaa noorte projektikirjutamise laager, который поможет молодёжи развить идеи и научиться превращать их в работающие проекты.",
        imageAlt: "Ida-Virumaa noorte projektikirjutamise laager в Toila SPA Hotell",
        content: [
          "19–20 сентября 2026 года в Toila SPA Hotell впервые пройдёт Ida-Virumaa noorte projektikirjutamise laager. Его цель — дать молодёжи практические знания и навыки для развития идей и подготовки проектов.",
          "Двухдневный лагерь позволит молодым людям научиться превращать первоначальную идею в понятный и осуществимый проект. Участники узнают, как формулировать цели, планировать действия, составлять бюджет и оценивать результаты.",
          "На первый взгляд написание проекта может казаться сложным, но в лагере весь процесс разберут шаг за шагом. Практические задания и командная работа помогут сразу применить знания и продолжить развивать идеи.",
          "Важной частью лагеря станет обмен опытом. Участники смогут представить свои мысли, услышать идеи других молодых людей и получить обратную связь, которая поможет сделать проекты содержательнее и реалистичнее.",
          "Ida-Virumaa noorte projektikirjutamise laager в таком формате проводится впервые. Этой инициативой MTÜ Noortealgatuste Tugi хочет поддержать предприимчивость молодёжи Ида-Вирумаа и повысить её готовность самостоятельно запускать проекты и участвовать в развитии сообщества.",
          "Лагерь подойдёт молодым людям, которые хотят провести событие или обучение, запустить общественную инициативу или воплотить другую идею, но нуждаются в знаниях, поддержке и вдохновении для планирования.",
          "Дополнительная информация о программе, участии и регистрации доступна на странице лагеря по написанию проектов MTÜ Noortealgatuste Tugi."
        ]
      }
    ],

    "news.items.avasta-erasmus-voimalused-vitatiimis": [
      {
        displayDate: "1. juuli 2026",
        title: "Avasta Erasmus+ võimalused VitaTiimis",
        excerpt: "8. juulil toimub Narvas VitaTiimis tasuta infokohtumine, kus 15–30-aastased Ida-Virumaa noored saavad tutvuda Erasmus+ programmi võimalustega.",
        imageAlt: "Erasmus+ võimalusi tutvustav noorteüritus VitaTiimis Narvas",
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
        displayDate: "1 July 2026",
        title: "Discover Erasmus+ opportunities at VitaTiim",
        excerpt: "On 8 July, VitaTiim in Narva will host a free information session where young people aged 15–30 from Ida-Viru County can explore opportunities offered by Erasmus+.",
        imageAlt: "Youth event at VitaTiim in Narva introducing Erasmus+ opportunities",
        content: [
          "The world is full of opportunities, and some of them may be exactly right for you.",
          "At 12:00 on 8 July, VitaTiim in Narva will host an information session where young people from Ida-Viru County can discover the opportunities available through Erasmus+.",
          "You will learn about international youth projects, youth exchanges, training courses, volunteering opportunities and other Erasmus+ activities.",
          "The event is free and open to all young people aged 15–30 from Ida-Viru County. Previous experience in international projects is not required.",
          "Event information:",
          "Date: 8 July 2026",
          "Time: 12:00",
          "Location: VitaTiim, Tuleviku tn 7, Narva",
          "Participation: free",
          "Age: 15–30",
          "Snacks will be provided.",
          "If you would like to attend but live in another town in Ida-Viru County, transport costs may also be covered where needed.",
          "Registration link:",
          "https://docs.google.com/forms/d/e/1FAIpQLScLBHt-C4bzJBltpdP1iwX7Aqv6BTwgzOP_uRXw8rNMB3NQpg/viewform",
          "The youth initiative is supported by Erasmus+ and the European Solidarity Corps Agency in cooperation with the EuroPeers Estonia network as part of European Youth Week 2026."
        ]
      },
      {
        displayDate: "1 июля 2026 года",
        title: "Откройте возможности Erasmus+ в VitaTiim",
        excerpt: "8 июля в VitaTiim в Нарве пройдёт бесплатная информационная встреча, где молодые люди 15–30 лет из Ида-Вирумаа смогут узнать о возможностях программы Erasmus+.",
        imageAlt: "Молодёжное мероприятие о возможностях Erasmus+ в VitaTiim в Нарве",
        content: [
          "Мир полон возможностей, и некоторые из них могут быть созданы именно для вас.",
          "8 июля в 12:00 в VitaTiim в Нарве пройдёт информационная встреча, где молодёжь Ида-Вирумаа сможет узнать о возможностях программы Erasmus+.",
          "На встрече вы узнаете о международных молодёжных проектах, молодёжных обменах, обучении, волонтёрстве и других направлениях программы Erasmus+.",
          "Участие бесплатное. Мероприятие предназначено для всех молодых людей Ида-Вирумаа в возрасте 15–30 лет. Опыт участия в международных проектах не требуется.",
          "Информация о событии:",
          "Дата: 8 июля 2026 года",
          "Время: 12:00",
          "Адрес: VitaTiim, Tuleviku tn 7, Narva",
          "Участие: бесплатное",
          "Возраст: 15–30 лет",
          "Для участников будут подготовлены лёгкие закуски.",
          "Если вы хотите участвовать, но живёте в другом городе Ида-Вирумаа, при необходимости можно покрыть транспортные расходы.",
          "Ссылка для регистрации:",
          "https://docs.google.com/forms/d/e/1FAIpQLScLBHt-C4bzJBltpdP1iwX7Aqv6BTwgzOP_uRXw8rNMB3NQpg/viewform",
          "Молодёжную инициативу поддерживают Erasmus+ и Агентство Европейского корпуса солидарности в сотрудничестве с сетью EuroPeers Eesti в рамках Европейской недели молодёжи 2026."
        ]
      }
    ],
    "news.items.narvas-toimus-koolitus-erasmus-ja-rohkem-avasta-mis-euroopa-sulle-pakub": [
      {
        displayDate: "16. juuli 2026",
        title: "Narvas toimus koolitus „Erasmus+ ja rohkem: avasta, mis Euroopa sulle pakub“",
        excerpt: "Narvas toimunud koolitusel tutvustati noortele Erasmus+ programmi ja teisi Euroopa Liidu võimalusi õppimiseks, reisimiseks ning rahvusvahelistes projektides osalemiseks.",
        imageAlt: "Erasmus+ võimalusi tutvustav noorteüritus VitaTiimis Narvas",
        content: [
          "8. juulil toimus Narvas VitaTiimis koolitus „Erasmus+ ja rohkem: avasta, mis Euroopa sulle pakub“, mis oli suunatud Ida-Virumaa noortele.",
          "Koolitusel rääkis Erasmus+ ja Euroopa Solidaarsuskorpuse Eurodeski ja EuroPeersi koordinaator Natalja Klimenkova Erasmus+ ja Euroopa Solidaarsuskorpuse pakutavatest võimalustest ning sellest, kuidas noored saavad nendes programmides osaleda. Oma inspireerivat kogemuslugu jagas Marika Karnetova, kes on mitmes noorteprogrammis osalenud.",
          "Suur aitäh kõigile koolitusel osalenud noortele ning meie suurepärastele esinejatele!",
          "Koolitus toimus Ida-Virumaa noorteühenduste koolitusprogrammi raames. Järgmiste koolituste ja teiste tegevuste kohta leiad infot MTÜ Noortealgatuste Tugi sotsiaalmeediakanalitest.",
          "Noortealgatust toetab Erasmus+ ja Euroopa Solidaarsuskorpuse Agentuur koostöös EuroPeers Eesti võrgustikuga Euroopa noortenädala 2026 tegevuste raames."
        ]
      },
      {
        displayDate: "16 July 2026",
        title: "Training in Narva: “Erasmus+ and more—discover what Europe offers you”",
        excerpt: "A training session in Narva introduced young people to Erasmus+ and other European Union opportunities for learning, travelling and taking part in international projects.",
        imageAlt: "Youth event at VitaTiim in Narva introducing Erasmus+ opportunities",
        content: [
          "On 8 July, VitaTiim in Narva hosted “Erasmus+ and more: discover what Europe offers you”, a training session for young people from Ida-Viru County.",
          "Natalja Klimenkova, Eurodesk and EuroPeers Coordinator for Erasmus+ and the European Solidarity Corps, spoke about the opportunities offered by Erasmus+ and the European Solidarity Corps and explained how young people can participate. Marika Karnetova, who has taken part in several youth programmes, shared her inspiring experience.",
          "A big thank-you to every young person who attended the training and to our excellent speakers!",
          "The event was part of the Ida-Viru County youth organisations’ training programme. Follow the MTÜ Noortealgatuste Tugi social-media channels for information about upcoming training sessions and other activities.",
          "The youth initiative is supported by Erasmus+ and the European Solidarity Corps Agency in cooperation with the EuroPeers Estonia network as part of European Youth Week 2026."
        ]
      },
      {
        displayDate: "16 июля 2026 года",
        title: "В Нарве прошёл тренинг «Erasmus+ и больше: узнайте, что предлагает вам Европа»",
        excerpt: "На тренинге в Нарве молодёжи рассказали о программе Erasmus+ и других возможностях Европейского союза для обучения, путешествий и участия в международных проектах.",
        imageAlt: "Молодёжное мероприятие о возможностях Erasmus+ в VitaTiim в Нарве",
        content: [
          "8 июля в VitaTiim в Нарве прошёл тренинг «Erasmus+ и больше: узнайте, что предлагает вам Европа», предназначенный для молодёжи Ида-Вирумаа.",
          "Координатор Eurodesk и EuroPeers программ Erasmus+ и Европейского корпуса солидарности Natalja Klimenkova рассказала о возможностях Erasmus+ и Европейского корпуса солидарности и о том, как молодёжь может участвовать в этих программах. Своей вдохновляющей историей поделилась Marika Karnetova, участвовавшая в нескольких молодёжных программах.",
          "Большое спасибо всем молодым людям, которые пришли на тренинг, и нашим замечательным спикерам!",
          "Тренинг прошёл в рамках образовательной программы молодёжных объединений Ида-Вирумаа. Информацию о следующих тренингах и других мероприятиях ищите в социальных сетях MTÜ Noortealgatuste Tugi.",
          "Молодёжную инициативу поддерживают Erasmus+ и Агентство Европейского корпуса солидарности в сотрудничестве с сетью EuroPeers Eesti в рамках Европейской недели молодёжи 2026."
        ]
      }
    ],

    /* ========================= Dynamic modal text ========================= */
    "home.modal.photoAlt": [
      "{{name}} foto",
      "Photo of {{name}}",
      "Фотография {{name}}"
    ],
    "home.modal.organisationKicker": [
      "MEIE ORGANISATSIOON",
      "OUR ORGANISATION",
      "НАША ОРГАНИЗАЦИЯ"
    ],
    "home.modal.organisationRole": [
      "IDA-VIRUMAA NOORTE IDEEDE KASVULAVA",
      "A LAUNCHPAD FOR YOUNG IDEAS IN IDA-VIRU COUNTY",
      "ПЛАТФОРМА ДЛЯ ИДЕЙ МОЛОДЁЖИ ИДА-ВИРУМАА"
    ],
    "home.modal.organisationDescription": [
      "Loome Ida-Virumaa noortele võimalusi, toetame julgeid algatusi ning aitame ideedel kasvada päriselt teostatavateks projektideks.",
      "We create opportunities for young people in Ida-Viru County, support bold initiatives and help ideas grow into viable projects.",
      "Мы создаём возможности для молодёжи Ида-Вирумаа, поддерживаем смелые инициативы и помогаем превращать идеи в осуществимые проекты."
    ],
    "street.lightbox.moment": [
      "Hetk sündmuselt",
      "A moment from the event",
      "Момент события"
    ],
    "gala.lightbox.largePhoto": [
      "Suur foto",
      "Enlarged photo",
      "Увеличенная фотография"
    ],

    /* Translation catalogue ends here. */
  };

  const languageCodes = ["et", "en", "ru"];

  windowObject.SITE_TRANSLATIONS = Object.fromEntries(
    languageCodes.map(function (languageCode, languageIndex) {
      return [
        languageCode,
        Object.fromEntries(
          Object.entries(entries).map(function (entry) {
            return [entry[0], entry[1][languageIndex]];
          })
        )
      ];
    })
  );
})(window);
