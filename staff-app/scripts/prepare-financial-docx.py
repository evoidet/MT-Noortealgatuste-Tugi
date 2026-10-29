"""Patch supplied DOCX packages without rebuilding their styles or relationships."""
import argparse
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def find(node, path):
    return node.findall(path, NS)
def text(node, value):
    nodes = find(node, './/w:t')
    if not nodes:
        p = node if node.tag.endswith('}p') else find(node, './w:p')[0]
        r = E.SubElement(p, '{%s}r' % NS['w'])
        nodes = [E.SubElement(r, '{%s}t' % NS['w'])]
    nodes[0].text = value
    nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for n in nodes[1:]:
        n.text = ''
def tail(p, tag):
    # Keep label runs and their formatting; replace the value after the colon.
    nodes = find(p, './/w:t')
    full = ''.join(n.text or '' for n in nodes)
    prefix = full.split(':', 1)[0] + ': '
    if len(nodes) > 1 and ':' in (nodes[0].text or ''):
        nodes[0].text = prefix
        nodes[1].text = tag
        for n in nodes[2:]: n.text = ''
    else:
        text(p, prefix + tag)

def add_reference_fields(doc, kind):
    """Extend the original information table using its existing cell styles."""
    tables = find(doc, './w:body/w:tbl')
    if not any(n.text == '{reference}' for n in find(tables[1], './/w:t')):
        row = deepcopy(find(tables[1], './w:tr')[-1])
        values = ['Viide', '{reference}', 'Viitenumber' if kind == 'invoice' else '',
                  '{referenceNumber}' if kind == 'invoice' else '']
        for cell, value in zip(find(row, './w:tc'), values):
            text(cell, value)
        tables[1].append(row)
    if kind == 'invoice':
        # Payment reference lives in the information table; instructions by the bank details.
        paragraphs = find(tables[5], './/w:tc/w:p')
        text(paragraphs[4], '{paymentInstruction}{invoiceTerms}')

def upgrade_template(path, kind):
    with ZipFile(path) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    doc = E.fromstring(parts['word/document.xml'])
    add_reference_fields(doc, kind)
    parts['word/document.xml'] = E.tostring(doc, xml_declaration=True, encoding='UTF-8', standalone=True)
    with ZipFile(path, 'w', ZIP_DEFLATED) as z:
        for name, content in parts.items(): z.writestr(name, content)

def prepare(source, destination, kind):
    with ZipFile(source) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    doc = E.fromstring(parts['word/document.xml'])
    tables = find(doc, './w:body/w:tbl')
    assert len(tables) == 6
    def cell(t, r, c):
        return find(find(tables[t], './w:tr')[r], './w:tc')[c]
    for r,c,tag in [(0,1,'number'),(0,3,'date'),(1,1,'dueDate'),(1,3,'currency'),(2,1,'execution'),(2,3,'project')]:
        text(cell(1,r,c), '{'+tag+'}')
    for c, tags in [(0,['sellerName','sellerRegistry','sellerAddress','sellerEmail','sellerPhone']), (1,['customer','registrationCode','address','contact','customerContact'])]:
        ps=find(cell(2,0,c),'./w:p')
        for i,p in enumerate(ps[1:]):
            if i == 0: text(p,'{'+tags[i]+'}')
            else: tail(p,'{'+tags[i]+'}')
        if kind == 'invoice':
            # Contact person and email share the existing contact slot.
            tail(ps[-1], '{sellerEmail}' if c == 0 else '{invoiceContact}')
    rows=find(tables[3],'./w:tr')
    for row in rows[2:]: tables[3].remove(row)
    for c,tag in enumerate(['{#items}{index}','{description}','{quantity}','{unit}','{unitPrice}','{lineTotal}{/items}']):
        text(cell(3,1,c),tag)
    for r,tag in enumerate(['subtotal','vat','total']): text(cell(4,r,1),'{'+tag+'}')
    ps=find(cell(5,0,0),'./w:p')
    if kind == 'invoice':
        tail(ps[1],'{sellerName}')
        text(ps[2],'IBAN: {iban}    |    BIC/SWIFT: {bic}    |    Pank: {bank}')
        tail(ps[3],'{explanation}')
        tail(ps[4],'{referenceNumber}{invoiceTerms}')
    else:
        for p,tag in zip(ps[1:],['delivery','costs','payment','confirmation','changes','annexes']): tail(p,'{'+tag+'}')
    for p in find(doc,'./w:body/w:p'):
        if 'TÄITMISE ABI' in ''.join(p.itertext()): p.getparent().remove(p)
    add_reference_fields(doc, kind)
    parts['word/document.xml']=E.tostring(doc,xml_declaration=True,encoding='UTF-8',standalone=True)
    for name in parts:
        if name.startswith('word/footer') and name.endswith('.xml'):
            footer=E.fromstring(parts[name])
            for p in find(footer,'.//w:p'):
                content=''.join(n.text or '' for n in find(p,'.//w:t'))
                if 'Käibemaks' in content:
                    nodes = find(p, './/w:t')
                    if kind == 'quotation' and len(nodes) >= 2:
                        nodes[0].text = '{footerVat}'
                        nodes[1].text = '{footerBank}'
                        for n in nodes[2:]: n.text = ''
                    else: text(p,'{footerVat}')
                elif content: text(p,'{footerBank}')
            parts[name]=E.tostring(footer,xml_declaration=True,encoding='UTF-8',standalone=True)
    destination.parent.mkdir(parents=True,exist_ok=True)
    with ZipFile(destination,'w',ZIP_DEFLATED) as z:
        for name,content in parts.items(): z.writestr(name,content)

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('invoice',type=Path)
    p.add_argument('quotation',type=Path)
    args=p.parse_args()
    root=Path(__file__).resolve().parents[1]/'private/templates/documents/financial'
    for kind,source in [('invoice',args.invoice),('quotation',args.quotation)]:
        prepare(source,root/(kind+'.docx'),kind)
