import { describeSurfaceChanges, SURFACE_SYSTEMS } from "../calc/salarySurfaceSystems";

// Use the same two integer salary points as the worker. A coincident boundary is
// not a sum of separate losses: the net-income difference belongs to the pair.
export function readSalaryBoundary(calculator,head,spouse,focus) {
  const after=calculator.evaluate(head,spouse), result=[];
  for(const axis of ["head","spouse"]) {
    const h=head-Number(axis==="head"),s=spouse-Number(axis==="spouse");
    if(h<0 || s<0 || !(h+s)) continue;
    const before=calculator.evaluate(h,s);
    if(before.status!=="calculated"||after.status!=="calculated") continue;
    const changes=describeSurfaceChanges(before,after).filter(c=>!focus || focus===c.id);
    if(changes.length)result.push({axis,changes,h,s,head,spouse});
  }
  return result;
}

export default function SalaryBoundaryDetail({events}) {
  return <div className="salary-boundary-detail" aria-live="polite">{events.map(({axis,changes,h,s,head,spouse})=>
    <div key={axis}><strong>{axis==="head" ? `世帯主 ${h}→${head}万円・配偶者 ${spouse}万円` : `世帯主 ${head}万円・配偶者 ${s}→${spouse}万円`}</strong>
      <dl>{changes.map((v,i)=><div key={v.id+i}><dt>{SURFACE_SYSTEMS.find(system=>system.id===v.id)?.label}</dt>
        <dd>{v.before} → {v.after}</dd></div>)}</dl>
    </div>)}</div>;
}
