export interface MessagePattern { source: string; id: string; protectedVariables: string[] }
export interface MessageIndex { direct: Record<string, string>; patterns: MessagePattern[] }
export function createTextTranslator(index: MessageIndex, lookup: (id: string, vars?: Record<string,string>) => string): {
  text<T>(value:T):T; keep<T>(value:T):T; options<T extends readonly unknown[]>(values:T):T;
  wrap(value:string,width:number,measure:(line:string)=>number):string[]; clear():void;
};
