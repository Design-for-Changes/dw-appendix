import {ADDITIONAL_POLICY_LAYERS,createAdditionalPolicyClassifier} from "./policyAdditionalBands";

const parent=(values={})=>({income:0,municipalLevy:0,serviceLevy:0,taxable:false,...values});
const child=(age=8,taxStatus="none")=>({age,taxStatus});
const decode=word=>ADDITIONAL_POLICY_LAYERS.map((_,i)=>(word>>>(4*i))&15);
const calculator=(children=[child()])=>createAdditionalPolicyClassifier(children);

test("市の公営住宅所得計算例（夫婦と16歳未満の子1人）は第2区分",()=>{
  // 船橋市の例：所得 1,670,000 + 750,000 − 760,000 − 200,000 = 1,460,000円（年）。
  expect(decode(calculator().classify(parent({income:1670000}),parent({income:750000})))[0]).toBe(2);
});

test.each([104000,123000,139000,158000,186000,214000,259000])("住宅区分の月額上端 %i 円を含む",limit=>{
  const caps=[104000,123000,139000,158000,186000,214000,259000],i=caps.indexOf(limit);
  // 給与所得者1人・扶養の配偶者・16歳の特別障害児：基礎10万+親族76万+特定25万+特別40万。
  const gross=limit*12+1510000;
  const c=calculator([child(16,"special")]);
  const band=income=>decode(c.classify(parent({income}),parent()))[0];
  expect([band(gross),band(gross+1)]).toEqual([i+1,i+2]);
});

test("子の住宅控除は障害者27万で、給与所得10万円未満の親からは当該所得額のみ控除",()=>{
  const c=calculator([child(15,"ordinary")]);
  const income=104000*12+100000+760000+270000;
  expect(decode(c.classify(parent({income}),parent({income:80000})))[0]).toBe(1);
  expect(decode(c.classify(parent({income:income+1}),parent({income:80000})))[0]).toBe(2);
});

test("補聴器は扶養復元後の個人いずれかが46万円以上。電源は保護者の未調整市民税所得割",()=>{
  const c=calculator();
  const h=parent({serviceLevy:459999,municipalLevy:479799,taxable:true});
  const s=parent({serviceLevy:10000,municipalLevy:10000,taxable:true});
  expect(decode(c.classify(h,s)).slice(1,3)).toEqual([1,2]);
  expect(decode(c.classify(h,{...s,serviceLevy:460000}))[1]).toBe(2);
  expect(decode(c.classify(parent({taxable:true}),parent()))[2]).toBe(1);
});

test("自立支援医療は被保険者と仮定した高給与親の所得帯だけを分類し、他方の所得割は加えない",()=>{
  const c=calculator(),other=parent({taxable:true,serviceLevy:235000});
  const code=(taxable,serviceLevy)=>decode(c.classify(parent({taxable,serviceLevy}),other))[3];
  expect(c.statuses[3]).toBe("calculated");
  expect([code(false,0),code(true,0),code(true,32999),code(true,33000),
    code(true,234999),code(true,235000)]).toEqual([1,2,2,3,3,4]);
});
