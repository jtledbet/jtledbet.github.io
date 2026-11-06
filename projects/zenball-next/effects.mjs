// Decorative state only. Pools are allocated once and never grow.
export const EFFECT_LIMITS = Object.freeze({rings:8,wake:12,wakeLife:.14});
const RING=8,WAKE=3;

export class TableEffects {
  constructor(targets,launch) {
    this.targets=targets;this.launch=launch;
    this.rings=new Float32Array(EFFECT_LIMITS.rings*RING);
    this.wake=new Float32Array(EFFECT_LIMITS.wake*WAKE);
    this.hits=new Float64Array(3);this.seeded=false;this.mode='';this.focus=0;
    this.ringCursor=0;this.wakeCursor=0;this.sampleAge=0;this.lastX=NaN;this.lastY=NaN;
  }
  clear() {
    this.rings.fill(0);this.wake.fill(0);this.ringCursor=this.wakeCursor=0;
    this.sampleAge=0;this.lastX=this.lastY=NaN;
  }
  ring(x,y,from,to,life,alpha,tone=0) {
    const p=this.ringCursor*RING,a=this.rings;
    a[p]=x;a[p+1]=y;a[p+2]=0;a[p+3]=life;a[p+4]=from;a[p+5]=to;a[p+6]=alpha;a[p+7]=tone;
    this.ringCursor=(this.ringCursor+1)%EFFECT_LIMITS.rings;
  }
  observe(game,reduced=false) {
    const reset=this.seeded&&(game.hits[0]<this.hits[0]||game.hits[1]<this.hits[1]||game.hits[2]<this.hits[2]);
    if(reduced||reset||(game.mode!=='play'&&game.mode!=='ready')||(game.mode==='ready'&&this.mode!=='ready'))this.clear();
    if(this.seeded&&!reset&&!reduced&&game.mode==='play'){
      for(let i=0;i<3;i++)if(game.hits[i]>this.hits[i])this.ring(this.targets[i][0],this.targets[i][1],33,61,.48,.24,i===1?1:0);
      if(this.mode==='ready')this.ring(this.launch.x,this.launch.y,19,62,.5,.23);
      if(this.mode==='focus'&&game.focus<this.focus-20)this.ring(game.x,game.y,12,38,.32,.19,2);
    }
    this.hits[0]=game.hits[0];this.hits[1]=game.hits[1];this.hits[2]=game.hits[2];
    this.mode=game.mode;this.focus=game.focus;this.seeded=true;
  }
  advance(game,seconds,reduced=false) {
    if(reduced||(game.mode!=='play'&&game.mode!=='ready')){this.clear();return;}
    const dt=Number.isFinite(seconds)?Math.max(0,Math.min(.1,seconds)):0;
    for(let p=0;p<this.rings.length;p+=RING)if(this.rings[p+3]>0){this.rings[p+2]+=dt;if(this.rings[p+2]>=this.rings[p+3])this.rings[p+3]=0;}
    for(let p=0;p<this.wake.length;p+=WAKE)if(this.wake[p+2]>0)this.wake[p+2]=Math.max(0,this.wake[p+2]-dt);
    if(game.mode!=='play')return;
    this.sampleAge+=dt;
    const dx=game.x-this.lastX,dy=game.y-this.lastY;
    if(this.sampleAge>=1/90&&(!Number.isFinite(dx)||dx*dx+dy*dy>=4)){
      const p=this.wakeCursor*WAKE;this.wake[p]=game.x;this.wake[p+1]=game.y;this.wake[p+2]=EFFECT_LIMITS.wakeLife;
      this.wakeCursor=(this.wakeCursor+1)%EFFECT_LIMITS.wake;this.lastX=game.x;this.lastY=game.y;this.sampleAge=0;
    }
  }
  get ringCount(){let n=0;for(let p=3;p<this.rings.length;p+=RING)if(this.rings[p]>0)n++;return n;}
  get wakeCount(){let n=0;for(let p=2;p<this.wake.length;p+=WAKE)if(this.wake[p]>0)n++;return n;}
  get active(){return this.ringCount>0||this.wakeCount>0;}
  draw(ctx,colors) {
    ctx.fillStyle=colors.teal;
    for(let p=0;p<this.wake.length;p+=WAKE){const life=this.wake[p+2];if(life<=0)continue;const f=life/EFFECT_LIMITS.wakeLife;ctx.globalAlpha=f*f*.17;ctx.beginPath();ctx.arc(this.wake[p],this.wake[p+1],2+f*2,0,Math.PI*2);ctx.fill();}
    for(let p=0;p<this.rings.length;p+=RING){
      const life=this.rings[p+3];if(life<=0)continue;
      const t=this.rings[p+2]/life,fade=(1-t)*(1-t),r=this.rings[p+4]+(this.rings[p+5]-this.rings[p+4])*t;
      ctx.globalAlpha=this.rings[p+6]*fade;ctx.strokeStyle=this.rings[p+7]===1?colors.gold:this.rings[p+7]===2?colors.ink:colors.teal;ctx.lineWidth=1.6;
      ctx.beginPath();ctx.arc(this.rings[p],this.rings[p+1],r,0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha*=.45;ctx.fillStyle=ctx.strokeStyle;
      const offset=r*.707;ctx.beginPath();ctx.arc(this.rings[p]-offset,this.rings[p+1]-offset,1.5,0,Math.PI*2);ctx.moveTo(this.rings[p]+offset+1.5,this.rings[p+1]+offset);ctx.arc(this.rings[p]+offset,this.rings[p+1]+offset,1.5,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
}
