// Frozen geometry for saved renderer 1.0.0 projects. New studies use scene.mjs.
import { clamp, hash, lerp, pointAt, random, tangentAt, TAU } from './math.mjs';
import { monthIndex, monthString } from './data.mjs';
export const DEFAULTS = Object.freeze({ seed: 'VITL-2026', glow: .65, exposure: 1, focus: .06, aperture: .55, turbulence: .55, spread: 1, labels: true, poster: true, maxSubmissions: 1800, through: 1, palette: 'vitl' });
export const PALETTES = { vitl: ['#d5fff0', '#74ebc5', '#c3f666', '#f4f5c9'], glacial: ['#ddfaff', '#70caff', '#a9abea', '#f0efdd'], ember: ['#fff1d7', '#feb276', '#f37e63', '#d7d19d'] };
// Continuous asymmetric chronology with separate parallel clinic lanes.
export function spine(t, lane = 0) {
  const angle = 2.05 - 11.5 * t, radius = .008 + .145 * Math.pow(Math.max(0, t), .83), warp = 1 + .15 * Math.sin(t * 9 - .8);
  return [.408 + Math.cos(angle) * (radius * warp + lane), .565 + Math.sin(angle) * (radius * .87 + lane) - .065 * t * t, .025 * Math.sin(t * 8)];
}
function spineHeading(t, lane) {
  const a = spine(Math.max(0, t - .0001), lane), b = spine(t + .0001, lane);
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}
function trace(origin, heading, length, rng, curvature, settings, depth = 0, tipCurl = 0) {
  const points = [[...origin]], steps = Math.max(14, Math.ceil(length * 420)), ds = length / steps, phase = rng() * TAU, fine = rng() * TAU;
  let [x, y, z] = origin;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps, curl = curvature * Math.exp(-u * 3.1);
    const eddy = settings.turbulence * (3.5 * Math.sin(u * 8 + phase) + .8 * Math.sin(u * 18 + fine));
    heading += (curl + eddy + tipCurl * (1 - Math.exp(-u * 4))) * ds;
    x += Math.cos(heading) * ds; y += Math.sin(heading) * ds; z = origin[2] + depth * Math.sin(u * Math.PI * .65);
    points.push([x, y, z]);
  }
  return points;
}
// Art-directed flow corridors, not measured business categories. Nearby dates
// share a flow; independently seeded offsets preserve each actual submission.
function plumeTrace(origin, heading, t, rng, settings, depth, volume) {
  const corridors = [[.19, .80, 2.4, .12], [.15, .34, -.8, -.10], [.71, .84, .1, .13], [.88, .54, -.9, -.10], [.78, .19, -.45, .12]];
  const band = Math.min(4, Math.floor(t * 5)), [gx, gy, endAngle, curlRadius] = corridors[band];
  const local = (t * 5) % 1, jitter = (rng() - .5) * .07, reach = settings.spread;
  const target = [origin[0] + (gx - origin[0]) * reach + jitter, origin[1] + (gy - origin[1]) * reach + (rng() - .5) * .055];
  const tangent = endAngle + (local - .5) * .6 + (rng() - .5) * .28;
  const p1 = [origin[0] + Math.cos(heading) * .10, origin[1] + Math.sin(heading) * .10];
  const p2 = [target[0] - Math.cos(tangent) * .20 * reach, target[1] - Math.sin(tangent) * .20 * reach];
  const end = .40 + Math.pow(rng(), .65) * .93 + Math.min(.08, Math.log1p(volume) * .018), count = Math.ceil(end * 220), phase = rng() * 6.28, points = [];
  for (let i = 0; i <= count; i++) {
    const u = end * i / count; let x, y;
    if (u <= 1) {
      const v = 1 - u;
      x = v*v*v*origin[0] + 3*v*v*u*p1[0] + 3*v*u*u*p2[0] + u*u*u*target[0];
      y = v*v*v*origin[1] + 3*v*v*u*p1[1] + 3*v*u*u*p2[1] + u*u*u*target[1];
    } else {
      const angle = (u - 1) * .6 * reach / curlRadius;
      x = target[0] + curlRadius * (Math.sin(tangent + angle) - Math.sin(tangent));
      y = target[1] - curlRadius * (Math.cos(tangent + angle) - Math.cos(tangent));
    }
    const wobble = Math.sin(u * 11 + phase) * Math.sin(Math.min(1, u) * Math.PI) ** 2 * .004 * settings.turbulence;
    points.push([x + wobble, y - wobble * .6, origin[2] + depth * Math.sin(Math.min(1.4, u) * 1.5)]);
  }
  return points;
}
export function buildScene(history, requested = {}) {
  const settings = { ...DEFAULTS, ...requested }, trajectories = [], events = [], clinics = new Map();
  const span = Math.max(1, history.stats.end - history.stats.start + 1), time = month => (monthIndex(month) - history.stats.start) / span;
  const cutoffMonth = Math.min(history.stats.end, history.stats.start + Math.floor(clamp(settings.through) * span));
  const cutoff = clamp((cutoffMonth - history.stats.start + 1) / span), palette = PALETTES[settings.palette] ?? PALETTES.vitl;
  let totalPoints = 0;
  const add = entry => { totalPoints += entry.points.length; trajectories.push(entry); return entry; };
  history.clinics.forEach((clinic, i) => {
    const lane = (i - (history.clinics.length - 1) / 2) * Math.min(.00105, .038 / history.clinics.length), joined = time(clinic.joined);
    clinics.set(clinic.id, { ...clinic, lane, joined, index: i });
    if (monthIndex(clinic.joined) > cutoffMonth) return;
    const count = Math.max(2, Math.ceil((cutoff - joined) * 950));
    add({ id: clinic.id, kind: 'clinic', parentId: null, color: palette[i % 2], alpha: .4, width: .00048,
      points: Array.from({ length: count }, (_, n) => spine(lerp(joined, cutoff, n / (count - 1)), lane)), type: 'patient', month: clinic.joined });
  });
  const eligible = history.submissions.filter(s => monthIndex(s.month) <= cutoffMonth), limit = Math.max(1, Math.floor(settings.maxSubmissions));
  // Stable sample without replacement. Sparse inputs never gain invented paths.
  const selected = eligible.length > limit ? [...eligible].sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id)).slice(0, limit) : eligible;
  selected.sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  for (const submission of selected) {
    const rng = random(`${settings.seed}/${submission.id}`), clinic = clinics.get(submission.clinicId);
    const t = Math.min(cutoff, time(submission.month) + (.1 + rng() * .8) / span), origin = spine(t, clinic.lane), heading = spineHeading(t, clinic.lane);
    const volume = submission.fulfillments.reduce((sum, f) => sum + f.recipients.reduce((s, r) => s + r.medicationCount, 0), 0);
    const color = palette[submission.type === 'stock' ? 0 : hash(submission.clinicId) % 3 === 0 ? 2 : 1];
    const z = hash(submission.id) % 17 === 0 ? .5 + rng() * .45 : (rng() - .46) * .45, loose = hash(submission.id) % 5 === 0;
    const track = add({ id: submission.id, parentId: clinic.id, kind: 'submission', month: submission.month, type: submission.type,
      color, alpha: (loose ? .11 : .16) + rng() * .21, width: .00024 + rng() * .00026,
      points: loose ? trace(origin, heading, (.13 + rng() * .64) * settings.spread, rng, -6, settings, z, 12 + 10 * Math.sin(t * 16)) : plumeTrace(origin, heading, t, rng, settings, z, volume) });
    events.push({ id: submission.id, t, origin, anchor: pointAt(track.points, .68), clinicId: clinic.id, month: submission.month });
    submission.fulfillments.forEach((fulfillment, fi) => {
      const fr = random(`${settings.seed}/${submission.id}/fulfillment/${fi}`), fork = .5 + fr() * .36;
      const source = pointAt(track.points, fork), ph = hash(fulfillment.pharmacyId) % 11, id = `${submission.id}/f${fi}`;
      const ftrack = add({ id, parentId: track.id, kind: 'pharmacy', type: submission.type, month: submission.month, color, alpha: .19 + fr() * .25, width: .0003,
        points: trace(source, tangentAt(track.points, fork), (.035 + fr() * .15) * settings.spread, fr, (ph - 5) * 4, settings, (fr() - .5) * .1) });
      fulfillment.recipients.forEach((recipient, ri) => {
        const rr = random(`${settings.seed}/${id}/r${ri}`), rfork = .3 + rr() * .55, rid = `${id}/r${ri}`;
        const rtrack = add({ id: rid, parentId: id, kind: submission.type === 'stock' ? 'stock' : 'recipient', type: submission.type, month: submission.month, color, alpha: .18 + rr() * .14, width: .00028,
          points: trace(pointAt(ftrack.points, rfork), tangentAt(ftrack.points, rfork), (.018 + rr() * .07) * settings.spread, rr, (ri % 2 ? -1 : 1) * (12 + rr() * 16), settings, (rr() - .5) * .08) });
        for (let mi = 0; mi < recipient.medicationCount; mi++) {
          const mr = random(`${settings.seed}/${rid}/m${mi}`), mfork = .3 + mr() * .6;
          add({ id: `${rid}/m${mi}`, parentId: rid, kind: 'medication', type: submission.type, month: submission.month, color, alpha: .18 + mr() * .2, width: .00025,
            points: trace(pointAt(rtrack.points, mfork), tangentAt(rtrack.points, mfork), (.008 + mr() * .045) * settings.spread, mr, (mi % 2 ? -1 : 1) * (18 + mr() * 20), settings) });
        }
      });
    });
  }
  const milestones = history.milestones.filter(m => monthIndex(m.month) <= cutoffMonth).map((m, i) => ({ ...m, number: i + 1, t: time(m.month), anchor: i === 0 ? spine(time(m.month) + .3 / span) : events.find(e => e.month === m.month)?.anchor ?? spine(time(m.month) + .3 / span) }));
  return { settings, history, trajectories, milestones, events, totalPoints, cutoff, cutoffMonth: monthString(cutoffMonth), stats: { ...history.stats, visibleClinics: trajectories.filter(t => t.kind === 'clinic').length, eligible: eligible.length, rendered: selected.length, sampled: selected.length < eligible.length, trajectories: trajectories.length } };
}
