import { clamp, hash, pointAt, random } from './math.mjs';
import { monthIndex, monthString } from './data.mjs';
import { buildScene as buildPreviousScene, DEFAULTS as PREVIOUS_DEFAULTS, PALETTES } from './scene-v2.mjs';
import { ribbonPoint, clinicRibbon, branchRibbon } from './ribbon.mjs';
import { applyTrailDetails } from './attractors.mjs';
export { PALETTES };
export const RENDERER_VERSION = '1.4.0';
export const DEFAULTS = Object.freeze({ ...PREVIOUS_DEFAULTS, detail: .65, attraction: .65, attractorRadius: .055, rendererVersion: RENDERER_VERSION });
export function buildScene(history, requested = {}) {
  if (requested.rendererVersion && !['1.3.0', RENDERER_VERSION].includes(requested.rendererVersion)) return buildPreviousScene(history, requested);
  const settings = { ...DEFAULTS, ...requested }, trajectories = [], events = [], clinics = new Map();
  const span = Math.max(1, history.stats.end - history.stats.start + 1), time = month => (monthIndex(month) - history.stats.start) / span;
  const cutoffMonth = Math.min(history.stats.end, history.stats.start + Math.floor(clamp(settings.through) * span));
  const cutoff = clamp((cutoffMonth - history.stats.start + 1) / span), palette = PALETTES[settings.palette] ?? PALETTES.vitl;
  let totalPoints = 0;
  const add = entry => { totalPoints += entry.points.length; trajectories.push(entry); return entry; };
  history.clinics.forEach((clinic, i) => {
    const lane = (i - (history.clinics.length - 1) / 2) * Math.min(.00065, .025 / history.clinics.length), joined = time(clinic.joined);
    if (monthIndex(clinic.joined) > cutoffMonth) return;
    const track = add({ id: clinic.id, kind: 'clinic', parentId: null, color: palette[i % 2], alpha: .18, width: .00030,
      ...clinicRibbon(joined * .70, cutoff * .70, lane), type: 'patient', month: clinic.joined });
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
    const origin = pointAt(clinic.track.points, parentFraction);
    const color = palette[submission.type === 'stock' ? 0 : hash(submission.clinicId) % 3 === 0 ? 2 : 1];
    const family = hash(`${submission.clinicId}/ribbon`) % 3 - 1;
    const band = family * .045 + (rng()-.5)*.085;
    const track = add({ id: submission.id, parentId: clinic.id, kind: 'submission', month: submission.month, type: submission.type,
      color, parentFraction, alpha: .07 + rng()*.12, width: .00012 + rng()*.00012,
      ...branchRibbon(clinic.track, parentFraction, (.26 + rng()*.48) * Math.min(1.2,settings.spread), band * settings.spread, .0015*settings.turbulence, (rng()-.5)*.035) });
    events.push({ id: submission.id, t, origin, anchor: pointAt(track.points, .68), clinicId: clinic.id, month: submission.month });
    submission.fulfillments.forEach((fulfillment, fi) => {
      const fr = random(`${settings.seed}/${submission.id}/fulfillment/${fi}`), fork = .5 + fr() * .36;
      const ph = hash(fulfillment.pharmacyId) % 11, id = `${submission.id}/f${fi}`;
      const ftrack = add({ id, parentId: track.id, kind: 'pharmacy', parentFraction: fork, type: submission.type, month: submission.month, color, alpha: .09 + fr() * .17, width: .00017,
        ...branchRibbon(track, fork, .07 + fr()*.17, (ph-5)*.0025*settings.spread, .0012*settings.turbulence, (fr()-.5)*.018) });
      fulfillment.recipients.forEach((recipient, ri) => {
        const rr = random(`${settings.seed}/${id}/r${ri}`), rfork = .3 + rr() * .55, rid = `${id}/r${ri}`;
        const rtrack = add({ id: rid, parentId: id, kind: submission.type === 'stock' ? 'stock' : 'recipient', parentFraction: rfork, type: submission.type, month: submission.month, color, alpha: .09 + rr() * .12, width: .00016,
          ...branchRibbon(ftrack, rfork, .025 + rr()*.095, (ri%2?-1:1)*(.003+rr()*.006)*settings.spread, .0006*settings.turbulence) });
        for (let mi = 0; mi < recipient.medicationCount; mi++) {
          const mr = random(`${settings.seed}/${rid}/m${mi}`), mfork = .3 + mr() * .6;
          add({ id: `${rid}/m${mi}`, parentId: rid, kind: 'medication', parentFraction: mfork, type: submission.type, month: submission.month, color, alpha: .10 + mr() * .14, width: .00015,
            ...branchRibbon(rtrack, mfork, .015+mr()*.045, (mi%2?-1:1)*(.002+mr()*.004)*settings.spread) });
        }
      });
    });
  }
  const attractors = settings.rendererVersion === RENDERER_VERSION ? applyTrailDetails(trajectories,settings) : [];
  if(settings.rendererVersion === RENDERER_VERSION){
    const lookup=new Map(trajectories.map(path=>[path.id,path]));
    for(const event of events){const path=lookup.get(event.id);event.origin=path.points[0];event.anchor=pointAt(path.points,.68);}
  }
  const milestones = history.milestones.filter(m => monthIndex(m.month) <= cutoffMonth).map((m, i) => ({ ...m, number: i + 1, t: time(m.month), anchor: i === 0 ? events.find(e => e.month === m.month)?.origin ?? ribbonPoint((time(m.month) + .3 / span)*.70,0) : events.find(e => e.month === m.month)?.anchor ?? ribbonPoint((time(m.month) + .3 / span)*.70,0) }));
  return { settings, history, trajectories, attractors, milestones, events, totalPoints, cutoff, cutoffMonth: monthString(cutoffMonth), stats: { ...history.stats, visibleClinics: trajectories.filter(t => t.kind === 'clinic').length, eligible: eligible.length, rendered: selected.length, sampled: selected.length < eligible.length, trajectories: trajectories.length } };
}
