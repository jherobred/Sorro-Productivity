export type JavaToken={text:string;kind?:'comment'|'string'|'keyword'|'number'|'annotation'|'type'};
const keywords=new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public record return sealed short static strictfp super switch synchronized this throw throws transient try var void volatile while yield true false null permits non-sealed'.split(' '));
/** A lossless, display-only lexer. React escapes every token as text. */
export function javaTokens(source:string):JavaToken[]{
 const pattern=/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*|"""[\s\S]*?(?:"""|$)|"(?:\\.|[^"\\\n])*(?:"|$)|'(?:\\.|[^'\\\n])*(?:'|$)|@[\w.]+|\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?)[fFdDlL]?\b|\b[A-Za-z_$][\w$]*\b/g;
 const tokens:JavaToken[]=[];let at=0;
 for(const match of source.matchAll(pattern)){const text=match[0],index=match.index!;if(index>at)tokens.push({text:source.slice(at,index)});const kind:JavaToken['kind']=text.startsWith('//')||text.startsWith('/*')?'comment':text.startsWith('"')||text.startsWith("'")?'string':text.startsWith('@')?'annotation':/^\d/.test(text)?'number':keywords.has(text)?'keyword':/^[A-Z]/.test(text)?'type':undefined;tokens.push({text,kind});at=index+text.length;}
 if(at<source.length)tokens.push({text:source.slice(at)});return tokens;
}
