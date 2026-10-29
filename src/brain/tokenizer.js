// GPT-2 byte-level BPE used by SmolLM2 (digits are split individually).
export class Tokenizer {
 constructor(data){
  this.ids=new Map(data.tokens.map((t,i)=>[t,i]));
  this.ranks=new Map(data.merges.map((m,i)=>[m,i]));this.cache=new Map();
  const bytes=[];for(let i=33;i<=126;i++)bytes.push(i);for(let i=161;i<=172;i++)bytes.push(i);for(let i=174;i<=255;i++)bytes.push(i);
  const chars=bytes.slice();let n=0;for(let i=0;i<256;i++)if(!bytes.includes(i)){bytes.push(i);chars.push(256+n++);}
  this.byteChars=[];for(let i=0;i<256;i++)this.byteChars[bytes[i]]=String.fromCharCode(chars[i]);
 }
 encode(text){
  const out=[];
  // Special tokens are supplied by us; player text is escaped by the prompt builder.
  for(const part of text.split(/(<\|im_start\|>|<\|im_end\|>)/)){
   if(this.ids.has(part)&&part.startsWith('<|')){out.push(this.ids.get(part));continue;}
   for(const digitPart of part.split(/(\p{N})/u)){
    const words=digitPart.match(/'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu)||[];
    for(const word of words){
     let encoded=this.cache.get(word);
     if(!encoded){
      let pieces=Array.from(new TextEncoder().encode(word),b=>this.byteChars[b]);
      while(pieces.length>1){
       let best=-1,rank=Infinity;
       for(let i=0;i<pieces.length-1;i++){const r=this.ranks.get(pieces[i]+' '+pieces[i+1]);if(r!==undefined&&r<rank){rank=r;best=i;}}
       if(best<0)break;pieces.splice(best,2,pieces[best]+pieces[best+1]);
      }
      encoded=pieces.map(p=>{const id=this.ids.get(p);if(id===undefined)throw Error('Unknown tokenizer piece');return id;});
      if(this.cache.size>2048)this.cache.clear();this.cache.set(word,encoded);
     }
     out.push(...encoded);
    }
   }
  }
  return out;
 }
}
