import { clamp, hash, pointAt, random } from './math.mjs';
import { monthString } from './data.mjs';
const rgba = (hex, alpha) => `${hex}${Math.round(clamp(alpha) * 255).toString(16).padStart(2, '0')}`;
function sprite(ctx, x, y, radius, color, alpha, halo = false) {
  if (radius < .08 || alpha < .002) return;
  if (halo) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, rgba(color, alpha)); g.addColorStop(.16, rgba(color, alpha * .72)); g.addColorStop(.46, rgba(color, alpha * .13)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
  } else ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}
function drawPath(ctx, path, scale, yscale, color, alpha, width) {
  ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = width * scale; ctx.beginPath();
  path.points.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0] * scale, p[1] * yscale); else ctx.lineTo(p[0] * scale, p[1] * yscale); }); ctx.stroke();
}
/** Rebuild the same composition at any square output resolution. */
export function renderScene(canvas, scene, options = {}) {
  const width = options.width ?? canvas.width;
  canvas.width = width; canvas.height = width;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('A 2D canvas is not available in this browser.');
  const { settings, history } = scene, S = width, Y = S * (settings.poster ? .84 : 1), toPoint = p => [p[0] * S, p[1] * Y];
  ctx.fillStyle = '#041511'; ctx.fillRect(0, 0, S, S);
  const atmosphere = ctx.createRadialGradient(S * .5, Y * .49, 0, S * .5, Y * .49, S * .7);
  atmosphere.addColorStop(0, '#0c2921'); atmosphere.addColorStop(.45, '#071c17'); atmosphere.addColorStop(1, '#020e0c');
  ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, S, S);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, S, Y); ctx.clip();
  ctx.globalCompositeOperation = 'screen'; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  const dust = random(`${settings.seed}/atmosphere`);
  for (let i = 0; i < 2200; i++) {
    const x = dust() * S, y = dust() * Y;
    sprite(ctx, x, y, (.00012 + dust() * .00036) * S, '#94cbbb', .035 + dust() * .08);
  }
  // Stylized depth, not a physical lens simulation. Core geometry survives
  // with bloom disabled. Point lights are texture, not additional orders.
  const paths = [...scene.trajectories].sort((a, b) => b.points.at(-1)[2] - a.points.at(-1)[2] || a.id.localeCompare(b.id));
  for (const path of paths) {
    const [x, y] = path.points.at(-1); if (x < -1 || x > 2 || y < -1 || y > 2) continue;
    const alpha = path.alpha * settings.exposure;
    // Ribbon folds move through focus along their length. Older projects keep
    // their original endpoint-based softness for faithful reproduction.
    const sections = ['1.3.0','1.4.0'].includes(settings.rendererVersion) ? Array.from({length:Math.ceil((path.points.length-1)/24)},(_,i)=>({points:path.points.slice(i*24,Math.min(path.points.length,i*24+25))})) : [path];
    let dashDistance=0;
    for (const section of sections) {
      const z = section.points[Math.floor(section.points.length/2)][2], blur = Math.max(0, Math.abs((['1.3.0','1.4.0'].includes(settings.rendererVersion) ? z : path.points.at(-1)[2]) - settings.focus) - .06) * settings.aperture;
      if (settings.glow > 0) {
        drawPath(ctx, section, S, Y, path.color, alpha * .055 * settings.glow, path.width * 12 + blur * .012);
        drawPath(ctx, section, S, Y, path.color, alpha * .11 * settings.glow, path.width * 4 + blur * .008);
      }
      ctx.setLineDash(path.type === 'stock' && path.kind !== 'clinic' ? [.0019 * S, .0025 * S] : []);
      ctx.lineDashOffset=-dashDistance;
      drawPath(ctx, section, S, Y, path.color, alpha / (1 + blur * 18), path.width + blur * .004); ctx.setLineDash([]); ctx.lineDashOffset=0;
      for(let i=1;i<section.points.length;i++) dashDistance+=Math.hypot((section.points[i][0]-section.points[i-1][0])*S,(section.points[i][1]-section.points[i-1][1])*Y);
    }
    const rng = random(`${settings.seed}/${path.id}/light`), count = path.kind === 'clinic' ? 90 : path.kind === 'submission' ? 22 : 3;
    for (let i = 0; i < count; i++) {
      const p = pointAt(path.points, rng()), [px, py] = toPoint(p), coc = Math.max(0, Math.abs(p[2] - settings.focus) - .06) * settings.aperture, rare = rng();
      const radius = (.00025 + Math.pow(rare, 7) * .0012 + coc * .012) * S, brightness = (.18 + Math.pow(rare, 4) * .75) * settings.exposure / (1 + coc * 10);
      if (rare > .97 && settings.glow > 0) sprite(ctx, px, py, Math.max(radius * 6, S * .0035) * settings.glow, path.color, brightness * .55, true);
      sprite(ctx, px, py, radius, path.color, brightness, coc > .02);
    }
    if (path.kind === 'submission' && hash(path.id) % 21 === 0) {
      const [px, py] = toPoint(pointAt(path.points, .8));
      if (settings.glow > 0) sprite(ctx, px, py, S * .009 * settings.glow, path.color, .62 * settings.exposure, true);
      sprite(ctx, px, py, S * .0011, path.color, .9);
    }
  }
  if (scene.events.length) {
    const origin = toPoint(settings.rendererVersion === '1.0.0' ? [.408, .565] : scene.events[0].origin);
    if (settings.glow > 0) sprite(ctx, ...origin, S * .022 * settings.glow, '#dfffd7', .62, true);
    sprite(ctx, ...origin, S * .0015, '#f1ffe5', .95);
  }
  ctx.globalCompositeOperation = 'source-over';
  const vignette = ctx.createRadialGradient(S * .5, Y * .5, S * .26, S * .5, Y * .5, S * .7);
  vignette.addColorStop(0, '#020f0c00'); vignette.addColorStop(1, '#020f0c9a'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, S, Y); ctx.restore();
  if (settings.labels) drawLabels(ctx, scene, S, Y);
  if (settings.poster) drawPoster(ctx, scene, S, Y);
  if (!settings.poster && (history.synthetic || scene.stats.sampled)) {
    const provenance = [history.synthetic ? 'SYNTHETIC HISTORY · CONCEPT STUDY' : '', scene.stats.sampled ? `${scene.stats.rendered.toLocaleString('en-US')} OF ${scene.stats.eligible.toLocaleString('en-US')} SUBMISSIONS SHOWN` : ''].filter(Boolean).join(' · ');
    font(ctx, S, .007); ctx.fillStyle = '#9ebcb0'; ctx.fillText(provenance, S * .035, S * .967);
  }
  return canvas;
}
function font(ctx, S, size, weight = 400) { ctx.font = `${weight} ${S * size}px Arial, sans-serif`; }
function tracking(ctx, text, x, y, space) { for (const c of text) { ctx.fillText(c, x, y); x += ctx.measureText(c).width + space; } }
function wrap(ctx, value, x, y, maxWidth, lineHeight, maxLines = 5) {
  let line = '', count = 0;
  for (const word of value.split(/\s+/)) {
    if (line && ctx.measureText(`${line} ${word}`).width > maxWidth) {
      ctx.fillText(line, x, y); y += lineHeight; line = word; count++; if (count >= maxLines - 1) break;
    } else line += (line ? ' ' : '') + word;
  }
  ctx.fillText(line, x, y); return y + lineHeight;
}
function drawLabels(ctx, scene, S, Y) {
  const used = [];
  for (const milestone of scene.milestones) {
    const [ax, ay] = milestone.anchor, left = ax < .45;
    let x = clamp(ax + (left ? -.10 : .07), .055, .78), y = clamp(ay + (ay > .55 ? .09 : -.10), .18, .93);
    if (['1.3.0','1.4.0'].includes(scene.settings.rendererVersion)) {
      const candidates=[];
      for(const radius of [.055,.09,.14,.20,.27]) for(let i=0;i<16;i++) {
        const angle=i*Math.PI/8, cx=clamp(ax+Math.cos(angle)*radius,.055,.78),cy=clamp(ay+Math.sin(angle)*radius,.18,.93);
        const overlaps=used.filter(p=>Math.abs(cx-p.x)<.20 && Math.abs(cy-p.y)<.065).length;
        candidates.push({x:cx,y:cy,cost:overlaps*10+Math.hypot(cx-ax,cy-ay)+(cx<ax?.012:0)});
      }
      const best=candidates.sort((a,b)=>a.cost-b.cost)[0]; x=best.x; y=best.y;
    } else {
      for (let n = 0; n < 14 && used.some(p => Math.abs(x - p.x) < .20 && Math.abs(y - p.y) < .075); n++) { y += .078; if (y > .93) { y = .18; x = clamp(x + .21, .055, .78); } }
    }
    used.push({ x, y }); const px = x * S, py = y * Y;
    ctx.strokeStyle = '#afd7ba99'; ctx.lineWidth = S * .0006; ctx.beginPath(); ctx.moveTo(ax * S, ay * Y); ctx.lineTo(px, py); ctx.stroke();
    sprite(ctx, ax * S, ay * Y, S * .0018, '#d5fdd0', .95);
    ctx.fillStyle = '#071b16ed'; ctx.strokeStyle = '#b7f1ad'; ctx.lineWidth = S * .001; ctx.beginPath(); ctx.arc(px, py, S * .0087, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    font(ctx, S, .010); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e0f8e7'; ctx.fillText(String(milestone.number), px, py + S * .0003);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; font(ctx, S, .0083, 500); ctx.shadowColor = '#03110e'; ctx.shadowBlur = S * .005;
    wrap(ctx, milestone.label.toUpperCase(), px + S * .017, py - S * .001, S * .16, S * .012, 3);
    font(ctx, S, .0065); ctx.fillStyle = '#a6bbaf'; ctx.fillText(milestone.month, px + S * .017, py + S * .031); ctx.shadowBlur = 0;
  }
}
function drawPoster(ctx, scene, S, Y) {
  const { history } = scene;
  ctx.fillStyle = '#dceddf'; font(ctx, S, .028); tracking(ctx, history.title.toUpperCase(), S * .035, S * .061, S * .003);
  font(ctx, S, .0076); tracking(ctx, history.subtitle.toUpperCase(), S * .036, S * .08, S * .0012);
  ctx.fillStyle = '#afc7bc'; font(ctx, S, .0065); tracking(ctx, 'CLINICS. PHARMACIES.', S * .036, S * .117, S * .001); tracking(ctx, 'A HEALTHIER TOMORROW.', S * .036, S * .129, S * .001);
  ctx.fillStyle = '#061713'; ctx.fillRect(0, Y, S, S - Y);
  ctx.fillStyle = '#cfe5d8'; font(ctx, S, .008, 500); tracking(ctx, 'OUR JOURNEY', S * .035, S * .865, S * .002); tracking(ctx, 'HOW TO READ', S * .365, S * .865, S * .0016);
  ctx.fillStyle = '#adc6ba'; font(ctx, S, .008);
  wrap(ctx, 'From a single order to a growing community. A living portrait of the connections that make care possible.', S * .035, S * .885, S * .26, S * .012);
  wrap(ctx, ['1.3.0','1.4.0'].includes(scene.settings.rendererVersion) ? 'History follows the folded stream. Every clinic keeps its own continuous strand.' : 'Time spirals from the center outward. Every clinic follows its own continuous strand.', S * .365, S * .885, S * .245, S * .012);
  wrap(ctx, 'Submissions branch into pharmacies, recipients and medications. Light gathers where activity grows.', S * .67, S * .885, S * .28, S * .012);
  ctx.strokeStyle = '#a4d7c4'; ctx.lineWidth = S * .0007; ctx.beginPath(); ctx.moveTo(S * .365, S * .925); ctx.lineTo(S * .394, S * .925); ctx.stroke();
  font(ctx, S, .0068); ctx.fillText('PATIENT', S * .403, S * .928);
  ctx.setLineDash([S * .002, S * .003]); ctx.beginPath(); ctx.moveTo(S * .492, S * .925); ctx.lineTo(S * .521, S * .925); ctx.stroke(); ctx.setLineDash([]); ctx.fillText('CLINIC STOCK', S * .53, S * .928);
  const startYear = Math.floor(history.stats.start / 12), endYear = Number(scene.cutoffMonth.slice(0, 4)), years = Math.max(1, endYear - startYear);
  ctx.strokeStyle = '#749b88'; ctx.lineWidth = S * .00055; ctx.beginPath(); ctx.moveTo(S * .035, S * .955); ctx.lineTo(S * .855, S * .955); ctx.stroke();
  for (let i = 0; i <= years; i += Math.max(1, Math.ceil(years / 8))) {
    const x = S * (.044 + .8 * i / years); sprite(ctx, x, S * .955, S * .0023, '#baebba', 1);
    font(ctx, S, .0068); ctx.fillStyle = '#d2e6d9'; ctx.fillText(String(Math.min(startYear + i, endYear)), x - S * .008, S * .973);
  }
  font(ctx, S, .0058); ctx.fillStyle = '#a2bcae'; ctx.fillText(history.synthetic ? 'SYNTHETIC HISTORY · CONCEPT STUDY' : `${monthString(history.stats.start)} — ${scene.cutoffMonth}`, S * .035, S * .991);
  if (scene.stats.sampled) ctx.fillText(`${scene.stats.rendered.toLocaleString('en-US')} OF ${scene.stats.eligible.toLocaleString('en-US')} SUBMISSIONS SHOWN`, S * .37, S * .991);
  font(ctx, S, .006); tracking(ctx, 'BUILT FOR', S * .893, S * .957, S * .001); tracking(ctx, 'WHAT’S NEXT.', S * .893, S * .969, S * .0008);
}
