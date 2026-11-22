// Split collinear overlaps in model coordinates. Perpendicular crossings are not shared segments.
export function partitionPolicyBoundaries(layers) {
  const axes = new Map(), result = new Map();
  const tokens = new Map();
  for (const {id, segments, classes = []} of layers) {
    for (const [x1, y1, x2, y2, from, to] of segments) {
      const token = [id, from, to].join(":");
      if(!tokens.has(token)) tokens.set(token, {id, from:classes[from-1], to:classes[to-1]});
      const vertical = x1 === x2;
      const fixed = vertical ? x1 : y1;
      const first = vertical ? y1 : x1, last = vertical ? y2 : x2;
      if (first === last) continue;
      const axisKey = (vertical ? "v" : "h") + fixed;
      if (!axes.has(axisKey)) axes.set(axisKey, {vertical, fixed, events:new Map()});
      const {events} = axes.get(axisKey);
      for (const [at, by] of [[Math.min(first, last), 1],[Math.max(first, last), -1]]) {
        if (!events.has(at)) events.set(at, []);
        events.get(at).push([token, by]);
      }
    }
  }
  for (const {vertical, fixed, events} of axes.values()) {
    const counts = new Map();
    let start = null;
    for (const end of [...events.keys()].sort((a,b) => a-b)) {
      if (counts.size && start !== null) {
        const active = [...counts.keys()].sort(), key = active.join("|");
        const transitions=active.map(id=>tokens.get(id));
        if (!result.has(key)) result.set(key, {key,ids:[...new Set(transitions.map(t=>t.id))],transitions,segments:[]});
        result.get(key).segments.push(vertical ? [fixed,start,fixed,end] : [start,fixed,end,fixed]);
      }
      for (const [id, by] of events.get(end)) {
        const n = (counts.get(id) || 0) + by;
        if (n) counts.set(id,n); else counts.delete(id);
      }
      start = end;
    }
  }
  return [...result.values()];
}
