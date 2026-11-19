{
const $=id=>document.getElementById(id);
const GAMES={
  retard:{title:'__PRENOM_MARIE__ est en retard',src:'retard/index.html#integre',api:'retard/api/scores',ls:'jeu-retard-scores',detail:e=>e.won?"À l'heure":'En retard'},
  cavale:{title:'__PRENOM_MARIE__ en cavale',src:'cavale/index.html#integre',api:'cavale/api/scores',ls:'jeu-cavale-scores',detail:e=>e.level?'Niveau '+e.level:''}
};
const frame=$('frame');let current=null;

const sortBoard=a=>a.filter(x=>x&&typeof x.name==='string'&&Number.isFinite(x.score)).sort((a,b)=>b.score-a.score||a.t-b.t);
function readLocal(k){try{const a=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(a)?a:[]}catch(e){return[]}}
async function loadBoard(id){
  const g=GAMES[id];let list,online=false;
  try{const r=await fetch(g.api,{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw 0;list=await r.json();if(!Array.isArray(list))throw 0;online=true}
  catch(e){list=readLocal(g.ls)}
  list=sortBoard(list);
  $('note-'+id).textContent=online?'Classement partagé entre tous les invités.':'Scores enregistrés sur cet appareil.';
  const ol=$('list-'+id);ol.textContent='';
  if(!list.length){const li=document.createElement('li');li.className='empty';li.textContent='Aucun score pour l’instant. Sois le premier !';ol.append(li);return}
  list.slice(0,5).forEach((e,i)=>{
    const li=document.createElement('li');
    const c=(cls,txt)=>{const sp=document.createElement('span');sp.className=cls;sp.textContent=txt;li.append(sp)};
    c('rk',(i+1)+(i?'e':'er'));c('nm',e.name);c('st',g.detail(e));c('sc',Math.floor(e.score).toLocaleString('fr-FR'));
    ol.append(li);
  });
}
const loadBoards=()=>{loadBoard('retard');loadBoard('cavale')};

function show(id){
  if(id&&GAMES[id]){
    if(current!==id){current=id;frame.style.height='900px';frame.src=GAMES[id].src;frame.title=GAMES[id].title}
    $('lecteurTitre').textContent=GAMES[id].title;$('choix').hidden=true;$('classements').hidden=true;$('lecteur').hidden=false;
    $('lecteur').scrollIntoView({block:'start'});
  }else{
    if(current){current=null;frame.src='about:blank'}
    $('lecteur').hidden=true;$('choix').hidden=false;$('classements').hidden=false;loadBoards();
  }
}
for(const b of document.querySelectorAll('[data-jeu]'))b.addEventListener('click',()=>{location.hash=b.dataset.jeu});
$('retour').addEventListener('click',()=>{if(location.hash)location.hash='';else show(null);window.scrollTo(0,0)});
addEventListener('hashchange',()=>show(location.hash.slice(1)));
frame.addEventListener('load',()=>{try{if(current)frame.contentWindow.focus()}catch(e){}});
addEventListener('message',e=>{
  if(e.source!==frame.contentWindow||!e.data||typeof e.data!=='object')return;
  if(e.data.jeu==='hauteur'){const h=+e.data.h;if(h>200&&h<6000)frame.style.height=h+'px'}
  if(e.data.jeu==='score')loadBoards();
});
show(location.hash.slice(1));
if(!GAMES[location.hash.slice(1)])loadBoards();
}

/* Statistiques de visite (Umami), si elles sont activées dans l'administration du site */
fetch('/api/stats/config').then((r) => r.json()).then((cfg) => {
  if (!cfg.enabled) return;
  const s = document.createElement('script');
  s.defer = true;
  s.src = '/api/stats/script.js';
  s.dataset.websiteId = cfg.website_id;
  s.dataset.hostUrl = '/api/stats';
  document.head.append(s);
}).catch(() => {});
