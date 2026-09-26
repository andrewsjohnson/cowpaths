import { clamp, hash, lerp, pointAt, random, frameAt } from './math.mjs';
import { monthIndex, monthString } from './data.mjs';
import { buildScene as buildLegacyScene } from './scene-v1.mjs';
export const RENDERER_VERSION = '1.2.0';
export const DEFAULTS = Object.freeze({ seed: 'VITL-2026', glow: .65, exposure: 1, focus: .06, aperture: .55, turbulence: .55, spread: 1, labels: true, poster: true, maxSubmissions: 1800, through: 1, palette: 'vitl', rendererVersion: RENDERER_VERSION });
export const PALETTES = { vitl: ['#d5fff0', '#74ebc5', '#c3f666', '#f4f5c9'], glacial: ['#ddfaff', '#70caff', '#a9abea', '#f0efdd'], ember: ['#fff1d7', '#feb276', '#f37e63', '#d7d19d'] };
const smooth = x => { const u = clamp(x); return u * u * (3 - 2 * u); };
// A small chronological curl gradually unwinds into the upper-right stream.
// Scaling lane radii keeps every lane positive, including dense clinic inputs.
export function spine(t, lane = 0) {
  const angle = 6.55 - 7.4 * (1 - Math.exp(-3.4 * t));
  const radius = (.008 + .27 * t * t) * (1 + lane * 3);
  return [.408 + Math.cos(angle) * radius, .59 + Math.sin(angle) * radius * 1.2, .025 * Math.sin(t * 8)];
}
// Integrate the inherited heading and curvature. Unlike a destination Bezier,
// this cannot turn back merely to hit a composition target. Curvature eases
// from the parent to a gently curling free trajectory over a finite distance.
export function traceBranch(frame, length, rng, settings, targetCurvature, depth = 0, main = false, motion = null) {
  const points = [[...frame.position]], steps = Math.max(18, Math.ceil(length / .00125)), ds = length / steps;
  const blend = Math.min(length * .38, main ? .018 + rng() * .014 : .023);
  const phase = rng() * Math.PI * 2, depthBlend = Math.min(.04, length * .35);
  const naturalHeading = frame.heading + frame.curvature * blend * .5;
  const focusTurn = main ? .20 * Math.sin(naturalHeading * 4 + .4) : 0;
  let [x, y, z] = frame.position;
  for (let i = 1; i <= steps; i++) {
    const distance = (i - 1) * ds, u = clamp(distance / blend);
    const inherited = distance < blend ? distance - blend * (u*u*u - .5*u*u*u*u) : blend * .5;
    const free = distance - inherited;
    const tip = main ? Math.max(0, distance - (motion?.onset ?? .16)) : free;
    const heading = frame.heading + frame.curvature * inherited
      + targetCurvature * (main ? tip * smooth(tip / (motion ? .10 : .16)) : free)
      + focusTurn * smooth(distance / .15)
      + (motion ? motion.sweep * smooth(distance / motion.release) + motion.wave * Math.sin(distance * 13) * smooth(distance / .09) : 0)
      + settings.turbulence * .045 * Math.sin(distance * 16 + phase) * smooth(distance / .06);
    x += Math.cos(heading) * ds; y += Math.sin(heading) * ds;
    const s = i * ds, v = clamp(s / depthBlend);
    const inheritedDepth = s < depthBlend ? s - depthBlend * (v*v*v - .5*v*v*v*v) : depthBlend * .5;
    z = frame.position[2] + frame.slope * inheritedDepth + depth * smooth(s / length);
    points.push([x, y, z]);
  }
  return points;
}
export function buildScene(history, requested = {}) {
  if (requested.rendererVersion === '1.0.0') return buildLegacyScene(history, requested);
  const settings = { ...DEFAULTS, ...requested }, trajectories = [], events = [], clinics = new Map();
  const span = Math.max(1, history.stats.end - history.stats.start + 1), time = month => (monthIndex(month) - history.stats.start) / span;
  const cutoffMonth = Math.min(history.stats.end, history.stats.start + Math.floor(clamp(settings.through) * span));
  const cutoff = clamp((cutoffMonth - history.stats.start + 1) / span), palette = PALETTES[settings.palette] ?? PALETTES.vitl;
  let totalPoints = 0;
  const add = entry => { totalPoints += entry.points.length; trajectories.push(entry); return entry; };
  history.clinics.forEach((clinic, i) => {
    const lane = (i - (history.clinics.length - 1) / 2) * Math.min(.00105, .038 / history.clinics.length), joined = time(clinic.joined);
    if (monthIndex(clinic.joined) > cutoffMonth) return;
    const count = Math.max(2, Math.ceil((cutoff - joined) * 950));
    const track = add({ id: clinic.id, kind: 'clinic', parentId: null, color: palette[i % 2], alpha: .18, width: .00030,
      points: Array.from({ length: count }, (_, n) => spine(lerp(joined, cutoff, n / (count - 1)), lane)), type: 'patient', month: clinic.joined });
    clinics.set(clinic.id, { ...clinic, lane, joined, index: i, track });
  });
  const eligible = history.submissions.filter(s => monthIndex(s.month) <= cutoffMonth), limit = Math.max(1, Math.floor(settings.maxSubmissions));
  // Stable sample without replacement. Sparse inputs never gain invented paths.
  const selected = eligible.length > limit ? [...eligible].sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id)).slice(0, limit) : eligible;
  selected.sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  for (const submission of selected) {
    const rng = random(`${settings.seed}/${submission.id}`), clinic = clinics.get(submission.clinicId);
    const t = Math.min(cutoff, time(submission.month) + (.1 + rng() * .8) / span);
    const parentFraction = clamp((t - clinic.joined) / Math.max(1e-8, cutoff - clinic.joined));
    const frame = frameAt(clinic.track.points, parentFraction), origin = frame.position;
    const volume = submission.fulfillments.reduce((sum, f) => sum + f.recipients.reduce((s, r) => s + r.medicationCount, 0), 0);
    const color = palette[submission.type === 'stock' ? 0 : hash(submission.clinicId) % 3 === 0 ? 2 : 1];
    const z = hash(submission.id) % 17 === 0 ? .5 + rng() * .45 : (rng() - .46) * .45, loose = hash(submission.id) % 5 === 0;
    // Separate seeded flow groups add opposing sweeps without destination targets.
    // Preserve RNG consumption and geometry for saved 1.1 studies.
    const lively = settings.rendererVersion === '1.2.0';
    const flow = random(`${settings.seed}/${submission.id}/flow`), family = hash(submission.clinicId) % 3 - 1;
    const motion = lively ? { sweep: family * 1.3 + .42 * Math.sin(t * 10 + .6), release: .10 + flow() * .045, onset: .055 + flow() * .10, wave: (flow() - .5) * .35 } : null;
    const reach = lively ? .55 + Math.pow(flow(), .7) * 1.1 : 1;
    const curl = lively ? (loose ? -6 : family * 4 + 2) + 1.5 * Math.sin(t * 10) : (loose ? -7 : 4.5) + 4 * Math.sin(t * 10);
    const track = add({ id: submission.id, parentId: clinic.id, kind: 'submission', month: submission.month, type: submission.type,
      color, parentFraction, alpha: ((loose ? .11 : .16) + rng() * .21) * (lively ? .85 : 1), width: .00024 + rng() * .00026,
      points: traceBranch(frame, (.13 + Math.pow(rng(), 1.05) * (.54 - .20 * t) + Math.log1p(volume) * .016) * settings.spread * reach, rng, settings, curl, lively ? z * 1.5 : z, true, motion) });
    events.push({ id: submission.id, t, origin, anchor: pointAt(track.points, .68), clinicId: clinic.id, month: submission.month });
    submission.fulfillments.forEach((fulfillment, fi) => {
      const fr = random(`${settings.seed}/${submission.id}/fulfillment/${fi}`), fork = .5 + fr() * .36;
      const ph = hash(fulfillment.pharmacyId) % 11, id = `${submission.id}/f${fi}`;
      const ftrack = add({ id, parentId: track.id, kind: 'pharmacy', parentFraction: fork, type: submission.type, month: submission.month, color, alpha: .19 + fr() * .25, width: .0003,
        points: traceBranch(frameAt(track.points, fork), (.035 + fr() * .15) * settings.spread, fr, settings, (ph - 5) * 4, (fr() - .5) * .1) });
      fulfillment.recipients.forEach((recipient, ri) => {
        const rr = random(`${settings.seed}/${id}/r${ri}`), rfork = .3 + rr() * .55, rid = `${id}/r${ri}`;
        const rtrack = add({ id: rid, parentId: id, kind: submission.type === 'stock' ? 'stock' : 'recipient', parentFraction: rfork, type: submission.type, month: submission.month, color, alpha: .18 + rr() * .14, width: .00028,
          points: traceBranch(frameAt(ftrack.points, rfork), (.018 + rr() * .07) * settings.spread, rr, settings, (ri % 2 ? -1 : 1) * (12 + rr() * 16), (rr() - .5) * .08) });
        for (let mi = 0; mi < recipient.medicationCount; mi++) {
          const mr = random(`${settings.seed}/${rid}/m${mi}`), mfork = .3 + mr() * .6;
          add({ id: `${rid}/m${mi}`, parentId: rid, kind: 'medication', parentFraction: mfork, type: submission.type, month: submission.month, color, alpha: .18 + mr() * .2, width: .00025,
            points: traceBranch(frameAt(rtrack.points, mfork), (.008 + mr() * .045) * settings.spread, mr, settings, (mi % 2 ? -1 : 1) * (18 + mr() * 20)) });
        }
      });
    });
  }
  const milestones = history.milestones.filter(m => monthIndex(m.month) <= cutoffMonth).map((m, i) => ({ ...m, number: i + 1, t: time(m.month), anchor: i === 0 ? events.find(e => e.month === m.month)?.origin ?? spine(time(m.month) + .3 / span) : events.find(e => e.month === m.month)?.anchor ?? spine(time(m.month) + .3 / span) }));
  return { settings, history, trajectories, milestones, events, totalPoints, cutoff, cutoffMonth: monthString(cutoffMonth), stats: { ...history.stats, visibleClinics: trajectories.filter(t => t.kind === 'clinic').length, eligible: eligible.length, rendered: selected.length, sampled: selected.length < eligible.length, trajectories: trajectories.length } };
}
