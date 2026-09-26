import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateHistory, serializableHistory, demoHistory } from '../src/journey/data.mjs';
import { buildScene, DEFAULTS, spine } from '../src/journey/scene.mjs';
import { project, readProject, validateSettings, withPrintDensity } from '../src/journey/project.mjs';
import { frameAt, pointAt } from '../src/journey/math.mjs';
import { buildScene as buildLegacyScene } from '../src/journey/scene-v1.mjs';
import { convertCSV, parseCSV } from '../scripts/import-csv.mjs';
const fixture = JSON.parse(await readFile(new URL('../examples/history-small.json', import.meta.url)));
const clone = value => structuredClone(value), tiny = () => validateHistory(clone(fixture));
test('hierarchy counts match submissions, pharmacies, recipients and medication leaves', () => {
  const history = tiny(), scene = buildScene(history), count = kind => scene.trajectories.filter(t => t.kind === kind).length;
  assert.equal(count('clinic'), 2); assert.equal(count('submission'), 3); assert.equal(count('pharmacy'), 4); assert.equal(count('recipient'), 4); assert.equal(count('stock'), 1); assert.equal(count('medication'), 12);
  assert.equal(scene.trajectories.length, 26); assert.equal(history.stats.medications, 12);
});
test('all branch levels start on their parent and leave in its forward direction', () => {
  for (const history of [tiny(), demoHistory()]) {
    const scene = buildScene(history), parents = new Map(scene.trajectories.map(t => [t.id, t]));
    for (const track of scene.trajectories) {
      for (const p of track.points) assert.ok(p.every(Number.isFinite));
      if (track.kind === 'clinic') continue;
      const parent = parents.get(track.parentId); assert.ok(parent);
      const frame = frameAt(parent.points, track.parentFraction), [a, b] = track.points;
      assert.deepEqual(a, pointAt(parent.points, track.parentFraction), `${track.id} detached from parent`);
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]) - frame.heading;
      assert.ok(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 1e-9, `${track.id} has an angular fork`);
    }
  }
});
test('inner and outer clinic lanes expand without folding across the origin', () => {
  for (const lane of [-.019, 0, .019]) {
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const p = spine(i / 1000, lane), radius = Math.hypot(p[0] - .408, (p[1] - .59) / 1.2);
      assert.ok(radius > 0 && radius >= previous - 1e-12); previous = radius;
    }
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
test('old projects retain original geometry and new projects use the revised renderer', () => {
  const history = tiny(), oldSettings = { ...DEFAULTS }; delete oldSettings.rendererVersion;
  const saved = { format: 'cowpaths-project', version: 1, rendererVersion: '1.0.0', history: serializableHistory(history), settings: oldSettings };
  const loaded = readProject(saved);
  assert.equal(loaded.settings.rendererVersion, '1.0.0');
  assert.deepEqual(buildScene(loaded.history, loaded.settings).trajectories, buildLegacyScene(history, oldSettings).trajectories);
  assert.equal(project(loaded.history, loaded.settings).rendererVersion, '1.0.0');
  assert.equal(project(history, DEFAULTS).rendererVersion, '1.1.0');
  assert.equal(readProject(serializableHistory(history)).settings.rendererVersion, '1.1.0');
  assert.throws(() => readProject({ ...saved, rendererVersion: '9.0.0' }), /Unsupported/);
  assert.throws(() => readProject({ ...saved, settings: DEFAULTS }), /disagree/);
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
