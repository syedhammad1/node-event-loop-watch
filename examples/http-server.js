import { createServer } from 'node:http';
import { createEventLoopWatch } from '../src/index.js';
let latest = null;
const watcher = createEventLoopWatch({
  onSample: sample => { latest = sample; },
  onAlert: sample => console.warn('event_loop_delay', sample),
}).start();
const server = createServer((req, res) => {
  if (req.url !== '/metrics') { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({eventLoop: latest}));
}).listen(3000, '127.0.0.1', () => console.log('http://127.0.0.1:3000/metrics'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  watcher.stop();
  server.close();
});
