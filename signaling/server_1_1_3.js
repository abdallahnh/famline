
import { WebSocketServer } from 'ws';
const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`FamLine Signaling running on ${PORT}`);

const families = new Map();

wss.on('connection', (ws) => {
  ws.id = Math.random().toString(36).slice(2, 9);
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'join') {
        ws.familyCode = msg.familyCode;
        if (!families.has(msg.familyCode)) families.set(msg.familyCode, new Set());
        families.get(msg.familyCode).add(ws);
        ws.send(JSON.stringify({ type: 'joined', id: ws.id }));
        // notify others
        families.get(msg.familyCode).forEach(c => {
          if (c !== ws) c.send(JSON.stringify({ type: 'peer-joined', id: ws.id, name: msg.name }));
        });
        console.log(`Peer ${ws.id} joined family ${msg.familyCode}`);
        return;
      }
      if (!ws.familyCode) return;
      const family = families.get(ws.familyCode) || new Set();
      family.forEach(client => {
        if (client !== ws && (!msg.to || client.id === msg.to)) {
          client.send(JSON.stringify({ ...msg, from: ws.id }));
        }
      });
    } catch(e){ console.error(e); }
  });
  ws.on('close', () => {
    if (ws.familyCode && families.has(ws.familyCode)) {
      families.get(ws.familyCode).delete(ws);
      families.get(ws.familyCode).forEach(c => c.send(JSON.stringify({ type: 'peer-left', id: ws.id })));
      console.log(`Peer ${ws.id} left family ${ws.familyCode}`);
    }
  });
});

console.log('Ready for family connections');
