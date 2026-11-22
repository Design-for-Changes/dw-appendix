export default function createSalaryLevelWorker(){
  return new Worker(new URL("./salaryLevel.worker.js",import.meta.url));
}
