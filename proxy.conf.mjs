// Dev only: serves api/character.ts locally so the character lookup works under `ng serve`.
import http from 'node:http';
import { GET } from './api/character.ts';

http
  .createServer(async (req, res) => {
    const r = await GET(new Request(`http://localhost${req.url}`));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(await r.text());
  })
  .listen(3001);

export default { '/api': { target: 'http://localhost:3001' } };