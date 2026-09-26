import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateHistory, serializableHistory, demoHistory } from '../src/journey/data.mjs';
import { buildScene, DEFAULTS } from '../src/journey/scene.mjs';
import { project, readProject, validateSettings, withPrintDensity } from '../src/journey/project.mjs';
import { convertCSV, parseCSV } from '../scripts/import-csv.mjs';
const fixture = JSON.parse(await readFile(new URL('../examples/history-small.json', import.meta.url)));
const clone = value => structuredClone(value), tiny = () => validateHistory(clone(fixture));
test('hierarchy counts match submissions, pharmacies, recipients and medication leaves', () => {
  const history = tiny(), scene = buildScene(history), count = kind => scene.trajectories.filter(t => t.kind === kind).length;
  assert.equal(count('clinic'), 2); assert.equal(count('submission'), 3); assert.equal(count('pharmacy'), 4); assert.equal(count('recipient'), 4); assert.equal(count('stock'), 1); assert.equal(count('medication'), 12);
  assert.equal(scene.trajectories.length, 26); assert.equal(history.stats.medications, 12);
});
test('each branch starts on its parent and positions remain finite', () => {
  const scene = buildScene(tiny()), parents = new Map(scene.trajectories.map(t => [t.id, t]));
  for (const track of scene.trajectories) {
    for (const p of track.points) assert.ok(p.every(Number.isFinite));
    if (track.kind === 'clinic' || track.kind === 'submission') continue;
    const parent = parents.get(track.parentId); assert.ok(parent); const p = track.points[0];
    const distances = parent.points.slice(1).map((b, i) => {
      const a = parent.points[i], d = b.map((v, k) => v - a[k]), norm = d.reduce((s, v) => s + v*v, 0);
      const u = Math.max(0, Math.min(1, d.reduce((s, v, k) => s + v * (p[k] - a[k]), 0) / norm));
      return Math.hypot(...p.map((v, k) => v - a[k] - d[k] * u));
    });
    assert.ok(Math.min(...distances) < 1e-10, `${track.id} detached from parent`);
  }
});
test('input reordering preserves geometry; seeds change geometry without changing topology', () => {
  const a = buildScene(tiny()), reversed = clone(fixture); reversed.submissions.reverse(); reversed.clinics.reverse(); reversed.pharmacies.reverse();
  assert.deepEqual(buildScene(validateHistory(reversed)).trajectories, a.trajectories);
  const b = buildScene(tiny(), { seed: 'another-study' }); assert.notDeepEqual(a.trajectories, b.trajectories);
  assert.deepEqual(a.trajectories.map(t => [t.id, t.parentId]), b.trajectories.map(t => [t.id, t.parentId]));
});
test('cutoff excludes future clinics, submissions and milestones', () => {
  const early = buildScene(tiny(), { through: 0 }); assert.equal(early.stats.visibleClinics, 1); assert.equal(early.stats.rendered, 1); assert.equal(early.milestones.length, 1); assert.equal(early.cutoffMonth, '2022-01');
  assert.ok(early.trajectories.every(t => t.month === '2022-01'));
  assert.equal(buildScene(tiny(), { through: 4 / 15 }).stats.visibleClinics, 1, 'June clinic must not appear in May');
  assert.equal(buildScene(tiny(), { through: 1 }).stats.rendered, 3);
});
test('sampling is explicit and deterministic without invented submissions', () => {
  const history = demoHistory(), a = buildScene(history, { maxSubmissions: 10 });
  assert.equal(history.stats.submissions, 947); assert.equal(a.stats.rendered, 10); assert.equal(a.stats.eligible, history.submissions.length); assert.equal(a.stats.sampled, true);
  const original = new Set(history.submissions.map(s => s.id)); assert.ok(a.events.every(e => original.has(e.id))); assert.deepEqual(a.events, buildScene(history, { maxSubmissions: 10 }).events);
});
test('one additional medication adds exactly one leaf', () => {
  const changed = clone(fixture); changed.submissions[1].fulfillments[0].recipients[0].medicationCount++;
  const a = buildScene(tiny()), b = buildScene(validateHistory(changed));
  assert.equal(b.stats.rendered, a.stats.rendered); assert.equal(b.trajectories.length, a.trajectories.length + 1); assert.equal(b.stats.recipients, a.stats.recipients);
});
test('rejects invalid dates, references, ids, extra fields and stock hierarchy', () => {
  const mutations = [d => d.submissions[0].month = '2022-13', d => d.submissions[0].month = '2021-12', d => d.submissions[0].clinicId = 'missing', d => d.submissions[0].fulfillments[0].pharmacyId = 'missing', d => d.submissions[1].id = d.submissions[0].id, d => d.submissions[0].patientName = 'not-allowed', d => d.submissions[0].fulfillments[0].recipients[0].medicationCount = 1.5, d => d.submissions[2].fulfillments[0].recipients.push({ medicationCount: 1 }), d => d.milestones[0].month = '2028-01', d => d.clinics[1].joined = '2030-01', d => d.submissions[0] = null];
  for (const mutate of mutations) { const data = clone(fixture); mutate(data); assert.throws(() => validateHistory(data)); }
});
test('project round trip retains history, settings and synthetic provenance', () => {
  const history = tiny(), settings = { ...DEFAULTS, seed: 'test', palette: 'ember', glow: 0 }, loaded = readProject(JSON.parse(JSON.stringify(project(history, settings))));
  assert.deepEqual(loaded.history, history); assert.deepEqual(loaded.settings, settings); assert.equal(loaded.history.synthetic, true); assert.equal(serializableHistory(history).stats, undefined);
  assert.throws(() => validateSettings({ exposure: NaN })); assert.throws(() => validateSettings({ maxSubmissions: 1.2 })); assert.throws(() => validateSettings(JSON.parse('{"__proto__":true}')));
});
test('CSV adapter preserves hierarchy, discards source keys and handles quoted fields', async () => {
  const csv = await readFile(new URL('../examples/history-rows.csv', import.meta.url), 'utf8'), result = convertCSV(csv, 'Test'), encoded = JSON.stringify(result);
  assert.equal(result.submissions.length, 3); assert.equal(validateHistory(result).stats.medications, 12); assert.ok(!encoded.includes('example-')); assert.ok(!encoded.includes('recipient_key'));
  const rows = csv.trim().split('\n'); assert.deepEqual(convertCSV([rows[0], ...rows.slice(1).reverse()].join('\n'), 'Test'), result);
  assert.throws(() => convertCSV(csv + csv.split('\n')[1] + '\n'), /duplicates/); assert.deepEqual(parseCSV('a,b\r\n"x,y","a""b"\r\n'), [['a', 'b'], ['x,y', 'a"b']]);
});
test('PNG export writes exactly one 300dpi density chunk', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6MZsAAAAASUVORK5CYII=', 'base64');
  const result = Buffer.from(await (await withPrintDensity(await withPrintDensity(new Blob([png])))).arrayBuffer());
  assert.equal(result.toString('latin1').split('pHYs').length - 1, 1); const pos = result.indexOf('pHYs'); assert.equal(result.readUInt32BE(pos + 4), 11811); assert.equal(result.readUInt32BE(pos + 8), 11811); assert.equal(result[pos + 12], 1);
});
