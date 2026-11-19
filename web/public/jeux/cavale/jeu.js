{
const MAP=[
"###################",
"#........#........#",
"#o##.###.#.###.##o#",
"#.................#",
"#.##.#.#####.#.##.#",
"#....#...#...#....#",
"####.### # ###.####",
"####.#       #.####",
"####.# ##-## #.####",
"    .  #   #  .    ",
"####.# ##### #.####",
"####.#       #.####",
"####.# ##### #.####",
"#........#........#",
"#.##.###.#.###.##.#",
"#o.#.....G.....#.o#",
"##.#.#.#####.#.#.##",
"#....#...#...#....#",
"#.######.#.######.#",
"#.................#",
"###################"];
const COLS=19,ROWS=21,DIRS=[[1,0],[0,1],[-1,0],[0,-1]],PHASES=[7,20,7,20,5,20,5,1e9];
const $=id=>document.getElementById(id);
const cv=$('cv'),ctx=cv.getContext('2d'),stage=$('stage'),wallCv=document.createElement('canvas');
const CHARS=[
 {dress:'#ffffff',trim:'#f3c6cf',hair:'#6b3b22',acc:'veil',start:[9,7],corner:[18,-3],delay:0,intro:''},
 {dress:'#8e5bd6',trim:'#d9c2ff',hair:'#cfcfd6',acc:'hat',start:[8,9],corner:[0,-3],delay:3,intro:"La belle-mère s'en mêle !"},
 {dress:'#ff8fb1',trim:'#ffd1de',hair:'#e0a53a',acc:'crown',start:[10,9],corner:[0,24],delay:7,intro:"La demoiselle d'honneur aussi !"}];
let saved=false,T=24,dpr=1,grid=[],dots=0,score=0,best=0,lives=3,level=1,state='title',prev='play',stT=0,want=-1;
let fright=0,combo=0,phaseI=0,phaseT=0,clock=0,popups=[],muted=false,ac=null,groom,ghosts=[],readyMsg='';
try{best=+localStorage.getItem('marie-cavale-best')||0}catch(e){}

const wrap=x=>(x+COLS)%COLS;
const cell=(x,y)=>y<0||y>=ROWS?'#':grid[y][wrap(x)];
function blocked(e,d){const c=cell(e.x+DIRS[d][0],e.y+DIRS[d][1]);if(c==='#')return true;if(c==='-')return!(e.ghost&&(e.mode==='home'||e.mode==='leaving'));return false}
function pos(e){const d=e.d>=0?DIRS[e.d]:[0,0];let y=e.y+d[1]*e.p+.5;if(e.mode==='house')y+=Math.sin(clock*5+e.x)*.12;return[e.x+d[0]*e.p+.5,y]}

function newLevel(){grid=MAP.map(r=>r.replace('G',' ').split(''));dots=0;for(const r of grid)for(const c of r)if(c==='.'||c==='o')dots++;placeActors();buildWalls()}
function placeActors(){
  groom={x:9,y:15,d:-1,p:0,face:1};want=-1;
  ghosts=CHARS.slice(0,Math.min(level,3)).map((c,i)=>({ghost:true,c,x:c.start[0],y:c.start[1],d:i?-1:3,p:0,mode:i?'house':'active',wait:c.delay+.5,face:-1}));
  fright=0;combo=0;phaseI=0;phaseT=0;
}
function speed(e){
  if(!e.ghost)return fright>0?7.9:7.2;
  if(e.mode==='home')return 13;if(e.mode==='leaving')return 4;if(e.mode==='fright')return 3.6;
  return Math.min(5.9+.35*(level-1),7.6)+(e.c===CHARS[0]?.2:0);
}
function target(g){
  if(g.mode==='home')return[9,9];if(g.mode==='leaving')return[9,7];
  const i=CHARS.indexOf(g.c),scatter=phaseI%2===0;
  if(scatter&&!(i===0&&dots<40))return g.c.corner;
  if(i===0)return[groom.x,groom.y];
  if(i===1){const d=groom.d>=0?DIRS[groom.d]:[0,0];return[groom.x+d[0]*4,groom.y+d[1]*4]}
  const dx=g.x-groom.x,dy=g.y-groom.y;return dx*dx+dy*dy>64?[groom.x,groom.y]:g.c.corner;
}
function choose(g){
  const opts=[];
  for(const d of[3,2,1,0]){if(g.d>=0&&d===(g.d+2)%4)continue;if(!blocked(g,d))opts.push(d)}
  if(!opts.length){if(g.d<0)return-1;const r=(g.d+2)%4;return blocked(g,r)?-1:r}
  if(g.mode==='fright')return opts[Math.random()*opts.length|0];
  const[tx,ty]=target(g);let bestD=opts[0],bd=1e9;
  for(const d of opts){const nx=g.x+DIRS[d][0]-tx,ny=g.y+DIRS[d][1]-ty,v=nx*nx+ny*ny;if(v<bd){bd=v;bestD=d}}
  return bestD;
}
function reverse(e){if(e.d<0)return;if(e.p>0){e.x=wrap(e.x+DIRS[e.d][0]);e.y+=DIRS[e.d][1];e.p=1-e.p}e.d=(e.d+2)%4}
function advance(e,s){e.p+=s;if(e.p>=1-1e-9){e.x=wrap(e.x+DIRS[e.d][0]);e.y+=DIRS[e.d][1];e.p=0}}

function moveGroom(dt){
  const g=groom;
  if(want>=0&&g.d>=0&&g.p>0&&want===(g.d+2)%4)reverse(g);
  let m=speed(g)*dt,n=0;
  while(m>1e-9&&n++<8){
    if(g.p===0){
      eat(g.x,g.y);if(state!=='play')return;
      if(want>=0&&!blocked(g,want))g.d=want;
      if(g.d<0||blocked(g,g.d)){g.d=-1;return}
    }
    const s=Math.min(m,1-g.p);advance(g,s);m-=s;
  }
}
function moveGhost(g,dt){
  if(g.mode==='house'){g.wait-=dt;if(g.wait<=0){g.mode='leaving';g.d=-1;g.p=0}return}
  let m=speed(g)*dt,n=0;
  while(m>1e-9&&n++<8){
    if(g.p===0){
      if(g.mode==='leaving'&&g.x===9&&g.y===7){g.mode='active';g.d=3}
      if(g.mode==='home'&&g.x===9&&g.y===9){g.mode='house';g.wait=1;g.d=-1;return}
      g.d=choose(g);if(g.d<0)return;
    }
    const s=Math.min(m,1-g.p);advance(g,s);m-=s;
  }
}
function eat(x,y){
  const c=grid[y][x];
  if(c==='.'){grid[y][x]=' ';dots--;add(10);blip()}
  else if(c==='o'){grid[y][x]=' ';dots--;add(50);startFright()}
  if(dots===0&&state==='play'){state='levelup';stT=2.2;jingle([523,659,784,1047],.12)}
}
function startFright(){
  fright=Math.max(3,7.6-level*.6);combo=0;
  for(const g of ghosts)if(g.mode==='active'){g.mode='fright';reverse(g)}
  jingle([392,523,659],.07);
}
function add(p){const b=score;score+=p;if(b<10000&&score>=10000){lives++;jingle([880,1175],.1)}hud()}
function collide(){
  const[px,py]=pos(groom);
  for(const g of ghosts){
    if(g.mode==='house'||g.mode==='home')continue;
    const[gx,gy]=pos(g);let dx=Math.abs(gx-px);dx=Math.min(dx,COLS-dx);const dy=gy-py;
    if(dx*dx+dy*dy<.42){
      if(g.mode==='fright'){g.mode='home';combo++;const pts=200*2**(combo-1);add(pts);popups.push({x:gx,y:gy,t:1,txt:String(pts)});jingle([523,784,1047],.05)}
      else{state='dying';stT=1.8;jingle([523,440,349,262],.16,'sawtooth');return}
    }
  }
}

function update(dt){
  if(state==='paused')return;
  clock+=dt;
  if(state==='title'||state==='over')return;
  popups=popups.filter(p=>(p.t-=dt)>0);
  if(state==='ready'){if((stT-=dt)<=0){state='play';readyMsg=''}return}
  if(state==='dying'){if((stT-=dt)<=0){lives--;hud();if(lives<=0)gameOver();else{placeActors();state='ready';stT=1.6}}return}
  if(state==='levelup'){if((stT-=dt)<=0){level++;newLevel();readyMsg=level<=3?CHARS[level-1].intro:'Encore plus vite !';state='ready';stT=2.2;hud()}return}
  if(fright>0){fright-=dt;if(fright<=0){fright=0;for(const g of ghosts)if(g.mode==='fright')g.mode='active'}}
  else if((phaseT+=dt)>=PHASES[phaseI]){phaseT=0;phaseI++;for(const g of ghosts)if(g.mode==='active')reverse(g)}
  moveGroom(dt);if(state!=='play')return;
  for(const g of ghosts)moveGhost(g,dt);
  collide();
}

/* ---------- dessin ---------- */
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function circ(x,y,r,col){ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fillStyle=col;ctx.fill()}
function buildWalls(){
  wallCv.width=cv.width;wallCv.height=cv.height;const w=wallCv.getContext('2d');
  w.setTransform(dpr*T,0,0,dpr*T,0,0);w.clearRect(0,0,COLS,ROWS);
  const isW=(x,y)=>x>=0&&x<COLS&&y>=0&&y<ROWS&&MAP[y][x]==='#';
  for(const[i,col]of[[.07,'#e0b354'],[.17,'#5a1a45']]){
    w.fillStyle=col;
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
      if(!isW(x,y))continue;
      rr(w,x+i,y+i,1-2*i,1-2*i,.28);w.fill();
      if(isW(x+1,y))w.fillRect(x+.5,y+i,1,1-2*i);
      if(isW(x,y+1))w.fillRect(x+i,y+.5,1-2*i,1);
      if(isW(x+1,y)&&isW(x,y+1)&&isW(x+1,y+1))w.fillRect(x+.5,y+.5,1,1);
    }
  }
}
function drawCake(x,y,s){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);
  rr(ctx,-.32,-.02,.64,.26,.06);ctx.fillStyle='#fff6f0';ctx.fill();
  ctx.fillStyle='#ff7aa2';ctx.fillRect(-.32,-.02,.64,.06);
  rr(ctx,-.2,-.24,.4,.24,.05);ctx.fillStyle='#ffd1de';ctx.fill();
  ctx.fillStyle='#fff';ctx.fillRect(-.025,-.38,.05,.14);circ(0,-.43,.045,'#ffcf4a');
  ctx.restore();
}
function drawGroom(cx,cy,face,moving,panic){
  ctx.save();ctx.translate(cx,cy);ctx.scale(face*1.15,1.15);
  const b=moving?Math.sin(clock*18)*.05:0;
  ctx.fillStyle='#14121c';ctx.fillRect(-.15,.24+b,.11,.19);ctx.fillRect(.04,.24-b,.11,.19);
  rr(ctx,-.27,-.13,.54,.42,.12);ctx.fillStyle='#1f1c2c';ctx.fill();
  ctx.strokeStyle='#e0b35466';ctx.lineWidth=.025;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-.09,-.13);ctx.lineTo(.09,-.13);ctx.lineTo(0,.13);ctx.fillStyle='#fff';ctx.fill();
  ctx.fillStyle='#c2185b';ctx.beginPath();ctx.moveTo(0,-.09);ctx.lineTo(-.1,-.14);ctx.lineTo(-.1,-.04);ctx.lineTo(.1,-.14);ctx.lineTo(.1,-.04);ctx.closePath();ctx.fill();
  circ(.17,-.03,.05,'#ffb3c7');
  circ(0,-.31,.19,'#f3c9a3');
  ctx.fillStyle='#111';ctx.fillRect(-.21,-.48,.42,.06);ctx.fillRect(-.13,-.76,.26,.3);
  ctx.fillStyle='#c2185b';ctx.fillRect(-.13,-.54,.26,.05);
  circ(.09,-.32,.035,'#1c0816');
  ctx.strokeStyle='#1c0816';ctx.lineWidth=.03;ctx.beginPath();
  if(panic)ctx.arc(.07,-.2,.04,0,7);else ctx.arc(.06,-.25,.06,.3,1.6);ctx.stroke();
  if(panic){ctx.beginPath();ctx.moveTo(-.2,-.5);ctx.quadraticCurveTo(-.27,-.38,-.2,-.36);ctx.quadraticCurveTo(-.13,-.38,-.2,-.5);ctx.fillStyle='#9fd4ff';ctx.fill()}
  ctx.restore();
}
function drawLady(g,cx,cy){
  const c=g.c,m=g.mode,fr=m==='fright',flash=fr&&fright<2&&((clock*6)|0)%2;
  ctx.save();ctx.translate(cx,cy);ctx.scale(g.face*1.15,1.15);
  if(m==='home')ctx.globalAlpha=.5;
  if(c.acc==='veil'){ctx.fillStyle='rgba(255,255,255,.55)';ctx.beginPath();ctx.moveTo(-.02,-.48);ctx.quadraticCurveTo(-.44,-.3,-.36+Math.sin(clock*8)*.04,.26);ctx.lineTo(-.12,.06);ctx.quadraticCurveTo(-.2,-.25,-.02,-.48);ctx.fill()}
  if(m!=='home'){
    const dress=fr?(flash?'#ffffff':'#a9d6ff'):c.dress,trim=fr?'#e8f5ff':c.trim,w=Math.sin(clock*14)*.03;
    ctx.beginPath();ctx.moveTo(-.1,-.1);ctx.lineTo(.1,-.1);ctx.quadraticCurveTo(.16,.15,.34+w,.4);
    for(let i=0;i<4;i++){const x0=.34-i*.17;ctx.quadraticCurveTo(x0-.085,.5,x0-.17,.4)}
    ctx.quadraticCurveTo(-.16,.15,-.1,-.1);ctx.fillStyle=dress;ctx.fill();ctx.strokeStyle=trim;ctx.lineWidth=.035;ctx.stroke();
    rr(ctx,-.11,-.21,.22,.15,.05);ctx.fillStyle=dress;ctx.fill();
    if(!fr){ctx.strokeStyle='#4f8a4a';ctx.lineWidth=.03;ctx.beginPath();ctx.moveTo(.2,0);ctx.lineTo(.17,.14);ctx.stroke();circ(.2,-.02,.07,'#ff7aa2');circ(.26,-.07,.05,'#ffd1de');circ(.15,-.08,.045,'#fff')}
  }
  circ(0,-.34,.17,'#f6d2b5');
  ctx.fillStyle=c.hair;ctx.beginPath();ctx.arc(0,-.36,.178,Math.PI,0);ctx.fill();circ(-.13,-.43,.07,c.hair);
  if(c.acc==='veil'){ctx.fillStyle='#e0b354';ctx.beginPath();ctx.moveTo(-.08,-.5);ctx.lineTo(-.04,-.58);ctx.lineTo(0,-.52);ctx.lineTo(.04,-.6);ctx.lineTo(.08,-.5);ctx.fill()}
  if(c.acc==='hat'){ctx.fillStyle=c.dress;ctx.beginPath();ctx.ellipse(0,-.49,.31,.06,0,0,7);ctx.fill();rr(ctx,-.13,-.67,.26,.19,.07);ctx.fill();circ(.13,-.56,.06,'#ffd1de')}
  if(c.acc==='crown'){circ(-.1,-.5,.045,'#ff8fb1');circ(0,-.53,.045,'#fff');circ(.1,-.5,.045,'#ffd36b')}
  circ(.08,-.34,.03,'#2a0f1f');
  ctx.strokeStyle='#2a0f1f';ctx.lineWidth=.03;ctx.beginPath();
  if(fr){ctx.arc(.07,-.25,.035,0,7);ctx.stroke();ctx.restore();drawCake(cx,cy-.95,.55);return}
  if(m!=='home'){ctx.moveTo(.02,-.42);ctx.lineTo(.14,-.39);ctx.moveTo(.02,-.26);ctx.quadraticCurveTo(.08,-.22,.13,-.27);ctx.stroke()}
  ctx.restore();
}
function label(txt,x,y,size,col){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.font=`700 ${size*T}px Fredoka,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.lineJoin='round';ctx.lineWidth=T*.22;ctx.strokeStyle='#1c0816';ctx.strokeText(txt,x*T,y*T);ctx.fillStyle=col;ctx.fillText(txt,x*T,y*T);
  ctx.setTransform(dpr*T,0,0,dpr*T,0,0);
}
function draw(){
  ctx.setTransform(dpr*T,0,0,dpr*T,0,0);
  ctx.fillStyle='#1c0816';ctx.fillRect(0,0,COLS,ROWS);
  ctx.globalAlpha=state==='levelup'&&((clock*5)|0)%2?.35:1;
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(wallCv,0,0);ctx.setTransform(dpr*T,0,0,dpr*T,0,0);ctx.globalAlpha=1;
  ctx.fillStyle='#e0b354';ctx.fillRect(9,8.44,1,.12);circ(9.5,8.5,.1,'#f3c6cf');
  const pastel=['#fff7fb','#ffd3e2','#cfe6ff'];
  for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
    const c=grid[y][x];
    if(c==='.'){ctx.beginPath();ctx.ellipse(x+.5,y+.5,.13,.1,.5,0,7);ctx.fillStyle=pastel[(x+y)%3];ctx.fill()}
    else if(c==='o')drawCake(x+.5,y+.58,.95+Math.sin(clock*6)*.08);
  }
  for(const g of ghosts){const[x,y]=pos(g);drawLady(g,x,y)}
  const[gx,gy]=pos(groom);
  if(state==='dying'){
    const q=1-stT/1.8;ctx.save();ctx.translate(gx,gy);ctx.rotate(q*12);ctx.scale(Math.max(.05,1-q*.9),Math.max(.05,1-q*.9));drawGroom(0,0,1,false,true);ctx.restore();
    ctx.strokeStyle='#e0b354';ctx.lineWidth=.08;ctx.beginPath();ctx.arc(gx,gy,.3+q*1.4,0,7);ctx.globalAlpha=1-q;ctx.stroke();ctx.globalAlpha=1;
  }else{
    if(groom.d===0)groom.face=1;if(groom.d===2)groom.face=-1;
    const panic=ghosts.some(g=>{if(g.mode!=='active')return false;const[x,y]=pos(g),dx=x-gx,dy=y-gy;return dx*dx+dy*dy<12});
    drawGroom(gx,gy,groom.face,groom.d>=0&&state==='play',panic);
  }
  for(const p of popups)label(p.txt,p.x,p.y-(1-p.t)*.8,.6,'#ffd36b');
  if(state==='ready'||state==='title'){
    label('Antoine',gx,gy-1.05,.45,'#ffffff');
    if(ghosts[0]){const[bx,by]=pos(ghosts[0]);label('Pauline',bx,by-1.15,.45,'#ffffff')}
  }
  if(state==='ready'){label('Prêt ?',9.5,11.5,.9,'#ffd36b');if(readyMsg)label(readyMsg,9.5,13.5,.6,'#f3c6cf')}
  if(state==='dying'&&stT<1.4)label('Attrapé !',9.5,11.5,.9,'#f3c6cf');
  if(state==='levelup')label('Niveau terminé !',9.5,11.5,.8,'#ffd36b');
}

/* ---------- interface ---------- */
const HAT='<svg viewBox="0 0 20 20" width="24" height="24" aria-hidden="true"><rect x="5" y="2" width="10" height="11" rx="1" fill="#f3c6cf"/><rect x="5" y="9.5" width="10" height="2" fill="#c2185b"/><rect x="2" y="13" width="16" height="3" rx="1.5" fill="#f3c6cf"/></svg>';
function hud(){$('score').textContent=score;$('best').textContent=Math.max(best,score);$('lvl').textContent=level;$('lives').innerHTML=HAT.repeat(Math.max(0,lives-1))}
function showOv(t,p,b,form){
  $('ovt').textContent=t;$('ovp').textContent=p;$('go').textContent=b;$('saveMsg').textContent='';
  $('saveForm').hidden=!form;$('go').classList.toggle('ghost',!!form);$('ov').hidden=false;
  if(form){saved=false;$('pseudo').value=readPseudo();setTimeout(()=>{try{$('pseudo').focus()}catch(e){}},50)}
}
function startGame(){
  if(!ac){try{ac=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  if(ac&&ac.state==='suspended')ac.resume();
  score=0;lives=3;level=1;newLevel();readyMsg='';state='ready';stT=2;$('ov').hidden=true;$('saveForm').hidden=true;hud();
}
function gameOver(){
  state='over';const rec=score>best;
  if(rec){best=score;try{localStorage.setItem('marie-cavale-best',best)}catch(e){}}
  hud();showOv('Oui, je le veux !',`Pauline a rattrapé Antoine et lui a passé la bague au doigt. Score : ${score}, niveau ${level}.${rec?' Nouveau record !':''}`,'Rejouer',score>0);
}
function togglePause(){
  if(state==='paused'){state=prev;$('ov').hidden=true;$('pause').textContent='Pause'}
  else if(['play','ready','dying','levelup'].includes(state)){prev=state;state='paused';$('pause').textContent='Reprendre';showOv('Pause','On souffle un peu avant la pièce montée.','Reprendre')}
}
function tone(f,d,type,v,when){
  if(!ac||muted)return;const t=ac.currentTime+(when||0),o=ac.createOscillator(),g=ac.createGain();
  o.type=type||'square';o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(v||.05,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(ac.destination);o.start(t);o.stop(t+d+.02);
}
let alt=0;const blip=()=>tone(alt++%2?660:520,.05,'triangle',.05);
const jingle=(fs,step,type)=>fs.forEach((f,i)=>tone(f,step*1.6,type||'triangle',.06,i*step));

const KEYS={ArrowRight:0,ArrowDown:1,ArrowLeft:2,ArrowUp:3,d:0,s:1,q:2,a:2,z:3,w:3};
addEventListener('keydown',e=>{
  if(e.target&&e.target.tagName==='INPUT')return;
  const k=e.key.length===1?e.key.toLowerCase():e.key;
  if(k in KEYS){want=KEYS[k];if(k.startsWith('Arrow'))e.preventDefault()}
  else if(k==='p'||k==='Escape')togglePause();
  else if((k==='Enter'||k===' ')&&(state==='title'||state==='over')&&document.activeElement!==$('go')){e.preventDefault();startGame()}
});
$('go').addEventListener('click',()=>state==='paused'?togglePause():startGame());
$('pause').addEventListener('click',togglePause);
$('mute').addEventListener('click',()=>{muted=!muted;$('mute').textContent=muted?'Son : non':'Son : oui'});
for(const b of document.querySelectorAll('.pad button'))b.addEventListener('pointerdown',e=>{e.preventDefault();want=+b.dataset.d});
let sw=null;
stage.addEventListener('pointerdown',e=>{sw=[e.clientX,e.clientY]});
stage.addEventListener('pointermove',e=>{if(!sw)return;const dx=e.clientX-sw[0],dy=e.clientY-sw[1];if(dx*dx+dy*dy<324)return;want=Math.abs(dx)>Math.abs(dy)?(dx>0?0:2):(dy>0?1:3);sw=[e.clientX,e.clientY]});
addEventListener('pointerup',()=>{sw=null});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state!=='paused')togglePause()});

function resize(){
  const w=stage.clientWidth;if(!w)return;
  T=w/COLS;dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(w*dpr);cv.height=Math.round(T*ROWS*dpr);buildWalls();
}
/* ---------- tableau d'honneur ---------- */
const API='api/scores',LS_SCORES='antoine-cavale-scores',LS_NAME='antoine-jeux-pseudo';
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
  if(!board.length){const li=document.createElement('li');li.className='empty';li.textContent="Aucun score pour l'instant. À toi d'aider Antoine !";ol.append(li);return}
  board.slice(0,10).forEach((e,i)=>{
    const li=document.createElement('li');if(lastEntry&&e.t===lastEntry.t&&e.name===lastEntry.name)li.className='me';
    const c=(cls,txt)=>{const sp=document.createElement('span');sp.className=cls;sp.textContent=txt;li.append(sp)};
    c('rk',(i+1)+(i?'e':'er'));c('nm',e.name);c('st',e.level?'Niveau '+e.level:'');c('sc',Math.floor(e.score).toLocaleString('fr-FR'));
    ol.append(li);
  });
}
const rankOf=e=>board.findIndex(x=>x===e||(x.t===e.t&&x.name===e.name))+1;
async function saveScore(name){
  const entry={name,score:Math.floor(score),level,t:Date.now()};
  if(online){
    try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
      if(r.ok){board=sortBoard(await r.json());lastEntry=board.find(e=>e.name===entry.name&&e.score===entry.score&&Math.abs(e.t-entry.t)<60000)||entry;renderBoard();return rankOf(lastEntry)}
      if(r.status===429)return -2;
    }catch(e){}
  }
  const l=sortBoard(readLocal().concat(entry)).slice(0,100);writeLocal(l);if(!online)board=l;lastEntry=entry;renderBoard();return online?-1:rankOf(entry);
}
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

const stageObserver=new ResizeObserver(resize);stageObserver.observe(stage);
newLevel();resize();hud();
let last=0;
function frame(ts){const dt=Math.min(.05,(ts-last)/1000||0);last=ts;update(dt);draw();requestAnimationFrame(frame)}
requestAnimationFrame(frame);
if(document.documentElement.classList.contains('embed')&&window.parent!==window){
  const tell=()=>{try{parent.postMessage({jeu:'hauteur',h:Math.ceil(document.body.getBoundingClientRect().height)},'*')}catch(e){}};
  const embedObserver=new ResizeObserver(tell);embedObserver.observe(document.body);tell();
}
}
