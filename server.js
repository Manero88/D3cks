'use strict';
// 3Decks server: serveert de webapp en houdt per spelcode één spel bij.
// De server is de baas over het spel: hij deelt, controleert elke zet en
// stuurt elke speler alleen de kaarten die hij mag zien.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const E = require('./engine.js');

const PORT = process.env.PORT || 3000;
const BOT_DELAY = +process.env.BOT_DELAY || 1000;      // denktijd van een bot (ms)
const AWAY_DELAY = +process.env.AWAY_DELAY || 15000;   // zo lang wachten we op een speler zonder verbinding
const FX_WAIT = process.env.FX_WAIT === '0' ? 0 : 1;        // bots wachten tot animaties klaar zijn (0 = uit, voor tests)
const ROOM_TTL = +process.env.ROOM_TTL || 10 * 60000;  // lege kamer opruimen na 10 minuten
const MAX_PLAYERS = 8, MIN_PLAYERS = 3;
const BOT_NAMES = ['Noor', 'Sem', 'Lotte', 'Daan', 'Fenna', 'Bram', 'Jip'];
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (u === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (u === '/') u = '/index.html';
  const f = path.normalize(path.join(PUB, u));
  if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Niet gevonden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, maxPayload: 2048 });
const rooms = new Map();

/* ---------- kamers ---------- */
function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += abc[crypto.randomInt(abc.length)];
    if (!rooms.has(c)) return c;
  }
}
function cleanName(n, room) {
  n = String(n || '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Speler';
  let out = n, i = 2;
  while (room && room.players.some(p => p.name.toLowerCase() === out.toLowerCase())) out = n.slice(0, 12) + ' ' + i++;
  return out;
}
function makeRoom() {
  const room = { code: newCode(), players: [], hostId: null, g: null, timer: null, seq: 0, emptySince: null, lastWinner: 0, chat: [] };
  rooms.set(room.code, room);
  return room;
}
function addHuman(room, name, ws) {
  const p = { id: 'p' + (++room.seq), name: cleanName(name, room), bot: false, token: crypto.randomBytes(12).toString('hex'), ws, connected: true, left: false, ready: false };
  room.players.push(p);
  if (!room.hostId) room.hostId = p.id;
  ws.room = room; ws.pid = p.id;
  send(ws, { t: 'joined', code: room.code, pid: p.id, token: p.token });
  send(ws, { t: 'chatlog', items: room.chat });
  return p;
}
function addBot(room) {
  const name = BOT_NAMES.find(n => !room.players.some(p => p.name === n)) || cleanName('Bot', room);
  room.players.push({ id: 'p' + (++room.seq), name, bot: true, connected: true, left: false, ready: true });
}
function humans(room) { return room.players.filter(p => !p.bot && !p.left); }
function closeRoom(room) { clearTimeout(room.timer); rooms.delete(room.code); }

/* ---------- versturen ---------- */
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function fail(ws, msg, code) { send(ws, { t: 'error', msg, code: code || '' }); }
function lobbyMsg(room, p) {
  return { t: 'lobby', code: room.code, hostId: room.hostId, you: p.id, max: MAX_PLAYERS, min: MIN_PLAYERS,
    players: room.players.map(q => ({ id: q.id, name: q.name, bot: q.bot, connected: q.connected })) };
}
function broadcastLobby(room) { room.players.forEach(p => { if (!p.bot) send(p.ws, lobbyMsg(room, p)); }); }

// Wat speler `pi` mag zien. Handen en blinde kaarten van anderen gaan nooit de deur uit.
function view(room, pi) {
  const g = room.g, me = g.players[pi];
  const myMove = g.phase === 'play' && g.turn === pi && !g.pendingBlind;
  const reveal = g.phase === 'over';
  const legal = {};
  if (myMove) E.options(g, pi).forEach(o => { legal[o.card.id] = o.values; });
  return {
    code: room.code, phase: g.phase, you: pi, host: room.players.findIndex(p => p.id === room.hostId),
    deck: g.deck.length, deckD: g.deck.length ? g.deck[g.deck.length - 1].d : 0,
    pile: g.pile.slice(-5), pileN: g.pile.length, top: E.topVal(g), burned: g.burned,
    dir: g.dir, turn: g.turn, sevenBy: g.sevenBy, endgame: g.endgame, winner: g.winner,
    log: g.log.slice(-6),
    players: g.players.map((p, i) => {
      const rp = room.players[i];
      return { name: p.name, bot: rp.bot, away: !rp.bot && (!rp.connected || rp.left), out: p.out, ready: rp.ready,
        n: p.hand.length, backs: p.hand.slice(0, 7).map(c => c.d), open: p.open, zone: E.zoneOf(p),
        // Aan het eind van het potje gaat alles open: blinde kaarten en handen van iedereen.
        blind: reveal ? p.blind : p.blind.map(c => c.d), cards: reveal ? p.hand : null };
    }),
    hand: me.hand, legal, myMove,
    pending: g.pendingBlind && g.pendingBlind.pi === pi ? { c: g.pendingBlind.c, values: E.wildValues(g) } : null,
    wild: myMove ? E.wildValues(g) : []
  };
}
function fxFor(fx, pi) {
  return fx.map(ev => ev.t === 'draw' && ev.pi !== pi ? { t: 'draw', pi: ev.pi, cards: ev.cards.map(c => ({ id: -1, d: c.d })) } : ev);
}
function fxDuration(fx) {
  let t = 0;
  fx.forEach(ev => { t += ev.t === 'play' ? (ev.c.k !== 'n' ? 1350 : 400) + (ev.junk ? 1700 : 0) + (ev.as === 14 ? 750 : ev.as === 2 || ev.as === 7 || ev.as === 8 ? 300 : 0) : ev.t === 'open' ? 400 : ev.t === 'flipfail' ? 920 : ev.t === 'burn' ? 1750 : ev.t === 'endgame' ? 1400 : ev.t === 'pick' ? 1200 : ev.t === 'draw' ? 340 : 0; });
  return t;
}
function broadcastState(room) {
  const g = room.g, fx = g.fx; g.fx = [];
  // Soms verandert een gespeelde J even in een spuit. De server beslist, zodat iedereen hetzelfde ziet.
  fx.forEach(ev => { if (ev.t === 'play' && ev.as === 11 && ev.junk === undefined) ev.junk = Math.random() < 0.35; });
  room.players.forEach((p, i) => { if (!p.bot && p.connected) send(p.ws, { t: 'state', v: view(room, i), fx: fxFor(fx, i) }); });
  return fxDuration(fx);
}

/* ---------- spelverloop ---------- */
function startGame(room, startIdx) {
  const specs = room.players.map(p => ({ name: p.name, bot: p.bot }));
  room.g = E.newGame(crypto.randomInt(2147483647), specs, startIdx || 0);
  room.players.forEach(p => { p.ready = p.bot || p.left; });
  broadcastState(room);
  schedule(room, 0);
}
function maybeBegin(room) {
  const g = room.g;
  if (!g || g.phase !== 'swap') return false;
  if (!room.players.every(p => p.ready)) return false;
  E.begin(g);
  schedule(room, broadcastState(room));
  return true;
}
// Plant de volgende automatische stap: een bot, of een speler die weg is.
function schedule(room, fxDur) {
  clearTimeout(room.timer); room.timer = null;
  const g = room.g; if (!g) return;
  if (g.phase === 'over') { if (g.winner !== null) room.lastWinner = g.winner; return; }
  if (g.phase === 'swap') {
    if (room.players.some(p => !p.ready && !p.connected)) room.timer = setTimeout(() => {
      room.players.forEach(p => { if (!p.connected) p.ready = true; });
      if (!maybeBegin(room)) { broadcastState(room); schedule(room, 0); }
    }, AWAY_DELAY);
    return;
  }
  const cur = room.players[g.turn];
  const auto = cur.bot || cur.left;
  if (!auto && cur.connected) return;
  const turn = g.turn, n = g.n;
  const delay = auto ? Math.max(BOT_DELAY, FX_WAIT * ((fxDur || 0) + 250)) : AWAY_DELAY;
  room.timer = setTimeout(() => {
    if (room.g !== g || g.phase !== 'play' || g.turn !== turn || g.n !== n) return schedule(room, 0);
    if (!auto && cur.connected) return;
    E.botTurn(g);
    schedule(room, broadcastState(room));
  }, delay);
}
function seatOf(room, pid) { return room.players.findIndex(p => p.id === pid); }

/* ---------- praten (push-to-talk) ----------
   Spraak gaat in kleine stukjes via deze server naar de andere spelers in de kamer.
   Zo is er geen rechtstreekse verbinding tussen telefoons (en dus geen extra server) nodig.
   Niets wordt opgeslagen. */
function broadcastPtt(room, idx, on) {
  room.players.forEach((q, i) => { if (!q.bot && i !== idx) send(q.ws, { t: 'ptt', seat: idx, on }); });
}
function relayVoice(ws, buf) {
  const room = ws.room;
  if (!room || !ws.talking || buf.length < 2 || buf.length > 2000) return;
  const now = Date.now();
  if (!ws.vWin || now - ws.vWin > 1000) { ws.vWin = now; ws.vBytes = 0; }
  ws.vBytes += buf.length; if (ws.vBytes > 40000) return;          // max ~40 kB per seconde
  const idx = seatOf(room, ws.pid); if (idx < 0 || idx > 255) return;
  const out = Buffer.concat([Buffer.from([idx]), buf]);
  room.players.forEach(q => { if (!q.bot && q.ws && q.ws !== ws && q.ws.readyState === 1) q.ws.send(out, { binary: true }); });
}

/* ---------- berichten ---------- */
const handlers = {
  host(ws, m) {
    if (ws.room) return;
    const room = makeRoom();
    addHuman(room, m.name, ws);
    broadcastLobby(room);
  },
  solo(ws, m) {
    if (ws.room) return;
    const room = makeRoom();
    addHuman(room, m.name, ws);
    const n = Math.max(2, Math.min(MAX_PLAYERS - 1, m.bots | 0));
    for (let i = 0; i < n; i++) addBot(room);
    startGame(room, 0);
  },
  join(ws, m) {
    if (ws.room) return;
    const room = rooms.get(String(m.code || '').toUpperCase().trim());
    if (!room) return fail(ws, 'Er is geen spel met deze code.');
    if (room.g) return fail(ws, 'Dit spel is al begonnen.');
    if (room.players.length >= MAX_PLAYERS) return fail(ws, 'Dit spel zit vol.');
    addHuman(room, m.name, ws);
    room.emptySince = null;
    broadcastLobby(room);
  },
  rejoin(ws, m) {
    const room = rooms.get(String(m.code || ''));
    const p = room && room.players.find(q => q.id === m.pid && !q.bot && q.token === m.token && !q.left);
    if (!p) return fail(ws, 'Dit spel bestaat niet meer.', 'gone');
    if (p.ws && p.ws !== ws) { p.ws.room = null; try { p.ws.close(); } catch (e) {} }
    p.ws = ws; p.connected = true; ws.room = room; ws.pid = p.id; room.emptySince = null;
    send(ws, { t: 'joined', code: room.code, pid: p.id, token: p.token });
    send(ws, { t: 'chatlog', items: room.chat });
    if (!room.g) return broadcastLobby(room);
    broadcastState(room);
    schedule(room, 0);
  },
  addBot(ws) {
    const room = ws.room;
    if (!room || room.g || room.hostId !== ws.pid) return;
    if (room.players.length >= MAX_PLAYERS) return fail(ws, 'Het spel zit vol.');
    addBot(room); broadcastLobby(room);
  },
  // De host mag bots weghalen, en spelers die geen verbinding meer hebben.
  remove(ws, m) {
    const room = ws.room;
    if (!room || room.g || room.hostId !== ws.pid) return;
    const i = room.players.findIndex(p => p.id === m.id && (p.bot || !p.connected));
    if (i >= 0) { room.players.splice(i, 1); broadcastLobby(room); }
  },
  start(ws) {
    const room = ws.room;
    if (!room || room.g || room.hostId !== ws.pid) return;
    if (room.players.length < MIN_PLAYERS) return fail(ws, 'Je hebt minimaal 3 spelers nodig. Voeg een bot toe of wacht op meer spelers.');
    startGame(room, 0);
  },
  again(ws) {
    const room = ws.room;
    if (!room || !room.g || room.g.phase !== 'over') return;
    const host = room.players.find(p => p.id === room.hostId);
    if (room.hostId !== ws.pid && host && host.connected && !host.left) return;
    startGame(room, room.lastWinner || 0);
  },
  swap(ws, m) {
    const room = ws.room; if (!room || !room.g) return;
    const pi = seatOf(room, ws.pid);
    if (pi < 0 || room.players[pi].ready) return;
    if (E.swap(room.g, pi, m.hand | 0, m.open | 0)) broadcastState(room);
  },
  ready(ws) {
    const room = ws.room; if (!room || !room.g || room.g.phase !== 'swap') return;
    const rp = room.players[seatOf(room, ws.pid)]; if (!rp) return;
    rp.ready = true;
    if (!maybeBegin(room)) { broadcastState(room); schedule(room, 0); }
  },
  play(ws, m) { move(ws, (g, pi) => E.playCard(g, pi, m.id | 0, m.as | 0)); },
  pickup(ws) { move(ws, (g, pi) => E.takePile(g, pi)); },
  blind(ws, m) { move(ws, (g, pi) => E.flipBlind(g, pi, m.i | 0)); },
  pick(ws, m) { move(ws, (g, pi) => g.pendingBlind && g.pendingBlind.pi === pi && E.resolveBlind(g, m.as | 0)); },
  // Chat: korte berichten naar iedereen in de kamer. Niet bewaard buiten de kamer.
  chat(ws, m) {
    const room = ws.room; if (!room) return;
    const p = room.players.find(q => q.id === ws.pid); if (!p) return;
    const now = Date.now();
    ws.chatTimes = (ws.chatTimes || []).filter(t => now - t < 5000);
    if (ws.chatTimes.length >= 4) return fail(ws, 'Rustig aan, even wachten met chatten.');
    const text = String(m.text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!text) return;
    ws.chatTimes.push(now);
    const item = { id: ++room.seq, name: p.name, pid: p.id, seat: room.g ? room.players.indexOf(p) : -1, text, quick: !!m.quick, ts: now };
    room.chat.push(item); if (room.chat.length > 30) room.chat.shift();
    room.players.forEach(q => { if (!q.bot) send(q.ws, { t: 'chat', item }); });
  },
  ptt(ws, m) {
    const room = ws.room; if (!room) return;
    const idx = seatOf(room, ws.pid); if (idx < 0) return;
    ws.talking = !!m.on; clearTimeout(ws.talkT);
    if (ws.talking) ws.talkT = setTimeout(() => { ws.talking = false; if (ws.room) broadcastPtt(ws.room, idx, false); }, 16000);
    broadcastPtt(room, idx, ws.talking);
  },
  leave(ws) { drop(ws, true); send(ws, { t: 'left' }); }
};
function move(ws, fn) {
  const room = ws.room; if (!room || !room.g || room.g.phase !== 'play') return;
  const pi = seatOf(room, ws.pid);
  if (pi < 0 || !fn(room.g, pi)) return fail(ws, 'Die zet kan nu niet.');
  schedule(room, broadcastState(room));
}
// Speler valt weg (verbinding kwijt) of verlaat het spel bewust.
function drop(ws, leaving) {
  const room = ws.room; if (!room) return;
  if (ws.talking) { ws.talking = false; clearTimeout(ws.talkT); broadcastPtt(room, seatOf(room, ws.pid), false); }
  ws.room = null;
  const p = room.players.find(q => q.id === ws.pid && q.ws === ws);
  if (!p) return;
  p.connected = false; p.ws = null;
  if (leaving) {
    if (!room.g) room.players.splice(room.players.indexOf(p), 1);
    else { p.left = true; p.ready = true; }
  }
  const rest = humans(room);
  if (!rest.length) return closeRoom(room);
  if (room.hostId === p.id && (leaving || !room.g)) {
    const next = rest.find(q => q.connected) || (leaving ? rest[0] : null);
    if (next) room.hostId = next.id;
  }
  if (!rest.some(q => q.connected)) room.emptySince = Date.now();
  if (!room.g) return broadcastLobby(room);
  if (!maybeBegin(room)) { broadcastState(room); schedule(room, 0); }
}

wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return relayVoice(ws, raw);
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const h = m && typeof m.t === 'string' && Object.prototype.hasOwnProperty.call(handlers, m.t) && handlers[m.t];
    if (!h) return;
    try { h(ws, m); } catch (e) { console.error('fout bij', m.t, e); fail(ws, 'Er ging iets mis op de server.'); }
  });
  ws.on('close', () => drop(ws, false));
  ws.on('error', () => {});
});

// Houd verbindingen in leven en ruim verlaten kamers op.
const sweep = setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; try { ws.ping(); } catch (e) {} });
  const now = Date.now();
  rooms.forEach(room => { if (room.emptySince && now - room.emptySince > ROOM_TTL) closeRoom(room); });
}, 25000);
sweep.unref();

server.listen(PORT, () => console.log('3Decks draait op poort ' + PORT));
module.exports = { server, rooms };
