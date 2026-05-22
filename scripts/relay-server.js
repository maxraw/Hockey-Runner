const http = require('http');
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8787);
const clients = new Set();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><meta charset="utf-8"><title>Hockey Runner Relay</title></head><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#08111f;color:#f8fafc;padding:24px"><h1>Hockey Runner Relay</h1><p>WebSocket relay is running.</p><p>Use one of these URLs inside the app:</p><pre>${networkUrls().map((ip) => `ws://${ip}:${PORT}`).join('\n')}</pre><p>Connected clients: ${clients.size}</p></body></html>`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  ws.meta = { role: 'unknown', room: 'default', ip: req.socket.remoteAddress };
  clients.add(ws);
  console.log(`[connect] ${ws.meta.ip} clients=${clients.size}`);

  ws.on('message', (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch (err) {
      return;
    }

    if (msg.type === 'hello') {
      ws.meta.role = msg.role || 'unknown';
      ws.meta.room = msg.room || 'default';
      console.log(`[hello] role=${ws.meta.role} room=${ws.meta.room} ip=${ws.meta.ip}`);
    }

    if (msg.type === 'input') {
      console.log(`[input] room=${msg.room || ws.meta.room} cmd=${msg.cmd} confidence=${msg.confidence} speed=${msg.speed} reason=${msg.reason || ''}`);
    }

    const payload = JSON.stringify({ ...msg, relayTs: Date.now() });
    for (const client of clients) {
      if (client === ws || client.readyState !== 1) continue;
      const sameRoom = (client.meta?.room || 'default') === (msg.room || ws.meta.room || 'default');
      if (sameRoom) client.send(payload);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[close] ${ws.meta.ip} clients=${clients.size}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Hockey Runner relay started');
  console.log(`HTTP status: http://localhost:${PORT}`);
  console.log('Use these WebSocket URLs on devices in the same Wi-Fi:');
  networkUrls().forEach((ip) => console.log(`  ws://${ip}:${PORT}`));
});

function networkUrls() {
  const nets = os.networkInterfaces();
  const result = [];
  Object.values(nets).forEach((items) => {
    (items || []).forEach((item) => {
      if (item.family === 'IPv4' && !item.internal) result.push(item.address);
    });
  });
  return result.length ? result : ['127.0.0.1'];
}
