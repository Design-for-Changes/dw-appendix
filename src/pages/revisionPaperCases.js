// 制度による差を比較するための仮想例。重症度や障害児世帯の分布の代表値ではない。
export const blankChild = (age = 8) => ({ age, tccaGrade: "not", welfareEligible: false, taxStatus: "none", serviceUser: false });
const grade2 = (age) => ({ ...blankChild(age), tccaGrade: "2", taxStatus: "special", serviceUser: true });
const grade1 = (age) => ({ ...grade2(age), tccaGrade: "1", welfareEligible: true });

export const paperCases = [
  { id: "P1", title: "ケース1：特児2級の子1人", children: [grade2(10), blankChild(8)] },
  { id: "P2", title: "ケース2：特児1級・障害児福祉手当の子1人", children: [grade1(10), blankChild(8)] },
  { id: "P3", title: "ケース3：特児1級・障害児福祉手当の子2人", children: [grade1(10), grade1(8)] },
];
