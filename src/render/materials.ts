import {weatherUniform,cloudUniforms,cloudLighting} from './weather.js';

const TIMBER=new Set(['#86603c','#a97b48','#bd955e','#715337','#b48b55','#ddba78','#e4c68c','#a86d46','#382f27','#6e4a31','#9f7248','#4b382a','#42352d','#775039','#9b6d43','#493f31','#b89562','#d1ae73','#c6a16b','#70573c','#895738','#a06c43','#775137','#ba9560','#b5945b','#493c2d','#98774b','#694b32','#9d7846','#88623e','#7d5a37','#946a41','#9c7848','#d4b276','#8a643f','#98764c','#705135','#c2a36c','#765539','#ba9764','#98774e','#b28e59','#6e5034','#c6a16c','#d6b67b']);
const METAL=new Set(['#bda262','#ccad67','#b99b57','#263b3b','#354442','#2b2f30','#7e8d84']);
export function materialKind(color:string){return METAL.has(color)?2:TIMBER.has(color)?1:0;}

export function maritimeSurface(kind:number){return {
 uniforms:{wet:weatherUniform,grainKind:{value:kind},...cloudUniforms},
 light:cloudLighting,
 vertex:`fn vertex(v: Vertex) -> Vertex {var o=v;o.v1=vec4f(v.position,1.0);return o;}`,
 surface:`
 fn surface(s: Surface) -> Surface {
  var o=s;let p=s.v1.xyz;let kind=uniforms.grainKind;
  if(kind<1.5){
   let ring=sin(p.z*95.0+sin(p.x*13.0+p.z*8.0)*2.5+sin(p.y*19.0));
   let fiber=sin(p.z*430.0+p.x*7.0)*sin(p.x*31.0+p.y*11.0);
   let pores=pow(max(0.0,sin(p.z*290.0+p.x*123.0)*sin(p.y*171.0+p.x*59.0)),9.0);
   o.base_color=vec4f(s.base_color.rgb*(0.92+ring*0.065+fiber*0.025-pores*0.13)*(1.0-uniforms.wet*0.27),s.base_color.a);
   o.roughness=clamp(s.roughness+ring*0.06-uniforms.wet*0.42,0.22,0.98);
   o.normal=normalize(s.normal+vec3f(fiber*0.025,ring*0.018,pores*0.02));
  }else{
   let patina=0.5+0.5*sin(p.x*41.0+sin(p.z*23.0))*sin(p.y*35.0);
   o.roughness=clamp(s.roughness+patina*0.16-uniforms.wet*0.18,0.16,0.85);
   o.base_color=vec4f(s.base_color.rgb*(0.86+patina*0.14),s.base_color.a);
  }return o;
 }`
};}

export const terrainSurface={uniforms:{wet:weatherUniform,...cloudUniforms},light:cloudLighting,surface:`
 fn surface(s: Surface) -> Surface {
  var o=s;let p=s.world;
  let grit=sin(p.x*19.0+sin(p.z*7.3))*sin(p.z*21.0+p.y*17.0);
  let strata=sin(p.y*11.0+sin(p.x*0.8+p.z*.6)*.8);
  let wetShore=(1.0-smoothstep(-2.2,1.6,p.y))*.35+uniforms.wet*.2;
  o.base_color=vec4f(s.base_color.rgb*(0.94+grit*.055+strata*.035)*(1.0-wetShore),s.base_color.a);
  o.roughness=clamp(.92-wetShore*.9+grit*.04,.28,1.0);
  o.normal=normalize(s.normal+vec3f(grit*.07,0.0,strata*.04));return o;
 }`};
