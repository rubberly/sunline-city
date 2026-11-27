// Sunline City server: serves the game and relays online versus play over WebSockets.
// Each player sends a small "presence" object (position, car, health, hits); the server
// merges it and broadcasts everyone's state about 20 times a second.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const zlib = require('zlib');
const MODELS = path.join(__dirname, 'models');
const modelCache = new Map();

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 32;
const GAME_FILE = path.join(__dirname, 'index.html');

// index.html is written as a page body (the claude.ai artifact wraps it), so wrap it here too.
const HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>' +
  '</head><body>';
let page = null;
function gamePage() {
  if (!page || process.env.NODE_ENV !== 'production') page = HEAD + fs.readFileSync(GAME_FILE, 'utf8') + '</body></html>';
  return page;
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(gamePage());
    return;
  }
  // Lantern Court Mall (the user's 3D mall project), opened from the downtown mall building
  if (url === '/mall' || url === '/mall/' || url === '/mall/index.html') {
    if (url === '/mall') { res.writeHead(301, { Location: '/mall/' }); res.end(); return; }
    fs.readFile(path.join(__dirname, 'mall', 'index.html'), (err, buf) => { if (err) { res.writeHead(404); res.end('Not found'); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); res.end(buf); });
    return;
  }
  if (url.startsWith('/models/')) {
    const rel = decodeURIComponent(url.slice('/models/'.length));
    const name = rel;
    const file = path.join(MODELS, rel);
    if (!/^[\w\-]+(\/[\w\-]+)*\/?[\w.\-]+\.(glb|json|jpg|png)$/.test(rel) || rel.includes('..') || !path.resolve(file).startsWith(path.resolve(MODELS)) || !fs.existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    let entry = modelCache.get(name);
    if (!entry) { const raw = fs.readFileSync(file); entry = { raw, gz: zlib.gzipSync(raw, { level: 9 }) }; modelCache.set(name, entry); }
    const type = name.endsWith('.glb') ? 'model/gltf-binary' : name.endsWith('.jpg') ? 'image/jpeg' : name.endsWith('.png') ? 'image/png' : 'application/json';
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=604800', ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
    res.end(gzip ? entry.gz : entry.raw);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const clients = new Map();
let dirty = false;

wss.on('connection', (ws) => {
  if (clients.size >= MAX_PLAYERS) { ws.close(1013, 'Server full'); return; }
  const id = 'p' + Math.random().toString(36).slice(2, 10);
  const client = { id, ws, p: {}, alive: true };
  clients.set(id, client);
  ws.send(JSON.stringify({ t: 'hello', id, now: Date.now() }));
  dirty = true;

  ws.on('pong', () => { client.alive = true; });
  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf); } catch (e) { return; }
    if (msg && msg.t === 'ping') { if (typeof msg.c === 'number') ws.send(JSON.stringify({ t: 'pong', c: msg.c, s: Date.now() })); return; }
    if (!msg || msg.t !== 'p' || !msg.d || typeof msg.d !== 'object' || Array.isArray(msg.d)) return;
    const d = {};
    for (const key of Object.keys(msg.d).slice(0, 32)) {
      d[key] = msg.d[key];
      if (msg.d[key] === null) delete client.p[key];
      else client.p[key] = msg.d[key];
    }
    if (JSON.stringify(client.p).length > 8192) { client.p = {}; dirty = true; return; }
    // relay this player's change to everyone else right away (no waiting for a tick)
    const out = JSON.stringify({ t: 'u', id, d });
    for (const c of clients.values()) if (c.id !== id && c.ws.readyState === 1) c.ws.send(out);
  });
  ws.on('close', () => { clients.delete(id); dirty = true; });
  ws.on('error', () => {});
});

// Full player list when someone joins or leaves (checked 20x a second), plus a resync every 3 seconds.
let lastFull = 0;
setInterval(() => {
  if (!dirty && Date.now() - lastFull < 3000) return;
  dirty = false; lastFull = Date.now();
  const msg = JSON.stringify({ t: 'peers', peers: [...clients.values()].map((c) => ({ id: c.id, p: c.p })) });
  for (const c of clients.values()) if (c.ws.readyState === 1) c.ws.send(msg);
}, 50);

// Drop dead connections (keeps the hosting proxy from closing idle sockets too).
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch (e) {}
  }
}, 25000);

server.listen(PORT, () => console.log('Sunline City running on port ' + PORT));
