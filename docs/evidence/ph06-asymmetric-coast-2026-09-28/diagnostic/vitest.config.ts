import base from '../../../vite.config.ts';
// Override rather than concatenate the project's test include list.
export default { ...base, test: { ...base.test, include: ['.autopilot/ph06/asymmetric-topology-probe/topology.test.ts'], exclude: [], maxWorkers: 1 } };
