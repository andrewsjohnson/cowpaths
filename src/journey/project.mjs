import { DEFAULTS, PALETTES } from './scene.mjs';
import { serializableHistory, validateHistory } from './data.mjs';
export function validateSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Project settings must be an object.');
  const settings = { ...DEFAULTS }, bounds = { glow: [0, 1.5], exposure: [.3, 1.8], focus: [-.2, .2], aperture: [0, 1.5], turbulence: [0, 1.5], spread: [.5, 1.5], maxSubmissions: [1, 20000], through: [0, 1] };
  for (const [key, val] of Object.entries(value)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new Error('Project settings contain an unsupported field.');
    if (Object.hasOwn(bounds, key)) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < bounds[key][0] || val > bounds[key][1]) throw new Error(`Project setting ${key} is outside the supported range.`);
      if (key === 'maxSubmissions' && !Number.isInteger(val)) throw new Error('Submission budget must be an integer.');
    } else if (key === 'seed') {
      if (typeof val !== 'string' || !val.trim() || val.length > 64) throw new Error('Composition seed must contain 1–64 characters.');
    } else if (key === 'palette') { if (!Object.hasOwn(PALETTES, val)) throw new Error('Unknown color story.'); }
    else if (typeof val !== 'boolean') throw new Error(`Project setting ${key} must be a boolean.`);
    settings[key] = val;
  }
  return settings;
}
export function project(history, settings) { return { format: 'cowpaths-project', version: 1, rendererVersion: '1.0.0', history: serializableHistory(history), settings: validateSettings(settings) }; }
export function readProject(value) {
  if (value?.format !== 'cowpaths-project') return { history: validateHistory(value), settings: { ...DEFAULTS } };
  if (value.version !== 1 || value.rendererVersion !== '1.0.0') throw new Error('Unsupported project or renderer version.');
  if (Object.keys(value).some(k => !['format', 'version', 'rendererVersion', 'history', 'settings'].includes(k))) throw new Error('Project contains unsupported fields.');
  return { history: validateHistory(value.history), settings: validateSettings(value.settings) };
}
// Replace the browser's density metadata with a valid PNG pHYs chunk.
export async function withPrintDensity(blob, dpi = 300) {
  const bytes = new Uint8Array(await blob.arrayBuffer()), signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((n, i) => bytes[i] === n)) throw new Error('The browser did not return a PNG.');
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
  const ppm = Math.round(dpi / .0254); view.setUint32(8, ppm); view.setUint32(12, ppm); chunk[16] = 1;
  let crc = 0xffffffff;
  for (const b of chunk.slice(4, 17)) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  const parts = [bytes.slice(0, 8)]; let offset = 8;
  while (offset < bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0), type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (type !== 'pHYs') parts.push(bytes.slice(offset, offset + length + 12));
    if (type === 'IHDR') parts.push(chunk);
    offset += length + 12;
  }
  return new Blob(parts, { type: 'image/png' });
}
