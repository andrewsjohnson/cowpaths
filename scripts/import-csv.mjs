import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { serializableHistory, validateHistory } from '../src/journey/data.mjs';
const HEADERS = ['submission_key', 'month', 'clinic_key', 'order_type', 'pharmacy_key', 'recipient_key', 'medication_count'];
export function parseCSV(source) {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  const value = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quoted) { if (c === '"') { if (value[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; }
    else if (c === '"' && field === '' && !closed) quoted = true;
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== ',') { if (row.some(x => x !== '')) rows.push(row); row = []; if (c === '\r' && value[i + 1] === '\n') i++; }
    } else { if (closed || c === '"') throw new Error('Malformed CSV quoting.'); field += c; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.'); row.push(field); if (row.some(x => x !== '')) rows.push(row); return rows;
}
export function convertCSV(source, title = 'Company history') {
  const rows = parseCSV(source); if (rows.length < 2) throw new Error('CSV must include a header and at least one data row.');
  const header = rows.shift();
  if (header.length !== HEADERS.length || new Set(header).size !== HEADERS.length || HEADERS.some(h => !header.includes(h))) throw new Error(`CSV headers must be exactly: ${HEADERS.join(',')}`);
  const records = rows.map((row, i) => {
    if (row.length !== header.length) throw new Error(`CSV row ${i + 2} has the wrong number of columns.`);
    const record = Object.fromEntries(header.map((h, j) => [h, row[j].trim()]));
    if (Object.values(record).some(v => !v || v.length > 200)) throw new Error(`CSV row ${i + 2} has an empty or oversized value.`);
    if (!/^[1-9]\d*$/.test(record.medication_count)) throw new Error(`CSV row ${i + 2} medication_count must be a positive integer.`);
    return record;
  });
  const alias = (field, prefix) => new Map([...new Set(records.map(r => r[field]))].sort().map((key, i) => [key, `${prefix}-${String(i + 1).padStart(5, '0')}`]));
  const cs = alias('clinic_key', 'clinic'), ps = alias('pharmacy_key', 'pharmacy'), ss = alias('submission_key', 'submission'), clinics = new Map(), submissions = new Map(), duplicates = new Set();
  for (const [i, row] of records.entries()) {
    const clinicId = cs.get(row.clinic_key), id = ss.get(row.submission_key), pharmacyId = ps.get(row.pharmacy_key), identity = JSON.stringify([id, pharmacyId, row.recipient_key]);
    if (duplicates.has(identity)) throw new Error(`CSV row ${i + 2} duplicates a submission/pharmacy/recipient row. Aggregate medication_count first.`);
    duplicates.add(identity);
    if (!clinics.has(clinicId) || clinics.get(clinicId).joined > row.month) clinics.set(clinicId, { id: clinicId, joined: row.month });
    if (!submissions.has(id)) submissions.set(id, { id, month: row.month, clinicId, type: row.order_type, fulfillments: new Map() });
    const submission = submissions.get(id);
    if (submission.month !== row.month || submission.clinicId !== clinicId || submission.type !== row.order_type) throw new Error(`CSV row ${i + 2} disagrees with another row for the same submission.`);
    if (!submission.fulfillments.has(pharmacyId)) submission.fulfillments.set(pharmacyId, { pharmacyId, recipients: [] });
    submission.fulfillments.get(pharmacyId).recipients.push({ medicationCount: Number(row.medication_count) });
  }
  return serializableHistory(validateHistory({ version: 1, title, synthetic: false, clinics: [...clinics.values()], pharmacies: [...ps.values()].map(id => ({ id })),
    submissions: [...submissions.values()].map(s => ({ ...s, fulfillments: [...s.fulfillments.values()].sort((a, b) => a.pharmacyId.localeCompare(b.pharmacyId)).map(f => ({ ...f, recipients: f.recipients.sort((a, b) => a.medicationCount - b.medicationCount) })) })), milestones: [] }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, title = 'Company history'] = process.argv.slice(2);
  if (!input || !output) { console.error('Usage: node scripts/import-csv.mjs input.csv output.local.json "Company name"'); process.exitCode = 1; }
  else { try { const history = convertCSV(await readFile(input, 'utf8'), title); await writeFile(output, JSON.stringify(history, null, 2) + '\n', { flag: 'wx' }); console.log(`Wrote ${history.submissions.length} submissions. Source identifiers and recipient keys were not retained. Existing output files are never overwritten.`); } catch (error) { console.error(error.message); process.exitCode = 1; } }
}
