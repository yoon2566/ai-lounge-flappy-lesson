import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encoder,decodePNG,loadWorker,memoryStorage,root} from './png8-helpers.mjs';
import {storeImage,readImage} from '../src/image-storage.mjs';
const png8=encoder();
for(const count of [1,2,255,256])test('PNG-8 exact RGBA palette: '+count+' colors',()=>{
 const px=new Uint8Array(count*4);for(let i=0;i<count;i++)px.set([i,255-i,i^73,i],i*4);
 const out=decodePNG(png8.encode(px,count,1));assert.equal(out.colors,count);assert.deepEqual(out.pixels,px);
});
test('all-transparent and odd-width multi-row PNG retain pixels',()=>{
 for(const alpha of [0,128,255]){const px=new Uint8Array(13*7*4);for(let i=0;i<px.length;i+=4)px.set([17,63,201,alpha],i);assert.deepEqual(decodePNG(png8.encode(px,13,7)).pixels,px);}
});
test('more than 256 colors quantizes deterministically; alpha endpoints stay exact',()=>{
 const px=new Uint8Array(64*64*4);for(let i=0;i<4096;i++)px.set([i%256,(i>>4)%256,(i*29)%256,i%3===0?0:i%3===1?128:255],i*4);
 const bytes=png8.encode(px,64,64),out=decodePNG(bytes);assert(out.colors<=256);assert.deepEqual(png8.encode(px,64,64),bytes);
 for(let i=0;i<4096;i++){const a=out.pixels[i*4+3];if(px[i*4+3]===0||px[i*4+3]===255)assert.equal(a,px[i*4+3]);else assert(a>0&&a<255);}
});
const worker=await loadWorker(),origin='http://localhost';
const png=png8.encode(new Uint8Array([255,0,0,255,0,0,0,0]),2,1),webp=fs.readFileSync(root+'assets/background.webp');
const upload=(env,bytes,type)=>worker.fetch(new Request(origin+'/api/assets',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:bytes}),env);
for(const mode of ['r2','kv'])test(mode+' uploads and reads PNG/WebP with correct key, type, HEAD and bytes',async()=>{
 const {env,objects}=memoryStorage(mode);
 for(const [bytes,type,ext]of[[png,'image/png','png'],[webp,'image/webp','webp']]){const res=await upload(env,bytes,type);assert.equal(res.status,200);const out=await res.json();assert.equal(out.type,type);assert(out.url.endsWith('.'+ext));const obj=objects.get(out.url.split('/').pop());if(mode==='r2')assert.equal(obj.httpMetadata.contentType,type);
  for(const method of ['GET','HEAD']){const read=await worker.fetch(new Request(out.url,{method}),env);assert.equal(read.status,200);assert.equal(read.headers.get('Content-Type'),type);assert.equal(Number(read.headers.get('Content-Length')),bytes.length);assert.equal(read.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(read.headers.get('Access-Control-Allow-Origin'),'*');assert.deepEqual(Buffer.from(await read.arrayBuffer()),method==='HEAD'?Buffer.alloc(0):Buffer.from(bytes));}
 }
});
test('signature and MIME mismatches, malformed PNG and unsupported types rejected',async()=>{
 const {env,objects}=memoryStorage();for(const [bytes,type]of[[png,'image/webp'],[webp,'image/png'],[Buffer.from('GIF89a'),'image/png'],[png.slice(0,20),'image/png'],[png,'image/jpeg'],[new Uint8Array(40),'image/png']])assert.equal((await upload(env,bytes,type)).status,415);
 const bad=png.slice();bad[12]=0;assert.equal((await upload(env,bad,'image/png')).status,415);assert.equal(objects.size,0);
});
test('2 MB limit retained for PNG and WebP, including streamed body without length',async()=>{
 for(const [sample,type]of[[png,'image/png'],[webp,'image/webp']]){const {env,objects}=memoryStorage();const bytes=new Uint8Array(2*1024*1024+1);bytes.set(sample);assert.equal((await upload(env,bytes,type)).status,400);assert.equal(objects.size,0);
 const stream=new ReadableStream({start(c){c.enqueue(bytes.subarray(0,1024*1024));c.enqueue(bytes.subarray(1024*1024));c.close();}});const res=await worker.fetch(new Request(origin+'/api/assets',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:stream,duplex:'half'}),env);assert.equal(res.status,400);}
});
test('legacy KV reads survive R2 outage and incorrect storage extensions are rejected',async()=>{
 const {env}=memoryStorage('kv');await storeImage(env,'legacy.webp',webp);await storeImage(env,'fallback.png',png);env.LESSON_IMAGE_BUCKET={async get(){throw Error('outage');},async head(){throw Error('outage');}};
 for(const [key,type]of[['legacy.webp','image/webp'],['fallback.png','image/png']])assert.equal((await readImage(env,key)).headers.get('Content-Type'),type);
 await assert.rejects(storeImage(env,'wrong.webp',png));
});
