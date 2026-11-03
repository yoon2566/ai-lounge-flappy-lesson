import assert from 'node:assert/strict';
import {readCompletionStream} from './openrouter-stream.mjs';
const event=value=>'data: '+JSON.stringify(value)+'\r\n\r\n';
function body(value){const bytes=new TextEncoder().encode(value);let i=0;return new ReadableStream({pull(c){if(i>=bytes.length)return c.close();c.enqueue(bytes.slice(i,i+=3));}});}
const received=[];
const data=await readCompletionStream(body(': OPENROUTER PROCESSING\r\n\r\n'+event({id:'test',choices:[{delta:{content:'<html>\n한글'}}]})+event({choices:[{delta:{content:' 코드\n</html>'},finish_reason:'stop'}]})+event({choices:[],usage:{cost:0.01}})+'data: [DONE]\r\n\r\n'),s=>received.push(s));
assert.equal(data.choices[0].message.content,'<html>\n한글 코드\n</html>');assert.equal(received.length,2);assert.equal(data.usage.cost,0.01);
await assert.rejects(()=>readCompletionStream(body(event({error:{message:'test'},choices:[]}))),/연결/);
await assert.rejects(()=>readCompletionStream(body(event({choices:[{delta:{content:'unfinished'}}]}))),/끝까지/);
await assert.rejects(()=>readCompletionStream(body(event({choices:[{delta:{content:'unfinished'},finish_reason:'length'}]})+'data: [DONE]\n\n')),/끝까지/);
console.log('UTF-8/chunk 경계·heartbeat·usage·오류·불완전 응답 검증 통과');
