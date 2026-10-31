// Dev only: serves api/market.ts locally so the market import works under `ng serve`.
import http from 'node:http';
import { GET } from './api/market.ts';

http
  .createServer(async (req, res) => {
    const r = await GET(new Request(`http://localhost${req.url}`));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  })
  .listen(3001);

export default { '/api': { target: 'http://localhost:3001' } };