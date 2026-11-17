// Short, low-volume feedback only. No music or continuous engine sound.
const cues={pickup:[[520,0,.055,.025]],correct:[[660,0,.11,.035],[880,.075,.14,.03]],incorrect:[[185,0,.13,.03]]};
export function createSounds(makeContext=()=>new (window.AudioContext||window.webkitAudioContext)()) {
  let context=null, enabled=true, generation=0, lastPlay=-Infinity;
  const voices=new Set();
  function stop(){generation++;for(const voice of voices){try{voice.stop();}catch{}}voices.clear();}
  async function play(name) {
    if(!enabled || !cues[name])return;
    const request=generation;
    try {
      context ||= makeContext();
      if(context.state==='suspended')await context.resume();
      if(!enabled || request!==generation || context.state!=='running')return;
      if(context.currentTime-lastPlay<.035)return;
      lastPlay=context.currentTime;
      // Cap overlap for rapid input. Each oscillator cleans up its own nodes.
      if(voices.size>4)stop();
      for(const [frequency,offset,duration,volume] of cues[name]) {
        const oscillator=context.createOscillator(),gain=context.createGain();
        const start=context.currentTime+offset;
        oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,start);
        gain.gain.setValueAtTime(0,start);
        gain.gain.linearRampToValueAtTime(volume,start+.008);
        gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        oscillator.connect(gain);gain.connect(context.destination);voices.add(oscillator);
        oscillator.onended=()=>{voices.delete(oscillator);oscillator.disconnect();gain.disconnect();};
        oscillator.start(start);oscillator.stop(start+duration+.01);
      }
    } catch { /* Audio availability must never block gameplay. */ }
  }
  return {play,stop,setEnabled(value){enabled=value;if(!enabled)stop();}};
}
