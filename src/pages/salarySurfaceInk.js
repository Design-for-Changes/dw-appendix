// Group identical geometry, not merely adjoining pixels: two unrelated boundaries
// can project onto each other as the camera turns. Only a shared salary-grid edge
// earns a striped line. Encoding an upward/leftward unit edge by its end index
// bounds scratch space independently of the number of detected transitions.
export function salaryInkGeometry(surface, systems) {
  const {width, changeBySystem} = surface;
  const length = width * width;
  const all = systems.reduce((mask, s) => mask | s.bit, 0);
  const Mask = all <= 255 ? Uint8Array : all <= 65535 ? Uint16Array : Uint32Array;
  const points = new Mask(length), up = new Mask(length), left = new Mask(length);
  for (const {id, bit} of systems) {
    const geometry = changeBySystem?.[id];
    if (!geometry) continue;
    for (const p of geometry.points) points[p] |= bit;
    for (let i = 0; i < geometry.lines.length; i += 2) {
      const a = geometry.lines[i], b = geometry.lines[i + 1];
      if (b - a === width) up[b] |= bit;
      else if (b - a === 1 && b % width > 0) left[b] |= bit;
    }
  }
  // At a crossing or an isolated shared point, no adjacent edge carries the
  // full combination: put a small pie marker exactly on that vertex.
  const marker = (p, mask) => (mask & (mask - 1)) !== 0 &&
    up[p] !== mask && left[p] !== mask && up[p + width] !== mask &&
    (p % width === width - 1 || left[p + 1] !== mask);
  const groups = new Map();
  function group(mask) {
    if (!groups.has(mask)) groups.set(mask, {mask, pc:0, lc:0, mc:0});
    return groups.get(mask);
  }
  for (let p = 0; p < length; p++) {
    const mask = points[p];
    if (mask) { const g = group(mask); if (marker(p, mask)) g.mc++; else g.pc++; }
    if (up[p]) group(up[p]).lc += 2;
    if (left[p]) group(left[p]).lc += 2;
  }
  for (const g of groups.values()) {
    g.points = new Uint32Array(g.pc); g.lines = new Uint32Array(g.lc); g.markers = new Uint32Array(g.mc);
    g.pc = g.lc = g.mc = 0;
  }
  for (let p = 0; p < length; p++) {
    const mask = points[p];
    if (mask) {
      const g = groups.get(mask);
      if (marker(p, mask)) g.markers[g.mc++] = p; else g.points[g.pc++] = p;
    }
    if (up[p]) { const g = groups.get(up[p]); g.lines[g.lc++] = p - width; g.lines[g.lc++] = p; }
    if (left[p]) { const g = groups.get(left[p]); g.lines[g.lc++] = p - 1; g.lines[g.lc++] = p; }
  }
  return Array.from(groups.values(), ({mask, points, lines, markers}) => ({mask, points, lines, markers}));
}

export function salaryInkRGB(hex) {
  const color = Number.parseInt(hex.slice(1).replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3"), 16);
  return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
}
