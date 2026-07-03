import "../App.css";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import scenarios from "../config/scenarios.json";
import spouseDeductionITCfg from "../config/spouse_deduction_it.json";
import spouseDeductionLTCfg from "../config/spouse_deduction_lt.json";
import spouseSpecialDeductionITCfg from "../config/spouse_special_deduction_it.json";
import spouseSpecialDeductionLTCfg from "../config/spouse_special_deduction_lt.json";
import dependentDeductionCfg from "../config/dependent_deduction.json";
import specialKinDeductionITCfg from "../config/special_kin_deduction_it.json";
import specialKinDeductionLTCfg from "../config/special_kin_deduction_lt.json";
import widowDeductionCfg from "../config/widow_deduction.json";
import singleParentDeductionCfg from "../config/single_parent_deduction.json";
import workingStudentDeductionCfg from "../config/working_student_deduction.json";
import disabilityDeductionCfg from "../config/disability_deduction.json";
import DynamicGraphCard from "./disabilityWelfare/DynamicGraphCard";
import { useStaticTables } from "./disabilityWelfare/useStaticTables";
import { clampInt, rowAtKeyInt, interpTableValue } from "./disabilityWelfare/utils";

export default function DisabilityWelfareSimulator() {
  const [viewTab, setViewTab] = useState("inputs"); // inputs / dynamic
  const TAX_MODEL_LABEL = {
    s1: "S1: 〜R6（2024）",
    s2: "S2: R7（2025）",
    s3: "S3: R8〜9（2026〜2027）※最新合意",
  };

  // 結果表の折りたたみ（スマホ向け）
  const [openGroups, setOpenGroups] = useState({
    emp: false,
    deductions: false,
    tccaFam: false,
    tccaPay: false,
    serviceFee: false,
  });
  const toggleOpenGroup = (id) => setOpenGroups((p) => ({ ...p, [id]: !p?.[id] }));

  // Draft -> Apply (same pattern as Hand-Take simulator)
  const [calcVersion, setCalcVersion] = useState(0);
  // React.StrictMode(dev) で effect が二重実行されても、同一バージョンの再計算を避ける
  const lastSeriesComputedRef = useRef(0);
  // 縦線ライン（=世帯主の給与収入）: グラフの指示点 & 表の表示値に使用（リアルタイム更新）
  const [displayHeadSalaryWan, setDisplayHeadSalaryWan] = useState(500);
  // 「計算」ボタン押下時にまとめて算出して格納（以降は読み込みのみ）
  const [householdSeries, setHouseholdSeries] = useState([]); // { x, gross, allowance, expTax, expSocial, expService, disposable, takeHome, serviceFee, tax, social }
  const [seriesReady, setSeriesReady] = useState(false);
  // 描画用は点数を減らして SVG パスを軽量化（縦線ラインの読取は householdSeries を使用）
  const householdSeriesDisplay = useMemo(() => {
    const step = 5; // 5万円刻みで描画（計算は1万円刻みのまま）
    if (!householdSeries || householdSeries.length === 0) return [];
    const out = [];
    for (let i = 0; i < householdSeries.length; i += step) out.push(householdSeries[i]);
    const last = householdSeries[householdSeries.length - 1];
    if (out.length === 0 || out[out.length - 1]?.x !== last?.x) out.push(last);
    return out;
  }, [householdSeries]);
  const [taxModel, setTaxModel] = useState("s2"); // s1 / s2 / s3（税・控除モデル）
  // 市町村民税（所得割）は 6% 前提（ユーザー指定）
  const MUNICIPAL_TAX_RATE = 6;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Remove legacy tab ("fixed") safely even during HMR where state can persist.
    if (viewTab === "fixed") setViewTab("inputs");
  }, [viewTab]);

  useEffect(() => {
    const mq = window.matchMedia?.("(max-width: 540px)");
    if (!mq) return;
    const onChange = () => setIsMobile(Boolean(mq.matches));
    onChange();
    // Safari/older: addListener
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // Static tables (from /public/data)
  const {
    staticReady,
    empStatic,
    basicITStatic,
    basicLTStatic,
    socialU40Static,
    socialO40Static,
    taxTableStatic,
  } = useStaticTables();

  const [head, setHead] = useState({
    age: 40,
    salaryWan: 0, // 給与収入（万円/年）
    disabled: false,
    disabilityKind: "disabled", // disabled | special（disabled のときのみ有効）
    tokubetsuAllowance: false, // 特別障害者手当
    childWelfareAllowance: false, // 障害児福祉手当（年齢<20で使用）
    basicDisabilityPensionGrade: "none", // none | 1 | 2
    basicDisabilityPensionPre20: false, // 20歳前傷病
    otherIncomeWan: 0, // 給与以外の所得（万円/年）
    widowWan: 0, // 0/1（該当する）
    singleParentWan: 0, // 0/1（該当する）
    workingStudentWan: 0, // 0/1（該当する）
    otherDedWan: 0, // その他の控除（万円/年）
  });
  const [spouseEnabled, setSpouseEnabled] = useState(false);
  const [spouse, setSpouse] = useState({
    age: 40,
    salaryWan: 0, // 給与収入（万円/年）
    otherIncomeWan: 0, // 給与以外の所得（万円/年）
    workingStudentWan: 0, // 0/1（該当する）
    disabled: false,
    disabilityKind: "disabled", // disabled | special（disabled のときのみ有効）
    tokubetsuAllowance: false, // 特別障害者手当
    childWelfareAllowance: false, // 障害児福祉手当（年齢<20で使用）
    basicDisabilityPensionGrade: "none", // none | 1 | 2
    basicDisabilityPensionPre20: false, // 20歳前傷病
  });
  const [children, setChildren] = useState([]); // { id, age, incomeWan }

  // デフォルト: 世帯主オンリー（給与500万円・40歳、それ以外0）
  const [spouseEnabledDraft, setSpouseEnabledDraft] = useState(false);
  const [taxModelDraft, setTaxModelDraft] = useState("s2");
  const [headDraft, setHeadDraft] = useState({
    age: 40,
    salaryWan: 500,
    disabled: false,
    disabilityKind: "disabled",
    tokubetsuAllowance: false,
    childWelfareAllowance: false,
    basicDisabilityPensionGrade: "none",
    basicDisabilityPensionPre20: false,
    otherIncomeWan: 0,
    widowWan: 0,
    singleParentWan: 0,
    workingStudentWan: 0,
    otherDedWan: 0,
  });
  const [spouseDraft, setSpouseDraft] = useState({
    age: 40,
    salaryWan: 0,
    otherIncomeWan: 0,
    workingStudentWan: 0,
    disabled: false,
    disabilityKind: "disabled", // disabled | special
    tokubetsuAllowance: false,
    childWelfareAllowance: false,
    basicDisabilityPensionGrade: "none",
    basicDisabilityPensionPre20: false,
  });
  const [childrenDraft, setChildrenDraft] = useState([]);

  const nextChildId = () => `c_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const addChildDraft = () => {
    setChildrenDraft((p) => [
      ...p,
      {
        id: nextChildId(),
        age: 10,
        cohabit: true,
        disabled: false,
        specialDisabled: false,
        tccaGrade: "not", // 特別児童扶養手当: not/1/2
        childWelfareAllowance: false, // 障害児福祉手当
        tokubetsuAllowance: false, // 特別障害者手当
        workingStudent: false,
        salaryWan: 0,
        otherIncomeWan: 0,
      },
    ]);
  };
  const removeChildDraft = (id) => {
    setChildrenDraft((p) => p.filter((c) => c.id !== id));
  };

  const applyDraft = () => {
    setTaxModel(taxModelDraft || "s2");
    setHead({
      age: Number(headDraft.age) || 0,
      salaryWan: Number(headDraft.salaryWan) || 0,
      disabled: Boolean(headDraft.disabled),
      disabilityKind: headDraft.disabilityKind || "disabled",
      tokubetsuAllowance: Boolean(headDraft.disabled) ? Boolean(headDraft.tokubetsuAllowance) : false,
      childWelfareAllowance: Boolean(headDraft.disabled) ? Boolean(headDraft.childWelfareAllowance) : false,
      basicDisabilityPensionGrade: Boolean(headDraft.disabled) ? (headDraft.basicDisabilityPensionGrade || "none") : "none",
      basicDisabilityPensionPre20: Boolean(headDraft.disabled) && (headDraft.basicDisabilityPensionGrade || "none") !== "none"
        ? Boolean(headDraft.basicDisabilityPensionPre20)
        : false,
      otherIncomeWan: Number(headDraft.otherIncomeWan) || 0,
      widowWan: Number(headDraft.widowWan) || 0,
      singleParentWan: Number(headDraft.singleParentWan) || 0,
      workingStudentWan: Number(headDraft.workingStudentWan) || 0,
      otherDedWan: Number(headDraft.otherDedWan) || 0,
    });
    setSpouseEnabled(Boolean(spouseEnabledDraft));
    if (spouseEnabledDraft) {
      setSpouse({
        age: Number(spouseDraft.age) || 0,
        salaryWan: Number(spouseDraft.salaryWan) || 0,
        otherIncomeWan: Number(spouseDraft.otherIncomeWan) || 0,
        workingStudentWan: Number(spouseDraft.workingStudentWan) || 0,
        disabled: Boolean(spouseDraft.disabled),
        disabilityKind: spouseDraft.disabilityKind || "disabled",
        tokubetsuAllowance: Boolean(spouseDraft.disabled) ? Boolean(spouseDraft.tokubetsuAllowance) : false,
        childWelfareAllowance: Boolean(spouseDraft.disabled) ? Boolean(spouseDraft.childWelfareAllowance) : false,
        basicDisabilityPensionGrade: Boolean(spouseDraft.disabled) ? (spouseDraft.basicDisabilityPensionGrade || "none") : "none",
        basicDisabilityPensionPre20:
          Boolean(spouseDraft.disabled) && (spouseDraft.basicDisabilityPensionGrade || "none") !== "none"
            ? Boolean(spouseDraft.basicDisabilityPensionPre20)
            : false,
      });
    } else {
      setSpouse({
        age: 40,
        salaryWan: 0,
        otherIncomeWan: 0,
        workingStudentWan: 0,
        disabled: false,
        disabilityKind: "disabled",
        tokubetsuAllowance: false,
        childWelfareAllowance: false,
        basicDisabilityPensionGrade: "none",
        basicDisabilityPensionPre20: false,
      });
    }
    setChildren(childrenDraft.map((c) => ({
      id: c.id,
      age: Number(c.age) || 0,
      cohabit: c.cohabit !== false,
      disabled: Boolean(c.disabled),
      specialDisabled: Boolean(c.specialDisabled),
      tccaGrade: c.tccaGrade || "not",
      childWelfareAllowance: Boolean(c.childWelfareAllowance),
      tokubetsuAllowance: Boolean(c.tokubetsuAllowance),
      workingStudent: Boolean(c.workingStudent),
      salaryWan: Number(c.salaryWan) || 0,
      otherIncomeWan: Number(c.otherIncomeWan) || 0,
    })));
    setCalcVersion((v) => v + 1);
  };

  // clampInt / rowAtKeyInt / interpTableValue are in ./disabilityWelfare/utils

  const employmentIncomeRows = useMemo(() => {
    if (
      !staticReady ||
      !empStatic ||
      empStatic.length === 0 ||
      !basicITStatic ||
      basicITStatic.length === 0 ||
      !basicLTStatic ||
      basicLTStatic.length === 0 ||
      !socialU40Static ||
      socialU40Static.length === 0 ||
      !socialO40Static ||
      socialO40Static.length === 0
    ) {
      return null;
    }
    const skey = taxModel || "s2";
    const empKey = `emp_${skey}`;
    const basicITKey = `basicIT_${skey}`;
    const socialKey = `social_${skey}`;

    const calcIncomeAdjustmentDeductionWan = (salaryWan, eligible) => {
      // 所得金額調整控除（ユーザー指定の簡易ルール）
      // - 当人の給与収入が850万円超 かつ 要件(eligible)を満たす場合
      // - 上乗せ額 = (min(給与収入, 1000) - 850) * 0.1（上限15万円）
      const t = Number(salaryWan) || 0;
      if (!eligible) return 0;
      if (t <= 850) return 0;
      const capped = Math.min(1000, t);
      return Math.min(15, Math.max(0, (capped - 850) * 0.1));
    };

    const calcOne = (age, salaryWan, otherIncomeWan, opts = {}) => {
      const s = Math.max(0, Number(salaryWan) || 0);
      const o = Math.max(0, Number(otherIncomeWan) || 0);
      const r = rowAtKeyInt(empStatic, "x", Math.round(s));
      const empBaseWan = Number(r?.[empKey]) || 0;
      const incomeAdjWan = Number(opts?.incomeAdjWan) || 0;
      const empWan = empBaseWan + incomeAdjWan;
      const incomeWan = Math.max(0, s - empWan);
      const totalIncomeWan = incomeWan + o;

      // 配偶者・子どもは、給与(年収)が130万円以下なら社会保険料0（ユーザー指定）。
      const exemptSocial = Boolean(opts?.exemptSocialUnder130) && s <= 130;
      const socArr = Number(age) >= 40 ? socialO40Static : socialU40Static;
      const socRow = rowAtKeyInt(socArr, "x", Math.round(s));
      const socialWan = exemptSocial ? 0 : Number(socRow?.[socialKey]) || 0;

      const basicITRow = rowAtKeyInt(basicITStatic, "income_axis", Math.round(totalIncomeWan));
      const basicLTRow = rowAtKeyInt(basicLTStatic, "income_axis", Math.round(totalIncomeWan));
      const basicITWan = Number(basicITRow?.[basicITKey]) || 0;
      const basicLTWan = Number(basicLTRow?.basicLT_common) || 0;
      const taxableITWan = Math.max(0, totalIncomeWan - basicITWan);
      const taxableLTWan = Math.max(0, totalIncomeWan - basicLTWan);

      return {
        salaryWan: s,
        empWan,
        empBaseWan,
        incomeAdjWan,
        incomeWan,
        otherIncomeWan: o,
        totalIncomeWan,
        socialWan,
        basicITWan,
        basicLTWan,
        taxableITWan,
        taxableLTWan,
      };
    };

    const rows = [];
    rows.push({
      who: "世帯主",
      age: head.age,
      workingStudent: Boolean(head.workingStudentWan),
      disabled: Boolean(head.disabled),
      tccaSpecial: Boolean(head.disabled) && head.disabilityKind === "special",
      cohabit: true,
      // 所得カードを TCCA など他計算の唯一のソースにするため、必要な入力値もここに集約して持たせる。
      otherDedWan: Number(head.otherDedWan) || 0,
      widowWan: Number(head.widowWan) || 0,
      singleParentWan: Number(head.singleParentWan) || 0,
      // 特別児童扶養手当の判定所得で使う「障害者控除（27/40万円）」を所得カード側で確定させて持たせる。
      // （TCCA計算表はこの値を参照し、独自計算しない）
      tccaDisWan: head.disabled ? (head.disabilityKind === "special" ? 40 : 27) : 0,
      // 障害児福祉手当等（所得制限用）でも「同居特別=特別(40万)」に落とした金額を使う。
      welfareDisWan: head.disabled ? (head.disabilityKind === "special" ? 40 : 27) : 0,
      ...calcOne(head.age, head.salaryWan, head.otherIncomeWan, { exemptSocialUnder130: false, incomeAdjWan: 0 }),
    });
    if (spouseEnabled)
      rows.push({
        who: "配偶者",
        age: spouse.age,
        workingStudent: Boolean(spouse.workingStudentWan),
        disabled: Boolean(spouse.disabled),
        tccaSpecial: Boolean(spouse.disabled) && spouse.disabilityKind === "special",
        cohabit: true,
        tccaDisWan: spouse.disabled ? (spouse.disabilityKind === "special" ? 40 : 27) : 0,
        welfareDisWan: spouse.disabled ? (spouse.disabilityKind === "special" ? 40 : 27) : 0,
        ...calcOne(spouse.age, spouse.salaryWan, spouse.otherIncomeWan, { exemptSocialUnder130: true, incomeAdjWan: 0 }),
      });
    children.forEach((c, i) =>
      rows.push({
        who: `子ども${i + 1}`,
        age: c.age,
        workingStudent: Boolean(c.workingStudent),
        disabled: Boolean(c.disabled),
        tccaSpecial: Boolean(c.disabled) && Boolean(c.specialDisabled),
        cohabit: c?.cohabit !== false,
        tccaGrade: String(c?.tccaGrade || "not"),
        tccaDisWan: c.disabled ? (c.specialDisabled ? 40 : 27) : 0,
        welfareDisWan: c.disabled ? (c.specialDisabled ? 40 : 27) : 0,
        ...calcOne(c.age, c.salaryWan, c.otherIncomeWan, { exemptSocialUnder130: true, incomeAdjWan: 0 }),
      })
    );

    // 所得金額調整控除（給与所得控除の上乗せ）を2nd passで反映
    // NOTE: 扶養親族数カウントとは別。ここでは「扶養親族（配偶者/子ども）」の条件判定に年齢制限をかけない。
    const childDepMaxWan = 58;
    const dependentChildren = rows.filter(
      (r) => String(r?.who || "").startsWith("子ども") && (Number(r?.totalIncomeWan) || 0) <= childDepMaxWan
    );
    const hasDependentUnder23 = dependentChildren.some((r) => (Number(r?.age) || 0) < 23);
    const hasDependentSpecialDisabled = dependentChildren.some((r) => Boolean(r?.tccaSpecial));
    const headIsSpecialDisabled = Boolean(head.disabled) && head.disabilityKind === "special";
    const spouseIsSpecialDisabled = Boolean(spouseEnabled && spouse.disabled) && spouse.disabilityKind === "special";

    const headEligible = headIsSpecialDisabled || spouseIsSpecialDisabled || hasDependentUnder23 || hasDependentSpecialDisabled;
    const spouseEligible = spouseIsSpecialDisabled || headIsSpecialDisabled || hasDependentUnder23 || hasDependentSpecialDisabled;

    const headRow0 = rows.find((r) => r.who === "世帯主");
    const spouseRow0 = rows.find((r) => r.who === "配偶者");
    const headAdjWan = calcIncomeAdjustmentDeductionWan(Number(headRow0?.salaryWan) || 0, headEligible);
    const spouseAdjWan = calcIncomeAdjustmentDeductionWan(Number(spouseRow0?.salaryWan) || 0, spouseEligible);

    if (headAdjWan > 0 && headRow0) {
      const idx = rows.findIndex((r) => r.who === "世帯主");
      rows[idx] = {
        ...rows[idx],
        ...calcOne(head.age, head.salaryWan, head.otherIncomeWan, { exemptSocialUnder130: false, incomeAdjWan: headAdjWan }),
      };
    }
    if (spouseEnabled && spouseAdjWan > 0 && spouseRow0) {
      const idx = rows.findIndex((r) => r.who === "配偶者");
      rows[idx] = {
        ...rows[idx],
        ...calcOne(spouse.age, spouse.salaryWan, spouse.otherIncomeWan, { exemptSocialUnder130: true, incomeAdjWan: spouseAdjWan }),
      };
    }
    return rows;
  }, [
    staticReady,
    empStatic,
    basicITStatic,
    basicLTStatic,
    socialU40Static,
    socialO40Static,
    taxModel,
    head.salaryWan,
    head.otherIncomeWan,
    head.age,
    spouseEnabled,
    spouse.salaryWan,
    spouse.otherIncomeWan,
    spouse.age,
    children,
  ]);

  // 扶養控除（世帯主側に合算）。現時点では「子どもの合計所得<=48万円」かつ年齢帯で判定。
  const dependentDeduction = useMemo(() => {
    if (!employmentIncomeRows) return { itWan: 0, ltWan: 0 };
    const maxIncome = Number(dependentDeductionCfg?.dependent_total_income_max_wan) || 0;
    const bands = Array.isArray(dependentDeductionCfg?.bands) ? dependentDeductionCfg.bands : [];

    let it = 0;
    let lt = 0;
    for (const r of employmentIncomeRows) {
      if (!String(r.who || "").startsWith("子ども")) continue;
      const age = Number(r.age) || 0;
      const total = Number(r.totalIncomeWan) || 0;
      if (total > maxIncome) continue;

      for (const b of bands) {
        const ranges = Array.isArray(b.age_ranges) ? b.age_ranges : [];
        const ok = ranges.some((x) => age >= (Number(x.min_age) || 0) && age <= (Number(x.max_age) || 0));
        if (!ok) continue;
        it += Number(b.amount_it_wan) || 0;
        lt += Number(b.amount_lt_wan) || 0;
        break;
      }
    }
    return { itWan: it, ltWan: lt };
  }, [employmentIncomeRows]);

  // 特定親族特別控除（世帯主側に合算）
  // - 子どもが19〜22歳（特定扶養親族の年齢帯）
  // - 扶養控除が受けられない（=子どもの所得合計が扶養控除の上限を超える）
  // - 子どもの所得合計帯に応じて金額が決まる（IT/LT で別テーブル）
  const specialKinDeduction = useMemo(() => {
    if (!employmentIncomeRows) return { itWan: 0, ltWan: 0 };
    const maxDepIncome = Number(dependentDeductionCfg?.dependent_total_income_max_wan) || 0;
    const itBands = Array.isArray(specialKinDeductionITCfg?.child_total_income_bands_wan)
      ? specialKinDeductionITCfg.child_total_income_bands_wan
      : [];
    const ltBands = Array.isArray(specialKinDeductionLTCfg?.child_total_income_bands_wan)
      ? specialKinDeductionLTCfg.child_total_income_bands_wan
      : [];

    const amountByBands = (bands, total) => {
      // NOTE: 区間が重なる場合は、JSONで先に出てきたものを優先する（例: 95〜）。
      const b = bands.find((x) => total >= (Number(x.min_wan) || 0) && total <= (Number(x.max_wan) || 0));
      return Number(b?.amount_wan) || 0;
    };

    let it = 0;
    let lt = 0;
    for (const r of employmentIncomeRows) {
      if (!String(r.who || "").startsWith("子ども")) continue;
      const age = Number(r.age) || 0;
      if (age < 19 || age > 22) continue;
      const total = Number(r.totalIncomeWan) || 0;
      if (total <= maxDepIncome) continue; // 扶養控除が適用され得る帯は対象外
      it += amountByBands(itBands, total);
      lt += amountByBands(ltBands, total);
    }
    return { itWan: it, ltWan: lt };
  }, [employmentIncomeRows]);

  const widowDeduction = useMemo(() => {
    // 寡婦控除は「所得合計<=500万円」のときのみ適用（ユーザー指定）
    const headRow = employmentIncomeRows?.find((r) => String(r?.who || "") === "世帯主");
    const headTotalWan = Number(headRow?.totalIncomeWan) || 0;
    const incomeOk = headTotalWan <= 500;
    const applied =
      Boolean(head.widowWan) && incomeOk && !(widowDeductionCfg?.requires_no_spouse && spouseEnabled);
    return {
      itWan: applied ? Number(widowDeductionCfg?.amount_it_wan) || 0 : 0,
      ltWan: applied ? Number(widowDeductionCfg?.amount_lt_wan) || 0 : 0,
    };
  }, [head.widowWan, spouseEnabled, employmentIncomeRows]);

  const singleParentDeduction = useMemo(() => {
    // ひとり親控除は「所得合計<=500万円」のときのみ適用（ユーザー指定）
    const headRow = employmentIncomeRows?.find((r) => String(r?.who || "") === "世帯主");
    const headTotalWan = Number(headRow?.totalIncomeWan) || 0;
    const incomeOk = headTotalWan <= 500;
    const applied =
      Boolean(head.singleParentWan) &&
      incomeOk &&
      !(singleParentDeductionCfg?.requires_no_spouse && spouseEnabled);
    return {
      itWan: applied ? Number(singleParentDeductionCfg?.amount_it_wan) || 0 : 0,
      ltWan: applied ? Number(singleParentDeductionCfg?.amount_lt_wan) || 0 : 0,
    };
  }, [head.singleParentWan, spouseEnabled, employmentIncomeRows]);

  const workingStudentDeductionAmt = useMemo(() => {
    return {
      itWan: Number(workingStudentDeductionCfg?.amount_it_wan) || 0,
      ltWan: Number(workingStudentDeductionCfg?.amount_lt_wan) || 0,
    };
  }, []);

  const getDisabilityDeductionWan = (col, kind) => {
    // kind: "it" | "lt"
    const it = disabilityDeductionCfg?.it_wan || {};
    const lt = disabilityDeductionCfg?.lt_wan || {};
    const table = kind === "it" ? it : lt;
    const amt = (k) => Number(table?.[k]) || 0;

    if (!col) return 0;
    const who = String(col.who || "");

    if (who === "世帯主") {
      if (!head.disabled) return 0;
      return head.disabilityKind === "special" ? amt("special") : amt("disabled");
    }

    if (who === "配偶者") {
      if (!spouseEnabled || !spouse.disabled) return 0;
      // 配偶者は「特別障害者」の場合、同居特別障害者として扱う（ユーザー指定）
      return spouse.disabilityKind === "special" ? amt("cohab_special") : amt("disabled");
    }

    if (who.startsWith("子ども")) {
      // 子どもは draft/state に disabled/specialDisabled/cohabit がある
      const idx = Number(who.replace("子ども", "")) - 1;
      const c = children[idx];
      if (!c || !c.disabled) return 0;
      if (c.specialDisabled && c.cohabit) return amt("cohab_special");
      if (c.specialDisabled) return amt("special");
      return amt("disabled");
    }

    return 0;
  };

  const getDisabilityDeductionForTaxpayerWan = (col, kind, rows) => {
    // 税計算（所得控除）における障害者控除の付け先（ユーザー指定）
    // - 配偶者/子どもが「扶養（所得合計<=58万円）」なら、世帯主に合算
    // - 扶養でなければ、本人（配偶者/子ども）に付く
    // - 世帯主本人分は常に世帯主に付く
    if (!col) return 0;
    const who = String(col?.who || "");
    const depMaxWan = 58;
    const findRow = (w) => (Array.isArray(rows) ? rows.find((r) => String(r?.who || "") === String(w)) : null);
    const isDep = (w) => {
      const r = findRow(w);
      return r ? (Number(r?.totalIncomeWan) || 0) <= depMaxWan : false;
    };

    if (who === "世帯主") {
      let sum = 0;
      // 本人分
      sum += getDisabilityDeductionWan(findRow("世帯主") || col, kind);
      // 配偶者（扶養のみ）
      if (spouseEnabled && isDep("配偶者")) sum += getDisabilityDeductionWan(findRow("配偶者"), kind);
      // 子ども（扶養のみ）
      if (Array.isArray(rows)) {
        for (const r of rows) {
          const w = String(r?.who || "");
          if (!w.startsWith("子ども")) continue;
          if (!isDep(w)) continue;
          sum += getDisabilityDeductionWan(r, kind);
        }
      }
      return sum;
    }

    if (who === "配偶者") {
      // 扶養でないときだけ本人分
      if (!spouseEnabled) return 0;
      return isDep("配偶者") ? 0 : getDisabilityDeductionWan(col, kind);
    }

    if (who.startsWith("子ども")) {
      // 扶養でないときだけ本人分
      return isDep(who) ? 0 : getDisabilityDeductionWan(col, kind);
    }

    return 0;
  };

  // ===== 入力反映グラフ（積み上げ面）用の系列を「計算」ボタン押下時だけ作って保持 =====
  useEffect(() => {
    const SWEEP_MIN_X = 1; // 万円
    const SWEEP_MAX_X = 1500; // 万円（ユーザー指定）
    const SWEEP_STEP = 1; // 万円（縦線ラインと1:1にする）

    if (calcVersion <= 0) return;
    if (lastSeriesComputedRef.current === calcVersion) return;
    lastSeriesComputedRef.current = calcVersion;
    if (
      !staticReady ||
      !empStatic?.length ||
      !basicITStatic?.length ||
      !basicLTStatic?.length ||
      !socialU40Static?.length ||
      !socialO40Static?.length ||
      !taxTableStatic?.length
    ) {
      return;
    }

    let cancelled = false;
    setSeriesReady(false);

    const t = setTimeout(() => {
      try {
        const skey = taxModel || "s2";
        const empKey = `emp_${skey}`;
        const basicITKey = `basicIT_${skey}`;
        const socialKey = `social_${skey}`;

        const wsAmtIT = Number(workingStudentDeductionCfg?.amount_it_wan) || 0;
        const wsAmtLT = Number(workingStudentDeductionCfg?.amount_lt_wan) || 0;

        const calcIncomeAdjustmentDeductionWan = (salaryWan, eligible) => {
          // 所得金額調整控除（ユーザー指定の簡易ルール）
          // - 当人の給与収入が850万円超 かつ 要件(eligible)を満たす場合
          // - 上乗せ額 = (min(給与収入, 1000) - 850) * 0.1（上限15万円）
          const t = Number(salaryWan) || 0;
          if (!eligible) return 0;
          if (t <= 850) return 0;
          const capped = Math.min(1000, t);
          return Math.min(15, Math.max(0, (capped - 850) * 0.1));
        };

        const calcOne = (age, salaryWan, otherIncomeWan, opts = {}) => {
          const s = Math.max(0, Number(salaryWan) || 0);
          const o = Math.max(0, Number(otherIncomeWan) || 0);
          const r = rowAtKeyInt(empStatic, "x", Math.round(s));
          const empBaseWan = Number(r?.[empKey]) || 0;
          const incomeAdjWan = Number(opts?.incomeAdjWan) || 0;
          const empWan = empBaseWan + incomeAdjWan;
          const incomeWan = Math.max(0, s - empWan);
          const totalIncomeWan = incomeWan + o;

          // 配偶者・子どもは、給与(年収)が130万円以下なら社会保険料0（ユーザー指定）。
          const exemptSocial = Boolean(opts?.exemptSocialUnder130) && s <= 130;
          const socArr = Number(age) >= 40 ? socialO40Static : socialU40Static;
          const socRow = rowAtKeyInt(socArr, "x", Math.round(s));
          const socialWan = exemptSocial ? 0 : Number(socRow?.[socialKey]) || 0;

          const basicITRow = rowAtKeyInt(basicITStatic, "income_axis", Math.round(totalIncomeWan));
          const basicLTRow = rowAtKeyInt(basicLTStatic, "income_axis", Math.round(totalIncomeWan));
          const basicITWan = Number(basicITRow?.[basicITKey]) || 0;
          const basicLTWan = Number(basicLTRow?.basicLT_common) || 0;

          return {
            salaryWan: s,
            empWan,
            empBaseWan,
            incomeAdjWan,
            incomeWan,
            otherIncomeWan: o,
            totalIncomeWan,
            socialWan,
            basicITWan,
            basicLTWan,
          };
        };

        const buildRows = (headSalaryWan) => {
          const rows = [];
          rows.push({
            who: "世帯主",
            age: head.age,
            workingStudent: Boolean(head.workingStudentWan),
            disabled: Boolean(head.disabled),
            tccaSpecial: Boolean(head.disabled) && head.disabilityKind === "special",
            cohabit: true,
            otherDedWan: Number(head.otherDedWan) || 0,
            widowWan: Number(head.widowWan) || 0,
            singleParentWan: Number(head.singleParentWan) || 0,
            tccaDisWan: head.disabled ? (head.disabilityKind === "special" ? 40 : 27) : 0,
            welfareDisWan: head.disabled ? (head.disabilityKind === "special" ? 40 : 27) : 0,
            ...calcOne(head.age, headSalaryWan, head.otherIncomeWan, { exemptSocialUnder130: false, incomeAdjWan: 0 }),
          });
          if (spouseEnabled) {
            rows.push({
              who: "配偶者",
              age: spouse.age,
              workingStudent: Boolean(spouse.workingStudentWan),
              disabled: Boolean(spouse.disabled),
              tccaSpecial: Boolean(spouse.disabled) && spouse.disabilityKind === "special",
              cohabit: true,
              tccaDisWan: spouse.disabled ? (spouse.disabilityKind === "special" ? 40 : 27) : 0,
              welfareDisWan: spouse.disabled ? (spouse.disabilityKind === "special" ? 40 : 27) : 0,
              ...calcOne(spouse.age, spouse.salaryWan, spouse.otherIncomeWan, { exemptSocialUnder130: true, incomeAdjWan: 0 }),
            });
          }
          children.forEach((c, i) =>
            rows.push({
              who: `子ども${i + 1}`,
              age: c.age,
              workingStudent: Boolean(c.workingStudent),
              disabled: Boolean(c.disabled),
              tccaSpecial: Boolean(c.disabled) && Boolean(c.specialDisabled),
              cohabit: c?.cohabit !== false,
              tccaGrade: String(c?.tccaGrade || "not"),
              tccaDisWan: c.disabled ? (c.specialDisabled ? 40 : 27) : 0,
              welfareDisWan: c.disabled ? (c.specialDisabled ? 40 : 27) : 0,
              ...calcOne(c.age, c.salaryWan, c.otherIncomeWan, { exemptSocialUnder130: true, incomeAdjWan: 0 }),
            })
          );

          // 所得金額調整控除（給与所得控除の上乗せ）を2nd passで反映
          const childDepMaxWan = 58;
          const dependentChildren = rows.filter(
            (r) => String(r?.who || "").startsWith("子ども") && (Number(r?.totalIncomeWan) || 0) <= childDepMaxWan
          );
          const hasDependentUnder23 = dependentChildren.some((r) => (Number(r?.age) || 0) < 23);
          const hasDependentSpecialDisabled = dependentChildren.some((r) => Boolean(r?.tccaSpecial));
          const headIsSpecialDisabled = Boolean(head.disabled) && head.disabilityKind === "special";
          const spouseIsSpecialDisabled = Boolean(spouseEnabled && spouse.disabled) && spouse.disabilityKind === "special";
          const headEligible =
            headIsSpecialDisabled || spouseIsSpecialDisabled || hasDependentUnder23 || hasDependentSpecialDisabled;
          const spouseEligible =
            spouseIsSpecialDisabled || headIsSpecialDisabled || hasDependentUnder23 || hasDependentSpecialDisabled;

          const headAdjWan = calcIncomeAdjustmentDeductionWan(headSalaryWan, headEligible);
          const spouseAdjWan = spouseEnabled ? calcIncomeAdjustmentDeductionWan(spouse.salaryWan, spouseEligible) : 0;

          if (headAdjWan > 0) {
            const idx = rows.findIndex((r) => r.who === "世帯主");
            if (idx >= 0) {
              rows[idx] = {
                ...rows[idx],
                ...calcOne(head.age, headSalaryWan, head.otherIncomeWan, {
                  exemptSocialUnder130: false,
                  incomeAdjWan: headAdjWan,
                }),
              };
            }
          }
          if (spouseEnabled && spouseAdjWan > 0) {
            const idx = rows.findIndex((r) => r.who === "配偶者");
            if (idx >= 0) {
              rows[idx] = {
                ...rows[idx],
                ...calcOne(spouse.age, spouse.salaryWan, spouse.otherIncomeWan, {
                  exemptSocialUnder130: true,
                  incomeAdjWan: spouseAdjWan,
                }),
              };
            }
          }
          return rows;
        };

        const amountByBands = (bands, total) => {
          const b = bands.find((x) => total >= (Number(x.min_wan) || 0) && total <= (Number(x.max_wan) || 0));
          return Number(b?.amount_wan) || 0;
        };

        const calcDependentDeductionFromRows = (rows) => {
          const maxIncome = Number(dependentDeductionCfg?.dependent_total_income_max_wan) || 0;
          const bands = Array.isArray(dependentDeductionCfg?.bands) ? dependentDeductionCfg.bands : [];
          let it = 0;
          let lt = 0;
          for (const r of rows) {
            if (!String(r?.who || "").startsWith("子ども")) continue;
            const age = Number(r?.age) || 0;
            const total = Number(r?.totalIncomeWan) || 0;
            if (total > maxIncome) continue;
            for (const b of bands) {
              const ranges = Array.isArray(b?.age_ranges) ? b.age_ranges : [];
              const ok = ranges.some((x) => age >= (Number(x.min_age) || 0) && age <= (Number(x.max_age) || 0));
              if (!ok) continue;
              it += Number(b.amount_it_wan) || 0;
              lt += Number(b.amount_lt_wan) || 0;
              break;
            }
          }
          return { itWan: it, ltWan: lt };
        };

        const calcSpecialKinDeductionFromRows = (rows) => {
          const maxDepIncome = Number(dependentDeductionCfg?.dependent_total_income_max_wan) || 0;
          const itBands = Array.isArray(specialKinDeductionITCfg?.child_total_income_bands_wan)
            ? specialKinDeductionITCfg.child_total_income_bands_wan
            : [];
          const ltBands = Array.isArray(specialKinDeductionLTCfg?.child_total_income_bands_wan)
            ? specialKinDeductionLTCfg.child_total_income_bands_wan
            : [];
          let it = 0;
          let lt = 0;
          for (const r of rows) {
            if (!String(r?.who || "").startsWith("子ども")) continue;
            const age = Number(r?.age) || 0;
            if (age < 19 || age > 22) continue;
            const total = Number(r?.totalIncomeWan) || 0;
            if (total <= maxDepIncome) continue;
            it += amountByBands(itBands, total);
            lt += amountByBands(ltBands, total);
          }
          return { itWan: it, ltWan: lt };
        };

        const calcSpouseDeductionFromRows = (cfg, rows) => {
          if (!spouseEnabled) return 0;
          const headRow = rows.find((r) => r.who === "世帯主");
          const spouseRow = rows.find((r) => r.who === "配偶者");
          if (!headRow || !spouseRow) return 0;
          const headTotal = Number(headRow?.totalIncomeWan) || 0;
          const spouseTotal = Number(spouseRow?.totalIncomeWan) || 0;
          const spouseMax = Number(cfg?.spouse_total_income_max_wan) || 0;
          if (spouseTotal > spouseMax) return 0;
          const bands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
          const b = bands.find((x) => headTotal >= (Number(x.min_wan) || 0) && headTotal <= (Number(x.max_wan) || 0));
          return Number(b?.amount_wan) || 0;
        };

        const calcSpouseSpecialDeductionFromRows = (cfg, spouseDeductionWan, rows) => {
          if (!spouseEnabled) return 0;
          if (spouseDeductionWan !== 0 && cfg?.applies_when_spouse_deduction_is_zero) return 0;
          const headRow = rows.find((r) => r.who === "世帯主");
          const spouseRow = rows.find((r) => r.who === "配偶者");
          if (!headRow || !spouseRow) return 0;
          const headTotal = Number(headRow?.totalIncomeWan) || 0;
          const spouseTotal = Number(spouseRow?.totalIncomeWan) || 0;
          const headBands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
          const headBand = headBands.find(
            (b) => headTotal >= (Number(b.head_min_wan) || 0) && headTotal <= (Number(b.head_max_wan) || 0)
          );
          if (!headBand) return 0;
          const spouseBands = Array.isArray(headBand.spouse_bands_wan) ? headBand.spouse_bands_wan : [];
          const sb = spouseBands.find(
            (b) => spouseTotal >= (Number(b.spouse_min_wan) || 0) && spouseTotal <= (Number(b.spouse_max_wan) || 0)
          );
          return Number(sb?.amount_wan) || 0;
        };

        const calcWidowSingleParent = (rows) => {
          const headRow = rows.find((r) => r.who === "世帯主");
          const headTotalWan = Number(headRow?.totalIncomeWan) || 0;
          const incomeOk = headTotalWan <= 500;
          const widowApplied =
            Boolean(head.widowWan) && incomeOk && !(widowDeductionCfg?.requires_no_spouse && spouseEnabled);
          const singleParentApplied =
            Boolean(head.singleParentWan) && incomeOk && !(singleParentDeductionCfg?.requires_no_spouse && spouseEnabled);
          return {
            widow: {
              itWan: widowApplied ? Number(widowDeductionCfg?.amount_it_wan) || 0 : 0,
              ltWan: widowApplied ? Number(widowDeductionCfg?.amount_lt_wan) || 0 : 0,
            },
            singleParent: {
              itWan: singleParentApplied ? Number(singleParentDeductionCfg?.amount_it_wan) || 0 : 0,
              ltWan: singleParentApplied ? Number(singleParentDeductionCfg?.amount_lt_wan) || 0 : 0,
            },
          };
        };

        const getTaxable = (col, kind, rows, headDedCommonWithKin) => {
          const total = Number(col?.totalIncomeWan) || 0;
          const basic = kind === "it" ? Number(col?.basicITWan) || 0 : Number(col?.basicLTWan) || 0;
          const social = Number(col?.socialWan) || 0;
          const ws = Boolean(col?.workingStudent) ? (kind === "it" ? wsAmtIT : wsAmtLT) : 0;
          const dis = getDisabilityDeductionForTaxpayerWan(col, kind, rows);
          if (String(col?.who || "") !== "世帯主") return Math.max(0, total - basic - social - ws - dis);
          return Math.max(0, total - basic - social - ws - dis - (Number(headDedCommonWithKin) || 0));
        };

        const getTax = (taxableWan, kind) =>
          interpTableValue(taxTableStatic, "taxable", taxableWan, kind === "it" ? "tax_it" : "tax_lt");

        const getResidentIncomeLevyWan = (taxLTWan) => {
          const rate = 0.6;
          const incomeLevy10 = Math.max(0, (Number(taxLTWan) || 0) - 0.5);
          return incomeLevy10 * rate;
        };

        const calcBasicDisabilityPensionYenFor = (who, totalIncomeWan) => {
          const w = String(who || "");
          const headBase =
            head.basicDisabilityPensionGrade === "1"
              ? 1039625
              : head.basicDisabilityPensionGrade === "2"
                ? 1036625
                : 0;
          const spouseBase =
            spouse.basicDisabilityPensionGrade === "1"
              ? 1039625
              : spouse.basicDisabilityPensionGrade === "2"
                ? 1036625
                : 0;

          const incomeTotalYen = Math.round((Number(totalIncomeWan) || 0) * 10000);
          const pre20 =
            w === "世帯主"
              ? Boolean(head.basicDisabilityPensionPre20)
              : w === "配偶者"
                ? Boolean(spouse.basicDisabilityPensionPre20)
                : false;
          const factor = !pre20 ? 1 : incomeTotalYen >= 4794001 ? 0 : incomeTotalYen >= 3761001 ? 0.5 : 1;

          if (w === "世帯主") {
            if (!head.disabled || headBase === 0) return 0;
            const n = children.filter((c) => (Number(c?.age) || 0) < 18).length;
            const add = 239300 * Math.min(n, 2) + 79800 * Math.max(n - 2, 0);
            return Math.round((headBase + add) * factor);
          }
          if (w === "配偶者") {
            if (!spouseEnabled || !spouse.disabled || spouseBase === 0) return 0;
            return Math.round(spouseBase * factor);
          }
          return 0;
        };

        const calcTccaComputedLocal = (cols) => {
          if (!cols || cols.length === 0) return null;
          const headRow = cols.find((r) => r.who === "世帯主");
          const spouseRow = cols.find((r) => r.who === "配偶者");
          const headTotalWan = Number(headRow?.totalIncomeWan) || 0;
          const spouseTotalWan = Number(spouseRow?.totalIncomeWan) || 0;

          const incomeLimitYen = (kind, fuyoCount) => {
            const n = Math.max(0, Math.trunc(Number(fuyoCount) || 0));
            if (kind === "head") {
              const base = [4596000, 4976000, 5356000, 5736000];
              if (n <= 3) return base[n];
              return base[3] + 380000 * (n - 3);
            }
            const base = [6287000, 6536000, 6749000, 6962000];
            if (n <= 3) return base[n];
            return base[3] + 213000 * (n - 3);
          };

          const tccaDisWan = (who) => {
            const w = String(who || "");
            const r = cols.find((x) => String(x?.who || "") === w);
            return Number(r?.tccaDisWan) || 0;
          };

          const childDepMaxWan = 58;
          const isChildDep = (who) => {
            const r = cols.find((x) => String(x?.who || "") === String(who));
            return r ? (Number(r?.totalIncomeWan) || 0) <= childDepMaxWan : false;
          };

          const calcFuyoCount = () => {
            // NOTE: 扶養親族数（手当の所得制限用の人数カウント）は「扶養控除」と別ロジック。
            // 扶養控除は年齢帯が必要だが、扶養親族数カウントでは年齢制限をかけない（ユーザー指定）。
            const maxIncome = Number(dependentDeductionCfg?.dependent_total_income_max_wan) || 0;
            const spouseMax = Number(spouseDeductionITCfg?.spouse_total_income_max_wan) || 0;
            const spouseIsTarget =
              spouseEnabled && spouseRow ? (Number(spouseRow?.totalIncomeWan) || 0) <= spouseMax : false;

            const dependents = [];
            for (const r of cols) {
              if (!String(r?.who || "").startsWith("子ども")) continue;
              const total = Number(r?.totalIncomeWan) || 0;
              if (total > maxIncome) continue;
              dependents.push(r);
            }

            let base = 0;
            if (spouseIsTarget) base += 1;
            base += dependents.length;

            const addForHead = (row) => (Boolean(row?.disabled) ? 1 : 0);
            const addForFamily = (row) => {
              if (!Boolean(row?.disabled)) return 0;
              if (!Boolean(row?.tccaSpecial)) return 1;
              return Boolean(row?.cohabit) ? 2 : 1;
            };
            let add = 0;
            add += addForHead(headRow);
            if (spouseIsTarget) add += addForFamily(spouseRow);
            for (const r of dependents) add += addForFamily(r);
            return base + add;
          };

          const fuyoCount = calcFuyoCount();
          const headLimitYen = incomeLimitYen("head", fuyoCount);
          const familyLimitYen = incomeLimitYen("family", fuyoCount);

          const socialFixedWan = 8;
          const otherDedWan = Number(headRow?.otherDedWan) || 0;

          // 配偶者特別控除（TCCA: 住民税の控除額、配偶者控除は認めない前提）
          const spouseSpecialWan = spouseEnabled && headRow && spouseRow
            ? (() => {
                const cfg = spouseSpecialDeductionLTCfg;
                const headBands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
                const headBand = headBands.find(
                  (b) =>
                    headTotalWan >= (Number(b.head_min_wan) || 0) && headTotalWan <= (Number(b.head_max_wan) || 0)
                );
                if (!headBand) return 0;
                const spouseBands = Array.isArray(headBand.spouse_bands_wan) ? headBand.spouse_bands_wan : [];
                const sb = spouseBands.find(
                  (b) =>
                    spouseTotalWan >= (Number(b.spouse_min_wan) || 0) && spouseTotalWan <= (Number(b.spouse_max_wan) || 0)
                );
                return Number(sb?.amount_wan) || 0;
              })()
            : 0;

          // 扶養控除（特定扶養親族のみ）: 25万円/人（所得<=58の子どもだけカウント）
          let specialDependentCount = 0;
          for (const r of cols) {
            if (!String(r?.who || "").startsWith("子ども")) continue;
            const age = Number(r?.age) || 0;
            if (age < 19 || age > 22) continue;
            if (!isChildDep(r?.who)) continue;
            specialDependentCount += 1;
          }
          const specialDependentDedWan = 25 * specialDependentCount;

          const hasDependentChild = cols.some((r) => String(r?.who || "").startsWith("子ども") && isChildDep(r?.who));
          const headIncomeOk = headTotalWan <= 500;
          const widowApplied =
            headIncomeOk && Boolean(headRow?.widowWan) && !(widowDeductionCfg?.requires_no_spouse && spouseEnabled);
          const singleParentApplied =
            headIncomeOk &&
            Boolean(headRow?.singleParentWan) &&
            !(singleParentDeductionCfg?.requires_no_spouse && spouseEnabled);
          const widowWan = hasDependentChild && widowApplied ? 27 : 0;
          const singleParentWan = hasDependentChild && singleParentApplied ? 35 : 0;
          const workingStudentWan = Boolean(headRow?.workingStudent) ? 27 : 0;

          const spouseMaxForDep = Number(spouseDeductionITCfg?.spouse_total_income_max_wan) || 58;
          const spouseIsDep =
            spouseEnabled && spouseRow ? (Number(spouseRow?.totalIncomeWan) || 0) <= spouseMaxForDep : false;
          let disabilityDedWan = 0;
          disabilityDedWan += tccaDisWan("世帯主");
          if (spouseIsDep) disabilityDedWan += tccaDisWan("配偶者");
          for (const r of cols) {
            const who = String(r?.who || "");
            if (!who.startsWith("子ども")) continue;
            if (!isChildDep(who)) continue;
            disabilityDedWan += tccaDisWan(who);
          }

          const headDedSumWan =
            socialFixedWan +
            otherDedWan +
            spouseSpecialWan +
            specialDependentDedWan +
            widowWan +
            singleParentWan +
            workingStudentWan +
            disabilityDedWan;
          const headAdjustedWan = Math.max(0, headTotalWan - headDedSumWan);

          const familyByWho = new Map();
          const addFamily = (who, totalWan, wsWan, disWan) => {
            const dedSumWan = socialFixedWan + wsWan + disWan;
            const adjustedWan = Math.max(0, (Number(totalWan) || 0) - dedSumWan);
            familyByWho.set(String(who), {
              who: String(who),
              totalWan: Number(totalWan) || 0,
              socialFixedWan,
              wsWan,
              disWan,
              dedSumWan,
              adjustedWan,
              adjustedYen: Math.round(adjustedWan * 10000),
            });
          };
          if (spouseEnabled && spouseRow) {
            addFamily(
              "配偶者",
              spouseTotalWan,
              Boolean(spouseRow?.workingStudent) ? 27 : 0,
              // 扶養（<=58）なら世帯主側に付く（=配偶者側は0）
              spouseIsDep ? 0 : tccaDisWan("配偶者")
            );
          }
          for (const r of cols) {
            const who = String(r?.who || "");
            if (!who.startsWith("子ども")) continue;
            const disWan = isChildDep(who) ? 0 : tccaDisWan(who);
            addFamily(who, Number(r?.totalIncomeWan) || 0, Boolean(r?.workingStudent) ? 27 : 0, disWan);
          }
          const familyTargets = Array.from(familyByWho.values());
          const familyMaxAdjustedYen = familyTargets.length ? Math.max(...familyTargets.map((x) => x.adjustedYen)) : 0;

          const gradeToMonthlyYen = (g) => (g === "1" ? 56800 : g === "2" ? 37830 : 0);
          const baseMonthlyYen = cols
            .filter((r) => String(r?.who || "").startsWith("子ども"))
            .reduce((a, r) => {
              const age = Number(r?.age) || 0;
              if (age >= 20) return a;
              const g = String(r?.tccaGrade || "not");
              if (g === "not") return a;
              return a + gradeToMonthlyYen(g);
            }, 0);

          const headOk = Math.round(headAdjustedWan * 10000) <= headLimitYen;
          const familyOk = familyMaxAdjustedYen <= familyLimitYen;
          const totalMonthlyYen = headOk && familyOk ? baseMonthlyYen : 0;

          return {
            fuyoCount,
            limits: { headLimitYen, familyLimitYen },
            head: {
              totalWan: headTotalWan,
              socialFixedWan,
              otherDedWan,
              spouseSpecialWan,
              specialDependentCount,
              specialDependentDedWan,
              hasDependentChild,
              widowWan,
              singleParentWan,
              workingStudentWan,
              disabilityDedWan,
              dedSumWan: headDedSumWan,
              adjustedWan: headAdjustedWan,
              adjustedYen: Math.round(headAdjustedWan * 10000),
            },
            familyByWho,
            familyMaxAdjustedYen,
            totalMonthlyYen,
          };
        };

        const calcWelfareAllowanceLimitSelfYen = (fuyoCount) => {
          const n = Math.max(0, Math.trunc(Number(fuyoCount) || 0));
          const base = [3661000, 4041000, 4421000, 4801000];
          if (n <= 3) return base[n];
          return base[3] + 380000 * (n - 3);
        };
        const calcWelfareAllowanceLimitObligorYen = (fuyoCount) => {
          const n = Math.max(0, Math.trunc(Number(fuyoCount) || 0));
          const base0to4 = [6287000, 6536000, 6749000, 6962000, 7175000];
          if (n <= 4) return base0to4[n];
          const base5 = base0to4[4] + 213000;
          return base5 + 213000 * (n - 5);
        };

        const computePoint = (x) => {
          const rows = buildRows(x);
          const dep = calcDependentDeductionFromRows(rows);
          const kin = calcSpecialKinDeductionFromRows(rows);
          const spIT = calcSpouseDeductionFromRows(spouseDeductionITCfg, rows);
          const spLT = calcSpouseDeductionFromRows(spouseDeductionLTCfg, rows);
          const spSpIT = calcSpouseSpecialDeductionFromRows(spouseSpecialDeductionITCfg, spIT, rows);
          const spSpLT = calcSpouseSpecialDeductionFromRows(spouseSpecialDeductionLTCfg, spLT, rows);
          const ws = calcWidowSingleParent(rows);

          const headRow = rows.find((r) => r.who === "世帯主");
          const headDedCommonIT =
            (Number(ws.widow.itWan) || 0) +
            (Number(ws.singleParent.itWan) || 0) +
            (Boolean(headRow?.workingStudent) ? wsAmtIT : 0) +
            (Number(headRow?.otherDedWan) || 0) +
            (Number(spIT) || 0) +
            (Number(spSpIT) || 0) +
            (Number(dep.itWan) || 0);
          const headDedCommonLT =
            (Number(ws.widow.ltWan) || 0) +
            (Number(ws.singleParent.ltWan) || 0) +
            (Boolean(headRow?.workingStudent) ? wsAmtLT : 0) +
            (Number(headRow?.otherDedWan) || 0) +
            (Number(spLT) || 0) +
            (Number(spSpLT) || 0) +
            (Number(dep.ltWan) || 0);
          const headDedCommonITWithKin = headDedCommonIT + (Number(kin.itWan) || 0);
          const headDedCommonLTWithKin = headDedCommonLT + (Number(kin.ltWan) || 0);

          // taxes & social
          let socialWanTotal = 0;
          let taxWanTotal = 0;
          const levyByWho = new Map();
          const byWho = new Map(rows.map((r) => [String(r.who), r]));
          for (const r of rows) {
            socialWanTotal += Number(r.socialWan) || 0;
            const taxableIT = getTaxable(r, "it", rows, headDedCommonITWithKin);
            const taxableLT = getTaxable(r, "lt", rows, headDedCommonLTWithKin);
            const taxIT = getTax(taxableIT, "it");
            const taxLT = getTax(taxableLT, "lt");
            taxWanTotal += (Number(taxIT) || 0) + (Number(taxLT) || 0);
            levyByWho.set(String(r.who), {
              who: String(r.who),
              age: Number(r.age) || 0,
              levyWan: getResidentIncomeLevyWan(taxLT),
            });
          }

          // 障害福祉サービス利用料（年額: 万円）
          const householdLevySumWan = Array.from(levyByWho.values()).reduce((a, v) => a + (Number(v.levyWan) || 0), 0);
          const levySumWanFor = (who) => {
            const w = String(who);
            const r = levyByWho.get(w);
            if (!r) return 0;
            const age = Number(r.age) || 0;
            if (String(w).startsWith("子ども") && age >= 18) return Number(r.levyWan) || 0;
            if (age >= 18) {
              if (w === "世帯主") {
                const sp = spouseEnabled ? Number(levyByWho.get("配偶者")?.levyWan) || 0 : 0;
                return (Number(r.levyWan) || 0) + sp;
              }
              if (w === "配偶者") {
                const hd = Number(levyByWho.get("世帯主")?.levyWan) || 0;
                return (Number(r.levyWan) || 0) + hd;
              }
              return Number(r.levyWan) || 0;
            }
            return householdLevySumWan;
          };
          const isDisabledWho = (who) => Boolean(byWho.get(String(who))?.disabled);
          const monthlyFeeYen = (sumLevyWan, age) => {
            const s = Number(sumLevyWan) || 0;
            const a = Number(age) || 0;
            if (s <= 0) return 0;
            if (a >= 18) return s < 16 ? 9300 : 37200;
            if (a >= 3 && a <= 5) return 0; // 3〜5歳は無償
            return s < 28 ? 4600 : 37200;
          };
          let serviceFeeMonthlyYenTotal = 0;
          for (const r of rows) {
            if (!isDisabledWho(r.who)) continue;
            serviceFeeMonthlyYenTotal += monthlyFeeYen(levySumWanFor(r.who), r.age);
          }
          const serviceFeeWanTotal = (serviceFeeMonthlyYenTotal * 12) / 10000;

          // 手当合計（年額: 万円）
          const basicPensionWan = (() => {
            const headYen = calcBasicDisabilityPensionYenFor("世帯主", Number(byWho.get("世帯主")?.totalIncomeWan) || 0);
            const spouseYen = spouseEnabled
              ? calcBasicDisabilityPensionYenFor("配偶者", Number(byWho.get("配偶者")?.totalIncomeWan) || 0)
              : 0;
            return (headYen + spouseYen) / 10000;
          })();

          const tcca = calcTccaComputedLocal(rows);
          const tccaAnnualWan = ((Number(tcca?.totalMonthlyYen) || 0) * 12) / 10000;
          const fuyo = Number(tcca?.fuyoCount) || 0;

          // 障害児福祉手当 / 特別障害者手当
          const WELFARE_CHILD_MONTHLY_YEN = 16100;
          const TOKUBETSU_MONTHLY_YEN = 29590;
          const limitSelfYen = calcWelfareAllowanceLimitSelfYen(0);
          const limitObligorYen = calcWelfareAllowanceLimitObligorYen(fuyo);
          const obligorCols = [
            rows.find((r) => r.who === "世帯主"),
            spouseEnabled ? rows.find((r) => r.who === "配偶者") : null,
          ].filter(Boolean);
          const calcWelfareDisabilityDeductionWan = (col, mode) => {
            const who = String(col?.who || "");
            const selfDisWan = Number(col?.welfareDisWan) || 0;
            const depMaxWan = 58;
            const isDepLike = (w) => {
              const rr = rows.find((x) => String(x?.who || "") === String(w));
              return rr ? (Number(rr?.totalIncomeWan) || 0) <= depMaxWan : false;
            };
            const depDisWan = (() => {
              if (who !== "世帯主") return 0;
              let sum = 0;
              if (spouseEnabled && isDepLike("配偶者")) {
                const rr = rows.find((x) => String(x?.who || "") === "配偶者");
                sum += Number(rr?.welfareDisWan) || 0;
              }
              for (const rr of rows) {
                const w = String(rr?.who || "");
                if (!w.startsWith("子ども")) continue;
                if (!isDepLike(w)) continue;
                sum += Number(rr?.welfareDisWan) || 0;
              }
              return sum;
            })();
            if (mode === "obligor") return depDisWan + selfDisWan;
            return depDisWan;
          };
          const calcWelfareAdjustedIncomeYen = (col, mode = "self") => {
            const totalWan = Number(col?.totalIncomeWan) || 0;
            const who = String(col?.who || "");
            const headRow2 = rows.find((rr) => rr.who === "世帯主");
            const headTotalForLimitWan = Number(headRow2?.totalIncomeWan) || 0;
            const headIncomeOk = headTotalForLimitWan <= 500;
            const otherDedWan = who === "世帯主" ? Number(headRow2?.otherDedWan) || 0 : 0;
            // NOTE: 既存実装に合わせて「所得税側」の配偶者特別控除を使う
            const spouseSpecialWan = who === "世帯主" ? Number(spSpIT) || 0 : 0;
            const socialWan = Number(col?.socialWan) || 0;
            const widowWan =
              who === "世帯主" &&
              headIncomeOk &&
              Number(headRow2?.widowWan) &&
              !(widowDeductionCfg?.requires_no_spouse && spouseEnabled)
                ? 27
                : 0;
            const singleParentWan =
              who === "世帯主" &&
              headIncomeOk &&
              Number(headRow2?.singleParentWan) &&
              !(singleParentDeductionCfg?.requires_no_spouse && spouseEnabled)
                ? 35
                : 0;
            const wsWan = Boolean(col?.workingStudent) ? 27 : 0;
            const disWan = calcWelfareDisabilityDeductionWan(col, mode);
            const deductionsWan = otherDedWan + spouseSpecialWan + socialWan + widowWan + singleParentWan + wsWan + disWan;
            const adjustedWan = Math.max(0, totalWan - deductionsWan);
            return Math.round(adjustedWan * 10000);
          };
          const obligorMaxYen = obligorCols.length ? Math.max(...obligorCols.map((o) => calcWelfareAdjustedIncomeYen(o, "obligor"))) : 0;
          const obligorOk = obligorMaxYen <= limitObligorYen;

          const recipients = rows
            .map((c) => {
              const age = Number(c?.age) || 0;
              const who = String(c?.who || "");
              const idx = who.startsWith("子ども") ? Number(who.replace("子ども", "")) - 1 : -1;
              const cc = idx >= 0 ? children?.[idx] : null;
              const isWelfareChild =
                age < 20 &&
                (who === "世帯主"
                  ? Boolean(head.childWelfareAllowance)
                  : who === "配偶者"
                    ? Boolean(spouse.childWelfareAllowance)
                    : Boolean(cc?.childWelfareAllowance));
              const isTokubetsu =
                age >= 20 &&
                (who === "世帯主"
                  ? Boolean(head.tokubetsuAllowance)
                  : who === "配偶者"
                    ? Boolean(spouse.tokubetsuAllowance)
                    : Boolean(cc?.tokubetsuAllowance));
              if (!isWelfareChild && !isTokubetsu) return null;
              const type = isWelfareChild ? "child" : "adult";
              const selfYen = calcWelfareAdjustedIncomeYen(c, "self");
              const selfOk = selfYen <= limitSelfYen;
              const ok = selfOk && obligorOk;
              const monthlyYen = ok ? (type === "child" ? WELFARE_CHILD_MONTHLY_YEN : TOKUBETSU_MONTHLY_YEN) : 0;
              return { type, ok, monthlyYen };
            })
            .filter(Boolean);
          const welfareMonthly = recipients.reduce((a, r) => a + (Number(r.monthlyYen) || 0), 0);
          const welfareAnnualWan = (welfareMonthly * 12) / 10000;

          // 児童扶養手当（年額: 万円）
          const childSupportAnnualWan = (() => {
            const isSingleParent = Boolean(head.singleParentWan) && !spouseEnabled;
            if (!isSingleParent) return 0;
            const fuyo2 = fuyo;
            const idx = Math.min(5, Math.max(0, Math.trunc(Number(fuyo2) || 0)));
            const base = tcca || { head: { adjustedWan: 0 } };
            const h = base?.head || {};
            const totalWan = Number(h.totalWan) || 0;
            const dedSumWan = Number(h.dedSumWan) || 0;
            const widowWan = Number(h.widowWan) || 0;
            const singleParentWan = Number(h.singleParentWan) || 0;
            const spouseSpecialWan = Number(h.spouseSpecialWan) || 0;
            const specialDependentDedWan = Number(h.specialDependentDedWan) || 0;
            const dedSumNo =
              Math.max(0, dedSumWan - widowWan - singleParentWan - spouseSpecialWan - specialDependentDedWan);
            const adjustedWan = Math.max(0, totalWan - dedSumNo);
            const incomeYen = Math.round(adjustedWan * 10000);

            const fullLimitWanByFuyo = [68, 106, 144, 183, 220, 259];
            const partialLimitWanByFuyo = [208, 246, 284, 322, 260, 398];
            const fullLimitWan = fullLimitWanByFuyo[idx] ?? fullLimitWanByFuyo[5];
            const partialLimitWan = partialLimitWanByFuyo[idx] ?? partialLimitWanByFuyo[5];
            const fullLimitYen = Math.round(fullLimitWan * 10000);
            const partialLimitYen = Math.round(partialLimitWan * 10000);

            const status = incomeYen <= fullLimitYen ? "満額" : incomeYen <= partialLimitYen ? "一部" : "対象外";

            const eligibleChildren = children.filter((c) => {
              const age = Number(c?.age) || 0;
              const dis = Boolean(c?.disabled);
              return age < 19 || (dis && age < 20);
            });
            const n = eligibleChildren.length;
            if (n === 0 || status === "対象外") return 0;
            if (status === "満額") {
              const monthly = 46690 + Math.max(0, n - 1) * 11030;
              return (monthly * 12) / 10000;
            }
            const delta = Math.max(0, incomeYen - fullLimitYen);
            const first = Math.max(0, 46690 - (delta * 0.0256619 + 10));
            const add = Math.max(0, 11030 - (delta * 0.0039568 + 10));
            const monthly = Math.round(first + Math.max(0, n - 1) * add);
            return (monthly * 12) / 10000;
          })();

          // 児童手当（年額: 万円）
          const childAllowanceAnnualWan = (() => {
            const kids = children
              .map((c, i) => ({ ...c, __idx: i, age: Number(c?.age) || 0 }))
              .filter((c) => c.age < 18)
              .sort((a, b) => (b.age - a.age) || (a.__idx - b.__idx));
            let monthly = 0;
            for (let i = 0; i < kids.length; i++) {
              const c = kids[i];
              const order = i + 1;
              const isThirdPlus = order >= 3;
              if (isThirdPlus) {
                monthly += 30000;
                continue;
              }
              if (c.age <= 2) monthly += 15000;
              else monthly += 10000;
            }
            return (monthly * 12) / 10000;
          })();

          const allowanceWanTotal =
            (Number(basicPensionWan) || 0) +
            (Number(tccaAnnualWan) || 0) +
            (Number(welfareAnnualWan) || 0) +
            (Number(childSupportAnnualWan) || 0) +
            (Number(childAllowanceAnnualWan) || 0);

          // household totals
          const grossWan = rows.reduce((a, r) => a + (Number(r.salaryWan) || 0) + (Number(r.otherIncomeWan) || 0), 0);
          // 手取り（税・社保控除後）
          const takeHomeWan = grossWan - (Number(socialWanTotal) || 0) - (Number(taxWanTotal) || 0);
          // 可処分所得（= 手取り + 手当 − サービス利用料）
          const disposableWan =
            (Number(takeHomeWan) || 0) + (Number(allowanceWanTotal) || 0) - (Number(serviceFeeWanTotal) || 0);
          // グラフ表示は「収入を+側」「支出を-側」に積み上げる。
          const expTax = -(Number(taxWanTotal) || 0);
          const expSocial = -(Number(socialWanTotal) || 0);
          const expService = -(Number(serviceFeeWanTotal) || 0);
          const totalPlusWan = (Number(grossWan) || 0) + (Number(allowanceWanTotal) || 0);

          return {
            x,
            gross: grossWan,
            allowance: allowanceWanTotal,
            takeHome: takeHomeWan,
            disposable: disposableWan,
            expTax,
            expSocial,
            expService,
            // 表表示用（正の値）
            service: Number(serviceFeeWanTotal) || 0,
            tax: Number(taxWanTotal) || 0,
            social: Number(socialWanTotal) || 0,
            totalPlus: totalPlusWan,
          };
        };

        const out = [];
        for (let x = SWEEP_MIN_X; x <= SWEEP_MAX_X; x += SWEEP_STEP) out.push(computePoint(x));
        if (cancelled) return;
        setHouseholdSeries(out);
        setSeriesReady(true);
        setDisplayHeadSalaryWan((v) => clampInt(Number(v) || 0, SWEEP_MIN_X, SWEEP_MAX_X));
      } catch (e) {
        console.error("series compute error", e);
        if (!cancelled) setSeriesReady(true);
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    calcVersion,
    staticReady,
    empStatic,
    basicITStatic,
    basicLTStatic,
    socialU40Static,
    socialO40Static,
    taxTableStatic,
    taxModel,
    MUNICIPAL_TAX_RATE,
    head,
    spouseEnabled,
    spouse,
    children,
  ]);

  const calcSpouseDeductionWan = (cfg) => {
    if (!spouseEnabled || !employmentIncomeRows) return 0;
    const headRow = employmentIncomeRows.find((r) => r.who === "世帯主");
    const spouseRow = employmentIncomeRows.find((r) => r.who === "配偶者");
    const headTotal = Number(headRow?.totalIncomeWan) || 0;
    const spouseTotal = Number(spouseRow?.totalIncomeWan) || 0;
    const spouseMax = Number(cfg?.spouse_total_income_max_wan) || 0;
    if (spouseTotal > spouseMax) return 0;
    const bands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
    const b = bands.find((x) => headTotal >= (Number(x.min_wan) || 0) && headTotal <= (Number(x.max_wan) || 0));
    return Number(b?.amount_wan) || 0;
  };

  // 配偶者控除（世帯主側）：所得税と住民税で別額
  const spouseDeductionITWan = useMemo(() => {
    if (!spouseEnabled || !employmentIncomeRows) return 0;
    return calcSpouseDeductionWan(spouseDeductionITCfg);
  }, [spouseEnabled, employmentIncomeRows]);

  const spouseDeductionLTWan = useMemo(() => {
    if (!spouseEnabled || !employmentIncomeRows) return 0;
    return calcSpouseDeductionWan(spouseDeductionLTCfg);
  }, [spouseEnabled, employmentIncomeRows]);

  const calcSpouseSpecialDeductionWan = (cfg, spouseDeductionWan) => {
    if (!spouseEnabled || !employmentIncomeRows) return 0;
    if (spouseDeductionWan !== 0 && cfg?.applies_when_spouse_deduction_is_zero) return 0;

    const headRow = employmentIncomeRows.find((r) => r.who === "世帯主");
    const spouseRow = employmentIncomeRows.find((r) => r.who === "配偶者");
    const headTotal = Number(headRow?.totalIncomeWan) || 0;
    const spouseTotal = Number(spouseRow?.totalIncomeWan) || 0;

    const headBands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
    const headBand = headBands.find(
      (b) => headTotal >= (Number(b.head_min_wan) || 0) && headTotal <= (Number(b.head_max_wan) || 0)
    );
    if (!headBand) return 0;
    const spouseBands = Array.isArray(headBand.spouse_bands_wan) ? headBand.spouse_bands_wan : [];
    const sb = spouseBands.find(
      (b) => spouseTotal >= (Number(b.spouse_min_wan) || 0) && spouseTotal <= (Number(b.spouse_max_wan) || 0)
    );
    return Number(sb?.amount_wan) || 0;
  };

  const spouseSpecialDeductionITWan = useMemo(
    () => calcSpouseSpecialDeductionWan(spouseSpecialDeductionITCfg, spouseDeductionITWan),
    [spouseEnabled, employmentIncomeRows, spouseDeductionITWan]
  );

  const spouseSpecialDeductionLTWan = useMemo(
    () => calcSpouseSpecialDeductionWan(spouseSpecialDeductionLTCfg, spouseDeductionLTWan),
    [spouseEnabled, employmentIncomeRows, spouseDeductionLTWan]
  );

  const tccaComputed = useMemo(() => {
    // 特別児童扶養手当（所得制限判定）用の「判定所得」や扶養親族数は、
    // 所得カード（employmentIncomeRows）の値を唯一のソースとして使う。
    const cols = employmentIncomeRows;
    if (!cols || cols.length === 0) return null;

    const headRow = cols.find((r) => r.who === "世帯主");
    const spouseRow = cols.find((r) => r.who === "配偶者");
    const headTotalWan = Number(headRow?.totalIncomeWan) || 0;
    const spouseTotalWan = Number(spouseRow?.totalIncomeWan) || 0;

    // --- helper ---
    const incomeLimitYen = (kind, fuyoCount) => {
      // kind: "head" | "family"（配偶者＋扶養義務者）
      const n = Math.max(0, Math.trunc(Number(fuyoCount) || 0));
      if (kind === "head") {
        const base = [4596000, 4976000, 5356000, 5736000];
        if (n <= 3) return base[n];
        return base[3] + 380000 * (n - 3);
      }
      const base = [6287000, 6536000, 6749000, 6962000];
      if (n <= 3) return base[n];
      return base[3] + 213000 * (n - 3);
    };

    const tccaDisWan = (who) => {
      // TCCA の障害控除（27/40万円）は、所得カード側で列に持たせた値（tccaDisWan）を参照する。
      // これにより、TCCA計算表だけの独自計算を避ける。
      const w = String(who || "");
      const r = cols.find((x) => String(x?.who || "") === w);
      return Number(r?.tccaDisWan) || 0;
    };

    const childDepMaxWan = 58; // TCCA の「扶養判定」（ユーザー指定）
    const isChildDep = (who) => {
      const r = cols.find((x) => String(x?.who || "") === String(who));
      return r ? (Number(r?.totalIncomeWan) || 0) <= childDepMaxWan : false;
    };

    // --- 扶養親族数（障害加算込み） ---
    const calcFuyoCount = () => {
      // NOTE: 元実装を「所得カードの cols」参照に寄せたもの。
      // NOTE: 扶養親族数（手当の所得制限用の人数カウント）は「扶養控除」と別ロジック。
      // 扶養控除は年齢帯が必要だが、扶養親族数カウントでは年齢制限をかけない（ユーザー指定）。
      const maxIncome = Number(dependentDeductionCfg?.dependent_total_income_max_wan) || 0;

      const spouseMax = Number(spouseDeductionITCfg?.spouse_total_income_max_wan) || 0;
      const spouseIsTarget =
        spouseEnabled && spouseRow ? (Number(spouseRow?.totalIncomeWan) || 0) <= spouseMax : false;

      const dependents = [];
      for (const r of cols) {
        if (!String(r?.who || "").startsWith("子ども")) continue;
        const total = Number(r?.totalIncomeWan) || 0;
        if (total > maxIncome) continue;
        dependents.push(r);
      }

      let base = 0;
      if (spouseIsTarget) base += 1;
      base += dependents.length;

      // 障害加算（ユーザー指定）
      // - 世帯主: 障害者なら +1（特別/同居の区別なし）
      // - 配偶者・扶養親族: 障害者 +1 / 特別障害者かつ同居 +2（同居特別も+2）
      const addForHead = (row) => (Boolean(row?.disabled) ? 1 : 0);
      const addForFamily = (row) => {
        if (!Boolean(row?.disabled)) return 0;
        if (!Boolean(row?.tccaSpecial)) return 1;
        return Boolean(row?.cohabit) ? 2 : 1;
      };

      let add = 0;
      add += addForHead(headRow);
      if (spouseIsTarget) add += addForFamily(spouseRow);
      for (const r of dependents) add += addForFamily(r);

      return base + add;
    };

    const fuyoCount = calcFuyoCount();
    const headLimitYen = incomeLimitYen("head", fuyoCount);
    const familyLimitYen = incomeLimitYen("family", fuyoCount);

    // --- 判定所得（世帯主） ---
    const socialFixedWan = 8;
    const otherDedWan = Number(headRow?.otherDedWan) || 0;

    // 配偶者特別控除（TCCA: 住民税の控除額、配偶者控除は認めない前提）
    const spouseSpecialWan =
      spouseEnabled && headRow && spouseRow
        ? (() => {
            const cfg = spouseSpecialDeductionLTCfg;
            const headBands = Array.isArray(cfg?.head_total_income_bands_wan) ? cfg.head_total_income_bands_wan : [];
            const headBand = headBands.find(
              (b) =>
                headTotalWan >= (Number(b.head_min_wan) || 0) && headTotalWan <= (Number(b.head_max_wan) || 0)
            );
            if (!headBand) return 0;
            const spouseBands = Array.isArray(headBand.spouse_bands_wan) ? headBand.spouse_bands_wan : [];
            const sb = spouseBands.find(
              (b) =>
                spouseTotalWan >= (Number(b.spouse_min_wan) || 0) && spouseTotalWan <= (Number(b.spouse_max_wan) || 0)
            );
            return Number(sb?.amount_wan) || 0;
          })()
        : 0;

    // 扶養控除（特定扶養親族のみ）: 25万円/人（所得<=58の子どもだけカウント）
    let specialDependentCount = 0;
    for (const r of cols) {
      if (!String(r?.who || "").startsWith("子ども")) continue;
      const age = Number(r?.age) || 0;
      if (age < 19 || age > 22) continue;
      if (!isChildDep(r?.who)) continue;
      specialDependentCount += 1;
    }
    const specialDependentDedWan = 25 * specialDependentCount;

    const hasDependentChild = cols.some((r) => String(r?.who || "").startsWith("子ども") && isChildDep(r?.who));
    // 寡婦/ひとり親は「所得合計<=500万円」かつ（設定上は）配偶者なし条件も満たす場合にのみ適用（ユーザー指定）
    const headIncomeOk = headTotalWan <= 500;
    const widowApplied =
      headIncomeOk && Boolean(headRow?.widowWan) && !(widowDeductionCfg?.requires_no_spouse && spouseEnabled);
    const singleParentApplied =
      headIncomeOk &&
      Boolean(headRow?.singleParentWan) &&
      !(singleParentDeductionCfg?.requires_no_spouse && spouseEnabled);
    const widowWan = hasDependentChild && widowApplied ? 27 : 0;
    const singleParentWan = hasDependentChild && singleParentApplied ? 35 : 0;
    const workingStudentWan = Boolean(headRow?.workingStudent) ? 27 : 0;

    // 障害者控除（扶養配偶者/扶養親族に係るものを合算）（ユーザー指定）
    const spouseMaxForDep = Number(spouseDeductionITCfg?.spouse_total_income_max_wan) || 58;
    const spouseIsDep =
      spouseEnabled && spouseRow ? (Number(spouseRow?.totalIncomeWan) || 0) <= spouseMaxForDep : false;
    let disabilityDedWan = 0;
    disabilityDedWan += tccaDisWan("世帯主");
    if (spouseIsDep) disabilityDedWan += tccaDisWan("配偶者");
    for (const r of cols) {
      const who = String(r?.who || "");
      if (!who.startsWith("子ども")) continue;
      if (!isChildDep(who)) continue;
      disabilityDedWan += tccaDisWan(who);
    }

    const headDedSumWan =
      socialFixedWan +
      otherDedWan +
      spouseSpecialWan +
      specialDependentDedWan +
      widowWan +
      singleParentWan +
      workingStudentWan +
      disabilityDedWan;
    const headAdjustedWan = Math.max(0, headTotalWan - headDedSumWan);

    // --- 判定所得（配偶者＋扶養義務者: 個別値と最大値） ---
    const familyByWho = new Map();
    const addFamily = (who, totalWan, wsWan, disWan) => {
      const dedSumWan = socialFixedWan + wsWan + disWan;
      const adjustedWan = Math.max(0, (Number(totalWan) || 0) - dedSumWan);
      familyByWho.set(String(who), {
        who: String(who),
        totalWan: Number(totalWan) || 0,
        socialFixedWan,
        wsWan,
        disWan,
        dedSumWan,
        adjustedWan,
        adjustedYen: Math.round(adjustedWan * 10000),
      });
    };
    if (spouseEnabled) {
      addFamily(
        "配偶者",
        spouseTotalWan,
        Boolean(spouseRow?.workingStudent) ? 27 : 0,
        // 配偶者の障害者控除は「扶養（所得<=58万円）」なら世帯主側に付く（=配偶者側は0）
        spouseIsDep ? 0 : tccaDisWan("配偶者")
      );
    }
    for (const r of cols) {
      const who = String(r?.who || "");
      if (!who.startsWith("子ども")) continue;
      // 子どもの障害者控除も同様に「扶養（所得<=58万円）」なら世帯主側に付く（=子ども側は0）
      const disWan = isChildDep(who) ? 0 : tccaDisWan(who);
      addFamily(who, Number(r?.totalIncomeWan) || 0, Boolean(r?.workingStudent) ? 27 : 0, disWan);
    }
    const familyTargets = Array.from(familyByWho.values());
    const familyMaxAdjustedYen = familyTargets.length ? Math.max(...familyTargets.map((x) => x.adjustedYen)) : 0;

    // --- 支給額（合計: 円/月） ---
    const gradeToMonthlyYen = (g) => (g === "1" ? 56800 : g === "2" ? 37830 : 0);
    const baseMonthlyYen = cols
      .filter((r) => String(r?.who || "").startsWith("子ども"))
      .reduce((a, r) => {
        const age = Number(r?.age) || 0;
        if (age >= 20) return a;
        const g = String(r?.tccaGrade || "not");
        if (g === "not") return a;
        return a + gradeToMonthlyYen(g);
      }, 0);

    const headOk = Math.round(headAdjustedWan * 10000) <= headLimitYen;
    const familyOk = familyMaxAdjustedYen <= familyLimitYen;
    const totalMonthlyYen = headOk && familyOk ? baseMonthlyYen : 0;

    const spouseComputed = spouseEnabled ? familyByWho.get("配偶者") : null;

    return {
      fuyoCount,
      limits: { headLimitYen, familyLimitYen },
      head: {
        totalWan: headTotalWan,
        socialFixedWan,
        otherDedWan,
        spouseSpecialWan,
        specialDependentCount,
        specialDependentDedWan,
        hasDependentChild,
        widowWan,
        singleParentWan,
        workingStudentWan,
        disabilityDedWan,
        dedSumWan: headDedSumWan,
        adjustedWan: headAdjustedWan,
        adjustedYen: Math.round(headAdjustedWan * 10000),
      },
      spouse: {
        enabled: spouseEnabled,
        totalWan: spouseComputed ? Number(spouseComputed.totalWan) || 0 : spouseTotalWan,
        socialFixedWan,
        workingStudentWan: spouseComputed ? Number(spouseComputed.wsWan) || 0 : spouseEnabled && spouse.workingStudentWan ? 27 : 0,
        disabilityDedWan: spouseComputed ? Number(spouseComputed.disWan) || 0 : spouseEnabled ? (spouse.disabled ? (spouse.disabilityKind === "special" ? 40 : 27) : 0) : 0,
        dedSumWan: spouseComputed ? Number(spouseComputed.dedSumWan) || 0 : 0,
        adjustedWan: spouseComputed ? Number(spouseComputed.adjustedWan) || 0 : 0,
        adjustedYen: spouseComputed ? Number(spouseComputed.adjustedYen) || 0 : 0,
      },
      familyByWho,
      familyMaxAdjustedYen,
      ok: headOk && familyOk,
      baseMonthlyYen,
      totalMonthlyYen,
    };
  }, [
    employmentIncomeRows,
    spouseEnabled,
    head.disabled,
    head.disabilityKind,
    head.otherDedWan,
    head.widowWan,
    head.singleParentWan,
    head.workingStudentWan,
    spouse.disabled,
    spouse.disabilityKind,
    spouse.workingStudentWan,
    children,
  ]);

  return (
    <div className="App page welfare-sim">
      <h1 className="App-title">障害福祉負担シミュレーター</h1>

      <div className="tab-bar">
        <button
          className={`tab-btn ${viewTab === "inputs" ? "active" : ""}`}
          onClick={() => setViewTab("inputs")}
          type="button"
        >
          前提・描画入力
        </button>
        <button
          className={`tab-btn ${viewTab === "dynamic" ? "active" : ""}`}
          onClick={() => setViewTab("dynamic")}
          type="button"
        >
          入力反映グラフ
        </button>
      </div>

      {viewTab === "inputs" && (
        <div className="inputs-wrap">
          <div className="card mb">
            <h2 className="mt0">前提設定</h2>
            <ul style={{ marginTop: 8, lineHeight: 1.7, opacity: 0.85, fontSize: "clamp(11px, 2.6vw, 13px)" }}>
              <li>「給与以外の所得」は、事業所得、一時所得、雑所得等の合計額を入れてください。</li>
              <li>
                「その他の控除」は、雑損控除、医療費控除額、共済掛控除等の合計額を入れてください。配偶者控除、配偶者特別控除は入れないでください（自動で計算します）。
              </li>
              <li>年齢の単位は「歳」、収入等の単位は「万円／年」です。</li>
              <li>
                社会保険料は厚生年金保険を前提に「健康保険料、介護保険料、子ども・子育て支援金、厚生年金保険料、雇用保険料（一般）」を対象に年収に料率（協会けんぽ、東京都を参照）をかけて算出しています。
              </li>
            </ul>

            <div className="card mb" style={{ marginTop: 10 }}>
              <h2 className="mt0">1. 世帯主</h2>
              <div className="split2" style={{ marginTop: 8 }}>
                <div className="panel panel-normal">
                  <div className="panel-title">通常入力</div>
                  <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
                        <div className="row" style={{ margin: 0 }}>
                          <label>年齢</label>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            step={1}
                            value={headDraft.age}
                            onChange={(e) =>
                              setHeadDraft((p) => {
                                const age = e.target.value === "" ? "" : Number(e.target.value);
                                const n = Number(age) || 0;
                                return {
                                  ...p,
                                  age,
                                  // 20歳未満: 障害児福祉手当、20歳以上: 特別障害者手当
                                  tokubetsuAllowance: n < 20 ? false : Boolean(p.tokubetsuAllowance),
                                  childWelfareAllowance: n >= 20 ? false : Boolean(p.childWelfareAllowance),
                                };
                              })
                    }
                  />
                        </div>
                    <div className="row" style={{ margin: 0 }}>
                      <label>給与収入</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={headDraft.salaryWan}
                        onChange={(e) =>
                          setHeadDraft((p) => ({
                            ...p,
                            salaryWan: e.target.value === "" ? "" : Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="row" style={{ margin: 0 }}>
                      <label>給与以外の所得</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={headDraft.otherIncomeWan}
                        onChange={(e) =>
                          setHeadDraft((p) => ({
                            ...p,
                            otherIncomeWan: e.target.value === "" ? "" : Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="row" style={{ margin: 0 }}>
                      <label>寡婦</label>
                      <select
                        value={headDraft.widowWan}
                        onChange={(e) => setHeadDraft((p) => ({ ...p, widowWan: Number(e.target.value) || 0 }))}
                      >
                        <option value={0}>該当しない</option>
                        <option value={1}>該当する</option>
                      </select>
                    </div>
                    <div className="row" style={{ margin: 0 }}>
                      <label>ひとり親</label>
                      <select
                        value={headDraft.singleParentWan}
                        onChange={(e) =>
                          setHeadDraft((p) => ({ ...p, singleParentWan: Number(e.target.value) || 0 }))
                        }
                      >
                        <option value={0}>該当しない</option>
                        <option value={1}>該当する</option>
                      </select>
                    </div>
                    <div className="row" style={{ margin: 0 }}>
                      <label>勤労学生控除</label>
                      <select
                        value={headDraft.workingStudentWan}
                        onChange={(e) =>
                          setHeadDraft((p) => ({ ...p, workingStudentWan: Number(e.target.value) || 0 }))
                        }
                      >
                        <option value={0}>該当しない</option>
                        <option value={1}>該当する</option>
                      </select>
                    </div>
                    <div className="row" style={{ margin: 0 }}>
                      <label>その他の控除</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={headDraft.otherDedWan}
                        onChange={(e) =>
                          setHeadDraft((p) => ({
                            ...p,
                            otherDedWan: e.target.value === "" ? "" : Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="panel panel-disability">
                  <div className="panel-title">障害属性</div>
                  <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
                    <div className="row" style={{ margin: 0 }}>
                      <label>障害者</label>
                      <select
                        value={headDraft.disabled ? 1 : 0}
                        onChange={(e) =>
                          setHeadDraft((p) => ({
                            ...p,
                            disabled: Number(e.target.value) === 1,
                            disabilityKind: Number(e.target.value) === 1 ? (p.disabilityKind || "disabled") : "disabled",
                            tokubetsuAllowance:
                              Number(e.target.value) === 1 ? Boolean(p.tokubetsuAllowance) : false,
                            childWelfareAllowance:
                              Number(e.target.value) === 1 ? Boolean(p.childWelfareAllowance) : false,
                            basicDisabilityPensionGrade:
                              Number(e.target.value) === 1 ? (p.basicDisabilityPensionGrade || "none") : "none",
                            basicDisabilityPensionPre20:
                              Number(e.target.value) === 1 && (p.basicDisabilityPensionGrade || "none") !== "none"
                                ? Boolean(p.basicDisabilityPensionPre20)
                                : false,
                          }))
                        }
                      >
                        <option value={0}>いいえ</option>
                        <option value={1}>はい</option>
                      </select>
                    </div>
                    {headDraft.disabled && (
                      <div className="row" style={{ margin: 0 }}>
                        <label>区分</label>
                        <select
                          value={headDraft.disabilityKind}
                          onChange={(e) =>
                            setHeadDraft((p) => ({
                              ...p,
                              disabilityKind: e.target.value,
                            }))
                          }
                        >
                          <option value="disabled">障害者</option>
                          <option value="special">特別障害者</option>
                        </select>
                      </div>
                    )}
                    {headDraft.disabled && (
                      <div className="row" style={{ margin: 0 }}>
                        <label>{(Number(headDraft.age) || 0) < 20 ? "障害児福祉手当" : "特別障害者手当"}</label>
                        <select
                          value={
                            (Number(headDraft.age) || 0) < 20
                              ? headDraft.childWelfareAllowance ? 1 : 0
                              : headDraft.tokubetsuAllowance ? 1 : 0
                          }
                          onChange={(e) =>
                            setHeadDraft((p) => ({
                              ...p,
                              childWelfareAllowance:
                                (Number(p.age) || 0) < 20 ? Number(e.target.value) === 1 : Boolean(p.childWelfareAllowance),
                              tokubetsuAllowance:
                                (Number(p.age) || 0) >= 20 ? Number(e.target.value) === 1 : Boolean(p.tokubetsuAllowance),
                            }))
                          }
                        >
                          <option value={0}>該当しない</option>
                          <option value={1}>該当する</option>
                        </select>
                      </div>
                    )}
                    {headDraft.disabled && (
                      <div className="row" style={{ margin: 0 }}>
                        <label>障害基礎年金</label>
                        <select
                          value={headDraft.basicDisabilityPensionGrade || "none"}
                          onChange={(e) => {
                            const grade = e.target.value || "none";
                            setHeadDraft((p) => ({
                              ...p,
                              basicDisabilityPensionGrade: grade,
                              basicDisabilityPensionPre20: grade === "none" ? false : Boolean(p.basicDisabilityPensionPre20),
                            }));
                          }}
                        >
                          <option value="none">受給していない</option>
                          <option value="1">1級</option>
                          <option value="2">2級</option>
                        </select>
                      </div>
                    )}
                    {headDraft.disabled && (headDraft.basicDisabilityPensionGrade || "none") !== "none" && (
                      <div className="row" style={{ margin: 0 }}>
                        <label>20歳前傷病</label>
                        <select
                          value={headDraft.basicDisabilityPensionPre20 ? 1 : 0}
                          onChange={(e) =>
                            setHeadDraft((p) => ({
                              ...p,
                              basicDisabilityPensionPre20: Number(e.target.value) === 1,
                            }))
                          }
                        >
                          <option value={0}>該当しない</option>
                          <option value={1}>該当する</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="card mb">
              <h2 className="mt0">2. 配偶者</h2>
              {!spouseEnabledDraft ? (
                <button className="primary-btn" type="button" onClick={() => setSpouseEnabledDraft(true)}>
                  配偶者を追加
                </button>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontWeight: "bold" }}>配偶者</div>
                    <button
                      className="primary-btn"
                      type="button"
                      onClick={() => {
                        setSpouseEnabledDraft(false);
                        setSpouseDraft({
                          age: 40,
                          salaryWan: 0,
                          otherIncomeWan: 0,
                          workingStudentWan: 0,
                          disabled: false,
                          disabilityKind: "disabled",
                          tokubetsuAllowance: false,
                          basicDisabilityPensionGrade: "none",
                          basicDisabilityPensionPre20: false,
                        });
                      }}
                    >
                      削除
                    </button>
                  </div>
                  <div className="split2" style={{ marginTop: 8 }}>
                    <div className="panel panel-normal">
                      <div className="panel-title">通常入力</div>
                      <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
                        <div className="row" style={{ margin: 0 }}>
                          <label>年齢</label>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            step={1}
                            value={spouseDraft.age}
                            onChange={(e) =>
                              setSpouseDraft((p) => {
                                const age = e.target.value === "" ? "" : Number(e.target.value);
                                const n = Number(age) || 0;
                                return {
                                  ...p,
                                  age,
                                  tokubetsuAllowance: n < 20 ? false : Boolean(p.tokubetsuAllowance),
                                  childWelfareAllowance: n >= 20 ? false : Boolean(p.childWelfareAllowance),
                                };
                              })
                            }
                          />
                        </div>
                        <div className="row" style={{ margin: 0 }}>
                          <label>給与収入</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={spouseDraft.salaryWan}
                            onChange={(e) =>
                              setSpouseDraft((p) => ({
                                ...p,
                                salaryWan: e.target.value === "" ? "" : Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div className="row" style={{ margin: 0 }}>
                          <label>給与以外の所得</label>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={spouseDraft.otherIncomeWan}
                            onChange={(e) =>
                              setSpouseDraft((p) => ({
                                ...p,
                                otherIncomeWan: e.target.value === "" ? "" : Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div className="row" style={{ margin: 0 }}>
                          <label>勤労学生控除</label>
                          <select
                            value={spouseDraft.workingStudentWan}
                            onChange={(e) =>
                              setSpouseDraft((p) => ({
                                ...p,
                                workingStudentWan: Number(e.target.value) || 0,
                              }))
                            }
                          >
                            <option value={0}>該当しない</option>
                            <option value={1}>該当する</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="panel panel-disability">
                      <div className="panel-title">障害属性</div>
                      <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
                        <div className="row" style={{ margin: 0 }}>
                      <label>障害者</label>
                      <select
                        value={spouseDraft.disabled ? 1 : 0}
                        onChange={(e) =>
                          setSpouseDraft((p) => ({
                            ...p,
                            disabled: Number(e.target.value) === 1,
                            disabilityKind: Number(e.target.value) === 1 ? (p.disabilityKind || "disabled") : "disabled",
                            tokubetsuAllowance: Number(e.target.value) === 1 ? Boolean(p.tokubetsuAllowance) : false,
                            childWelfareAllowance: Number(e.target.value) === 1 ? Boolean(p.childWelfareAllowance) : false,
                            basicDisabilityPensionGrade:
                              Number(e.target.value) === 1 ? (p.basicDisabilityPensionGrade || "none") : "none",
                            basicDisabilityPensionPre20:
                              Number(e.target.value) === 1 && (p.basicDisabilityPensionGrade || "none") !== "none"
                                ? Boolean(p.basicDisabilityPensionPre20)
                                : false,
                          }))
                        }
                      >
                        <option value={0}>いいえ</option>
                        <option value={1}>はい</option>
                      </select>
                    </div>
                    {spouseDraft.disabled && (
                      <>
                        <div className="row" style={{ margin: 0 }}>
                          <label>区分</label>
                          <select
                            value={spouseDraft.disabilityKind}
                            onChange={(e) =>
                              setSpouseDraft((p) => ({
                                ...p,
                                disabilityKind: e.target.value,
                              }))
                            }
                          >
                            <option value="disabled">障害者</option>
                            <option value="special">特別障害者</option>
                          </select>
                        </div>
                        <div className="row" style={{ margin: 0 }}>
                          <label>{(Number(spouseDraft.age) || 0) < 20 ? "障害児福祉手当" : "特別障害者手当"}</label>
                          <select
                            value={
                              (Number(spouseDraft.age) || 0) < 20
                                ? spouseDraft.childWelfareAllowance ? 1 : 0
                                : spouseDraft.tokubetsuAllowance ? 1 : 0
                            }
                            onChange={(e) =>
                              setSpouseDraft((p) => ({
                                ...p,
                                childWelfareAllowance:
                                  (Number(p.age) || 0) < 20 ? Number(e.target.value) === 1 : Boolean(p.childWelfareAllowance),
                                tokubetsuAllowance:
                                  (Number(p.age) || 0) >= 20 ? Number(e.target.value) === 1 : Boolean(p.tokubetsuAllowance),
                              }))
                            }
                          >
                            <option value={0}>該当しない</option>
                            <option value={1}>該当する</option>
                          </select>
                        </div>
                        <div className="row" style={{ margin: 0 }}>
                          <label>障害基礎年金</label>
                          <select
                            value={spouseDraft.basicDisabilityPensionGrade || "none"}
                            onChange={(e) => {
                              const grade = e.target.value || "none";
                              setSpouseDraft((p) => ({
                                ...p,
                                basicDisabilityPensionGrade: grade,
                                basicDisabilityPensionPre20: grade === "none" ? false : Boolean(p.basicDisabilityPensionPre20),
                              }));
                            }}
                          >
                            <option value="none">受給していない</option>
                            <option value="1">1級</option>
                            <option value="2">2級</option>
                          </select>
                        </div>
                        {(spouseDraft.basicDisabilityPensionGrade || "none") !== "none" && (
                          <div className="row" style={{ margin: 0 }}>
                            <label>20歳前傷病</label>
                            <select
                              value={spouseDraft.basicDisabilityPensionPre20 ? 1 : 0}
                              onChange={(e) =>
                                setSpouseDraft((p) => ({
                                  ...p,
                                  basicDisabilityPensionPre20: Number(e.target.value) === 1,
                                }))
                              }
                            >
                              <option value={0}>該当しない</option>
                              <option value={1}>該当する</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="card mb">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <h2 className="mt0">3. 子ども（1〜N）</h2>
                <button className="primary-btn" type="button" onClick={addChildDraft}>
                  子どもを追加
                </button>
              </div>

              {childrenDraft.length === 0 ? (
                <p style={{ margin: "5px 0 0", lineHeight: 1.6, opacity: 0.85 }}>子どもがいない場合は追加不要です。</p>
              ) : (
                childrenDraft.map((c, idx) => (
                  <div key={c.id} className="card mb" style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontWeight: "bold" }}>子ども {idx + 1}</div>
                      <button className="primary-btn" type="button" onClick={() => removeChildDraft(c.id)}>
                        削除
                      </button>
                    </div>
                    <div className="split2" style={{ marginTop: 8 }}>
                      <div className="panel panel-normal">
                        <div className="panel-title">通常入力</div>
                        <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
                          <div className="row" style={{ margin: 0 }}>
                            <label>年齢</label>
                            <input
                              type="number"
                              min={0}
                              max={99}
                              step={1}
                              value={c.age}
                              onChange={(e) =>
                                setChildrenDraft((p) =>
                                  p.map((x) =>
                                    x.id === c.id
                                      ? (() => {
                                          const age = e.target.value === "" ? "" : Number(e.target.value);
                                          const n = Number(age) || 0;
                                          return {
                                            ...x,
                                            age,
                                            tokubetsuAllowance: n < 20 ? false : Boolean(x.tokubetsuAllowance),
                                            childWelfareAllowance: n >= 20 ? false : Boolean(x.childWelfareAllowance),
                                          };
                                        })()
                                      : x
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="row" style={{ margin: 0 }}>
                            <label>同居</label>
                            <select
                              value={c.cohabit !== false ? 1 : 0}
                              onChange={(e) =>
                                setChildrenDraft((p) =>
                                  p.map((x) =>
                                    x.id === c.id ? { ...x, cohabit: Number(e.target.value) === 1 } : x
                                  )
                                )
                              }
                            >
                              <option value={1}>同居</option>
                              <option value={0}>別居</option>
                            </select>
                          </div>
                          <div className="row" style={{ margin: 0 }}>
                            <label>給与収入</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={c.salaryWan}
                              onChange={(e) =>
                                setChildrenDraft((p) =>
                                  p.map((x) =>
                                    x.id === c.id
                                      ? { ...x, salaryWan: e.target.value === "" ? "" : Number(e.target.value) }
                                      : x
                                  )
                                )
                              }
                            />
                          </div>
                          <div className="row" style={{ margin: 0 }}>
                            <label>給与以外の所得</label>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={c.otherIncomeWan}
                              onChange={(e) =>
                                setChildrenDraft((p) =>
                                  p.map((x) =>
                                    x.id === c.id
                                      ? {
                                          ...x,
                                          otherIncomeWan: e.target.value === "" ? "" : Number(e.target.value),
                                        }
                                      : x
                                  )
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>

                      <div className="panel panel-disability">
                        <div className="panel-title">障害属性</div>
                        <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
                          <div className="row" style={{ margin: 0 }}>
                            <label>障害者</label>
                            <select
                              value={c.disabled ? 1 : 0}
                              onChange={(e) =>
                                setChildrenDraft((p) =>
                                  p.map((x) =>
                                    x.id === c.id
                                      ? {
                                          ...x,
                                          disabled: Number(e.target.value) === 1,
                                          // 無効化時は関連フラグをリセット
                                          specialDisabled:
                                            Number(e.target.value) === 1 ? Boolean(x.specialDisabled) : false,
                                          tccaGrade: Number(e.target.value) === 1 ? x.tccaGrade || "not" : "not",
                                          childWelfareAllowance:
                                            Number(e.target.value) === 1 ? Boolean(x.childWelfareAllowance) : false,
                                        }
                                      : x
                                  )
                                )
                              }
                            >
                              <option value={0}>いいえ</option>
                              <option value={1}>はい</option>
                            </select>
                          </div>
                          {c.disabled && (
                            <>
                              <div className="row" style={{ margin: 0 }}>
                                <label>特別障害者</label>
                                <select
                                  value={c.specialDisabled ? 1 : 0}
                                  onChange={(e) =>
                                    setChildrenDraft((p) =>
                                      p.map((x) =>
                                        x.id === c.id ? { ...x, specialDisabled: Number(e.target.value) === 1 } : x
                                      )
                                    )
                                  }
                                >
                                  <option value={0}>該当しない</option>
                                  <option value={1}>該当する</option>
                                </select>
                              </div>
                              <div className="row" style={{ margin: 0 }}>
                                <label>特別児童扶養手当</label>
                                <select
                                  value={c.tccaGrade || "not"}
                                  onChange={(e) =>
                                    setChildrenDraft((p) =>
                                      p.map((x) => (x.id === c.id ? { ...x, tccaGrade: e.target.value } : x))
                                    )
                                  }
                                >
                                  <option value="not">該当しない</option>
                                  <option value="1">1級相当</option>
                                  <option value="2">2級相当</option>
                                </select>
                              </div>
                              <div className="row" style={{ margin: 0 }}>
                                <label>{(Number(c.age) || 0) < 20 ? "障害児福祉手当" : "特別障害者手当"}</label>
                                <select
                                  value={
                                    (Number(c.age) || 0) < 20
                                      ? c.childWelfareAllowance ? 1 : 0
                                      : c.tokubetsuAllowance ? 1 : 0
                                  }
                                  onChange={(e) =>
                                    setChildrenDraft((p) =>
                                      p.map((x) =>
                                        x.id === c.id
                                          ? {
                                              ...x,
                                              childWelfareAllowance:
                                                (Number(x.age) || 0) < 20
                                                  ? Number(e.target.value) === 1
                                                  : Boolean(x.childWelfareAllowance),
                                              tokubetsuAllowance:
                                                (Number(x.age) || 0) >= 20
                                                  ? Number(e.target.value) === 1
                                                  : Boolean(x.tokubetsuAllowance),
                                            }
                                          : x
                                      )
                                    )
                                  }
                                >
                                  <option value={0}>該当しない</option>
                                  <option value={1}>該当する</option>
                                </select>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card mb">
	            <h2 className="mt0">計算</h2>
	            <div className="grid1-compact" style={{ gap: 12, marginTop: 4 }}>
	              <div className="row" style={{ margin: 0 }}>
	                <label>税控除モデル</label>
	                <select value={taxModelDraft} onChange={(e) => setTaxModelDraft(e.target.value)}>
	                  {scenarios.map((s) => (
	                    <option key={s.key} value={s.key}>
	                      {TAX_MODEL_LABEL?.[s.key] || s.label || s.key}
	                    </option>
	                  ))}
	                </select>
	              </div>
	            </div>
            <div className="inputs-actions" style={{ marginTop: 12 }}>
              <button className="primary-btn primary-btn-lg" type="button" onClick={applyDraft}>
                計算
              </button>
            </div>
          </div>

          {calcVersion > 0 && (
            <>
              {!staticReady ? (
                <div className="card mb">
                  <h2 className="mt0">計算結果</h2>
                  <p style={{ margin: "5px 0 0", lineHeight: 1.6, opacity: 0.85 }}>テーブル読込中...</p>
                </div>
              ) : (
                (() => {
                  const cols = employmentIncomeRows || [];
                  const fmt1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : "-");
                  const fmtPair = (a, b) => `${fmt1(a)} / ${fmt1(b)}`;
                  const moneyStack = (monthlyYen, annualYen) => {
                    const m = Number(monthlyYen) || 0;
                    const a = Number(annualYen) || 0;
                    if (!m && !a) return <span>0円</span>;
                    return (
                      <span className="money-stack">
                        <span>{m.toLocaleString()}円/月</span>
                        <span>{a.toLocaleString()}円/年</span>
                      </span>
                    );
                  };
                  const headDedCommonWan =
                    (Number(widowDeduction.itWan) || 0) +
                    (Number(singleParentDeduction.itWan) || 0) +
                    (Boolean(head.workingStudentWan) ? workingStudentDeductionAmt.itWan : 0) +
                    (Number(head.otherDedWan) || 0) +
                    (Number(spouseDeductionITWan) || 0) +
                    (Number(spouseSpecialDeductionITWan) || 0) +
                    (Number(dependentDeduction.itWan) || 0);
                  const headDedCommonWanLT =
                    (Number(widowDeduction.ltWan) || 0) +
                    (Number(singleParentDeduction.ltWan) || 0) +
                    (Boolean(head.workingStudentWan) ? workingStudentDeductionAmt.ltWan : 0) +
                    (Number(head.otherDedWan) || 0) +
                    (Number(spouseDeductionLTWan) || 0) +
                    (Number(spouseSpecialDeductionLTWan) || 0) +
                    (Number(dependentDeduction.ltWan) || 0);
                  const headDedCommonWanWithKin = headDedCommonWan + (Number(specialKinDeduction.itWan) || 0);
                  const headDedCommonWanLTWithKin = headDedCommonWanLT + (Number(specialKinDeduction.ltWan) || 0);

                  const getTaxable = (col, kind) => {
                    // NOTE: 控除の付け先は制度によって異なるが、ここでは「税計算」のロジックとして
                    // 障害者控除のみ「扶養（<=58万円）なら世帯主、扶養でなければ本人」に付け替える。
                    const total = Number(col?.totalIncomeWan) || 0;
                    const basic = kind === "it" ? Number(col?.basicITWan) || 0 : Number(col?.basicLTWan) || 0;
                    const social = Number(col?.socialWan) || 0;
                    const ws = Boolean(col?.workingStudent)
                      ? kind === "it"
                        ? workingStudentDeductionAmt.itWan
                        : workingStudentDeductionAmt.ltWan
                      : 0;
                    const dis = getDisabilityDeductionForTaxpayerWan(col, kind, cols);
                    if (col?.who !== "世帯主") return Math.max(0, total - basic - social - ws - dis);
                    return Math.max(
                      0,
                      total -
                        basic -
                        social -
                        ws -
                        dis -
                        (kind === "it" ? headDedCommonWanWithKin : headDedCommonWanLTWithKin)
                    );
                  };

                  const getTax = (col, kind) => {
                    // kind: "it" | "lt"
                    if (!taxTableStatic || taxTableStatic.length === 0) return 0;
                    const taxable = getTaxable(col, kind);
                    return interpTableValue(taxTableStatic, "taxable", taxable, kind === "it" ? "tax_it" : "tax_lt");
                  };

                  const getPayTotal = (col) => {
                    const social = Number(col?.socialWan) || 0;
                    const taxIT = getTax(col, "it");
                    const taxLT = getTax(col, "lt");
                    return social + taxIT + taxLT;
                  };

                  const getNet = (col) => {
                    const gross = (Number(col?.salaryWan) || 0) + (Number(col?.otherIncomeWan) || 0);
                    return gross - getPayTotal(col);
                  };

	                  const getResidentIncomeLevyWan = (col) => {
	                    // 障害福祉サービス利用料等の判定は「市町村民税（所得割）」のみ（ユーザー指定）。
	                    // 住民税(年税額=10%想定)から均等割(0.5万円)を差し引いたうえで、(市町村民税率 / 10) を掛けて近似する。
	                    // - 6% -> 0.6
	                    const rate = 0.6;
	                    const incomeLevy10 = Math.max(0, (Number(getTax(col, "lt")) || 0) - 0.5);
	                    return incomeLevy10 * rate;
	                  };

                  const calcBasicDisabilityPensionYen = (col) => {
                    // 障害基礎年金（ユーザー指定の固定値）
                    // - 1級: 1,039,625円 / 2級: 1,036,625円（年額）
                    // - 世帯主のみ、子ども加算あり（子ども1〜2人: 239,300円/人、3人目以降: 79,800円/人）
                    const who = String(col?.who || "");
                    const headBase =
                      head.basicDisabilityPensionGrade === "1"
                        ? 1039625
                        : head.basicDisabilityPensionGrade === "2"
                          ? 1036625
                          : 0;
                    const spouseBase =
                      spouse.basicDisabilityPensionGrade === "1"
                        ? 1039625
                        : spouse.basicDisabilityPensionGrade === "2"
                          ? 1036625
                          : 0;

                    const incomeTotalYen = Math.round((Number(col?.totalIncomeWan) || 0) * 10000);
                    const pre20 =
                      who === "世帯主"
                        ? Boolean(head.basicDisabilityPensionPre20)
                        : who === "配偶者"
                          ? Boolean(spouse.basicDisabilityPensionPre20)
                          : false;
                    const factor = !pre20
                      ? 1
                      : incomeTotalYen >= 4794001
                        ? 0
                        : incomeTotalYen >= 3761001
                          ? 0.5
                          : 1;

                    if (who === "世帯主") {
                      if (!head.disabled || headBase === 0) return 0;
                      const n = children.filter((c) => (Number(c?.age) || 0) < 18).length;
                      const add = 239300 * Math.min(n, 2) + 79800 * Math.max(n - 2, 0);
                      return Math.round((headBase + add) * factor);
                    }
                    if (who === "配偶者") {
                      if (!spouseEnabled || !spouse.disabled || spouseBase === 0) return 0;
                      return Math.round(spouseBase * factor);
                    }
                    return 0;
                  };

                  // 特別児童扶養手当（所得制限判定）は「所得カードの cols」からの派生値のみを使う。
                  const calcTccaAdjustedIncomeWan = () =>
                    tccaComputed || { head: { adjustedWan: 0 }, spouse: { enabled: false, adjustedWan: 0 } };

                  // 児童扶養手当: 判定所得の作り方はTCCAに近いが、
                  // 以下の控除は「適用しない」（ユーザー指定）。
                  // - 寡婦控除 / ひとり親控除
                  // - 配偶者特別控除
                  // - 扶養控除（特定扶養親族のみ25万/人）
                  const calcJidoFuyoAdjustedIncomeWan = () => {
                    const base = tccaComputed || { head: { adjustedWan: 0 } };
                    const h = base?.head || {};
                    const totalWan = Number(h.totalWan) || 0;
                    const dedSumWan = Number(h.dedSumWan) || 0;
                    const widowWan = Number(h.widowWan) || 0;
                    const singleParentWan = Number(h.singleParentWan) || 0;
                    const spouseSpecialWan = Number(h.spouseSpecialWan) || 0;
                    const specialDependentDedWan = Number(h.specialDependentDedWan) || 0;
                    const dedSumNo =
                      Math.max(0, dedSumWan - widowWan - singleParentWan - spouseSpecialWan - specialDependentDedWan);
                    const adjustedWan = Math.max(0, totalWan - dedSumNo);
                    return {
                      ...base,
                      head: {
                        ...h,
                        widowWan: 0,
                        singleParentWan: 0,
                        spouseSpecialWan: 0,
                        specialDependentDedWan: 0,
                        dedSumWan: dedSumNo,
                        adjustedWan,
                        adjustedYen: Math.round(adjustedWan * 10000),
                      },
                    };
                  };

                  const calcTccaFuyoCount = () => Number(tccaComputed?.fuyoCount) || 0;

                  const calcTccaIncomeLimitYen = (kind) =>
                    kind === "head"
                      ? Number(tccaComputed?.limits?.headLimitYen) || 0
                      : Number(tccaComputed?.limits?.familyLimitYen) || 0;

                  const calcTccaAdjustedIncomeYen = (col) => {
                    const who = String(col?.who || "");
                    if (!tccaComputed) return 0;
                    if (who === "世帯主") return Number(tccaComputed?.head?.adjustedYen) || 0;
                    const r = tccaComputed?.familyByWho?.get(who);
                    return Number(r?.adjustedYen) || 0;
                  };

                  const calcTccaAdjustedIncomeBreakdownFamily = (col) => {
                    const who = String(col?.who || "");
                    const r = tccaComputed?.familyByWho?.get(who);
                    if (!r) {
                      const totalWan = Number(col?.totalIncomeWan) || 0;
                      const wsWan = Boolean(col?.workingStudent) ? 27 : 0;
                      const disWan = 0;
                      const socialFixedWan = 8;
                      const dedSumWan = socialFixedWan + wsWan + disWan;
                      return {
                        totalWan,
                        socialFixedWan,
                        wsWan,
                        disWan,
                        dedSumWan,
                        adjustedWan: Math.max(0, totalWan - dedSumWan),
                      };
                    }
                    return {
                      totalWan: Number(r.totalWan) || 0,
                      socialFixedWan: Number(r.socialFixedWan) || 0,
                      wsWan: Number(r.wsWan) || 0,
                      disWan: Number(r.disWan) || 0,
                      dedSumWan: Number(r.dedSumWan) || 0,
                      adjustedWan: Number(r.adjustedWan) || 0,
                    };
                  };

                  const calcWelfareAllowanceLimitSelfYen = (fuyoCount) => {
                    // 障害児福祉手当 / 特別障害者手当: 障害者本人の所得制限（ユーザー指定）
                    // NOTE: 4人目の値と5人目以降の定義はユーザー提示が一部不整合だったため、
                    // 0〜3人は固定、4人目以降は+380,000円/人で外挿している（必要なら修正）。
                    const n = Math.max(0, Math.trunc(Number(fuyoCount) || 0));
                    const base = [3661000, 4041000, 4421000, 4801000];
                    if (n <= 3) return base[n];
                    return base[3] + 380000 * (n - 3);
                  };

                  const calcWelfareAllowanceLimitObligorYen = (fuyoCount) => {
                    // 障害者の配偶者または扶養義務者（世帯主・世帯主の配偶者を含む）の所得制限（ユーザー指定）
                    const n = Math.max(0, Math.trunc(Number(fuyoCount) || 0));
                    const base0to4 = [6287000, 6536000, 6749000, 6962000, 7175000];
                    if (n <= 4) return base0to4[n];
                    // 5人目は 4人目 + 213,000円 として外挿（必要なら修正）
                    const base5 = base0to4[4] + 213000;
                    return base5 + 213000 * (n - 5);
                  };

                  const calcWelfareAllowanceDisabilityDeductionWan = (col, mode) => {
                    // 障害児福祉手当等（所得制限）における障害者控除の扱い（ユーザー指定）
                    // mode:
                    // - "self": 本人判定所得（本人分の障害者控除は原則入れない。扶養親族分のみ入り得る）
                    // - "obligor": 扶養義務者判定所得（本人分の障害者控除も入れられる）
                    const who = String(col?.who || "");
                    const selfDisWan = Number(col?.welfareDisWan) || 0; // 同居特別は40万に落とした値

                    // 扶養判定（暫定）：所得合計<=58万円
                    const depMaxWan = 58;
                    const isDepLike = (w) => {
                      const r = cols.find((x) => String(x?.who || "") === String(w));
                      return r ? (Number(r?.totalIncomeWan) || 0) <= depMaxWan : false;
                    };

                    const depDisWan = (() => {
                      // 扶養親族（配偶者/子ども）が障害者で、かつ扶養（<=58）のとき、
                      // 障害者控除は世帯主側に付く想定で合算する。
                      if (who !== "世帯主") return 0;
                      let sum = 0;
                      if (spouseEnabled && isDepLike("配偶者")) {
                        const r = cols.find((x) => String(x?.who || "") === "配偶者");
                        sum += Number(r?.welfareDisWan) || 0;
                      }
                      for (const r of cols) {
                        const w = String(r?.who || "");
                        if (!w.startsWith("子ども")) continue;
                        if (!isDepLike(w)) continue;
                        sum += Number(r?.welfareDisWan) || 0;
                      }
                      return sum;
                    })();

                    if (mode === "obligor") return depDisWan + selfDisWan;
                    return depDisWan;
                  };

                  const calcWelfareAllowanceAdjustedIncomeYen = (col, mode = "self") => {
                    // 障害児福祉手当 / 特別障害者手当 / 心身障害者医療費助成制度（ユーザー指定）
                    // 判定所得 = 所得合計 −（制度で認められる控除）
                    //
                    // 控除ルール（現状実装）:
                    // - その他の控除: 雑損/医療費/小規模企業共済等掛金 等をまとめた入力（世帯主のみ入力欄あり）
                    // - 配偶者特別控除: 所得税側の配偶者特別控除（世帯主のみ）
                    // - 社会保険料控除: 実計算の社会保険料（固定8万円ではない）
                    // - 障害者控除(扶養配偶者/扶養親族): 27万円
                    // - 特別障害者控除(扶養配偶者/扶養親族): 40万円
                    // - 寡婦控除: 27万円（世帯主のみ）
                    // - ひとり親控除: 35万円（世帯主のみ）
                    // - 勤労学生控除: 27万円
                    const totalWan = Number(col?.totalIncomeWan) || 0;
                    const who = String(col?.who || "");

                    // 所得カード起点（世帯主のみ入力欄あり）
                    const headRow = cols.find((x) => x.who === "世帯主");
                    const headTotalForLimitWan = Number(headRow?.totalIncomeWan) || 0;
                    const headIncomeOk = headTotalForLimitWan <= 500;
                    const otherDedWan = who === "世帯主" ? Number(headRow?.otherDedWan) || 0 : 0;
                    const spouseSpecialWan = who === "世帯主" ? Number(spouseSpecialDeductionITWan) || 0 : 0;
                    const socialWan = Number(col?.socialWan) || 0;
                    const widowWan =
                      who === "世帯主" &&
                      headIncomeOk &&
                      Number(headRow?.widowWan) &&
                      !(widowDeductionCfg?.requires_no_spouse && spouseEnabled)
                        ? 27
                        : 0;
                    const singleParentWan =
                      who === "世帯主" &&
                      headIncomeOk &&
                      Number(headRow?.singleParentWan) &&
                      !(singleParentDeductionCfg?.requires_no_spouse && spouseEnabled)
                        ? 35
                        : 0;
                    const wsWan = Boolean(col?.workingStudent) ? 27 : 0;

                    // 障害者控除（27/40万）は「本人判定所得/扶養義務者判定所得」で扱いが異なる。
                    const disWan = calcWelfareAllowanceDisabilityDeductionWan(col, mode);

                    const deductionsWan =
                      otherDedWan +
                      spouseSpecialWan +
                      socialWan +
                      widowWan +
                      singleParentWan +
                      wsWan +
                      disWan;

                    const adjustedWan = Math.max(0, totalWan - deductionsWan);
                    return Math.round(adjustedWan * 10000);
                  };

                  const calcWelfareAllowanceAdjustedIncomeBreakdown = (col, mode = "self") => {
                    const totalWan = Number(col?.totalIncomeWan) || 0;
                    const who = String(col?.who || "");

                    const headRow = cols.find((x) => x.who === "世帯主");
                    const headTotalForLimitWan = Number(headRow?.totalIncomeWan) || 0;
                    const headIncomeOk = headTotalForLimitWan <= 500;
                    const otherDedWan = who === "世帯主" ? Number(headRow?.otherDedWan) || 0 : 0;
                    const spouseSpecialWan = who === "世帯主" ? Number(spouseSpecialDeductionITWan) || 0 : 0;
                    const socialWan = Number(col?.socialWan) || 0;
                    const widowWan =
                      who === "世帯主" &&
                      headIncomeOk &&
                      Number(headRow?.widowWan) &&
                      !(widowDeductionCfg?.requires_no_spouse && spouseEnabled)
                        ? 27
                        : 0;
                    const singleParentWan =
                      who === "世帯主" &&
                      headIncomeOk &&
                      Number(headRow?.singleParentWan) &&
                      !(singleParentDeductionCfg?.requires_no_spouse && spouseEnabled)
                        ? 35
                        : 0;
                    const wsWan = Boolean(col?.workingStudent) ? 27 : 0;

                    const disWan = calcWelfareAllowanceDisabilityDeductionWan(col, mode);

                    const deductionsWan =
                      otherDedWan +
                      spouseSpecialWan +
                      socialWan +
                      widowWan +
                      singleParentWan +
                      wsWan +
                      disWan;
                    const adjustedWan = Math.max(0, totalWan - deductionsWan);
                    return {
                      totalWan,
                      otherDedWan,
                      spouseSpecialWan,
                      socialWan,
                      widowWan,
                      singleParentWan,
                      wsWan,
                      disWan,
                      deductionsWan,
                      adjustedWan,
                    };
                  };

                  const cellValue = (key, c) => {
                    switch (key) {
                      case "__grossIncomeWan":
                        return fmt1((Number(c.salaryWan) || 0) + (Number(c.otherIncomeWan) || 0));
                      case "__basicDisabilityPensionWan":
                        return fmt1(calcBasicDisabilityPensionYen(c) / 10000);
                      case "__tccaFuyoCount":
                        return c.who === "世帯主" ? String(calcTccaFuyoCount()) : "-";
                      case "__tccaAdjustedIncomeWan":
                        {
                          const v = calcTccaAdjustedIncomeWan();
                          if (c.who === "世帯主") return fmt1(v?.head?.adjustedWan ?? 0);
                          if (c.who === "配偶者") return spouseEnabled ? fmt1(v?.spouse?.adjustedWan ?? 0) : "-";
                          return "-";
                        }
                      case "__basicPair":
                        return fmtPair(c.basicITWan, c.basicLTWan);
                      case "__spouseDeductionPairWan":
                        return fmtPair(c.who === "世帯主" ? spouseDeductionITWan : 0, c.who === "世帯主" ? spouseDeductionLTWan : 0);
                      case "__spouseSpecialDeductionPairWan":
                        return fmtPair(
                          c.who === "世帯主" ? spouseSpecialDeductionITWan : 0,
                          c.who === "世帯主" ? spouseSpecialDeductionLTWan : 0
                        );
                      case "__dependentDeductionPairWan":
                        return fmtPair(c.who === "世帯主" ? dependentDeduction.itWan : 0, c.who === "世帯主" ? dependentDeduction.ltWan : 0);
                      case "__specialKinDeductionPairWan":
                        return fmtPair(c.who === "世帯主" ? specialKinDeduction.itWan : 0, c.who === "世帯主" ? specialKinDeduction.ltWan : 0);
                      case "__widowPairWan":
                        return fmtPair(c.who === "世帯主" ? widowDeduction.itWan : 0, c.who === "世帯主" ? widowDeduction.ltWan : 0);
                      case "__singleParentPairWan":
                        return fmtPair(
                          c.who === "世帯主" ? singleParentDeduction.itWan : 0,
                          c.who === "世帯主" ? singleParentDeduction.ltWan : 0
                        );
                      case "__workingStudentPairWan":
                        return fmtPair(
                          Boolean(c.workingStudent) ? workingStudentDeductionAmt.itWan : 0,
                          Boolean(c.workingStudent) ? workingStudentDeductionAmt.ltWan : 0
                        );
                      case "__disabilityPairWan":
                        return fmtPair(
                          getDisabilityDeductionForTaxpayerWan(c, "it", cols),
                          getDisabilityDeductionForTaxpayerWan(c, "lt", cols)
                        );
                      case "__taxablePairWan":
                        return fmtPair(getTaxable(c, "it"), getTaxable(c, "lt"));
                      case "__taxPairWan":
                        return fmtPair(getTax(c, "it"), getTax(c, "lt"));
                      case "__payTotalWan":
                        return fmt1(getPayTotal(c));
                      case "__netWan":
                        return fmt1(getNet(c));
                      case "__netMonthlyWan":
                        return fmt1(getNet(c) / 12);
                      default:
                        return fmt1(c[key]);
                    }
                  };

                  const toggle = (id) => toggleOpenGroup(id);

                  // 控除計（社保は別行で表示するので除外）
                  const getDeductionSumWan = (col, kind) => {
                    const who = String(col?.who || "");
                    const basic = kind === "it" ? Number(col?.basicITWan) || 0 : Number(col?.basicLTWan) || 0;
                    const ws = Boolean(col?.workingStudent)
                      ? kind === "it"
                        ? workingStudentDeductionAmt.itWan
                        : workingStudentDeductionAmt.ltWan
                      : 0;
                    const dis = getDisabilityDeductionForTaxpayerWan(col, kind, cols);
                    if (who !== "世帯主") return basic + ws + dis;
                    const common = kind === "it" ? headDedCommonWanWithKin : headDedCommonWanLTWithKin;
                    return basic + dis + common;
                  };
                  const getDeductionSumPair = (col) => fmtPair(getDeductionSumWan(col, "it"), getDeductionSumWan(col, "lt"));

                  // 特別児童扶養手当（支給額合計: 円/月）
                  const calcTccaTotalMonthlyYen = () => {
                    return Number(tccaComputed?.totalMonthlyYen) || 0;
                  };

                  // 障害児福祉手当 / 特別障害者手当（今回は金額未定のため、該当者数のみ）
                  const countAllowanceTargets = (type) => {
                    return cols.reduce((a, c) => {
                      const who = String(c?.who || "");
                      const age = Number(c?.age) || 0;
                      const isChild = age < 20;
                      const enabled =
                        who === "世帯主"
                          ? isChild
                            ? Boolean(head.childWelfareAllowance)
                            : Boolean(head.tokubetsuAllowance)
                          : who === "配偶者"
                            ? isChild
                              ? Boolean(spouse.childWelfareAllowance)
                              : Boolean(spouse.tokubetsuAllowance)
                            : (() => {
                                const idx = Number(who.replace("子ども", "")) - 1;
                                const cc = children[idx];
                                if (!cc) return false;
                                return isChild ? Boolean(cc.childWelfareAllowance) : Boolean(cc.tokubetsuAllowance);
                              })();
                      if (!enabled) return a;
                      if (type === "child" && isChild) return a + 1;
                      if (type === "adult" && !isChild) return a + 1;
                      return a;
                    }, 0);
                  };

                  // 障害福祉サービス利用料（合計: 円/月）
                  const calcServiceFeeTotalMonthlyYen = () => {
                    const levyRows = cols.map((c) => ({ who: c.who, age: Number(c.age) || 0, levy: getResidentIncomeLevyWan(c) }));
                    const levyByWho = new Map(levyRows.map((r) => [String(r.who), r]));
                    const levySumWanFor = (who) => {
                      const w = String(who);
                      const r = levyByWho.get(w);
                      if (!r) return 0;
                      const age = Number(r.age) || 0;
                      if (age >= 18) {
                        if (w === "世帯主") {
                          const self = Number(r.levy) || 0;
                          const sp = spouseEnabled ? Number(levyByWho.get("配偶者")?.levy) || 0 : 0;
                          return self + sp;
                        }
                        if (w === "配偶者") {
                          const self = Number(r.levy) || 0;
                          const hd = Number(levyByWho.get("世帯主")?.levy) || 0;
                          return self + hd;
                        }
                        return Number(r.levy) || 0;
                      }
                      return levyRows.reduce((a, x) => a + (Number(x.levy) || 0), 0);
                    };
                    const monthlyFeeYen = (sumLevyWan, age) => {
                      const s = Number(sumLevyWan) || 0;
                      const a = Number(age) || 0;
                      if (s <= 0) return 0;
                      if (a >= 18) return s < 16 ? 9300 : 37200;
                      // ユーザー指定: 障害児福祉サービスは「3〜5歳は無償」
                      if (a >= 3 && a <= 5) return 0;
                      return s < 28 ? 4600 : 37200;
                    };
                    return levyRows.reduce((a, r) => a + monthlyFeeYen(levySumWanFor(r.who), r.age), 0);
                  };

	                  const tccaMonthlyYen = calcTccaTotalMonthlyYen();
	                  const tccaAnnualWan = (tccaMonthlyYen * 12) / 10000;

	                  // 障害児福祉手当 / 特別障害者手当（金額はユーザー指定）
	                  const WELFARE_CHILD_MONTHLY_YEN = 16100;
	                  const TOKUBETSU_MONTHLY_YEN = 29590;

	                  const calcWelfareAllowanceTotals = () => {
	                    const fuyo = calcTccaFuyoCount();
	                    const limitSelfYen = calcWelfareAllowanceLimitSelfYen(0); // 本人の扶養親族数（まず0）
	                    const limitObligorYen = calcWelfareAllowanceLimitObligorYen(fuyo);

	                    const obligors = [
	                      cols.find((r) => r.who === "世帯主"),
	                      spouseEnabled ? cols.find((r) => r.who === "配偶者") : null,
	                    ].filter(Boolean);
	                    const obligorVals = obligors.map((o) => calcWelfareAllowanceAdjustedIncomeYen(o, "obligor"));
	                    const obligorMaxYen = obligorVals.length ? Math.max(...obligorVals) : 0;
	                    const obligorOk = obligorMaxYen <= limitObligorYen;

	                    const recipients = cols
	                      .map((c) => {
	                        const age = Number(c?.age) || 0;
	                        const who = String(c?.who || "");
	                        const idx = who.startsWith("子ども") ? Number(who.replace("子ども", "")) - 1 : -1;
	                        const cc = idx >= 0 ? children?.[idx] : null;

	                        const isWelfareChild =
	                          age < 20 &&
	                          (who === "世帯主"
	                            ? Boolean(head.childWelfareAllowance)
	                            : who === "配偶者"
	                              ? Boolean(spouse.childWelfareAllowance)
	                              : Boolean(cc?.childWelfareAllowance));
	                        const isTokubetsu =
	                          age >= 20 &&
	                          (who === "世帯主"
	                            ? Boolean(head.tokubetsuAllowance)
	                            : who === "配偶者"
	                              ? Boolean(spouse.tokubetsuAllowance)
	                              : Boolean(cc?.tokubetsuAllowance));
	                        if (!isWelfareChild && !isTokubetsu) return null;

	                        const type = isWelfareChild ? "child" : "adult";
	                        const selfYen = calcWelfareAllowanceAdjustedIncomeYen(c, "self");
	                        const selfOk = selfYen <= limitSelfYen;
	                        const ok = selfOk && obligorOk;
	                        const monthlyYen = ok
	                          ? type === "child"
	                            ? WELFARE_CHILD_MONTHLY_YEN
	                            : TOKUBETSU_MONTHLY_YEN
	                          : 0;
	                        return { who, type, ok, monthlyYen };
	                      })
	                      .filter(Boolean);

	                    const childMonthly = recipients
	                      .filter((r) => r.type === "child")
	                      .reduce((a, r) => a + (Number(r.monthlyYen) || 0), 0);
	                    const adultMonthly = recipients
	                      .filter((r) => r.type === "adult")
	                      .reduce((a, r) => a + (Number(r.monthlyYen) || 0), 0);
	                    const childCount = recipients.filter((r) => r.type === "child" && r.ok).length;
	                    const adultCount = recipients.filter((r) => r.type === "adult" && r.ok).length;
	                    return {
	                      child: {
	                        count: childCount,
	                        annualWan: (childMonthly * 12) / 10000,
	                      },
	                      adult: {
	                        count: adultCount,
	                        annualWan: (adultMonthly * 12) / 10000,
	                      },
	                    };
	                  };

	                  const welfareTotals = calcWelfareAllowanceTotals();
                  const isDisabledWho = (who) => {
                    const w = String(who || "");
                    if (w === "世帯主") return Boolean(head.disabled);
                    if (w === "配偶者") return spouseEnabled ? Boolean(spouse.disabled) : false;
                    if (w.startsWith("子ども")) {
                      const idx = Number(w.replace("子ども", "")) - 1;
                      return Boolean(children?.[idx]?.disabled);
                    }
                    return false;
                  };

	                  const calcServiceFeeMonthlyYenByWho = (who) => {
	                    const w = String(who || "");
	                    const c = cols.find((x) => String(x?.who || "") === w);
	                    if (!c) return 0;
	                    if (!isDisabledWho(w)) return 0; // 利用料は障害者（サービス利用者）に限定

	                    const levyRows = cols.map((x) => ({
	                      who: String(x?.who || ""),
	                      age: Number(x?.age) || 0,
	                      levy: getResidentIncomeLevyWan(x),
	                    }));
	                    const levyByWho = new Map(levyRows.map((r) => [String(r.who), r]));
	                    const r = levyByWho.get(w);
	                    if (!r) return 0;

	                    const householdSumWan = levyRows.reduce((a, x) => a + (Number(x.levy) || 0), 0);

	                    // ユーザー仕様:
	                    // - 基本は「世帯収入」で判定（=全員合算）
	                    // - ただし「子どもだけ18歳を超えている場合」は本人収入で判定
	                    const levySumWanFor = () => {
	                      const age = Number(r.age) || 0;
	                      if (String(w).startsWith("子ども") && age >= 18) return Number(r.levy) || 0;
	                      return householdSumWan;
	                    };

	                    const monthlyFeeYen = (sumLevyWan, age) => {
	                      const s = Number(sumLevyWan) || 0;
	                      const a = Number(age) || 0;
	                      if (s <= 0) return 0;
	                      if (a >= 18) return s < 16 ? 9300 : 37200;
	                      // ユーザー指定: 障害児福祉サービスは「3〜5歳は無償」
	                      if (a >= 3 && a <= 5) return 0;
	                      return s < 28 ? 4600 : 37200;
	                    };

	                    const sum = levySumWanFor();
	                    return monthlyFeeYen(sum, r.age);
	                  };

                  const serviceFeeMonthlyYenTotal = cols.reduce(
                    (a, c) => a + calcServiceFeeMonthlyYenByWho(c?.who),
                    0
                  );
                  const serviceFeeAnnualWanTotal = (serviceFeeMonthlyYenTotal * 12) / 10000;

                  const householdIncomeTotalWan = cols.reduce((a, c) => a + (Number(c?.totalIncomeWan) || 0), 0);
                  const householdNetWan = cols.reduce((a, c) => a + getNet(c), 0);
                  const householdNetMonthlyWan = householdNetWan / 12;
                  const householdBasicPensionWan = cols.reduce((a, c) => a + (Number(c?.__basicDisabilityPensionWan) || 0), 0);

                  const childSupport = (() => {
                    // 児童扶養手当（ユーザー指定の簡易実装をそのまま流用）
                    // NOTE: このシミュレータでは「ひとり親前提」で世帯主のみ判定所得を使用している。
                    // ひとり親でない場合は支給されない（ユーザー指摘）
                    const isSingleParent = Boolean(head.singleParentWan) && !spouseEnabled;
                    if (!isSingleParent) return { totalMonthlyYen: 0, annualWan: 0 };
                    const fuyo = calcTccaFuyoCount();
                    const idx = Math.min(5, Math.max(0, Math.trunc(Number(fuyo) || 0)));
                    const adj = calcTccaAdjustedIncomeWan();
                    const incomeWan = Number(adj?.head?.adjustedWan) || 0;
                    const incomeYen = Math.round(incomeWan * 10000);

                    const fullLimitWanByFuyo = [68, 106, 144, 183, 220, 259];
                    const partialLimitWanByFuyo = [208, 246, 284, 322, 260, 398]; // NOTE: 4人=260万円はユーザー提示どおり
                    const fullLimitWan = fullLimitWanByFuyo[idx] ?? fullLimitWanByFuyo[5];
                    const partialLimitWan = partialLimitWanByFuyo[idx] ?? partialLimitWanByFuyo[5];
                    const fullLimitYen = Math.round(fullLimitWan * 10000);
                    const partialLimitYen = Math.round(partialLimitWan * 10000);

                    const status =
                      incomeYen <= fullLimitYen ? "満額" : incomeYen <= partialLimitYen ? "一部" : "対象外";

                    const eligibleChildren = children.filter((c) => {
                      const age = Number(c?.age) || 0;
                      const dis = Boolean(c?.disabled);
                      return age < 19 || (dis && age < 20);
                    });
                    const n = eligibleChildren.length;
                    if (n === 0 || status === "対象外") return { totalMonthlyYen: 0, annualWan: 0 };

                    if (status === "満額") {
                      const monthly = 46690 + Math.max(0, n - 1) * 11030;
                      return { totalMonthlyYen: monthly, annualWan: (monthly * 12) / 10000 };
                    }

                    // 一部支給（ユーザー指定式）
                    const delta = Math.max(0, incomeYen - fullLimitYen);
                    const first = Math.max(0, 46690 - (delta * 0.0256619 + 10));
                    const add = Math.max(0, 11030 - (delta * 0.0039568 + 10));
                    const monthly = Math.round(first + Math.max(0, n - 1) * add);
                    return { totalMonthlyYen: monthly, annualWan: (monthly * 12) / 10000 };
                  })();

                  const childAllowance = (() => {
                    // 児童手当（ユーザー指定）
                    const eligible = children
                      .map((c, i) => ({ ...c, idx: i, age: Number(c?.age) || 0 }))
                      .filter((c) => c.age <= 18);
                    const monthlyBy = (age, order) => {
                      if (order >= 3) return 30000;
                      if (age <= 2) return 15000;
                      return 10000;
                    };
                    const rows = eligible.map((c, i) => {
                      const order = i + 1;
                      const yen = monthlyBy(c.age, order);
                      return { yen };
                    });
                    const totalMonthlyYen = rows.reduce((a, r) => a + (Number(r.yen) || 0), 0);
                    return { totalMonthlyYen, annualWan: (totalMonthlyYen * 12) / 10000 };
                  })();

	                  const householdDisposableWan =
	                    householdNetWan +
	                    householdBasicPensionWan +
	                    tccaAnnualWan +
	                    (Number(childSupport?.annualWan) || 0) +
	                    (Number(childAllowance?.annualWan) || 0) +
	                    (Number(welfareTotals?.child?.annualWan) || 0) +
	                    (Number(welfareTotals?.adult?.annualWan) || 0) -
	                    serviceFeeAnnualWanTotal;

                  const summaryRows = [
                    { type: "row", section: "income", label: "収入合計", key: "__grossIncomeWan" },
                    {
                      type: "group",
                      id: "emp",
                      section: "income",
                      label: "給与所得",
                      key: "incomeWan",
                      children: [
                        { label: "給与収入", key: "salaryWan" },
                        { label: "給与所得控除", key: "empWan" },
                      ],
                    },
                    { type: "row", section: "income", label: "給与以外の所得", key: "otherIncomeWan" },
                    { type: "row", section: "income", label: "所得合計", key: "totalIncomeWan" },
                    { type: "row", section: "income", label: "世帯所得合計", key: "__householdIncomeTotalWan" },
                    { type: "sep" },
                    { type: "row", section: "ded", label: "社会保険料", key: "socialWan" },
                    {
                      type: "group",
                      id: "deductions",
                      section: "ded",
                      label: "控除計",
                      key: "__deductionSumPairWan",
                      children: [
                        { label: "基礎控除", key: "__basicPair" },
                        { label: "配偶者控除", key: "__spouseDeductionPairWan" },
                        { label: "配偶者特別控除", key: "__spouseSpecialDeductionPairWan" },
                        { label: "扶養控除", key: "__dependentDeductionPairWan" },
                        { label: "特定親族特別控除", key: "__specialKinDeductionPairWan" },
                        { label: "寡婦控除", key: "__widowPairWan" },
                        { label: "ひとり親控除", key: "__singleParentPairWan" },
                        { label: "勤労学生控除", key: "__workingStudentPairWan" },
                        { label: "障害者控除", key: "__disabilityPairWan" },
                        { label: "その他の控除", key: "__otherDedWan" },
                      ],
                    },
                    { type: "sep" },
                    { type: "row", section: "tax", label: "課税所得", key: "__taxablePairWan" },
                    { type: "row", section: "tax", label: "税額", key: "__taxPairWan" },
                    { type: "row", section: "tax", label: "支払い税の合計", key: "__payTotalWan" },
                    { type: "row", section: "tax", label: "手取額", key: "__netWan" },
                    { type: "row", section: "tax", label: "手取額（月額換算）", key: "__netMonthlyWan" },
                    { type: "row", section: "tax", label: "世帯の手取額合計", key: "__householdNetTotalWan" },
                    { type: "sep" },
                    { type: "row", section: "allow", label: "障害基礎年金", key: "__basicDisabilityPensionWan" },
                    { type: "row", section: "allow", label: "特別児童扶養手当", key: "__tccaAnnualWan" },
	                    { type: "row", section: "allow", label: "障害児福祉手当", key: "__welfareChild" },
	                    { type: "row", section: "allow", label: "特別障害者手当", key: "__welfareAdult" },
                    { type: "row", section: "allow", label: "児童扶養手当", key: "__childSupportWan" },
                    { type: "row", section: "allow", label: "児童手当", key: "__childAllowanceWan" },
                    { type: "sep" },
                    { type: "row", section: "service", label: "障害福祉サービス利用料", key: "__serviceFee" },
                    { type: "sep" },
                    { type: "row", section: "final", label: "最終可処分所得額", key: "__disposableWan" },
                  ];

	                  const sectionClass = (sec) => {
	                    if (sec === "income") return "sec-income";
	                    if (sec === "ded") return "sec-ded";
	                    if (sec === "tax") return "sec-tax";
	                    if (sec === "allow") return "sec-allow";
	                    if (sec === "service") return "sec-service";
	                    if (sec === "final") return "sec-final";
	                    return "";
	                  };

	                  const rowValue = (key, c) => {
	                    if (key === "__householdIncomeTotalWan")
	                      return c.who === "世帯主" ? fmt1(householdIncomeTotalWan) : "-";
	                    if (key === "__tccaAnnualWan") return c.who === "世帯主" ? fmt1(tccaAnnualWan) : "-";
	                    if (key === "__welfareChild") return c.who === "世帯主" ? fmt1(welfareTotals.child.annualWan) : "-";
	                    if (key === "__welfareAdult") return c.who === "世帯主" ? fmt1(welfareTotals.adult.annualWan) : "-";
	                    if (key === "__childSupportWan") return c.who === "世帯主" ? fmt1(childSupport.annualWan) : "-";
	                    if (key === "__childAllowanceWan") return c.who === "世帯主" ? fmt1(childAllowance.annualWan) : "-";
	                    if (key === "__householdNetTotalWan") return c.who === "世帯主" ? fmt1(householdNetWan) : "-";
	                    if (key === "__serviceFee")
	                      return isDisabledWho(c?.who) ? fmt1((calcServiceFeeMonthlyYenByWho(c?.who) * 12) / 10000) : "-";
	                    if (key === "__disposableWan") return c.who === "世帯主" ? fmt1(householdDisposableWan) : "-";
	                    if (key === "__deductionSumPairWan") return getDeductionSumPair(c);
	                    if (key === "__otherDedWan") return fmt1(c.who === "世帯主" ? head.otherDedWan : 0);
	                    return cellValue(key, c);
	                  };

                  const groupValue = (row, col) => {
                    if (row.key === "__deductionSumPairWan") return getDeductionSumPair(col);
                    return cellValue(row.key, col);
                  };

		                  return (
		                    <>
                          <div className="card mb">
                            <h2 className="mt0">所得（税控除モデル: {(taxModel || "s2").toUpperCase()}）</h2>
                            <p className="note" style={{ margin: "0 0 8px" }}>
                              ※「A / B」表記は「所得税 / 住民税」です。
                            </p>
		                      <div className="calc-frame calc-frame-income">
		                        <div className="table-scroll">
		                          <table className="breakdown-table breakdown-wide-firstcol" style={{ width: "100%" }}>
		                            <thead>
		                              <tr>
		                                <th>項目</th>
		                                {cols.map((c) => (
		                                  <th key={c.who}>{c.who}</th>
		                                ))}
		                              </tr>
		                            </thead>
		                            <tbody>
		                              {summaryRows.map((r, idx) => {
		                                if (r.type === "sep") {
		                                  return (
		                                    <tr key={`sep_${idx}`} className="table-sep">
		                                      <td colSpan={cols.length + 1} />
		                                    </tr>
		                                  );
		                                }

		                                if (r.type === "group") {
		                                  const isOpen = Boolean(openGroups?.[r.id]);
		                                  return (
		                                    <Fragment key={`gfrag_${r.id}`}>
		                                      <tr key={`g_${r.id}`} className={`group-head ${sectionClass(r.section)}`}>
		                                        <td>
		                                          <button
		                                            type="button"
		                                            className="group-toggle"
		                                            aria-expanded={isOpen}
		                                            onClick={() => toggle(r.id)}
		                                          >
		                                            {isOpen ? "-" : "+"}
		                                          </button>
		                                          <span>{r.label}</span>
		                                        </td>
		                                        {cols.map((c) => (
		                                          <td key={`g_${r.id}_${c.who}`} style={{ textAlign: "right" }}>
		                                            {groupValue(r, c)}
		                                          </td>
		                                        ))}
		                                      </tr>
		                                      {isOpen &&
		                                        r.children.map((ch) => (
		                                          <tr key={`${r.id}_${ch.key}`} className={sectionClass(r.section)}>
		                                            <td className="indent">{ch.label}</td>
		                                            {cols.map((c) => (
		                                              <td key={`${r.id}_${ch.key}_${c.who}`} style={{ textAlign: "right" }}>
		                                                {ch.key === "__otherDedWan"
		                                                  ? fmt1(c.who === "世帯主" ? head.otherDedWan : 0)
		                                                  : cellValue(ch.key, c)}
		                                              </td>
		                                            ))}
		                                          </tr>
		                                        ))}
		                                    </Fragment>
		                                  );
		                                }

		                                return (
		                                  <tr key={`r_${r.key}`} className={sectionClass(r.section)}>
		                                    <td>{r.label}</td>
		                                    {cols.map((c) => (
		                                      <td key={`r_${r.key}_${c.who}`} style={{ textAlign: "right" }}>
		                                        {rowValue(r.key, c)}
		                                      </td>
		                                    ))}
		                                  </tr>
		                                );
		                              })}
		                            </tbody>
		                          </table>
		                        </div>
		                      </div>
                          </div>

	                      <div className="calc-frame calc-frame-tcca">
	                        <details className="card mb toggle-card" style={{ marginTop: 0 }}>
	                          <summary>特別児童扶養手当の計算表</summary>
	                        {(() => {
	                          const fuyo = calcTccaFuyoCount();
	                          const adj = calcTccaAdjustedIncomeWan();
	                          const h = adj?.head || {};
	                          const headLimitYen = calcTccaIncomeLimitYen("head", fuyo);
	                          const famLimitYen = calcTccaIncomeLimitYen("family", fuyo);
	                          const headOk = (Number(h.adjustedWan) || 0) * 10000 <= headLimitYen;

                          const famTargets = [];
                          if (spouseEnabled) famTargets.push({ who: "配偶者", yen: calcTccaAdjustedIncomeYen(cols.find((r) => r.who === "配偶者")) });
                          children.forEach((c, i) => {
                            famTargets.push({
                              who: `子ども${i + 1}`,
                              yen: calcTccaAdjustedIncomeYen(cols.find((r) => r.who === `子ども${i + 1}`)),
                            });
                          });
                          const famMaxYen = famTargets.length ? Math.max(...famTargets.map((x) => x.yen)) : 0;
                          const famOk = famMaxYen <= famLimitYen;
                          const eligible = headOk && famOk;

                          const tccaMonthlyYenByGrade = (grade) => {
                            if (grade === "1") return 56800;
                            if (grade === "2") return 37830;
                            return 0;
                          };

                          const childRows = children.map((c, i) => {
                            const age = Number(c?.age) || 0;
                            const grade = c?.tccaGrade || "not";
                            const targetAge = age < 20;
                            const gradeLabel = grade === "1" ? "1級" : grade === "2" ? "2級" : "非該当";
                            const monthlyYen =
                              eligible && targetAge ? tccaMonthlyYenByGrade(grade) : 0;
                            return {
                              label: `子ども${i + 1}`,
                              age,
                              gradeLabel,
                              targetAge,
                              monthlyYen,
                            };
                          });
                          const totalMonthlyYen = childRows.reduce((a, r) => a + (Number(r.monthlyYen) || 0), 0);

                          return (
                            <div className="table-scroll">
                              <table
                                // Mobile: keep the right column on one line (no wrap-values).
                                className={`breakdown-table${isMobile ? " mobile-kv" : ""}`}
                                style={{ width: "100%" }}
                              >
                                <thead>
                                  <tr>
                                    <th>項目</th>
                                    <th style={{ textAlign: "right" }}>値</th>
                                  </tr>
		                                </thead>
			                                <tbody>
			                                  <tr>
			                                    <td>扶養親族数</td>
			                                    <td style={{ textAlign: "right" }}>{String(fuyo)}</td>
			                                  </tr>
			                                  <tr>
			                                    <td colSpan={2} style={{ paddingTop: 10, fontWeight: "bold", textAlign: "left" }}>
			                                      【世帯主】
			                                    </td>
			                                  </tr>
			                                  <tr>
			                                    <td>所得制限</td>
			                                    <td style={{ textAlign: "right" }}>{fmt1(headLimitYen / 10000)} 万円</td>
			                                  </tr>
			                                  <tr>
			                                    <td>判定所得</td>
			                                    <td style={{ textAlign: "right" }}>{fmt1(h.adjustedWan ?? 0)} 万円</td>
			                                  </tr>
			                                  <tr>
			                                    <td>所得制限判定</td>
			                                    <td
			                                      style={{
			                                        textAlign: "right",
			                                        color: headOk ? "#4caf50" : "#b00020",
		                                        fontWeight: "bold",
		                                      }}
		                                    >
			                                      {headOk ? "OK" : "NG"}
			                                    </td>
			                                  </tr>
			                                  <tr>
			                                    <td colSpan={2} style={{ paddingTop: 10, fontWeight: "bold", textAlign: "left" }}>
			                                      【配偶者＋扶養義務者】
			                                    </td>
			                                  </tr>
			                                  <tr>
			                                    <td>所得制限</td>
			                                    <td style={{ textAlign: "right" }}>{fmt1(famLimitYen / 10000)} 万円</td>
			                                  </tr>
			                                  <tr>
			                                    <td>判定所得（最大）</td>
			                                    <td style={{ textAlign: "right" }}>{fmt1(famMaxYen / 10000)} 万円</td>
			                                  </tr>
			                                  <tr>
			                                    <td>所得制限判定</td>
			                                    <td
			                                      style={{
			                                        textAlign: "right",
			                                        color: famOk ? "#4caf50" : "#b00020",
		                                        fontWeight: "bold",
		                                      }}
		                                    >
		                                      {famOk ? "OK" : "NG"}
		                                    </td>
		                                  </tr>
		                                  <tr className="tcca-conclusion">
		                                    <td style={{ fontWeight: "bold" }}>支給判定（総合）</td>
		                                    <td
		                                      style={{
		                                        textAlign: "right",
		                                        color: eligible ? "#4caf50" : "#b00020",
		                                        fontWeight: "bold",
		                                      }}
		                                    >
		                                      {eligible ? "支給対象" : "対象外"}
		                                    </td>
		                                  </tr>
		                                  <tr className="tcca-conclusion">
		                                    <td style={{ fontWeight: "bold" }}>支給額合計</td>
		                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
		                                      {moneyStack(totalMonthlyYen, totalMonthlyYen * 12)}
		                                    </td>
		                                  </tr>

		                                  {famTargets.length > 0 && (
		                                    <>
		                                      <tr>
		                                        <td colSpan={2} style={{ paddingTop: 12, textAlign: "left" }}>
		                                          <button
		                                            type="button"
		                                            className="group-toggle"
		                                            aria-expanded={Boolean(openGroups?.tccaFam)}
		                                            onClick={() => toggleOpenGroup("tccaFam")}
		                                          >
		                                            {openGroups?.tccaFam ? "-" : "+"}
		                                          </button>
		                                          <span style={{ fontWeight: "bold" }}>配偶者等の個別値</span>
		                                        </td>
		                                      </tr>
		                                      {openGroups?.tccaFam &&
		                                        famTargets.map((t) => (
		                                          <tr key={`fam_${t.who}`}>
		                                            <td className="indent">{t.who}</td>
		                                            <td style={{ textAlign: "right" }}>{fmt1(t.yen / 10000)} 万円</td>
		                                          </tr>
		                                        ))}
		                                    </>
		                                  )}

		                                  <tr>
		                                    <td colSpan={2} style={{ paddingTop: 12, textAlign: "left" }}>
		                                      <button
		                                        type="button"
		                                        className="group-toggle"
		                                        aria-expanded={Boolean(openGroups?.tccaPay)}
		                                        onClick={() => toggleOpenGroup("tccaPay")}
		                                      >
		                                        {openGroups?.tccaPay ? "-" : "+"}
		                                      </button>
		                                      <span style={{ fontWeight: "bold" }}>支給額</span>
		                                    </td>
		                                  </tr>
		                                  {openGroups?.tccaPay &&
		                                    (childRows.length === 0 ? (
		                                      <tr>
		                                        <td colSpan={2} style={{ opacity: 0.85 }}>
		                                          対象がありません。
		                                        </td>
		                                      </tr>
		                                    ) : (
		                                      childRows.map((r) => (
		                                        <tr key={r.label}>
		                                          <td className="indent">
		                                            {r.label}
		                                          </td>
		                                          <td style={{ textAlign: "right" }}>
		                                            {r.gradeLabel}
		                                            {r.targetAge ? "" : "（対象外）"} /{" "}
		                                            {moneyStack(r.monthlyYen || 0, (Number(r.monthlyYen) || 0) * 12)}
		                                          </td>
		                                        </tr>
		                                      ))
		                                    ))}
		                                </tbody>
	                              </table>

                                <details className="inner-toggle" style={{ marginTop: 12 }}>
                                  <summary>判定所得の計算式（内訳）</summary>
                                  <div className="calc-note">
                                    <div className="calc-note-title">世帯主（判定所得）</div>
                                    <table className="breakdown-table mobile-kv wrap-values" style={{ width: "100%" }}>
                                      <tbody>
                                        <tr>
                                          <td>所得合計</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.totalWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">社会保険料（固定）</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.socialFixedWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">その他の控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.otherDedWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">配偶者特別控除（住民税額）</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.spouseSpecialWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">扶養控除（特定扶養親族のみ、25万/人）</td>
                                          <td style={{ textAlign: "right" }}>
                                            {fmt1(h.specialDependentDedWan ?? 0)} 万円
                                          </td>
                                        </tr>
                                        <tr>
                                          <td className="indent">寡婦控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.widowWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">ひとり親控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.singleParentWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">勤労学生控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.workingStudentWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">障害者控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(h.disabilityDedWan ?? 0)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td style={{ fontWeight: "bold" }}>控除計</td>
                                          <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                            {fmt1(h.dedSumWan ?? 0)} 万円
                                          </td>
                                        </tr>
                                        <tr>
                                          <td style={{ fontWeight: "bold" }}>判定所得</td>
                                          <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                            {fmt1(h.adjustedWan ?? 0)} 万円
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>

                                    <div className="calc-note-title" style={{ marginTop: 12 }}>
                                      配偶者等（各人の判定所得）
                                    </div>
                                    <table className="breakdown-table mobile-kv wrap-values" style={{ width: "100%" }}>
                                      <tbody>
                                        {(famTargets.length ? famTargets : []).map((t) => {
                                          const col = cols.find((r) => r.who === t.who);
                                          const b = col ? calcTccaAdjustedIncomeBreakdownFamily(col) : null;
                                          if (!b) return null;
                                          return (
                                            <Fragment key={`tcca_formula_${t.who}`}>
                                              <tr className="group-head">
                                                <td colSpan={2} style={{ fontWeight: "bold" }}>
                                                  {t.who}
                                                </td>
                                              </tr>
                                              <tr>
                                                <td>所得合計</td>
                                                <td style={{ textAlign: "right" }}>{fmt1(b.totalWan)} 万円</td>
                                              </tr>
                                              <tr>
                                                <td className="indent">社会保険料（固定）</td>
                                                <td style={{ textAlign: "right" }}>{fmt1(b.socialFixedWan)} 万円</td>
                                              </tr>
                                              <tr>
                                                <td className="indent">勤労学生控除</td>
                                                <td style={{ textAlign: "right" }}>{fmt1(b.wsWan)} 万円</td>
                                              </tr>
                                              <tr>
                                                <td className="indent">障害者控除</td>
                                                <td style={{ textAlign: "right" }}>{fmt1(b.disWan)} 万円</td>
                                              </tr>
                                              <tr>
                                                <td style={{ fontWeight: "bold" }}>判定所得</td>
                                                <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                                  {fmt1(b.adjustedWan)} 万円
                                                </td>
                                              </tr>
                                            </Fragment>
                                          );
                                        })}
                                        {!famTargets.length && (
                                          <tr>
                                            <td colSpan={2} style={{ opacity: 0.85 }}>
                                              対象がありません。
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
	                            </div>
	                          );
	                        })()}
	                        </details>
	                      </div>

                      <details className="card mb toggle-card" style={{ marginTop: 14 }}>
                        <summary>障害児福祉手当等の計算表</summary>
                        <p className="note" style={{ margin: "0 0 6px" }}>
                          ※ 障害児福祉手当・特別障害者手当・心身障害者医療費助成制度の計算方法はいずれも同じです。
                        </p>
                        {/* note removed per user request */}

                        {(() => {
                          // 障害児福祉手当/特別障害者手当 と 心身障害者医療費助成制度は「同じ判定ロジック」なので、
                          // 判定テーブルは一本化して表示する（トグル不要）。
                          const fuyo = calcTccaFuyoCount();
                          const limitSelfYen = calcWelfareAllowanceLimitSelfYen(0); // 本人の扶養親族数（まず0）
                          const limitObligorYen = calcWelfareAllowanceLimitObligorYen(fuyo);

                          const getRecipientFlags = (who, age) => {
                            const idx = Number(String(who).replace("子ども", "")) - 1;
                            if (who === "世帯主") {
                              return {
                                isWelfareChild: age < 20 && Boolean(head.childWelfareAllowance),
                                isTokubetsu: age >= 20 && Boolean(head.tokubetsuAllowance),
                              };
                            }
                            if (who === "配偶者") {
                              return {
                                isWelfareChild: age < 20 && Boolean(spouse.childWelfareAllowance),
                                isTokubetsu: age >= 20 && Boolean(spouse.tokubetsuAllowance),
                              };
                            }
                            const ch = children[idx];
                            return {
                              isWelfareChild: age < 20 && Boolean(ch?.childWelfareAllowance),
                              isTokubetsu: age >= 20 && Boolean(ch?.tokubetsuAllowance),
                            };
                          };

                          const recipients = cols
                            .map((c) => {
                              const age = Number(c?.age) || 0;
                              const who = String(c?.who || "");
                              const { isWelfareChild, isTokubetsu } = getRecipientFlags(who, age);
                              if (!isWelfareChild && !isTokubetsu) return null;

                              const type = isWelfareChild ? "障害児福祉手当" : "特別障害者手当";
                              const selfYen = calcWelfareAllowanceAdjustedIncomeYen(c, "self");
                              const selfOk = selfYen <= limitSelfYen;

                              // ユーザー指定（整理後）: 扶養義務者判定は「本人以外の全員」。
                              const obligorCols = cols.filter((x) => String(x?.who || "") !== who);
                              const obligorMaxYen = obligorCols.length
                                ? Math.max(...obligorCols.map((o) => calcWelfareAllowanceAdjustedIncomeYen(o, "obligor")))
                                : 0;
                              const obligorOk = obligorMaxYen <= limitObligorYen;
                              const ok = selfOk && obligorOk;

                              const monthlyYen = ok
                                ? isWelfareChild
                                  ? WELFARE_CHILD_MONTHLY_YEN
                                  : TOKUBETSU_MONTHLY_YEN
                                : 0;
                              const annualYen = monthlyYen * 12;

                              return { who, type, selfYen, obligorMaxYen, ok, monthlyYen, annualYen };
                            })
                            .filter(Boolean);

                          return (
                            <div style={{ marginTop: 12 }}>
                              <div className="calc-note-title" style={{ marginTop: 0 }}>
                                障害児福祉手当・特別障害者手当（心身障害者医療費助成制度も同じ判定）
                              </div>
                              <div className="recipient-kv-grid">
                                {recipients.length === 0 ? (
                                  <div style={{ opacity: 0.85 }}>該当者がいません。</div>
                                ) : (
                                  recipients.map((r) => {
                                    const medicalOk = Boolean(r.ok); // 判定ロジックは同じ
                                    const money = moneyStack(r.monthlyYen || 0, r.annualYen || 0);

                                    return (
                                      <div key={`welfare_merged_kv_${r.who}_${r.type}`} className="recipient-kv">
                                        <div className="recipient-kv-title">
                                          【{r.who}】{r.type}
                                        </div>
                                        <table className="breakdown-table mobile-kv" style={{ width: "100%" }}>
                                          <thead>
                                            <tr>
                                              <th>項目</th>
                                              <th style={{ textAlign: "right" }}>値</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            <tr>
                                              <td>本人判定所得</td>
                                              <td style={{ textAlign: "right" }}>{fmt1(r.selfYen / 10000)} 万円</td>
                                            </tr>
                                            <tr>
                                              <td>扶養義務者判定所得（最大）</td>
                                              <td style={{ textAlign: "right" }}>
                                                {fmt1((r.obligorMaxYen || 0) / 10000)} 万円
                                              </td>
                                            </tr>
                                            <tr>
                                              <td className="indent">扶養義務者上限</td>
                                              <td style={{ textAlign: "right" }}>{fmt1(limitObligorYen / 10000)} 万円</td>
                                            </tr>
                                            <tr>
                                              <td>判定</td>
                                              <td
                                                style={{
                                                  textAlign: "right",
                                                  fontWeight: "bold",
                                                  color: r.ok ? "#4caf50" : "#b00020",
                                                }}
                                              >
                                                {r.ok ? "OK" : "NG"}
                                              </td>
                                            </tr>
                                            <tr>
                                              <td>支給額（月額/年額）</td>
                                              <td style={{ textAlign: "right", fontWeight: "bold" }}>{money}</td>
                                            </tr>
                                            <tr>
                                              <td>心身障害者医療費助成制度</td>
                                              <td
                                                style={{
                                                  textAlign: "right",
                                                  fontWeight: "bold",
                                                  color: medicalOk ? "#4caf50" : "#b00020",
                                                  whiteSpace: "nowrap",
                                                }}
                                              >
                                                {medicalOk ? "該当" : "非該当"}
                                              </td>
                                            </tr>
                                          </tbody>
                                        </table>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        <details className="inner-toggle" style={{ marginTop: 12 }}>
                          <summary>判定所得の計算式（内訳）</summary>
                          <div className="calc-note">
                            <div className="calc-note-title">各人の判定所得（制度用）</div>
                            <div className="formula-grid">
                              {cols.map((c) => {
                                const bSelf = calcWelfareAllowanceAdjustedIncomeBreakdown(c, "self");
                                const bOb = calcWelfareAllowanceAdjustedIncomeBreakdown(c, "obligor");

                                const kvTable = (title, b) => (
                                  <div className="formula-col">
                                    <div className="calc-note-title" style={{ marginTop: 0 }}>
                                      {title}
                                    </div>
                                    <table className="breakdown-table mobile-kv" style={{ width: "100%" }}>
                                      <tbody>
                                        <tr>
                                          <td>所得合計</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.totalWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">その他の控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.otherDedWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">配偶者特別控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.spouseSpecialWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">社会保険料控除額</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.socialWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">寡婦控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.widowWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">ひとり親控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.singleParentWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">勤労学生控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.wsWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td className="indent">障害者控除</td>
                                          <td style={{ textAlign: "right" }}>{fmt1(b.disWan)} 万円</td>
                                        </tr>
                                        <tr>
                                          <td style={{ fontWeight: "bold" }}>控除計</td>
                                          <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                            {fmt1(b.deductionsWan)} 万円
                                          </td>
                                        </tr>
                                        <tr>
                                          <td style={{ fontWeight: "bold" }}>判定所得</td>
                                          <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                            {fmt1(b.adjustedWan)} 万円
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </div>
                                );

                                return (
                                  <div key={`welfare_formula_${c.who}`} className="formula-person">
                                    <div className="formula-person-title">{c.who}</div>
                                    <div className="formula-two-col">
                                      {kvTable("本人判定所得", bSelf)}
                                      {kvTable("扶養義務者判定所得", bOb)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </details>
                      </details>

                      <details className="card mb toggle-card" style={{ marginTop: 14 }}>
                        <summary>障害福祉サービス利用料</summary>
                        <p className="note" style={{ margin: "0 0 8px" }}>
                          ※住民税は「所得割のみ」を使う想定のため、住民税額（住民税）から一律0.5万円（均等割相当）を差し引いて近似します。
                        </p>

                        {(() => {
                          const levyRows = cols.map((c) => {
                            const lt = getTax(c, "lt");
                            const levy = getResidentIncomeLevyWan(c);
                            return { who: c.who, age: Number(c.age) || 0, lt, levy };
                          });
	                          const levyByWho = new Map(levyRows.map((r) => [String(r.who), r]));
	                          const householdSumWan = levyRows.reduce((a, x) => a + (Number(x.levy) || 0), 0);

	                          const levySumWanFor = (who) => {
	                            const r = levyByWho.get(String(who));
	                            if (!r) return 0;
	                            const age = Number(r.age) || 0;

	                            // ユーザー指定:
	                            // - 基本は「世帯収入」で判定（=全員合算）
	                            // - ただし「子どもだけ18歳を超えている場合」は本人収入で判定
	                            if (String(who).startsWith("子ども") && age >= 18) return Number(r.levy) || 0;
	                            return householdSumWan;
	                          };

                          const monthlyFeeYen = (sumLevyWan, age) => {
                            const s = Number(sumLevyWan) || 0;
                            const a = Number(age) || 0;
                            if (s <= 0) return 0;
                            // 18歳以上: 所得割16万円ライン、月額9,300円
                            if (a >= 18) {
                              if (s < 16) return 9300;
                              return 37200;
                            }
                            // ユーザー指定: 障害児福祉サービスは「3〜5歳は無償」
                            if (a >= 3 && a <= 5) return 0;
                            // 18歳未満: いったん28万円ライン、月額4,600円（ユーザー指定の旧ルール）
                            if (s < 28) return 4600;
                            return 37200;
                          };

                          // 要求された「単純表示」用の集計
                          const adultList = [];
                          const childList = [];
                          let adultFeeYen = 0;
                          let childFeeYen = 0;
                          levyRows.forEach((r) => {
                            if (!isDisabledWho(r.who)) return; // 利用料は障害者（サービス利用者）に限定
                            const fee = monthlyFeeYen(levySumWanFor(r.who), r.age);
                            if (Number(r.age) >= 18) {
                              adultList.push({ who: String(r.who), age: Number(r.age) || 0, fee });
                              adultFeeYen += fee;
                            } else {
                              childList.push({ who: String(r.who), age: Number(r.age) || 0, fee });
                              childFeeYen += fee;
                            }
                          });
                          const totalUsers = adultList.length + childList.length;
                          const totalFeeYen = adultFeeYen + childFeeYen;

	                          return (
	                            <table className="breakdown-table mobile-kv" style={{ width: "100%" }}>
	                              <thead>
	                                <tr>
	                                  <th>項目</th>
	                                  <th style={{ textAlign: "right" }}>値</th>
	                                </tr>
	                              </thead>
	                              <tbody>
	                                <tr>
	                                  <td>世帯の市町村民税の合計</td>
	                                  <td style={{ textAlign: "right", fontWeight: "bold" }}>{fmt1(householdSumWan)} 万円</td>
	                                </tr>
	                                <tr>
	                                  <td style={{ fontWeight: "bold", textAlign: "left" }}>
	                                    <button
	                                      type="button"
	                                      className="group-toggle"
	                                      aria-expanded={Boolean(openGroups?.serviceFee)}
	                                      onClick={() => toggleOpenGroup("serviceFee")}
	                                    >
	                                      {openGroups?.serviceFee ? "-" : "+"}
	                                    </button>
	                                    <span>月の負担上限額合計</span>
	                                  </td>
	                                  <td style={{ textAlign: "right", fontWeight: "bold" }}>
	                                    {totalFeeYen.toLocaleString()} 円/月（{String(totalUsers)}人）
	                                  </td>
	                                </tr>
	                                {openGroups?.serviceFee &&
	                                  (totalUsers === 0 ? (
	                                    <tr>
	                                      <td colSpan={2} style={{ opacity: 0.8 }}>
	                                        利用者なし
	                                      </td>
	                                    </tr>
	                                  ) : (
	                                    [...adultList, ...childList].map((x) => (
	                                      <tr key={`svc_${x.who}`}>
	                                        <td className="indent">
	                                          <span>{x.who}</span>
	                                          <span style={{ opacity: 0.8, fontSize: "0.92em" }}>（{x.age}歳）</span>
	                                        </td>
	                                        <td style={{ textAlign: "right", fontWeight: "bold" }}>
	                                          {x.fee.toLocaleString()}円/月
	                                        </td>
	                                      </tr>
	                                    ))
	                                  ))}
	                              </tbody>
	                            </table>
	                          );
	                        })()}
                      </details>

                      <details className="card mb toggle-card" style={{ marginTop: 14 }}>
                        <summary>児童扶養手当の計算表</summary>

                        {(() => {
                      const fuyo = calcTccaFuyoCount();
                      const idx = Math.min(5, Math.max(0, Math.trunc(Number(fuyo) || 0)));
                      const adj = calcJidoFuyoAdjustedIncomeWan();
                      const incomeWan = Number(adj?.head?.adjustedWan) || 0; // 世帯主のみ（ひとり親前提）
                      const incomeYen = Math.round(incomeWan * 10000);
                      const isSingleParent = Boolean(head.singleParentWan) && !spouseEnabled;

                          // 満額支給ライン（万円）
                          const fullLimitWanByFuyo = [68, 106, 144, 183, 220, 259];
                          // 一部支給ライン（万円）
                          // NOTE: ユーザー提示の「4人=260万円」は非単調のため要確認。
                          const partialLimitWanByFuyo = [208, 246, 284, 322, 260, 398];

                          const fullLimitWan = fullLimitWanByFuyo[idx] ?? fullLimitWanByFuyo[5];
                          const partialLimitWan = partialLimitWanByFuyo[idx] ?? partialLimitWanByFuyo[5];
                          const fullLimitYen = Math.round(fullLimitWan * 10000);
                          const partialLimitYen = Math.round(partialLimitWan * 10000);

                          const status =
                            incomeYen <= fullLimitYen ? "満額" : incomeYen <= partialLimitYen ? "一部" : "対象外";

                          const eligibleChildren = children
                            .map((c, i) => ({ ...c, idx: i }))
                            .filter((c) => {
                              const age = Number(c?.age) || 0;
                              const disabled = Boolean(c?.disabled);
                              return age < 19 || (disabled && age < 20);
                            });

                          const nChild = eligibleChildren.length;

                          const calcPartialYen = (baseYen, diffYen, coef) => {
                            const v = baseYen - (diffYen * coef + 10);
                            // 10円単位に切り捨て（式に+10円が入っているため、ここは仕様確認が必要なら後で調整）
                            const floored = Math.floor(v / 10) * 10;
                            return Math.max(0, Math.min(baseYen, Math.round(floored)));
                          };

                          const fullFirst = 46690;
                          const fullAdd = 11030;

                          let firstYen = 0;
                          let addYen = 0;
                          if (!isSingleParent) {
                            // ひとり親でない場合は対象外
                            firstYen = 0;
                            addYen = 0;
                          } else if (status === "満額") {
                            firstYen = nChild >= 1 ? fullFirst : 0;
                            addYen = nChild >= 2 ? fullAdd : 0;
                          } else if (status === "一部") {
                            const diff = Math.max(0, incomeYen - fullLimitYen);
                            firstYen = nChild >= 1 ? calcPartialYen(fullFirst, diff, 0.0256619) : 0;
                            addYen = nChild >= 2 ? calcPartialYen(fullAdd, diff, 0.0039568) : 0;
                          }

                          const totalMonthly = firstYen + Math.max(0, nChild - 1) * addYen;

	                          return (
	                            <>
	                              <table className="breakdown-table mobile-kv" style={{ width: "100%" }}>
	                                <thead>
	                                  <tr>
	                                    <th>項目</th>
	                                    <th style={{ textAlign: "right" }}>値</th>
	                                  </tr>
	                                </thead>
	                                <tbody>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>対象（ひとり親）</td>
	                                    <td style={{ textAlign: "right" }}>{isSingleParent ? "はい" : "いいえ"}</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>扶養親族数</td>
	                                    <td style={{ textAlign: "right" }}>{String(fuyo)}</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>判定所得</td>
	                                    <td style={{ textAlign: "right" }}>{fmt1(incomeWan)} 万円</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>満額支給ライン</td>
	                                    <td style={{ textAlign: "right" }}>{fmt1(fullLimitWan)} 万円</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>一部支給ライン</td>
	                                    <td style={{ textAlign: "right" }}>{fmt1(partialLimitWan)} 万円</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>判定結果</td>
	                                    <td
	                                      style={{
	                                        textAlign: "right",
	                                        fontWeight: "bold",
	                                        color: status === "対象外" ? "#b00020" : "#4caf50",
	                                      }}
	                                    >
	                                      {status}
	                                    </td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>対象児童数</td>
	                                    <td style={{ textAlign: "right" }}>{String(nChild)}</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>支給額（第1子）</td>
	                                    <td style={{ textAlign: "right" }}>{firstYen.toLocaleString()} 円/月</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>支給額（第2子以降/人）</td>
	                                    <td style={{ textAlign: "right" }}>{addYen.toLocaleString()} 円/月</td>
	                                  </tr>
	                                  <tr>
	                                    <td style={{ fontWeight: "bold" }}>支給額合計</td>
	                                    <td style={{ textAlign: "right", fontWeight: "bold" }}>
	                                      {moneyStack(totalMonthly, totalMonthly * 12)}
	                                    </td>
	                                  </tr>

	                                  <tr>
	                                    <td colSpan={2} style={{ paddingTop: 12, fontWeight: "bold" }}>
	                                      対象児童
	                                    </td>
	                                  </tr>
	                                  {eligibleChildren.length === 0 ? (
	                                    <tr>
	                                      <td colSpan={2} style={{ opacity: 0.85 }}>
	                                        対象児童がいません。
	                                      </td>
	                                    </tr>
	                                  ) : (
	                                    eligibleChildren.map((c) => (
	                                      <tr key={`jido_${c.idx}`}>
	                                        <td>子ども{c.idx + 1}</td>
	                                        <td style={{ textAlign: "right" }}>
	                                          {c.disabled ? "（障害）" : ""}
	                                          {Number(c.age) || 0}歳
	                                        </td>
	                                      </tr>
	                                    ))
	                                  )}
	                                </tbody>
	                              </table>

	                              <details className="inner-toggle" style={{ marginTop: 12 }}>
	                                <summary>判定所得の計算式（内訳）</summary>
	                                {(() => {
	                                  const h = calcJidoFuyoAdjustedIncomeWan()?.head || {};
	                                  return (
	                                    <div className="calc-note">
	                                      <div className="calc-note-title">世帯主（判定所得）</div>
	                                      <table className="breakdown-table mobile-kv wrap-values" style={{ width: "100%" }}>
	                                        <tbody>
	                                          <tr>
	                                            <td>所得合計</td>
	                                            <td style={{ textAlign: "right" }}>{fmt1(h.totalWan ?? 0)} 万円</td>
	                                          </tr>
	                                          <tr>
	                                            <td className="indent">社会保険料（固定）</td>
	                                            <td style={{ textAlign: "right" }}>{fmt1(h.socialFixedWan ?? 0)} 万円</td>
	                                          </tr>
	                                          <tr>
	                                            <td className="indent">その他の控除</td>
	                                            <td style={{ textAlign: "right" }}>{fmt1(h.otherDedWan ?? 0)} 万円</td>
	                                          </tr>
	                                          <tr>
	                                            <td className="indent">勤労学生控除</td>
	                                            <td style={{ textAlign: "right" }}>{fmt1(h.wsWan ?? 0)} 万円</td>
	                                          </tr>
	                                          <tr>
	                                            <td className="indent">障害者控除</td>
	                                            <td style={{ textAlign: "right" }}>{fmt1(h.disabilityDedWan ?? h.disWan ?? 0)} 万円</td>
	                                          </tr>
	                                          <tr>
	                                            <td style={{ fontWeight: "bold" }}>控除計</td>
	                                            <td style={{ textAlign: "right", fontWeight: "bold" }}>
	                                              {fmt1(h.dedSumWan ?? 0)} 万円
	                                            </td>
	                                          </tr>
	                                          <tr>
	                                            <td style={{ fontWeight: "bold" }}>判定所得</td>
	                                            <td style={{ textAlign: "right", fontWeight: "bold" }}>
	                                              {fmt1(h.adjustedWan ?? 0)} 万円
	                                            </td>
	                                          </tr>
	                                        </tbody>
	                                      </table>
	                                    </div>
	                                  );
	                                })()}
	                              </details>
	                            </>
	                          );
	                        })()}
                      </details>

                      <details className="card mb toggle-card" style={{ marginTop: 14 }}>
                        <summary>児童手当の計算表</summary>

                        {(() => {
                          const eligible = children
                            .map((c, i) => ({ ...c, idx: i, age: Number(c?.age) || 0 }))
                            .filter((c) => c.age <= 18);

                          const monthlyBy = (age, order) => {
                            if (order >= 3) return 30000;
                            if (age <= 2) return 15000;
                            return 10000;
                          };

                          // 子の数え方: 年齢の高い順（同年齢は入力順）で第1子,第2子...とする（ユーザー指定）
                          const eligibleSorted = [...eligible].sort((a, b) => {
                            const aa = Number(a.age) || 0;
                            const bb = Number(b.age) || 0;
                            if (bb !== aa) return bb - aa; // desc
                            return (Number(a.idx) || 0) - (Number(b.idx) || 0);
                          });

                          const rows = eligibleSorted.map((c, i) => {
                            const order = i + 1;
                            const yen = monthlyBy(c.age, order);
                            return {
                              label: `子ども${c.idx + 1}`,
                              age: c.age,
                              order,
                              yen,
                            };
                          });
                          const totalMonthly = rows.reduce((a, r) => a + (Number(r.yen) || 0), 0);

	                          return (
	                            <div className="table-scroll">
	                              <table className="breakdown-table" style={{ width: "100%" }}>
	                              <thead>
	                                <tr>
	                                  <th>対象</th>
	                                  <th style={{ textAlign: "right" }}>年齢</th>
                                  <th style={{ textAlign: "right" }}>子の数え方</th>
                                  <th style={{ textAlign: "right" }}>月額</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.length === 0 ? (
                                  <tr>
                                    <td colSpan={4} style={{ opacity: 0.85 }}>
                                      対象児童がいません。
                                    </td>
                                  </tr>
                                ) : (
                                  rows.map((r) => (
                                    <tr key={`jidoteate_${r.label}`}>
                                      <td style={{ fontWeight: "bold" }}>{r.label}</td>
                                      <td style={{ textAlign: "right" }}>{r.age}歳</td>
                                      <td style={{ textAlign: "right" }}>{`第${r.order}子`}</td>
                                      <td style={{ textAlign: "right", fontWeight: "bold" }}>
                                        {r.yen.toLocaleString()} 円/月
                                      </td>
                                    </tr>
                                  ))
                                )}
	                                <tr>
	                                  <td style={{ fontWeight: "bold" }}>支給額合計</td>
	                                  <td colSpan={3} style={{ textAlign: "right", fontWeight: "bold" }}>
	                                    {moneyStack(totalMonthly, totalMonthly * 12)}
	                                  </td>
	                                </tr>
	                              </tbody>
	                              </table>
	                            </div>
	                          );
	                        })()}
                      </details>
                    </>
                  );
                })()
              )}
            </>
          )}

          <div className="footer-spacer" aria-hidden="true" />
        </div>
      )}

      {viewTab === "dynamic" && (
        <>
          <div className="card mb">
            <h2 className="mt0">入力反映グラフ（世帯合計）</h2>
            <DynamicGraphCard
              calcVersion={calcVersion}
              seriesReady={seriesReady}
              householdSeries={householdSeries}
              householdSeriesDisplay={householdSeriesDisplay}
              displayHeadSalaryWan={displayHeadSalaryWan}
            />
          </div>

          {calcVersion > 0 && householdSeries.length > 0 && (
            <div className="footer-fixed" role="contentinfo">
              <div className="footer-inner">
                <div className="footer-row">
                  <div className="footer-label">縦線ライン</div>
                  <div className="footer-slider">
                    <input
                      type="range"
                      min={1}
                      max={1500}
                      step={1}
                      value={displayHeadSalaryWan}
                      onChange={(e) => setDisplayHeadSalaryWan(Number(e.target.value) || 1)}
                      style={{ width: "100%" }}
                    />
                    <div className="footer-label" style={{ minWidth: 80, textAlign: "right" }}>
                      {Number(displayHeadSalaryWan) || 0} 万円
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* fixed footer と被らないよう、dynamic タブだけ下側に余白を確保 */}
          <div className="footer-spacer-fixed" aria-hidden="true" />
        </>
      )}
    </div>
  );
}
