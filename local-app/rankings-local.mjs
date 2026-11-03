import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {moderateNickname} from '../src/rankings.mjs';
export function createLocalRankings(store,key,moderate=nickname=>moderateNickname(nickname,{SHERPA_OPENROUTER_KEY:key})){
 const file=path.join(store,'rankings.json'),data=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{players:[],runs:[]};
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});},hash=s=>createHash('sha256').update(s).digest('hex');
 const save=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);};
 const board=(room,id)=>{const list=data.players.filter(p=>p.room===room&&p.plays>0).sort((a,b)=>b.best-a.best||a.bestAt-b.bestAt),rank=score=>1+list.filter(p=>p.best>score).length,mine=data.players.find(p=>p.id===id&&p.room===room);return{entries:list.slice(0,5).map(p=>({nickname:p.nickname,score:p.best,rank:rank(p.best)})),mine:mine?{nickname:mine.nickname,score:mine.best,plays:mine.plays,rank:mine.plays?rank(mine.best):null}:null};};
 return async(route,room,body={})=>{
  if(route==='leaderboard')return board(room);
  if(route==='join'){
   const name=await moderate(body.nickname),token=randomUUID()+randomUUID(),now=Date.now();let nickname=name.nickname;
   if(data.players.some(p=>p.room===room&&p.nickname===nickname))nickname=nickname.slice(0,8)+randomUUID().slice(0,4);
   const p={id:randomUUID(),room,nickname,tokenHash:hash(token),expiresAt:now+86400000,best:0,bestAt:now,plays:0};data.players.push(p);save();return{playerId:p.id,token,nickname,changed:name.changed||nickname!==name.nickname,expiresAt:p.expiresAt};
  }
  const p=data.players.find(p=>p.room===room&&p.id===body.playerId&&typeof body.token==='string'&&p.tokenHash===hash(body.token)&&p.expiresAt>Date.now());if(!p)fail('이름을 다시 입력해 주세요.',401);
  if(route==='rename'){const name=await moderate(body.nickname);if(data.players.some(other=>other.room===room&&other.id!==p.id&&other.nickname===name.nickname))fail('같은 이름이 있어요. 다른 별명을 적어 주세요.');p.nickname=name.nickname;save();return{nickname:p.nickname,changed:name.changed,bestScore:p.best};}
  if(route==='start'){const run={id:randomUUID(),playerId:p.id,room,startedAt:Date.now(),score:0,endedAt:null};data.runs.push(run);save();return{runId:run.id,nickname:p.nickname};}
  if(!['point','finish'].includes(route))fail('없는 기능이에요.',404);
  const r=data.runs.find(r=>r.id===body.runId&&r.playerId===p.id&&r.room===room);if(!r)fail('플레이 기록을 찾지 못했어요.',404);
  const now=Date.now();if(now-r.startedAt>1800000)fail('다시 시작해 주세요.',409);
  if(route==='point'){const score=body.score;if(!Number.isInteger(score)||score<1||score>500)fail('점수를 확인해 주세요.');if(r.endedAt!==null)fail('이미 끝난 게임이에요.',409);if(score<=r.score)return{acceptedScore:r.score};if(score!==r.score+1||now-r.startedAt<6000+(score-1)*1100)fail('점수 진행을 확인하지 못했어요.',409);r.score=score;save();return{acceptedScore:r.score};}
  if(body.score!==r.score)fail('점수 저장을 다시 시도해 주세요.',409);
  if(r.endedAt===null){r.endedAt=now;p.plays++;if(p.plays===1||r.score>p.best){p.best=r.score;p.bestAt=now;}save();}
  return{savedScore:r.score,...board(room,p.id)};
 };
}
