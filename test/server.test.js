// Speelt een compleet potje via de echte server: host + joiner + bot.
process.env.PORT = '0'; process.env.BOT_DELAY = '1'; process.env.AWAY_DELAY = '30'; process.env.FX_WAIT = '0'; process.env.DRAW_SHOW = '5';
const assert = require('assert');
const WebSocket = require('ws');
const { server } = require('../server.js');
function client(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port), c = { ws, msgs: [], sess: null, lobby: null, v: null, errors: [] };
  c.bin = [];
  ws.on('message', (raw, isBinary) => {
    if (isBinary) { c.bin.push(raw); return; }
    const m = JSON.parse(raw); c.msgs.push(m);
    if (m.t === 'joined') c.sess = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.errors.push(m.msg);
    if (m.t === 'state') { c.v = m.v; if (c.auto) autoplay(c); }
  });
  c.send = o => ws.send(JSON.stringify(o));
  c.open = new Promise(r => ws.on('open', r));
  return c;
}
function autoplay(c) {
  const v = c.v;
  if (v.phase === 'draw') return;
  if (v.phase === 'cut') { if (v.start === v.you) c.send({ t: 'cut', k: 60, lower: true }); return; }
  if (v.phase === 'swap') { if (!v.players[v.you].ready) c.send({ t: 'ready' }); return; }
  if (v.phase !== 'play') return;
  if (v.pending) return c.send({ t: 'pick', as: v.pending.values[0] });
  if (!v.myMove) return;
  const me = v.players[v.you];
  if (me.zone === 'blind') return c.send({ t: 'blind', i: 0 });
  const ids = Object.keys(v.legal);
  if (!ids.length) return c.send({ t: 'pickup' });
  c.send({ t: 'play', id: +ids[0], as: v.legal[ids[0]][0] });
}
const wait = (f, ms = 20000) => new Promise((res, rej) => { const t0 = Date.now(), src = f.toString(); (function loop() { if (f()) return res(); if (Date.now() - t0 > ms) return rej(new Error('timeout: ' + src)); setTimeout(loop, 5); })(); });
(async () => {
  await new Promise(r => server.listening ? r() : server.on('listening', r));
  const port = server.address().port;
  const a = client(port), b = client(port), x = client(port);
  await Promise.all([a.open, b.open, x.open]);
  a.send({ t: 'host', name: 'Manero' });
  await wait(() => a.lobby);
  const code = a.lobby.code; assert(/^[A-Z]{4}$/.test(code));
  x.send({ t: 'join', code: 'ZZZZ', name: 'X' }); await wait(() => x.errors.length === 1);
  b.send({ t: 'join', code: code.toLowerCase(), name: 'Manero' });
  await wait(() => a.lobby.players.length === 2);
  assert.notStrictEqual(a.lobby.players[0].name, a.lobby.players[1].name);
  // chat: komt bij iedereen aan, wordt opgeschoond, en spam wordt afgeremd
  // praten: zonder 'ptt aan' wordt spraak genegeerd; daarna komt hij bij de ander aan met de stoel ervoor
  a.ws.send(Buffer.from([1, 5, 6, 7]));
  await new Promise(r => setTimeout(r, 60)); assert.strictEqual(b.bin.length, 0, 'spraak zonder ptt');
  a.send({ t: 'ptt', on: true });
  await wait(() => b.msgs.some(m => m.t === 'ptt' && m.on && m.seat === 0));
  a.ws.send(Buffer.from([1, 5, 6, 7]));
  await wait(() => b.bin.length === 1);
  assert.deepStrictEqual([...b.bin[0]], [0, 1, 5, 6, 7]);
  assert.strictEqual(a.bin.length, 0, 'eigen stem komt niet terug');
  a.send({ t: 'ptt', on: false });
  await wait(() => b.msgs.some(m => m.t === 'ptt' && !m.on));
  a.send({ t: 'chat', text: '  Hoi\n<b>allemaal</b>  ' + 'x'.repeat(200), quick: false });
  await wait(() => b.msgs.some(m => m.t === 'chat'));
  const ci = b.msgs.find(m => m.t === 'chat').item;
  assert.strictEqual(ci.name, 'Manero'); assert(ci.text.length <= 80 && !ci.text.includes('\n'));
  for (let i = 0; i < 5; i++) a.send({ t: 'chat', text: 'spam ' + i });
  await wait(() => a.errors.some(e => e.startsWith('Rustig aan')));
  a.send({ t: 'start' }); await wait(() => a.errors.length === 2);            // te weinig spelers
  b.send({ t: 'addBot' }); b.send({ t: 'start' });                             // alleen de host mag dit
  a.send({ t: 'addBot' }); await wait(() => a.lobby.players.length === 3);
  // plekken: zelf wisselen en husselen door de host
  const before = a.lobby.players.map(p => p.id).join();
  b.send({ t: 'swapSeat', id: a.lobby.players[0].id });
  await wait(() => a.lobby.players[0].id === b.sess.pid);
  b.send({ t: 'shuffleSeats' }); await new Promise(r => setTimeout(r, 40)); // niet de host: niets
  assert.strictEqual(a.lobby.players[0].id, b.sess.pid);
  for (let i = 0; i < 6 && a.lobby.players.map(p => p.id).join() !== before; i++) { a.send({ t: 'shuffleSeats' }); await new Promise(r => setTimeout(r, 30)); }
  assert(a.lobby.players.some(p => p.bot));
  a.auto = b.auto = true;
  a.send({ t: 'start' });
  await wait(() => a.v && b.v);
  x.send({ t: 'join', code, name: 'Laat' }); await wait(() => x.errors.length === 2); // spel al begonnen
  // geheimhouding: niemand ziet handen of blinde kaarten van een ander
  a.v.players.forEach(p => assert(!('hand' in p))); a.v.players.forEach(p => p.blind.forEach(d => assert(typeof d === 'number')));
  await wait(() => a.msgs.some(m => m.t === 'state' && m.v.phase !== 'draw' && m.v.phase !== 'cut'));
  assert.strictEqual(a.msgs.find(m => m.t === 'state' && m.v.phase === 'swap').v.hand.length, 3); // na delen: 3 handkaarten
  const d0 = a.msgs.find(m => m.t === 'state').v; assert.strictEqual(d0.phase, 'draw'); assert(d0.draws.length >= 1);
  // verbinding kwijt en terugkomen
  await wait(() => a.v.phase === 'play' && a.v.log.length > 2);
  b.ws.close();
  const bi = () => a.v.players.findIndex(p => p.name === 'Manero 2');
  await wait(() => a.v.players[bi()].away);
  const b2 = client(port); await b2.open; b2.auto = true;
  b2.send({ t: 'rejoin', code, pid: b.sess.pid, token: b.sess.token });
  await wait(() => b2.v && !a.v.players[bi()].away);
  const bad = client(port); await bad.open; bad.send({ t: 'rejoin', code, pid: b.sess.pid, token: 'fout' }); await wait(() => bad.errors.length === 1);
  await wait(() => a.v.phase === 'over', 60000);
  assert(a.v.winner !== null && b2.v.phase === 'over');
  // na afloop is alles zichtbaar; tijdens het spel niet
  assert(a.v.players.every(p => p.blind.every(c => typeof c === 'object') && Array.isArray(p.cards)));
  const during = a.msgs.filter(m => m.t === 'state' && m.v.phase === 'play').pop().v;
  assert(during.players.every(p => p.cards === null && p.blind.every(d => typeof d === 'number')));
  b2.send({ t: 'again' }); await new Promise(r => setTimeout(r, 50)); assert(a.v.phase === 'over'); // niet de host
  a.send({ t: 'again' }); await wait(() => a.v.phase !== 'over');
  // tegen bots
  const s = client(port); await s.open; s.auto = true; s.send({ t: 'solo', name: 'Solo', bots: 4 });
  await wait(() => s.v && s.v.players.length === 5);
  await wait(() => s.v.phase === 'over', 60000);
  console.log('server ok: potje met host, joiner en bot uitgespeeld; winnaar ' + a.v.players[a.msgs.filter(m => m.t === 'state' && m.v.phase === 'over')[0].v.winner].name);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
