import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../',import.meta.url));
export function encoder(){
 const ctx=vm.createContext({Uint8Array,Uint32Array,DataView,Map,Math,Array,Error,btoa});ctx.window=ctx;
 vm.runInContext(fs.readFileSync(root+'vendor/pako_deflate.min.js','utf8')+'\n'+fs.readFileSync(root+'vendor/png8.js','utf8'),ctx);
 return ctx.FlappyPNG8;
}
export function decodePNG(bytes){
 bytes=Buffer.from(bytes);assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const chunks={},ids=[];
 for(let p=8;p<bytes.length;){const size=bytes.readUInt32BE(p),name=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,p+8+size);let crc=0xffffffff;
  for(const b of bytes.subarray(p+4,p+8+size)){crc^=b;for(let k=0;k<8;k++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}
  assert.equal((crc^0xffffffff)>>>0,bytes.readUInt32BE(p+8+size),'CRC '+name);chunks[name]=data;if(name==='IDAT')ids.push(data);p+=size+12;
 }
 const h=chunks.IHDR,width=h.readUInt32BE(0),height=h.readUInt32BE(4);assert.equal(h[8],8);assert.equal(h[9],3);assert(chunks.PLTE.length<=768);assert(chunks.tRNS);
 const rows=zlib.inflateSync(Buffer.concat(ids)),pixels=new Uint8Array(width*height*4);assert.equal(rows.length,(width+1)*height);
 for(let y=0;y<height;y++){assert.equal(rows[y*(width+1)],0);for(let x=0;x<width;x++){const n=rows[y*(width+1)+x+1],i=(y*width+x)*4;assert(n<chunks.PLTE.length/3);pixels.set(chunks.PLTE.subarray(n*3,n*3+3),i);pixels[i+3]=chunks.tRNS[n]??255;}}
 return {width,height,pixels,colors:chunks.PLTE.length/3,chunks};
}
export async function loadWorker(){
 const hook=registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export class DurableObject {}',shortCircuit:true};return next(specifier,context);}});
 try{return (await import('../src/worker.mjs')).default;}finally{hook.deregister();}
}
export function memoryStorage(mode='r2'){
 const objects=new Map(),env={};
 if(mode==='r2')env.LESSON_IMAGE_BUCKET={async put(key,bytes,meta){objects.set(key,{bytes:Buffer.from(bytes),...meta});return {key};},async get(key){const obj=objects.get(key);return obj?{body:obj.bytes,size:obj.bytes.length,httpEtag:'"test"',...obj}:null;},async head(key){return this.get(key);}};
 else env.LESSON_IMAGES={async put(key,bytes){objects.set(key,{bytes:Buffer.from(bytes)});},async get(key){const obj=objects.get(key);return obj?obj.bytes.buffer.slice(obj.bytes.byteOffset,obj.bytes.byteOffset+obj.bytes.length):null;}};
 return {env,objects};
}
