import { demoHistory, monthString, serializableHistory } from './data.mjs';
import { buildScene, DEFAULTS } from './scene.mjs';
import { renderScene } from './render.mjs';
import { project, readProject, withPrintDensity } from './project.mjs';
const $ = id => document.getElementById(id);
let history = demoHistory(), settings = { ...DEFAULTS }, serial = 0, busy = false, queued = false, exporting = false, playing = false;
let timer, playbackTimer, worker, exportResolve, exportReject;
const canvas = $('art'), formatter = new Intl.NumberFormat('en-US'), controls = Object.keys(DEFAULTS);
const renderSize = Math.min(1800, Math.max(1000, Math.round($('art-mount').clientWidth * Math.min(window.devicePixelRatio || 1, 2))));
const errors = message => { $('error').textContent = message; $('error').hidden = !message; };
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const json = value => new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' });
function stopPlayback() { playing = false; clearTimeout(playbackTimer); $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play company history'); }
function syncControls() {
  for (const key of controls) {
    const input = $(key); if (!input) continue;
    if (input.type === 'checkbox') input.checked = settings[key];
    else { if (input.tagName === 'SELECT' && ![...input.options].some(o => o.value === String(settings[key]))) input.add(new Option(String(settings[key]), String(settings[key]))); input.value = settings[key]; }
    if ($(`${key}-value`)) $(`${key}-value`).textContent = Number(settings[key]).toFixed(2);
  }
  $('source-badge').textContent = history.synthetic ? 'SAMPLE' : 'IMPORTED';
  $('source-description').textContent = `${history.synthetic ? 'Imagined' : 'Imported'} ${history.title} history · ${monthString(history.stats.start)} to ${monthString(history.stats.end)}.`;
  $('preview-title').textContent = `${history.title.toUpperCase()} / ${history.synthetic ? 'CONCEPT STUDY' : 'HISTORY STUDY'}`; $('start-date').textContent = monthString(history.stats.start);
}
function finish(data) {
  busy = false; $('render-indicator').hidden = true;
  if (data.error) { errors(data.error); stopPlayback(); }
  else if (data.bitmap) { canvas.width = data.bitmap.width; canvas.height = data.bitmap.height; canvas.getContext('2d').drawImage(data.bitmap, 0, 0); data.bitmap.close(); updateStats(data); }
  else if (data.stats) updateStats(data);
  if (queued && !exporting) { queued = false; schedule(0); } else if (playing) playbackTimer = setTimeout(advance, 180);
}
function updateStats(data) {
  const s = data.stats;
  $('count-submissions').textContent = formatter.format(s.rendered); $('count-clinics').textContent = formatter.format(s.visibleClinics); $('count-pharmacies').textContent = formatter.format(s.pharmacies); $('count-tracks').textContent = formatter.format(s.trajectories);
  $('through-label').textContent = `${data.cutoffMonth}${settings.through === 1 ? ' · present' : ''}`;
  $('status').textContent = `${history.synthetic ? 'Synthetic demo. ' : ''}${s.sampled ? `${formatter.format(s.rendered)} of ${formatter.format(s.eligible)} submissions shown in a deterministic sample.` : `Every submission through ${data.cutoffMonth} is drawn.`} ${formatter.format(s.submissions)} submissions in the complete history. Reproducible seed: ${settings.seed}.${settings.rendererVersion === '1.0.0' ? ' Original flow retained. Reset style to try the updated flow.' : ''}`;
  canvas.setAttribute('aria-label', `${history.title} history through ${data.cutoffMonth}: ${s.rendered} of ${s.eligible} submissions, ${s.visibleClinics} clinic strands. ${history.synthetic ? 'Synthetic concept study.' : ''}`); canvas.dataset.ready = 'true';
}
try {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
    worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (exporting && data.id === serial) { if (data.error) exportReject(new Error(data.error)); else exportResolve(data.blob); }
      else if (data.id === serial) finish(data); else data.bitmap?.close();
    };
    worker.onerror = () => {
      worker.terminate(); worker = undefined;
      if (exporting) exportReject(new Error('The export exceeded the worker capability. Try a smaller resolution.')); else { busy = false; schedule(0); }
    };
  }
} catch { worker = undefined; }
function render() {
  if (busy || exporting) { queued = true; return; }
  busy = true; errors(''); $('render-indicator').hidden = false; canvas.dataset.ready = 'false'; const id = ++serial;
  if (worker) worker.postMessage({ id, history, settings, size: renderSize });
  else setTimeout(() => { try { const scene = buildScene(history, settings); renderScene(canvas, scene, { width: renderSize }); finish({ stats: scene.stats, cutoffMonth: scene.cutoffMonth }); } catch (error) { finish({ error: error.message }); } }, 25);
}
function schedule(delay = 120) { clearTimeout(timer); timer = setTimeout(render, delay); }
for (const key of controls) {
  const input = $(key); if (!input) continue;
  input.addEventListener(input.type === 'text' ? 'change' : 'input', () => {
    if (input.type === 'text' && !input.value.trim()) input.value = DEFAULTS.seed;
    settings[key] = input.type === 'checkbox' ? input.checked : ['seed', 'palette'].includes(key) ? input.value : Number(input.value);
    if ($(`${key}-value`)) $(`${key}-value`).textContent = Number(settings[key]).toFixed(2);
    if (key === 'through') stopPlayback(); schedule();
  });
}
$('reseed').addEventListener('click', () => { settings.seed = `study-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`; syncControls(); schedule(0); });
$('reset-style').addEventListener('click', () => { stopPlayback(); settings = { ...DEFAULTS }; syncControls(); schedule(0); });
$('reset-data').addEventListener('click', () => { stopPlayback(); history = demoHistory(); settings.through = 1; syncControls(); schedule(0); });
$('sample-json').addEventListener('click', () => download(json(serializableHistory(demoHistory())), 'cowpaths-synthetic-history.json'));
$('save-project').addEventListener('click', () => download(json(project(history, settings)), 'cowpaths-project.json'));
$('history-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return; stopPlayback();
  try {
    if (file.size > 16 * 1024 * 1024) throw new Error('History files must be smaller than 16 MB.');
    const loaded = readProject(JSON.parse(await file.text())); history = loaded.history; settings = loaded.settings; errors(''); syncControls(); schedule(0);
  } catch (error) { errors(error instanceof SyntaxError ? 'This is not valid JSON. Check the sample history or saved project format.' : error.message); }
  event.target.value = '';
});
$('view-art').addEventListener('click', () => { const active = document.body.classList.toggle('focus'); $('view-art').textContent = active ? 'Back to studio ↙' : 'Focus view ↗'; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') { document.body.classList.remove('focus'); $('view-art').textContent = 'Focus view ↗'; } });
function advance() { const span = history.stats.end - history.stats.start + 1; settings.through = Math.min(1, settings.through + 1 / span); $('through').value = settings.through; if (settings.through >= 1) stopPlayback(); schedule(0); }
$('play').addEventListener('click', () => { if (playing) { stopPlayback(); return; } playing = true; if (settings.through >= 1) settings.through = 0; $('play').textContent = 'Ⅱ'; $('play').setAttribute('aria-label', 'Pause company history'); $('through').value = settings.through; schedule(0); });
$('export').addEventListener('click', async () => {
  if (exporting) return; stopPlayback(); clearTimeout(timer);
  const size = Number($('export-size').value); exporting = true; busy = false; const id = ++serial, exportSettings = { ...settings }, exportHistory = history;
  $('export').disabled = true; $('export').textContent = 'Rendering print…'; errors('');
  try {
    let blob;
    if (worker) blob = await new Promise((resolve, reject) => { exportResolve = resolve; exportReject = reject; worker.postMessage({ id, history: exportHistory, settings: exportSettings, size, exporting: true }); });
    else {
      await new Promise(resolve => setTimeout(resolve, 25)); const output = document.createElement('canvas');
      renderScene(output, buildScene(exportHistory, exportSettings), { width: size });
      blob = await new Promise((resolve, reject) => output.toBlob(b => b ? resolve(b) : reject(new Error('This canvas size is not supported. Try a smaller export.')), 'image/png')); output.width = 1; output.height = 1;
    }
    download(await withPrintDensity(blob), `cowpaths-${exportHistory.synthetic ? 'synthetic-' : ''}${size}px.png`);
    $('status').textContent = `Exported ${size.toLocaleString('en-US')} × ${size.toLocaleString('en-US')} PNG at 300 dpi. Save the project to retain this history and composition.`;
  } catch (error) { errors(error.message); }
  finally { exporting = false; $('export').disabled = false; $('export').innerHTML = 'Export artwork <span aria-hidden="true">↓</span>'; $('render-indicator').hidden = true; if (queued) { queued = false; schedule(0); } }
});
syncControls(); schedule(0);
