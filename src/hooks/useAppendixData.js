import { useEffect, useMemo, useRef, useState } from "react";

const X_MIN = 200;
const CHUNK_SIZE = 25;

function chunkStartFor(salaryWan) {
  const salary = Math.max(X_MIN, Math.round(Number(salaryWan) || X_MIN));
  return X_MIN + Math.floor((salary - X_MIN) / CHUNK_SIZE) * CHUNK_SIZE;
}

function publicDataUrl(path) {
  const base = process.env.PUBLIC_URL || ".";
  return `${base}/generated/appendix/${path}`;
}

async function fetchGzipJson(path, options) {
  const response = await fetch(publicDataUrl(path), options);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  if (typeof DecompressionStream !== "function") {
    throw new Error("このブラウザはgzip表示データの展開に対応していません。");
  }
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}

export function useAppendixData(selectedId, selectedSalary) {
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [detailVersion, setDetailVersion] = useState(0);
  const detailCache = useRef(new Map());
  const chunkStart = chunkStartFor(selectedSalary);
  const detailKey = `${selectedId}-${chunkStart}`;

  useEffect(() => {
    let ignore = false;
    fetchGzipJson("summary.json.gz")
      .then((json) => {
        if (!ignore) setSummary(json);
      })
      .catch((error) => {
        if (!ignore) setSummaryError(error);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId || detailCache.current.has(detailKey)) return undefined;
    const controller = new AbortController();
    fetchGzipJson(`details/${detailKey}.json.gz`, { signal: controller.signal })
      .then((json) => {
        detailCache.current.set(detailKey, json.points || []);
        setDetailVersion((version) => version + 1);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          // eslint-disable-next-line no-console
          console.error("appendix detail json load error", error);
        }
      });
    return () => controller.abort();
  }, [detailKey, selectedId]);

  const selectedPoint = useMemo(() => {
    const points = detailCache.current.get(detailKey) || [];
    return points.find((point) => Number(point.x) === Number(selectedSalary)) || null;
  }, [detailKey, detailVersion, selectedSalary]);

  return {
    data: summary?.cases || [],
    ready: Boolean(summary),
    error: summaryError,
    selectedPoint,
    detailReady: Boolean(selectedPoint),
  };
}
