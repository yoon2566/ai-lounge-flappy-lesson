// API connection only. Player-facing nickname and ranking menus live in the game.
const RANK_STORE='ai-sherpa-flappy-player-v1',rankFrames=new Set(),rankRuns=new WeakMap(),rankJoining=new WeakSet();
let rankPlayer=null,rankStarting=false,activeRankRun=null;
try{const p=JSON.parse(localStorage.getItem(RANK_STORE)||'null');if(p?.expiresAt>Date.now())rankPlayer=p;}catch{}
async function rankApi(path,body){
 if(location.protocol==='file:')throw Error('닉네임과 순위는 온라인 수업에서 사용할 수 있어요.');
 const response=await fetch('/api/flappy/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='join'?25000:15000)});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'순위판에 연결하지 못했습니다.'),{status:response.status});return result;
}
function rankAuth(){return {playerId:rankPlayer.playerId,token:rankPlayer.token};}
function rankSend(frame,command,details={}){if(frame.isConnected)frame.contentWindow.postMessage({channel:'flappy-ranking',command,...details},'*');}
function rankIdentity(sourceFrame=null){for(const frame of rankFrames)if(frame.isConnected)rankSend(frame,'identity',{nickname:rankPlayer?.nickname||'',closeMenu:frame!==sourceFrame});}
function forgetRankPlayer(){rankPlayer=null;try{localStorage.removeItem(RANK_STORE);}catch{}rankIdentity();}
function registerRankFrame(frame){rankFrames.add(frame);frame.addEventListener('load',()=>rankSend(frame,'session',{nickname:rankPlayer?.nickname||''}));}
async function uploadRankPoints(run){while(run.accepted<run.reported){const score=run.accepted+1;let last;for(let attempt=0;attempt<3;attempt++){try{const out=await rankApi('point',{...run.auth,runId:run.id,score});run.accepted=out.acceptedScore;last=null;break;}catch(error){last=error;}}if(last)throw last;}}
async function finishRankRun(run,show=true){
 if(run.finished||run.finishing)return run.finishing;
 if(show)rankSend(run.frame,'rankings-loading');
 run.finishing=(async()=>{try{await run.queue.catch(()=>{});await uploadRankPoints(run);const result=await rankApi('finish',{...run.auth,runId:run.id,score:run.reported});run.finished=true;if(activeRankRun===run)activeRankRun=null;if(show)rankSend(run.frame,'rankings',{...result,score:run.reported});return result;}catch(error){if(show)rankSend(run.frame,'rankings-error',{message:error.message,canRetry:true});throw error;}finally{run.finishing=null;}})();return run.finishing;
}
window.addEventListener('message',async event=>{
 if(event.data?.channel!=='flappy-ranking')return;
 let frame=null;for(const candidate of rankFrames){if(!candidate.isConnected){rankFrames.delete(candidate);continue;}if(candidate.contentWindow===event.source)frame=candidate;}if(!frame)return;
 const msg=event.data;
 if(msg.event==='nickname-submit'){
  if(rankJoining.has(frame))return;rankJoining.add(frame);
  try{
   let result;
   if(rankPlayer?.expiresAt>Date.now()){
    try{result=await rankApi('rename',{...rankAuth(),nickname:msg.nickname});rankPlayer={...rankPlayer,nickname:result.nickname};}
    catch(error){if(error.status!==401)throw error;forgetRankPlayer();}
   }
   if(!result){result=await rankApi('join',{nickname:msg.nickname});rankPlayer=result;}
   try{localStorage.setItem(RANK_STORE,JSON.stringify(rankPlayer));}catch{}rankIdentity(frame);rankSend(frame,'nickname-approved',{nickname:result.nickname,changed:result.changed});
  }catch(error){rankSend(frame,'nickname-error',{message:error.message});}finally{rankJoining.delete(frame);}return;
 }
 if(msg.event==='leaderboard-request'){
  try{rankSend(frame,'rankings',await rankApi('leaderboard'));}catch(error){rankSend(frame,'rankings-error',{message:error.message});}return;
 }
 if(msg.event==='start-request'){
  if(rankStarting){rankSend(frame,'start-denied',{message:'다른 플레이를 준비하고 있어요. 다시 눌러 주세요.'});return;}
  if(!rankPlayer||rankPlayer.expiresAt<=Date.now()){forgetRankPlayer();rankSend(frame,'nickname',{startAfter:true});return;}
  rankStarting=true;
  try{
   if(activeRankRun&&!activeRankRun.finished){if(activeRankRun.frame.isConnected)activeRankRun.frame.contentWindow?.postMessage({channel:'flappy-lesson',command:'restart'},'*');await finishRankRun(activeRankRun,false);}
   let result;try{result=await rankApi('start',rankAuth());}catch(error){if(error.status!==401)throw error;forgetRankPlayer();rankSend(frame,'nickname',{startAfter:true});return;}
   if(!frame.isConnected)return;
   const run={id:result.runId,auth:rankAuth(),frame,accepted:0,reported:0,finished:false,finishing:null,queue:Promise.resolve()};rankRuns.set(frame,run);activeRankRun=run;rankSend(frame,'start-approved');frame.focus();
  }catch(error){rankSend(frame,'start-denied',{message:error.message});}finally{rankStarting=false;}
 }else if(msg.event==='point'){
  const run=rankRuns.get(frame);if(!run||run.finished||!Number.isInteger(msg.score)||msg.score!==run.reported+1||msg.score>500)return;run.reported=msg.score;run.queue=run.queue.catch(()=>{}).then(()=>uploadRankPoints(run));run.queue.catch(()=>{});
 }else if(msg.event==='finish'){
  const run=rankRuns.get(frame);if(!run||run.finished||msg.score!==run.reported)return;try{await finishRankRun(run,true);}catch{}
 }else if(msg.event==='retry-finish'){
  const run=rankRuns.get(frame);if(run&&!run.finished)try{await finishRankRun(run,true);}catch{}
 }
});
