// Sunline City server: serves the game and relays online versus play over WebSockets.
// Each player sends a small "presence" object (position, car, health, hits); the server
// merges it and broadcasts everyone's state about 20 times a second.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

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
  ws.send(JSON.stringify({ t: 'hello', id }));
  dirty = true;

  ws.on('pong', () => { client.alive = true; });
  ws.on('message', (buf) => {
    let msg;
    try { msg = JSON.parse(buf); } catch (e) { return; }
    if (!msg || msg.t !== 'p' || !msg.d || typeof msg.d !== 'object') return;
    for (const key of Object.keys(msg.d).slice(0, 32)) {
      if (msg.d[key] === null) delete client.p[key];
      else client.p[key] = msg.d[key];
    }
    if (JSON.stringify(client.p).length > 8192) client.p = {};
    dirty = true;
  });
  ws.on('close', () => { clients.delete(id); dirty = true; });
  ws.on('error', () => {});
});

// Broadcast everyone's state ~20x a second when something changed.
setInterval(() => {
  if (!dirty) return;
  dirty = false;
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
