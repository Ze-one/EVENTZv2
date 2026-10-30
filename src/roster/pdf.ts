import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { pdfTextRows, validateTable, type PdfText } from './parsers.js';

GlobalWorkerOptions.workerSrc = workerUrl;
export async function parseRosterPdf(data: ArrayBuffer): Promise<string[][]> {
  const task = getDocument({ data: new Uint8Array(data) });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 50) throw new Error('Import a PDF with 50 pages or fewer.');
    const rows: string[][] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageRows = pdfTextRows(content.items.filter((item): item is PdfText & { hasEOL: boolean; dir: string; fontName: string } => 'str' in item));
      // Skip a repeated table header on later pages only when it matches the
      // first page exactly. Other lines remain visible for organizer review.
      rows.push(...pageRows.filter((row, index) => !(pageNumber > 1 && index === 0 && JSON.stringify(row) === JSON.stringify(rows[0]))));
      if (rows.length) validateTable(rows);
      page.cleanup();
    }
    if (!rows.length) throw new Error('This PDF has no selectable text. Export the original roster as CSV/Excel, or use OCR on a scanned PDF and upload the text result.');
    return validateTable(rows);
  } catch (error: any) {
    if (error.name === 'PasswordException') throw new Error('This PDF is password protected. Upload an unlocked copy.');
    throw error;
  } finally { await task.destroy(); }
}
