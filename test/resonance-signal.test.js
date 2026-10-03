const { spawn } = require('child_process');
const assert = require('assert');
const WebSocket = require('ws');

const PORT = 18765;
const base = `http://127.0.0.1:${PORT}`;
const wsUrl = `ws://127.0.0.1:${PORT}/signal`;

function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function waitHealth(){
  for(let i=0;i<50;i++){
    try { const r=await fetch(base+'/health'); if(r.ok) return; } catch {}
    await wait(100);
  }
  throw new Error('lite server did not become healthy');
}
function openPeer(id){
  return new Promise((resolve,reject)=>{
    const ws=new WebSocket(wsUrl);
    const seen=[];
    const timer=setTimeout(()=>reject(new Error('peer open timeout '+id)),5000);
    ws.on('message',raw=>{
      const msg=JSON.parse(raw.toString());
      seen.push(msg);
      if(msg.type==='signal-ready'){
        ws.send(JSON.stringify({type:'register',deviceId:id}));
        clearTimeout(timer);
        resolve({ws,seen});
      }
    });
    ws.on('error',reject);
  });
}
function waitMessage(peer,predicate,label){
  return new Promise((resolve,reject)=>{
    const hit=peer.seen.find(predicate); if(hit) return resolve(hit);
    const timer=setTimeout(()=>{peer.ws.off('message',handler);reject(new Error('timeout waiting '+label));},5000);
    function handler(raw){
      const msg=JSON.parse(raw.toString()); peer.seen.push(msg);
      if(predicate(msg)){clearTimeout(timer);peer.ws.off('message',handler);resolve(msg);}
    }
    peer.ws.on('message',handler);
  });
}

(async()=>{
  const child=spawn(process.execPath,['server/lite.js'],{
    cwd:process.cwd(),
    env:{...process.env,PORT:String(PORT),NODE_MODE:'lite',RATE_LIMIT_MAX:'5000'},
    stdio:['ignore','pipe','pipe']
  });
  let stderr=''; child.stderr.on('data',d=>stderr+=d.toString());
  try{
    await waitHealth();
    const a=await openPeer('resonance-test-a');
    const b=await openPeer('resonance-test-b');
    await waitMessage(a,m=>m.type==='peers'&&m.list.includes('resonance-test-a')&&m.list.includes('resonance-test-b'),'peer list A');
    await waitMessage(b,m=>m.type==='peers'&&m.list.includes('resonance-test-a')&&m.list.includes('resonance-test-b'),'peer list B');

    a.ws.send(JSON.stringify({type:'offer',to:'resonance-test-b',sdp:{type:'offer',sdp:'test-offer'}}));
    const offer=await waitMessage(b,m=>m.type==='offer','forwarded offer');
    assert.equal(offer.from,'resonance-test-a');
    assert.equal(offer.to,'resonance-test-b');

    b.ws.send(JSON.stringify({type:'answer',to:'resonance-test-a',sdp:{type:'answer',sdp:'test-answer'}}));
    const answer=await waitMessage(a,m=>m.type==='answer','forwarded answer');
    assert.equal(answer.from,'resonance-test-b');

    const status=await (await fetch(base+'/api/v3/discovery/signal')).json();
    assert.equal(status.ok,true);
    assert.equal(status.protocol,'resonance-webrtc-v1');
    assert.equal(status.connected_peers,2);
    assert.equal(status.persists_payloads,false);

    a.ws.close(); b.ws.close();
    console.log('PASS resonance signaling: discovery + offer/answer relay + non-persistence status');
  } finally {
    child.kill('SIGTERM');
    await wait(100);
    if(stderr) process.stderr.write(stderr);
  }
})().catch(err=>{ console.error(err); process.exit(1); });
