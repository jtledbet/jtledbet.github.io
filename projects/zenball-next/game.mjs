// Browser development model. The Java host remains at the preserved baseline.
import {PHYSICS,TABLE,limitSpeed,integrate,circleContact,segmentContact,wallContacts} from './physics.mjs?v=0.1.0';
export {TABLE} from './physics.mjs?v=0.1.0';
export const TARGETS = [[120,210],[360,210],[240,320]];
export const NAMES = ['GROVE','FORGE','WELL'];
export const LAUNCH = Object.freeze({x:400,y:460,drawDistance:48,chargeSeconds:1.4,minSpeed:520,maxSpeed:880});
export class Game {
  constructor() {
    Object.assign(this,{mode:'ready',x:LAUNCH.x,y:LAUNCH.y,vx:0,vy:0,drawing:false,drawCharge:0,manualDraw:false,focus:100,level:1,xp:0,score:0,points:0,precision:0,power:0,calm:0,selected:-1,combo:0,message:'Launch into the garden.',left:false,right:false,accumulator:0,leftAngle:.4,rightAngle:Math.PI-.4,resumeMode:'play'});
    this.glow=[0,0,0];this.hits=[0,0,0];this.bumperCooldown=[0,0,0];this.slingCooldown=[0,0];
  }
  beginDraw(){if(this.mode!=='ready'||this.drawing)return false;this.drawing=true;this.drawCharge=0;this.manualDraw=false;return true;}
  setDraw(value){if(!this.drawing||this.mode!=='ready'||!Number.isFinite(value))return;this.manualDraw=true;this.drawCharge=Math.max(0,Math.min(1,value));this.y=LAUNCH.y+this.drawCharge*LAUNCH.drawDistance;}
  cancelDraw(){this.drawing=false;this.drawCharge=0;this.manualDraw=false;if(this.mode==='ready'){this.x=LAUNCH.x;this.y=LAUNCH.y;}}
  releaseDraw(){if(this.mode!=='ready'||!this.drawing)return false;return this.launch(this.drawCharge);}
  launch(strength=2/3){if(this.mode!=='ready'||!Number.isFinite(strength))return false;strength=Math.max(0,Math.min(1,strength));Object.assign(this,{x:LAUNCH.x,y:this.drawing?this.y:LAUNCH.y,vx:-100,vy:-(LAUNCH.minSpeed+(LAUNCH.maxSpeed-LAUNCH.minSpeed)*strength),mode:'play',message:'Three Grove hits open the first branch.'});this.cancelDraw();return true;}
  toggleFocus(){if(this.mode==='play'&&this.focus>=25){this.mode='focus';this.selected=-1;this.message='Choose a target. Commit spends 25 focus.';}else if(this.mode==='focus'){this.mode='play';this.selected=-1;this.message='Flow resumed.';}else if(this.mode==='play'){this.message='Focus is recovering. The Well restores 20.';}}
  select(i){if(this.mode==='focus'&&Number.isInteger(i)&&i>=0&&i<3)this.selected=i;}
  shot(i){const [tx,ty]=TARGETS[i];const time=Math.max(.25,Math.min(.75,Math.hypot(tx-this.x,ty-this.y)/(650+this.power*65)));const velocity={vx:(tx-this.x)/time,vy:(ty-this.y-.5*PHYSICS.gravity*time*time)/time};limitSpeed(velocity);return [velocity.vx,velocity.vy];}
  commit(){if(this.mode!=='focus'||this.selected<0||this.focus<25)return;[this.vx,this.vy]=this.shot(this.selected);this.focus-=25;this.mode='play';this.message=`Committed to ${NAMES[this.selected]}. Physics takes over.`;this.selected=-1;}
  action(){if(this.mode==='ready'){if(this.drawing)this.releaseDraw();else this.launch();}else if(this.mode==='paused')this.resume();else if(this.mode==='focus'&&this.selected>=0)this.commit();else this.toggleFocus();}
  pause(){if(this.mode==='paused')return;this.cancelDraw();this.resumeMode=this.mode;this.mode='paused';this.left=this.right=false;this.accumulator=0;}
  resume(){if(this.mode==='paused'){this.mode=this.resumeMode;this.accumulator=0;}}
  upgrade(i){if(this.mode!=='upgrade'||this.points<1||!Number.isInteger(i)||i<0||i>2)return;this[['precision','power','calm'][i]]++;this.points--;this.mode=this.points?'upgrade':'play';this.message=['Sight deepened: longer trajectory preview.','Force deepened: stronger shots and forge rewards.','Stillness deepened: faster focus recovery.'][i];}
  advance(seconds){if(!Number.isFinite(seconds))return;const elapsed=Math.max(0,Math.min(seconds,.1));if(this.mode!=='play'){this.accumulator=0;if(this.mode==='ready'&&this.drawing&&!this.manualDraw){this.drawCharge=Math.min(1,this.drawCharge+elapsed/LAUNCH.chargeSeconds);this.y=LAUNCH.y+this.drawCharge*LAUNCH.drawDistance;}return;}this.accumulator+=elapsed;while(this.accumulator+1e-12>=PHYSICS.step&&this.mode==='play'){this.tick(PHYSICS.step);this.accumulator-=PHYSICS.step;}}
  tick(dt){
    this.glow=this.glow.map(n=>Math.max(0,n-dt*2));this.bumperCooldown=this.bumperCooldown.map(n=>Math.max(0,n-dt));this.slingCooldown=this.slingCooldown.map(n=>Math.max(0,n-dt));this.focus=Math.min(100,this.focus+dt*(3+this.calm*2));
    integrate(this,dt);wallContacts(this);
    for(const [i,ax,bx] of [[0,30,135],[1,450,345]]) {
      const active=this.slingCooldown[i]===0;
      if(segmentContact(this,ax,490,bx,TABLE.flipperY,TABLE.guideRadius,{kick:active?PHYSICS.slingKick:0})&&active)this.slingCooldown[i]=PHYSICS.slingCooldown;
    }
    const la=this.leftAngle,ra=this.rightAngle,approach=(a,b)=>a+Math.max(-dt*14,Math.min(dt*14,b-a));
    this.leftAngle=approach(la,this.left?-.48:.4);this.rightAngle=approach(ra,this.right?Math.PI+.48:Math.PI-.4);
    this.flipper(135,this.leftAngle,(this.leftAngle-la)/dt);this.flipper(345,this.rightAngle,(this.rightAngle-ra)/dt);
    for(let i=0;i<3;i++) {
      const active=this.bumperCooldown[i]===0;
      if(circleContact(this,...TARGETS[i],TABLE.bumperRadius,{kick:active?PHYSICS.bumperKick:0})&&active){this.bumperCooldown[i]=PHYSICS.bumperCooldown;this.hit(i);}
    }
    limitSpeed(this);
    if(this.y>TABLE.drain){Object.assign(this,{mode:'ready',combo:0,focus:Math.max(50,this.focus),message:'A breath. Launch again; your growth remains.',x:LAUNCH.x,y:LAUNCH.y,vx:0,vy:0});this.cancelDraw();}
  }
  hit(i){this.hits[i]++;this.glow[i]=1;this.combo++;this.score+=i===1?50+this.power*25:25;if(i===0){this.xp+=10;this.message='Grove +10 growth';}if(i===1)this.message=`Forge +${50+this.power*25} score`;if(i===2){this.focus=Math.min(100,this.focus+20);this.xp+=5;this.message='Well +20 focus / +5 growth';}if(this.xp>=this.level*30){this.xp-=this.level*30;this.level++;this.points++;this.mode='upgrade';this.left=this.right=false;this.message='A new branch. Choose how you grow.';}}
  flipper(px,angle,omega){segmentContact(this,px,TABLE.flipperY,px+TABLE.flipperLength*Math.cos(angle),TABLE.flipperY+TABLE.flipperLength*Math.sin(angle),TABLE.flipperRadius,{restitution:.8,damping:1},px,TABLE.flipperY,omega);}
  preview(i,t){const [vx,vy]=this.shot(i);return[this.x+vx*t,this.y+vy*t+.5*PHYSICS.gravity*t*t];}
  save(){return[1,this.level,this.xp,this.score,this.precision,this.power,this.calm,this.points].join(',');}
  restore(text){if(typeof text!=='string')return;const s=text.split(',');if(s.length!==8||s[0]!=='1'||s.some(x=>!/^\d+$/.test(x)))return;const n=s.slice(1).map(Number);if(n.some(x=>!Number.isSafeInteger(x)||x<0||x>1e6)||n[0]<1||n[1]>=n[0]*30||n[3]+n[4]+n[5]+n[6]!==n[0]-1)return;[this.level,this.xp,this.score,this.precision,this.power,this.calm,this.points]=n;if(this.points)this.mode='upgrade';}
}
