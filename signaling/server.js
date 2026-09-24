
import { WebSocketServer } from 'ws';
import webpush from 'web-push';
const PORT = process.env.PORT || 10000;
webpush.setVapidDetails('mailto:famline@example.com', 'BATeuCAksUg6_iGRtHVtooaaBiLKFhSk7alN2CKCNkZG3OCsR7A-d2brzOOCAU6xp7ucfyXAolTj2YueJUeIydQ', 'VVQyw3BXZeB1Ck7E1Sz3YH5qDMZqTPMLOvOBBrMD5xs');
const wss = new WebSocketServer({ port: PORT });
console.log('iOS Fixed BG running '+PORT);
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
      }
      if(msg.type==='call-offer'){
        const subs=pushSubs.get(ws.familyCode)||[];
        for(const sub of subs){
          if(sub.user?.name!==msg.from){
            try{
              await webpush.sendNotification(sub.subscription, JSON.stringify({
                title:`Incoming ${msg.isVideo?'video':'voice'} call`,
                body:`${msg.from} calling - Tap to answer`,
                tag:'famline-call', type:'call', isVideo:msg.isVideo, from:msg.from, familyCode:ws.familyCode
              }));
            }catch(e){}
          }
        }
      }
      const fam=families.get(ws.familyCode)||new Set();
      fam.forEach(c=>{if(c!==ws) c.send(JSON.stringify({'...msg,from:ws.id}));});
    }catch(e){}
  });
  ws.on('close',()=>{if(ws.familyCode&&families.has(ws.familyCode)) families.get(ws.familyCode).delete(ws);});
});
console.log('Ready iOS fixed');
