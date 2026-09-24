import { WebSocketServer } from 'ws';
import webpush from 'web-push';
const PORT = process.env.PORT || 10000;

// PASTE YOUR REAL KEYS HERE
const vapidKeys = {
  publicKey: 'BLVVg5SpmJ92dJPIm6kiuukl98yLgU1ikKNy6TJgoqu02ygGdmPVLiGPHY0qOuVA44to_qdkj-AWzi9q2BIXpbY',
  privateKey: 'SjtWbX4qqckHddSLe9q9Xs8IzqlGQfH4FQqlO1vimj8'
};
webpush.setVapidDetails('mailto:famline@example.com', vapidKeys.publicKey, vapidKeys.privateKey);

const wss = new WebSocketServer({ port: PORT });
console.log('Signaling + Background Push running');

const families=new Map(), history=new Map(), pushSubs=new Map();

wss.on('connection', ws=>{
  ws.id=Math.random().toString(36).slice(2,9);
  ws.on('message', async raw=>{
    try{
      const msg=JSON.parse(raw.toString());
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
          console.log(`Push sub ${msg.user?.name} total ${list.length}`);
        }
        return;
      }
      if(!ws.familyCode) return;
      if(msg.type==='chat'){
        if(!history.has(ws.familyCode)) history.set(ws.familyCode, []);
        history.get(ws.familyCode).push({sender:msg.sender,role:msg.role,text:msg.text,ts:msg.ts});
      }
      if(msg.type==='call-offer'){
        console.log(`Call from ${msg.from} in ${ws.familyCode} - sending push to background`);
        const subs=pushSubs.get(ws.familyCode)||[];
        for(const sub of subs){
          if(sub.user?.name!==msg.from){
            try{
              await webpush.sendNotification(sub.subscription, JSON.stringify({
                title:`Incoming ${msg.isVideo?'video':'voice'} call`,
                body:`${msg.from} calling Nehme family - Tap to answer`,
                tag:'famline-call', type:'call', isVideo:msg.isVideo, from:msg.from, familyCode:ws.familyCode
              }));
              console.log(`Push sent to ${sub.user?.name}`);
            }catch(e){console.error('Push fail',e.message);}
          }
        }
      }
      const fam=families.get(ws.familyCode)||new Set();
      fam.forEach(c=>{if(c!==ws) c.send(JSON.stringify({...msg,from:ws.id}));});
    }catch(e){console.error(e);}
  });
  ws.on('close',()=>{if(ws.familyCode&&families.has(ws.familyCode)) families.get(ws.familyCode).delete(ws);});
});