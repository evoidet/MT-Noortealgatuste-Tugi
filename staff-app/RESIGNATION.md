# Töölepingu ülesütlemise avaldus

## Rakendus ja piirang

Olemasolev „Lahkumisavaldus” menüü ja avalehe kaart avavad töölepingu ülesütlemise vormi. Varasem liikmesusest lahkumise kohatäide on eemaldatud. Vorm, näidised, selgitused, dokumendid ja kirjad on eesti keeles.

**Elektrooniline esitamine on vaikimisi blokeeritud.** Google'i sisselogimine tuvastab konto, kuid rakenduses ei ole kontrollitud töösuhete registrit ega kinnitust, et konto omanik on avalduses nimetatud töötaja. Nime kokkulangevust või administraatori rolli ei kasutata volitusena. Kasutaja saab koostada, salvestada, eelvaadata ja alla laadida avalduse ning esitada selle ise tuvastataval viisil. Allkirjastamist ega tööandja kättesaamist ei väideta.

Saatmise lubamiseks tuleb ühendada tegelik kontrollitud töösuhete/volituste allikas `createStaffApp` parameetriga `resignationEmployeeVerifier`. See peab serveris kontrollima konto püsivat identiteeti, konkreetset töösuhet ja esitamisvolitust ning tagastama `{ userId, employeeName, email, employmentVerified: true, authorizationVerified: true }`. Ärge täitke seda vastust kliendiandmete, nimevõrdluse ega testiandmetega. Kui kontrollija puudub või kontroll ebaõnnestub, saatmist ei toimu. See integratsioon ei ole selles muudatuses olemasolevasse andmeallikasse ühendatud.

## Olemasoleva arhitektuuri kasutamine

- Ühine PostgreSQL-i `submissions` register ja `revisions` ajalugu; uusi tabeleid pole. Migratsioon `014_resignation.sql` lisab dokumendiliigi ja sellele piiratud saatmisstaatused.
- Olemasolev Google'i seanss, CSRF-kaitse, päringupiiraja, organisatsiooni keskandmed, PDFKit ja DejaVu fondid.
- Olemasolev AI `/api/staff/ai/improve`: ainult eestikeelse põhjenduse keeleparandus; algne ja pakutud tekst kuvatakse eraldi. Nimed, kuupäevad, dokumendi liik ja õiguslik alus ei kuulu AI muudetavasse vormisisendisse. Arvulisi fakte kaitseb senine faktikontroll. Kasutaja peab üle vaatama ka asjaolud ja eitused; semantilist õiguslikku samasust AI automaatselt tõendada ei saa. Isikukoode sisaldavad päringud blokeeritakse. AI teenuse rike ei takista käsitsi koostamist.
- Olemasolev Nodemaileri transport; seadistatud saatja, kontrollitud Reply-To, saaja keskse organisatsiooni e-posti järgi `juhatus@noortetugi.ee`, PDF manus ja sama tingimusteta tahteavaldus kirja sisus.
- Dokumendid on ainult looja jaoks: administraatori või finantsroll ei anna automaatselt ligipääsu. Üldine dokumentide muutmise/esitamise API ei asenda selle liigi eraldi kontrollitud töövoogu. Uut avalikku faililinki ei teki.

## Õiguslik kontroll, 10.11.2026

Kontrolliti Riigi Teataja TLS-i kehtivat tervikteksti [RT I, 03.07.2026, 35](https://www.riigiteataja.ee/akt/103072026035), redaktsioon 01.10.2026–31.12.2026. Veebileht nõudis JavaScripti; sama teksti metaandmed ja sisu loeti Riigi Teataja avalikust API-st:

- `https://www.riigiteataja.ee/public-api/api/v1/akt/123122024006?leiaKehtiv=true` → `kehtivId: 103072026035`, staatus `KEHTIV`.
- `https://www.riigiteataja.ee/public-api/api/v1/akt/103072026035/blob-html` → kehtiv terviktekst.

Rakendatud: § 85 lg 1 (tähtajatu leping), § 85 lg 2 (tähtajalise asenduslepingu erand), § 86 lg 1 (katseaeg), § 91 (erakorraline ülesütlemine), § 95 (vorm ja põhjendus), § 96 (15 kalendripäeva), § 98 lg 1 (30 kalendripäeva) ja lg 2 (etteteatamata erakorralise ülesütlemise tingimus). Lühema etteteatamise puhul selgitatakse võimalikke nõudeid, automaatset tühisust ei väideta ega arvutata konkreetset hüvitist. Erakorralise põhjuse kehtivust ja katseaja tegelikku kestust süsteem ei tuvasta: katseaja andmed tuleb lepingust kontrollida, sealhulgas kokkulepped ja peatumised.

Kättesaamise ja vormi selgitused: [Tööelu, „Töölepingu ühepoolne lõpetamine”](https://www.tooelu.ee/et/31/toolepingu-uhepoolne-lopetamine), lehel märgitud uuendus 28.01.2026. Praktilise struktuurina vaadati [CVKeskuse 18.11.2025 artiklit](https://www.cvkeskus.ee/karjaarikeskus/kuidas-koostada-korrektne-lahkumisavaldus-naidis); selle palvevormi ega digiallkirja väidet ei kopeeritud. Ülesandes nimetatud kahte PDF-manust ei olnud kättesaadavate failide hulgas; kasutati nende kirjeldusi.

Kuupäevi arvutatakse UTC-põhiste kuupäevaväärtustega, et suveaeg ei muudaks kalendripäevade arvu; tänane kuupäev on Europe/Tallinn. Teadaolev kättesaamine + 30/15 kalendripäeva annab tavapärase etteteatamise varaseima lõppkuupäeva. Kui kättesaamine puudub, kasutatakse teadaolevat esitamist või tänast kuupäeva ning tulemus märgitakse hinnanguliseks. Kasutaja valitud kuupäeva ei muudeta.

## Elutsükkel ja saatmiskindlus

Mustand → salvestatud versiooni eelvaade → kasutaja kinnitus → püsiv `SENDING` nõue → `SENT`, `SEND_FAILED` või `UNCERTAIN`. Saadetud tähendab ainult teenuse vastuvõttu saatmiseks, mitte tööandja kättesaamist. Looja, aeg, saaja ja teenuse sõnumi ID säilitatakse. Päringu kinnitus peab vastama ülevaadatud revisjonile.

Enne SMTP-kutset salvestatakse täpne PDF olemasoleva privaatse registrikirje `_delivery.pdfBase64` väljal. Ka revisjon säilitab kinnitatud hetktõmmise. Järgnev PDF-i allalaadimine kasutab neid samu baite. Selline salvestus ei vaja uut failiteenust; dokumendi põhjenduse pikkus on piiratud 8000 märgiga. Dokument on pärast saatmiskatset muutmatu; parandamiseks luuakse uus avaldus.

PostgreSQL-i olemasolev lukustus ja reataseme revisjonikontroll väldivad sama avalduse paralleelset saatmist. Kirje püsiv `SENDING` olek jääb alles ka protsessi katkemisel; seda ei saadeta pimesi uuesti. Kindla SMTP tagasilükkamise korral saab kasutaja pärast uut ülevaatust ja kinnitamist proovida sama muutumatut dokumenti uuesti saata. Ajalõpu, katkenud ühenduse, puuduva vastuvõtutõendi või lõpliku andmebaasikirjutuse tõrke korral tuleb saatmise tulemus enne uut toimingut kontrollida; automaatset uuesti saatmist ei toimu. Kättetoimetamise veebikonksu ega automaatset kättesaamise tuvastust ei lisatud.

## Failid

- Vorm ja ühine tekst/kalender: `public/resignation.js`, `public/resignation-values.js`; ühendus `public/app.js` ja `public/styles.css`.
- API, valideerimine ja PDF: `src/resignation-routes.js`, `src/resignation-validation.js`, `src/resignation-pdf.js`.
- Olemasolevate teenuste laiendused: `src/app.js`, `src/database.js`, `src/permissions.js`, `src/mail.js`, `src/ai.js`, `src/validation.js`.
- Andmebaas: `migrations/014_resignation.sql`.
- Kontroll: `test/resignation.test.js`, `test/resignation.browser.mjs`, `test/financial.browser.mjs`, `test/schema.integration.test.js`, `scripts/preview-resignation.mjs`, `package.json`.

## Kohalik kontroll ja kasutuselevõtt

1. Käivitage olemasolev `npm run db:migrate` tavapärases juurutuses. Selles arendustöös ei muudetud pärisandmebaasi ega saadetud tegelikke kirju.
2. `npm --prefix staff-app run check`, `npm --prefix staff-app run typecheck`, `npm --prefix staff-app test`, `npm run build`.
3. `node staff-app/scripts/preview-resignation.mjs` loob kolm väljamõeldud QA PDF-i privaatsesse genereeritud kataloogi; neid ei saadeta.
4. `node staff-app/test/resignation.browser.mjs [playwright-mooduli-tee]` kasutab ainult kohalikke sünteetilisi HTTP-vastuseid ja blokeerib välise võrgu.

Õigusreeglid vajavad ülevaatamist seaduse muutumisel. Töösuhte ja isiku volituse kontroll, päris SMTP-kättetoimetamine ning tootmiskeskkonna migratsioon ei ole kohalike testidega tõendatud. See muudatus ei luba esitada, et konkreetse erakorralise ülesütlemise õiguslik põhjendus on automaatselt kinnitatud.

10.11.2026 läbitud kontrollid: kogu Node'i testikomplekt (356 testi), süntaksikontroll, TypeScripti kontroll, avaliku saidi kontroll ja rakenduse build. Eraldi läbiti lahkumisavalduse ning olemasolevate finantsdokumentide sünteetilised brauseritestid. Kolm PDF-varianti renderdati Poppleriga ja vaadati visuaalselt üle; kontrolliti A4 mõõtu, eesti tähti, kuupäevi ja pika põhjenduse jätkumist teisel lehel. Brauseritestid kontrollisid 1440 ja 390 piksli laiust vaadet. Päris SMTP ega AI võrguteenust ei kutsutud; AI ja e-post olid testides asendatud kontrollitavate vastustega.
