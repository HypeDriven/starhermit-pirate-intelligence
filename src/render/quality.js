// Follow the runtime's live level, including Auto stepping down under load.
// Infinite deliberately retains the engine's 2x scale (8K internal at 4K).
export function visualProfile(index) {
 const i=Math.max(0,Math.min(9,Math.floor(Number(index)||0)));
 return Object.freeze({
  index:i, fft:i>=4, oceanResolution:i<5?64:i<7?128:i<9?256:512,
  oceanSegments:[48,64,80,96,128,160,192,256,320,384][i],
  reflections:i>=4, reflectionScale:[0,0,0,0,.25,.35,.5,.65,.8,1][i],
  reflectionWidth:[0,0,0,0,768,1024,1280,1920,2560,3840][i],
  clouds:[0,0,0,3,4,5,7,9,12,16][i],
  volumeSteps:[8,8,12,16,24,32,48,64,96,128][i],
  volumeShadows:[0,0,0,1,2,3,4,5,6,8][i],
  combatVolumes:[0,0,0,2,4,6,8,12,18,24][i],
  fireVolumes:[0,0,0,1,2,2,3,4,6,8][i],
  hazeSteps:[0,0,0,4,6,8,12,16,24,32][i],
  wakeSegments:[12,16,20,24,32,40,48,64,80,95][i],
  clothShips:i<5?2:i<8?4:8,
 });
}
