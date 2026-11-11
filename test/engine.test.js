const E=require('../engine.js');const assert=require('assert');
function specs(n){return Array.from({length:n},(_,i)=>({name:'P'+(i+1),bot:true}));}
function count(g){let n=g.deck.length+g.pile.length+g.burned+(g.pendingBlind?1:0);g.players.forEach(p=>n+=p.hand.length+p.open.length+p.blind.length);return n;}
for(let n=3;n<=8;n++){let stuck=0,turns=[];
  for(let s=1;s<=400;s++){const g=E.newGame(s*7919+n,specs(n),s%n);E.begin(g);let t=0;
    while(g.phase==='play'&&t<30000){E.botTurn(g);t++;if(count(g)!==165)throw new Error('kaarttelling '+count(g));}
    if(g.phase!=='over')stuck++;else turns.push(t);}
  turns.sort((a,b)=>a-b);console.log(n+' spelers: vastgelopen '+stuck+', mediaan beurten '+turns[turns.length>>1]);assert(stuck<=2);}
function mk(pile,o){const g=E.newGame(1,specs(3),0);E.begin(g);g.pile=pile.map((v,i)=>typeof v==='number'?{c:{id:900+i,v,k:'n',d:1},as:v}:{c:{id:900+i,v:0,k:'joker',d:1},as:v.as});Object.assign(g,o||{});return g;}
const H=(...vs)=>vs.map((v,i)=>({id:800+i,v,k:'n',d:1}));
let g=mk([7,6],{sevenBy:2});
assert(E.canValue(g,6)&&E.canValue(g,2)&&E.canValue(g,7)&&E.canValue(g,10)&&!E.canValue(g,5)&&!E.canValue(g,9)&&!E.canValue(g,8));
g=mk([7],{sevenBy:2});assert(E.canValue(g,3)&&!E.canValue(g,8)&&!E.canValue(g,14));
g=mk([5],{raise:true});assert(E.canValue(g,13)&&E.canValue(g,7)&&!E.canValue(g,6));
g=mk([11]);assert(!E.canValue(g,7)&&E.canValue(g,10)&&!E.wildValues(g).includes(10)&&!E.wildValues(g).includes(7)&&E.wildValues(g).includes(12));
g=mk([14]);assert(E.canValue(g,10)&&!E.canValue(g,13));
g=mk([{as:9},14]);assert(E.wildValues(g).includes(10));
g=mk([9,9,9]);g.players[0].hand=H(9,3,3);g.turn=0;E.playCard(g,0,800);assert(g.pile.length===0&&g.turn===0&&g.burned===4);
g=mk([14]);g.players[0].hand=H(10,10,10);g.turn=0;E.playCard(g,0,800);assert(g.pile.length===0&&g.turn===0);
E.playCard(g,0,g.players[0].hand.find(c=>c.v===10).id);assert(g.pile.length===1&&g.turn===1);
g=mk([7],{sevenBy:2});g.players[0].hand=H(8,14,9);g.turn=0;assert(E.takePile(g,0));assert(g.sevenBy===null&&g.turn===1&&g.pile.length===0);
g=mk([12]);g.players[0].hand=H(2,14,9);g.turn=0;E.playCard(g,0,800);assert(g.dir===-1&&g.turn===2);
g=mk([5]);g.players[0].hand=H(8,14,9);g.turn=0;E.playCard(g,0,800);assert(g.turn===2);
g=mk([5]);g.turn=0;g.players[0].hand=H(9);assert(!E.takePile(g,0));
// 5 spelers: twee 8'en slaan 2 over
g=E.newGame(3,specs(5),0);E.begin(g);g.pile=[{c:{id:900,v:8,k:'n',d:1},as:8}];g.players[2].hand=H(8,14,9);g.turn=2;E.playCard(g,2,800);assert(g.turn===0);
console.log('engine ok');
