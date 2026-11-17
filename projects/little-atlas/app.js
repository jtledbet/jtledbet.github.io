import { clamp, normalizeLongitude, checkPlacement, movePosition } from './game-core.mjs';
import {loadGame, saveGame, createAutosave} from './save-game.mjs';
import {createSounds} from './sound.mjs';

const $ = id => document.getElementById(id);
const canvas = $('globe'), ctx = canvas.getContext('2d');
const flight = $('flight'), plane = $('plane');
let states = [], land, placed = new Set(), position = [-99, 38.5], zoom = 1.15;
let selected = null, target = null, page = 0, explore = false, ready = false;
let width = 1, height = 1, radius = 1, dirty = true, previousTime = 0;
let joystick = { x: 0, y: 0, pointer: null }, heading = 0, labelDrag = null;
const keys = new Set(), pointers = new Map();
let gesture = null, resizeObserver, d3, topojson, projection, path, graticule;
const pageSize = 6;
const stateById = id => states.find(state => state.id === id);
let soundEnabled=true;
const sounds=createSounds();
const storage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
const autosave=createAutosave({
  snapshot:()=>({version:2,placed:[...placed],position:[...position],zoom,heading,selected,page,explore,soundEnabled}),
  write:state=>saveGame(storage,state),
  onStatus:saved=>{
    const message=saved?'Saved on this browser.':'Could not save. Keep this tab open; browser storage is unavailable.';
    if($('save-status').textContent!==message)$('save-status').textContent=message;
    $('save-status').classList.toggle('save-error',!saved);
  }
});

function say(message, type = '') { $('notice').textContent = message; $('notice').className = 'notice ' + type; }
function persist(immediate=true) {if(ready)autosave.changed(immediate);}
function syncSoundButton(){
  sounds.setEnabled(soundEnabled);
  $('sound').setAttribute('aria-pressed',String(soundEnabled));
  $('sound').setAttribute('aria-label',soundEnabled?'Mute sound effects':'Enable sound effects');
  $('sound').title=soundEnabled?'Sound effects on':'Sound effects off';
  $('sound').textContent=soundEnabled?'♪':'♪̸';
}
function selectState(id) {
  if (explore || placed.has(id)) return;
  selected = id;
  $('cargo').textContent = stateById(id).properties.name;
  $('cargo').hidden = false;
  say('Carrying ' + stateById(id).properties.name + '. Find its home.');
  renderTray(); updateTarget(); persist(); sounds.play('pickup');
}
function renderTray() {
  const remaining = states.filter(s => !placed.has(s.id));
  const pages = Math.max(1, Math.ceil(remaining.length / pageSize));
  page = clamp(page, 0, pages - 1);
  $('labels').replaceChildren();
  $('count').textContent = placed.size; $('progress').value = placed.size;
  $('page-count').textContent = remaining.length ? `${page + 1} / ${pages}` : '';
  $('previous').disabled = page === 0; $('next').disabled = page === pages - 1;
  $('tray-title').textContent = explore ? 'EXPLORE MODE · NAMES REVEALED' : 'YOUR NAME TAGS';
  if (!remaining.length) {
    const finished = document.createElement('div'); finished.className = 'finished';
    finished.textContent = 'All 50 found. What a flight!'; $('labels').append(finished);
  }
  for (const state of remaining.slice(page * pageSize, (page + 1) * pageSize)) {
    const button = document.createElement('button');
    button.className = 'label' + (selected === state.id ? ' selected' : '');
    button.textContent = state.properties.name; button.dataset.id = state.id;
    button.setAttribute('aria-pressed', String(selected === state.id)); button.disabled = explore;
    button.addEventListener('click', () => { if (!button.suppressClick) selectState(state.id); });
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || explore || labelDrag) return;
      labelDrag = {id:state.id, pointer:event.pointerId, x:event.clientX, y:event.clientY, moved:false, button};
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
      if (!labelDrag || labelDrag.pointer !== event.pointerId) return;
      if (Math.hypot(event.clientX-labelDrag.x,event.clientY-labelDrag.y)>7) labelDrag.moved=true;
      if (!labelDrag.moved) return;
      $('drag-label').hidden=false; $('drag-label').textContent=state.properties.name;
      $('drag-label').style.left=event.clientX+'px'; $('drag-label').style.top=event.clientY+'px';
      dirty=true;
    });
    button.addEventListener('pointerup', event => finishLabelDrag(event, false));
    button.addEventListener('pointercancel', event => finishLabelDrag(event, true));
    button.addEventListener('lostpointercapture', event => { if(labelDrag?.pointer===event.pointerId) finishLabelDrag(event,true); });
    $('labels').append(button);
  }
}
function finishLabelDrag(event, cancelled) {
  if (!labelDrag || labelDrag.pointer !== event.pointerId) return;
  const drag = labelDrag; labelDrag=null; $('drag-label').hidden=true;
  if (drag.moved) {
    drag.button.suppressClick=true;
    setTimeout(()=>{drag.button.suppressClick=false;},0);
    if(!cancelled){ selected=drag.id; const hit=stateAtScreen(event.clientX,event.clientY); place(hit); }
  }
  dirty=true;
}
function updateTarget() {
  if (!ready) return;
  target = states.find(s => d3.geoContains(s, position)) || null;
  $('location').textContent = target ? (explore || placed.has(target.id) ? target.properties.name : 'State in range') : 'Open skies';
  $('coordinates').textContent = `${Math.abs(position[1]).toFixed(1)}° ${position[1]<0?'S':'N'}  /  ${Math.abs(position[0]).toFixed(1)}° ${position[0]<0?'W':'E'}`;
  $('drop').disabled = !selected || !target || explore;
}
function place(hit = target) {
  if (explore || !ready) return;
  const result = checkPlacement(selected, hit?.id, placed);
  if (result === 'correct') {
    const name = stateById(selected).properties.name;
    placed.add(selected); selected=null; $('cargo').hidden=true;
    renderTray(); updateTarget(); persist(); sounds.play('correct'); dirty=true;
    say(placed.size===50?'All fifty states placed. Expedition complete!':`${name} found! ${placed.size} down, ${50-placed.size} to go.`, 'success');
  } else if (selected) {
    $('cargo').textContent=stateById(selected).properties.name; $('cargo').hidden=false;
    say(hit ? 'Not quite. Your name tag is still with you.' : 'Aim for a U.S. state. Zoom in if you need a closer look.', 'error');
    renderTray(); updateTarget(); persist(); sounds.play('incorrect');
  }
}
function stateAtScreen(clientX, clientY) {
  const rect=canvas.getBoundingClientRect(), point=[clientX-rect.left,clientY-rect.top];
  if(point[0]<0||point[1]<0||point[0]>width||point[1]>height) return null;
  if(Math.hypot(point[0]-width/2,point[1]-height*.45)>radius) return null;
  const coordinates=projection.invert(point);
  return coordinates?.every(Number.isFinite) ? states.find(s=>d3.geoContains(s,coordinates))||null : null;
}
function resize() {
  const rect=flight.getBoundingClientRect(); width=rect.width; height=rect.height;
  const dpr=Math.min(devicePixelRatio||1,2); canvas.width=Math.round(width*dpr); canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0); dirty=true;
}
function drawFeature(feature, fill, stroke, lineWidth=1) {
  ctx.beginPath(); path(feature);
  if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}
}
function draw() {
  radius=Math.min(width,height)*.43*zoom;
  projection.rotate([-position[0],-position[1],0]).translate([width/2,height*.45]).scale(radius);
  ctx.clearRect(0,0,width,height);
  const centerX=width/2,centerY=height*.45;
  // A single orthographic sphere keeps the world continuous at the date line.
  const sea=ctx.createRadialGradient(centerX-radius*.32,centerY-radius*.4,radius*.08,centerX,centerY,radius);
  sea.addColorStop(0,'#478b94');sea.addColorStop(.65,'#2c6574');sea.addColorStop(1,'#194252');
  ctx.shadowColor='#7cb8b32b';ctx.shadowBlur=25;
  drawFeature({type:'Sphere'},sea,'#94ccc04d',1.5);ctx.shadowBlur=0;
  drawFeature(graticule,null,'#b9e1d718',.6);
  drawFeature(land,'#759987','#a2b8a044',.5);
  for(const state of states){
    const color=placed.has(state.id)?'#a6d9ac':target?.id===state.id?'#f1ce8d':'#cfceac';
    drawFeature(state,color,'#345e5b',.8);
  }
  if(target)drawFeature(target,null,'#fff4ce',2.2);
  // Subtle rim shade gives the miniature globe its depth without a texture download.
  const rim=ctx.createRadialGradient(centerX,centerY,radius*.65,centerX,centerY,radius);
  rim.addColorStop(0,'#081c2700');rim.addColorStop(1,'#081c2759');drawFeature({type:'Sphere'},rim,null);
  dirty=false;
}
function setZoom(next){zoom=clamp(next,.82,12);dirty=true;persist(false);}
function navigate(x,y,dt){position=movePosition(position,x,y,dt,zoom);heading=Math.atan2(x,-y)*180/Math.PI;plane.style.transform=`rotate(${heading}deg)`;updateTarget();dirty=true;persist(false);}
function tick(time){
  const dt=Math.min((time-previousTime)/1000,.05);previousTime=time;
  if(ready){
    let x=joystick.x+(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);
    let y=joystick.y+(keys.has('arrowdown')||keys.has('s')?1:0)-(keys.has('arrowup')||keys.has('w')?1:0);
    const magnitude=Math.hypot(x,y);if(magnitude>1){x/=magnitude;y/=magnitude;}
    if(magnitude>.06)navigate(x,y,dt);
    plane.classList.toggle('flying',magnitude>.06||pointers.size>0);
    if(dirty)draw();
  }
  requestAnimationFrame(tick);
}
function resetInput(){keys.clear();joystick={x:0,y:0,pointer:null};$('stick').style.transform='';pointers.clear();gesture=null;labelDrag=null;$('drag-label').hidden=true;}
function setJoystick(event){
  const rect=$('joystick').getBoundingClientRect();const max=rect.width*.3;
  const dx=event.clientX-rect.left-rect.width/2,dy=event.clientY-rect.top-rect.height/2;
  const len=Math.hypot(dx,dy),factor=len>max?max/len:1;
  joystick.x=dx*factor/max;joystick.y=dy*factor/max;
  $('stick').style.transform=`translate(${dx*factor}px,${dy*factor}px)`;
}
$('joystick').addEventListener('pointerdown',event=>{if(event.button!==0||joystick.pointer!==null)return;joystick.pointer=event.pointerId;$('joystick').setPointerCapture(event.pointerId);setJoystick(event);});
$('joystick').addEventListener('pointermove',event=>{if(joystick.pointer===event.pointerId)setJoystick(event);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('joystick').addEventListener(name,event=>{if(joystick.pointer===event.pointerId){joystick={x:0,y:0,pointer:null};$('stick').style.transform='';autosave.flush();}});
function startGesture(){
  const points=[...pointers.values()];
  gesture=points.length>=2?{type:'pinch',distance:Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]),zoom}:points.length===1?{type:'pan',point:points[0],position:[...position]}:null;
}
canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;canvas.focus({preventScroll:true});pointers.set(event.pointerId,[event.clientX,event.clientY]);canvas.setPointerCapture(event.pointerId);startGesture();});
canvas.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId)||!gesture)return;pointers.set(event.pointerId,[event.clientX,event.clientY]);
  const points=[...pointers.values()];
  if(gesture.type==='pinch'&&points.length>=2){const distance=Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1]);if(gesture.distance>0)setZoom(gesture.zoom*distance/gesture.distance);}
  else if(gesture.type==='pan'){
    const dx=points[0][0]-gesture.point[0],dy=points[0][1]-gesture.point[1];
    position=[normalizeLongitude(gesture.position[0]-dx/radius*57.3/Math.max(.25,Math.cos(gesture.position[1]*Math.PI/180))),clamp(gesture.position[1]+dy/radius*57.3,-85,85)];
    updateTarget();dirty=true;persist(false);
  }
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{pointers.delete(event.pointerId);startGesture();autosave.flush();});
canvas.addEventListener('wheel',event=>{event.preventDefault();setZoom(zoom*Math.exp(-event.deltaY*.0015));},{passive:false});
window.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]')||event.ctrlKey||event.metaKey||event.altKey)return;
  const key=event.key.toLowerCase(),onButton=event.target.closest?.('button');
  if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)){event.preventDefault();keys.add(key);}
  if((key===' '&&!onButton)&&!event.repeat){event.preventDefault();place();}
  if(key==='+'||key==='=')setZoom(zoom*1.2);if(key==='-')setZoom(zoom/1.2);
});
window.addEventListener('keyup',event=>{keys.delete(event.key.toLowerCase());autosave.flush();});
function leaveFlight(){resetInput();autosave.flush();sounds.stop();}
window.addEventListener('blur',leaveFlight);
window.addEventListener('pagehide',leaveFlight);
document.addEventListener('visibilitychange',()=>{if(document.hidden)leaveFlight();});
$('zoom-in').onclick=()=>setZoom(zoom*1.3);$('zoom-out').onclick=()=>setZoom(zoom/1.3);
$('home').onclick=()=>{position=[-99,38.5];setZoom(1.15);updateTarget();};
$('world').onclick=()=>setZoom(.9);
$('drop').onclick=()=>place();
$('previous').onclick=()=>{page--;renderTray();persist();};$('next').onclick=()=>{page++;renderTray();persist();};
$('explore').onclick=()=>{
  explore=!explore;resetInput();$('explore').setAttribute('aria-pressed',String(explore));$('explore').textContent=explore?'Back to game':'Explore';
  $('cargo').hidden=explore||!selected;renderTray();updateTarget();
  say(explore?'Free flight. Discover state names beneath your plane.':selected?'Find a home for your name tag.':'Choose a name, then fly to its state.');
  persist();
};
$('sound').onclick=()=>{soundEnabled=!soundEnabled;syncSoundButton();persist();if(soundEnabled)sounds.play('pickup');};
for(const id of ['help','credits','reset'])$(id).onclick=()=>{resetInput();$(id+'-dialog').showModal();};
document.querySelectorAll('.dialog-close').forEach(button=>button.onclick=()=>button.closest('dialog').close());
$('confirm-reset').onclick=()=>{placed.clear();selected=null;page=0;$('cargo').hidden=true;renderTray();updateTarget();persist();dirty=true;$('reset-dialog').close();say('A fresh expedition. Pick your first name tag.');};

async function init(){
  try{
    // defer scripts execute before DOMContentLoaded; the module may fetch faster.
    if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    d3=window.d3;topojson=window.topojson;if(!d3||!topojson)throw new Error('Map libraries did not load');
    const [stateTopology,landTopology]=await Promise.all(['data/states.json','data/land.json'].map(async url=>{const response=await fetch(url);if(!response.ok)throw new Error(`Map request failed: ${response.status}`);return response.json();}));
    states=topojson.feature(stateTopology,stateTopology.objects.states).features.filter(s=>s.id!=='11'&&Number(s.id)<60).sort((a,b)=>a.properties.name.localeCompare(b.properties.name));
    if(states.length!==50)throw new Error(`Expected fifty states, received ${states.length}`);
    land=topojson.feature(landTopology,landTopology.objects.land);
    const validIds=new Set(states.map(s=>s.id));
    const restored=loadGame(storage,validIds),saved=restored.state;
    placed=new Set(saved.placed);position=saved.position;zoom=saved.zoom;heading=saved.heading;
    selected=saved.selected;page=saved.page;explore=saved.explore;soundEnabled=saved.soundEnabled;
    plane.style.transform=`rotate(${heading}deg)`;
    $('explore').setAttribute('aria-pressed',String(explore));$('explore').textContent=explore?'Back to game':'Explore';
    $('cargo').hidden=explore||!selected;if(selected)$('cargo').textContent=stateById(selected).properties.name;
    syncSoundButton();
    projection=d3.geoOrthographic().clipAngle(90).precision(.5);path=d3.geoPath(projection,ctx);graticule=d3.geoGraticule10();
    ready=true;renderTray();resize();updateTarget();$('loading').hidden=true;
    resizeObserver=new ResizeObserver(resize);resizeObserver.observe(flight);requestAnimationFrame(tick);
    // Probe writes now so storage failures are visible before any progress is made.
    persist();
    if(restored.source!=='new')say(restored.source==='backup'?'Recovered your last saved flight.':explore?'Exploration resumed. Your round is saved.':selected?`Flight resumed. Carrying ${stateById(selected).properties.name}.`:'Your saved expedition is ready.');
    if(placed.size===50)say('All fifty states placed. Explore the world or start a fresh expedition.','success');
  }catch(error){console.error(error);$('loading').textContent='The map could not load. Refresh to try again.';}
}
init();
