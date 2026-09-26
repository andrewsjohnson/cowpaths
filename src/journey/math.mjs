export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export function hash(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function random(seed) {
  let a = hash(seed);
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pointAt(points, fraction) {
  const pos = clamp(fraction) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(pos)), t = pos - i;
  return points[i].map((v, k) => lerp(v, points[i + 1][k], t));
}
export function tangentAt(points, fraction) {
  const i = Math.min(points.length - 2, Math.floor(clamp(fraction) * (points.length - 1)));
  return Math.atan2(points[i + 1][1] - points[i][1], points[i + 1][0] - points[i][0]);
}

/** Local differential frame on the actual parent polyline, including depth. */
export function frameAt(points, fraction) {
  const index = Math.min(points.length - 2, Math.floor(clamp(fraction) * (points.length - 1)));
  const a = points[index], b = points[index + 1];
  const dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy);
  const heading = Math.atan2(dy, dx);
  const before = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 2)];
  const previous = index > 0 ? Math.atan2(a[1] - before[1], a[0] - before[0]) : heading;
  const next = index + 2 < points.length ? Math.atan2(after[1] - b[1], after[0] - b[0]) : heading;
  const angle = Math.atan2(Math.sin(next - previous), Math.cos(next - previous));
  const span = .5 * Math.hypot(a[0] - before[0], a[1] - before[1]) + distance + .5 * Math.hypot(after[0] - b[0], after[1] - b[1]);
  return { position: pointAt(points, fraction), heading, curvature: angle / Math.max(span, 1e-8), slope: (b[2] - a[2]) / Math.max(distance, 1e-8) };
}
