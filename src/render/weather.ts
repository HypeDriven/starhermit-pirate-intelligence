import {Vector3,Vector4} from 'starhermit:scene';
// Shared by materials and the graphics controller without a scene import cycle.
export const weatherUniform={value:0};
export const cloudFields=Array.from({length:16},()=>new Vector4());
export const cloudSun=new Vector3(-.5,.65,.4).normalize();
export const cloudUniforms={clouds:{value:cloudFields},cloudSun:{value:cloudSun}};
export const cloudLighting=`
 fn light(l: Light) -> Light {
  var o=l;var transmission=1.0;
  for(var i=0;i<16;i++){
   let c=uniforms.clouds[i];if(c.w<=0.0){break;}
   let p=l.world.xz+uniforms.cloudSun.xz*(180.0-l.world.y)/max(0.1,uniforms.cloudSun.y);
   let d=length((p-c.xy)/vec2f(c.z,c.z*.8));
   transmission=transmission*(1.0-(1.0-smoothstep(.25,1.0,d))*c.w);
  }
  o.sun=l.sun*max(.18,transmission);return o;
 }`;
