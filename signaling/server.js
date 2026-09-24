import { WebSocketServer } from 'ws';
import webpush from 'web-push';
const PORT = process.env.PORT || 10000;
// PASTE YOUR REAL KEYS HERE from npx web-push generate-vapid-keys
const vapidKeys = {
  publicKey: 'BATeuCAksUg6_iGRtHVtooaaBiLKFhSk7alN2CKCNkZG3OCsR7A-d2brzOOCAU6xp7ucfyXAolTj2YueJUeIydQ',
  privateKey: 'VVQyw3BXZeB1Ck7E1Sz3YH5qDMZqTPMLOvOBBrMD5xs'
};
webpush.setVapidDetails('mailto:famline@example.com', vapidKeys.publicKey, vapidKeys.privateKey);
const wss = new WebSocketServer({ port: PORT });
console.log('FamLine v6 FINAL running '+PORT);
const families=new Map(), history=new Map(), pushSubs=new Map();
wss.on('connection', ws=>{
  ws.id=Math.random().toString(36).slice(2,9);
  ws.on('message', async raw=>{
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type==='ping'){ws.send(JSON.stringify({type:'pong'})); return;}
      if(msg.type==='join'){
        ws.familyCode=msg.familyCode; ws.userName=msg.name;
        if(!families.has(msg.familyCode)) families.set(msg.familyCode, new Set());
        families.get(msg.familyCode).add(ws);
        ws.send(JSON.stringify({type:'joined',id:ws.id}));
        const h=history.get(msg.familyCode)||[];
        if(h.length) ws.send(JSON.stringify({type:'history',messages:h}));
        return;
      }
      if(msg.type==='push-subscribe'){
        if(!pushSubs.has(msg.familyCode)) pushSubs.set(msg.familyCode, []);
        const list=pushSubs.get(msg.familyCode);
        if(!list.find(s=>s.subscription.endpoint===msg.subscription.endpoint)){
          list.push({subscription:msg.subscription,user:msg.user});
        }
        return;
      }
      if(!ws.familyCode) return;
      if(msg.type==='chat'){
        if(!history.has(ws.familyCode)) history.set(ws.familyCode, []);
        history.get(ws.familyCode).push({sender:msg.sender,role:msg.role,text:msg.text,ts:msg.ts});
        if(history.get(ws.familyCode).length>500) history.get(ws.familyCode).shift();
        const subs=pushSubs.get(ws.familyCode)||[];
        for(const sub of subs){
          if(sub.user?.name!==msg.sender){
            try{
              await webpush.sendNotification(sub.subscription, JSON.stringify({
                title: `${msg.sender} • ${msg.role}`,
                body: msg.text,
                tag:'famline-msg', type:'message', from:msg.sender, familyCode:ws.familyCode
              }));
            }catch(e){}
          }
        }
      }
      const callChannels=new Map();
if(msg.type==='call-offer' || msg.type==='call-answer' || msg.type==='ice' || msg.type==='call-end' || msg.type==='call-declined'){
  const channel = msg.callChannel || msg.familyCode;
  // FIX: Don't overwrite caller name! Keep original from
  const callerName = msg.from || ws.userName || 'Family';
  
  if(msg.type==='call-offer'){
    if(!callChannels.has(channel)) callChannels.set(channel, new Set());
    callChannels.get(channel).add(ws);
    console.log(`Call channel ${channel} by ${callerName}`);
  }
  if(msg.type==='call-answer' || msg.type==='ice'){
    if(callChannels.has(channel)) callChannels.get(channel).add(ws);
  }

  // FIX: Always relay offer to whole family so Abdallah gets it even if not in call channel yet
  // This fixes "Connecting P2P..." stuck
  if(msg.type==='call-offer'){
    const fam=families.get(ws.familyCode)||new Set();
    fam.forEach(c=>{
      if(c!==ws && c.readyState===1){
        c.send(JSON.stringify({
          type:msg.type,
          familyCode:msg.familyCode,
          callChannel:channel,
          offer:msg.offer,
          isVideo:msg.isVideo,
          from:callerName,
          fromName:callerName,
          fromId:ws.id
        }));
      }
    });
    // Push notifications
    const subs=pushSubs.get(ws.familyCode)||[];
    for(const sub of subs){
      if(sub.user?.name!==callerName){
        try{
          await webpush.sendNotification(sub.subscription, JSON.stringify({
            title:`Incoming ${msg.isVideo?'video':'voice'} call`,
            body:`${callerName} calling Nehme - Tap to answer`,
            tag:'famline-call', type:'call', isVideo:msg.isVideo, from:callerName, fromName:callerName, familyCode:ws.familyCode, callChannel:channel
          }));
        }catch(e){}
      }
    }
  } else {
    // For answer/ice/end, relay only to call channel (more stable)
    if(callChannels.has(channel)){
      callChannels.get(channel).forEach(c=>{
        if(c!==ws && c.readyState===1){
          c.send(JSON.stringify({...msg, from:callerName, fromName:callerName, fromId:ws.id}));
        }
      });
    } else {
      const fam=families.get(ws.familyCode)||new Set();
      fam.forEach(c=>{if(c!==ws) c.send(JSON.stringify({...msg, from:callerName, fromName:callerName, fromId:ws.id}));});
    }
  }
  if(msg.type==='call-end' || msg.type==='call-declined'){
    if(callChannels.has(channel)) callChannels.delete(channel);
  }
  return;
}
      const fam=families.get(ws.familyCode)||new Set();
      fam.forEach(c=>{if(c!==ws) c.send(JSON.stringify({...msg,from:ws.id,fromName:ws.userName}));});
    }catch(e){console.error(e);}
  });
  ws.on('close',()=>{if(ws.familyCode&&families.has(ws.familyCode)){families.get(ws.familyCode).delete(ws);}});
});