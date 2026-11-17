import {STORAGE_KEY, clamp, normalizeLongitude, readProgress} from './game-core.mjs';

export const SAVE_KEY = 'little-atlas.us.v2';
export const BACKUP_KEY = SAVE_KEY + '.backup';
export function freshGame() {
  return {version:2, placed:[], position:[-99,38.5], zoom:1.15, heading:0, selected:null, page:0, explore:false, soundEnabled:true};
}
export function decodeSave(raw, validIds) {
  try {
    const value=JSON.parse(raw);
    if(value?.version!==2 || !Array.isArray(value.placed)) return null;
    const state=freshGame();
    state.placed=[...new Set(value.placed.filter(id=>typeof id==='string' && validIds.has(id)))];
    if(Array.isArray(value.position) && value.position.length===2 && value.position.every(Number.isFinite)) {
      state.position=[normalizeLongitude(value.position[0]),clamp(value.position[1],-85,85)];
    }
    if(Number.isFinite(value.zoom)) state.zoom=clamp(value.zoom,.82,12);
    if(Number.isFinite(value.heading)) state.heading=normalizeLongitude(value.heading);
    if(validIds.has(value.selected) && !state.placed.includes(value.selected)) state.selected=value.selected;
    if(Number.isInteger(value.page)) state.page=clamp(value.page,0,Math.max(0,Math.ceil((validIds.size-state.placed.length)/6)-1));
    state.explore=value.explore===true;
    state.soundEnabled=value.soundEnabled!==false;
    return state;
  } catch { return null; }
}
export function loadGame(storage, validIds) {
  let unavailable=false;
  const read=key=>{try{return storage.getItem(key);}catch{unavailable=true;return null;}};
  for(const [key,source] of [[SAVE_KEY,'saved'],[BACKUP_KEY,'backup']]) {
    const state=decodeSave(read(key),validIds);
    if(state) return {state,source,unavailable};
  }
  const legacy=read(STORAGE_KEY);
  const state=freshGame();
  state.placed=[...readProgress(legacy,validIds)];
  return {state,source:state.placed.length?'legacy':'new',unavailable};
}
export function saveGame(storage, state) {
  const serialized=JSON.stringify({...state,version:2});
  // Each key is an atomic write. Both copies contain the latest successful save,
  // so one corrupt copy need not undo the most recently placed state.
  storage.setItem(SAVE_KEY,serialized);
  try { storage.setItem(BACKUP_KEY,serialized); } catch { /* primary is saved */ }
}
export function createAutosave({snapshot,write,onStatus=()=>{},delay=500,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let timer=null, pending=false;
  function flush() {
    if(timer!==null){clearTimer(timer);timer=null;}
    if(!pending)return;
    try {write(snapshot());pending=false;onStatus(true);} catch {onStatus(false);}
  }
  function changed(immediate=false) {
    pending=true;
    if(immediate)flush();
    else if(timer===null)timer=setTimer(flush,delay);
  }
  return {changed,flush};
}
