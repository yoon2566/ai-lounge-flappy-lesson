import fs from 'node:fs';
import path from 'node:path';
export const PREVIOUS_ORIGIN='https://ai-lounge-flappy-lesson-20261025.yoon2566.workers.dev';
export function createRankingBridge(store,localRanking,send=fetch){
 const file=path.join(store,'connections.json'),config=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 const origin=config.rankingOrigin;
 if(origin&&origin!==PREVIOUS_ORIGIN)throw Error('확인되지 않은 순위 서버 주소입니다.');
 const shared=!!origin;
 return{info:{mode:shared?'shared':'local',scope:shared?'all':'class',origin:origin||null},async request(route,room,payload,method){
  if(!shared)return localRanking(route,room,payload);
  const allowed=method==='GET'?['leaderboard']:['join','rename','start','point','finish'];
  if(!allowed.includes(route))throw Object.assign(Error('지원하지 않는 순위 요청이에요.'),{status:405});
  const body={};for(const k of ['nickname','playerId','token','runId','score'])if(Object.hasOwn(payload,k))body[k]=payload[k];
  let response;
  try{response=await send(origin+'/api/flappy/'+route,{method,headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json',Origin:origin}:{})},body:method==='POST'?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(route==='join'||route==='rename'?25000:15000)});}catch{throw Object.assign(Error('이전 버전의 순위 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.'),{status:502});}
  let result;try{result=await response.json();}catch{throw Object.assign(Error('순위 서버 응답을 확인하지 못했어요.'),{status:502});}
  if(!response.ok)throw Object.assign(Error(result.error||'순위 요청에 실패했어요.'),{status:response.status});
  return result;
 }};
}
