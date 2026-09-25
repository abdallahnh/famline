import WebSocket = require('ws');
import webpush = require('web-push');

const PORT = process.env.PORT || 10000;

// VAPID - put your keys in Render Environment Variables
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BATeuCAksUg6_iGRtHVtooaaBiLKFhSk7alN2CKCNkZG3OCsR7A-d2brzOOCAU6xp7ucfyXAolTj2YueJUeIydQ';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'VVQyw3BXZeB1Ck7E1Sz3YH5qDMZqTPMLOvOBBrMD5xs';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:famline@example.com', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('VAPID enabled ✅', VAPID_PUBLIC.substring(0,15)+'...');
} else {
  console.log('VAPID private missing - push will not work until you set VAPID_PRIVATE_KEY in Render');
}

const wss = new WebSocket.Server({ port: PORT });

// familyCode -> [{subscription, name}]
const pushSubs = new Map();
// familyCode -> Set of ws clients (tracked via wss.clients but we also keep names)
// callChannel -> familyCode
const callChannels = new Map();

wss.on('connection', (ws) => {
  ws.familyCode = null;
  ws.userName = null;

  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    // JOIN
    if (m.type === 'join') {
      ws.familyCode = m.familyCode;
      ws.userName = (m.name || '').trim();
      console.log(`JOIN ${ws.userName} -> ${ws.familyCode}`);
      return;
    }

    // PUSH SUBSCRIBE
    if (m.type === 'push-subscribe') {
      const code = m.familyCode;
      const name = (m.name || ws.userName || '').trim();
      const sub = m.subscription;
      if (!code || !sub) return;
      if (!pushSubs.has(code)) pushSubs.set(code, []);
      const list = pushSubs.get(code);
      // Remove old sub for same user
      const filtered = list.filter(s => s.name.toLowerCase() !== name.toLowerCase());
      filtered.push({ subscription: sub, name: name });
      pushSubs.set(code, filtered);
      ws.familyCode = code;
      ws.userName = name;
      console.log(`PUSH SUB ${name} -> ${code} (${filtered.length} subs)`);
      return;
    }

    // CHAT - broadcast to family EXCEPT sender (fixes SMS from self)
    if (m.type === 'chat') {
      const code = m.familyCode;
      const senderName = (m.sender || ws.userName || '').trim();
      if (!code) return;
      
      // 1. WebSocket broadcast - exclude self
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.familyCode === code) {
          const cName = (client.userName || '').toLowerCase();
          if (cName !== senderName.toLowerCase()) {
            client.send(JSON.stringify(m));
          }
        }
      });

      // 2. Push notification - exclude self (fixes notification from myself)
      const subs = pushSubs.get(code) || [];
      subs.forEach(s => {
        if (s.name.toLowerCase() === senderName.toLowerCase()) return; // <-- SELF FIX
        try {
          webpush.sendNotification(s.subscription, JSON.stringify({
            title: senderName,
            body: m.text || 'New message',
            tag: 'chat',
            data: { familyCode: code }
          })).catch(err => console.log('Push chat failed', err.message));
        } catch {}
      });
      return;
    }

    // CALL-OFFER - with caller-name channel + exclude self
    if (m.type === 'call-offer') {
      const code = m.familyCode;
      const fromName = (m.fromName || m.from || ws.userName || '').trim();
      const channel = m.callChannel || `${code}_call_${fromName}_${Date.now()}`;
      callChannels.set(channel, code);
      
      console.log(`CALL-OFFER ${fromName} -> ${code} channel ${channel}`);

      // Broadcast to whole family EXCEPT caller (fixes you getting notification to answer your own call)
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.familyCode === code) {
          const cName = (client.userName || '').toLowerCase();
          if (cName !== fromName.toLowerCase()) { // <-- SELF FIX FOR CALL
            client.send(JSON.stringify({
              type: 'call-offer',
              familyCode: code,
              callChannel: channel,
              offer: m.offer,
              isVideo: m.isVideo,
              from: fromName,
              fromName: fromName
            }));
          }
        }
      });

      // Push for call - exclude self
      const subs = pushSubs.get(code) || [];
      subs.forEach(s => {
        if (s.name.toLowerCase() === fromName.toLowerCase()) return; // <-- SELF FIX
        try {
          webpush.sendNotification(s.subscription, JSON.stringify({
            title: `${fromName} calling...`,
            body: m.isVideo ? 'Video call' : 'Voice call',
            tag: 'call',
            data: { familyCode: code, callChannel: channel }
          })).catch(err => console.log('Push call failed', err.message));
        } catch {}
      });
      return;
    }

    // CALL-ANSWER - send to caller only (via channel)
    if (m.type === 'call-answer') {
      const channel = m.callChannel;
      const code = m.familyCode;
      const fromName = (m.fromName || m.from || ws.userName || '').trim();
      console.log(`CALL-ANSWER ${fromName} channel ${channel}`);
      
      wss.clients.forEach(client => {
        if (client.readyState === 1 && (client.familyCode === code || callChannels.get(channel) === code)) {
          // Don't send answer back to answerer
          if ((client.userName||'').toLowerCase() !== fromName.toLowerCase()) {
            client.send(JSON.stringify({
              type: 'call-answer',
              familyCode: code,
              callChannel: channel,
              answer: m.answer,
              from: fromName,
              fromName: fromName
            }));
          }
        }
      });
      return;
    }

    // ICE - relay to family except sender
    if (m.type === 'ice') {
      const code = m.familyCode;
      const channel = m.callChannel;
      const sender = (ws.userName || '').toLowerCase();
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client !== ws) {
          const sameFamily = client.familyCode === code;
          const sameChannel = channel && callChannels.get(channel) === client.familyCode;
          if (sameFamily || sameChannel) {
            if ((client.userName||'').toLowerCase() !== sender) {
              client.send(JSON.stringify({
                type: 'ice',
                familyCode: code,
                callChannel: channel,
                candidate: m.candidate
              }));
            }
          }
        }
      });
      return;
    }

    // CALL-END / DECLINED - broadcast to all in channel except sender
    if (m.type === 'call-end' || m.type === 'call-declined') {
      const code = m.familyCode;
      const channel = m.callChannel;
      const targetCode = code || callChannels.get(channel);
      console.log(`${m.type} ${ws.userName} -> ${targetCode} channel ${channel}`);
      
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.familyCode === targetCode) {
          client.send(JSON.stringify({
            type: m.type,
            familyCode: targetCode,
            callChannel: channel
          }));
        }
      });
      if (channel) callChannels.delete(channel);
      return;
    }

    if (m.type === 'ping') {
      ws.send(JSON.stringify({type:'pong'}));
    }
  });

  ws.on('close', () => {
    console.log(`CLOSE ${ws.userName} ${ws.familyCode}`);
  });
});

console.log(`FamLine signaling FINAL running on ${PORT} - Self-notification fixed ✅`);