// Webpack emits the worker under the same base URL as the app (including GitHub Pages).
export default function createSalarySurfaceWorker() {
  return new Worker(new URL("./salarySurface.worker.js", import.meta.url));
}
