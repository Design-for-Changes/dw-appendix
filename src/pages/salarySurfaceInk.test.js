import {salaryInkGeometry, salaryInkRGB} from "./salarySurfaceInk";
import {SURFACE_SYSTEMS} from "../calc/salarySurfaceSystems";

const u = (...xs) => Uint32Array.from(xs);
const [special,welfare,services] = SURFACE_SYSTEMS;
const both = special.bit | welfare.bit, three = both | services.bit;
const geometry = (width, changeBySystem) => new Map(salaryInkGeometry({width, changeBySystem}, SURFACE_SYSTEMS).map(g=>[g.mask,g]));

test("an identical salary edge is striped once; a crossing and a shared isolated point each become one sector marker", () => {
  const g = geometry(5, {
    [special.id]:{points:u(2,7,12,17,19), lines:u(2,7,7,12,12,17)},
    [welfare.id]:{points:u(2,7,11,12,13,19), lines:u(2,7,11,12,12,13)},
  });
  expect(g.get(both)).toEqual({mask:both,points:u(2,7),lines:u(2,7),markers:u(12,19)});
  expect(g.get(special.bit).lines).toEqual(u(7,12,12,17));
  expect(g.get(welfare.bit).lines).toEqual(u(11,12,12,13));
});

test("a third system at a single vertex is distinguishable from a two-system edge ending there", () => {
  const edge = {points:u(1,4), lines:u(1,4)};
  const g = geometry(3, {[special.id]:edge, [welfare.id]:edge, [services.id]:{points:u(4),lines:u()}});
  expect(g.get(both)).toEqual({mask:both,points:u(1),lines:u(1,4),markers:u()});
  expect(g.get(three)).toEqual({mask:three,points:u(),lines:u(),markers:u(4)});
});

test("geometry neither interpolates nearby points nor connects across a row wrap", () => {
  const g = geometry(3, {[special.id]:{points:u(2,3),lines:u(2,3)}, [welfare.id]:{points:u(4),lines:u()}});
  expect(g.get(special.bit).lines).toEqual(u());
  expect([...g.keys()]).toEqual([special.bit,welfare.bit]);
  expect(g.get(special.bit).points).toEqual(u(2,3));
});

test("tax or insurance edges cannot become chart ink even if present in a stale result", () => {
  const segment = {points:u(1,4),lines:u(1,4)};
  expect([...geometry(3, {health:segment,pension:segment,"income-tax":segment,"resident-tax":segment}).keys()]).toEqual([]);
});

test("legend and GPU ink use the same RGB values", () => {
  expect(salaryInkRGB("#b30")).toEqual(salaryInkRGB("#bb3300"));
  expect(salaryInkRGB("#00ff80")).toEqual([0,1,128/255]);
});
