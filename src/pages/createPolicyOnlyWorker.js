/** Independent worker for policy classifications; it never downloads or builds E's 3D financial surfaces. */
export default function createPolicyOnlyWorker(){
  return new Worker(new URL("./policyOnly.worker.js",import.meta.url));
}
