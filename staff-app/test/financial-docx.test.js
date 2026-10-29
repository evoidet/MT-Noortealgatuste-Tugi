import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import { generateFinancialDocx } from '../src/financial-docx.js';
import { validateFinancialData } from '../src/financial-validation.js';
import { organization } from '../src/organization.js';

test('Word templates retain editable tables, image bytes, geometry, fonts and separate dates', async () => {
  for (const kind of ['invoice','quotation']) {
    const issuer = { ...organization, name:'Testmüüja ÕÜ', iban:'TEST-IBAN', vatRegistered:true, vatRate:24, vatNumber:'EE123456789' };
    const data = validateFinancialData({ date:'2026-10-22',dueDate:'2026-11-05',supplyDate:'2026-10-20',execution:'20.10.2026',
      customer:'Tellija ÕÄÖÜ & <partner>',address:'Testi 1',email:'test@example.test',
      items:Array.from({length:7},(_,i)=>({description:`Teenuse rida ${i+1}`,quantity:'2',unit:'tund',unitPrice:'1,25'})),
      terms:{payment:'14 päeva',costs:'Kõik kulud hinnas',changes:'E-posti teel'},
    },issuer,true);
    const template = new PizZip(await readFile(new URL(`../private/templates/documents/financial/${kind}.docx`,import.meta.url)));
    const generated = new PizZip(await generateFinancialDocx({kind,number:'TEST-001',issuer,data}));
    for (const name of ['word/styles.xml','word/theme/theme1.xml','word/media/image1.png','word/_rels/document.xml.rels'])
      assert.ok(template.file(name).asNodeBuffer().equals(generated.file(name).asNodeBuffer()), name);
    const xml = generated.file('word/document.xml').asText();
    assert.equal((xml.match(/<w:tbl>/g)||[]).length,6);
    assert.equal((xml.match(/Teenuse rida /g)||[]).length,7);
    for (const text of ['22.10.2026','05.11.2026','20.10.2026','ÕÄÖÜ &amp; &lt;partner&gt;','24%','14 päeva']) assert.ok(xml.includes(text),text);
    assert.ok(!xml.includes('TÄITMISE ABI'));
    assert.ok(!xml.includes('[0,00]'));
    assert.equal(xml.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)[0],template.file('word/document.xml').asText().match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/)[0]);
    const footer = generated.file('word/footer1.xml').asText();
    assert.ok(footer.includes('EE123456789'));
    assert.ok(!footer.includes('ei lisandu'));
    if(kind==='quotation') { assert.ok(footer.includes('TEST-IBAN')); assert.ok(footer.includes('Testmüüja ÕÜ')); }
  }
});

test('reference fields stay in the information table and invoice instructions adapt', async () => {
  const issuer = { ...organization, vatRegistered: false, vatRate: 0 };
  for (const kind of ['invoice', 'quotation']) {
    for (const referenceNumber of ['', '1234561']) {
      const data = validateFinancialData({ date: '2026-10-29', dueDate: '2026-11-05',
        customer: 'Testklient', address: 'Testi 1', reference: 'Leping & kokkulepe', referenceNumber,
        explanation: 'Lisainfo', items: [{ description: 'Teenus', quantity: 1, unit: 'tk', unitPrice: 10 }],
      }, issuer, true);
      const xml = new PizZip(await generateFinancialDocx({ kind, number: 'TEST-042', issuer, data }))
        .file('word/document.xml').asText();
      const info = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)[1];
      assert.match(info, /Viide/);
      assert.match(info, /Leping &amp; kokkulepe/);
      if (kind === 'invoice') {
        assert.match(info, /Viitenumber/);
        assert.match(xml, /Arve TEST-042 · Lisainfo/);
        assert.match(xml, /Makse selgitusse palume märkida arve number/);
        assert.equal(xml.includes('viitenumbri väljale'), Boolean(referenceNumber));
        if (referenceNumber) assert.ok(info.includes(referenceNumber));
      } else {
        assert.ok(!xml.includes('Viitenumber'));
        assert.ok(!xml.includes('1234561'));
        assert.ok(!xml.includes('Makse selgitusse'));
      }
      assert.ok(!/\{(?:reference|referenceNumber|paymentInstruction)\}/.test(xml));
    }
  }
});
