import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateLesson} from '../src/sherpa-ai.mjs';
import {SYSTEM,PROMPT_SYSTEM} from '../src/ai-system.mjs';
import {imageAspectRatio,generateImage} from '../src/image-generation.mjs';

test('최종 요청 보존 및 변환/게임 시스템 분리, 예전 클라이언트 호환',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(_url,options)=>{calls.push(JSON.parse(options.body));return new Response('data: [DONE]\n\n')};
 try{
  for(const purpose of ['rules','game',undefined]){
   const messages=[{role:'user',content:'최종 수정: 날개 없는 로봇, 코인 5점, HTML 출력해 줘.'}];
   const result=await generateLesson({messages,purpose},{SHERPA_OPENROUTER_KEY:'test-only'},new AbortController().signal);
   assert.equal(result.status,200);
   assert.equal(calls.at(-1).messages[0].content,purpose==='rules'?PROMPT_SYSTEM:SYSTEM);
   assert.deepEqual(calls.at(-1).messages.slice(1),messages);
  }
 }finally{globalThis.fetch=original;}
});

test('배경색·세로선 때문에 정사각형 비율이 뒤집히지 않고 뒤의 명시적 수정 비율 사용',()=>{
 for(const [prompt,ratio] of [
  ['정사각형 아이템, 배경은 분홍색, 세로선은 없음','1:1'],
  ['물체 하나, 분홍색 배경','1:1'],
  ['가로로 긴 배경 풍경','16:9'],
  ['세로 화면 이미지','9:16'],
  ['16:9 배경, 마지막 수정: 1 : 1 비율로 바꿔 줘','1:1'],
 ])assert.equal(imageAspectRatio(prompt),ratio,prompt);
});

test('이미지 API에 최종 문장과 최종 비율이 함께 전달됨',async()=>{
 const original=globalThis.fetch;let sent;
 globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response('{}',{status:422})};
 try{
  const prompt='정사각형 사탕, 분홍색 배경, 구름이 없어요';
  await generateImage(prompt,{SHERPA_OPENROUTER_KEY:'test-only'},new AbortController().signal);
  assert.equal(sent.prompt,prompt);assert.equal(sent.aspect_ratio,'1:1');
 }finally{globalThis.fetch=original;}
});
