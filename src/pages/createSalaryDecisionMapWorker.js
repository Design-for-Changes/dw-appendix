// 全図で一つのエントリを使う。各描画は別インスタンスだが、配信時に共通計算コードを二重取得しない。
export {default as createSalaryDecisionMapWorker} from "./createSalarySurfaceWorker";
