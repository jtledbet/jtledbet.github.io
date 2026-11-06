import {Game,TARGETS,NAMES,TABLE,LAUNCH} from './game.mjs?v=0.1.0';
import {installAudio} from './audio.mjs?v=0.1.0';
import {TableEffects} from './effects.mjs?v=0.1.0';
import {TableRenderer} from './renderer.mjs?v=0.1.0';
export const BUILD_VERSION='0.1.0';
export const game=new Game();
const nodes=new Map(),$=id=>{let node=nodes.get(id);if(!node){node=document.getElementById(id);if(node)nodes.set(id,node);}return node;};
let versionLabel=$('version');
if(!versionLabel){
  const info=document.createElement('span');info.className='build-info';
  Object.assign(info.style,{display:'flex',flexDirection:'column',alignItems:'center',gap:'2px',minWidth:'0'});
  const build=$('build');build.before(info);info.append(build);
  versionLabel=document.createElement('span');versionLabel.id='version';info.append(versionLabel);nodes.set('version',versionLabel);
}
versionLabel.textContent=`v${BUILD_VERSION}`;
const canvas=$('canvas'),key='zenball.next.progress.v1';
export const effects=new TableEffects(TARGETS,LAUNCH);
export const renderer=new TableRenderer(canvas,TARGETS,NAMES,TABLE,LAUNCH);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let frameRequest=0,last=0,lastPaint=-Infinity,lastSync=-Infinity,renderDirty=true;
function queueFrame(){if(!document.hidden&&!frameRequest)frameRequest=requestAnimationFrame(frame);}
const audio=installAudio($('sound-toggle'),'zenball.next.sound.v1',{onOpen:()=>{release();if(game.mode==='play')game.pause();save();sync();}});
let saved='',storageOK=true;
try{game.restore(localStorage.getItem(key));saved=game.save();}catch{storageOK=false;}
const progressFields=['level','xp','score','precision','power','calm','points'],savedProgress=new Float64Array(progressFields.length);
for(let i=0;i<progressFields.length;i++)savedProgress[i]=game[progressFields[i]];
const save=()=>{let changed=false;for(let i=0;i<progressFields.length;i++)if(savedProgress[i]!==game[progressFields[i]])changed=true;if(!changed)return;const value=game.save();for(let i=0;i<progressFields.length;i++)savedProgress[i]=game[progressFields[i]];if(value===saved)return;try{localStorage.setItem(key,value);saved=value;}catch{storageOK=false;}};
const targets=[...document.querySelectorAll('[data-target]')],upgrades=[...document.querySelectorAll('[data-upgrade]')];
const held={left:new Set(),right:new Set()},keys=new Set();
let drawSource=null,drawPointer=null,drawOriginY=0,drawMoved=false,suppressLaunchClick=false;
function inputs(){game.left=game.mode==='play'&&(held.left.size>0||keys.has('a')||keys.has('arrowleft'));game.right=game.mode==='play'&&(held.right.size>0||keys.has('d')||keys.has('arrowright'));$('left').classList.toggle('held',game.left);$('right').classList.toggle('held',game.right);}
function cancelDrawing(){drawSource=null;drawPointer=null;game.cancelDraw();}
function release(){held.left.clear();held.right.clear();keys.clear();cancelDrawing();inputs();}
for(const side of ['left','right']){const button=$(side);button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);held[side].add(e.pointerId);inputs();});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,e=>{held[side].delete(e.pointerId);inputs();});}
function change(fn){fn();save();effects.observe(game,reducedMotion.matches);sync();audio.observe(game);}
function finishDraw(){drawSource=null;drawPointer=null;change(()=>game.releaseDraw());}
function beginPointerDraw(event){
  if(event.button!==0||drawSource||!game.beginDraw())return false;
  event.preventDefault();drawSource='pointer';drawPointer=event.pointerId;drawOriginY=event.clientY;drawMoved=false;
  event.currentTarget.setPointerCapture(event.pointerId);sync();return true;
}
for(const element of [$('action'),$('table')]){
  element.addEventListener('pointerdown',event=>{const started=beginPointerDraw(event);if(element===$('action'))suppressLaunchClick=started;});
  element.addEventListener('pointermove',event=>{if(drawSource!=='pointer'||event.pointerId!==drawPointer)return;const delta=event.clientY-drawOriginY;if(Math.abs(delta)>6)drawMoved=true;if(drawMoved){event.preventDefault();const scale=620/$('table').getBoundingClientRect().height;game.setDraw(delta*scale/110);sync();}});
  element.addEventListener('pointerup',event=>{if(drawSource==='pointer'&&event.pointerId===drawPointer){event.preventDefault();finishDraw();}});
  for(const type of ['pointercancel','lostpointercapture'])element.addEventListener(type,event=>{if(drawSource==='pointer'&&event.pointerId===drawPointer){cancelDrawing();sync();}});
  element.addEventListener('contextmenu',event=>{if(game.mode==='ready'||drawSource==='pointer')event.preventDefault();});
}
$('action').addEventListener('click',event=>{const consumed=suppressLaunchClick&&event.detail>0;suppressLaunchClick=false;if(!consumed)change(()=>game.action());});
$('pause').addEventListener('click',()=>change(()=>{release();if(game.mode==='paused')game.resume();else game.pause();}));
$('resume').addEventListener('click',()=>change(()=>game.resume()));
$('cancel').addEventListener('click',()=>change(()=>game.toggleFocus()));
targets.forEach((button,i)=>button.addEventListener('click',()=>change(()=>game.select(i))));
upgrades.forEach((button,i)=>button.addEventListener('click',()=>change(()=>game.upgrade(i))));
$('help-toggle').addEventListener('click',()=>{change(()=>{release();game.pause();});$('help').showModal();});
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(['a','d','arrowleft','arrowright',' ','p','escape','1','2','3'].includes(k))e.preventDefault();if(e.repeat)return;if(['a','d','arrowleft','arrowright'].includes(k)){keys.add(k);inputs();return;}if(k===' '&&game.mode==='ready'){if(!drawSource&&game.beginDraw()){drawSource='space';sync();}return;}change(()=>{if(k===' ')game.action();if(k==='p'){release();if(game.mode==='paused')game.resume();else game.pause();}if(k==='escape'){if(game.drawing){cancelDrawing();return;}release();if(game.mode==='focus')game.toggleFocus();else game.pause();}if(['1','2','3'].includes(k)){if(game.mode==='upgrade')game.upgrade(+k-1);else game.select(+k-1);}});});
document.addEventListener('keyup',e=>{if(e.key===' '&&drawSource==='space'){e.preventDefault();finishDraw();}keys.delete(e.key.toLowerCase());inputs();});
function suspend(){release();game.pause();effects.clear();save();last=0;if(document.hidden&&frameRequest){cancelAnimationFrame(frameRequest);frameRequest=0;}sync();}
window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else{renderDirty=true;queueFrame();}});window.addEventListener('pagehide',suspend);
let previousMode='';
function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
function prop(id,key,value){if($(id)[key]!==value)$(id)[key]=value;}
function attr(node,name,value){if(value===null){if(node.hasAttribute(name))node.removeAttribute(name);}else if(node.getAttribute(name)!==String(value))node.setAttribute(name,String(value));}
function sync(schedule=true){
  if(previousMode!==game.mode){release();previousMode=game.mode;renderDirty=true;}
  inputs();setText('level',`LEVEL ${game.level}`);setText('growth',`${game.xp} / ${game.level*30} growth`);prop('xp','max',game.level*30);prop('xp','value',game.xp);
  setText('score',String(game.score).padStart(6,'0'));setText('focus',`${Math.floor(game.focus)} focus`);setText('build',`Sight ${game.precision} · Force ${game.power} · Stillness ${game.calm}`);
  setText('status',game.mode==='ready'?'Hold Launch or Space. Release to launch.':game.mode==='paused'?'Paused. Resume when you are ready.':game.message);
  setText('action',game.mode==='ready'?'LAUNCH':game.mode==='paused'?'RESUME':game.mode==='focus'?(game.selected<0?'PICK A TARGET':'COMMIT SHOT'):'FOCUS');
  prop('action','disabled',game.mode==='upgrade'||(game.mode==='focus'&&game.selected<0)||(game.mode==='play'&&game.focus<25));
  prop('left','disabled',game.mode!=='play');prop('right','disabled',game.mode!=='play');attr($('pause'),'aria-label',game.mode==='paused'?'Resume game':'Pause game');
  prop('launch-power','hidden',game.mode!=='ready');prop('launch-power','value',game.drawCharge*100);$('action').classList.toggle('drawing',game.drawing);$('table').classList.toggle('launch-ready',game.mode==='ready');attr($('action'),'aria-describedby',game.mode==='ready'?'launch-hint':null);
  prop('focus-panel','hidden',game.mode!=='focus');prop('upgrade-panel','hidden',game.mode!=='upgrade');prop('paused-panel','hidden',game.mode!=='paused');
  targets.forEach((b,i)=>{if(b.disabled!==(game.mode!=='focus'))b.disabled=game.mode!=='focus';attr(b,'aria-pressed',game.selected===i);});
  if(!storageOK)setText('save-note','Browser storage is unavailable. Progress lasts only for this visit.');
  lastSync=performance.now();if(schedule){renderDirty=true;queueFrame();}
}
function resize(){const stage=document.querySelector('.stage'),width=Math.min(stage.clientWidth,stage.clientHeight*480/620),height=width*620/480;const table=$('table');table.style.width=`${width}px`;table.style.height=`${height}px`;renderer.resize(width,height,Math.min(window.devicePixelRatio||1,3));renderDirty=true;queueFrame();}
new ResizeObserver(resize).observe(document.querySelector('.stage'));resize();
window.addEventListener('resize',resize);
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{last=0;renderDirty=true;queueFrame();});
reducedMotion.addEventListener('change',()=>{effects.clear();renderDirty=true;queueFrame();});
function frame(now){
  frameRequest=0;
  const elapsed=last?Math.max(0,(now-last)/1000):0;last=now;
  game.advance(elapsed);effects.observe(game,reducedMotion.matches);effects.advance(game,elapsed,reducedMotion.matches);save();
  if(game.drawing)prop('launch-power','value',game.drawCharge*100);
  if(game.mode!==previousMode||now-lastSync>=50)sync(false);
  audio.observe(game);
  const active=game.mode==='play'||game.drawing||effects.active;
  const breathing=game.mode==='ready'&&!reducedMotion.matches&&!$('sound-dialog').open&&!$('help').open;
  if(renderDirty||active||(breathing&&now-lastPaint>=1000/30)){renderer.draw(game,now/1000,effects,reducedMotion.matches);renderDirty=false;lastPaint=now;}
  if(active||breathing)queueFrame();else last=0;
}
effects.observe(game,reducedMotion.matches);sync();
