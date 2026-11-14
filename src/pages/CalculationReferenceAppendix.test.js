import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import CalculationReferenceAppendix from "./CalculationReferenceAppendix";
import catalog from "../data/calculation-function-catalog.json";

async function openReference(){
  render(<CalculationReferenceAppendix />);
  const summary=screen.getByText(/計算の流れと関数一覧を開く/);
  expect(summary.closest('details')).not.toHaveAttribute('open');
  fireEvent.click(summary);
  await waitFor(()=>expect(summary.closest('details')).toHaveAttribute('open'));
}

test('計算対応表は初期閉で、関数一覧・ソース・JSONを保持する',async()=>{
  await openReference();
  expect(screen.getByRole('heading',{name:'表A3　計算処理・関数一覧'})).toBeInTheDocument();
  const table=screen.getByRole('table',{name:'ソースコードの注記と関数の対応'});
  expect(within(table).getAllByRole('rowheader')).toHaveLength(catalog.functions.length);
  expect(within(table).getAllByRole('columnheader')).toHaveLength(6);
  const entry=catalog.functions.find(f=>f.name==='computeOptimalModel');
  expect(within(table).getByRole('link',{name:`${entry.file}:${entry.line}`})).toHaveAttribute('href',entry.sourceUrl);
  const download=screen.getByRole('link',{name:'関数一覧JSON'});
  expect(download).toHaveAttribute('download','calculation-function-catalog.json');
  expect(JSON.parse(decodeURIComponent(download.getAttribute('href').split(',').slice(1).join(',')))).toEqual(catalog);
});

test('計算処理から主要関数の実装へ追跡できる',async()=>{
  await openReference();
  const table=screen.getByRole('table',{name:'入力から計算・集計・表示用データ生成まで'});
  expect(within(table).getAllByRole('rowheader')).toHaveLength(10);
  for(const name of ['computeSeries','calculateSocialInsuranceComponents','calcTccaComputedLocal','calcM01Detail','calcN04Detail','computeOptimalModel','compactBreakdown']){
    const entry=catalog.functions.find(f=>f.name===name);
    expect(entry).toBeDefined();
    expect(within(table).getByRole('link',{name})).toHaveAttribute('href',entry.sourceUrl);
  }
});

test('関数名と計算区分で検索し、該当なしを表示できる',async()=>{
  await openReference();
  const table=screen.getByRole('table',{name:'ソースコードの注記と関数の対応'});
  const search=screen.getByRole('searchbox',{name:'関数名・計算内容で検索'});
  fireEvent.change(search,{target:{value:'calcM01Detail'}});
  expect(within(table).getAllByRole('rowheader')).toHaveLength(1);
  fireEvent.change(search,{target:{value:''}});
  fireEvent.change(screen.getByRole('combobox',{name:'計算処理の区分'}),{target:{value:'探索的調整モデル'}});
  expect(within(table).getAllByRole('rowheader')).toHaveLength(catalog.functions.filter(f=>f.category==='探索的調整モデル').length);
  fireEvent.change(search,{target:{value:'not-an-existing-function'}});
  expect(screen.getByText('該当する関数はありません。')).toHaveAttribute('role','status');
});
