import { WebSocketServer } from 'ws';
import webpush from 'web-push';

const PORT = process.env.PORT || 10000;

// VAPID - put your keys in Render Environment Variables
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || 'BATeuCAksUg6_iGRtHVtooaaBiLKFhSk7alN2CKCNkZG3OCsR7A-d2brzOOCAU6xp7ucfyXAolTj2YueJUeIydQ';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || 'VVQyw3BXZeB1Ck7E1Sz3YH5qDMZqTPMLOvOBBrMD5xs';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails('mailto:famline@example.com', VAPID_PUBLIC, VAPID_PRIVATE);
  console.log('VAPID enabled ✅', VAPID_PUBLIC.substring(0,15)+'...');
} else {
  console.log('VAPID private missing - push will not work until you set VAPID_PRIVATE_KEY');
}

const wss = new WebSocketServer({ port: PORT });

// familyCode -> [{subscription, name}]
const pushSubs = new Map();
// callChannel -> familyCode
const callChannels = new Map();

wss.on('connection', (ws) => {
  ws.familyCode = null;
  ws.userName = null;

  ws.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === 'join') {
      ws.familyCode = m.familyCode;
      ws.userName = (m.name || '').trim();
      console.log(`JOIN ${ws.userName} -> ${ws.familyCode}`);
      return;
    }

    if (m.type === 'push-subscribe') {
      const code = m.familyCode;
      const name = (m.name || ws.userName || '').trim();
      const sub = m.subscription;
      if (!code || !sub) return;
      if (!pushSubs.has(code)) pushSubs.set(code, []);
      const list = pushSubs.get(code);
      const filtered = list.filter(s => s.name.toLowerCase() !== name.toLowerCase());
      filtered.push({ subscription: sub, name: name });
      pushSubs.set(code, filtered);
      ws.familyCode = code;
      ws.userName = name;
      console.log(`PUSH SUB ${name} -> ${code} (${filtered.length})`);
      return;
    }

    // CHAT - exclude self (fixes SMS from myself)
    if (m.type === 'chat') {
      const code = m.familyCode;
      const senderName = (m.sender || ws.userName || '').trim();
      if (!code) return;
      
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.familyCode === code) {
          const cName = (client.userName || '').toLowerCase();
          if (cName !== senderName.toLowerCase()) {
            client.send(JSON.stringify(m));
          }
        }
      });

      const subs = pushSubs.get(code) || [];
      subs.forEach(s => {
        if (s.name.toLowerCase() === senderName.toLowerCase()) return; // SELF FIX
        webpush.sendNotification(s.subscription, JSON.stringify({
          title: senderName,
          body: m.text || 'New message',
          tag: 'chat'
        })).catch(e => console.log('Push chat fail', e.message));
      });
      return;
    }

    // CALL-OFFER - exclude self (fixes you getting answer prompt for your own call)
    if (m.type === 'call-offer') {
      const code = m.familyCode;
      const fromName = (m.fromName || m.from || ws.userName || '').trim();
      const channel = m.callChannel || `${code}_call_${fromName}_${Date.now()}`;
      callChannels.set(channel, code);
      console.log(`CALL-OFFER ${fromName} -> ${code} ${channel}`);

      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.familyCode === code) {
          if ((client.userName||'').toLowerCase() !== fromName.toLowerCase()) { // SELF FIX
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

      const subs = pushSubs.get(code) || [];
      subs.forEach(s => {
        if (s.name.toLowerCase() === fromName.toLowerCase()) return; // SELF FIX
        webpush.sendNotification(s.subscription, JSON.stringify({
          title: `${fromName} calling...`,
          body: m.isVideo ? 'Video call' : 'Voice call',
          tag: 'call'
        })).catch(e => console.log('Push call fail', e.message));
      });
      return;
    }

    if (m.type === 'call-answer') {
      const channel = m.callChannel;
      const code = m.familyCode;
      const fromName = (m.fromName || m.from || ws.userName || '').trim();
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.familyCode === (code || callChannels.get(channel))) {
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

    if (m.type === 'ice') {
      const code = m.familyCode;
      const channel = m.callChannel;
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client !== ws) {
          const sameFamily = client.familyCode === code;
          const sameChannel = channel && callChannels.get(channel) === client.familyCode;
          if (sameFamily || sameChannel) {
            client.send(JSON.stringify({
              type: 'ice',
              familyCode: code,
              callChannel: channel,
              candidate: m.candidate
            }));
          }
        }
      });
      return;
    }

    if (m.type === 'call-end' || m.type === 'call-declined') {
      const code = m.familyCode || callChannels.get(m.callChannel);
      const channel = m.callChannel;
      wss.clients.forEach(client => {
        if (client.readyState === 1 && client.familyCode === code) {
          client.send(JSON.stringify({ type: m.type, familyCode: code, callChannel: channel }));
        }
      });
      if (channel) callChannels.delete(channel);
      return;
    }

    if (m.type === 'ping') ws.send(JSON.stringify({type:'pong'}));
  });

  ws.on('close', () => console.log(`CLOSE ${ws.userName}`));
});

console.log(`FamLine FINAL ESM running on ${PORT} - Self-fix ✅`);console.log(`FamLine signaling FINAL running on ${PORT} - Self-notification fixed ✅`);