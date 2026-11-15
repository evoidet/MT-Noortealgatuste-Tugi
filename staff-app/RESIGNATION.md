# Lahkumisavaldused

Töötajavaate kaart „Lahkumisavaldus” avab privaatse koostamisvormi. Kasutaja
saab valida juhatuse liikme tagasiastumise, MTÜ liikme väljaastumise, vabatahtliku
tegevuse lõpetamise ja olemasoleva käsunduslepingu ülesütlemise. Valitud suhted
vaadatakse üle koos. Iga suhte kohta saab alla laadida eraldi allkirjastamata
PDF- ja DOCX-faili. Roll või ülesanded kirjeldatakse õiguslikust staatusest eraldi.

Avalduse koostamise kinnitus lukustab selle andmed ja salvestab organisatsiooni
andmete hetktõmmise. Kasutaja allkirjastab ja edastab avalduse ise ning märgib
edastamise, kättesaamise ja menetluse lõpetamise iga avalduse juures eraldi.
Toimingud salvestuvad kasutaja sisestatud menetlusmärgetena. Registrikanded,
liikmete nimekiri ja juurdepääsuõigused muudetakse vastava haldusmenetluse käigus.

## Alused ja järeltoimingud

- [MTÜS § 28 lg 3¹](https://www.riigiteataja.ee/et/akt/mt%C3%BCs) ja
  [kehtiv põhikiri](https://ariregister.rik.ee/eng/company/80652930/file/9014116093)
  § 4 lg 1. Vaikimisi saaja on üldkoosolek. Erandliku määramise korral
  sisestatakse tegelik määranud organ. Juhatuses on 3–7 liiget. Kui sisestatud
  koosseisu põhjal jääb liikmeid alla kolme, kuvatakse asendusliikme valimise
  meeldetuletus. Registrikande kontrollimise meeldetuletus kuvatakse kõigil
  juhatuse lahkumisteadetel.
- [MTÜS § 15](https://www.riigiteataja.ee/et/akt/mt%C3%BCs) ja põhikirja
  § 6 lg 1 p 4. Vorm käsitleb vabatahtlikku väljaastumist. Põhikirja § 5
  väljaarvamise menetlus on eraldi toiming. Liikmete nimekirja
  ajakohastatakse pärast väljaastumise jõustumist.
- Vabatahtliku tegevuse lõpetamise puhul tuleb kirjaliku kokkuleppe tingimused
  vajaduse korral eraldi üle vaadata.
- [VÕS §-d 630–631](https://www.riigiteataja.ee/akt/120062026018#para630).
  Käsunduslepingu vorm eeldab konkreetse sõlmitud lepingu olemasolu,
  poolte ja tingimuste sisestamist ning nende kontrolli kinnitamist. Süsteem
  kontrollib sisestatud kuupäevi, etteteatamistähtaega ja valitud aluse
  tingimusi. Lepingu olemasolu, sisu ja erakorralise aluse asjaolud kinnitab
  kasutaja oma lepingu põhjal. Rakendusel puudub kontrollitud lepinguregister.

16.11.2026 kontrolliti [e-äriregistri kirjet](https://ariregister.rik.ee/eng/company/80652930)
ja leiti, et 20.05.2026 jõustunud põhikirja fail ühtis bait-baidilt avaliku
dokumendiga repositooriumis. Registrikood ja aadress vastasid kesksetele
organisatsiooni andmetele.

## Tehniline ülesehitus ja kontroll

Vorm kasutab olemasolevat kontot, CSRF-kaitset ja privaatset avalduste registrit.
Andmete muutmine, koostamine ja menetluse märkimine kontrollivad kirje revisjoni.
Varem talletatud PDF-id on arhiivis looja jaoks kättesaadavad. Uued kirjed
kasutavad olemasolevat migratsiooni `014_resignation.sql`.

`node staff-app/scripts/preview-resignation.mjs` loob nelja liigi sünteetilised
PDF- ja DOCX-näidised. `staff-app/test/resignation.test.js` kontrollib
valideerimist, vorminguid ja privaatset töövoogu. Brauseritest
`staff-app/test/resignation.browser.mjs` kontrollib avalehte ning töölaua-
ja mobiilivaadet sünteetiliste andmetega.
