import { useEffect, useState } from "react";

// Load static JSON tables from /public/data.
// Kept in a small hook to avoid duplicating fetch logic across components.
export function useStaticTables() {
  const [empStatic, setEmpStatic] = useState([]);
  const [basicITStatic, setBasicITStatic] = useState([]);
  const [basicLTStatic, setBasicLTStatic] = useState([]);
  const [socialU40Static, setSocialU40Static] = useState([]);
  const [socialO40Static, setSocialO40Static] = useState([]);
  const [taxTableStatic, setTaxTableStatic] = useState([]); // taxable -> tax (万円)
  const [staticReady, setStaticReady] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setStaticReady(false);
        const base = process.env.PUBLIC_URL || ".";
        const [empRes, basicITRes, basicLTRes, socURes, socORes, taxRes] = await Promise.all([
          fetch(`${base}/data/emp_deduction.json`).then((r) => r.json()),
          fetch(`${base}/data/basic_it.json`).then((r) => r.json()),
          fetch(`${base}/data/basic_lt.json`).then((r) => r.json()),
          fetch(`${base}/data/social_u40.json`).then((r) => r.json()),
          fetch(`${base}/data/social_o40.json`).then((r) => r.json()),
          fetch(`${base}/data/tax_table.json`).then((r) => r.json()),
        ]);
        if (ignore) return;
        setEmpStatic(empRes);
        setBasicITStatic(basicITRes);
        setBasicLTStatic(basicLTRes);
        setSocialU40Static(socURes);
        setSocialO40Static(socORes);
        setTaxTableStatic(taxRes);
        setStaticReady(true);
      } catch (e) {
        // Keep app usable even if static tables fail to load (UI can show "計算" disabled).
        // eslint-disable-next-line no-console
        console.error("static json load error", e);
        if (!ignore) setStaticReady(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  return {
    staticReady,
    empStatic,
    basicITStatic,
    basicLTStatic,
    socialU40Static,
    socialO40Static,
    taxTableStatic,
  };
}

