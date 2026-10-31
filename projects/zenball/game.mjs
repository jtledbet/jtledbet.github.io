// Browser port of zenball/core/Game.java. Fixed-step, platform-independent model.
export const TARGETS = [[120,210],[360,210],[240,320]];
export const NAMES = ['GROVE','FORGE','WELL'];
export class Game {
  constructor() {
    Object.assign(this,{mode:'ready',x:400,y:590,vx:0,vy:0,focus:100,level:1,xp:0,score:0,points:0,precision:0,power:0,calm:0,selected:-1,combo:0,message:'Launch into the garden.',left:false,right:false,accumulator:0,leftAngle:.4,rightAngle:Math.PI-.4,resumeMode:'play',cooldown:0});
    this.glow=[0,0,0];this.hits=[0,0,0];
  }
  launch(){if(this.mode!=='ready')return;Object.assign(this,{x:400,y:460,vx:-100,vy:-760,mode:'play',message:'Three Grove hits open the first branch.'});}
  toggleFocus(){if(this.mode==='play'&&this.focus>=25){this.mode='focus';this.selected=-1;this.message='Choose a target. Commit spends 25 focus.';}else if(this.mode==='focus'){this.mode='play';this.selected=-1;this.message='Flow resumed.';}else if(this.mode==='play'){this.message='Focus is recovering. The Well restores 20.';}}
  select(i){if(this.mode==='focus'&&Number.isInteger(i)&&i>=0&&i<3)this.selected=i;}
  shot(i){const [tx,ty]=TARGETS[i];const time=Math.max(.25,Math.min(.75,Math.hypot(tx-this.x,ty-this.y)/(650+this.power*65)));return [(tx-this.x)/time,(ty-this.y-180*time*time)/time];}
  commit(){if(this.mode!=='focus'||this.selected<0||this.focus<25)return;[this.vx,this.vy]=this.shot(this.selected);this.focus-=25;this.mode='play';this.message=`Committed to ${NAMES[this.selected]}. Physics takes over.`;this.selected=-1;}
  action(){if(this.mode==='ready')this.launch();else if(this.mode==='paused')this.resume();else if(this.mode==='focus'&&this.selected>=0)this.commit();else this.toggleFocus();}
  pause(){if(this.mode==='paused')return;this.resumeMode=this.mode;this.mode='paused';this.left=this.right=false;this.accumulator=0;}
  resume(){if(this.mode==='paused'){this.mode=this.resumeMode;this.accumulator=0;}}
  upgrade(i){if(this.mode!=='upgrade'||this.points<1||!Number.isInteger(i)||i<0||i>2)return;this[['precision','power','calm'][i]]++;this.points--;this.mode=this.points?'upgrade':'play';this.message=['Sight deepened: longer trajectory preview.','Force deepened: stronger shots and forge rewards.','Stillness deepened: faster focus recovery.'][i];}
  advance(seconds){if(this.mode!=='play'){this.accumulator=0;return;}if(!Number.isFinite(seconds))return;this.accumulator+=Math.max(0,Math.min(seconds,.1));const step=1/240;while(this.accumulator+1e-12>=step&&this.mode==='play'){this.tick(step);this.accumulator-=step;}}
  tick(dt){
    this.glow=this.glow.map(n=>Math.max(0,n-dt*2));this.cooldown=Math.max(0,this.cooldown-dt);this.focus=Math.min(100,this.focus+dt*(3+this.calm*2));
    this.vy+=360*dt;this.x+=this.vx*dt;this.y+=this.vy*dt;
    if(this.x<30){this.x=30;this.vx=Math.abs(this.vx)*.94;}if(this.x>450){this.x=450;this.vx=-Math.abs(this.vx)*.94;}if(this.y<130){this.y=130;this.vy=Math.abs(this.vy)*.94;}
    this.segment(30,490,135,620);this.segment(450,490,345,620);
    const la=this.leftAngle,ra=this.rightAngle,approach=(a,b)=>a+Math.max(-dt*14,Math.min(dt*14,b-a));
    this.leftAngle=approach(la,this.left?-.48:.4);this.rightAngle=approach(ra,this.right?Math.PI+.48:Math.PI-.4);
    this.flipper(135,this.leftAngle,(this.leftAngle-la)/dt);this.flipper(345,this.rightAngle,(this.rightAngle-ra)/dt);
    for(let i=0;i<3;i++){let dx=this.x-TARGETS[i][0],dy=this.y-TARGETS[i][1],d=Math.hypot(dx,dy);if(d>=35)continue;if(d<.001){dx=0;dy=1;d=1;}const nx=dx/d,ny=dy/d;this.x=TARGETS[i][0]+nx*35;this.y=TARGETS[i][1]+ny*35;const dot=this.vx*nx+this.vy*ny;if(dot<0){this.vx+=(-2*dot+90)*nx;this.vy+=(-2*dot+90)*ny;if(this.cooldown===0){this.hit(i);this.cooldown=.08;}}}
    const speed=Math.hypot(this.vx,this.vy);if(speed>1100){this.vx*=1100/speed;this.vy*=1100/speed;}
    if(this.y>730){Object.assign(this,{mode:'ready',combo:0,focus:Math.max(50,this.focus),message:'A breath. Launch again; your growth remains.',x:400,y:590,vx:0,vy:0});}
  }
  hit(i){this.hits[i]++;this.glow[i]=1;this.combo++;this.score+=i===1?50+this.power*25:25;if(i===0){this.xp+=10;this.message='Grove +10 growth';}if(i===1)this.message=`Forge +${50+this.power*25} score`;if(i===2){this.focus=Math.min(100,this.focus+20);this.xp+=5;this.message='Well +20 focus / +5 growth';}if(this.xp>=this.level*30){this.xp-=this.level*30;this.level++;this.points++;this.mode='upgrade';this.left=this.right=false;this.message='A new branch. Choose how you grow.';}}
  flipper(px,angle,omega){this.segment(px,620,px+85*Math.cos(angle),620+85*Math.sin(angle),px,620,omega);}
  segment(ax,ay,bx,by,px=0,py=0,omega=0){const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((this.x-ax)*dx+(this.y-ay)*dy)/(dx*dx+dy*dy))),cx=ax+t*dx,cy=ay+t*dy;let nx=this.x-cx,ny=this.y-cy,d=Math.hypot(nx,ny);if(d>=16)return;if(d<.001){nx=0;ny=-1;d=1;}nx/=d;ny/=d;this.x=cx+nx*16;this.y=cy+ny*16;const sx=-omega*(cy-py),sy=omega*(cx-px),impact=(this.vx-sx)*nx+(this.vy-sy)*ny;if(impact<0){this.vx-=1.8*impact*nx;this.vy-=1.8*impact*ny;}}
  preview(i,t){const [vx,vy]=this.shot(i);return[this.x+vx*t,this.y+vy*t+180*t*t];}
  save(){return[1,this.level,this.xp,this.score,this.precision,this.power,this.calm,this.points].join(',');}
  restore(text){if(typeof text!=='string')return;const s=text.split(',');if(s.length!==8||s[0]!=='1'||s.some(x=>!/^\d+$/.test(x)))return;const n=s.slice(1).map(Number);if(n.some(x=>!Number.isSafeInteger(x)||x<0||x>1e6)||n[0]<1||n[1]>=n[0]*30||n[3]+n[4]+n[5]+n[6]!==n[0]-1)return;[this.level,this.xp,this.score,this.precision,this.power,this.calm,this.points]=n;if(this.points)this.mode='upgrade';}
}
