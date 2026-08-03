/**
 * Ida-Virumaa Noorte Tunnustuskonkurss
 * Värske ja sõltumatu Google Apps Script
 *
 * Põhimõte:
 * - EI loe vastuseid FormApp.ItemResponse kaudu;
 * - loeb kõik vastused vormiga seotud Google Sheetsi vastuste tabelist;
 * - iga setupFreshSystem() käivitus loob uue alamkausta ja 12 uut kategooriafaili;
 * - vanad failid, vanad ID-d ja vanad triggerid ei mõjuta uut käivitust;
 * - iga kandidaat saab eraldi lehe;
 * - korduv, kuid erinev esildis lisatakse kandidaadi lehe lõppu;
 * - täpselt sama esildis jäetakse dubleerimata;
 * - vene tekst: eestikeelne tõlge üleval, vene originaal all.
 */

const APP = Object.freeze({
  TIME_ZONE: 'Europe/Tallinn',
  BATCH_SIZE: 6,
  CONTINUE_AFTER_MS: 60 * 1000,
  RETRY_COUNT: 3,
  RETRY_DELAY_MS: 1200,
  OPENAI_URL: 'https://api.openai.com/v1/responses',
  DEFAULT_MODEL: 'gpt-5-mini',
  TEMPLATE_SHEET: '_TEMPLATE',
  SYSTEM_SHEET: '_SYSTEM',
  FIRST_EXTRA_ROW: 38,
  RUNTIME_PREFIX: 'RUN_',

  REQUIRED_PROPERTIES: Object.freeze([
    'FORM_URL',
    'OUTPUT_FOLDER_ID',
    'TEMPLATE_SPREADSHEET_URL',
    'OPENAI_API_KEY'
  ]),

  FIELD_ALIASES: Object.freeze({
    timestamp: [
      'timestamp', 'ajatempel', 'esitamise aeg', 'vastuse esitamise aeg',
      'отметка времени', 'временная отметка', 'дата и время'
    ],
    respondentEmail: [
      'email address', 'vastaja e-post', 'vastaja e-posti aadress',
      'адрес электронной почты', 'электронная почта респондента'
    ],
    candidateName: [
      'kandidaadi ees- ja perekonnanimi', 'kandidaadi nimi',
      'kandidaadi nimi ja perekonnanimi',
      'имя и фамилия кандидата',
      'имя и фамилия кандидата того кого вы представляете'
    ],
    candidateAge: [
      'kandidaadi vanus', 'vanus',
      'возраст кандидата', 'возраст кандидата на момент представления заявки'
    ],
    candidateResidence: [
      'kandidaadi elukoht', 'elukoht', 'linn või vald',
      'место проживания кандидата', 'место проживания кандидата город или волость'
    ],
    candidateEmail: [
      'kandidaadi e-post', 'kandidaadi e-posti aadress',
      'электронная почта кандидата', 'почта кандидата'
    ],
    candidatePhone: [
      'kandidaadi telefon', 'kandidaadi telefoninumber', 'telefoninumber',
      'номер телефона кандидата', 'телефон кандидата'
    ],
    category: [
      'kategooria', 'nominatsiooni kategooria', 'valige sobiv kategooria',
      'категория', 'номинация', 'выберите подходящую категорию'
    ],
    description: [
      'kirjeldage miks see noor väärib tunnustust antud kategoorias',
      'miks see noor väärib tunnustust',
      'miks kandidaat väärib tunnustust',
      'опишите почему этот молодой человек заслуживает признания в данной категории',
      'почему этот молодой человек заслуживает признания',
      'почему кандидат заслуживает признания'
    ],
    examples: [
      'kus või kuidas ta on silma paistnud',
      'tooge konkreetseid näiteid',
      'kus või kuidas kandidaat on silma paistnud',
      'где или каким образом кандидат проявил себя',
      'где или каким образом кандидат проявила себя',
      'приведите конкретные примеры'
    ],
    materials: [
      'palun lisa kandidaadi tegevust või saavutusi illustreeriv materjal',
      'palun laadige kandidaadi tegevust või saavutusi illustreerivad materjalid',
      'lisamaterjalid', 'fotod videod lingid',
      'пожалуйста загрузите материалы иллюстрирующие деятельность или достижения кандидата',
      'материалы иллюстрирующие деятельность или достижения кандидата',
      'фотографии видеоматериалы публикации в сми сертификаты портфолио'
    ],
    nominatorName: [
      'esitaja ees- ja perekonnanimi', 'esitaja nimi',
      'taotluse esitaja nimi', 'kandidaadi esitaja nimi',
      'имя и фамилия лица подающего кандидатуру',
      'имя и фамилия заявителя', 'кто выдвигает кандидата'
    ],
    nominatorEmail: [
      'esitaja e-post', 'esitaja e-posti aadress',
      'taotluse esitaja e-post', 'kandidaadi esitaja e-post',
      'почта подающего кандидатуру',
      'электронная почта заявителя', 'e-mail заявителя'
    ]
  })
});

const SYSTEM_HEADERS = Object.freeze([
  'source_row_key',
  'source_row',
  'submission_hash',
  'candidate_key',
  'candidate_name',
  'candidate_sheet',
  'nominator_key',
  'submitted_at',
  'status',
  'message'
]);

/**
 * AINUS põhifunktsioon, mida tuleb alguses käivitada.
 * Loob täiesti uue töökomplekti, uued failid ja triggerid.
 */
function setupFreshSystem() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    validateUserConfiguration_();
    deleteAllProjectTriggers_();
    clearRuntimeProperties_();

    const form = openForm_();
    const responseSpreadsheet = openResponseSpreadsheet_(form);
    const responseSheet = detectResponseSheet_(form, responseSpreadsheet);
    const headers = getHeaders_(responseSheet);
    const fieldIndexes = detectFieldIndexes_(headers);

    requireDetectedField_(fieldIndexes, 'candidateName', headers);
    requireDetectedField_(fieldIndexes, 'category', headers);

    const categories = detectCategories_(form, responseSheet, headers, fieldIndexes.category);
    if (!categories.length) {
      throw new Error('Kategooriaid ei leitud. Kontrolli vormi kategooriaküsimust või tabeli kategooriaveergu.');
    }

    const parentFolder = getFolderFromProperty_('OUTPUT_FOLDER_ID');
    const templateFile = getFileFromProperty_('TEMPLATE_SPREADSHEET_URL');
    const runFolder = createRunFolder_(parentFolder);
    const categoryFiles = createFreshCategoryFiles_(categories, runFolder, templateFile);

    const props = PropertiesService.getScriptProperties();
    props.setProperties({
      RUN_ID: Utilities.getUuid(),
      RUN_FOLDER_ID: runFolder.getId(),
      RUN_FOLDER_URL: runFolder.getUrl(),
      RUN_RESPONSE_SPREADSHEET_ID: responseSpreadsheet.getId(),
      RUN_RESPONSE_SHEET_ID: String(responseSheet.getSheetId()),
      RUN_CATEGORY_FILES_JSON: JSON.stringify(categoryFiles),
      RUN_BACKFILL_CURSOR: '2',
      RUN_BACKFILL_LAST_ROW: String(responseSheet.getLastRow()),
      RUN_PROCESSED_COUNT: '0',
      RUN_FAILED_ROWS_JSON: '[]',
      RUN_STARTED_AT: new Date().toISOString()
    }, false);

    installSpreadsheetSubmitTrigger_(responseSpreadsheet);
    scheduleContinuation_();

    console.log('Uus töökomplekt loodud.');
    console.log('Kaust: ' + runFolder.getUrl());
    console.log('Kategooriafaile: ' + categories.length);
    console.log('Olemasolevaid vastuseid: ' + Math.max(0, responseSheet.getLastRow() - 1));
  } finally {
    lock.releaseLock();
  }

  // Töötleb kohe esimese partii. Ülejäänud lähevad automaatselt edasi.
  continueBackfill();
}

/** Alias, kui funktsiooni nimi on mugavam. */
function rebuildEverythingFresh() {
  setupFreshSystem();
}

/**
 * Ajutine taustatöötlus olemasolevatele vastustele.
 * Seda võib käsitsi käivitada, kui automaatne jätkamine peatub.
 */
function continueBackfill() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    const runtime = getRuntime_();
    const sheet = getResponseSheetFromRuntime_(runtime);
    const headers = getHeaders_(sheet);
    const fieldIndexes = detectFieldIndexes_(headers);

    let cursor = Number(runtime.backfillCursor || 2);
    const lastRow = Number(runtime.backfillLastRow || sheet.getLastRow());
    const endRow = Math.min(lastRow, cursor + APP.BATCH_SIZE - 1);

    if (cursor > lastRow || lastRow < 2) {
      finishBackfill_();
      return;
    }

    for (let row = cursor; row <= endRow; row += 1) {
      try {
        processResponseSheetRow_(sheet, row, headers, fieldIndexes);
        incrementProcessedCount_();
      } catch (error) {
        queueFailedRow_(row, error);
        console.warn('Rida ' + row + ' jäeti korduskatseks: ' + safeErrorMessage_(error));
      }
    }

    const nextRow = endRow + 1;
    PropertiesService.getScriptProperties().setProperty('RUN_BACKFILL_CURSOR', String(nextRow));

    console.log('Töötlus: ' + Math.min(endRow - 1, lastRow - 1) + '/' + Math.max(0, lastRow - 1));

    if (nextRow <= lastRow) {
      scheduleContinuation_();
    } else {
      retryFailedRows_();
      finishBackfill_();
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * Püsiv trigger uutele vormivastustele.
 * Käivitub vastuste Google Sheetsi kaudu, mitte FormApp.ItemResponse kaudu.
 */
function handleNewSubmission(e) {
  if (!e || !e.range) {
    throw new Error('handleNewSubmission peab käivituma Google Sheetsi vormivastuse triggerist.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    queueFailedRow_(e.range.getRow(), new Error('Skript oli hõivatud; rida lisati korduskatseks.'));
    scheduleRetry_();
    return;
  }

  try {
    const runtime = getRuntime_();
    const expectedSpreadsheetId = runtime.responseSpreadsheetId;
    const expectedSheetId = Number(runtime.responseSheetId);
    const eventSheet = e.range.getSheet();

    if (e.source.getId() !== expectedSpreadsheetId || eventSheet.getSheetId() !== expectedSheetId) {
      console.warn('Trigger tuli teisest tabelist või lehest ja jäeti vahele.');
      return;
    }

    const headers = getHeaders_(eventSheet);
    const fieldIndexes = detectFieldIndexes_(headers);
    processResponseSheetRow_(eventSheet, e.range.getRow(), headers, fieldIndexes);
  } catch (error) {
    queueFailedRow_(e.range.getRow(), error);
    scheduleRetry_();
    console.warn('Uue vastuse rida lisati korduskatseks: ' + safeErrorMessage_(error));
  } finally {
    lock.releaseLock();
  }
}

/** Kordab varem ebaõnnestunud ridu. */
function retryFailedRows() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;

  try {
    retryFailedRows_();
  } finally {
    lock.releaseLock();
  }
}

/** Näitab jooksva töökomplekti staatust ja kausta linki. */
function showStatus() {
  const props = PropertiesService.getScriptProperties();
  const folderUrl = props.getProperty('RUN_FOLDER_URL') || 'puudub';
  const cursor = Number(props.getProperty('RUN_BACKFILL_CURSOR') || 2);
  const lastRow = Number(props.getProperty('RUN_BACKFILL_LAST_ROW') || 1);
  const processed = Number(props.getProperty('RUN_PROCESSED_COUNT') || 0);
  const failed = JSON.parse(props.getProperty('RUN_FAILED_ROWS_JSON') || '[]');

  console.log('Kaust: ' + folderUrl);
  console.log('Olemasolevate vastuste edenemine: ' + Math.min(Math.max(0, cursor - 2), Math.max(0, lastRow - 1)) + '/' + Math.max(0, lastRow - 1));
  console.log('Töödeldud käivitusi: ' + processed);
  console.log('Korduskatset ootavad read: ' + (failed.length ? failed.join(', ') : 'puuduvad'));
}

/** Kontrollib ainult seadeid, faile ei loo. */
function testConfiguration() {
  validateUserConfiguration_();
  const form = openForm_();
  const responseSpreadsheet = openResponseSpreadsheet_(form);
  const responseSheet = detectResponseSheet_(form, responseSpreadsheet);
  const headers = getHeaders_(responseSheet);
  const indexes = detectFieldIndexes_(headers);
  const categories = detectCategories_(form, responseSheet, headers, indexes.category);

  console.log('Vorm: ' + form.getTitle());
  console.log('Vastuste tabel: ' + responseSpreadsheet.getUrl());
  console.log('Vastuste leht: ' + responseSheet.getName());
  console.log('Kandidaadi nime veerg: ' + headerAt_(headers, indexes.candidateName));
  console.log('Kategooria veerg: ' + headerAt_(headers, indexes.category));
  console.log('Kategooriad (' + categories.length + '): ' + categories.join(' | '));
  console.log('Mall: ' + getFileFromProperty_('TEMPLATE_SPREADSHEET_URL').getUrl());
  console.log('Sihtkaust: ' + getFolderFromProperty_('OUTPUT_FOLDER_ID').getUrl());
}

/** Eemaldab ainult selle projekti triggerid. */
function removeAllProjectTriggers() {
  deleteAllProjectTriggers_();
  console.log('Selle Apps Scripti projekti triggerid eemaldati.');
}

// -----------------------------------------------------------------------------
// PÕHITÖÖTLUS
// -----------------------------------------------------------------------------

function processResponseSheetRow_(sheet, row, headers, fieldIndexes) {
  if (row < 2 || row > sheet.getLastRow()) return;

  requireDetectedField_(fieldIndexes, 'candidateName', headers);
  requireDetectedField_(fieldIndexes, 'category', headers);

  const record = readSheetRow_(sheet, row, headers);
  const data = buildSubmissionData_(record, headers, fieldIndexes, sheet, row);
  const categoryFileId = resolveCategoryFileId_(data.category);
  const categorySpreadsheet = SpreadsheetApp.openById(categoryFileId);
  const systemSheet = ensureSystemSheet_(categorySpreadsheet);
  const records = readSystemRecords_(systemSheet);

  if (records.some(function(item) { return item.sourceRowKey === data.sourceRowKey; })) {
    console.log('Rida juba töödeldud: ' + row);
    return;
  }

  const exactDuplicate = records.find(function(item) {
    return item.candidateKey === data.candidateKey &&
      item.nominatorKey === data.nominatorKey &&
      item.submissionHash === data.submissionHash &&
      (item.status === 'PROCESSED' || item.status === 'DUPLICATE_SKIPPED');
  });

  if (exactDuplicate) {
    appendSystemRecord_(systemSheet, data, exactDuplicate.candidateSheet, 'DUPLICATE_SKIPPED', 'Täpselt sama esildis jäeti dubleerimata.');
    console.log('Täpselt sama esildis jäeti vahele: ' + data.candidateName);
    return;
  }

  attachTranslations_(data);

  let candidateSheet = findCandidateSheet_(categorySpreadsheet, records, data.candidateKey);
  let message = '';

  if (!candidateSheet) {
    candidateSheet = createCandidateSheet_(categorySpreadsheet, records, data);
    fillCandidateFirstSubmission_(candidateSheet, data);
    message = 'Loodi uus kandidaadi leht.';
  } else {
    const submissionNumber = countCandidateSubmissions_(records, data.candidateKey) + 1;
    appendSubmissionBlock_(candidateSheet, data, submissionNumber, false);
    message = 'Erinev kordusesildis lisati kandidaadi lehe lõppu.';
  }

  appendSystemRecord_(systemSheet, data, candidateSheet.getName(), 'PROCESSED', message);
  SpreadsheetApp.flush();
  console.log(message + ' ' + data.candidateName + ' / ' + data.category);
}

function readSheetRow_(sheet, row, headers) {
  const width = headers.length;
  const range = sheet.getRange(row, 1, 1, width);
  const display = range.getDisplayValues()[0];
  const raw = range.getValues()[0];
  const rich = range.getRichTextValues()[0];

  return headers.map(function(header, index) {
    let value = String(display[index] == null ? '' : display[index]).trim();
    const richText = rich[index];

    if (richText) {
      const links = richText.getRuns().map(function(run) {
        return run.getLinkUrl();
      }).filter(Boolean);
      if (links.length) value = unique_(links).join('\n');
    }

    return {
      index: index,
      header: String(header || '').trim(),
      value: value,
      rawValue: raw[index],
      normalizedHeader: normalizeText_(header),
      translation: ''
    };
  });
}

function buildSubmissionData_(record, headers, indexes, sheet, row) {
  const get = function(field) {
    const index = indexes[field];
    return index >= 0 && record[index] ? String(record[index].value || '').trim() : '';
  };

  const candidateName = get('candidateName');
  const rawCategory = get('category');
  if (!candidateName) throw new Error('Kandidaadi nimi on tühi real ' + row + '.');
  if (!rawCategory) throw new Error('Kategooria on tühi real ' + row + '.');

  const category = resolveCategoryName_(rawCategory);
  const timestampValue = indexes.timestamp >= 0 ? record[indexes.timestamp].rawValue : '';
  const submittedAt = timestampValue instanceof Date ? timestampValue : new Date();
  const nominatorEmail = get('nominatorEmail') || get('respondentEmail');
  const nominatorName = get('nominatorName');
  const sourceRowKey = sheet.getParent().getId() + ':' + sheet.getSheetId() + ':' + row;
  const candidateKey = normalizeIdentity_(candidateName);
  const nominatorKey = normalizeIdentity_(nominatorEmail || nominatorName || 'teadmata-esitaja');

  const data = {
    sourceRowKey: sourceRowKey,
    sourceRow: row,
    submittedAt: submittedAt,
    candidateName: candidateName,
    candidateAge: get('candidateAge'),
    candidateResidence: get('candidateResidence'),
    candidateEmail: get('candidateEmail'),
    candidatePhone: get('candidatePhone'),
    category: category,
    description: get('description'),
    examples: get('examples'),
    materials: get('materials'),
    nominatorName: nominatorName,
    nominatorEmail: nominatorEmail,
    candidateKey: candidateKey,
    nominatorKey: nominatorKey,
    record: record,
    fieldIndexes: indexes,
    translationsByIndex: {}
  };

  data.submissionHash = createSubmissionHash_(data);
  return data;
}

// -----------------------------------------------------------------------------
// LEHTEDE LOOMINE JA TÄITMINE
// -----------------------------------------------------------------------------

function createFreshCategoryFiles_(categories, folder, templateFile) {
  const map = {};

  categories.forEach(function(category) {
    const copy = templateFile.makeCopy(sanitizeDriveName_(category), folder);
    const spreadsheet = SpreadsheetApp.openById(copy.getId());
    initializeCategorySpreadsheet_(spreadsheet, category);
    map[normalizeIdentity_(category)] = {
      category: category,
      fileId: copy.getId(),
      url: spreadsheet.getUrl()
    };
  });

  return map;
}

function initializeCategorySpreadsheet_(spreadsheet, category) {
  let templateSheet = spreadsheet.getSheets()[0];

  // Värskes koopias peab kandidaate olema null.
  spreadsheet.getSheets().slice(1).forEach(function(sheet) {
    spreadsheet.deleteSheet(sheet);
  });

  templateSheet.setName(APP.TEMPLATE_SHEET);
  clearTemplateCandidateData_(templateSheet, category);
  ensureSystemSheet_(spreadsheet);
  templateSheet.hideSheet();
}

function clearTemplateCandidateData_(sheet, category) {
  sheet.getRange('C4').clearContent();
  sheet.getRange('C5').clearContent();
  sheet.getRange('C6').setValue(category);
  sheet.getRange('K4:O11').clearContent();
  sheet.getRange('K14:O27').clearContent();
  sheet.getRange('K32:O34').clearContent();

  const leftLabels = [
    ['Elukoht:'],
    ['Kandidaadi e-post:'],
    ['Kandidaadi telefon:'],
    ['Esitaja nimi:'],
    ['Esitaja e-post:'],
    ['Esitatud:']
  ];
  sheet.getRange(8, 2, leftLabels.length, 1).setValues(leftLabels).setFontWeight('bold');
  sheet.getRange(8, 3, leftLabels.length, 1).clearContent().setWrap(true);
}

function createCandidateSheet_(spreadsheet, records, data) {
  const templateSheet = spreadsheet.getSheetByName(APP.TEMPLATE_SHEET);
  if (!templateSheet) throw new Error('Failis puudub peidetud mallileht ' + APP.TEMPLATE_SHEET + '.');

  const number = countUniqueCandidates_(records) + 1;
  const baseName = 'Kandidaat ' + String(number).padStart(3, '0') + ' – ' + data.candidateName;
  const name = uniqueSheetName_(spreadsheet, baseName);
  const sheet = templateSheet.copyTo(spreadsheet).setName(name).showSheet();
  spreadsheet.setActiveSheet(sheet);
  spreadsheet.moveActiveSheet(spreadsheet.getNumSheets() - 1);
  return sheet;
}

function fillCandidateFirstSubmission_(sheet, data) {
  sheet.getRange('C4').setValue(data.candidateName);
  sheet.getRange('C5').setValue(data.candidateAge);
  sheet.getRange('C6').setValue(data.category);
  sheet.getRange('C8').setValue(data.candidateResidence);
  sheet.getRange('C9').setValue(data.candidateEmail);
  sheet.getRange('C10').setValue(data.candidatePhone);
  sheet.getRange('C11').setValue(data.nominatorName);
  sheet.getRange('C12').setValue(data.nominatorEmail);
  sheet.getRange('C13').setValue(formatDateTime_(data.submittedAt));

  setMergedText_(sheet, 'K4:O11', formatTranslatedOriginal_(data.description, translationForField_(data, 'description')));
  setMergedText_(sheet, 'K14:O27', formatTranslatedOriginal_(data.examples, translationForField_(data, 'examples')));
  setMergedText_(sheet, 'K32:O34', data.materials);

  appendSubmissionBlock_(sheet, data, 1, true);
}

function appendSubmissionBlock_(sheet, data, submissionNumber, isFirst) {
  const startRow = Math.max(APP.FIRST_EXTRA_ROW, sheet.getLastRow() + (isFirst ? 1 : 2));
  ensureRows_(sheet, startRow + data.record.length * 2 + 12);

  const title = isFirst ? 'VORMI KÕIK VASTUSED' : 'TÄIENDAV ESILDIS NR ' + submissionNumber;
  const titleRange = sheet.getRange(startRow, 2, 1, 14);
  safeBreakApart_(titleRange);
  titleRange.merge();
  titleRange.setValue(title)
    .setFontWeight('bold')
    .setFontSize(12)
    .setHorizontalAlignment('center')
    .setBackground('#d9d9d9')
    .setBorder(true, true, true, true, true, true);

  let row = startRow + 1;
  const meta = [
    ['Esitatud', formatDateTime_(data.submittedAt)],
    ['Esitaja nimi', data.nominatorName],
    ['Esitaja e-post', data.nominatorEmail]
  ];

  meta.forEach(function(pair) {
    writeAnswerRow_(sheet, row, pair[0], pair[1]);
    row += 1;
  });

  data.record.forEach(function(entry) {
    if (!entry.header || !entry.value) return;
    const translated = data.translationsByIndex[entry.index] || '';
    writeAnswerRow_(sheet, row, entry.header, formatTranslatedOriginal_(entry.value, translated));
    row += Math.max(1, estimatedRowSpan_(entry.value, translated));
  });
}

function writeAnswerRow_(sheet, row, label, value) {
  ensureRows_(sheet, row + 2);

  const labelRange = sheet.getRange(row, 2, 1, 3);
  const valueRange = sheet.getRange(row, 5, 1, 11);
  safeBreakApart_(labelRange);
  safeBreakApart_(valueRange);
  labelRange.merge();
  valueRange.merge();

  labelRange.setValue(label)
    .setFontWeight('bold')
    .setWrap(true)
    .setVerticalAlignment('top')
    .setBackground('#eeeeee')
    .setBorder(true, true, true, true, true, true);

  valueRange.setValue(value)
    .setWrap(true)
    .setVerticalAlignment('top')
    .setBorder(true, true, true, true, true, true);

  const textLength = String(value || '').length;
  sheet.setRowHeight(row, Math.min(220, Math.max(30, 30 + Math.ceil(textLength / 110) * 15)));
}

function setMergedText_(sheet, a1, value) {
  const range = sheet.getRange(a1);
  range.setValue(value || '').setWrap(true).setVerticalAlignment('top');
}

// -----------------------------------------------------------------------------
// TÕLGE
// -----------------------------------------------------------------------------

function attachTranslations_(data) {
  const targets = {};

  data.record.forEach(function(entry) {
    if (!shouldTranslate_(entry.header, entry.value)) return;
    targets['f' + entry.index] = entry.value;
  });

  if (!Object.keys(targets).length) return;
  const translations = translateJsonToEstonian_(targets);

  Object.keys(translations).forEach(function(key) {
    const index = Number(key.replace(/^f/, ''));
    if (!isNaN(index)) data.translationsByIndex[index] = String(translations[key] || '').trim();
  });
}

function translationForField_(data, field) {
  const index = data.fieldIndexes[field];
  return index >= 0 ? String(data.translationsByIndex[index] || '') : '';
}

function shouldTranslate_(header, value) {
  const text = String(value || '').trim();
  if (!text || !containsCyrillic_(text)) return false;
  if (/^https?:\/\//i.test(text) && !/\s/.test(text)) return false;

  const normalizedHeader = normalizeText_(header);
  const metadataAliases = []
    .concat(APP.FIELD_ALIASES.candidateName)
    .concat(APP.FIELD_ALIASES.candidateEmail)
    .concat(APP.FIELD_ALIASES.candidatePhone)
    .concat(APP.FIELD_ALIASES.nominatorName)
    .concat(APP.FIELD_ALIASES.nominatorEmail)
    .concat(APP.FIELD_ALIASES.respondentEmail)
    .map(normalizeText_);

  return !metadataAliases.some(function(alias) {
    return normalizedHeader === alias;
  });
}

function translateJsonToEstonian_(inputMap) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = String(props.getProperty('OPENAI_API_KEY') || '').trim();
  const model = String(props.getProperty('OPENAI_TRANSLATION_MODEL') || APP.DEFAULT_MODEL).trim();
  if (!apiKey) throw new Error('Script Property OPENAI_API_KEY puudub.');

  const keys = Object.keys(inputMap);
  const schemaProperties = {};
  keys.forEach(function(key) { schemaProperties[key] = { type: 'string' }; });

  const payload = {
    model: model,
    store: false,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'Tõlgi kõik JSON-i väärtused vene keelest loomulikku ja korrektse ametliku stiiliga eesti keelde. Ära muuda nimesid, linke, numbreid ega fakte. Tagasta ainult skeemile vastav JSON.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify(inputMap)
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'estonian_translations',
        strict: true,
        schema: {
          type: 'object',
          properties: schemaProperties,
          required: keys,
          additionalProperties: false
        }
      }
    }
  };

  let lastError = null;

  for (let attempt = 1; attempt <= APP.RETRY_COUNT; attempt += 1) {
    try {
      const response = UrlFetchApp.fetch(APP.OPENAI_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'X-Client-Request-Id': Utilities.getUuid()
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const status = response.getResponseCode();
      const body = response.getContentText();

      if (status < 200 || status >= 300) {
        throw new Error('OpenAI HTTP ' + status + ': ' + body.slice(0, 600));
      }

      const json = JSON.parse(body);
      const outputText = extractResponseText_(json);
      const parsed = JSON.parse(stripCodeFences_(outputText));

      keys.forEach(function(key) {
        if (typeof parsed[key] !== 'string') {
          throw new Error('Tõlke vastuses puudub võti ' + key + '.');
        }
      });

      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < APP.RETRY_COUNT) Utilities.sleep(APP.RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error('Tõlkimine ebaõnnestus pärast ' + APP.RETRY_COUNT + ' katset: ' + safeErrorMessage_(lastError));
}

function extractResponseText_(json) {
  if (json && typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text.trim();
  }

  const parts = [];
  (json.output || []).forEach(function(item) {
    (item.content || []).forEach(function(content) {
      if (typeof content.text === 'string') parts.push(content.text);
    });
  });

  if (!parts.length) throw new Error('OpenAI vastuses puudub tekstiväljund.');
  return parts.join('\n').trim();
}

function formatTranslatedOriginal_(original, translation) {
  const source = String(original || '').trim();
  const translated = String(translation || '').trim();
  if (!source) return '';
  if (!translated || !containsCyrillic_(source)) return source;
  return translated + '\n\nOriginaal vene keeles:\n' + source;
}

// -----------------------------------------------------------------------------
// KATEGOORIAD JA VÄLJADE TUVASTAMINE
// -----------------------------------------------------------------------------

function detectCategories_(form, responseSheet, headers, categoryIndex) {
  let categories = [];

  form.getItems().forEach(function(item) {
    if (!matchesAliases_(item.getTitle(), APP.FIELD_ALIASES.category)) return;

    try {
      switch (String(item.getType())) {
        case 'MULTIPLE_CHOICE':
          categories = item.asMultipleChoiceItem().getChoices().map(function(choice) { return choice.getValue(); });
          break;
        case 'LIST':
          categories = item.asListItem().getChoices().map(function(choice) { return choice.getValue(); });
          break;
        case 'CHECKBOX':
          categories = item.asCheckboxItem().getChoices().map(function(choice) { return choice.getValue(); });
          break;
      }
    } catch (error) {
      console.warn('Kategooriate lugemine vormist ei õnnestunud, kasutatakse vastuste tabelit.');
    }
  });

  if (!categories.length && categoryIndex >= 0 && responseSheet.getLastRow() >= 2) {
    categories = responseSheet
      .getRange(2, categoryIndex + 1, responseSheet.getLastRow() - 1, 1)
      .getDisplayValues()
      .map(function(row) { return String(row[0] || '').trim(); })
      .filter(Boolean);
  }

  return uniqueByNormalized_(categories);
}

function detectFieldIndexes_(headers) {
  const indexes = {};
  Object.keys(APP.FIELD_ALIASES).forEach(function(field) {
    indexes[field] = findBestHeaderIndex_(headers, APP.FIELD_ALIASES[field]);
  });
  return indexes;
}

function findBestHeaderIndex_(headers, aliases) {
  let bestIndex = -1;
  let bestScore = 0;

  headers.forEach(function(header, index) {
    const normalizedHeader = normalizeText_(header);
    if (!normalizedHeader) return;

    aliases.forEach(function(alias) {
      const normalizedAlias = normalizeText_(alias);
      let score = 0;
      if (normalizedHeader === normalizedAlias) score = 1000 + normalizedAlias.length;
      else if (normalizedHeader.indexOf(normalizedAlias) >= 0) score = 500 + normalizedAlias.length;
      else if (normalizedAlias.indexOf(normalizedHeader) >= 0) score = 300 + normalizedHeader.length;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
  });

  return bestIndex;
}

function resolveCategoryName_(value) {
  const runtime = getRuntime_();
  const map = runtime.categoryFiles;
  const exactKey = normalizeIdentity_(value);
  if (map[exactKey]) return map[exactKey].category;

  const keys = Object.keys(map);
  const match = keys.find(function(key) {
    return key.indexOf(exactKey) >= 0 || exactKey.indexOf(key) >= 0;
  });

  if (!match) {
    throw new Error('Kategooria "' + value + '" jaoks ei ole aktiivses töökomplektis faili. Käivita setupFreshSystem() pärast vormi kategooriate muutmist.');
  }
  return map[match].category;
}

function resolveCategoryFileId_(category) {
  const runtime = getRuntime_();
  const key = normalizeIdentity_(category);
  const entry = runtime.categoryFiles[key];
  if (!entry || !entry.fileId) throw new Error('Kategooriafaili ID puudub: ' + category);

  try {
    DriveApp.getFileById(entry.fileId).getName();
  } catch (error) {
    throw new Error('Aktiivse töökomplekti kategooriafail on kustutatud või ligipääsmatu: ' + category + '. Käivita setupFreshSystem(), et luua uus täielik komplekt.');
  }

  return entry.fileId;
}

// -----------------------------------------------------------------------------
// VASTUSTE TABELI LEIDMINE
// -----------------------------------------------------------------------------

function openForm_() {
  const value = String(PropertiesService.getScriptProperties().getProperty('FORM_URL') || '').trim();
  const id = extractGoogleId_(value);
  if (!id) throw new Error('FORM_URL ei sisalda kehtivat Google Formsi ID-d.');
  return FormApp.openById(id);
}

function openResponseSpreadsheet_(form) {
  const destinationId = String(form.getDestinationId() || '').trim();
  if (!destinationId) {
    throw new Error('Google Form ei ole seotud vastuste Google Sheets tabeliga. Ava vorm → Responses → Link to Sheets.');
  }
  return SpreadsheetApp.openById(destinationId);
}

function detectResponseSheet_(form, spreadsheet) {
  const formTitles = form.getItems().map(function(item) { return normalizeText_(item.getTitle()); }).filter(Boolean);
  let bestSheet = null;
  let bestScore = -1;

  spreadsheet.getSheets().forEach(function(sheet) {
    if (sheet.getLastColumn() < 2) return;
    const headers = getHeaders_(sheet).map(normalizeText_);
    const score = headers.reduce(function(total, header) {
      return total + (formTitles.indexOf(header) >= 0 ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestSheet = sheet;
    }
  });

  if (!bestSheet || bestScore < 2) {
    throw new Error('Vormi vastuste lehte ei õnnestunud vastuste tabelist tuvastada.');
  }
  return bestSheet;
}

function getResponseSheetFromRuntime_(runtime) {
  const spreadsheet = SpreadsheetApp.openById(runtime.responseSpreadsheetId);
  const sheetId = Number(runtime.responseSheetId);
  const sheet = spreadsheet.getSheets().find(function(item) { return item.getSheetId() === sheetId; });
  if (!sheet) throw new Error('Vastuste lehte ei leitud. Käivita setupFreshSystem().');
  return sheet;
}

function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error('Vastuste tabelis puuduvad veerud.');
  return sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(function(value) {
    return String(value || '').trim();
  });
}

// -----------------------------------------------------------------------------
// SÜSTEEMILEHT JA DUBLEERIMISE KONTROLL
// -----------------------------------------------------------------------------

function ensureSystemSheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(APP.SYSTEM_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(APP.SYSTEM_SHEET);

  const existing = sheet.getRange(1, 1, 1, SYSTEM_HEADERS.length).getDisplayValues()[0];
  if (existing.join('|') !== SYSTEM_HEADERS.join('|')) {
    sheet.clear();
    sheet.getRange(1, 1, 1, SYSTEM_HEADERS.length).setValues([SYSTEM_HEADERS]).setFontWeight('bold');
  }

  if (!sheet.isSheetHidden()) sheet.hideSheet();
  return sheet;
}

function readSystemRecords_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SYSTEM_HEADERS.length).getDisplayValues().map(function(row) {
    return {
      sourceRowKey: row[0],
      sourceRow: row[1],
      submissionHash: row[2],
      candidateKey: row[3],
      candidateName: row[4],
      candidateSheet: row[5],
      nominatorKey: row[6],
      submittedAt: row[7],
      status: row[8],
      message: row[9]
    };
  });
}

function appendSystemRecord_(sheet, data, candidateSheet, status, message) {
  sheet.appendRow([
    data.sourceRowKey,
    data.sourceRow,
    data.submissionHash,
    data.candidateKey,
    data.candidateName,
    candidateSheet,
    data.nominatorKey,
    formatDateTime_(data.submittedAt),
    status,
    message
  ]);
}

function findCandidateSheet_(spreadsheet, records, candidateKey) {
  const record = records.find(function(item) {
    return item.candidateKey === candidateKey && item.candidateSheet;
  });
  return record ? spreadsheet.getSheetByName(record.candidateSheet) : null;
}

function countCandidateSubmissions_(records, candidateKey) {
  return records.filter(function(item) {
    return item.candidateKey === candidateKey && item.status === 'PROCESSED';
  }).length;
}

function countUniqueCandidates_(records) {
  const seen = {};
  records.forEach(function(item) {
    if (item.candidateKey) seen[item.candidateKey] = true;
  });
  return Object.keys(seen).length;
}

// -----------------------------------------------------------------------------
// TRIGGERID JA TAASTATÖÖ
// -----------------------------------------------------------------------------

function installSpreadsheetSubmitTrigger_(spreadsheet) {
  deleteTriggersByHandler_('handleNewSubmission');
  ScriptApp.newTrigger('handleNewSubmission')
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();
}

function scheduleContinuation_() {
  deleteTriggersByHandler_('continueBackfill');
  ScriptApp.newTrigger('continueBackfill')
    .timeBased()
    .after(APP.CONTINUE_AFTER_MS)
    .create();
}

function scheduleRetry_() {
  deleteTriggersByHandler_('retryFailedRows');
  ScriptApp.newTrigger('retryFailedRows')
    .timeBased()
    .after(2 * APP.CONTINUE_AFTER_MS)
    .create();
}

function finishBackfill_() {
  deleteTriggersByHandler_('continueBackfill');
  const failed = JSON.parse(PropertiesService.getScriptProperties().getProperty('RUN_FAILED_ROWS_JSON') || '[]');
  if (failed.length) {
    scheduleRetry_();
    console.warn('Põhitöötlus lõppes, korduskatset ootavad read: ' + failed.join(', '));
  } else {
    console.log('Kõik olemasolevad vastused on töödeldud.');
  }
}

function queueFailedRow_(row, error) {
  const props = PropertiesService.getScriptProperties();
  const rows = JSON.parse(props.getProperty('RUN_FAILED_ROWS_JSON') || '[]');
  if (rows.indexOf(Number(row)) < 0) rows.push(Number(row));
  props.setProperty('RUN_FAILED_ROWS_JSON', JSON.stringify(rows.sort(function(a, b) { return a - b; })));
  props.setProperty('RUN_LAST_ERROR', safeErrorMessage_(error));
}

function retryFailedRows_() {
  const props = PropertiesService.getScriptProperties();
  const rows = JSON.parse(props.getProperty('RUN_FAILED_ROWS_JSON') || '[]');
  if (!rows.length) {
    deleteTriggersByHandler_('retryFailedRows');
    return;
  }

  const runtime = getRuntime_();
  const sheet = getResponseSheetFromRuntime_(runtime);
  const headers = getHeaders_(sheet);
  const indexes = detectFieldIndexes_(headers);
  const remaining = [];

  rows.forEach(function(row) {
    try {
      processResponseSheetRow_(sheet, Number(row), headers, indexes);
    } catch (error) {
      remaining.push(Number(row));
      console.warn('Rida ' + row + ' vajab veel korduskatset: ' + safeErrorMessage_(error));
    }
  });

  props.setProperty('RUN_FAILED_ROWS_JSON', JSON.stringify(unique_(remaining).sort(function(a, b) { return a - b; })));

  if (remaining.length) scheduleRetry_();
  else {
    deleteTriggersByHandler_('retryFailedRows');
    console.log('Kõik korduskatse read on töödeldud.');
  }
}

function deleteAllProjectTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
}

function deleteTriggersByHandler_(handler) {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === handler) ScriptApp.deleteTrigger(trigger);
  });
}

// -----------------------------------------------------------------------------
// SEADED JA RUNTIME
// -----------------------------------------------------------------------------

function validateUserConfiguration_() {
  const props = PropertiesService.getScriptProperties();
  const missing = APP.REQUIRED_PROPERTIES.filter(function(name) {
    return !String(props.getProperty(name) || '').trim();
  });
  if (missing.length) throw new Error('Puuduvad Script Properties: ' + missing.join(', '));

  openForm_();
  getFolderFromProperty_('OUTPUT_FOLDER_ID');
  getFileFromProperty_('TEMPLATE_SPREADSHEET_URL');
}

function getRuntime_() {
  const props = PropertiesService.getScriptProperties();
  const responseSpreadsheetId = props.getProperty('RUN_RESPONSE_SPREADSHEET_ID');
  const responseSheetId = props.getProperty('RUN_RESPONSE_SHEET_ID');
  const categoryFilesJson = props.getProperty('RUN_CATEGORY_FILES_JSON');

  if (!responseSpreadsheetId || !responseSheetId || !categoryFilesJson) {
    throw new Error('Aktiivne töökomplekt puudub. Käivita setupFreshSystem().');
  }

  return {
    responseSpreadsheetId: responseSpreadsheetId,
    responseSheetId: responseSheetId,
    categoryFiles: JSON.parse(categoryFilesJson),
    backfillCursor: props.getProperty('RUN_BACKFILL_CURSOR'),
    backfillLastRow: props.getProperty('RUN_BACKFILL_LAST_ROW')
  };
}

function clearRuntimeProperties_() {
  const props = PropertiesService.getScriptProperties();
  const all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf(APP.RUNTIME_PREFIX) === 0) props.deleteProperty(key);
  });
}

function getFolderFromProperty_(propertyName) {
  const value = String(PropertiesService.getScriptProperties().getProperty(propertyName) || '').trim();
  const id = extractGoogleId_(value);
  if (!id) throw new Error(propertyName + ' ei sisalda kehtivat Google Drive kausta ID-d või linki.');
  return DriveApp.getFolderById(id);
}

function getFileFromProperty_(propertyName) {
  const value = String(PropertiesService.getScriptProperties().getProperty(propertyName) || '').trim();
  const id = extractGoogleId_(value);
  if (!id) throw new Error(propertyName + ' ei sisalda kehtivat Google Drive faili ID-d või linki.');
  return DriveApp.getFileById(id);
}

function createRunFolder_(parentFolder) {
  const stamp = Utilities.formatDate(new Date(), APP.TIME_ZONE, 'yyyy-MM-dd HH.mm.ss');
  return parentFolder.createFolder('Kandidaadid – ' + stamp);
}

function incrementProcessedCount_() {
  const props = PropertiesService.getScriptProperties();
  const count = Number(props.getProperty('RUN_PROCESSED_COUNT') || 0) + 1;
  props.setProperty('RUN_PROCESSED_COUNT', String(count));
}

// -----------------------------------------------------------------------------
// ABIFUNKTSIOONID
// -----------------------------------------------------------------------------

function createSubmissionHash_(data) {
  const values = data.record.map(function(entry) {
    return [normalizeText_(entry.header), normalizeValue_(entry.value)];
  });
  return hashText_(JSON.stringify({
    candidateKey: data.candidateKey,
    nominatorKey: data.nominatorKey,
    values: values
  }));
}

function hashText_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function normalizeText_(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[^a-z0-9а-яõäöüšž]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdentity_(value) {
  return normalizeText_(value).replace(/\s+/g, '-');
}

function normalizeValue_(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesAliases_(value, aliases) {
  const normalized = normalizeText_(value);
  return aliases.some(function(alias) {
    const a = normalizeText_(alias);
    return normalized === a || normalized.indexOf(a) >= 0 || a.indexOf(normalized) >= 0;
  });
}

function containsCyrillic_(text) {
  return /[А-Яа-яЁё]/.test(String(text || ''));
}

function unique_(values) {
  const seen = {};
  return values.filter(function(value) {
    const key = String(value);
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function uniqueByNormalized_(values) {
  const seen = {};
  const result = [];
  values.forEach(function(value) {
    const clean = String(value || '').trim();
    const key = normalizeIdentity_(clean);
    if (!clean || seen[key]) return;
    seen[key] = true;
    result.push(clean);
  });
  return result;
}

function uniqueSheetName_(spreadsheet, name) {
  const clean = sanitizeSheetName_(name).slice(0, 100);
  if (!spreadsheet.getSheetByName(clean)) return clean;

  let index = 2;
  while (true) {
    const suffix = ' (' + index + ')';
    const candidate = clean.slice(0, 100 - suffix.length) + suffix;
    if (!spreadsheet.getSheetByName(candidate)) return candidate;
    index += 1;
  }
}

function sanitizeSheetName_(name) {
  return String(name || 'Kandidaat')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Kandidaat';
}

function sanitizeDriveName_(name) {
  return String(name || 'Kategooria').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractGoogleId_(value) {
  const text = String(value || '').trim();
  if (/^[a-zA-Z0-9_-]{20,}$/.test(text)) return text;
  const match = text.match(/[-\w]{20,}/);
  return match ? match[0] : '';
}

function formatDateTime_(value) {
  const date = value instanceof Date && !isNaN(value.getTime()) ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value || '');
  return Utilities.formatDate(date, APP.TIME_ZONE, 'dd.MM.yyyy HH:mm');
}

function stripCodeFences_(text) {
  return String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function safeErrorMessage_(error) {
  if (!error) return 'Tundmatu viga';
  return String(error.message || error).slice(0, 1000);
}

function requireDetectedField_(indexes, field, headers) {
  if (indexes[field] >= 0) return;
  throw new Error('Välja "' + field + '" ei leitud. Tuvastatud päised: ' + headers.join(' | '));
}

function headerAt_(headers, index) {
  return index >= 0 ? headers[index] : 'ei leitud';
}

function ensureRows_(sheet, requiredLastRow) {
  const missing = requiredLastRow - sheet.getMaxRows();
  if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
}

function safeBreakApart_(range) {
  try {
    range.breakApart();
  } catch (error) {
    // Vahemik ei olnud ühendatud; midagi ei ole vaja teha.
  }
}

function estimatedRowSpan_(original, translation) {
  const length = String(original || '').length + String(translation || '').length;
  return length > 1800 ? 3 : length > 900 ? 2 : 1;
}
