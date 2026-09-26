import { random } from './math.mjs';
const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
function object(value, path, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  if (Object.keys(value).some(k => !keys.includes(k))) fail(path, 'contains unsupported fields; use only the documented art schema');
}
function list(value, path, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `expected ${min}–${max} items`);
}
function key(value, path) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) fail(path, 'use an art-only key of 1–64 letters, digits, hyphens or underscores');
}
export function monthIndex(value, path = 'month') {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) fail(path, 'expected YYYY-MM');
  const [year, month] = value.split('-').map(Number);
  if (year < 1900 || year > 2200) fail(path, 'year must be 1900–2200');
  return year * 12 + month - 1;
}
export function monthString(index) { return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`; }
function label(value, path, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) fail(path, `expected a short public label (1–${max} characters)`);
}
function unique(items, path) {
  const keys = new Set();
  items.forEach((item, i) => {
    if (!item || typeof item !== 'object') fail(`${path}[${i}]`, 'expected an object');
    key(item.id, `${path}[${i}].id`);
    if (keys.has(item.id)) fail(path, 'duplicate art key');
    keys.add(item.id);
  });
  return keys;
}
/** Strictly allowlisted input; recipient identities are never needed. */
export function validateHistory(input) {
  object(input, 'history', ['version', 'title', 'subtitle', 'synthetic', 'clinics', 'pharmacies', 'submissions', 'milestones']);
  if (input.version !== 1) fail('version', 'expected 1');
  label(input.title, 'title', 48);
  if (input.subtitle !== undefined) label(input.subtitle, 'subtitle', 100);
  if (input.synthetic !== undefined && typeof input.synthetic !== 'boolean') fail('synthetic', 'expected a boolean');
  list(input.clinics, 'clinics', 1, 500); list(input.pharmacies, 'pharmacies', 1, 100);
  list(input.submissions, 'submissions', 1, 20000); list(input.milestones ?? [], 'milestones', 0, 12);
  input.clinics.forEach((c, i) => { object(c, `clinics[${i}]`, ['id', 'joined']); monthIndex(c.joined, `clinics[${i}].joined`); });
  input.pharmacies.forEach((p, i) => object(p, `pharmacies[${i}]`, ['id']));
  const clinicKeys = unique(input.clinics, 'clinics'), pharmacyKeys = unique(input.pharmacies, 'pharmacies');
  unique(input.submissions, 'submissions');
  const joined = new Map(input.clinics.map(c => [c.id, monthIndex(c.joined)]));
  let leaves = 0, recipients = 0, fulfillments = 0;
  input.submissions.forEach((s, i) => {
    const path = `submissions[${i}]`;
    object(s, path, ['id', 'month', 'clinicId', 'type', 'fulfillments']);
    const month = monthIndex(s.month, `${path}.month`);
    if (!clinicKeys.has(s.clinicId)) fail(`${path}.clinicId`, 'unknown clinic art key');
    if (month < joined.get(s.clinicId)) fail(`${path}.month`, 'precedes clinic joining');
    if (!['patient', 'stock'].includes(s.type)) fail(`${path}.type`, 'expected patient or stock');
    list(s.fulfillments, `${path}.fulfillments`, 1, 20);
    s.fulfillments.forEach((f, j) => {
      const p = `${path}.fulfillments[${j}]`;
      object(f, p, ['pharmacyId', 'recipients']);
      if (!pharmacyKeys.has(f.pharmacyId)) fail(`${p}.pharmacyId`, 'unknown pharmacy art key');
      list(f.recipients, `${p}.recipients`, 1, s.type === 'stock' ? 1 : 100);
      f.recipients.forEach((r, k) => {
        object(r, `${p}.recipients[${k}]`, ['medicationCount']);
        if (!Number.isInteger(r.medicationCount) || r.medicationCount < 1 || r.medicationCount > 50) fail(`${p}.recipients[${k}].medicationCount`, 'expected an integer from 1 to 50');
        leaves += r.medicationCount;
      });
      fulfillments++; recipients += f.recipients.length;
      if (leaves > 120000) fail('submissions', 'exceeds the 120,000 medication-leaf budget');
    });
  });
  const submissions = [...input.submissions].sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  const start = Math.min(...input.clinics.map(c => monthIndex(c.joined)), monthIndex(submissions[0].month));
  const end = monthIndex(submissions.at(-1).month);
  if (input.clinics.some(c => monthIndex(c.joined) > end)) fail('clinics', 'joining month lies after the last submission');
  (input.milestones ?? []).forEach((m, i) => {
    object(m, `milestones[${i}]`, ['month', 'label']);
    const value = monthIndex(m.month, `milestones[${i}].month`);
    if (value < start || value > end) fail(`milestones[${i}].month`, 'outside the history range');
    label(m.label, `milestones[${i}].label`, 48);
  });
  return { version: 1, title: input.title, subtitle: input.subtitle ?? 'A more accessible tomorrow', synthetic: input.synthetic === true,
    clinics: [...input.clinics].sort((a, b) => a.id.localeCompare(b.id)), pharmacies: [...input.pharmacies].sort((a, b) => a.id.localeCompare(b.id)), submissions,
    milestones: [...(input.milestones ?? [])].sort((a, b) => a.month.localeCompare(b.month)),
    stats: { start, end, submissions: submissions.length, clinics: input.clinics.length, pharmacies: input.pharmacies.length, fulfillments, recipients, medications: leaves } };
}
export function serializableHistory(history) { const { stats, ...data } = history; return data; }
export function demoHistory() {
  const rng = random('vitl-synthetic-history-1'), start = monthIndex('2022-01');
  const clinics = Array.from({ length: 28 }, (_, i) => ({ id: `clinic-${String(i + 1).padStart(2, '0')}`, joined: monthString(start + Math.floor(Math.pow(i / 28, .68) * 48)) }));
  const pharmacies = Array.from({ length: 4 }, (_, i) => ({ id: `pharmacy-${i + 1}` }));
  const submissions = [];
  for (let m = 0; m < 57; m++) {
    const month = monthString(start + m), active = clinics.filter(c => c.joined <= month);
    const count = Math.round(2 + Math.pow(m / 56, 1.6) * 30 + rng() * 6);
    for (let i = 0; i < count; i++) {
      const type = rng() < .24 ? 'stock' : 'patient', n = rng() < .16 ? 2 : 1;
      submissions.push({ id: `submission-${String(submissions.length + 1).padStart(5, '0')}`, month, clinicId: active[Math.floor(rng() * active.length)].id, type,
        fulfillments: Array.from({ length: n }, (_, k) => ({ pharmacyId: pharmacies[(Math.floor(rng() * (m < 18 ? 1 : m < 34 ? 2 : 4)) + k) % pharmacies.length].id,
          recipients: Array.from({ length: type === 'stock' ? 1 : rng() < .19 ? 2 + Math.floor(rng() * 3) : 1 }, () => ({ medicationCount: 1 + Math.floor(rng() * 3) })) })) });
    }
  }
  return validateHistory({ version: 1, title: 'VITL', subtitle: 'A more accessible tomorrow', synthetic: true, clinics, pharmacies, submissions,
    milestones: [{ month: '2022-01', label: 'First order' }, { month: '2022-11', label: 'Early clinics' }, { month: '2023-07', label: 'Pharmacy partnership' }, { month: '2024-05', label: 'Product expansion' }, { month: '2025-01', label: 'A growing community' }, { month: '2025-09', label: 'New possibilities' }, { month: '2026-09', label: 'Today' }] });
}
