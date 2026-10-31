import * as draw from 'starhermit:draw';
import * as ui from 'starhermit:ui';
const gold='#e6c47e',ink='#acc8be';
function triangle(x:number,y:number,r:number,heading:number,color:string){const p:number[][]=[];for(const [angle,length] of [[0,1],[2.5,.65],[-2.5,.65]])p.push([x+Math.sin(heading+angle)*r*length,y+Math.cos(heading+angle)*r*length]);draw.polygon(p as [number,number][],color);}
export function seaChart(w:number,h:number,sc:number,mobile:boolean,state:any,places:any[],poses:any,selected:string,onSelect:(id:string)=>void,onSail:(id:string)=>void,font='serif'){
 if(!state?.myShip)return;const lw=w/sc,lh=h/sc,narrow=lw<420,x=(mobile?10:264)*sc,y=(mobile?(narrow?286:244):196)*sc,width=(mobile?lw-20:lw-576)*sc,height=Math.max(110,lh-181-y/sc)*sc;
 draw.box(x,y,width,height,'chart');
 draw.text(narrow?'THE QUARRELSOME SEA':'CHART OF THE QUARRELSOME SEA',x+14*sc,y+12*sc,{size:(narrow?11:15)*sc,font,color:gold});
 const top=y+34*sc,bottom=y+height-52*sc,span=Math.max(50,Math.min(width-44*sc,bottom-top-12*sc)),cx=x+width/2,cy=(top+bottom)/2,k=span/118;
 const point=(p:any)=>({x:cx+p.x*k,y:cy+p.z*k});
 // Chart graticule and rhumb lines are clipped to the usable plot.
 for(let i=-2;i<=2;i++){const d=i*20*k;draw.line(cx-span/2,cy+d,cx+span/2,cy+d,'#92b49d19',1);draw.line(cx+d,cy-span/2,cx+d,cy+span/2,'#92b49d19',1);}
 for(let i=0;i<8;i++){const a=i*Math.PI/4;draw.line(cx,cy,cx+Math.sin(a)*span*.56,cy+Math.cos(a)*span*.56,'#c1ba8620',1);}
 const own=poses[state.myShip.id]||state.myShip,here=point(own),dest=places.find(p=>p.id===state.myShip.destination)||state.raiders.concat(state.ships).find((p:any)=>'ship:'+p.id===state.myShip.destination);
 if(dest){const to=point(dest);for(let i=0;i<15;i+=2){const a=i/15,b=(i+1)/15;draw.line(here.x+(to.x-here.x)*a,here.y+(to.y-here.y)*a,here.x+(to.x-here.x)*b,here.y+(to.y-here.y)*b,gold,1.5*sc);}}
 for(let i=0;i<places.length;i++){
  const p=places[i],at=point(p),r=(narrow?7:11)*sc;
  if(p.kind==='wreck'){draw.line(at.x-r,at.y+r*.4,at.x+r,at.y-r*.4,'#cfaf79',4*sc);draw.line(at.x,at.y+4*sc,at.x-2*sc,at.y-r,'#eee0b0',1.5*sc);}
  else{const edge:[number,number][]=[],land:[number,number][]=[];for(let j=0;j<12;j++){const a=j/12*Math.PI*2,rr=r*(1+.12*Math.sin(j*2.7+i));edge.push([at.x+Math.cos(a)*rr*1.18,at.y+Math.sin(a)*rr*.88]);land.push([at.x+Math.cos(a)*rr*.9,at.y+Math.sin(a)*rr*.64]);}draw.polygon(edge,'#c7bb87');draw.polygon(land,p.id==='winterwake'?'#a9bbaa':p.id==='cinder'?'#7d8972':'#73986c');
   if(p.kind==='port'){draw.box(at.x-3*sc,at.y-4*sc,6*sc,6*sc,{background:'#e7d3aa'});draw.polygon([[at.x-4*sc,at.y-4*sc],[at.x,at.y-8*sc],[at.x+4*sc,at.y-4*sc]],'#b98761');}else{draw.line(at.x,at.y+2*sc,at.x,at.y-5*sc,'#335d48',2*sc);draw.line(at.x-3*sc,at.y-4*sc,at.x+3*sc,at.y-4*sc,'#335d48',2*sc);}}
  if(selected===p.id)draw.strokeCircle(at.x,at.y,r+5*sc,gold,1.5*sc);
  if(!narrow||selected===p.id)draw.text(p.name,at.x,at.y+r+7*sc,{size:(narrow?9:10)*sc,color:selected===p.id?gold:ink,align:'center'});
  ui.area({x:at.x-14*sc,y:at.y-14*sc,width:28*sc,height:28*sc},()=>{const hit=ui.widget(p.name+' chart marker',{role:'button',size:{width:28,height:28},draw:()=>{}});if(hit.activated)onSelect(p.id);});
 }
 for(const ship of state.ships.concat(state.raiders)){if(ship.hull<=0)continue;const pose=poses[ship.id]||ship,at=point(pose);triangle(at.x,at.y,(ship.id===state.myShip.id?7:5)*sc,pose.heading||0,ship.id===state.myShip.id?gold:ship.npc?'#df927a':'#b1d7cc');}
 draw.text('N',cx,top-6*sc,{size:10*sc,color:gold,align:'center'});draw.line(x+15*sc,bottom-4*sc,x+15*sc+10*k,bottom-4*sc,ink,2*sc);if(!narrow)draw.text('100 m',x+15*sc,bottom-18*sc,{size:9*sc,color:ink});
 const destination=places.find(p=>p.id===selected)!;
 ui.area({x:x+12*sc,y:y+height-42*sc,width:width-24*sc,height:38*sc},()=>ui.row('Chart destination',()=>{ui.label(destination.name,{size:narrow?11:13,color:gold});ui.spacer();if(ui.style('gold').button('Sail here'))onSail(destination.id);},{width:width/sc-24,align:'center',spacing:6}));
}
