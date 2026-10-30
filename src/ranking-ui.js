const RANK_STORE='ai-sherpa-flappy-player-v1',rankFrames=new Set(),rankRuns=new WeakMap();
let rankPlayer=null,rankJoin=null,rankStarting=false,activeRankRun=null;
try{const p=JSON.parse(localStorage.getItem(RANK_STORE)||'null');if(p?.expiresAt>Date.now())rankPlayer=p;}catch{}
async function rankApi(path,body){
 if(location.protocol==='file:')throw Error('닉네임과 순위는 온라인 수업에서 사용할 수 있어요.');
 const response=await fetch('/api/flappy/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='join'?25000:15000)});
 const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'순위판에 연결하지 못했습니다.'),{status:response.status});return result;
}
function rankAuth(){return {playerId:rankPlayer.playerId,token:rankPlayer.token};}
function forgetRankPlayer(){rankPlayer=null;try{localStorage.removeItem(RANK_STORE);}catch{}rankLabels();}
function rankLabels(){document.querySelectorAll('.rank-nickname').forEach(b=>b.textContent=rankPlayer?'닉네임: '+rankPlayer.nickname:'닉네임 입력');}
function rankControls(frame){const bar=el('span','rank-controls'),name=action(rankPlayer?'닉네임: '+rankPlayer.nickname:'닉네임 입력',async()=>{try{await ensureRankPlayer(true);}catch{}},false,true);name.classList.add('rank-nickname');bar.append(name,action('순위 보기',()=>showRankings(null,null,null,frame),false,true));return bar;}
function ensureRankPlayer(change=false){
 if(!change&&rankPlayer?.expiresAt>Date.now())return Promise.resolve(rankPlayer);
 if(rankJoin)return rankJoin;
 rankJoin=new Promise((resolve,reject)=>{
  const d=dialog('순위에 사용할 닉네임'),intro=el('p','rank-intro','2~12자의 짧은 별명을 입력해 주세요. 알맞지 않은 내용은 새 별명으로 바뀝니다.'),input=el('input'),status=el('div','dialog-status'),bar=el('div','actions');let approved=null,settled=false;
  input.placeholder='예: 파란새';input.maxLength=80;input.setAttribute('aria-label','순위 닉네임');input.autocomplete='off';input.value=change&&rankPlayer?rankPlayer.nickname:'';
  const submit=action('닉네임 확인',async()=>{
   if(approved){settled=true;rankPlayer=approved;try{localStorage.setItem(RANK_STORE,JSON.stringify(rankPlayer));}catch{}rankLabels();resolve(rankPlayer);closeDialog(d);return;}
   if(!input.value.trim()){setStatus(status,'닉네임을 입력해 주세요.',true);return;}
   submit.disabled=true;input.disabled=true;setStatus(status,'닉네임을 확인하고 있어요…');
   try{approved=await rankApi('join',{nickname:input.value});input.value=approved.nickname;setStatus(status,approved.changed?'사용할 수 있는 별명으로 바꿨어요: '+approved.nickname:'사용할 닉네임: '+approved.nickname);submit.textContent='이 닉네임으로 시작';submit.disabled=false;}catch(error){setStatus(status,error.message,true);submit.disabled=false;input.disabled=false;}
  },true);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&!submit.disabled){e.preventDefault();submit.click();}});
  bar.append(action('취소',()=>closeDialog(d)),submit);d.append(intro,input,status,bar);input.focus();d.addEventListener('close',()=>{if(!settled)reject(Error('닉네임 입력을 취소했습니다.'));},{once:true});
 }).finally(()=>{rankJoin=null;});return rankJoin;
}
async function showRankings(result=null,score=null,retry=null,returnFrame=null){
 const d=dialog(score===null?'플래피 버드 순위':'이번 기록 '+score+'점');d.classList.add('rank-dialog');const status=el('p','rank-intro',result?'':'순위를 불러오고 있어요…'),body=el('div','rank-table-wrap'),bar=el('div','actions');bar.append(action('게임으로 돌아가기',()=>closeDialog(d)));d.append(status,body,bar);
 d.addEventListener('close',()=>{if(returnFrame?.isConnected)returnFrame.focus();},{once:true});
 function draw(out){status.textContent=out.mine?.plays?'내 최고 기록 '+out.mine.score+'점 · '+out.mine.rank+'위':'닉네임별 최고 점수로 순위를 매깁니다. 같은 점수는 공동 순위입니다.';if(!out.entries.length){body.append(el('p','rank-intro','첫 기록을 남겨 보세요!'));return;}const table=el('table','rank-table'),head=el('thead'),tr=el('tr');for(const label of ['순위','닉네임','최고 점수'])tr.append(el('th','',label));head.append(tr);table.append(head);const rows=el('tbody');for(const row of out.entries){const r=el('tr');for(const value of [row.rank+'위',row.nickname,row.score+'점'])r.append(el('td','',String(value)));if(row.nickname===rankPlayer?.nickname)r.classList.add('rank-mine');rows.append(r);}table.append(rows);body.append(table);}
 try{draw(result||await rankApi('leaderboard'));}catch(error){status.textContent=error.message;if(retry)bar.append(action('기록 저장 다시 시도',async()=>{closeDialog(d);await retry();},true));}
}
function registerRankFrame(frame){rankFrames.add(frame);frame.addEventListener('load',()=>{frame.dataset.ranked='true';});}
async function uploadRankPoints(run){while(run.accepted<run.reported){const score=run.accepted+1;let last;for(let attempt=0;attempt<3;attempt++){try{const out=await rankApi('point',{...run.auth,runId:run.id,score});run.accepted=out.acceptedScore;last=null;break;}catch(error){last=error;}}if(last)throw last;}}
async function finishRankRun(run,show=true){
 if(run.finished||run.finishing)return run.finishing;
 run.finishing=(async()=>{try{await run.queue.catch(()=>{});await uploadRankPoints(run);const result=await rankApi('finish',{...run.auth,runId:run.id,score:run.reported});run.finished=true;if(activeRankRun===run)activeRankRun=null;if(show)await showRankings(result,run.reported,null,run.frame);return result;}catch(error){if(show){const d=dialog('기록을 저장하지 못했습니다'),p=el('p','rank-intro',error.message),bar=el('div','actions');bar.append(action('닫기',()=>closeDialog(d)),action('다시 저장',()=>{closeDialog(d);finishRankRun(run,true).catch(()=>{});},true));d.append(p,bar);}throw error;}finally{run.finishing=null;}})();return run.finishing;
}
window.addEventListener('message',async event=>{
 if(event.data?.channel!=='flappy-ranking')return;
 let frame=null;for(const candidate of rankFrames){if(!candidate.isConnected){rankFrames.delete(candidate);continue;}if(candidate.contentWindow===event.source)frame=candidate;}if(!frame)return;
 const msg=event.data,send=(command,message)=>frame.contentWindow.postMessage({channel:'flappy-ranking',command,message},'*');
 if(msg.event==='start-request'){
  if(rankStarting){send('start-denied','다른 플레이를 준비하고 있어요. 다시 눌러 주세요.');return;}rankStarting=true;
  try{
   if(activeRankRun&&!activeRankRun.finished){activeRankRun.frame.contentWindow.postMessage({channel:'flappy-lesson',command:'restart'},'*');await finishRankRun(activeRankRun,false);}
   await ensureRankPlayer();let result;try{result=await rankApi('start',rankAuth());}catch(error){if(error.status!==401)throw error;forgetRankPlayer();await ensureRankPlayer();result=await rankApi('start',rankAuth());}
   if(!frame.isConnected)throw Error('게임을 다시 열어 주세요.');
   const run={id:result.runId,auth:rankAuth(),frame,accepted:0,reported:0,finished:false,finishing:null,queue:Promise.resolve()};rankRuns.set(frame,run);activeRankRun=run;send('start-approved');frame.focus();
  }catch(error){send('start-denied',error.message);}finally{rankStarting=false;}
 }else if(msg.event==='point'){
  const run=rankRuns.get(frame);if(!run||run.finished||!Number.isInteger(msg.score)||msg.score!==run.reported+1||msg.score>500)return;run.reported=msg.score;run.queue=run.queue.catch(()=>{}).then(()=>uploadRankPoints(run));run.queue.catch(()=>{});
 }else if(msg.event==='finish'){
  const run=rankRuns.get(frame);if(!run||run.finished||msg.score!==run.reported)return;try{await finishRankRun(run,true);}catch{}
 }
});
