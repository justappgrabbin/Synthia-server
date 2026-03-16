/**
 * YOU-N-I-VERSE — Shared runtime
 * Handles: node state, P2P mesh, Pyodide bridge, nav rendering
 * All pages load this file.
 */

const SK = 'yunv_node', PK = 'yunv_peers';

// ─── NODE ─────────────────────────────────────────────────────────
function saveNode(n) { window._YUNV_NODE = n; try{localStorage.setItem(SK,JSON.stringify(n));}catch(e){} }
function loadNode()  { try{const r=localStorage.getItem(SK); if(r){window._YUNV_NODE=JSON.parse(r);return window._YUNV_NODE;}}catch(e){} return null; }
function getNode()   { return window._YUNV_NODE || loadNode(); }

// ─── PEERS ────────────────────────────────────────────────────────
let _knownPeers = {};
function loadPeers() { try{const r=localStorage.getItem(PK);if(r)_knownPeers=JSON.parse(r);}catch(e){} }
function savePeers() { try{localStorage.setItem(PK,JSON.stringify(_knownPeers));}catch(e){} }
function getPeers()  { return _knownPeers; }
function getOnlinePeers() { return Object.keys(_conns); }

// ─── P2P ─────────────────────────────────────────────────────────
let _peer = null, _conns = {}, _meshListeners = {};

function emitMesh(ev, d) { (_meshListeners[ev]||[]).forEach(f=>{try{f(d);}catch(e){}}); }
function onMesh(ev, fn)  { (_meshListeners[ev]=_meshListeners[ev]||[]).push(fn); }

function hashStr(s) {
  let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*0x01000193)>>>0;}
  return h.toString(36);
}

function initMesh(onReady) {
  const node = getNode();
  if(!node) { if(onReady) onReady(null); return; }
  loadPeers();
  if(typeof Peer === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.2/peerjs.min.js';
    s.onload  = () => _startPeer(node, onReady);
    s.onerror = () => { if(onReady) onReady(null); };
    document.head.appendChild(s);
  } else _startPeer(node, onReady);
}

function _startPeer(node, onReady) {
  const pid = 'yunv_' + hashStr(node.address);
  node.peerId = pid; saveNode(node);

  _peer = new Peer(pid, {host:'0.peerjs.com',port:443,secure:true,path:'/'});

  _peer.on('open', id => {
    setMeshDot('on');
    emitMesh('online', id);
    if(onReady) onReady(id);
    const inv = new URL(location.href).searchParams.get('connect');
    if(inv && inv !== pid) _connectTo(inv);
    Object.keys(_knownPeers).forEach(p => { if(p!==pid) _connectTo(p); });
  });
  _peer.on('connection', c => _handleConn(c));
  _peer.on('error', e => { setMeshDot('seeking'); emitMesh('error', e.type); });
  _peer.on('disconnected', () => { setMeshDot('off'); _peer.reconnect(); });
}

function _connectTo(pid) {
  if(_conns[pid]) return;
  _handleConn(_peer.connect(pid, {reliable:true}));
}

function _handleConn(conn) {
  conn.on('open', () => {
    _conns[conn.peer] = conn;
    emitMesh('connected', conn.peer);
    const node = getNode();
    if(node) conn.send({type:'handshake', node:_nodePublic(node)});
  });
  conn.on('data', d => {
    if(!d?.type) return;
    if(d.type==='handshake'||d.type==='node_update') {
      _knownPeers[conn.peer] = d.node; savePeers();
      emitMesh('peers_updated', _knownPeers);
    }
  });
  conn.on('close',  () => { delete _conns[conn.peer]; emitMesh('disconnected', conn.peer); });
  conn.on('error',  e  => emitMesh('conn_error', {peer:conn.peer,err:e}));
}

function _nodePublic(node) {
  const r = node.report;
  return {
    name:    node.name,
    peerId:  node.peerId,
    address: node.address,
    trinity: {
      body:   r.body, mind:  r.mind, heart: r.heart,
      shadow: r.shadow, coherence: r.coherence,
      trop: r.body?.deg, sid: r.mind?.deg, drac: r.heart?.deg
    },
    ci:       r.ci,
    nineFields: r.nine_fields,
    penta:    node.penta,
    sentence: node.sentence,
    online:   true
  };
}

function broadcast(msg) { Object.values(_conns).forEach(c=>{try{c.send(msg);}catch(e){}});  }
function sendTo(pid,msg) { const c=_conns[pid]; if(c) try{c.send(msg);}catch(e){} }

function getInviteLink() {
  const node = getNode();
  if(!node?.peerId) return null;
  const url = new URL(location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, 'network.html');
  url.searchParams.set('connect', node.peerId);
  return url.toString();
}

// ─── NAV ──────────────────────────────────────────────────────────
function renderNav(active) {
  const pages = [
    {id:'index',     href:'index.html',     label:'◈ ENTER'},
    {id:'matrix',    href:'matrix.html',    label:'⬡ MATRIX'},
    {id:'network',   href:'network.html',   label:'◯ NETWORK'},
    {id:'profile',   href:'profile.html',   label:'△ PROFILE'},
    {id:'resonance', href:'resonance.html', label:'≋ RESONANCE'},
  ];
  return `<nav id="nav">
    ${pages.map(p=>`<a href="${p.href}"${p.id===active?' class="active"':''}>${p.label}</a>`).join('')}
    <div class="mesh-dot off" id="mesh-dot"></div>
  </nav>`;
}

function setMeshDot(state) {
  const d = document.getElementById('mesh-dot');
  if(d) d.className = 'mesh-dot ' + state;
}

// ─── PYODIDE BRIDGE ───────────────────────────────────────────────
// Pages that need Python calculations check window.pyCalculate
// If not available (Pyodide not loaded on this page), redirect to index
function requirePy(fn) {
  if(window.pyCalculate) return fn();
  // Pyodide only fully loads on index.html
  // Other pages use stored report data — no recalculation needed
  console.log('Pyodide not loaded on this page — using stored report data');
}

// Resonance comparison — called from resonance.html
async function compareNodes(nodeA, nodeB) {
  if(!window.pyodide) return null;
  try {
    const result = await window.pyodide.runPythonAsync(`
import json, ephemeris
ra = json.loads("""${JSON.stringify(nodeA.report).replace(/\\/g,'\\\\').replace(/"""/g,'\\"\\"\\"')}""")
rb = json.loads("""${JSON.stringify(nodeB.report).replace(/\\/g,'\\\\').replace(/"""/g,'\\"\\"\\"')}""")
json.dumps(ephemeris.compare_nodes(ra, rb))
`);
    return JSON.parse(result);
  } catch(e) {
    console.error('compareNodes error:', e);
    return null;
  }
}

// ─── UTILS ────────────────────────────────────────────────────────
function norm360(d) { return ((d%360)+360)%360; }
function angDiff(a,b) { const d=Math.abs(a-b)%360; return d>180?360-d:d; }
function cohPct(a,b)  { return Math.round(Math.max(0,1-angDiff(a,b)/180)*100); }
function formatDeg(d) {
  const signs=['Ari','Tau','Gem','Can','Leo','Vir','Lib','Sco','Sag','Cap','Aqu','Pis'];
  const n=norm360(d); return `${(n%30).toFixed(1)}° ${signs[Math.floor(n/30)]}`;
}

const GATE_NAMES = {
  1:'The Creative',2:'The Receptive',3:'Ordering',4:'Youthful Folly',5:'Waiting',
  6:'Conflict',7:'The Army',8:'Holding Together',9:'Taming Power',10:'Treading',
  11:'Peace',12:'Standstill',13:'Fellowship',14:'Power Skills',15:'Modesty',
  16:'Enthusiasm',17:'Following',18:'Work on What is Spoilt',19:'Approach',
  20:'Contemplation',21:'Biting Through',22:'Grace',23:'Splitting Apart',
  24:'Return',25:'Innocence',26:'The Taming Power',27:'Nourishment',
  28:'The Game Player',29:'The Abysmal',30:'Clinging Fire',31:'Influence',
  32:'Duration',33:'Retreat',34:'Power of the Great',35:'Progress',
  36:'Darkening of the Light',37:'The Family',38:'Opposition',39:'Obstruction',
  40:'Deliverance',41:'Decrease',42:'Increase',43:'Breakthrough',
  44:'Coming to Meet',45:'Gathering Together',46:'Pushing Upward',47:'Oppression',
  48:'The Well',49:'Revolution',50:'The Cauldron',51:'The Arousing',
  52:'Keeping Still',53:'Development',54:'The Marrying Maiden',55:'Abundance',
  56:'The Wanderer',57:'The Gentle',58:'The Joyous',59:'Dispersion',
  60:'Limitation',61:'Inner Truth',62:'Preponderance of Small',
  63:'After Completion',64:'Before Completion'
};

const VOICES     = ['I Define','I Remember','I Am','I Design','I Think'];
const BASE_NAMES = ['Movement','Evolution','Being','Design','Space'];
const PENTA_NAMES= ['','Foundation','Connector','Provider','Director','Transmitter'];

// Export everything
window.YUNV = {
  saveNode, loadNode, getNode,
  getPeers, getOnlinePeers, savePeers, loadPeers,
  initMesh, onMesh, broadcast, sendTo, getInviteLink,
  renderNav, setMeshDot,
  compareNodes, requirePy,
  norm360, angDiff, cohPct, formatDeg,
  GATE_NAMES, VOICES, BASE_NAMES, PENTA_NAMES
};
