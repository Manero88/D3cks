(function(){
'use strict';
// Client van 3Decks. De server bepaalt het spel; deze code toont wat de server
// stuurt (v = jouw zicht op het spel), stuurt jouw zetten terug en speelt de animaties af.
var ws=null,online=false,sess=null,lob=null,v=null,screen='home';
var sel=null,picker=null,lastSrc=null,pickSrc=null,busy=false,confirmLeave=false,confirmT=null,errT=null,retry=null;
var motion=!!(window.matchMedia&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
var FX={2:'draai',7:'onder 7',8:'sla over',10:'brand'};
var WM='<span class="c-tag wm">D<b>3</b>CKS</span>';
function $(id){return document.getElementById(id);}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function lab(x){return x<=10?String(x):({11:'J',12:'Q',13:'K',14:'A'})[x];}
function word(x){return x<=10?String(x):({11:'J',12:'Q',13:'K',14:'Aas'})[x];}
function nm(c,as){return c.k==='n'?word(c.v):(c.k==='joker'?'joker':'scorekaart')+(as?' als '+lab(as):'');}
function store(k,val){try{if(val===null)localStorage.removeItem(k);else localStorage.setItem(k,val);}catch(e){}}
function load(k){try{return localStorage.getItem(k);}catch(e){return null;}}
// De sessie hoort bij één tabblad, zodat twee tabbladen in dezelfde browser twee spelers kunnen zijn.
function storeTab(val){try{if(val===null)sessionStorage.removeItem('d3cks-session');else sessionStorage.setItem('d3cks-session',val);}catch(e){}}
function loadTab(){try{return sessionStorage.getItem('d3cks-session');}catch(e){return null;}}

/* ---------- kaarten tekenen ---------- */
var IC={
  jest:'<svg viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"><path d="M23 33C20 18 10 13 6 25"/><path d="M41 33C44 18 54 13 58 25"/><path d="M32 31C29 17 35 8 45 9"/></g><circle cx="6" cy="29" r="4.2"/><circle cx="58" cy="29" r="4.2"/><circle cx="49" cy="9.5" r="4.2"/><rect x="15" y="30" width="34" height="7" rx="3.5"/><circle cx="32" cy="49" r="10.5" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="28" cy="46.5" r="1.8"/><circle cx="36" cy="46.5" r="1.8"/><path d="M27 52q5 4 10 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  10:'<svg viewBox="0 0 24 24" aria-hidden="true"><g class="fl"><path class="f1" d="M12 2c1 4 6 6 6 12 0 4.4-2.7 7.5-6 7.5S6 18.4 6 14c0-3 2-5 3-7 .5 2 1.5 3 2.5 3.5C11 7 11.5 4.5 12 2z"/><path class="f2" d="M12 12c1 2 3 3 3 5 0 2-1.3 3-3 3s-3-1-3-3c0-1.5 1.5-2.5 3-5z"/></g></svg>',
  2:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 10A7.5 7.5 0 0 1 18.5 7.5M18.8 3.5v4.3h-4.2M19 14A7.5 7.5 0 0 1 5.5 16.5M5.2 20.5v-4.3h4.2"/></svg>',
  7:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v16M6 13.5l6 6 6-6"/></svg>',
  14:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="gr" d="M1.5 21.5h21" stroke-width="2.6"/><g class="hs"><path d="M5 11.5V21h14v-9.5M3 12.5L12 4.5l9 8M10 21v-5h4v5"/></g></svg>',
  8:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l6 6-6 6M11 6l6 6-6 6M20 6v12"/></svg>'
};
function valInner(x){var r=lab(x);return '<span class="c-corner">'+r+'</span><span class="c-main">'+r+'</span>'+(IC[x]?'<span class="c-ic ic-'+x+'">'+IC[x]+'</span>':'');}
function jestInner(c){return '<span class="c-corner c-cj">'+IC.jest+'</span><span class="c-jm">'+IC.jest+'</span><span class="c-tag">'+(c.k==='joker'?'joker':'score')+'</span>';}
// Een wildcard die gespeeld is, draagt de nar nog onder de gekozen waarde, zodat hij kan 'veranderen'.
function face(c,o){o=o||{};var cls='card d'+c.d+' '+(o.cls||''),h;
  if(c.k==='n')h=valInner(c.v)+(IC[c.v]?'':WM);
  else if(o.as){cls+=' wild';h=valInner(o.as)+(IC[o.as]?'':'<span class="c-tag">nar</span>')+'<span class="c-mini">'+IC.jest+'</span><span class="c-jest">'+jestInner(c)+'</span><span class="c-shine"></span>';}
  else{cls+=' wild';h=jestInner(c);}
  return '<span class="'+cls+'"'+(o.attr||'')+'>'+h+'</span>';}
function back(d,cls,attr){return '<span class="card back d'+d+' '+(cls||'')+'"'+(attr||'')+'><span class="bwm">D<b>3</b>CKS</span></span>';}
function ghost(cls){return '<span class="card ghost '+(cls||'')+'"></span>';}
function thick(n,per,max){var l=Math.min(max,Math.ceil(n/per)),s=[];for(var i=1;i<=l;i++)s.push('0 '+(i*1.6).toFixed(1)+'px 0 var(--edge'+(i%2?'':'2')+')');s.push('0 '+(l*1.6+10).toFixed(1)+'px 16px var(--shadow)');return s.join(',');}
function jit(id,top){var r=top?((id*37)%9)-4:((id*37)%25)-12,x=((id*53)%15)-7,y=((id*29)%9)-4;return 'transform:translate('+x+'px,'+y+'px) rotate('+r+'deg)';}

/* ---------- verbinding ---------- */
function connect(){
  clearTimeout(retry);
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);ws.binaryType='arraybuffer';
  ws.onopen=function(){online=true;$('conn').hidden=true;if(sess)send({t:'rejoin',code:sess.code,pid:sess.pid,token:sess.token});};
  ws.onmessage=function(e){if(typeof e.data!=='string'){Talk.play(e.data);return;}var m;try{m=JSON.parse(e.data);}catch(x){return;}onMsg(m);};
  ws.onclose=function(){online=false;busy=false;if(screen!=='home')$('conn').hidden=false;retry=setTimeout(connect,1500);};
  ws.onerror=function(){};
}
function send(o){if(!online){showErr('Geen verbinding met de server. Probeer het zo opnieuw.');return false;}ws.send(JSON.stringify(o));return true;}
function showErr(msg){
  var el=$(screen==='home'?'homeErr':screen==='lobby'?'lobErr':'gameErr');
  el.textContent=msg;el.hidden=false;clearTimeout(errT);errT=setTimeout(function(){el.hidden=true;},5000);
}
function show(s){
  screen=s;$('chatBtn').hidden=s==='home';$('talkBtn').hidden=s==='home';if(s==='home')closeSheets();['home','lobby','game'].forEach(function(k){$(k).hidden=k!==s;});
  if(s==='home')$('conn').hidden=true;
}
function goHome(){Talk.stop();talkingSeats={};chatItems=[];unread=0;closeSheets();sess=null;lob=null;v=null;storeTab(null);setHash('');document.title='3Decks';show('home');}
function setHash(code){try{history.replaceState(null,'',code?'#'+code:location.pathname+location.search);}catch(e){}}
function onMsg(m){
  if(m.t==='joined'){sess={code:m.code,pid:m.pid,token:m.token};storeTab(JSON.stringify(sess));setHash(m.code);}
  else if(m.t==='lobby'){lob=m;v=null;show('lobby');renderLobby();}
  else if(m.t==='state'){
    var fresh=screen!=='game'||!v||(v.phase==='over'&&m.v.phase==='swap'),pre={pile:$('pileBox').innerHTML,burned:fresh||!v?0:v.burned},wasMine=!!(v&&v.myMove);
    var pv=fresh?null:v;v=m.v;busy=false;show('game');
    if(fresh){sel=null;picker=null;if(motion){$('app').classList.add('dealing');setTimeout(function(){$('app').classList.remove('dealing');},900);}}
    render();runFx(pre,m.fx||[]);announce(pv,v,sfx(m.fx||[],wasMine));
  }
  else if(m.t==='error'){busy=false;if(m.code==='gone'){var was=screen;goHome();if(was==='home')return;}showErr(m.msg);}
  else if(m.t==='left')goHome();
  else if(m.t==='ptt'){if(m.on)talkingSeats[m.seat]=1;else delete talkingSeats[m.seat];applyTalking();}
  else if(m.t==='chatlog'){chatItems=(m.items||[]).slice(-50);renderChat();}
  else if(m.t==='chat'){
    chatItems.push(m.item);if(chatItems.length>50)chatItems.shift();
    var mine=sess&&m.item.pid===sess.pid;
    if(!mine){Snd.play('chat');if($('chatSheet').hidden){unread++;}}
    chatBubble(m.item);renderChat();
  }
}

/* ---------- lobby ---------- */
function renderLobby(){
  var host=lob.hostId===lob.you,n=lob.players.length,hostName='de host';
  $('lobCode').textContent=lob.code;
  $('lobCount').textContent='Spelers ('+n+' van '+lob.max+')';
  var h='';
  lob.players.forEach(function(p){
    if(p.id===lob.hostId)hostName=p.name;
    var tags=[];if(p.id===lob.you)tags.push('jij');if(p.id===lob.hostId)tags.push('host');if(p.bot)tags.push('bot');if(!p.connected)tags.push('verbinding kwijt');
    h+='<li data-seat="'+lob.players.indexOf(p)+'"'+(p.connected?'':' class="off"')+'><span class="grow">'+esc(p.name)+'</span><span class="tag">'+tags.join(' · ')+'</span>'+
      (host&&p.id!==lob.you&&(p.bot||!p.connected)?'<button type="button" class="btn small" data-act="remove" data-id="'+p.id+'" aria-label="'+esc(p.name)+' weghalen">Weghalen</button>':'')+'</li>';
  });
  $('plist').innerHTML=h;
  var c='';
  if(host){
    c+='<div class="actions"><button type="button" class="btn" data-act="addBot"'+(n>=lob.max?' disabled':'')+'>Bot toevoegen</button>'+
      '<button type="button" class="btn main" data-act="start"'+(n<lob.min?' disabled':'')+'>Start het spel</button></div>';
    c+='<p class="sub">'+(n<lob.min?'Je hebt minimaal '+lob.min+' spelers nodig. Deel de code of voeg bots toe.':'Iedereen binnen? Dan kun je starten. Meedoen kan daarna niet meer.')+'</p>';
  }else c='<p class="waiting">Wachten tot '+esc(hostName)+' het spel start<i>.</i><i>.</i><i>.</i></p><p class="sub">Lees ondertussen de regels en tips door.</p>';
  $('lobCtl').innerHTML=c;
  applyTalking();
}

/* ---------- spelscherm ---------- */
function req(){
  if(!v.pileN)return'Vrije zet: elke kaart mag.';
  var t=v.top;
  if(v.sevenBy!==null)return t===7?'7-regel: speel 6 of lager.':t===6?'7-regel: speel een 6.':'7-regel: speel '+t+' tot en met 6.';
  if(t===2)return'Vrije zet: elke kaart mag.';
  return'Speel '+lab(t)+' of hoger.';
}
function nextSeat(){var n=v.players.length,i=v.turn;for(var k=0;k<n;k++){i=(i+v.dir+n)%n;if(!v.players[i].out)return i;}return v.turn;}
function slotsHtml(p,mine,st){
  var h='<div class="slots">',n=Math.max(p.blind.length,p.open.length);
  if(!n)return h+ghost()+'</div>';
  for(var i=0;i<n;i++){
    var o=p.open[i],b=p.blind[i],inner='';
    if(b&&typeof b==='object'){inner+=(o?face(o,{cls:'under'}):'')+face(b,{cls:'revealed',attr:' style="--rd:'+(i*.15+.2)+'s"'});h+='<div class="slot">'+inner+'</div>';continue;}
    if(b){
      if(mine&&!o&&st.blindTurn)inner+='<button type="button" class="cardbtn legal" data-act="blind" data-i="'+i+'" aria-label="Blinde kaart spelen">'+back(b)+'</button>';
      else inner+=back(b,o?'under':'');
    }
    if(o){
      if(mine){
        var cls='',dis=true;
        if(v.phase==='swap'){dis=sel===null||st.ready;cls=sel!==null&&!st.ready?'target':'';}
        else if(v.phase==='play'){var ok=st.openTurn&&v.legal[o.id];cls=st.openTurn?(ok?'legal':'no'):'';dis=false;}
        inner+='<button type="button" class="cardbtn '+cls+'" data-act="open" data-id="'+o.id+'"'+(dis?' disabled':'')+' aria-label="Open kaart '+nm(o)+'">'+face(o)+'</button>';
      }else inner+=face(o);
    }
    h+='<div class="slot">'+inner+'</div>';
  }
  return h+'</div>';
}
function render(){
  var you=v.you,me=v.players[you],n=v.players.length,zone=me.zone,myTurn=v.phase==='play'&&v.turn===you;
  if(!myTurn)picker=null;
  if(v.pending)picker={blind:true,card:v.pending.c,values:v.pending.values};
  var st={ready:me.ready,openTurn:v.myMove&&zone==='open',blindTurn:v.myMove&&zone==='blind'};
  var legalN=Object.keys(v.legal).length;
  document.title=(myTurn?'● Jouw beurt · ':'')+'3Decks';
  $('leaveBtn').textContent=confirmLeave?'Zeker weten?':'Verlaten';

  var ch='<span class="chip">Code <b>'+esc(v.code)+'</b></span><span class="chip">Deck <b>'+v.deck+'</b></span><span class="chip">Verbrand <b>'+v.burned+'</b></span>';
  if(v.phase==='play')ch+='<span class="chip">Richting <b>'+(v.dir===1?'↻':'↺')+'</b> daarna <b>'+esc(nextSeat()===you?'jij':v.players[nextSeat()].name)+'</b></span>';
  if(v.sevenBy!==null)ch+='<span class="chip hot"><b>7-regel actief</b></span>';
  if(v.endgame)ch+='<span class="chip hot"><b>Endgame</b></span>';
  $('chips').innerHTML=ch;

  var oh='';
  for(var k=1;k<n;k++){
    var i=(you+k)%n,p=v.players[i],turn=v.phase==='play'&&v.turn===i,fan='',m=(p.backs.length-1)/2;
    var rh='';if(p.cards&&p.cards.length){p.cards.slice().sort(function(a,b){return(a.k==='n'?a.v:99)-(b.k==='n'?b.v:99);}).forEach(function(c,j){rh+=face(c,{cls:'revealed',attr:' style="--rd:'+(.5+j*.04).toFixed(2)+'s"'});});}
    else p.backs.forEach(function(d,j){fan+=back(d,'',' style="--r:'+((j-m)*8).toFixed(1)+'deg"');});
    var where=p.out?'Ligt uit het spel':v.phase==='swap'?(p.ready?'Klaar':'Legt kaarten goed'):v.endgame&&p.zone==='open'?'Speelt open kaarten':v.endgame&&p.zone==='blind'?'Speelt blinde kaarten':'';
    oh+='<div class="seat'+(turn?' turn':'')+(p.out?' out':'')+'" data-seat="'+i+'"><div class="seat-h"><span class="nm">'+esc(p.name)+'</span>'+(p.bot?'<span class="tag">bot</span>':'')+(p.away?'<span class="tag">weg</span>':'')+
      (turn?'<span class="pill">aan de beurt</span>':'')+(lastOne(p)?'<span class="pill last">laatste kaart</span>':'')+(v.winner===i?'<span class="pill">winnaar</span>':'')+'</div>'+
      '<div class="seat-row sm"><div class="tbl">'+slotsHtml(p,false,st)+'</div><div class="handinfo">'+(rh?'':'<span class="fan">'+fan+'</span>')+'<span><b>'+p.n+'</b> in hand</span></div></div>'+(rh?'<div class="rhand sm" aria-label="Hand van '+esc(p.name)+'">'+rh+'</div>':'')+
      (where?'<div class="tag">'+where+'</div>':'')+'</div>';
  }
  $('opps').innerHTML=oh;

  var ph='',pn=v.pileN,sh=v.pile;
  if(!pn)ph=ghost('lg');
  else sh.forEach(function(e,idx){var top=idx===sh.length-1;
    ph+=face(e.c,{as:e.as,cls:'lg'+(top?' top':''),attr:' data-cid="'+e.c.id+'" style="'+jit(e.c.id,top)+(idx===0?';box-shadow:'+thick(pn,3,7):'')+'"'});});
  $('pileBox').innerHTML=ph;
  $('pileCap').innerHTML='Stapel <b>'+pn+'</b>';
  var sl='';for(var bi=0;bi<v.burned;bi++)sl+='<span class="slab s'+(bi%3+1)+'" style="--i:'+bi+';--x:'+(((bi*37)%9)-4)+'px;--r:'+(((bi*53)%7)-3)+'deg"></span>';
  $('binBox').innerHTML=sl;$('binCap').innerHTML='Verbrand <b>'+v.burned+'</b>';
  $('deckBox').innerHTML=v.deck?back(v.deckD,'',' style="box-shadow:'+thick(v.deck,10,14)+'"'):ghost();
  $('deckCap').innerHTML='Deck <b>'+v.deck+'</b>';

  var now,sub='',acts='';
  if(v.phase==='swap'){
    if(me.ready){
      var wait=v.players.filter(function(p){return!p.ready;}).map(function(p){return esc(p.name);});
      now='Je bent klaar.';sub=wait.length?'Wachten op '+wait.join(', ')+'.':'';
    }else{
      now='Leg je kaarten goed voordat het begint.';
      sub=sel===null?'Tik een handkaart aan en daarna een open kaart om ze te ruilen. Je open kaarten speel je pas in de endgame.':'Tik nu de open kaart aan waarmee je wilt ruilen.';
      acts='<button type="button" class="btn main" data-act="ready">Ik ben klaar</button>';
    }
  }else if(v.phase==='over'){
    now=v.winner===you?'Jij wint dit potje.':v.winner===null?'Niemand wint dit potje.':esc(v.players[v.winner].name)+' wint dit potje.';
    if(v.host===you||v.host<0||v.players[v.host].away){sub='De winnaar begint het volgende potje.';acts='<button type="button" class="btn main" data-act="again">Nog een potje</button>';}
    else sub='Wachten tot '+esc(v.players[v.host].name)+' een nieuw potje start.';
  }else if(myTurn){
    if(picker){now='Kies de waarde van je '+(picker.card.k==='joker'?'joker':'scorekaart')+'.';sub=req();}
    else if(zone==='blind'){now='Jouw beurt. Speel een blinde kaart.';sub=req();}
    else if(v.myMove&&!legalN){now='Je kunt niet spelen.';sub=req();acts='<button type="button" class="btn main" data-act="pickup">Strekken ('+pn+')</button>';}
    else{now='Jouw beurt.';sub=req()+(zone==='open'?' Je speelt nu je open kaarten.':'');}
  }else{now=esc(v.players[v.turn].name)+' is aan de beurt.';sub=req();}
  var lg='';
  v.log.slice(-5).reverse().forEach(function(l){lg+='<li class="'+l.k+'">'+esc(l.t)+'</li>';});
  $('info').innerHTML='<p class="now">'+now+'</p>'+(sub?'<p class="sub">'+sub+'</p>':'')+(acts?'<div class="actions">'+acts+'</div>':'')+'<ol class="log" aria-live="polite">'+lg+'</ol>';

  var groups={},keys=[];
  v.hand.forEach(function(c){var key=c.k==='n'?c.v:c.k;if(!groups[key]){groups[key]=[];keys.push(key);}groups[key].push(c);});
  keys.sort(function(a,b){var x=typeof a==='number'?a:(a==='joker'?98:99),y=typeof b==='number'?b:(b==='joker'?98:99);return x-y;});
  var hh='',fanned=keys.length<=5,mid=(keys.length-1)/2;
  keys.forEach(function(key,idx){
    var cs=groups[key],c=cs[0],cls='',dis=true;
    if(v.phase==='swap'){dis=me.ready;if(cs.some(function(x){return x.id===sel;}))cls='sel';}
    else if(v.phase==='play'){var mv=v.myMove&&zone==='hand',ok=mv&&v.legal[c.id];cls=mv?(ok?'legal':'no'):'';dis=false;}
    var stl=fanned?' style="--r:'+((idx-mid)*4).toFixed(1)+'deg;--y:'+(Math.abs(idx-mid)*Math.abs(idx-mid)*1.5).toFixed(1)+'px"':'';
    hh+='<button type="button" class="cardbtn '+cls+'" data-act="hand" data-id="'+c.id+'" data-ids=",'+cs.map(function(x){return x.id;}).join(',')+',"'+stl+(dis?' disabled':'')+' aria-label="'+nm(c)+(cs.length>1?', '+cs.length+' stuks':'')+'">'+(cs.length>1?'<span class="badge">×'+cs.length+'</span>':'')+face(c)+'</button>';
  });
  if(!v.hand.length)hh='<span class="sub">'+(me.out?'Je ligt uit het spel.':'Je hand is leeg.')+'</span>';
  var pk='';
  if(picker){
    pk='<div class="picker"><p>Welke waarde krijgt je '+(picker.card.k==='joker'?'joker':'scorekaart')+'?</p><div class="vals">';
    picker.values.forEach(function(x){pk+='<button type="button" class="val" data-act="pick" data-v="'+x+'">'+lab(x)+(FX[x]?'<small>'+FX[x]+'</small>':'')+'</button>';});
    pk+='</div>'+(picker.blind?'':'<div><button type="button" class="btn" data-act="cancel">Toch een andere kaart</button></div>')+'</div>';
  }
  $('me').className='seat me'+(myTurn?' turn':'')+(me.out?' out':'');
  $('me').innerHTML='<div class="seat-h"><span class="nm">'+esc(me.name)+'</span><span class="tag">jij</span>'+(myTurn?'<span class="pill">aan de beurt</span>':'')+(lastOne(me)?'<span class="pill last">laatste kaart</span>':'')+(v.winner===you?'<span class="pill">winnaar</span>':'')+'</div>'+pk+
    '<div class="me-row"><div class="zone"><span class="zl">Op tafel: open op blind</span>'+slotsHtml(me,true,st)+'</div>'+
    '<div class="zone" style="flex:1 1 220px"><span class="zl">Hand · '+v.hand.length+'</span><div class="hand">'+hh+'</div></div></div>';
  applyTalking();
}

/* ---------- grote meldingen ---------- */
function cardsLeft(p,vv){return(vv||v).deck>0?99:p.n+p.open.length+p.blind.length;}
function lastOne(p){return v.phase==='play'&&!p.out&&cardsLeft(p)===1;}
var bannerQ=[],bannerBusy=false;
// Vergelijkt het vorige en nieuwe spelbeeld en zet meldingen klaar voor na de animaties.
function announce(pv,nv,delay){
  if(!pv||nv.phase!=='play'&&nv.phase!=='over')return;
  var q=[];
  if(!pv.endgame&&nv.endgame)q.push({big:'Endgame!',small:'Het deck is leeg. Speel je hand leeg, dan je tafelkaarten.',hot:true});
  nv.players.forEach(function(p,i){
    var o=pv.players[i];if(!o||p.out||nv.phase!=='play')return;
    var me=i===nv.you,wie=me?'Jij':p.name;
    if(nv.endgame&&o.zone==='hand'&&p.zone==='open')q.push({big:me?'Jouw endgame!':wie+' is bij de endgame',small:(me?'Je speelt':wie+' speelt')+' nu de open kaarten op tafel.'});
    else if(nv.endgame&&o.zone!=='blind'&&p.zone==='blind')q.push({big:me?'Blind spelen!':wie+' speelt blind',small:(me?'Je speelt':wie+' speelt')+' nu de blinde kaarten.'});
    if(cardsLeft(p,nv)===1&&cardsLeft(o,pv)!==1)q.push({big:'Laatste kaart!',small:(me?'Jij hebt':wie+' heeft')+' nog maar één kaart.'+(me?'':' Hou hem tegen!'),hot:true});
  });
  if(!q.length)return;
  setTimeout(function(){bannerQ=bannerQ.concat(q);nextBanner();},Math.max(0,delay||0));
}
function nextBanner(){
  if(bannerBusy||!bannerQ.length)return;bannerBusy=true;
  var b=bannerQ.shift(),d=document.createElement('div');d.className='banner'+(b.hot?' hot':'');d.setAttribute('role','status');
  d.innerHTML='<strong>'+esc(b.big)+'</strong><span>'+esc(b.small)+'</span>';$('fx').appendChild(d);
  Snd.play(b.hot?'alarm':'fanfare');
  var done=function(){d.remove();bannerBusy=false;nextBanner();};
  if(!d.animate||!motion){setTimeout(done,2000);return;}
  var a=d.animate([{transform:'translate(-50%,-50%) scale(.4) rotate(-6deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.08) rotate(-2deg)',opacity:1,offset:.12},{transform:'translate(-50%,-50%) scale(1) rotate(-2deg)',opacity:1,offset:.22},{transform:'translate(-50%,-50%) scale(1) rotate(-2deg)',opacity:1,offset:.82},{transform:'translate(-50%,-70%) scale(.92) rotate(-2deg)',opacity:0}],{duration:1900,easing:'ease-out',fill:'both'});
  a.onfinish=done;
}

/* ---------- animaties ---------- */
function rectOf(el){return el?el.getBoundingClientRect():null;}
function seatEl(pi){return pi===v.you?$('me'):$('opps').querySelector('[data-seat="'+pi+'"]');}
function seatSrc(pi,from){
  if(pi===v.you)return lastSrc||rectOf($('me'));
  var seat=seatEl(pi);if(!seat)return rectOf($('opps'));
  return rectOf(seat.querySelector(from==='hand'?'.fan':'.slots'))||rectOf(seat);
}
function fly(c,as,from,to,o){
  var w=document.createElement('div');w.className='fly';
  w.style.cssText='left:'+to.left+'px;top:'+to.top+'px;width:'+to.width+'px;height:'+to.height+'px;--cw:'+(o.cw||to.width)+'px';
  w.innerHTML='<div class="flipper"><div class="side">'+(o.backOnly?back(c.d):face(c,{as:as}))+'</div>'+(o.flip?'<div class="side bk">'+back(c.d)+'</div>':'')+'</div>';
  $('fx').appendChild(w);
  var dx=from.left+from.width/2-(to.left+to.width/2),dy=from.top+from.height/2-(to.top+to.height/2),s=o.s||.6,done=false;
  var end=function(){if(done)return;done=true;if(w.parentNode)w.parentNode.removeChild(w);if(o.done)o.done();};
  if(!w.animate){end();return;}
  var a=w.animate([{transform:'translate('+dx+'px,'+dy+'px) scale('+s+') rotate('+(o.rot||-14)+'deg)'},{transform:'translate('+(dx*.42)+'px,'+(dy*.42-52)+'px) scale(1.25) rotate(5deg)',offset:.58},{transform:'translate(0,0) scale(1) rotate(0deg)'}],{duration:o.dur,delay:o.delay||0,easing:'cubic-bezier(.35,.6,.3,1)',fill:'both'});
  if(o.flip)w.firstChild.animate([{transform:'rotateY(180deg)'},{transform:'rotateY(0deg)'}],{duration:o.dur*.75,delay:o.delay||0,easing:'ease-in-out',fill:'both'});
  a.onfinish=end;a.oncancel=end;
}
function toast(txt,r,hot){
  var d=document.createElement('div');d.className='toast'+(hot?' hot':'');d.textContent=txt;
  d.style.left=(r.left+r.width/2)+'px';d.style.top=(r.top+r.height*.35)+'px';$('fx').appendChild(d);
  var b='translate(-50%,-50%) ';
  var a=d.animate([{transform:b+'scale(.3) rotate(-14deg)',opacity:0},{transform:b+'scale(1.15) rotate(-5deg)',opacity:1,offset:.22},{transform:b+'scale(1) rotate(-4deg)',opacity:1,offset:.72},{transform:b+'translateY(-34px) scale(.96) rotate(-4deg)',opacity:0}],{duration:1050,easing:'ease-out',fill:'both'});
  a.onfinish=function(){d.remove();};
}
// De J als 'junkie': het teken wordt even een spuit die leegspuit, en daarna weer een J.
var SYR='<svg viewBox="0 0 64 24" aria-hidden="true"><g class="pl"><rect x="1" y="3" width="3.5" height="18" rx="1.5" fill="currentColor"/><rect x="4" y="10.5" width="14" height="3" fill="currentColor"/></g><rect class="liq" x="18" y="7.5" width="27" height="9"/><rect x="16" y="5.5" width="31" height="13" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M22 5.5v4M28 5.5v4M34 5.5v4M40 5.5v4" stroke="currentColor" stroke-width="1.4"/><rect x="47" y="9.5" width="4" height="5" fill="currentColor"/><path d="M51 12h11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle class="tip" cx="62" cy="12" r=".5" fill="none"/></svg>';
function junkie(card){
  if(!card||!card.animate)return;
  card.insertAdjacentHTML('beforeend','<span class="c-syr">'+SYR+'</span>');
  card.classList.add('junk');
  var tip=card.querySelector('.c-syr .tip');
  for(var i=0;i<9;i++){(function(i){setTimeout(function(){
    var r=tip.getBoundingClientRect(),d=document.createElement('div');d.className='drop';
    d.style.left=r.left+'px';d.style.top=r.top+'px';$('fx').appendChild(d);
    var dx=18+Math.random()*34,up=-14-Math.random()*22;
    var a=d.animate([{transform:'translate(-50%,-50%) scale(.6)',opacity:1},{transform:'translate('+(dx*.55)+'px,'+up+'px) scale(1)',opacity:1,offset:.4},{transform:'translate('+dx+'px,'+(30+Math.random()*30)+'px) scale(.7)',opacity:0}],{duration:620+Math.random()*250,easing:'cubic-bezier(.3,.6,.6,1)',fill:'both'});
    a.onfinish=function(){d.remove();};
  },520+i*55);})(i);}
  setTimeout(function(){card.classList.remove('junk');var s=card.querySelector('.c-syr');if(s)s.remove();},1800);
}
// Een rekbare arm schiet naar de stapel, slaat met de hand op tafel en trekt de kaarten terug.
// Bij het terugtrekken krassen de vingers over het vilt; die krassen vervagen daarna.
function stretchArm(S,P,ghost){
  var felt=document.querySelector('.felt'),fr=felt?felt.getBoundingClientRect():{left:0,top:0,right:9999,bottom:9999,width:9999,height:9999};
  var cid='fc'+Date.now();
  var sc=document.createElement('div');sc.className='scratchfx';
  sc.innerHTML='<svg width="100%" height="100%"><defs><clipPath id="'+cid+'"><polygon points="'+(fr.left+fr.width*.065)+','+(fr.top+8)+' '+(fr.right-fr.width*.065)+','+(fr.top+8)+' '+(fr.right-6)+','+(fr.bottom-14)+' '+(fr.left+6)+','+(fr.bottom-14)+'"/></clipPath></defs><g clip-path="url(#'+cid+')"><g class="g1"></g><g class="g2" transform="translate(-.8 -.8)"></g></g></svg>';
  var box=document.createElement('div');box.className='armfx';
  box.innerHTML='<svg width="100%" height="100%"><ellipse class="hshadow" rx="17" ry="6"/><path class="a1"/><path class="a2"/><g class="hand"><g class="fing"><path d="M6 -9 L22 -15 M10 -3 L27 -5 M10 3 L27 5 M6 9 L22 15"/></g><path class="thumb" d="M0 -11 L6 -22"/><circle r="12"/></g></svg>';
  $('fx').appendChild(sc);$('fx').appendChild(box);
  var a1=box.querySelector('.a1'),a2=box.querySelector('.a2'),hand=box.querySelector('.hand'),fing=box.querySelector('.fing'),shadow=box.querySelector('.hshadow');
  var g1=sc.querySelector('.g1'),g2=sc.querySelector('.g2'),OFF=[-10,-3.5,3.5,10],trails=OFF.map(function(){return[];}),p1=[],p2=[];
  OFF.forEach(function(){var x=document.createElementNS('http://www.w3.org/2000/svg','path'),y=document.createElementNS('http://www.w3.org/2000/svg','path');g1.appendChild(x);g2.appendChild(y);p1.push(x);p2.push(y);});
  var dx=P.x-S.x,dy=P.y-S.y,len=Math.sqrt(dx*dx+dy*dy)||1,px=-dy/len,py=dx/len,D=1150,t0=null,slammed=false;
  function ease(x){return 1-Math.pow(1-x,3);}function easeIn(x){return x*x*x;}
  function frame(now){
    if(t0===null)t0=now;var u=Math.min(1,(now-t0)/D);
    var ext,lift=0,scale=1;
    if(u<.32){var k=u/.32;ext=ease(k);lift=-26*Math.sin(Math.PI*Math.min(1,k*1.15))-8*k;scale=1+.35*k;}       // reiken, hand hoog boven tafel
    else if(u<.42){var k2=(u-.32)/.1;ext=1;lift=-8*(1-k2);scale=1.35-.5*Math.sin(Math.PI*k2*.5)-.0*k2;if(k2>.6)scale=.85+.15*(k2-.6)/.4;}  // neerslaan
    else if(u<.48){ext=1;}                                                                                          // vastpakken
    else{ext=1-easeIn((u-.48)/.52);}                                                                                // terugtrekken over het vilt
    if(!slammed&&u>=.4){slammed=true;impact(P);if(felt&&felt.animate&&motion)felt.animate([{translate:'0 0'},{translate:'0 3px'},{translate:'0 -1px'},{translate:'0 0'}],{duration:220});}
    var ex=S.x+dx*ext,ey=S.y+dy*ext,amp=len*.16*Math.sin(u*Math.PI*3)*(1-u)*ext*(u<.42?1:.3);
    var cx=(S.x+ex)/2+px*amp,cy=(S.y+ey)/2+py*amp+lift*.5,hy=ey+lift,d='M'+S.x+' '+S.y+' Q'+cx+' '+cy+' '+ex+' '+hy;
    a1.setAttribute('d',d);a2.setAttribute('d',d);
    var ang=Math.atan2(hy-cy,ex-cx)*180/Math.PI;
    hand.setAttribute('transform','translate('+ex+' '+hy+') rotate('+ang+') scale('+scale+')');
    fing.setAttribute('transform',u>.4?'scale(.5 .85)':'');
    shadow.setAttribute('cx',ex);shadow.setAttribute('cy',ey+6);shadow.setAttribute('opacity',String(.12+.25*(1+lift/34)));
    if(u>.48){
      trails.forEach(function(tr,i){tr.push((ex+px*OFF[i]+(Math.random()-.5)*1.4).toFixed(1)+' '+(ey+py*OFF[i]+(Math.random()-.5)*1.4).toFixed(1));
        var dd='M'+tr.join(' L');p1[i].setAttribute('d',dd);p2[i].setAttribute('d',dd);});
      if(ghost){var k3=(u-.48)/.52;ghost.style.transform='translate('+(ex-P.x)+'px,'+(ey-P.y)+'px) scale('+(1-.55*k3)+')';ghost.style.opacity=String(1-k3*.8);}
    }
    if(u<1)requestAnimationFrame(frame);
    else{box.remove();var f=sc.animate?sc.animate([{opacity:1},{opacity:1,offset:.25},{opacity:0}],{duration:1100,fill:'both'}):null;if(f)f.onfinish=function(){sc.remove();};else setTimeout(function(){sc.remove();},800);}
  }
  requestAnimationFrame(frame);
}
// Stofwolkje waar de hand op tafel neerkomt.
function impact(p){
  if(!document.body.animate)return;
  var r=document.createElement('div');r.className='slam';r.style.left=p.x+'px';r.style.top=p.y+'px';$('fx').appendChild(r);
  var a=r.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:.9},{transform:'translate(-50%,-50%) scale(1.6)',opacity:0}],{duration:420,easing:'ease-out',fill:'both'});a.onfinish=function(){r.remove();};
}
// 'Jammer joh': deze kaart kan nu niet.
function nope(el){
  if(!el||!el.getBoundingClientRect)return;Snd.play('nope');
  var r=el.getBoundingClientRect(),d=document.createElement('div');d.className='nope';d.textContent='Jammer joh';
  d.style.left=(r.left+r.width/2)+'px';d.style.top=r.top+'px';$('fx').appendChild(d);
  if(!d.animate){setTimeout(function(){d.remove();},1100);return;}
  var a=d.animate([{transform:'translate(-50%,-60%) scale(.4)',opacity:0},{transform:'translate(-50%,-115%) scale(1.08)',opacity:1,offset:.18},{transform:'translate(-50%,-120%) scale(1)',opacity:1,offset:.75},{transform:'translate(-50%,-150%) scale(.95)',opacity:0}],{duration:1100,easing:'ease-out',fill:'both'});
  a.onfinish=function(){d.remove();};
  var c=el.querySelector('.card');if(c&&motion)c.animate([{translate:'0'},{translate:'-7px'},{translate:'6px'},{translate:'-4px'},{translate:'0'}],{duration:320});
}
// Verkoolde kaarten vallen van de stapel in de glazen bak.
function dropToBin(from,binR,n){
  if(!binR)return;
  for(var i=0;i<n;i++){(function(i){
    var d=document.createElement('div');d.className='charcard';
    d.style.cssText='left:'+from.left+'px;top:'+from.top+'px;width:'+from.width+'px;height:'+from.height+'px';$('fx').appendChild(d);
    var dx=binR.left+binR.width/2-(from.left+from.width/2),dy=binR.top+16-(from.top+from.height/2),s=(binR.width*.82)/from.height;
    var a=d.animate([{transform:'translate(0,0) rotate(0deg) scale(.8)',opacity:.95},{transform:'translate('+(dx*.5)+'px,'+(dy*.5-40)+'px) rotate(50deg) scale(.55)',opacity:.95,offset:.5},{transform:'translate('+dx+'px,'+dy+'px) rotate(90deg) scale('+s+','+(s*.35)+')',opacity:0}],{duration:420,delay:i*70,easing:'cubic-bezier(.4,0,.8,.6)',fill:'both'});
    a.onfinish=function(){d.remove();};
  })(i);}
}
function flames(r){
  var box=document.createElement('div');box.className='flamebox';
  box.style.cssText='left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px';
  $('fx').appendChild(box);
  var glow=document.createElement('div');glow.className='fglow';box.appendChild(glow);
  glow.animate([{opacity:0,transform:'scale(.6)'},{opacity:1,transform:'scale(1.1)',offset:.3},{opacity:.8,offset:.7},{opacity:0,transform:'scale(1.3)'}],{duration:1150,fill:'both'});
  for(var i=0;i<12;i++){(function(){
    var f=document.createElement('div');f.className='flame';var w=r.width*(.3+Math.random()*.32);
    f.style.cssText='left:'+(8+Math.random()*84)+'%;width:'+w+'px;height:'+(w*1.75)+'px';box.appendChild(f);
    f.animate([{transform:'translate(-50%,20%) scale(.2,.1)',opacity:0},{transform:'translate(-50%,0) scale(1,1.1)',opacity:1,offset:.25},{transform:'translate(-50%,-12%) scale(.8,1.35)',opacity:1,offset:.55},{transform:'translate(-50%,-30%) scale(.95,1)',opacity:.85,offset:.75},{transform:'translate(-50%,-60%) scale(.3,.5)',opacity:0}],{duration:850+Math.random()*350,delay:Math.random()*260,easing:'ease-out',fill:'both'});
  })();}
  setTimeout(function(){box.remove();},1800);
}
function embers(r,kind){
  for(var i=0;i<18;i++){(function(){
    var d=document.createElement('div');d.className='ember'+(kind?' '+kind:'');
    d.style.left=(r.left+r.width/2+(Math.random()-.5)*r.width*.7)+'px';d.style.top=(r.top+r.height/2+(Math.random()-.5)*r.height*.5)+'px';$('fx').appendChild(d);
    var a=d.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+((Math.random()-.5)*(kind?90:150))+'px,'+(kind?(-30-Math.random()*60):(-70-Math.random()*130))+'px) scale(.2)',opacity:0}],{duration:(kind?1100:600)+Math.random()*500,delay:Math.random()*200,easing:'ease-out',fill:'both'});
    a.onfinish=function(){d.remove();};
  })();}
}
function confetti(){
  var W=window.innerWidth||800,H=window.innerHeight||600,cols=['var(--d1)','var(--d2)','var(--d3)'];
  for(var i=0;i<54;i++){(function(i){
    var d=document.createElement('div');d.className='conf';d.style.left=(Math.random()*W)+'px';d.style.background=cols[i%3];$('fx').appendChild(d);
    var a=d.animate([{transform:'translateY(0) rotate(0deg)'},{transform:'translate('+((Math.random()-.5)*160)+'px,'+(H+60)+'px) rotate('+(360+Math.random()*720)+'deg)'}],{duration:1500+Math.random()*1400,delay:Math.random()*500,easing:'cubic-bezier(.3,.2,.6,1)',fill:'both'});
    a.onfinish=function(){d.remove();};
  })(i);}
}
function runFx(pre,evs){
  if(!motion||!evs.length||!document.body.animate)return;
  var t=0,pileBox=$('pileBox'),pfx=$('pileFx'),deckR=rectOf($('deckBox')),pileR=rectOf(pileBox),ghosted=false,lgw=0;
  var probe=pileBox.firstElementChild;if(probe)lgw=probe.offsetWidth;
  function reset(){pfx.innerHTML='';pfx.className='pile fxpile';pfx.style.cssText='';}
  function showGhost(){if(!ghosted){ghosted=true;reset();pfx.innerHTML=pre.pile||'';}}
  function cardBox(r){var w=lgw||r.width*.7,h=w*1.4;return{left:r.left+r.width/2-w/2,top:r.top+r.height/2-h/2,width:w,height:h};}
  evs.forEach(function(ev){
    var mine=ev.pi===v.you;
    if(ev.t==='play'||ev.t==='open'||ev.t==='flipfail'){
      var from=ev.t==='open'?deckR:seatSrc(ev.pi,ev.from||'blind');
      var top=pileBox.querySelector('.top'),real=!!(top&&ev.t!=='flipfail'&&+top.getAttribute('data-cid')===ev.c.id),to;
      if(real){to=cardBox(rectOf(top));top.style.visibility='hidden';}else{showGhost();to=cardBox(pileR);}
      var dx=from.left+from.width/2-(to.left+to.width/2),wild=ev.c.k!=='n',after=wild?'morph':'landed';
      fly(ev.c,wild?null:ev.as,from,to,{delay:t,dur:400,flip:ev.t!=='play'||!mine||ev.from==='blind',s:mine&&ev.t==='play'?.7:.45,rot:mine?-10:dx<0?-24:24,
        done:function(){if(real){top.classList.add(after);top.style.visibility='';if(ev.junk)junkie(top);}else if(ghosted)pfx.insertAdjacentHTML('beforeend',face(ev.c,{as:ev.as,cls:'lg '+after,attr:' style="'+jit(ev.c.id,true)+'"'}));}});
      t+=400;if(ev.t==='flipfail')t+=520;if(wild&&ev.t!=='flipfail')t+=950;if(ev.junk)t+=1700;
    }else if(ev.t==='burn'){
      showGhost();var box=cardBox(pileR),bin=$('binBox'),pend=[].slice.call(bin.children,Math.min(pre.burned||0,bin.children.length));
      pend.forEach(function(s){s.classList.add('pending');});
      setTimeout(function(){dropToBin(box,rectOf(bin),Math.min(5,pend.length));},t+1100);
      setTimeout(function(){pend.forEach(function(s,j){s.style.transitionDelay=(j*10)+'ms';s.classList.remove('pending');});},t+1480);
      setTimeout(function(){
        pfx.style.setProperty('--bd','1100ms');pfx.classList.add('burning');flames(box);embers(pileR);
        setTimeout(function(){embers(pileR,'ash');},450);setTimeout(function(){toast('Verbrand',pileR,true);},250);
      },t+30);
      setTimeout(reset,t+1150);t+=1750;
    }else if(ev.t==='pick'){
      showGhost();var sr=rectOf(seatEl(ev.pi))||pileR,P={x:pileR.left+pileR.width/2,y:pileR.top+pileR.height/2};
      var S=ev.pi===v.you?{x:sr.left+sr.width/2,y:Math.min(sr.top+24,(window.innerHeight||800)+40)}:{x:sr.left+sr.width/2,y:sr.top+sr.height/2};
      setTimeout(function(){stretchArm(S,P,pfx);},t+30);
      t+=1200;setTimeout(reset,t);
    }else if(ev.t==='draw'){
      ev.cards.forEach(function(c,i){
        var to,el=null,solo=false,cw;
        if(mine){el=$('me').querySelector('[data-ids*=",'+c.id+',"]');solo=!!el&&el.getAttribute('data-ids').split(',').length===3;to=rectOf(el)||rectOf($('me'));cw=el?to.width:60;}
        else{var seat=seatEl(ev.pi),fr=rectOf(seat&&seat.querySelector('.fan'))||rectOf(seat)||deckR;to={left:fr.left+fr.width/2-17,top:fr.top+fr.height/2-24,width:34,height:48};cw=34;}
        if(solo)el.style.visibility='hidden';
        fly(c,null,deckR,to,{delay:t+i*90,dur:340,flip:mine,backOnly:!mine,cw:cw,s:Math.max(.5,deckR.width/to.width),rot:.01,done:function(){if(solo)el.style.visibility='';}});
      });
      t+=340+90*(ev.cards.length-1);
    }else if(ev.t==='dir'){setTimeout(function(){toast('↻ Richting om',pileR);},Math.max(0,t-120));}
    else if(ev.t==='seven'){setTimeout(function(){toast('Onder de 7',pileR);},Math.max(0,t-120));}
    else if(ev.t==='skip'){setTimeout(function(){toast('Overgeslagen',pileR);},Math.max(0,t-120));}
    else if(ev.t==='win'&&mine){setTimeout(confetti,t);}
  });
}


/* ---------- geluid ----------
   Alle effecten worden in de browser zelf opgewekt (Web Audio), er zijn geen geluidsbestanden. */
var Snd=(function(){
  var ctx=null,master=null,nb=null,on=load('d3cks-sound')!=='0';
  function ac(){
    if(!ctx){var C=window.AudioContext||window.webkitAudioContext;if(!C)return null;try{ctx=new C();}catch(e){return null;}
      master=ctx.createGain();master.gain.value=.55;master.connect(ctx.destination);}
    if(ctx.state==='suspended')ctx.resume();return ctx;
  }
  function noiseBuf(c){if(nb)return nb;var len=c.sampleRate*2,b=c.createBuffer(1,len,c.sampleRate),d=b.getChannelData(0);for(var i=0;i<len;i++)d[i]=Math.random()*2-1;return nb=b;}
  function env(g,t,a,dur,peak){g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+dur);}
  function tone(c,t,o){var os=c.createOscillator(),g=c.createGain();os.type=o.type||'sine';os.frequency.setValueAtTime(o.f,t);if(o.f2)os.frequency.exponentialRampToValueAtTime(o.f2,t+o.dur);
    env(g,t,o.a||.01,o.dur,o.g||.3);os.connect(g);g.connect(master);os.start(t);os.stop(t+o.dur+.05);}
  function noise(c,t,o){var s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=noiseBuf(c);f.type=o.type||'bandpass';
    f.frequency.setValueAtTime(o.f,t);if(o.f2)f.frequency.exponentialRampToValueAtTime(o.f2,t+o.dur);f.Q.value=o.q||1;
    env(g,t,o.a||.005,o.dur,o.g||.3);s.connect(f);f.connect(g);g.connect(master);s.start(t,Math.random()*1.5);s.stop(t+o.dur+.05);}
  var S={
    card:function(c,t){noise(c,t,{f:3000,f2:1400,dur:.08,q:.9,g:.28});tone(c,t,{f:180,f2:90,dur:.07,g:.08});},
    draw:function(c,t){noise(c,t,{f:4200,f2:2500,dur:.05,q:1.2,g:.12});},
    burn:function(c,t){noise(c,t,{type:'lowpass',f:300,f2:2200,dur:1.15,a:.18,g:.55});tone(c,t,{f:70,f2:38,dur:.9,a:.05,g:.35});
      for(var i=0;i<16;i++)noise(c,t+.1+Math.random()*.95,{type:'highpass',f:2500+Math.random()*3000,dur:.03,g:.18+Math.random()*.15});},
    bin:function(c,t){for(var i=0;i<5;i++)noise(c,t+i*.06,{f:900-i*110,dur:.07,q:2,g:.16});},
    ten:function(c,t){noise(c,t,{type:'lowpass',f:250,f2:3200,dur:.35,a:.04,g:.35});},
    two:function(c,t){noise(c,t,{f:500,f2:2800,dur:.22,q:3,g:.3});noise(c,t+.2,{f:2800,f2:500,dur:.25,q:3,g:.3});},
    seven:function(c,t){tone(c,t,{type:'triangle',f:880,f2:196,dur:.45,g:.22});},
    eight:function(c,t){[520,780,1040].forEach(function(f,i){tone(c,t+i*.09,{type:'square',f:f,dur:.07,g:.07});});},
    ace:function(c,t){noise(c,t,{type:'lowpass',f:400,f2:150,dur:.2,g:.2});tone(c,t+.25,{f:220,f2:660,dur:.5,a:.05,g:.22});tone(c,t+.75,{type:'triangle',f:990,dur:.14,g:.15});},
    joker:function(c,t){[784,988,1175,1568].forEach(function(f,i){tone(c,t+i*.09,{f:f,dur:.35,g:.12});});},
    junk:function(c,t){noise(c,t,{f:2600,f2:1800,dur:.35,q:4,g:.25});noise(c,t+.4,{f:3200,dur:.12,q:5,g:.2});tone(c,t+.1,{f:600,f2:240,dur:.4,g:.1});},
    pick:function(c,t){noise(c,t,{type:'lowpass',f:700,f2:200,dur:.35,g:.4});tone(c,t,{f:110,f2:60,dur:.25,g:.25});},
    win:function(c,t){[523,659,784,1047].forEach(function(f,i){tone(c,t+i*.12,{type:'triangle',f:f,dur:i===3?.6:.2,g:.22});});},
    end:function(c,t){[392,330,262].forEach(function(f,i){tone(c,t+i*.16,{type:'triangle',f:f,dur:.3,g:.16});});},
    nope:function(c,t){tone(c,t,{type:'triangle',f:233,f2:196,dur:.2,g:.2});tone(c,t+.2,{type:'triangle',f:185,f2:130,dur:.35,g:.2});},
    scrape:function(c,t){noise(c,t,{f:1800,f2:900,dur:.5,q:6,a:.03,g:.16});noise(c,t+.05,{f:3600,f2:2200,dur:.42,q:8,g:.08});},
    stretch:function(c,t){tone(c,t,{f:160,f2:760,dur:.34,g:.22});noise(c,t,{f:900,f2:2400,dur:.3,q:2,g:.12});},
    snap:function(c,t){tone(c,t,{f:760,f2:140,dur:.4,g:.2});},
    alarm:function(c,t){[0,.22,.44].forEach(function(d){tone(c,t+d,{type:'square',f:880,dur:.1,g:.07});tone(c,t+d+.11,{type:'square',f:660,dur:.1,g:.07});});},
    fanfare:function(c,t){[392,523,659].forEach(function(f,i){tone(c,t+i*.1,{type:'triangle',f:f,dur:i===2?.4:.15,g:.18});});},
    pttOn:function(c,t){tone(c,t,{f:660,f2:990,dur:.07,g:.08});},
    pttOff:function(c,t){tone(c,t,{f:990,f2:660,dur:.07,g:.06});},
    chat:function(c,t){tone(c,t,{f:880,f2:1320,dur:.12,g:.1});},
    turn:function(c,t){tone(c,t,{f:1047,dur:.35,g:.15});tone(c,t+.08,{f:1568,dur:.3,g:.08});}
  };
  return{
    play:function(n,delay){if(!on||!S[n])return;var c=ac();if(!c||c.state!=='running')return;S[n](c,c.currentTime+.02+(delay||0)/1000);},
    unlock:function(){if(on)ac();},
    isOn:function(){return on;},
    ctx:function(){return ac();},
    toggle:function(){on=!on;store('d3cks-sound',on?'1':'0');if(on)ac();return on;}
  };
})();
function sndLabel(){var on=Snd.isOn();[].forEach.call(document.querySelectorAll('.sndBtn'),function(b){b.textContent=on?'Geluid aan':'Geluid uit';b.setAttribute('aria-pressed',on?'true':'false');});}
// Speelt de geluiden af op hetzelfde ritme als de animaties in runFx.
function sfx(evs,wasMine){
  var t=0,SP={10:'ten',2:'two',7:'seven',8:'eight',14:'ace'};
  evs.forEach(function(ev){
    if(ev.t==='play'||ev.t==='open'||ev.t==='flipfail'){
      var land=t+360,wild=ev.c.k!=='n';Snd.play('card',land);
      if(ev.t==='play'){if(wild)Snd.play('joker',land+120);else if(SP[ev.as])Snd.play(SP[ev.as],land);if(ev.junk)Snd.play('junk',land+500);}
      t+=400;if(ev.t==='flipfail')t+=520;if(wild&&ev.t!=='flipfail')t+=950;if(ev.junk)t+=1700;
    }else if(ev.t==='burn'){Snd.play('burn',t+30);Snd.play('bin',t+1550);t+=1750;}
    else if(ev.t==='pick'){Snd.play('stretch',t+30);Snd.play('pick',t+490);Snd.play('scrape',t+590);Snd.play('snap',t+700);t+=1200;}
    else if(ev.t==='draw'){ev.cards.forEach(function(c,i){Snd.play('draw',t+i*90+250);});t+=340+90*(ev.cards.length-1);}
    else if(ev.t==='win'){Snd.play(ev.pi===v.you?'win':'end',t);}
  });
  if(v.myMove&&!wasMine)Snd.play('turn',t+150);
  return t;
}

/* ---------- chat ----------
   Snelle berichten stel je vooraf in (bewaard in deze browser); in het spel tik je ze alleen aan. */
var chatItems=[],unread=0;
var QUICK_DEFAULT=['Jammer joh','Haha!','Strekken!','Goed gespeeld','Pas op, laatste kaart!','Wie heeft die 10?','Kom op, spelen!','Nog een potje?'];
function quickList(){try{var l=JSON.parse(load('d3cks-quick')||'null');if(Array.isArray(l)&&l.length)return l.slice(0,8).map(String);}catch(e){}return QUICK_DEFAULT;}
function closeSheets(){$('chatSheet').hidden=true;$('quickSheet').hidden=true;$('micSheet').hidden=true;}
function renderChat(){
  var b=$('chatBadge');b.hidden=!unread;b.textContent=unread>9?'9+':String(unread);
  $('chatBtn').setAttribute('aria-label',unread?'Chat openen, '+unread+' nieuw':'Chat openen');
  if($('chatSheet').hidden)return;
  var h='';chatItems.forEach(function(it){h+='<li'+(sess&&it.pid===sess.pid?' class="me"':'')+'><b>'+esc(it.name)+'</b>'+esc(it.text)+'</li>';});
  var lg=$('chatLog'),atEnd=lg.scrollHeight-lg.scrollTop-lg.clientHeight<30;
  lg.innerHTML=h||'<li class="empty">Nog geen berichten. Tik hieronder een snel bericht aan.</li>';
  if(atEnd)lg.scrollTop=lg.scrollHeight;
  $('quickRow').innerHTML=quickList().map(function(q,i){return'<button type="button" class="qchip" data-act="quick" data-i="'+i+'">'+esc(q)+'</button>';}).join('');
}
function openQuickEdit(list){
  closeSheets();var h='';
  for(var i=0;i<8;i++)h+='<input maxlength="40" aria-label="Snel bericht '+(i+1)+'" value="'+esc(list[i]||'')+'" placeholder="Snel bericht '+(i+1)+'">';
  $('quickEdit').innerHTML=h;$('quickSheet').hidden=false;
  // Op het startscherm is de chatknop er niet; de instellingen wel.
}
// Een wolkje bij de speler aan tafel, zodat je ziet wie wat zegt zonder de chat te openen.
function chatBubble(it){
  if(screen!=='game'||!v||it.seat<0)return;
  var el=it.seat===v.you?$('me'):$('opps').querySelector('[data-seat="'+it.seat+'"]');if(!el)return;
  var r=el.getBoundingClientRect(),d=document.createElement('div');d.className='cbubble';d.textContent=it.text;
  d.style.left=Math.max(8,Math.min(r.left+12,(window.innerWidth||400)-230))+'px';d.style.top=Math.max(8,r.top-8)+'px';$('fx').appendChild(d);
  if(!d.animate){setTimeout(function(){d.remove();},3200);return;}
  var a=d.animate([{transform:'translateY(-80%) scale(.5)',opacity:0},{transform:'translateY(-100%) scale(1.05)',opacity:1,offset:.08},{transform:'translateY(-100%) scale(1)',opacity:1,offset:.85},{transform:'translateY(-120%)',opacity:0}],{duration:3200,easing:'ease-out',fill:'both'});
  a.onfinish=function(){d.remove();};
}
$('chatForm').addEventListener('submit',function(e){e.preventDefault();var i=$('chatInput'),t=i.value.trim();if(!t)return;if(send({t:'chat',text:t}))i.value='';});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeSheets();});

/* ---------- praten (push-to-talk) ----------
   Knop ingedrukt houden (of spatiebalk op de computer). De microfoon wordt omgezet naar
   24 kHz, per sample 1 byte (logaritmisch), en in kleine stukjes via de server verstuurd.
   De ontvanger zet ze achter elkaar af met een kleine buffer tegen haperingen. */
var talkingSeats={};
function applyTalking(){
  [].forEach.call(document.querySelectorAll('.talking'),function(e){e.classList.remove('talking');});
  Object.keys(talkingSeats).forEach(function(k){
    var i=+k,el=null;
    if(screen==='game'&&v)el=i===v.you?$('me'):$('opps').querySelector('[data-seat="'+i+'"]');
    else if(screen==='lobby')el=$('plist').querySelector('[data-seat="'+i+'"]');
    if(el)el.classList.add('talking');
  });
}
// Uitleg op maat als de microfoon niet lukt: welke browser/telefoon, en wat er misging.
function micHelp(reason){
  var ua=navigator.userAgent||'',android=/Android/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/.test(ua)&&'ontouchend' in document);
  var inApp=/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Discord|; wv\)|WebView/i.test(ua);
  var h='',acts='<button class="btn main" type="button" data-act="micClose">Oké</button>';
  if(inApp||reason==='unsupported'){
    h='<p>Je speelt nu in de <b>ingebouwde browser van een andere app</b> (zoals Instagram, Facebook of Discord). Die laat de microfoon meestal niet toe.</p>'+
      '<ol><li>Tik rechtsboven op de <b>drie puntjes</b> (of het deel-icoon).</li><li>Kies <b>Openen in '+(ios?'Safari':'Chrome')+'</b> of <b>Openen in browser</b>.</li><li>Doe daar opnieuw mee met dezelfde code.</li></ol>';
    acts='<button class="btn" type="button" data-act="micCopy">Kopieer link</button>'+acts;
  }else if(reason==='NotAllowedError'||reason==='SecurityError'||reason==='PermissionDeniedError'){
    if(android)h='<p>De microfoon is <b>geblokkeerd</b> voor deze site.</p><ol><li>Tik links van het webadres op het <b>slotje</b> of het <b>instellingen-icoon</b>.</li><li>Kies <b>Machtigingen</b> en zet <b>Microfoon</b> op <b>Toestaan</b>.</li><li>Ververs de pagina en houd de praatknop opnieuw ingedrukt.</li></ol>'+
      '<p>Werkt het nog niet? Dan mag je browser zelf de microfoon niet gebruiken: ga naar <b>Instellingen</b> van je telefoon, <b>Apps</b>, <b>Chrome</b> (of je browser), <b>Machtigingen</b>, en zet <b>Microfoon</b> aan.</p>';
    else if(ios)h='<p>De microfoon is <b>geblokkeerd</b> voor deze site.</p><ol><li>Tik in Safari links in de adresbalk op <b>aA</b> (of het instellingen-icoon).</li><li>Kies <b>Website-instellingen</b> en zet <b>Microfoon</b> op <b>Sta toe</b> of <b>Vraag</b>.</li><li>Ververs de pagina en houd de praatknop opnieuw ingedrukt.</li></ol>'+
      '<p>Staat D3cks als app op je beginscherm? Kijk dan ook bij <b>Instellingen</b>, <b>Apps</b>, <b>Safari</b>, <b>Microfoon</b>.</p>';
    else h='<p>De microfoon is <b>geblokkeerd</b> voor deze site.</p><ol><li>Klik links van het webadres op het <b>slotje</b> of het instellingen-icoon.</li><li>Zet <b>Microfoon</b> op <b>Toestaan</b>.</li><li>Ververs de pagina.</li></ol><p>Kijk ook of je computer de browser toegang geeft tot de microfoon (in de privacy-instellingen van Windows of macOS).</p>';
  }else if(reason==='NotFoundError'||reason==='OverconstrainedError'||reason==='DevicesNotFoundError'){
    h='<p>Er is <b>geen microfoon gevonden</b>. Sluit een headset of microfoon aan en probeer het opnieuw.</p>';
  }else if(reason==='NotReadableError'||reason==='AbortError'||reason==='TrackStartError'){
    h='<p>De microfoon is <b>bezet door een andere app</b>, bijvoorbeeld een telefoongesprek, WhatsApp-call of Discord. Sluit die en probeer het opnieuw.</p>';
  }else h='<p>De microfoon kon niet worden gestart. Ververs de pagina en probeer het opnieuw. Lukt het dan nog niet, open D3cks dan in Chrome of Safari.</p>';
  closeSheets();$('micHelp').innerHTML=h;$('micActs').innerHTML=acts;$('micSheet').hidden=false;
}
var Talk=(function(){
  var RATE=24000,stream=null,actx=null,srcN=null,proc=null,talking=false,stopT=null,maxT=null,nextAt={},vgain=null;
  function enc(x){var s=x<0?-x:x;if(s>1)s=1;return(x<0?128:0)|Math.round(127*Math.log(1+255*s)/Math.log(256));}
  function dec(b){var m=(b&127)/127,y=(Math.pow(256,m)-1)/255;return b&128?-y:y;}
  function ui(on){$('talkBtn').classList.toggle('on',on);$('talkBtn').querySelector('.tlabel').textContent=on?'Praat…':'Praat';}
  function mic(){
    if(stream&&stream.active)return Promise.resolve(stream);
    return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(s){stream=s;return s;});
  }
  function start(){
    if(talking||screen==='home')return;
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){micHelp('unsupported');return;}
    if(!online){showErr('Geen verbinding met de server.');return;}
    talking=true;clearTimeout(stopT);ui(true);
    if(!actx){var C=window.AudioContext||window.webkitAudioContext;actx=new C();}
    if(actx.state==='suspended')actx.resume();
    mic().then(function(s){
      if(!talking)return;
      srcN=actx.createMediaStreamSource(s);proc=actx.createScriptProcessor(2048,1,1);
      var ratio=actx.sampleRate/RATE;
      proc.onaudioprocess=function(e){
        if(!talking||!ws||ws.readyState!==1)return;
        var inp=e.inputBuffer.getChannelData(0),n=Math.floor(inp.length/ratio),out=new Uint8Array(n+1);
        out[0]=1;for(var k=0;k<n;k++)out[k+1]=enc(inp[Math.floor(k*ratio)]);
        ws.send(out.buffer);
      };
      srcN.connect(proc);proc.connect(actx.destination);
      send({t:'ptt',on:true});Snd.play('pttOn');
      maxT=setTimeout(stop,15000);
    },function(err){talking=false;ui(false);micHelp(err&&err.name);});
  }
  function stop(){
    if(!talking)return;talking=false;clearTimeout(maxT);ui(false);
    try{if(srcN)srcN.disconnect();if(proc){proc.onaudioprocess=null;proc.disconnect();}}catch(e){}
    srcN=proc=null;if(online)send({t:'ptt',on:false});Snd.play('pttOff');
    // microfoon nog even openhouden, zodat de volgende keer meteen werkt; daarna dicht
    stopT=setTimeout(function(){if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}},30000);
  }
  function play(buf){
    var a=new Uint8Array(buf);if(a.length<3)return;
    var c=Snd.ctx();if(!c)return;if(c.state==='suspended')c.resume();
    if(!vgain){vgain=c.createGain();vgain.gain.value=1.4;vgain.connect(c.destination);}
    var seat=a[0],n=a.length-2,ab=c.createBuffer(1,n,RATE),ch=ab.getChannelData(0);
    for(var i=0;i<n;i++)ch[i]=dec(a[i+2]);
    var s=c.createBufferSource();s.buffer=ab;s.connect(vgain);
    var now=c.currentTime,t=nextAt[seat]||0;if(t<now+.04)t=now+.15;
    s.start(t);nextAt[seat]=t+ab.duration;
  }
  return{start:start,stop:stop,play:play};
})();
(function(){
  var b=$('talkBtn');
  b.addEventListener('pointerdown',function(e){e.preventDefault();Snd.unlock();try{b.setPointerCapture(e.pointerId);}catch(x){}Talk.start();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(function(n){b.addEventListener(n,function(){Talk.stop();});});
  b.addEventListener('contextmenu',function(e){e.preventDefault();});
  b.addEventListener('keydown',function(e){if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();Talk.start();}});
  b.addEventListener('keyup',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();Talk.stop();}});
  var spaceTalk=false;
  function typing(){var t=(document.activeElement||{}).tagName||'';return /INPUT|TEXTAREA|SELECT/.test(t);}
  document.addEventListener('keydown',function(e){if(e.code==='Space'&&!e.repeat&&screen!=='home'&&!typing()&&document.activeElement!==b){e.preventDefault();spaceTalk=true;Talk.start();}});
  document.addEventListener('keyup',function(e){if(e.code==='Space'&&spaceTalk){e.preventDefault();spaceTalk=false;Talk.stop();}});
  window.addEventListener('blur',function(){Talk.stop();});
  document.addEventListener('visibilitychange',function(){if(document.hidden)Talk.stop();});
})();

/* ---------- acties ---------- */
function myCard(id){
  var me=v.players[v.you],list=me.zone==='hand'?v.hand:me.zone==='open'?me.open:[];
  for(var i=0;i<list.length;i++)if(list[i].id===id)return list[i];return null;
}
function tryPlay(id,el){
  if(busy)return;var c=myCard(id);
  if(!v.myMove||!c||!v.legal[id]){nope(el);return;}
  if(c.k==='n'){if(send({t:'play',id:id,as:c.v}))busy=true;picker=null;}
  else{picker={card:c,values:v.legal[id]};pickSrc=lastSrc;}
}
function name(){var n=$('name').value.trim();if(!n){showErr('Vul eerst je naam in.');$('name').focus();return null;}store('d3cks-name',n);return n;}
function copyInvite(){
  var url=location.origin+location.pathname+'#'+lob.code,btn=$('copyBtn');
  var ok=function(){btn.textContent='Gekopieerd';setTimeout(function(){btn.textContent='Kopieer uitnodiging';},2000);};
  var no=function(){showErr('Kopiëren lukte niet. Deel deze link: '+url);};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText('Doe mee met 3Decks: '+url+' (code '+lob.code+')').then(ok,no);else no();
}
function act(d,el){
  var id=d.id!==undefined&&d.act!=='remove'?+d.id:null,n;
  if(d.act==='hand'||d.act==='open'||d.act==='blind'){lastSrc=el&&el.getBoundingClientRect?el.getBoundingClientRect():null;if(d.act==='blind')pickSrc=lastSrc;}
  else if(d.act==='pick')lastSrc=pickSrc;
  switch(d.act){
    case'host':if((n=name()))send({t:'host',name:n});return;
    case'join':
      var code=$('code').value.toUpperCase().replace(/[^A-Z]/g,'');
      if(code.length!==4){showErr('Een spelcode heeft 4 letters.');$('code').focus();return;}
      if((n=name()))send({t:'join',code:code,name:n});return;
    case'solo':if((n=name()))send({t:'solo',name:n,bots:+$('bots').value});return;
    case'copy':copyInvite();return;
    case'chat':if($('chatSheet').hidden){closeSheets();$('chatSheet').hidden=false;unread=0;renderChat();var lg=$('chatLog');lg.scrollTop=lg.scrollHeight;}else closeSheets();return;
    case'chatClose':closeSheets();return;
    case'micClose':closeSheets();return;
    case'micCopy':
      var url=location.origin+'/'+(sess?'#'+sess.code:'');
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(function(){showErr('Link gekopieerd. Plak hem in Chrome of Safari.');},function(){showErr('Kopieer deze link: '+url);});else showErr('Kopieer deze link: '+url);
      return;
    case'quick':var q=quickList()[+d.i];if(q&&send({t:'chat',text:q,quick:true}))closeSheets();return;
    case'quickEdit':openQuickEdit(quickList());return;
    case'quickReset':openQuickEdit(QUICK_DEFAULT);return;
    case'quickSave':
      var list=[].map.call(document.querySelectorAll('#quickEdit input'),function(i){return i.value.replace(/\s+/g,' ').trim().slice(0,40);}).filter(Boolean);
      store('d3cks-quick',JSON.stringify(list.length?list:QUICK_DEFAULT));closeSheets();renderChat();return;
    case'quickClose':closeSheets();return;
    case'install':if(installEvt){installEvt.prompt();installEvt.userChoice.then(function(){installEvt=null;$('installBtn').hidden=true;},function(){});}return;
    case'addBot':send({t:'addBot'});return;
    case'remove':send({t:'remove',id:d.id});return;
    case'start':send({t:'start'});return;
    case'leave':
      if(screen==='game'&&v&&v.phase==='play'&&!confirmLeave){confirmLeave=true;clearTimeout(confirmT);confirmT=setTimeout(function(){confirmLeave=false;if(v)render();},3500);render();return;}
      confirmLeave=false;clearTimeout(confirmT);if(!send({t:'leave'}))goHome();return;
    case'hand':
      if(v.phase==='swap'){var a=v.hand.filter(function(x){return x.id===id;})[0];
        var same=a&&v.hand.some(function(c){return c.id===sel&&(c.k==='n'?a.k==='n'&&c.v===a.v:c.k===a.k);});
        sel=same?null:id;}
      else tryPlay(id,el);
      break;
    case'open':
      if(v.phase==='swap'){if(sel!==null){send({t:'swap',hand:sel,open:id});sel=null;}}
      else tryPlay(id,el);
      break;
    case'blind':if(v.myMove&&!busy&&send({t:'blind',i:+d.i}))busy=true;break;
    case'pick':
      if(busy)break;
      if(v.pending){if(send({t:'pick',as:+d.v}))busy=true;}
      else if(picker&&send({t:'play',id:picker.card.id,as:+d.v}))busy=true;
      picker=null;break;
    case'cancel':picker=null;break;
    case'pickup':if(!busy&&send({t:'pickup'}))busy=true;break;
    case'ready':send({t:'ready'});sel=null;break;
    case'again':send({t:'again'});break;
    case'sound':Snd.toggle();sndLabel();if(Snd.isOn())Snd.play('card',60);return;
  }
  if(screen==='game'&&v)render();
}

/* ---------- start ---------- */
document.addEventListener('click',function(e){Snd.unlock();var b=e.target.closest('[data-act]');if(!b||b.disabled)return;act(b.dataset,b);});
$('code').addEventListener('input',function(){this.value=this.value.toUpperCase().replace(/[^A-Z]/g,'');});
['name','code'].forEach(function(k){$(k).addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();act({act:k==='code'||$('code').value?'join':'host'});}});});
$('name').value=load('d3cks-name')||'';
var hash=(location.hash||'').slice(1).toUpperCase().replace(/[^A-Z]/g,'').slice(0,4);
try{sess=JSON.parse(loadTab()||'null');}catch(e){sess=null;}
if(sess&&hash&&sess.code!==hash){sess=null;storeTab(null);}
if(hash.length===4)$('code').value=hash;
// Thema: automatisch volgt het systeem (licht of blauw), de rest wordt vastgezet en onthouden.
var THEME_ATTR={blauw:'dark',licht:'light',zwart:'zwart',casino:'casino'};
function applyTheme(t){
  if(!THEME_ATTR[t])t='auto';
  if(t==='auto')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',THEME_ATTR[t]);
  store('d3cks-theme',t==='auto'?null:t);
  [].forEach.call(document.querySelectorAll('[data-theme-select]'),function(s){s.value=t;});
  // kleur van de statusbalk mee laten gaan met het thema
  var mt=document.querySelector('meta[name="theme-color"]');
  if(mt)try{mt.setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--table').trim()||'#0e1520');}catch(e){}
}
/* ---------- als app installeren ---------- */
var installEvt=null,standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('/sw.js').catch(function(){});
window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();installEvt=e;$('installBtn').hidden=false;});
window.addEventListener('appinstalled',function(){installEvt=null;$('installBtn').hidden=true;});
if(!standalone&&/iPhone|iPad|iPod/.test(navigator.userAgent||''))$('iosHint').hidden=false;
document.addEventListener('change',function(e){if(e.target.matches&&e.target.matches('[data-theme-select]'))applyTheme(e.target.value);});
applyTheme(load('d3cks-theme')||'auto');
sndLabel();
show('home');
connect();
})();
