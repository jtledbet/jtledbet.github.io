import {PHYSICS} from './physics.mjs?v=physics-1';

const C=Object.freeze({bg:'#162b33',ink:'#e6e9df',muted:'#8da4a7',teal:'#79d7bb',gold:'#e8bf79'});
function circle(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
function line(ctx,x,y,xx,yy,w,color){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}
function text(ctx,s,x,y,size,color){ctx.fillStyle=color;ctx.font=`${size}px system-ui,sans-serif`;ctx.textAlign='center';ctx.fillText(s,x,y);}

export class TableRenderer {
  constructor(canvas,targets,names,table,launch) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.base=canvas.ownerDocument.createElement('canvas');this.baseCtx=this.base.getContext('2d',{alpha:false});
    this.targets=targets;this.names=names;this.table=table;this.launch=launch;
    this.staticBuilds=0;this.frames=0;this.sx=1;this.sy=1;
  }
  resize(width,height,dpr) {
    const w=Math.max(1,Math.round(width*dpr)),h=Math.max(1,Math.round(height*dpr));
    if(this.canvas.width===w&&this.canvas.height===h&&this.staticBuilds)return;
    this.canvas.width=this.base.width=w;this.canvas.height=this.base.height=h;
    this.sx=w/480;this.sy=h/620;this.paintBase();
  }
  paintBase() {
    const ctx=this.baseCtx,T=this.table;
    ctx.setTransform(this.sx,0,0,this.sy,0,-120*this.sy);ctx.fillStyle=C.bg;ctx.fillRect(0,120,480,620);
    for(let i=0;i<10;i++)line(ctx,30,145+i*55,450,145+i*55,1,'#1e353d');
    line(ctx,20,120,20,730,3,'#35565b');line(ctx,460,120,460,730,3,'#35565b');line(ctx,20,120,460,120,3,'#35565b');
    circle(ctx,240,385,84,'#213b42');circle(ctx,240,385,81,C.bg);text(ctx,'B R E A T H E',240,422,13,'#52727a');
    for(let i=0;i<3;i++){
      const x=this.targets[i][0],y=this.targets[i][1];
      circle(ctx,x,y,39,'#29474c');this.bumper(ctx,x,y,i);
      text(ctx,this.names[i],x,y+60,13,C.ink);text(ctx,i===0?'GROWTH':i===1?'SCORE':'FOCUS',x,y+78,10,C.muted);
    }
    line(ctx,30,490,135,T.flipperY,T.guideRadius*2,'#35565b');line(ctx,450,490,345,T.flipperY,T.guideRadius*2,'#35565b');
    text(ctx,'F R E E   P L A Y',240,708,11,'#52727a');this.staticBuilds++;
  }
  bumper(ctx,x,y,i){const color=i===1?C.gold:C.teal;circle(ctx,x,y,this.table.bumperRadius,color);circle(ctx,x,y,20,'#203c43');text(ctx,String(i+1),x,y+6,17,color);}
  draw(game,now,effects,reduced=false) {
    const ctx=this.ctx,T=this.table,L=this.launch;
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(this.base,0,0);ctx.setTransform(this.sx,0,0,this.sy,0,-120*this.sy);
    if(!reduced)effects.draw(ctx,C);
    if(game.selected>=0){const i=game.selected,x=this.targets[i][0],y=this.targets[i][1];circle(ctx,x,y,36,C.ink);this.bumper(ctx,x,y,i);}
    const leftX=135+T.flipperLength*Math.cos(game.leftAngle),leftY=T.flipperY+T.flipperLength*Math.sin(game.leftAngle);
    const rightX=345+T.flipperLength*Math.cos(game.rightAngle),rightY=T.flipperY+T.flipperLength*Math.sin(game.rightAngle);
    line(ctx,135,T.flipperY,leftX,leftY,T.flipperRadius*2,C.teal);line(ctx,345,T.flipperY,rightX,rightY,T.flipperRadius*2,C.teal);
    if(game.left){ctx.globalAlpha=.28;line(ctx,139,T.flipperY,leftX,leftY,3,C.ink);ctx.globalAlpha=1;}
    if(game.right){ctx.globalAlpha=.28;line(ctx,341,T.flipperY,rightX,rightY,3,C.ink);ctx.globalAlpha=1;}
    if(game.mode==='ready'){
      const q=game.drawCharge,breath=reduced?0:Math.sin(now*Math.PI/4)*2;
      line(ctx,L.x,L.y+22,L.x,L.y+L.drawDistance+24,2,'#35565b');
      for(let i=0;i<2;i++){const y=L.y+58+i*10;line(ctx,L.x-5,y-4,L.x,y,1.5,C.muted);line(ctx,L.x,y,L.x+5,y-4,1.5,C.muted);}
      ctx.globalAlpha=.35+q*.45;ctx.strokeStyle=C.teal;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(L.x-23,L.y-17);ctx.quadraticCurveTo(L.x-25,game.y+12,L.x,game.y+18);ctx.quadraticCurveTo(L.x+25,game.y+12,L.x+23,L.y-17);ctx.stroke();
      ctx.beginPath();ctx.arc(game.x,game.y,22+q*6+breath,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.08,q));ctx.stroke();ctx.globalAlpha=1;
    }
    if(game.mode==='focus'&&game.selected>=0){
      const velocity=game.shot(game.selected),end=Math.min(2,.35+game.precision*.15);let px=game.x,py=game.y;
      ctx.setLineDash([5,5]);
      for(let t=.02;t<end;t+=.02){const x=game.x+velocity[0]*t,y=game.y+velocity[1]*t+.5*PHYSICS.gravity*t*t;line(ctx,px,py,x,y,2,C.gold);px=x;py=y;if(x<30||x>450||y<130||y>730)break;}
      ctx.setLineDash([]);
    }
    circle(ctx,game.x,game.y,15,'#34575b');circle(ctx,game.x,game.y,T.ballRadius,C.ink);circle(ctx,game.x-2,game.y-3,3,'white');this.frames++;
  }
}
