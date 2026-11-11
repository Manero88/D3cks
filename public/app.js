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
function lab(x){return x<=10?String(x):({11:'B',12:'V',13:'H',14:'A'})[x];}
function word(x){return x<=10?String(x):({11:'Boer',12:'Vrouw',13:'Heer',14:'Aas'})[x];}
function nm(c,as){return c.k==='n'?word(c.v):(c.k==='joker'?'joker':'scorekaart')+(as?' als '+lab(as):'');}
function store(k,val){try{if(val===null)localStorage.removeItem(k);else localStorage.setItem(k,val);}catch(e){}}
function load(k){try{return localStorage.getItem(k);}catch(e){return null;}}

/* ---------- kaarten tekenen ---------- */
function face(c,o){o=o||{};var wild=c.k!=='n',main=wild?(c.k==='joker'?'★':'✦'):lab(c.v);
  var tag=wild?(o.as?'als '+lab(o.as):(c.k==='joker'?'joker':'score')):(FX[c.v]||'');
  return '<span class="card d'+c.d+' '+(o.cls||'')+'"'+(o.attr||'')+'><span class="c-corner">'+main+'</span><span class="c-main">'+main+'</span>'+(tag?'<span class="c-tag">'+tag+'</span>':WM)+'</span>';}
function back(d,cls,attr){return '<span class="card back d'+d+' '+(cls||'')+'"'+(attr||'')+'><span class="bwm">D<b>3</b>CKS</span></span>';}
function ghost(cls){return '<span class="card ghost '+(cls||'')+'"></span>';}
function thick(n,per,max){var l=Math.min(max,Math.ceil(n/per)),s=[];for(var i=1;i<=l;i++)s.push('0 '+(i*1.6).toFixed(1)+'px 0 var(--edge'+(i%2?'':'2')+')');s.push('0 '+(l*1.6+10).toFixed(1)+'px 16px var(--shadow)');return s.join(',');}
function jit(id,top){var r=top?((id*37)%9)-4:((id*37)%25)-12,x=((id*53)%15)-7,y=((id*29)%9)-4;return 'transform:translate('+x+'px,'+y+'px) rotate('+r+'deg)';}

/* ---------- verbinding ---------- */
function connect(){
  clearTimeout(retry);
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host);
  ws.onopen=function(){online=true;$('conn').hidden=true;if(sess)send({t:'rejoin',code:sess.code,pid:sess.pid,token:sess.token});};
  ws.onmessage=function(e){var m;try{m=JSON.parse(e.data);}catch(x){return;}onMsg(m);};
  ws.onclose=function(){online=false;busy=false;if(screen!=='home')$('conn').hidden=false;retry=setTimeout(connect,1500);};
  ws.onerror=function(){};
}
function send(o){if(!online){showErr('Geen verbinding met de server. Probeer het zo opnieuw.');return false;}ws.send(JSON.stringify(o));return true;}
function showErr(msg){
  var el=$(screen==='home'?'homeErr':screen==='lobby'?'lobErr':'gameErr');
  el.textContent=msg;el.hidden=false;clearTimeout(errT);errT=setTimeout(function(){el.hidden=true;},5000);
}
function show(s){
  screen=s;['home','lobby','game'].forEach(function(k){$(k).hidden=k!==s;});
  if(s==='home')$('conn').hidden=true;
}
function goHome(){sess=null;lob=null;v=null;store('d3cks-session',null);setHash('');document.title='3Decks';show('home');}
function setHash(code){try{history.replaceState(null,'',code?'#'+code:location.pathname+location.search);}catch(e){}}
function onMsg(m){
  if(m.t==='joined'){sess={code:m.code,pid:m.pid,token:m.token};store('d3cks-session',JSON.stringify(sess));setHash(m.code);}
  else if(m.t==='lobby'){lob=m;v=null;show('lobby');renderLobby();}
  else if(m.t==='state'){
    var pre={pile:$('pileBox').innerHTML},fresh=screen!=='game'||!v||(v.phase==='over'&&m.v.phase==='swap');
    v=m.v;busy=false;show('game');
    if(fresh){sel=null;picker=null;if(motion){$('app').classList.add('dealing');setTimeout(function(){$('app').classList.remove('dealing');},900);}}
    render();runFx(pre,m.fx||[]);
  }
  else if(m.t==='error'){busy=false;if(m.code==='gone'){var was=screen;goHome();if(was==='home')return;}showErr(m.msg);}
  else if(m.t==='left')goHome();
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
    h+='<li'+(p.connected?'':' class="off"')+'><span class="grow">'+esc(p.name)+'</span><span class="tag">'+tags.join(' · ')+'</span>'+
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
}

/* ---------- spelscherm ---------- */
function req(){
  if(!v.pileN)return'Vrije zet: elke kaart mag.';
  var t=v.top;
  if(v.sevenBy!==null)return t===7?'7-regel: speel 6 of lager.':t===6?'7-regel: speel een 6.':'7-regel: speel '+t+' tot en met 6.';
  if(v.raise)return'De 7-regel is voorbij: speel 7 of hoger.';
  if(t===2)return'Vrije zet: elke kaart mag.';
  return'Speel '+lab(t)+' of hoger.';
}
function nextSeat(){var n=v.players.length,i=v.turn;for(var k=0;k<n;k++){i=(i+v.dir+n)%n;if(!v.players[i].out)return i;}return v.turn;}
function slotsHtml(p,mine,st){
  var h='<div class="slots">',n=Math.max(p.blind.length,p.open.length);
  if(!n)return h+ghost()+'</div>';
  for(var i=0;i<n;i++){
    var o=p.open[i],b=p.blind[i],inner='';
    if(b){
      if(mine&&!o&&st.blindTurn)inner+='<button type="button" class="cardbtn legal" data-act="blind" data-i="'+i+'" aria-label="Blinde kaart spelen">'+back(b)+'</button>';
      else inner+=back(b,o?'under':'');
    }
    if(o){
      if(mine){
        var cls='',dis=true;
        if(v.phase==='swap'){dis=sel===null||st.ready;cls=sel!==null&&!st.ready?'target':'';}
        else if(st.openTurn){var ok=v.legal[o.id];cls=ok?'legal':'no';dis=!ok;}
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
    p.backs.forEach(function(d,j){fan+=back(d,'',' style="--r:'+((j-m)*8).toFixed(1)+'deg"');});
    var where=p.out?'Ligt uit het spel':v.phase==='swap'?(p.ready?'Klaar':'Legt kaarten goed'):v.endgame&&p.zone==='open'?'Speelt open kaarten':v.endgame&&p.zone==='blind'?'Speelt blinde kaarten':'';
    oh+='<div class="seat'+(turn?' turn':'')+(p.out?' out':'')+'" data-seat="'+i+'"><div class="seat-h"><span class="nm">'+esc(p.name)+'</span>'+(p.bot?'<span class="tag">bot</span>':'')+(p.away?'<span class="tag">weg</span>':'')+
      (turn?'<span class="pill">aan de beurt</span>':'')+(v.winner===i?'<span class="pill">winnaar</span>':'')+'</div>'+
      '<div class="seat-row sm"><div class="tbl">'+slotsHtml(p,false,st)+'</div><div class="handinfo"><span class="fan">'+fan+'</span><span><b>'+p.n+'</b> in hand</span></div></div>'+
      (where?'<div class="tag">'+where+'</div>':'')+'</div>';
  }
  $('opps').innerHTML=oh;

  var ph='',pn=v.pileN,sh=v.pile;
  if(!pn)ph=ghost('lg');
  else sh.forEach(function(e,idx){var top=idx===sh.length-1;
    ph+=face(e.c,{as:e.as,cls:'lg'+(top?' top':''),attr:' data-cid="'+e.c.id+'" style="'+jit(e.c.id,top)+(idx===0?';box-shadow:'+thick(pn,3,7):'')+'"'});});
  $('pileBox').innerHTML=ph;
  $('pileCap').innerHTML='Stapel <b>'+pn+'</b>';
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
    else if(v.myMove&&!legalN){now='Je kunt niet spelen.';sub=req();acts='<button type="button" class="btn main" data-act="pickup">Pak de stapel ('+pn+')</button>';}
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
    else if(v.myMove&&zone==='hand'){var ok=v.legal[c.id];cls=ok?'legal':'no';dis=!ok;}
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
  $('me').innerHTML='<div class="seat-h"><span class="nm">'+esc(me.name)+'</span><span class="tag">jij</span>'+(myTurn?'<span class="pill">aan de beurt</span>':'')+(v.winner===you?'<span class="pill">winnaar</span>':'')+'</div>'+pk+
    '<div class="me-row"><div class="zone"><span class="zl">Op tafel: open op blind</span>'+slotsHtml(me,true,st)+'</div>'+
    '<div class="zone" style="flex:1 1 220px"><span class="zl">Hand · '+v.hand.length+'</span><div class="hand">'+hh+'</div></div></div>';
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
function embers(r){
  for(var i=0;i<18;i++){(function(){
    var d=document.createElement('div');d.className='ember';
    d.style.left=(r.left+r.width/2+(Math.random()-.5)*r.width*.7)+'px';d.style.top=(r.top+r.height/2+(Math.random()-.5)*r.height*.5)+'px';$('fx').appendChild(d);
    var a=d.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:'translate('+((Math.random()-.5)*150)+'px,'+(-70-Math.random()*130)+'px) scale(.2)',opacity:0}],{duration:600+Math.random()*500,delay:Math.random()*200,easing:'ease-out',fill:'both'});
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
      var dx=from.left+from.width/2-(to.left+to.width/2);
      fly(ev.c,ev.as,from,to,{delay:t,dur:400,flip:ev.t!=='play'||!mine||ev.from==='blind',s:mine&&ev.t==='play'?.7:.45,rot:mine?-10:dx<0?-24:24,
        done:function(){if(real)top.style.visibility='';else if(ghosted)pfx.insertAdjacentHTML('beforeend',face(ev.c,{as:ev.as,cls:'lg',attr:' style="'+jit(ev.c.id,true)+'"'}));}});
      t+=400;if(ev.t==='flipfail')t+=520;
    }else if(ev.t==='burn'){
      showGhost();
      setTimeout(function(){pfx.style.setProperty('--bd','620ms');pfx.classList.add('burning');embers(pileR);toast('Verbrand',pileR,true);},t+30);
      t+=700;setTimeout(reset,t);
    }else if(ev.t==='pick'){
      showGhost();var tr=rectOf(seatEl(ev.pi))||pileR;
      setTimeout(function(){
        pfx.style.setProperty('--bd','480ms');pfx.style.setProperty('--px',(tr.left+tr.width/2-pileR.left-pileR.width/2)+'px');pfx.style.setProperty('--py',(tr.top+tr.height/2-pileR.top-pileR.height/2)+'px');
        pfx.classList.add('go');void pfx.offsetWidth;pfx.classList.add('away');},t+30);
      t+=540;setTimeout(reset,t);
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

/* ---------- acties ---------- */
function myCard(id){
  var me=v.players[v.you],list=me.zone==='hand'?v.hand:me.zone==='open'?me.open:[];
  for(var i=0;i<list.length;i++)if(list[i].id===id)return list[i];return null;
}
function tryPlay(id){
  if(!v.myMove||busy)return;var c=myCard(id);if(!c||!v.legal[id])return;
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
      else tryPlay(id);
      break;
    case'open':
      if(v.phase==='swap'){if(sel!==null){send({t:'swap',hand:sel,open:id});sel=null;}}
      else tryPlay(id);
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
  }
  if(screen==='game'&&v)render();
}

/* ---------- start ---------- */
document.addEventListener('click',function(e){var b=e.target.closest('[data-act]');if(!b||b.disabled)return;act(b.dataset,b);});
$('code').addEventListener('input',function(){this.value=this.value.toUpperCase().replace(/[^A-Z]/g,'');});
['name','code'].forEach(function(k){$(k).addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();act({act:k==='code'||$('code').value?'join':'host'});}});});
$('name').value=load('d3cks-name')||'';
var hash=(location.hash||'').slice(1).toUpperCase().replace(/[^A-Z]/g,'').slice(0,4);
try{sess=JSON.parse(load('d3cks-session')||'null');}catch(e){sess=null;}
if(sess&&hash&&sess.code!==hash){sess=null;store('d3cks-session',null);}
if(hash.length===4)$('code').value=hash;
show('home');
connect();
})();
