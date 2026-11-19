{
const H=15,W=192,DOOR=179.5,CP_X=97,G=45;
const $=id=>document.getElementById(id);
const cv=$('cv'),ctx=cv.getContext('2d'),stage=$('stage');
let map,gifts,rings,enemyDefs,enemies=[],items=[],bumps=[],parts=[],popups=[];
let T=40,dpr=1,viewW=26,camX=0,clock=0,state='title',prev='play',stT=0,winShown=false;
let nameT=0,won=false,saved=false,score=0,ringCount=0,lives=3,timeLeft=200,cp=2,cpOn=false,muted=false,ac=null,touchMode=false;
const keys={l:false,r:false,j:false,run:false};
const P={x:2,y:11.6,w:.7,h:1.4,vx:0,vy:0,on:false,face:1,coyote:0,buf:0,inv:0,shield:false,walk:0};

function buildLevel(){
  map=Array.from({length:H},()=>Array(W).fill(' '));gifts={};rings=[];enemyDefs=[];
  const set=(x,y,c)=>{if(x>=0&&x<W&&y>=0&&y<H)map[y][x]=c};
  const ground=(a,b)=>{for(let x=a;x<=b;x++)for(let y=13;y<H;y++)set(x,y,'#')};
  const gift=(x,y,w)=>{set(x,y,'G');gifts[x+','+y]=w};
  const block=(x,y,n=1)=>{for(let i=0;i<n;i++)set(x+i,y,'B')};
  const cloud=(x,y,n)=>{for(let i=0;i<n;i++)set(x+i,y,'=')};
  const ringLine=(x,y,n)=>{for(let i=0;i<n;i++)rings.push({x:x+i+.5,y:y+.5,got:false})};
  const pillar=(x,h)=>{for(let y=13-h;y<13;y++)set(x,y,'B')};
  const cork=x=>enemyDefs.push({type:'cork',x,y:12.2});
  const bird=(x,y)=>enemyDefs.push({type:'bird',x,y});
  ground(0,30);
  gift(9,9,'ring');block(12,9);gift(13,9,'flower');block(14,9);gift(15,9,'ring');block(16,9);gift(14,5,'ring');
  ringLine(19,10,3);cork(20);cork(28);pillar(24,1);pillar(25,2);pillar(26,3);ringLine(24,8,3);
  ground(34,60);cloud(37,10,4);cloud(43,7,4);ringLine(43,6,4);cork(40);cork(48);cork(54);
  block(50,9);gift(51,9,'ring');block(52,9);bird(57,9);
  ground(64,73);ground(76,104);
  for(let i=0;i<4;i++){pillar(70+i,i+1);pillar(79-i,i+1)}
  block(83,9);gift(84,9,'ring');block(85,9);gift(86,9,'ring');block(87,9);ringLine(83,6,5);cork(82);cork(89);cork(92);
  cloud(107,10,3);cloud(112,8,3);ringLine(112,7,3);bird(110,6);
  ground(117,142);gift(121,9,'flower');block(122,9,2);gift(124,9,'ring');
  pillar(129,2);pillar(136,3);ringLine(131,10,4);cork(126);cork(133);cork(139);
  cloud(144,10,3);ringLine(144,9,3);
  ground(149,W-1);
  for(let i=0;i<8;i++)pillar(158+i,i+1);pillar(166,8);ringLine(160,3,6);
  cork(152);cork(155);cork(170);cork(173);bird(151,8);
}
function spawnEnemies(){
  enemies=enemyDefs.map(d=>d.type==='cork'?{type:'cork',x:d.x,y:d.y,w:.8,h:.8,vx:0,vy:0,dir:-1,alive:true,active:false,squash:0}
    :{type:'bird',x0:d.x,y0:d.y,x:d.x,y:d.y,w:.9,h:.6,t:0,face:-1,alive:true,active:false,squash:0});
}
const tile=(x,y)=>x<0||x>=W?'#':y<0||y>=H?' ':map[y][x];
const solid=c=>c==='#'||c==='B'||c==='G'||c==='E';

function moveX(e,dx){
  e.x+=dx;const y0=Math.floor(e.y+.02),y1=Math.floor(e.y+e.h-.02);
  if(dx>0){const tx=Math.floor(e.x+e.w);for(let y=y0;y<=y1;y++)if(solid(tile(tx,y))){e.x=tx-e.w-.001;e.vx=0;return true}}
  else if(dx<0){const tx=Math.floor(e.x);for(let y=y0;y<=y1;y++)if(solid(tile(tx,y))){e.x=tx+1.001;e.vx=0;return true}}
  return false;
}
function moveY(e,dy){
  const prevB=e.y+e.h;e.y+=dy;e.on=false;
  const x0=Math.floor(e.x+.02),x1=Math.floor(e.x+e.w-.02);
  if(dy>0){const ty=Math.floor(e.y+e.h);for(let x=x0;x<=x1;x++){const c=tile(x,ty);if(solid(c)||(c==='='&&prevB<=ty+.001)){e.y=ty-e.h;e.vy=0;e.on=true;return}}}
  else if(dy<0){
    const ty=Math.floor(e.y);let hit=-1;
    for(let x=x0;x<=x1;x++)if(solid(tile(x,ty))&&(hit<0||Math.abs(x+.5-(e.x+e.w/2))<Math.abs(hit+.5-(e.x+e.w/2))))hit=x;
    if(hit>=0){e.y=ty+1;e.vy=0;if(e===P)headHit(hit,ty)}
  }
}
function headHit(x,y){
  const c=map[y][x];bumps.push({x,y,t:.2});tone(150,.08,'square',.05);
  for(const e of enemies)if(e.alive&&!e.squash&&e.type==='cork'&&Math.abs(e.x+e.w/2-x-.5)<.8&&Math.abs(e.y+e.h-y)<.2){e.squash=.4;add(100,e.x,e.y)}
  if(c!=='G')return;
  map[y][x]='E';const what=gifts[x+','+y];
  if(what==='flower'){items.push({x:x+.1,y:y,ty:y-.8,w:.8,h:.8});jingle([523,659,784],.06)}
  else{ringCount++;add(50);parts.push({k:'ring',x:x+.5,y:y-.2,vy:-9,t:.6});ringSfx();checkRings()}
}
function add(p,x,y){score+=p;if(x!==undefined)popups.push({x:x+.4,y,t:.9,txt:String(p)});hud()}
function checkRings(){if(ringCount>=50){ringCount-=50;lives++;jingle([784,988,1175],.1)}hud()}

function hurt(){
  if(P.inv>0||state!=='play')return;
  if(P.shield){P.shield=false;P.inv=1.6;jingle([660,440],.08);hud();return}
  die();
}
function die(){state='dying';stT=2.4;P.vy=-14;P.vx=0;jingle([523,440,349,262],.16,'sawtooth')}
function respawn(){
  P.x=cp;P.y=13-P.h;P.vx=P.vy=0;P.inv=0;P.shield=false;P.face=1;
  spawnEnemies();items=[];timeLeft=200;nameT=3;camX=Math.max(0,cp-viewW*.4);state='play';hud();
}

function update(dt){
  if(state==='paused')return;
  clock+=dt;
  for(const b of bumps)b.t-=dt;bumps=bumps.filter(b=>b.t>0);
  for(const p of parts){p.t-=dt;if(p.vy!==undefined){p.vy+=30*dt;p.y+=p.vy*dt}if(p.vx)p.x+=p.vx*dt}parts=parts.filter(p=>p.t>0);
  for(const p of popups)p.t-=dt;popups=popups.filter(p=>p.t>0);
  if(state==='title'||state==='over')return;
  if(state==='dying'){P.vy+=G*dt;P.y+=P.vy*dt;if((stT-=dt)<=0){lives--;hud();if(lives<=0)gameOver();else respawn()}return}
  if(state==='win'){winUpdate(dt);return}
  timeLeft-=dt;if(timeLeft<=0){timeLeft=0;hud();die();return}
  // joueur
  const run=keys.run||touchMode,max=run?9.5:6,dir=(keys.r?1:0)-(keys.l?1:0);
  if(dir){P.vx+=dir*(P.on?32:22)*dt;if(P.on&&Math.sign(P.vx)===-dir)P.vx+=dir*30*dt;P.face=dir}
  else if(P.on){const f=28*dt;P.vx=Math.abs(P.vx)<=f?0:P.vx-Math.sign(P.vx)*f}
  if(Math.abs(P.vx)>max)P.vx=Math.sign(P.vx)*Math.max(max,Math.abs(P.vx)-20*dt);
  P.coyote=P.on?.09:P.coyote-dt;P.buf-=dt;
  if(P.buf>0&&P.coyote>0){P.vy=-(17+Math.abs(P.vx)*.12);P.coyote=0;P.buf=0;P.on=false;tone(330,.12,'square',.04);tone(520,.1,'square',.03,.05)}
  P.vy=Math.min(P.vy+G*(P.vy<0&&!keys.j?2.3:1)*dt,20);
  moveX(P,P.vx*dt);moveY(P,P.vy*dt);
  if(P.x<camX)P.x=camX;
  if(P.on)P.walk+=Math.abs(P.vx)*dt*2.2;
  if(P.inv>0)P.inv-=dt;
  if(nameT>0)nameT-=dt;
  if(P.y>H+1){die();return}
  if(!cpOn&&P.x>CP_X){cpOn=true;cp=CP_X;jingle([659,784,1047],.08);popups.push({x:CP_X+.5,y:8.5,t:1.4,txt:'Point de reprise'})}
  const pcx=P.x+P.w/2;
  for(const r of rings)if(!r.got&&Math.abs(r.x-pcx)<.6&&r.y>P.y-.3&&r.y<P.y+P.h+.3){r.got=true;ringCount++;score+=20;ringSfx();checkRings()}
  for(const it of items){
    if(it.y>it.ty)it.y=Math.max(it.ty,it.y-dt*1.6);
    if(!it.got&&P.x<it.x+it.w&&P.x+P.w>it.x&&P.y<it.y+it.h&&P.y+P.h>it.y){it.got=true;P.shield=true;add(1000,it.x,it.y);jingle([523,659,784,1047],.07)}
  }
  items=items.filter(i=>!i.got);
  // ennemis
  for(const e of enemies){
    if(!e.alive)continue;
    if(!e.active){if(e.x<camX+viewW+1)e.active=true;else continue}
    if(e.squash>0){e.squash-=dt;if(e.squash<=0)e.alive=false;continue}
    if(e.type==='cork'){
      e.vy=Math.min(e.vy+G*dt,20);if(moveX(e,e.dir*2*dt))e.dir*=-1;moveY(e,e.vy*dt);if(e.y>H+1){e.alive=false;continue}
    }else{e.t+=dt;e.x=e.x0+Math.sin(e.t*.9)*3;e.y=e.y0+Math.sin(e.t*3)*.4;e.face=Math.cos(e.t*.9)>0?1:-1}
    if(P.x<e.x+e.w&&P.x+P.w>e.x&&P.y<e.y+e.h&&P.y+P.h>e.y){
      if(P.vy>0&&P.y+P.h-e.y<.6){e.squash=.4;P.vy=keys.j?-15:-10;add(100,e.x,e.y);tone(220,.08,'square',.06);tone(440,.08,'square',.05,.04)}
      else hurt();
    }
  }
  if(pcx>=DOOR){state='win';stT=0;winShown=false;P.vx=0;jingle([523,659,784,1047,784,1047],.14)}
  const target=P.x-viewW*.4;camX+=(target-camX)*Math.min(1,dt*8);camX=Math.max(0,Math.min(W-viewW,camX));
  hud();
}
function winUpdate(dt){
  stT+=dt;P.vx=0;P.vy=Math.min(P.vy+G*dt,20);moveY(P,P.vy*dt);P.face=1;
  if(Math.random()<dt*8)parts.push({k:'heart',x:DOOR+Math.random()*2-.5,y:11,vy:-2-Math.random()*2,vx:(Math.random()-.5),t:1.6});
  if(timeLeft>0){const d=Math.min(timeLeft,dt*60);timeLeft-=d;score+=d*10;if(Math.random()<.5)tone(880,.03,'triangle',.03)}
  hud();
  if(timeLeft<=0&&stT>3.5&&!winShown){winShown=true;won=true;endRun('Vous pouvez embrasser la mariée !',`__PRENOM_MARIE__ a rejoint __PRENOM_MARIEE__ à l'église à temps. Score final : ${Math.floor(score)}.`)}
}

/* ---------- dessin ---------- */
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function circ(x,y,r,col){ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle=col;ctx.fill()}
function label(txt,x,y,size,col,sc){
  ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.font=`700 ${size*T}px Fredoka,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.lineJoin='round';ctx.lineWidth=T*.2;ctx.strokeStyle=sc||'#2b0e22';const px=(x-camX)*T,py=y*T;ctx.strokeText(txt,px,py);ctx.fillStyle=col;ctx.fillText(txt,px,py);ctx.restore();
}
function hills(par,base,amp,col,freq){
  ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(0,H);
  for(let sx=0;sx<=viewW+.5;sx+=.25){const wx=sx+camX*par;ctx.lineTo(sx,base-Math.sin(wx*freq)*amp-Math.sin(wx*freq*2.7+1)*amp*.4)}
  ctx.lineTo(viewW+.5,H);ctx.fill();
}
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#8fcfee');g.addColorStop(.7,'#d9eef7');g.addColorStop(1,'#fde6ee');
  ctx.fillStyle=g;ctx.fillRect(0,0,viewW+1,H);
  circ(viewW*.8,2.6,1.3,'#fff6d6');
  hills(.15,10.5,1.4,'#b8dcb6',.18);hills(.35,11.8,1,'#93c98f',.3);
  // guirlandes de fanions
  const par=.6,cols=['#f3a6bd','#ffffff','#e0b354'];
  for(let k=Math.floor(camX*par/14)-1;k<Math.floor((camX*par+viewW)/14)+2;k++){
    const x0=k*14-camX*par+2,x1=x0+9;
    ctx.strokeStyle='#ffffffaa';ctx.lineWidth=.04;ctx.beginPath();ctx.moveTo(x0,1.3);ctx.quadraticCurveTo((x0+x1)/2,3.1,x1,1.3);ctx.stroke();
    for(let i=1;i<9;i++){const u=i/9,x=x0+(x1-x0)*u,y=1.3+(1-(2*u-1)**2)*.9;ctx.fillStyle=cols[i%3];ctx.beginPath();ctx.moveTo(x-.22,y);ctx.lineTo(x+.22,y);ctx.lineTo(x,y+.5);ctx.fill()}
  }
}
function drawChurch(){
  // clocher
  ctx.fillStyle='#e9e1d3';ctx.fillRect(183.4,3.4,3.2,9.6);
  ctx.fillStyle='#5b6b86';ctx.beginPath();ctx.moveTo(183.1,3.5);ctx.lineTo(185,.9);ctx.lineTo(186.9,3.5);ctx.fill();
  ctx.fillStyle='#e0b354';ctx.fillRect(184.94,.02,.12,.95);ctx.fillRect(184.74,.28,.52,.12);
  ctx.fillStyle='#4a3a4a';ctx.beginPath();ctx.moveTo(184.4,6.2);ctx.lineTo(184.4,4.9);ctx.arc(185,4.9,.6,Math.PI,0);ctx.lineTo(185.6,6.2);ctx.fill();
  const ring=state==='win';
  ctx.save();ctx.translate(185,4.55);ctx.rotate(Math.sin(clock*(ring?7:1.5))*(ring?.55:.06));
  ctx.fillStyle='#e0b354';ctx.beginPath();ctx.moveTo(-.12,.15);ctx.quadraticCurveTo(-.16,.7,-.4,.95);ctx.lineTo(.4,.95);ctx.quadraticCurveTo(.16,.7,.12,.15);ctx.closePath();ctx.fill();circ(0,1,.09,'#b88a2a');ctx.restore();
  ctx.fillStyle='#8fb3d9';ctx.fillRect(184.7,8.2,.6,1.4);
  // nef et façade à pignon
  ctx.fillStyle='#efe7d9';ctx.fillRect(176.5,7.6,7,5.4);
  ctx.beginPath();ctx.moveTo(176.2,7.7);ctx.lineTo(180,4.4);ctx.lineTo(183.8,7.7);ctx.fill();
  ctx.strokeStyle='#5b6b86';ctx.lineWidth=.22;ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(176.1,7.8);ctx.lineTo(180,4.35);ctx.lineTo(183.9,7.8);ctx.stroke();
  ctx.strokeStyle='#d8ccb8';ctx.lineWidth=.03;ctx.beginPath();
  for(let y=8.4;y<13;y+=.6){ctx.moveTo(176.5,y);ctx.lineTo(183.5,y)}ctx.stroke();
  // rosace
  circ(180,6.4,.62,'#ffffff');
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;circ(180+Math.cos(a)*.33,6.4+Math.sin(a)*.33,.15,i%2?'#f3a6bd':'#8fb3d9')}
  circ(180,6.4,.12,'#e0b354');
  // vitraux
  for(const x of[177.3,182.1]){ctx.fillStyle='#ffffff';ctx.beginPath();ctx.moveTo(x-.08,10.6);ctx.lineTo(x-.08,8.9);ctx.arc(x+.3,8.9,.38,Math.PI,0);ctx.lineTo(x+.68,10.6);ctx.fill();
    const g=ctx.createLinearGradient(0,8.5,0,10.5);g.addColorStop(0,'#f3a6bd');g.addColorStop(.5,'#8fb3d9');g.addColorStop(1,'#e0b354');ctx.fillStyle=g;
    ctx.beginPath();ctx.moveTo(x,10.5);ctx.lineTo(x,8.9);ctx.arc(x+.3,8.9,.3,Math.PI,0);ctx.lineTo(x+.6,10.5);ctx.fill()}
  // porte
  ctx.fillStyle='#7a3b2a';ctx.beginPath();ctx.moveTo(179.1,13);ctx.lineTo(179.1,10.9);ctx.arc(180,10.9,.9,Math.PI,0);ctx.lineTo(180.9,13);ctx.fill();
  ctx.strokeStyle='#5e2c1f';ctx.lineWidth=.04;ctx.beginPath();ctx.moveTo(180,10);ctx.lineTo(180,13);ctx.stroke();
  ctx.fillStyle='#d9c8ae';ctx.fillRect(178.5,12.72,3,.28);
  ctx.strokeStyle='#f3a6bd';ctx.lineWidth=.14;ctx.beginPath();ctx.arc(180,10.9,1.15,Math.PI,0);ctx.stroke();
  for(let i=0;i<=6;i++){const a=Math.PI+i/6*Math.PI;circ(180+Math.cos(a)*1.15,10.9+Math.sin(a)*1.15,.11,i%2?'#ffffff':'#ff7aa2')}
}
function drawArch(){
  ctx.strokeStyle='#e9dccb';ctx.lineWidth=.14;ctx.beginPath();ctx.moveTo(96.4,13);ctx.lineTo(96.4,10.6);ctx.arc(98,10.6,1.6,Math.PI,0);ctx.lineTo(99.6,13);ctx.stroke();
  for(let i=0;i<=10;i++){const a=Math.PI+i/10*Math.PI;circ(98+Math.cos(a)*1.6,10.6+Math.sin(a)*1.6,.2,cpOn?(i%2?'#ff7aa2':'#ffffff'):'#c9c2bd')}
}
function drawTiles(){
  const x0=Math.max(0,Math.floor(camX)),x1=Math.min(W-1,Math.ceil(camX+viewW));
  for(let y=0;y<H;y++)for(let x=x0;x<=x1;x++){
    const c=map[y][x];if(c===' ')continue;
    const b=bumps.find(b=>b.x===x&&b.y===y),oy=b?-Math.sin((1-b.t/.2)*Math.PI)*.3:0,yy=y+oy;
    if(c==='#'){
      ctx.fillStyle='#d27a62';ctx.fillRect(x,y,1.01,1.01);
      ctx.strokeStyle='#b4604b';ctx.lineWidth=.04;ctx.beginPath();ctx.moveTo(x,y+.5);ctx.lineTo(x+1,y+.5);
      const o=y%2?.5:0;ctx.moveTo(x+o+.25,y);ctx.lineTo(x+o+.25,y+.5);ctx.moveTo(x+(o?0:.5)+.25,y+.5);ctx.lineTo(x+(o?0:.5)+.25,y+1);ctx.stroke();
      if(tile(x,y-1)!=='#'){ctx.fillStyle='#7cc06a';ctx.fillRect(x,y,1.01,.24);ctx.fillStyle='#5ea54d';ctx.fillRect(x,y+.2,1.01,.06)}
    }else if(c==='B'){
      rr(x+.03,yy+.03,.94,.94,.1);ctx.fillStyle='#e08b6f';ctx.fill();ctx.strokeStyle='#a9523e';ctx.lineWidth=.06;ctx.stroke();
      ctx.fillStyle='#f2b49e';ctx.fillRect(x+.14,yy+.12,.5,.08);
    }else if(c==='G'){
      rr(x+.04,yy+.06,.92,.9,.1);ctx.fillStyle='#fffaf6';ctx.fill();ctx.strokeStyle='#e7c9cf';ctx.lineWidth=.05;ctx.stroke();
      ctx.fillStyle='#ff7aa2';ctx.fillRect(x+.42,yy+.06,.16,.9);ctx.fillRect(x+.04,yy+.43,.92,.16);
      ctx.beginPath();ctx.ellipse(x+.36,yy+.08,.14,.09,-.5,0,7);ctx.ellipse(x+.64,yy+.08,.14,.09,.5,0,7);ctx.fill();
      const s=(Math.sin(clock*3+x)+1)/2;ctx.fillStyle=`rgba(255,255,255,${s*.8})`;ctx.fillRect(x+.14,yy+.16,.12,.12);
    }else if(c==='E'){
      rr(x+.04,yy+.06,.92,.9,.1);ctx.fillStyle='#d9c6b0';ctx.fill();ctx.strokeStyle='#a8927b';ctx.lineWidth=.05;ctx.stroke();
    }else if(c==='='){
      ctx.fillStyle='#ffe1ea';for(const u of[.25,.75]){ctx.beginPath();ctx.arc(x+u,y+.4,.25,0,Math.PI);ctx.fill()}
      ctx.fillStyle='#ffffff';rr(x-.02,y,1.04,.44,.18);ctx.fill();
      circ(x+.5,y+.02,.22,'#ffffff');
    }
  }
}
function drawRing(x,y,s=1){
  const k=Math.abs(Math.cos(clock*4+x))*.8+.2;ctx.save();ctx.translate(x,y);ctx.scale(k*s,s);
  ctx.strokeStyle='#e0b354';ctx.lineWidth=.09;ctx.beginPath();ctx.arc(0,.04,.2,0,7);ctx.stroke();
  ctx.fillStyle='#eaf6ff';ctx.beginPath();ctx.moveTo(0,-.32);ctx.lineTo(.1,-.2);ctx.lineTo(0,-.12);ctx.lineTo(-.1,-.2);ctx.fill();ctx.restore();
}
function drawFlower(x,y){
  ctx.strokeStyle='#4f8a4a';ctx.lineWidth=.07;ctx.beginPath();ctx.moveTo(x+.4,y+.4);ctx.lineTo(x+.4,y+.8);ctx.stroke();
  for(let i=0;i<5;i++){const a=i/5*Math.PI*2+clock;circ(x+.4+Math.cos(a)*.17,y+.32+Math.sin(a)*.17,.13,'#ff7aa2')}
  circ(x+.4,y+.32,.1,'#ffd36b');
}
function drawCork(e){
  ctx.save();ctx.translate(e.x+e.w/2,e.y+e.h);if(e.squash>0)ctx.scale(1.25,.35);
  const st=Math.sin(clock*12+e.x)*.07;
  circ(-.2+st,-.05,.1,'#5a2a1a');circ(.2-st,-.05,.1,'#5a2a1a');
  rr(-.27,-.6,.54,.52,.08);ctx.fillStyle='#c9a36b';ctx.fill();
  ctx.fillStyle='#e6c690';ctx.beginPath();ctx.ellipse(0,-.62,.37,.17,0,0,7);ctx.fill();
  ctx.strokeStyle='#bfc4cc';ctx.lineWidth=.035;ctx.beginPath();ctx.moveTo(-.27,-.5);ctx.lineTo(.27,-.18);ctx.moveTo(.27,-.5);ctx.lineTo(-.27,-.18);ctx.stroke();
  circ(-.1,-.38,.075,'#fff');circ(.1,-.38,.075,'#fff');circ(-.09+e.dir*.02,-.37,.035,'#2b0e22');circ(.11+e.dir*.02,-.37,.035,'#2b0e22');
  ctx.strokeStyle='#2b0e22';ctx.lineWidth=.04;ctx.beginPath();ctx.moveTo(-.2,-.5);ctx.lineTo(-.04,-.45);ctx.moveTo(.2,-.5);ctx.lineTo(.04,-.45);ctx.stroke();
  ctx.restore();
}
function drawBird(e){
  ctx.save();ctx.translate(e.x+e.w/2,e.y+e.h/2);ctx.scale(e.face,e.squash>0?.4:1);
  ctx.fillStyle='#9aa3ad';ctx.beginPath();ctx.ellipse(0,0,.42,.24,0,0,7);ctx.fill();
  circ(.32,-.14,.16,'#7d8692');ctx.fillStyle='#6fbf9a';ctx.fillRect(.18,-.06,.16,.08);
  ctx.fillStyle='#f0a043';ctx.beginPath();ctx.moveTo(.46,-.16);ctx.lineTo(.6,-.11);ctx.lineTo(.46,-.07);ctx.fill();
  circ(.36,-.17,.035,'#fff');
  ctx.fillStyle='#7d8692';ctx.save();ctx.rotate(Math.sin(clock*16)*.6);ctx.beginPath();ctx.ellipse(-.05,-.18,.28,.1,-.3,0,7);ctx.fill();ctx.restore();
  ctx.restore();
}
function drawGroom(cx,cy,face,walk,air,shield){
  ctx.save();ctx.translate(cx,cy);ctx.scale(face*1.15,1.15);
  const a=air?.45:Math.sin(walk)*.45;
  for(const s of[-1,1]){ctx.save();ctx.translate(s*.06,.2);ctx.rotate(s*a);ctx.fillStyle='#14121c';ctx.fillRect(-.055,0,.11,.21);ctx.fillStyle='#000';ctx.fillRect(-.055,.17,.17,.06);ctx.restore()}
  rr(-.25,-.13,.5,.4,.12);ctx.fillStyle='#1f1c2c';ctx.fill();
  ctx.beginPath();ctx.moveTo(-.09,-.13);ctx.lineTo(.09,-.13);ctx.lineTo(0,.12);ctx.fillStyle='#fff';ctx.fill();
  ctx.fillStyle='#c2185b';ctx.beginPath();ctx.moveTo(0,-.09);ctx.lineTo(-.1,-.14);ctx.lineTo(-.1,-.04);ctx.lineTo(.1,-.14);ctx.lineTo(.1,-.04);ctx.closePath();ctx.fill();
  ctx.save();ctx.translate(0,-.02);ctx.rotate(air?-1.2:Math.sin(walk)*.5);ctx.fillStyle='#2a2638';ctx.fillRect(-.05,0,.1,.24);circ(0,.26,.05,'#f3c9a3');ctx.restore();
  if(shield){circ(.15,-.03,.1,'#ff7aa2');circ(.15,-.03,.04,'#ffd36b')}
  circ(0,-.31,.19,'#f3c9a3');
  ctx.fillStyle='#111';ctx.fillRect(-.21,-.48,.42,.06);ctx.fillRect(-.13,-.76,.26,.3);ctx.fillStyle='#c2185b';ctx.fillRect(-.13,-.54,.26,.05);
  circ(.09,-.32,.035,'#1c0816');
  ctx.strokeStyle='#1c0816';ctx.lineWidth=.03;ctx.beginPath();ctx.arc(.06,-.25,.06,.3,1.6);ctx.stroke();
  ctx.restore();
}
function drawBride(cx,cy){
  ctx.save();ctx.translate(cx,cy);ctx.scale(-1.15,1.15);
  ctx.fillStyle='rgba(255,255,255,.6)';ctx.beginPath();ctx.moveTo(-.02,-.48);ctx.quadraticCurveTo(-.44,-.3,-.36+Math.sin(clock*3)*.04,.26);ctx.lineTo(-.12,.06);ctx.quadraticCurveTo(-.2,-.25,-.02,-.48);ctx.fill();
  ctx.beginPath();ctx.moveTo(-.1,-.1);ctx.lineTo(.1,-.1);ctx.quadraticCurveTo(.16,.15,.34,.4);
  for(let i=0;i<4;i++){const x0=.34-i*.17;ctx.quadraticCurveTo(x0-.085,.5,x0-.17,.4)}
  ctx.quadraticCurveTo(-.16,.15,-.1,-.1);ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#f3c6cf';ctx.lineWidth=.035;ctx.stroke();
  rr(-.11,-.21,.22,.15,.05);ctx.fillStyle='#fff';ctx.fill();
  circ(.2,-.02,.07,'#ff7aa2');circ(.26,-.07,.05,'#ffd1de');circ(.15,-.08,.045,'#fff');
  circ(0,-.34,.17,'#f6d2b5');ctx.fillStyle='#6b3b22';ctx.beginPath();ctx.arc(0,-.36,.178,Math.PI,0);ctx.fill();circ(-.13,-.43,.07,'#6b3b22');
  ctx.fillStyle='#e0b354';ctx.beginPath();ctx.moveTo(-.08,-.5);ctx.lineTo(-.04,-.58);ctx.lineTo(0,-.52);ctx.lineTo(.04,-.6);ctx.lineTo(.08,-.5);ctx.fill();
  circ(.08,-.34,.03,'#2a0f1f');
  ctx.strokeStyle='#2a0f1f';ctx.lineWidth=.03;ctx.beginPath();
  if(state==='win'){ctx.arc(.06,-.27,.05,0,Math.PI);ctx.stroke()}
  else{ctx.moveTo(.02,-.42);ctx.lineTo(.13,-.39);ctx.moveTo(.03,-.25);ctx.lineTo(.12,-.25);ctx.stroke()}
  ctx.restore();
}
function heart(x,y,s,col){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(0,.3);ctx.bezierCurveTo(-.5,-.05,-.25,-.45,0,-.15);ctx.bezierCurveTo(.25,-.45,.5,-.05,0,.3);ctx.fill();ctx.restore()}
function draw(){
  ctx.setTransform(dpr*T,0,0,dpr*T,0,0);
  drawBackground();
  ctx.save();ctx.translate(-camX,0);
  drawChurch();drawArch();drawTiles();
  for(const r of rings)if(!r.got&&r.x>camX-1&&r.x<camX+viewW+1)drawRing(r.x,r.y);
  for(const it of items)drawFlower(it.x,it.y);
  for(const e of enemies)if(e.alive&&e.active)(e.type==='cork'?drawCork:drawBird)(e);
  drawBride(DOOR+1.6,13-.49);
  if(DOOR+1.6>camX-1&&DOOR+1.6<camX+viewW+1)label('__PRENOM_MARIEE__',DOOR+1.6,10.55,.42,'#ffffff');
  const blink=P.inv>0&&((clock*14)|0)%2;
  if(!blink&&state!=='title')drawGroom(P.x+P.w/2,P.y+P.h-.49,P.face,P.walk,!P.on&&state!=='win',P.shield);
  if((nameT>0&&state==='play')||state==='title'||state==='win')label('__PRENOM_MARIE__',P.x+P.w/2,P.y-.45,.42,'#ffffff');
  for(const p of parts){if(p.k==='ring')drawRing(p.x,p.y,1.1);else heart(p.x,p.y,.7,'#ff7aa2')}
  ctx.restore();
  for(const p of popups)label(p.txt,p.x,p.y-(1-p.t)*1.2,.5,'#ffd36b');
  if(state==='dying'&&stT<2)label(timeLeft<=0?'Trop tard !':'Aïe !',camX+viewW/2,6,.9,'#f3c6cf');
  if(state==='title'){ctx.save();ctx.translate(-camX,0);drawGroom(P.x+P.w/2,P.y+P.h-.49,1,0,false,false);ctx.restore()}
}

/* ---------- interface ---------- */
const HAT='<svg viewBox="0 0 20 20" width="24" height="24" aria-hidden="true"><rect x="5" y="2" width="10" height="11" rx="1" fill="#f3c6cf"/><rect x="5" y="9.5" width="10" height="2" fill="#c2185b"/><rect x="2" y="13" width="16" height="3" rx="1.5" fill="#f3c6cf"/></svg>';
let lastHud='';
function hud(){
  const t=Math.ceil(timeLeft),s=`${Math.floor(score)}|${ringCount}|${t}|${lives}`;if(s===lastHud)return;lastHud=s;
  $('score').textContent=Math.floor(score);$('rings').textContent=ringCount;$('time').textContent=t;$('time').classList.toggle('late',t<=30);
  $('lives').innerHTML=HAT.repeat(Math.max(0,lives));
}
function showOv(t,p,b,form){
  $('ovt').textContent=t;$('ovp').textContent=p;$('go').textContent=b;$('saveMsg').textContent='';
  $('saveForm').hidden=!form;$('go').classList.toggle('ghost',!!form);$('ov').hidden=false;
  if(form){$('pseudo').value=readPseudo();setTimeout(()=>{try{$('pseudo').focus()}catch(e){}},50)}
}
function endRun(t,p){saved=false;showOv(t,p,'Rejouer',Math.floor(score)>0)}
function startGame(){
  if(!ac){try{ac=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  if(ac&&ac.state==='suspended')ac.resume();
  buildLevel();score=0;ringCount=0;lives=3;cp=2;cpOn=false;won=false;saved=false;parts=[];popups=[];respawn();camX=0;$('ov').hidden=true;$('saveForm').hidden=true;
}
function gameOver(){state='over';won=false;endRun('Mariage reporté…',`__PRENOM_MARIE__ n'est pas arrivé à l'église. Score : ${Math.floor(score)}. __PRENOM_MARIEE__ lui accorde une seconde chance.`)}
function togglePause(){
  if(state==='paused'){state=prev;$('ov').hidden=true;$('pause').textContent='Pause'}
  else if(state==='play'||state==='dying'||(state==='win'&&!winShown)){prev=state;state='paused';$('pause').textContent='Reprendre';showOv('Pause','Le temps pour __PRENOM_MARIE__ de renouer sa cravate.','Reprendre')}
}
function tone(f,d,type,v,when){
  if(!ac||muted)return;const t=ac.currentTime+(when||0),o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'square';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(v||.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(ac.destination);o.start(t);o.stop(t+d+.02);
}
const jingle=(fs,step,type)=>fs.forEach((f,i)=>tone(f,step*1.6,type||'triangle',.06,i*step));
const ringSfx=()=>{tone(988,.06,'square',.04);tone(1319,.12,'square',.04,.06)};

const MAPK={ArrowLeft:'l',q:'l',a:'l',ArrowRight:'r',d:'r',' ':'j',ArrowUp:'j',z:'j',w:'j',Shift:'run',x:'run'};
addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='INPUT')return;
  const k=e.key.length===1?e.key.toLowerCase():e.key,m=MAPK[k];
  if(m){if(k===' '||k.startsWith('Arrow'))e.preventDefault();if(m==='j'&&!keys.j)P.buf=.13;keys[m]=true;touchMode=false;
    if(k===' '&&(state==='title'||state==='over'||(state==='win'&&winShown))&&document.activeElement!==$('go'))startGame();return}
  if(k==='p'||k==='Escape')togglePause();
  else if(k==='Enter'&&(state==='title'||state==='over'||(state==='win'&&winShown))&&document.activeElement!==$('go'))startGame();
});
addEventListener('keyup',e=>{if(e.target&&e.target.tagName==='INPUT')return;const k=e.key.length===1?e.key.toLowerCase():e.key,m=MAPK[k];if(m)keys[m]=false});
addEventListener('blur',()=>{keys.l=keys.r=keys.j=keys.run=false});
$('go').addEventListener('click',()=>state==='paused'?togglePause():startGame());
$('pause').addEventListener('click',togglePause);
$('mute').addEventListener('click',()=>{muted=!muted;$('mute').textContent=muted?'Son : non':'Son : oui'});
for(const b of document.querySelectorAll('.pad button')){
  const k=b.dataset.k;
  b.addEventListener('pointerdown',e=>{e.preventDefault();try{b.setPointerCapture(e.pointerId)}catch(_){}touchMode=true;if(k==='j'&&!keys.j)P.buf=.13;keys[k]=true});
  for(const ev of['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>{keys[k]=false});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state!=='paused')togglePause()});

/* ---------- tableau d'honneur ---------- */
const API='api/scores',LS_SCORES='jeu-retard-scores',LS_NAME='jeu-retard-pseudo';
let board=[],online=false,lastEntry=null;
function readPseudo(){try{return localStorage.getItem(LS_NAME)||''}catch(e){return''}}
function readLocal(){try{const a=JSON.parse(localStorage.getItem(LS_SCORES)||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}}
function writeLocal(a){try{localStorage.setItem(LS_SCORES,JSON.stringify(a))}catch(e){}}
const sortBoard=a=>a.filter(x=>x&&typeof x.name==='string'&&Number.isFinite(x.score)).sort((a,b)=>b.score-a.score||a.t-b.t);
async function loadBoard(){
  try{const r=await fetch(API,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw 0;const j=await r.json();if(!Array.isArray(j))throw 0;online=true;board=sortBoard(j)}
  catch(e){online=false;board=sortBoard(readLocal())}
  renderBoard();
}
function renderBoard(){
  $('boardNote').textContent=online?'Classement partagé entre tous les invités.':'Scores enregistrés sur cet appareil.';
  const ol=$('boardList');ol.textContent='';
  if(!board.length){const li=document.createElement('li');li.className='empty';li.textContent="Aucun score pour l'instant. À toi d'aider __PRENOM_MARIE__ !";ol.append(li);return}
  board.slice(0,10).forEach((e,i)=>{
    const li=document.createElement('li');if(lastEntry&&e.t===lastEntry.t&&e.name===lastEntry.name)li.className='me';
    const c=(cls,txt)=>{const sp=document.createElement('span');sp.className=cls;sp.textContent=txt;li.append(sp)};
    c('rk',(i+1)+(i?'e':'er'));c('nm',e.name);c('st',e.won?"À l'heure":'En retard');c('sc',Math.floor(e.score).toLocaleString('fr-FR'));
    ol.append(li);
  });
}
async function saveScore(name){
  const entry={name,score:Math.floor(score),won,t:Date.now()};
  if(online){
    try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
      if(r.ok){const j=await r.json();board=sortBoard(j);const m=board.find(e=>e.name===entry.name&&e.score===entry.score&&Math.abs(e.t-entry.t)<60000);lastEntry=m||entry;renderBoard();return rankOf(lastEntry)}
      if(r.status===429)return -2;
    }catch(e){}
  }
  const l=sortBoard(readLocal().concat(entry)).slice(0,100);writeLocal(l);if(!online)board=l;lastEntry=entry;renderBoard();return online?-1:rankOf(entry);
}
const rankOf=e=>board.findIndex(x=>x===e||(x.t===e.t&&x.name===e.name))+1;
$('saveForm').addEventListener('submit',async ev=>{
  ev.preventDefault();if(saved)return;
  const name=$('pseudo').value.replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,20);if(!name){$('pseudo').focus();return}
  try{localStorage.setItem(LS_NAME,name)}catch(e){}
  saved=true;$('saveForm').hidden=true;$('saveMsg').textContent='Enregistrement…';
  const rk=await saveScore(name);
  try{if(window.parent!==window)parent.postMessage({jeu:'score'},'*')}catch(e){}
  $('saveMsg').textContent=rk>0?`Score enregistré, ${name} : ${rk===1?'1re':rk+'e'} place !`:rk===-2?'Doucement ! Réessaie dans quelques secondes.':rk===-1?'Le classement partagé ne répond pas : score gardé sur cet appareil.':'Score enregistré.';
  if(rk===-2){saved=false;$('saveForm').hidden=false}
  $('go').focus();
});
loadBoard();

function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;
  dpr=Math.min(2,window.devicePixelRatio||1);T=h/H;viewW=w/T;
  cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);
}
const stageObserver=new ResizeObserver(resize);stageObserver.observe(stage);
buildLevel();spawnEnemies();resize();hud();
let last=0;
function frame(ts){const dt=Math.min(.033,(ts-last)/1000||0);last=ts;update(dt);draw();requestAnimationFrame(frame)}
requestAnimationFrame(frame);
if(document.documentElement.classList.contains('embed')&&window.parent!==window){
  const tell=()=>{try{parent.postMessage({jeu:'hauteur',h:Math.ceil(document.body.getBoundingClientRect().height)},'*')}catch(e){}};
  const embedObserver=new ResizeObserver(tell);embedObserver.observe(document.body);tell();
}
}
