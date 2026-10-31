// Short, quiet synthesized cues. No samples, downloads, music, or audio timers.
export const MASTER_GAIN = .2;
export const CUES = Object.freeze({
  flipper: [[190,105,.055,.075,'triangle',0]],
  bumper0: [[392,390,.17,.12,'sine',0],[784,780,.09,.025,'sine',0]],
  bumper1: [[294,292,.17,.12,'sine',0],[588,584,.09,.025,'sine',0]],
  bumper2: [[440,438,.17,.12,'sine',0],[880,876,.09,.025,'sine',0]],
  focus: [[330,220,.16,.065,'sine',0]],
  commit: [[220,330,.13,.065,'sine',0]],
  launch: [[155,245,.12,.065,'triangle',0]],
  turn: [[330,330,.09,.07,'sine',0],[440,440,.12,.06,'sine',.08]],
  upgrade: [[392,392,.13,.06,'sine',0],[494,494,.13,.05,'sine',.08]],
  drain: [[165,165,.11,.05,'sine',0]]
});

export function createOutput(context) {
  const master=context.createGain();master.gain.value=MASTER_GAIN;
  const limiter=context.createDynamicsCompressor();
  limiter.threshold.value=-18;limiter.knee.value=12;limiter.ratio.value=6;
  limiter.attack.value=.004;limiter.release.value=.08;
  limiter.connect(master);master.connect(context.destination);
  return {input:limiter,master};
}

export function scheduleCue(context,output,name,when=context.currentTime) {
  const recipe=CUES[name];if(!recipe)return [];
  return recipe.map(([from,to,duration,amplitude,type,delay])=>{
    const start=when+delay,osc=context.createOscillator(),gain=context.createGain();
    osc.type=type;osc.frequency.setValueAtTime(from,start);osc.frequency.exponentialRampToValueAtTime(to,start+duration);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(amplitude,start+.006);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration-.012);gain.gain.linearRampToValueAtTime(0,start+duration);
    osc.connect(gain);gain.connect(output);osc.start(start);osc.stop(start+duration+.005);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
    return osc;
  });
}

export class QuietAudio {
  constructor(storageKey) {
    this.storageKey=storageKey;this.enabled=true;this.available=!!(globalThis.AudioContext||globalThis.webkitAudioContext);
    this.context=null;this.output=null;this.previous=null;this.live=new Set();this.lastCue=new Map();this.quiet=true;
    try{this.enabled=localStorage.getItem(storageKey)!=='off';}catch{}
  }
  async arm() {
    if(!this.available||!this.enabled||globalThis.document?.hidden)return;
    try{
      if(!this.context||this.context.state==='closed'){
        const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
        this.context=new Context({latencyHint:'interactive'});this.output=createOutput(this.context);
      }
      if(this.context.state!=='running')await this.context.resume();
      if(this.quiet){const gain=this.output.master.gain,now=this.context.currentTime;gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);gain.linearRampToValueAtTime(MASTER_GAIN,now+.015);this.quiet=false;}
    }catch{this.available=false;}
  }
  async toggle() {
    this.enabled=!this.enabled;
    try{localStorage.setItem(this.storageKey,this.enabled?'on':'off');}catch{}
    if(!this.enabled)this.silence();else await this.arm();
  }
  silence() {
    this.quiet=true;
    if(this.context&&this.output){const gain=this.output.master.gain,now=this.context.currentTime;gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);gain.linearRampToValueAtTime(0,now+.008);}
    for(const node of this.live){try{node.stop(this.context.currentTime+.012);}catch{}}
    this.live.clear();
  }
  play(name) {
    const context=this.context;
    if(!this.enabled||!this.available||this.quiet||!context||context.state!=='running'||globalThis.document?.hidden||!CUES[name])return false;
    const now=context.currentTime;
    if(now-(this.lastCue.get(name)??-Infinity)<.045||this.live.size>=8)return false;
    this.lastCue.set(name,now);
    try{
      for(const node of scheduleCue(context,this.output.input,name)){
        this.live.add(node);const clean=node.onended;
        node.onended=()=>{this.live.delete(node);clean();};
      }
      return true;
    }catch{return false;}
  }
  observe(game,meta={}) {
    const next={mode:game.mode,resumeMode:game.resumeMode,focus:game.focus,level:game.level,hits:[...game.hits],left:game.left,right:game.right,turn:meta.turn,room:meta.room};
    const old=this.previous;this.previous=next;
    // Joining or reconnecting seeds observation without replaying old events.
    if(!old||old.room!==next.room)return;
    for(let i=0;i<3;i++)if(next.hits[i]>old.hits[i])this.play('bumper'+i);
    if(next.mode==='play'&&((next.left&&!old.left)||(next.right&&!old.right)))this.play('flipper');
    if(next.mode==='focus'&&old.mode!=='focus')this.play('focus');
    if(next.mode==='play'&&old.mode==='focus'&&next.focus<old.focus-20)this.play('commit');
    if(next.mode==='play'&&(old.mode==='ready'||(old.mode==='paused'&&old.resumeMode==='ready')))this.play('launch');
    if(next.level>old.level)this.play('upgrade');
    if(meta.turn!==undefined){if(next.turn!==old.turn&&meta.mine)this.play('turn');}
    else if(next.mode==='ready'&&old.mode==='play')this.play('drain');
  }
  resetObservation(){this.previous=null;this.silence();}
}

export function installAudio(button,storageKey) {
  const audio=new QuietAudio(storageKey);
  const update=()=>{button.textContent=audio.available?(audio.enabled?'Sound on':'Sound off'):'Sound unavailable';button.setAttribute('aria-pressed',String(audio.enabled&&audio.available));button.disabled=!audio.available;};
  document.addEventListener('pointerdown',()=>{void audio.arm().then(update);},{capture:true});
  document.addEventListener('keydown',event=>{if(!event.repeat)void audio.arm().then(update);},{capture:true});
  button.addEventListener('click',()=>{void audio.toggle().then(()=>{update();if(audio.enabled)audio.play('flipper');});});
  window.addEventListener('blur',()=>audio.silence());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){audio.silence();if(audio.context?.state==='running')void audio.context.suspend().catch(()=>{});}});
  window.addEventListener('pagehide',()=>{audio.silence();if(audio.context)void audio.context.close().catch(()=>{});});
  update();return audio;
}
