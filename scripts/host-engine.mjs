// Runs the website's own simulation Worker bundle (dist/assets/culture47.worker-*.js)
// inside a Node worker thread, so the PC computes with exactly the same engine.
import {parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
const self=globalThis;
self.self=self;
self.postMessage=message=>parentPort.postMessage(message);
parentPort.on('message',data=>self.onmessage?.({data}));
await import(pathToFileURL(workerData.bundle).href);
parentPort.postMessage({ready:true});
