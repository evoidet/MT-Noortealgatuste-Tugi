import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { invoiceFields, invoiceInfoRows, invoiceItemColumns, invoiceLabels, invoiceTotalRows } from './invoice-layout.js';

const assets = fileURLToPath(new URL('../private/templates/documents/financial/', import.meta.url));
const green = '#0e3b03';
const pale = '#f7faf0';
const border = '#b9c9ad';
const muted = '#55707a';
const left = 43;
const width = 514;
const top = 38;
const bottom = 774;

export function generateInvoicePdf(record) {
  return new Promise((resolve, reject) => {
    const fields = invoiceFields(record);
    const pdf = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
    const chunks = [];
    pdf.on('data', chunk => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.registerFont('body', assets + 'DejaVuSans.ttf');
    pdf.registerFont('bold', assets + 'DejaVuSans-Bold.ttf');
    const cell = (text, style = {}) => ({ text, ...style });
    const font = ({ bold = false, color, size }) =>
      pdf.font(bold ? 'bold' : 'body').fontSize(size || 9.5).fillColor(color || '#1f2a1f');
    const height = (part, w) => {
      font(part);
      return pdf.heightOfString(part.text || ' ', { width: w, lineGap: part.lineGap });
    };
    let y = top;
    const newPage = () => {
      pdf.addPage();
      y = top;
    };
    const gap = () => { y += 16; };

    // A row can contain multiple styled paragraphs per cell. Split oversized
    // rows in sync across columns, repeating the item header on continuation.
    const padding = 6;
    const rowHeight = (columns, cells, { minHeight = 23, verticalPadding = padding } = {}) => 2 * verticalPadding + Math.max(
      minHeight - 2 * verticalPadding, ...cells.map((parts, i) => parts.reduce((sum, part) => sum + height(part, columns[i] - 2 * padding), 0)),
    );
    /**
     * @param {{ fills?: string[], stroke?: string, rulesOnly?: boolean, vertical?: string,
     *   topRule?: string, minHeight?: number, verticalPadding?: number }} [options]
     */
    function draw(columns, cells, options = {}) {
      const { fills = [], stroke = border, rulesOnly = false, vertical = '', topRule = '' } = options;
      const h = rowHeight(columns, cells, options);
      let x = left;
      cells.forEach((parts, i) => {
        pdf.lineWidth(0.5).rect(x, y, columns[i], h);
        if (rulesOnly) {
          pdf.fill(fills[i] || '#ffffff');
          pdf.moveTo(x, y + h).lineTo(x + columns[i], y + h).stroke(stroke);
        } else {
          pdf.fillAndStroke(fills[i] || '#ffffff', stroke);
        }
        if (vertical) pdf.moveTo(x, y).lineTo(x, y + h).stroke(vertical);
        const textHeight = parts.reduce((sum, part) => sum + height(part, columns[i] - 2 * padding), 0);
        let lineY = y + (h - textHeight) / 2;
        for (const part of parts) {
          const inner = columns[i] - 2 * padding;
          font(part).text(part.text, x + padding, lineY, { width: inner, align: part.align || 'left', oblique: part.italic, lineGap: part.lineGap });
          lineY += height(part, inner);
        }
        x += columns[i];
      });
      if (vertical) pdf.moveTo(x, y).lineTo(x, y + h).stroke(vertical);
      if (topRule) pdf.lineWidth(1).moveTo(left, y).lineTo(x, y).stroke(topRule);
      y += h;
    }
    function split(parts, w, space) {
      const first = [];
      for (const [i, part] of parts.entries()) {
        const h = height(part, w);
        if (h <= space) {
          first.push(part);
          space -= h;
          continue;
        }
        const chars = Array.from(part.text);
        let low = 0;
        let high = chars.length;
        while (low < high) {
          const mid = Math.ceil((low + high) / 2);
          if (height({ ...part, text: chars.slice(0, mid).join('') }, w) <= space) low = mid;
          else high = mid - 1;
        }
        if (low) first.push({ ...part, text: chars.slice(0, low).join('').trimEnd() });
        return [first, [{ ...part, text: chars.slice(low).join('').trimStart() }, ...parts.slice(i + 1)]];
      }
      return [first, []];
    }
    /**
     * @param {{ fills?: string[], stroke?: string, rulesOnly?: boolean, vertical?: string,
     *   topRule?: string, minHeight?: number, verticalPadding?: number, repeat?: () => void, reserve?: number }} [options]
     */
    function row(columns, cells, options = {}) {
      const { repeat = undefined, reserve = 0, verticalPadding = padding } = options;
      if (y + Math.min(rowHeight(columns, cells, options), bottom - top - reserve) > bottom) {
        newPage();
        repeat?.();
      }
      while (rowHeight(columns, cells, options) > bottom - y) {
        const parts = cells.map((content, i) => split(content, columns[i] - 2 * padding, bottom - y - 2 * verticalPadding));
        draw(columns, parts.map(([first]) => first), options);
        cells = parts.map(([, rest]) => rest);
        newPage();
        repeat?.();
      }
      draw(columns, cells, options);
    }

    pdf.image(assets + 'logo.png', left + 1, y + 13, { fit: [227, 92] });
    font({ bold: true, size: 25, color: green }).text('ARVE', left, y + 42, { width: width - 6, align: 'right' });
    y += 125;
    for (const [i, keys] of invoiceInfoRows.entries()) {
      row([92, 165, 103, 154], keys.flatMap(key => [
        [cell(invoiceLabels[key], { bold: true, color: green, size: i < 2 ? 9 : 8.5 })], [cell(fields[key], { color: key === 'currency' ? undefined : muted, italic: key !== 'currency', size: 9 })],
      ]), { fills: [pale, '#fff', pale, '#fff'], vertical: '#1f2a1f', topRule: i === 0 ? '#1f2a1f' : '', minHeight: i < 2 ? 23 : 33 });
    }

    gap();
    row([width / 2, width / 2], [
      [cell('MÜÜJA', { bold: true, color: green }), cell(fields.sellerName, { bold: true, size: 11 }), cell(fields.sellerDetails, { size: 9, lineGap: 1 })],
      [cell('OSTJA', { bold: true, color: green }), cell(fields.customer, { bold: true, size: 11, color: muted, italic: true }), cell(fields.buyerDetails, { size: 9, lineGap: 1 })],
    ], { fills: [pale, '#fff'], topRule: green, minHeight: 94 });

    gap();
    const widths = [32, 225, 58, 47, 76, 76];
    const headings = invoiceItemColumns.map(key => [cell(invoiceLabels[key], {
      bold: true, color: '#ffffff', size: 8.5, align: 'center',
    })]);
    const headerHeight = rowHeight(widths, headings);
    const tableHeader = () => draw(widths, headings, { fills: widths.map(() => green) });
    const itemRows = fields.items.map(item => invoiceItemColumns.map((key, i) =>
      [cell(item[key], { size: 8.8, italic: [1, 4, 5].includes(i), color: [1, 4, 5].includes(i) ? muted : undefined, align: ['center', 'left', 'right', 'left', 'right', 'right'][i] })]));
    const itemStyle = { verticalPadding: 4.5, repeat: tableHeader, reserve: headerHeight };
    if (y + headerHeight + Math.min(rowHeight(widths, itemRows[0], itemStyle), bottom - top - headerHeight) > bottom) newPage();
    tableHeader();
    for (const cells of itemRows) row(widths, cells, itemStyle);

    gap();
    const totalRows = invoiceTotalRows.map(key => {
      const final = key === 'total';
      const style = { bold: true, align: 'right', color: final ? '#ffffff' : green };
      return [[cell(invoiceLabels[key], style)], [cell(fields[key], { ...style, bold: key !== 'vat', italic: key !== 'vat', color: final ? '#ffffff' : key === 'vat' ? undefined : muted })]];
    });
    const totalWidths = [width - 93, 93];
    if (y + totalRows.reduce((sum, cells) => sum + rowHeight(totalWidths, cells), 0) > bottom) newPage();
    for (const [i, cells] of totalRows.entries()) {
      row(totalWidths, cells, { fills: i === 2 ? [green, green] : [], stroke: i === 2 ? green : border, rulesOnly: true });
    }
    gap();
    row([width], [[
      cell('MAKSEANDMED', { bold: true, color: green }),
      ...[fields.recipientLine, fields.bankLine, fields.explanationLine, fields.paymentDetails].map(text => cell(text, { size: 9 })),
    ]], { fills: ['#e9f1cb'], stroke: green });

    const { count } = pdf.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      pdf.switchToPage(i);
      font({ size: 8, color: '#526455' }).text(fields.footerVat, left, 795, { width, align: 'center' });
    }
    pdf.end();
  });
}
