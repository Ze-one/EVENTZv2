import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Clipboard, FileSpreadsheet, FileText, ArrowLeft, ArrowRight, Download, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { detectMapping, looksLikeHeader, mapRoster, MAX_ROSTER_BYTES, MAX_ROSTER_ROWS, participantErrors, participantFields, fieldLimits, partitionDuplicates, rosterFields, type ColumnMapping, type RosterParticipant } from '../roster/model.js';
import { parseRosterText, parseRosterWorkbook, validateTable, type RosterSheet } from '../roster/parsers.js';
import './organizer.css';

export type RosterImportResult = { count: number; skipped: number };
interface Props {
  onConfirm: (participants: RosterParticipant[], duplicateMode: 'skip' | 'allow') => Promise<RosterImportResult>;
  onCancel: () => void;
  onDone: () => void;
  existingParticipants: RosterParticipant[];
}
const PAGE_SIZE = 25;
export default function UploadParticipants({ onConfirm, onCancel, onDone, existingParticipants }: Props) {
  const [mode, setMode] = useState<'file' | 'paste' | 'google'>('file');
  const [sheets, setSheets] = useState<RosterSheet[]>([]), [sheetIndex, setSheetIndex] = useState(0);
  const [sourceName, setSourceName] = useState(''), [text, setText] = useState('');
  const [firstRow, setFirstRow] = useState(0), [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>(detectMapping([]));
  const [defaultCategory, setDefaultCategory] = useState('Attendees');
  const [preview, setPreview] = useState<RosterParticipant[] | null>(null);
  const [page, setPage] = useState(0), [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false), [reading, setReading] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<RosterImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null), readVersion = useRef(0), saving = useRef(false);
  useEffect(() => () => { readVersion.current++; }, []);
  const table = sheets[sheetIndex]?.rows || [];
  const width = Math.max(0, ...table.map(row => row.length));
  const headers = Array.from({ length: Math.min(width, 100) }, (_, index) => hasHeader ? table[firstRow]?.[index] || `Column ${index + 1}` : `Column ${index + 1}`);
  const rows = preview || [];
  const duplicateCheck = useMemo(() => partitionDuplicates(rows, existingParticipants), [rows, existingParticipants]);
  const issues = useMemo(() => rows.map(participantErrors), [rows]);
  const invalid = issues.filter(row => row.length).length;
  const importCount = skipDuplicates ? duplicateCheck.unique.length : rows.length;
  const categoryOptions = [...new Set(['Attendees', 'VIP', 'Staff', 'Volunteers', ...existingParticipants.map(p => p.category).filter(Boolean)])];
  const lastPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
  const activePage = Math.min(page, lastPage);

  function configure(rows: string[][], start = 0, header = looksLikeHeader(rows[start] || [])) {
    setFirstRow(start); setHasHeader(header);
    const next = detectMapping(header ? rows[start] || [] : []);
    if (!header) next.fullName = 0;
    setMapping(next); setPreview(null); setResult(null); setPage(0);
  }
  async function readFile(file?: File) {
    if (!file || busy || reading) return;
    const version = ++readVersion.current;
    setError(''); setPreview(null); setResult(null); setSheets([]); setReading(true);
    try {
      if (file.size > MAX_ROSTER_BYTES) throw new Error('Choose a file smaller than 10 MB.');
      const extension = file.name.split('.').pop()?.toLowerCase();
      let next: RosterSheet[];
      if (['xlsx', 'xls', 'ods'].includes(extension || '')) next = await parseRosterWorkbook(await file.arrayBuffer());
      else if (extension === 'pdf') {
        const { parseRosterPdf } = await import('../roster/pdf.js');
        next = [{ name: 'PDF text', rows: await parseRosterPdf(await file.arrayBuffer()) }];
      } else if (['csv', 'tsv', 'txt'].includes(extension || '')) next = [{ name: 'Roster', rows: parseRosterText(await file.text()) }];
      else throw new Error('Choose CSV, Excel (.xlsx/.xls), ODS, TSV, TXT, or a PDF with selectable text.');
      if (version !== readVersion.current) return;
      setSheets(next); setSourceName(file.name);
      const index = Math.max(0, next.findIndex(sheet => sheet.rows.length));
      setSheetIndex(index); configure(next[index].rows);
      validateTable(next[index].rows);
    } catch (error: any) { if (version === readVersion.current) setError(error.message || 'Could not read this file. Try exporting it as CSV.'); }
    finally { if (version === readVersion.current) setReading(false); }
  }
  function readPaste() {
    setError(''); setResult(null); setPreview(null); setSheets([]);
    try {
      const rows = parseRosterText(text);
      setSheets([{ name: 'Pasted rows', rows }]); setSheetIndex(0); setSourceName('Pasted roster'); configure(rows);
    } catch (error: any) { setError(error.message); }
  }
  function buildPreview() {
    setError('');
    try {
      if (sheets[sheetIndex]?.truncated) throw new Error(`This worksheet exceeds the row limit. Export at most ${MAX_ROSTER_ROWS} participant rows and import again.`);
      validateTable(table);
      if (mapping.fullName < 0 && mapping.firstName < 0 && mapping.lastName < 0) throw new Error('Map a full-name column, or first and last name columns.');
      const dataRows = table.slice(firstRow + (hasHeader ? 1 : 0));
      const next = mapRoster(dataRows, mapping, defaultCategory);
      if (!next.length) throw new Error('No participant rows follow the selected header.');
      if (next.length > MAX_ROSTER_ROWS) throw new Error(`Import up to ${MAX_ROSTER_ROWS} people at a time.`);
      setPreview(next); setPage(0);
    } catch (error: any) { setError(error.message); }
  }
  async function confirm() {
    if (saving.current || invalid || !importCount) return;
    saving.current = true; setBusy(true); setError('');
    try { setResult(await onConfirm(rows, skipDuplicates ? 'skip' : 'allow')); }
    catch (error: any) { setError(error.message || 'Import failed. Your preview is still here; correct the issue and retry.'); }
    finally { saving.current = false; setBusy(false); }
  }
  function reset() {
    readVersion.current++; setReading(false); setSheets([]); setPreview(null); setResult(null); setError(''); setSourceName('');
    if (fileInput.current) fileInput.current.value = '';
  }
  const edit = (index: number, field: keyof RosterParticipant, value: string) => setPreview(previous => previous!.map((row, i) => i === index ? { ...row, [field]: value } : row));
  return <section className="roster-import" aria-busy={busy || reading}>
    <div className="organizer-heading"><div><span className="organizer-eyebrow">YOUR PEOPLE, YOUR EVENT</span><h2>Bring your roster.</h2><p>Import guests from your existing lists, review their details, and generate individual QR passes.</p></div><button className="organizer-secondary" disabled={busy} onClick={onCancel}>Back to dashboard</button></div>
    <ol className="roster-steps" aria-label="Import progress">{['Choose a source', 'Match columns', 'Review & import'].map((label, index) => <li key={label} aria-current={(preview ? 2 : sheets.length ? 1 : 0) === index ? 'step' : undefined}><b>{index + 1}</b>{label}</li>)}</ol>
    {error && <p role="alert" className="organizer-error"><AlertCircle size={18} />{error}</p>}
    {result ? <div className="organizer-card roster-success" role="status"><CheckCircle2 size={40} /><h3>{result.count} participants imported</h3><p>{result.count} individual passes generated. {result.skipped > 0 && `${result.skipped} duplicate rows were skipped.`} No emails were sent.</p><div className="organizer-actions"><button className="organizer-primary" onClick={onDone}>Manage passes <ArrowRight size={16} /></button><button className="organizer-secondary" onClick={reset}>Import another roster</button></div></div> : preview ? <>
      <div className="organizer-card roster-review-summary"><div><h3>Review {rows.length} participants</h3><p>{invalid} rows need attention · {duplicateCheck.duplicates.size} possible duplicates</p><small>Duplicates match an email, a name + phone, or a name + organization when no contact details are available. Review before excluding them.</small></div><label className="roster-check"><input type="checkbox" checked={skipDuplicates} disabled={busy} onChange={e => setSkipDuplicates(e.target.checked)} />Skip duplicate rows</label></div>
      <fieldset disabled={busy} className="roster-fieldset">
        <div className="roster-table-wrap"><table className="roster-table"><caption>Edit any cell before importing. Categories from your source are preserved.</caption><thead><tr><th>Row</th>{participantFields.map(field => <th key={field.key}>{field.label}</th>)}<th>Review</th><th>Remove</th></tr></thead><tbody>{rows.slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE).map((row, offset) => {
          const index = activePage * PAGE_SIZE + offset;
          return <tr key={index} className={issues[index].length ? 'roster-invalid' : ''}><td>{index + 1}</td>{participantFields.map(field => <td key={field.key}><input aria-label={`${field.label}, row ${index + 1}`} value={row[field.key]} maxLength={fieldLimits[field.key]} onChange={e => edit(index, field.key, e.target.value)} /></td>)}<td className="roster-issue">{issues[index].join(' ') || (duplicateCheck.duplicates.has(index) ? skipDuplicates ? 'Duplicate · will skip' : 'Duplicate · will import' : 'Ready')}</td><td><button aria-label={`Remove row ${index + 1}`} onClick={() => setPreview(previous => previous!.filter((_, i) => i !== index))}><Trash2 size={16} /></button></td></tr>;
        })}</tbody></table></div>
        <div className="organizer-actions roster-pagination"><button className="organizer-secondary" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous</button><span>Page {activePage + 1} of {lastPage + 1}</span><button className="organizer-secondary" disabled={activePage === lastPage} onClick={() => setPage(activePage + 1)}>Next</button>{invalid > 0 && <button className="organizer-secondary" onClick={() => setPage(Math.floor(issues.findIndex(row => row.length) / PAGE_SIZE))}>Show first error</button>}</div>
      </fieldset>
      <div className="organizer-actions"><button className="organizer-secondary" disabled={busy} onClick={() => { setPreview(null); setError(''); }}><ArrowLeft size={16} />Change mapping</button><button className="organizer-primary" disabled={busy || invalid > 0 || !importCount} onClick={confirm}>{busy ? 'Importing…' : `Import ${importCount} & generate passes`}<ArrowRight size={16} /></button></div>
      <p className="roster-note">Imports add people to this event only. Existing passes and check-ins are preserved. You can send or print passes afterwards from Manage passes.</p>
    </> : sheets.length ? <div className="organizer-card">
      <div className="organizer-heading"><div><h3>Match your columns</h3><p>{sourceName}</p></div><button className="organizer-secondary" onClick={reset}>Choose another source</button></div>
      <div className="roster-mapping-controls">
        {sheets.length > 1 && <label>Worksheet<select aria-label="Worksheet" value={sheetIndex} onChange={e => { const index = Number(e.target.value); setSheetIndex(index); configure(sheets[index].rows); setError(''); }} >{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.name}</option>)}</select></label>}
        <label>Start at row<input aria-label="Start at row" type="number" min={1} max={Math.max(1, table.length)} value={firstRow + 1} onChange={e => configure(table, Math.max(0, Math.min(table.length - 1, Number(e.target.value) - 1)), hasHeader)} /></label>
        <label className="roster-check"><input type="checkbox" checked={hasHeader} onChange={e => configure(table, firstRow, e.target.checked)} />This row contains column names</label>
        <label>Default category<input aria-label="Default category" list="roster-categories" value={defaultCategory} maxLength={100} onChange={e => setDefaultCategory(e.target.value)} /><datalist id="roster-categories">{categoryOptions.map(category => <option key={category} value={category} />)}</datalist><small>Used only when the source category is blank.</small></label>
      </div>
      <div className="roster-mapping">{rosterFields.map(field => <label key={field.key}>{field.label}<select aria-label={`Map ${field.label}`} value={mapping[field.key]} onChange={e => setMapping(previous => ({ ...previous, [field.key]: Number(e.target.value) }))}><option value={-1}>Not mapped</option>{headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header}</option>)}</select></label>)}</div>
      <p className="roster-note">Map Full name, or combine First name and Last name. Ignore timestamps and unrelated form questions. For PDFs with a title, adjust the starting row to the table header.</p>
      <div className="roster-table-wrap"><table className="roster-table"><caption>Source preview · first 5 rows after your selected header</caption><thead><tr>{headers.map((header, index) => <th key={index}>{header}</th>)}</tr></thead><tbody>{table.slice(firstRow + (hasHeader ? 1 : 0), firstRow + (hasHeader ? 1 : 0) + 5).map((row, index) => <tr key={index}>{headers.map((_, column) => <td key={column}>{row[column] || '—'}</td>)}</tr>)}</tbody></table></div>
      <button className="organizer-primary" onClick={buildPreview}>Preview roster <ArrowRight size={16} /></button>
    </div> : <div className="organizer-card">
      <div className="roster-source-tabs" role="group" aria-label="Roster source">{([{ id: 'file', label: 'Upload a file', Icon: Upload }, { id: 'paste', label: 'Paste rows', Icon: Clipboard }, { id: 'google', label: 'Google Forms / Sheets', Icon: FileSpreadsheet }] as const).map(({ id, label, Icon }) => <button key={id} aria-pressed={mode === id} disabled={reading} onClick={() => { setMode(id); setError(''); }}><Icon size={18} />{label}</button>)}</div>
      {mode === 'google' && <div className="roster-source-help"><h3>Bring your form responses into EVENTZ</h3><ol><li>In Google Forms, open Responses and download the responses as CSV.</li><li>Or open the linked Google Sheet and choose File → Download → CSV or Microsoft Excel.</li><li>Upload the export below. You can also paste copied cells using Paste rows.</li></ol><p>Import a new export whenever you need to add responses. Duplicate checks help you avoid issuing another pass to the same person.</p></div>}
      {mode === 'paste' ? <div className="roster-paste"><label htmlFor="roster-text">Paste rows from a spreadsheet, form export, or text list</label><textarea id="roster-text" rows={9} value={text} onChange={e => setText(e.target.value)} placeholder={'Full name\tEmail\tPhone\tOrganization\tCategory\nAda Example\tada@example.com\t+237600000000\tCommunity\tVIP'} /><p className="roster-note">One name per line also works. Commas, semicolons, tabs, and | separators are supported.</p><button className="organizer-primary" disabled={!text.trim()} onClick={readPaste}>Read pasted rows <ArrowRight size={16} /></button></div> : <div className="roster-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void readFile(e.dataTransfer.files[0]); }}>
        <FileText size={36} /><h3>{reading ? 'Reading your roster…' : 'Drop your roster here'}</h3><p>CSV, Excel, ODS, TSV, TXT, or PDF · up to 10 MB and {MAX_ROSTER_ROWS.toLocaleString()} people per import</p><button className="organizer-primary" disabled={reading} onClick={() => fileInput.current?.click()}>Choose file</button><input aria-label="Upload roster file" type="file" ref={fileInput} hidden accept=".csv,.xlsx,.xls,.ods,.tsv,.txt,.pdf" onChange={e => void readFile(e.target.files?.[0])} /><p className="roster-note">Choose a file from your device or a connected drive. PDF text must be selectable; scanned pages need an OCR/text export first.</p>
      </div>}
      <a className="roster-template" download="eventz-roster-template.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent('Full name,Email,Phone,Organization,Category\r\nAda Example,ada@example.com,+237600000000,Community,VIP\r\n')}><Download size={16} />Download CSV template</a>
    </div>}
  </section>;
}
