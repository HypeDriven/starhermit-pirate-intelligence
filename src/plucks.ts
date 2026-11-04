import * as platform from 'starhermit:platform';

// The game can only ASK for a Pluck order. The player approves it on the
// StarHermit dashboard, outside the game, and the authority applies a design
// only when the platform reports the order paid (ctx.pluckOrders). Nothing here
// can spend, confirm or see the player's balance.
const api:any=(platform as any).plucks;
export const DASHBOARD='https://dashboard.starhermit.com';
export type Commission={designId:string,orderId:string,price:number,status:string,expiresAt:number,message:string};
export const commissions:Record<string,Commission>={};
export function plucksReady(online:boolean){return online&&!!api&&typeof api.order==='function';}
export function plucksStatus(online:boolean){
 if(!online)return 'Commissions need a signed-in StarHermit sea. Sketches are free in practice.';
 if(!api)return 'This StarHermit version cannot take Pluck commissions yet. Sketches are kept until it can.';
 return '';
}
// Both open calls need a player gesture (host API 1.33): call them from a button.
export function openApproval(orderId:string){try{Promise.resolve(api?.openConfirmation?.(orderId)).catch(()=>{});}catch{}}
export function openWallet(){
 // Buying Plucks happens on StarHermit, never inside the game.
 try{Promise.resolve(api?.openWallet?.()).catch(()=>{});}catch{}
}
export function walletReady(){return !!api&&typeof api.openWallet==='function';}
const ERRORS:Record<string,string>={too_many_pending_orders:'Too many commissions are waiting for approval on StarHermit.',rate_limited:'StarHermit asks the yard to slow down. Try again shortly.',invalid_note:'The commission note was refused.','not-found':'The shipwright is not taking that commission right now.'};
function explain(e:any){const code=e?.code||e?.kind||'';return ERRORS[code]||String(e?.message||e||'StarHermit refused the commission.').slice(0,120);}
export async function commission(design:any,designerName:string,send:(c:any)=>void){
 if(commissions[design.id]&&commissions[design.id].status==='pending')return;
 const c:Commission={designId:design.id,orderId:'',price:design.price,status:'asking',expiresAt:0,message:'Asking StarHermit…'};commissions[design.id]=c;
 try{
  const note=(designerName+'’s '+design.name.replace(/^The /,'')).replace(/[^\p{L}\p{N} ’'.,-]/gu,'').slice(0,140);
  const order=await api.order(design.item,{note});
  c.orderId=String(order.id);c.price=order.price;c.status='pending';c.expiresAt=typeof order.expiresAt==='number'?order.expiresAt:Date.parse(order.expiresAt)||Date.now()+900000;
  c.message='Press “Approve on StarHermit” and confirm '+order.price+' PLK in your dashboard.';
  send({type:'mod.ordered',designId:design.id,orderId:c.orderId});
  void watch(c,send);
 }catch(e){c.status='failed';c.message=explain(e);}
}
function settle(c:Commission,o:any,send:(c:any)=>void){
 if(c.status!=='pending'||!o)return false;
 if(o.status==='paid'){c.status='paid';c.message='Approved. The yard is at work.';return true;}
 if(o.status==='cancelled'||o.status==='expired'){c.status=o.status;c.message=o.status==='cancelled'?'Declined on StarHermit. No Plucks were spent.':'The approval window closed. Commission it again when ready.';send({type:'mod.cancel',designId:c.designId});return true;}
 return false;
}
function watch(c:Commission,send:(c:any)=>void){
 // The engine pushes status changes; the authority applies the design only
 // when the platform itself hands it the paid order.
 if(typeof api.watch==='function'){let stop:any=null;stop=api.watch(c.orderId,(o:any)=>{if(settle(c,o,send)&&stop)stop();});return;}
 const poll=async()=>{while(c.status==='pending'){await new Promise<void>(r=>setTimeout(r,4000));try{settle(c,await api.getOrder(c.orderId),send);}catch{}}};void poll();
}
