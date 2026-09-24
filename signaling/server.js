
import { WebSocketServer } from 'ws';
const PORT = process.env.PORT || 10000;
const wss = new WebSocketServer({ port: PORT });
console.log(`FamLine Signaling + Push ready on ${PORT}`);
const families = new Map();
const messageHistory = new Map();
const pushSubs = new Map();
const MAX=200;
wss.on('connection', ws=>{
  ws.id=Math.random().toString(36).slice(2,9);
  ws.on('message', raw=>{
    try{
      const msg=JSON.parse(raw.toString());
      if(msg.type==='join'){
        ws.familyCode=msg.familyCode; ws.userName=msg.name;
        if(!families.has(msg.familyCode)) families.set(msg.familyCode, new Set());
        families.get(msg.familyCode).add(ws);
        ws.send(JSON.stringify({type:'joined',id:ws.id}));
        const h=messageHistory.get(msg.familyCode)||[];
        if(h.length) ws.send(JSON.stringify({type:'history',messages:h}));
        families.get(msg.familyCode).forEach(c=>{if(c!==ws) c.send(JSON.stringify({type:'peer-joined',id:ws.id,name:msg.name}))});
        return;
      }
      if(msg.type==='push-subscribe'){
        const code=msg.familyCode;
        if(!pushSubs.has(code)) pushSubs.set(code, []);
        const list=pushSubs.get(code);
        if(!list.find(s=>s.subscription.endpoint===msg.subscription.endpoint)){
          list.push({subscription:msg.subscription,user:msg.user});
        }
        return;
      }
      if(!ws.familyCode) return;
      if(msg.type==='chat'){
        if(!messageHistory.has(ws.familyCode)) messageHistory.set(ws.familyCode, []);
        const hist=messageHistory.get(ws.familyCode);
        hist.push({sender:msg.sender,role:msg.role,text:msg.text,ts:msg.ts});
        if(hist.length>MAX) hist.shift();
      }
      const family=families.get(ws.familyCode)||new Set();
      family.forEach(client=>{if(client!==ws) client.send(JSON.stringify({...msg,from:ws.id,fromName:ws.userName}));});
    }catch(e){console.error(e);}
  });
  ws.on('close',()=>{
    if(ws.familyCode&&families.has(ws.familyCode)){
      families.get(ws.familyCode).delete(ws);
      families.get(ws.familyCode).forEach(c=>c.send(JSON.stringify({type:'peer-left',id:ws.id})));
    }
  });
});
console.log('Ready - P2P live sync');
