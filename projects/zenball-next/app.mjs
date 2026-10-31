import {Game,TARGETS,NAMES,TABLE} from './game.mjs?v=physics-1';
export const game=new Game();
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d'),key='zenball.next.progress.v1';
let saved='',storageOK=true;
try{game.restore(localStorage.getItem(key));saved=game.save();}catch{storageOK=false;}
const save=()=>{const value=game.save();if(value===saved)return;try{localStorage.setItem(key,value);saved=value;}catch{storageOK=false;}};
const targets=[...document.querySelectorAll('[data-target]')],upgrades=[...document.querySelectorAll('[data-upgrade]')];
const held={left:new Set(),right:new Set()},keys=new Set();
function inputs(){game.left=game.mode==='play'&&(held.left.size>0||keys.has('a')||keys.has('arrowleft'));game.right=game.mode==='play'&&(held.right.size>0||keys.has('d')||keys.has('arrowright'));$('left').classList.toggle('held',game.left);$('right').classList.toggle('held',game.right);}
function release(){held.left.clear();held.right.clear();keys.clear();inputs();}
for(const side of ['left','right']){const button=$(side);button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);held[side].add(e.pointerId);inputs();});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{held[side].delete(e.pointerId);inputs();});}
function change(fn){fn();save();sync();}
$('action').addEventListener('click',()=>change(()=>game.action()));
$('pause').addEventListener('click',()=>change(()=>{release();if(game.mode==='paused')game.resume();else game.pause();}));
$('resume').addEventListener('click',()=>change(()=>game.resume()));
$('cancel').addEventListener('click',()=>change(()=>game.toggleFocus()));
targets.forEach((button,i)=>button.addEventListener('click',()=>change(()=>game.select(i))));
upgrades.forEach((button,i)=>button.addEventListener('click',()=>change(()=>game.upgrade(i))));
$('help-toggle').addEventListener('click',()=>{change(()=>{release();game.pause();});$('help').showModal();});
document.addEventListener('keydown',e=>{if($('help').open||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(['a','d','arrowleft','arrowright',' ','p','escape','1','2','3'].includes(k))e.preventDefault();if(e.repeat)return;if(['a','d','arrowleft','arrowright'].includes(k)){keys.add(k);inputs();return;}change(()=>{if(k===' ')game.action();if(k==='p'){release();if(game.mode==='paused')game.resume();else game.pause();}if(k==='escape'){release();if(game.mode==='focus')game.toggleFocus();else game.pause();}if(['1','2','3'].includes(k)){if(game.mode==='upgrade')game.upgrade(+k-1);else game.select(+k-1);}});});
document.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());inputs();});
function suspend(){release();game.pause();save();sync();}
window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});window.addEventListener('pagehide',suspend);
let previousMode='';
function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function sync(){
  if(previousMode!==game.mode){release();previousMode=game.mode;}
  inputs();setText('level',`LEVEL ${game.level}`);setText('growth',`${game.xp} / ${game.level*30} growth`);$('xp').max=game.level*30;$('xp').value=game.xp;
  setText('score',String(game.score).padStart(6,'0'));setText('focus',`${Math.floor(game.focus)} focus`);setText('build',`Sight ${game.precision} · Force ${game.power} · Stillness ${game.calm}`);
  setText('status',game.mode==='paused'?'Paused. Resume when you are ready.':game.message);
  setText('action',game.mode==='ready'?'LAUNCH':game.mode==='paused'?'RESUME':game.mode==='focus'?(game.selected<0?'PICK A TARGET':'COMMIT SHOT'):'FOCUS');
  $('action').disabled=game.mode==='upgrade'||(game.mode==='focus'&&game.selected<0)||(game.mode==='play'&&game.focus<25);
  $('left').disabled=$('right').disabled=game.mode!=='play';$('pause').setAttribute('aria-label',game.mode==='paused'?'Resume game':'Pause game');
  $('focus-panel').hidden=game.mode!=='focus';$('upgrade-panel').hidden=game.mode!=='upgrade';$('paused-panel').hidden=game.mode!=='paused';
  targets.forEach((b,i)=>{b.disabled=game.mode!=='focus';b.setAttribute('aria-pressed',String(game.selected===i));});
  if(!storageOK)setText('save-note','Browser storage is unavailable. Progress lasts only for this visit.');
}
function resize(){const stage=document.querySelector('.stage'),width=Math.min(stage.clientWidth,stage.clientHeight*480/620),height=width*620/480;const table=$('table');table.style.width=`${width}px`;table.style.height=`${height}px`;const dpr=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
new ResizeObserver(resize).observe(document.querySelector('.stage'));resize();
const C={bg:'#162b33',ink:'#e6e9df',muted:'#8da4a7',teal:'#79d7bb',gold:'#e8bf79'};
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function line(x,y,xx,yy,w,color){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}
function text(s,x,y,size,color,align='center'){ctx.fillStyle=color;ctx.font=`${size}px system-ui,sans-serif`;ctx.textAlign=align;ctx.fillText(s,x,y);}
const trail=[];
function draw(){
  ctx.setTransform(canvas.width/480,0,0,canvas.height/620,0,-120*canvas.height/620);ctx.fillStyle=C.bg;ctx.fillRect(0,120,480,620);
  for(let i=0;i<10;i++)line(30,145+i*55,450,145+i*55,1,'#1e353d');
  line(20,120,20,730,3,'#35565b');line(460,120,460,730,3,'#35565b');line(20,120,460,120,3,'#35565b');
  circle(240,385,84,'#213b42');circle(240,385,81,C.bg);text('B R E A T H E',240,422,13,'#52727a');
  TARGETS.forEach(([x,y],i)=>{const color=i===1?C.gold:C.teal;circle(x,y,39+game.glow[i]*7,'#29474c');if(game.selected===i)circle(x,y,36,C.ink);circle(x,y,TABLE.bumperRadius,color);circle(x,y,20,'#203c43');text(String(i+1),x,y+6,17,color);text(NAMES[i],x,y+60,13,C.ink);text(['GROWTH','SCORE','FOCUS'][i],x,y+78,10,C.muted);});
  line(30,490,135,TABLE.flipperY,TABLE.guideRadius*2,'#35565b');line(450,490,345,TABLE.flipperY,TABLE.guideRadius*2,'#35565b');
  line(135,TABLE.flipperY,135+TABLE.flipperLength*Math.cos(game.leftAngle),TABLE.flipperY+TABLE.flipperLength*Math.sin(game.leftAngle),TABLE.flipperRadius*2,C.teal);line(345,TABLE.flipperY,345+TABLE.flipperLength*Math.cos(game.rightAngle),TABLE.flipperY+TABLE.flipperLength*Math.sin(game.rightAngle),TABLE.flipperRadius*2,C.teal);
  text('F R E E   P L A Y',240,708,11,'#52727a');
  if(game.mode==='play'){trail.push([game.x,game.y]);if(trail.length>12)trail.shift();}else if(game.mode==='ready')trail.length=0;
  trail.forEach(([x,y],i)=>{ctx.globalAlpha=i/trail.length*.25;circle(x,y,5,C.teal);});ctx.globalAlpha=1;
  if(game.mode==='focus'&&game.selected>=0){let [px,py]=[game.x,game.y];ctx.setLineDash([5,5]);for(let t=.02;t<Math.min(2,.35+game.precision*.15);t+=.02){const[x,y]=game.preview(game.selected,t);line(px,py,x,y,2,C.gold);[px,py]=[x,y];if(x<30||x>450||y<130||y>730)break;}ctx.setLineDash([]);}
  circle(game.x,game.y,15,'#34575b');circle(game.x,game.y,TABLE.ballRadius,C.ink);circle(game.x-2,game.y-3,3,'white');
}
let last=0;
function frame(now){if(last)game.advance((now-last)/1000);last=now;save();sync();draw();requestAnimationFrame(frame);}
sync();requestAnimationFrame(frame);
