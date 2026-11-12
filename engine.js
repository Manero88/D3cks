// 3Decks spelregels. Bron van waarheid: de skill 3decks-regels.
const E=(function(){
'use strict';
function lab(v){return v<=10?String(v):({11:'J',12:'Q',13:'K',14:'A'})[v];}
function word(v){return v<=10?'een '+v:({11:'een J',12:'een Q',13:'een K',14:'een aas'})[v];}
function rnd(g){g.rs=(g.rs+0x6D2B79F5)|0;let t=g.rs;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
function shuffle(g,a){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd(g)*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}}
function say(g,t,k){g.log.push({t:t,k:k||'',n:++g.n});if(g.log.length>60)g.log.shift();}
function fxp(g,o){g.fx.push(o);if(g.fx.length>40)g.fx.shift();}
function strength(c){return c.k!=='n'?100:c.v===10?90:c.v===2?80:c.v;}
function botSwap(p){const all=p.hand.concat(p.open).sort(function(a,b){return strength(b)-strength(a);});p.open=all.slice(0,3);p.hand=all.slice(3);}
function newGame(seed,specs,startIdx){
  specs=specs&&specs.length?specs:[{name:'Jij',bot:false},{name:'Noor',bot:true},{name:'Sem',bot:true}];
  const g={rs:seed|0,deck:[],pile:[],burned:0,dir:1,turn:startIdx||0,start:startIdx||0,phase:'swap',sevenBy:null,endgame:false,dqDone:false,winner:null,pendingBlind:null,log:[],n:0,fx:[],
    players:specs.map(function(p){return{name:p.name,bot:!!p.bot,hand:[],open:[],blind:[],drew:false,out:false};})};
  let id=0;
  for(let d=1;d<=3;d++){
    for(let v=2;v<=14;v++)for(let s=0;s<4;s++)g.deck.push({id:id++,v:v,k:'n',d:d});
    g.deck.push({id:id++,v:0,k:'joker',d:d},{id:id++,v:0,k:'joker',d:d},{id:id++,v:0,k:'score',d:d});
  }
  shuffle(g,g.deck);
  ['blind','open','hand'].forEach(function(z){g.players.forEach(function(p){for(let i=0;i<3;i++)p[z].push(g.deck.pop());});});
  g.players.forEach(function(p){if(p.bot)botSwap(p);});
  return g;
}
function swap(g,pi,handId,openId){
  if(g.phase!=='swap')return false;const p=g.players[pi];
  const hi=p.hand.findIndex(function(c){return c.id===handId;}),oi=p.open.findIndex(function(c){return c.id===openId;});
  if(hi<0||oi<0)return false;const t=p.hand[hi];p.hand[hi]=p.open[oi];p.open[oi]=t;return true;
}
function begin(g){
  if(g.phase!=='swap')return false;let c;
  for(;;){c=g.deck.pop();if(c.k==='n')break;g.deck.splice(Math.floor(rnd(g)*(g.deck.length+1)),0,c);}
  g.pile.push({c:c,as:c.v});fxp(g,{t:'open',c:c,as:c.v});g.phase='play';g.turn=g.start;
  say(g,'De openingskaart is '+word(c.v)+'. '+g.players[g.turn].name+' begint.');return true;
}
function topVal(g){return g.pile.length?g.pile[g.pile.length-1].as:null;}
function runLen(g){const n=g.pile.length;if(!n)return 0;const t=g.pile[n-1].as;let r=0;for(let i=n-1;i>=0&&g.pile[i].as===t;i--)r++;return r;}
function jokerInPile(g){return g.pile.some(function(e){return e.c.k!=='n';});}
function canValue(g,v){
  if(!g.pile.length)return true;
  const top=topVal(g);
  if(v===2||v===10)return true;
  if(g.sevenBy!==null){
    if(v===7)return true;
    if(v>=7)return false;
    if(top===7)return true;
    return v>=top;
  }
  if(top===2)return true;
  if(v===7)return top<=7;
  return v>=top;
}
function wildValues(g){const out=[];for(let v=2;v<=14;v++){if(v===10){if(jokerInPile(g))out.push(10);}else if(canValue(g,v))out.push(v);}return out;}
function zoneOf(p){return p.hand.length?'hand':p.open.length?'open':p.blind.length?'blind':null;}
function options(g,pi){
  const p=g.players[pi],z=zoneOf(p);if(z!=='hand'&&z!=='open')return[];
  const out=[];let wv=null;
  p[z].forEach(function(c){
    if(c.k==='n'){if(canValue(g,c.v))out.push({card:c,values:[c.v]});}
    else{if(!wv)wv=wildValues(g);out.push({card:c,values:wv});}
  });
  return out;
}
function cardWord(c,as){return c.k==='n'?word(c.v):(c.k==='joker'?'een joker':'een scorekaart')+' als '+lab(as);}
function advance(g,from,steps){
  const n=g.players.length;let i=from;
  for(let s=0;s<steps;s++){do{i=(i+g.dir+n)%n;}while(g.players[i].out);}
  g.turn=i;
  // De 7-regel eindigt als de 7-speler weer aan de beurt is. Daarna geldt gewoon weer gelijk of hoger.
  if(g.sevenBy===i)g.sevenBy=null;
}
function win(g,pi){g.phase='over';g.winner=pi;fxp(g,{t:'win',pi:pi});say(g,g.players[pi].name+' speelt de laatste kaart weg en wint.','win');}
function dq(g){
  if(!g.endgame||g.dqDone)return;g.dqDone=true;
  const outs=g.players.filter(function(p){return!p.out&&!p.drew;});if(!outs.length)return;
  outs.forEach(function(p){p.out=true;g.burned+=p.hand.length+p.open.length+p.blind.length;p.hand=[];p.open=[];p.blind=[];});
  say(g,outs.map(function(p){return p.name;}).join(' en ')+(outs.length>1?' hebben':' heeft')+' nooit van het deck gepakt en '+(outs.length>1?'liggen':'ligt')+' uit het spel.','end');
  const act=g.players.filter(function(p){return!p.out;});
  if(act.length===1){g.phase='over';g.winner=g.players.indexOf(act[0]);fxp(g,{t:'win',pi:g.winner});say(g,act[0].name+' blijft als enige over en wint.','win');}
  else if(!act.length){g.phase='over';g.winner=null;}
}
function refill(g,pi){
  const p=g.players[pi],got=[];
  while(p.hand.length<3&&g.deck.length){const c=g.deck.pop();p.hand.push(c);got.push(c);p.drew=true;}
  if(got.length)fxp(g,{t:'draw',pi:pi,cards:got});
  if(!g.deck.length&&!g.endgame){g.endgame=true;fxp(g,{t:'endgame'});say(g,'Het deck is leeg. De endgame begint.','end');}
}
function place(g,pi,card,as,pre,from){
  const p=g.players[pi],wasEmpty=g.pile.length===0;
  g.pile.push({c:card,as:as});fxp(g,{t:'play',pi:pi,c:card,as:as,from:from||'hand'});
  const run=runLen(g);
  let msg=(pre||p.name+' speelt '+cardWord(card,as))+'.';
  const burn=(as===10&&!wasEmpty)||run>=4;
  if(as===2){g.dir=-g.dir;g.sevenBy=null;msg+=' De richting draait om.';fxp(g,{t:'dir'});}
  let skips=0;
  if(burn){
    const n=g.pile.length;g.burned+=n;g.pile=[];g.sevenBy=null;fxp(g,{t:'burn'});
    msg+=(run>=4&&as!==10?' Vier gelijke kaarten op rij.':'')+' De stapel van '+n+' is verbrand.';
  }else{
    if(as===10)msg+=' Op een lege stapel telt de 10 als gewone 10.';
    if(as===7){g.sevenBy=pi;msg+=' De 7-regel gaat in.';fxp(g,{t:'seven'});}
    if(as===8&&g.sevenBy===null){skips=run;fxp(g,{t:'skip'});msg+=skips===1?' Eén speler wordt overgeslagen.':' '+skips+' spelers worden overgeslagen.';}
  }
  say(g,msg,burn?'burn':'');
  refill(g,pi);
  if(!p.hand.length&&!p.open.length&&!p.blind.length){win(g,pi);return;}
  if(burn){dq(g);if(g.phase==='over')return;if(p.out)advance(g,pi,1);else g.turn=pi;return;}
  advance(g,pi,1+skips);
}
function pickUp(g,pi,msg){
  const p=g.players[pi],n=g.pile.length;
  g.pile.forEach(function(e){p.hand.push(e.c);});
  g.pile=[];g.sevenBy=null;fxp(g,{t:'pick',pi:pi});
  say(g,msg||p.name+' kan niet spelen en pakt de stapel ('+n+(n===1?' kaart':' kaarten')+').','pick');
  dq(g);if(g.phase==='over')return;
  advance(g,pi,1);
}
function ready(g,pi){return g.phase==='play'&&g.turn===pi&&!g.pendingBlind;}
function playCard(g,pi,cardId,as){
  if(!ready(g,pi))return false;const p=g.players[pi],z=zoneOf(p);if(z!=='hand'&&z!=='open')return false;
  const i=p[z].findIndex(function(c){return c.id===cardId;});if(i<0)return false;const c=p[z][i];
  if(c.k==='n'){as=c.v;if(!canValue(g,as))return false;}else if(wildValues(g).indexOf(as)<0)return false;
  p[z].splice(i,1);place(g,pi,c,as,null,z);return true;
}
function takePile(g,pi){
  if(!ready(g,pi))return false;const z=zoneOf(g.players[pi]);
  if(z!=='hand'&&z!=='open')return false;if(options(g,pi).length)return false;
  pickUp(g,pi);return true;
}
function flipBlind(g,pi,i){
  if(!ready(g,pi))return false;const p=g.players[pi];if(zoneOf(p)!=='blind'||!p.blind[i])return false;
  const c=p.blind.splice(i,1)[0];
  if(c.k!=='n'){g.pendingBlind={pi:pi,c:c};return'wild';}
  if(canValue(g,c.v)){place(g,pi,c,c.v,p.name+' draait blind '+word(c.v)+' om en speelt hem','blind');return'ok';}
  const n=g.pile.length;p.hand.push(c);fxp(g,{t:'flipfail',pi:pi,c:c,as:c.v});
  pickUp(g,pi,p.name+' draait blind '+word(c.v)+' om. Die kan niet, dus de stapel van '+n+' gaat mee de hand in.');return'fail';
}
function resolveBlind(g,as){
  const pb=g.pendingBlind;if(!pb||wildValues(g).indexOf(as)<0)return false;g.pendingBlind=null;
  place(g,pb.pi,pb.c,as,g.players[pb.pi].name+' draait blind '+(pb.c.k==='joker'?'een joker':'een scorekaart')+' om en speelt hem als '+lab(as),'blind');return true;
}
function botWild(g){
  const vals=wildValues(g),top=topVal(g);
  if(runLen(g)===3&&vals.indexOf(top)>=0)return top;
  if(vals.indexOf(10)>=0)return 10;
  if(g.sevenBy!==null&&vals.indexOf(6)>=0)return 6;
  return vals.indexOf(14)>=0?14:vals[vals.length-1];
}
// --- Saboteren: heeft een tegenstander nog maar één kaart, dan probeert de bot hem tegen te houden. ---
// De bot gebruikt alleen wat aan tafel zichtbaar is: een open kaart is bekend, een blinde of handkaart niet.
function cardsLeft(p){return p.hand.length+p.open.length+p.blind.length;}
function seatAfter(g,pi,steps){const n=g.players.length;let i=pi;for(let s=0;s<steps;s++){do{i=(i+g.dir+n)%n;}while(g.players[i].out);}return i;}
function threatInfo(g,pi){
  if(!g.endgame)return null;
  if(!g.players.some(function(p,i){return i!==pi&&!p.out&&cardsLeft(p)===1;}))return null;
  const nx=seatAfter(g,pi,1),q=g.players[nx];
  if(nx===pi||cardsLeft(q)!==1)return{next:false};
  const k=zoneOf(q)==='open'?q.open[0]:null;
  return{next:true,known:k?(k.k==='n'?k.v:'wild'):null};
}
// Kan een bekende kaart x niet meer gespeeld worden nadat de bot `as` heeft gelegd?
function blocks(g,as,x){
  if(x===2||x===10)return false;
  if(as===7)return x>7;
  if(g.sevenBy!==null&&as<7)return x<as||x>7;
  return x<as&&!(x===7&&as<=7);
}
function threatScore(g,p,as,th){
  if(as===2)return 500;                                    // geeft de volgende een vrije zet
  if(as===8&&g.sevenBy===null&&th.next)return -200;        // de dreigende speler overslaan
  if(as===10&&g.pile.length)return cardsLeft(p)>1?-150:-1000; // verbranden en zelf opnieuw
  const str=as===7?11.5:as;
  if(!th.next)return 20-str;
  if(th.known==='wild')return 20-str;
  if(typeof th.known==='number')return blocks(g,as,th.known)?-100+as*.1:100+as;
  return -str*3;                                          // onbekend: zo hoog mogelijk
}
function botChoose(g,pi){
  const opts=options(g,pi);if(!opts.length)return null;
  const top=topVal(g),run=runLen(g),empty=!g.pile.length,th=threatInfo(g,pi);let best=null;
  if(th){
    opts.forEach(function(o){o.values.forEach(function(as){
      const sc=threatScore(g,g.players[pi],as,th)+(o.card.k!=='n'?5:0)+rnd(g)*4;
      if(!best||sc<best.score)best={card:o.card,as:as,score:sc};
    });});
    return best;
  }
  opts.forEach(function(o){
    const c=o.card;let as,score;
    if(c.k!=='n'){as=botWild(g);score=(run===3&&as===top)?-9:60;}
    else{as=c.v;
      if(as===10)score=empty?200:70;
      else if(as===2)score=50;
      else score=(run===3&&as===top)?-10:as;}
    if((g.endgame||empty)&&score>0&&score<50)score+=Math.floor(rnd(g)*6);
    if(!best||score<best.score)best={card:c,as:as,score:score};
  });
  return best;
}
function botTurn(g){
  if(g.phase!=='play')return;const pi=g.turn,p=g.players[pi];
  if(g.pendingBlind){resolveBlind(g,botWild(g));return;}
  if(zoneOf(p)==='blind'){if(flipBlind(g,pi,Math.floor(rnd(g)*p.blind.length))==='wild')resolveBlind(g,botWild(g));return;}
  const m=botChoose(g,pi);if(!m)takePile(g,pi);else playCard(g,pi,m.card.id,m.as);
}
return{cardsLeft:cardsLeft,lab:lab,word:word,newGame:newGame,swap:swap,begin:begin,topVal:topVal,runLen:runLen,canValue:canValue,wildValues:wildValues,zoneOf:zoneOf,options:options,playCard:playCard,takePile:takePile,flipBlind:flipBlind,resolveBlind:resolveBlind,botTurn:botTurn,jokerInPile:jokerInPile};
})();
if(typeof module!=='undefined')module.exports=E;
