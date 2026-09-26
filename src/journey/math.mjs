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
