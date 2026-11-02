// Dev only: serves api/market.mjs locally so the market import works under `ng serve`.
import http from 'node:http';
import { GET as market } from './api/market.mjs';
import { GET as kisk } from './api/kisk.mjs';

http
  .createServer(async (req, res) => {
    const GET = req.url.startsWith('/api/kisk') ? kisk : market;
    const r = await GET(new Request(`http://localhost${req.url}`));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  })
  .listen(3001);

export default { '/api': { target: 'http://localhost:3001' } };