import {prepareFrames,alignFrame,loadImage,dataURL} from './images.js';
import {readProject,writeProject} from './store.js';
import {withGameAspectRatio} from '/game-aspect.mjs';
const $=id=>document.getElementById(id),room=new URLSearchParams(location.search).get('room')||'';
let state={step:0,assets:{},character:null,settings:{speed:1,lives:1,jump:1,interval:.3,ability:'none',sound:true},history:[]},baseTemplate='',choices=[],working=false,active=true,permitted=false,controller=null,animation=null,projectId;
const names=['주인공','배경','장애물','아이템','속도','목숨','능력','소리','내 생각'];
const presets={background:[['🌲','숲속','햇살이 비치는 초록 숲 풍경'],['🌌','우주','별과 행성이 있는 우주 풍경'],['🌊','바닷가','파란 바다와 모래사장 풍경'],['🏔','눈산','눈 덮인 산과 맑은 하늘 풍경'],['🌇','도시','해 질 무렵 도시 풍경'],['☁️','구름 나라','파란 하늘에 떠 있는 구름과 성 풍경']],obstacle:[['☁️','먹구름','검은 먹구름 하나'],['🪨','바위','커다란 회색 바위 하나'],['🧊','얼음','뾰족한 얼음 덩어리 하나'],['🌵','선인장','초록 선인장 하나'],['☄️','운석','불꽃 꼬리가 있는 운석 하나'],['🚧','표지판','주황색 공사 표지판 하나']],item:[['⭐','별','빛나는 노란 별 하나'],['💎','보석','파란 보석 하나'],['🍎','사과','빨간 사과 하나'],['🪙','동전','금색 동전 하나'],['❤️','하트','빨간 하트 하나'],['🍬','사탕','파란 포장 사탕 하나']]};
function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
function btn(text,fn,cls){const b=node('button',text,cls);b.type='button';b.onclick=()=>{if(!working&&permitted)fn();};return b;}
function say(title,text){const a=node('article');a.append(node('h2',title));if(text)a.append(node('p',text));$('conversation').append(a);a.scrollIntoView({block:'start'});return a;}
function note(text,error=false){$('status').textContent=error?'확인해 주세요':'안내';const p=node('p',text,error?'error':'notice');$('conversation').append(p);p.scrollIntoView({block:'nearest'});}
let saveQueue=Promise.resolve();
async function save(){const snapshot=structuredClone(state);saveQueue=saveQueue.then(async()=>{const latest=await readProject(projectId)||{};await writeProject(projectId,{...latest,...snapshot,courseGames:latest.courseGames||snapshot.courseGames});}).catch(()=>note('이 브라우저에 저장하지 못했어요. 게임 HTML을 내려받아 보관해 주세요.',true));return saveQueue;}
function history(text){state.history.push(text);state.history=state.history.slice(-30);save();}
function gameHTML(portable=false){const config={...state.settings,assets:portable?state.assets:{...state.assets,...state.assetURLs}};return withGameAspectRatio((state.template||baseTemplate).replace('__FLAPPY_CONFIG__',JSON.stringify(config).replace(/</g,'\\u003c')));}
function preview(){if(active&&permitted){$('game').srcdoc=gameHTML();$('status').textContent='미리보기';if($('game-code')?.open)$('game-source').textContent=gameHTML();}}
function download(){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([gameHTML(true)],{type:'text/html;charset=utf-8'}));a.href=url;a.download='나만의_플래피게임.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function motionFor(subject){if(/비행기/.test(subject))return '프로펠러를 다른 각도로 돌려 줘';if(/로봇|우주선/.test(subject))return '뒤쪽 추진 불꽃을 두 배로 길게 바꿔 줘';if(/자동차/.test(subject))return '바퀴 살의 각도만 돌려 줘';if(/새|앵무|부엉|벌새|참새|용/.test(subject))return '날개를 위로 들어 올려 줘';if(/판다|고양이|여우|공룡|거북|토끼|강아지/.test(subject))return '한쪽 발을 살짝 들어 줘';return '그림에 있는 움직일 수 있는 부분 하나를 골라 다음 동작으로 살짝 움직여 줘';}
async function api(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await r.json();if(!r.ok)throw Error(data.error||'요청에 실패했어요.');return data;}
function controlsBusy(value){working=value;document.querySelectorAll('#conversation button,#conversation input,#conversation textarea,.step-nav button').forEach(b=>b.disabled=value);$('busy').hidden=!value;$('jump').disabled=$('restart').disabled=value;}
async function work(label,fn){if(working||!permitted)return;controlsBusy(true);$('busy').textContent=label;$('status').textContent=label;const progress=say('만들고 있어요',label),stop=node('button','기다리기 중지');stop.type='button';stop.onclick=()=>controller?.abort();progress.append(stop);try{await fn();}catch(e){render();note(e.name==='AbortError'?'기다리기를 멈췄어요. 시작한 그림은 계속 만들어질 수 있어요. 진행하던 결과 확인을 눌러 이어갈 수 있어요.':e.message,true);}finally{progress.remove();controller=null;controlsBusy(false);if($('status').textContent===label)$('status').textContent='미리보기';}}
async function generate(kind,subject,motion,referenceId){
 const fingerprint=JSON.stringify([kind,subject,motion||'',referenceId||'']);let pending=state.pending;
 if(!pending||pending.fingerprint!==fingerprint){pending={id:crypto.randomUUID(),fingerprint,kind,subject,motion,referenceId};state.pending=pending;await save();}
 controller=new AbortController();
 const post=await api('/api/images',{method:'POST',body:JSON.stringify({...pending,room}),signal:controller.signal});let result=post;
 while(result.status==='pending'){
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,1200);controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});
  result=await api('/api/image-jobs/'+pending.id,{signal:controller.signal});
 }
 if(result.status!=='success'){state.pending=null;await save();throw Error(result.error||'그림을 만들지 못했어요.');}
 // The caller commits the result before clearing the resumable request.
 return result;
}
async function committed(){state.pending=null;await save();}
function actionBar(a,nextLabel='다음 단계 →'){const bar=node('div',null,'actions');bar.append(btn('다음 단계 →',()=>{state.step=Math.min(8,state.step+1);save();render();},'primary'));a.append(bar);return bar;}
function inputForm(a,placeholder,submit,label='이렇게 만들기',initial=''){
 const form=node('div',null,'stage-choice'),input=node('textarea');input.rows=2;input.maxLength=800;input.placeholder=placeholder;input.setAttribute('aria-label','그림 설명');input.value=initial;
 form.append(input,btn(label,()=>{if(!input.value.trim()){input.focus();return;}submit(input.value.trim());},'primary'));a.append(form);return input;
}
async function createCharacter(subject){await work('첫 번째 캐릭터를 그리고 있어요…',async()=>{
 const result=await generate('character',subject);state.character={subject,base:result,motion:motionFor(subject),alignment:{x:0,y:0,scale:1}};await committed();history('주인공: '+subject);render();
});}
async function createMotion(){const c=state.character;await work('첫 그림을 보고 다음 동작을 그리고 있어요…',async()=>{
 const result=await generate('motion',c.subject,c.motion,c.base.id);c.second=result;await committed();await applyFrames();history('다음 동작: '+c.motion);render();
});}
async function applyFrames(){const c=state.character;if(!c?.second)return;const prepared=await prepareFrames([c.base.url,c.second.url]);c.normalized=prepared.frames;c.boxes=prepared.boxes;c.prepared={frame1:prepared.frames[0],frame2:await alignFrame(prepared.frames[1],c.alignment)};delete c.hosted;c.applied=false;await save();}
function hostingPanel(a,entry,keys,label,onApply){
 const panel=node('section',null,'hosting-panel');panel.append(node('h3','그림 만들기 → 주소 만들기 → 게임에 넣기'),node('p','그림을 저장하면 주소가 생겨요. 게임은 이 주소로 그림을 불러와요. 이것을 이미지 호스팅이라고 해요.'));
 if(!entry.hosted){panel.append(btn('그림 저장하고 주소 만들기',()=>work('그림을 저장하고 주소를 만들고 있어요…',async()=>{controller=new AbortController();const hosted={};for(const kind of keys){const out=await api('/api/assets',{method:'POST',signal:controller.signal,body:JSON.stringify({room,kind,dataURL:entry.prepared[kind]})});hosted[kind]=out.url;}entry.hosted=hosted;await save();render();}),'primary'));}
 else{for(const kind of keys){const row=node('label',keys.length>1?(kind==='frame1'?'첫 그림 주소':'다음 동작 주소'):'그림 주소'),input=node('input');input.readOnly=true;input.value=entry.hosted[kind];input.setAttribute('aria-label',row.textContent);const link=node('a','그림 열어 보기');link.href=entry.hosted[kind];link.target='_blank';link.rel='noopener';row.append(input,btn('주소 복사',async()=>{try{await navigator.clipboard.writeText(input.value);note('그림 주소를 복사했어요.');}catch{input.select();note('선택한 주소를 복사해 주세요.');}}),link);panel.append(row);}panel.append(node('p','지금은 로컬 연습이라 이 컴퓨터에서만 열리는 주소예요.','note'));panel.append(btn(entry.applied?'게임에 다시 넣기':'이 그림을 게임에 넣기',()=>{state.assetURLs||={};for(const kind of keys){state.assets[kind]=entry.prepared[kind];state.assetURLs[kind]=entry.hosted[kind];}entry.applied=true;onApply?.();history(label+' 그림 주소로 적용');save();preview();render();},'primary'));if(entry.applied){panel.append(node('p','✓ 그림 주소로 내 게임에 넣었어요.'));actionBar(panel);}}
 a.append(panel);
}
function renderCharacter(a){
 const c=state.character;
 if(c){
  if(!state.pending&&(!c.motion||c.motion==='걷는 다음 동작으로 앞다리와 뒷다리 위치를 바꿔 줘')){c.motion=motionFor(c.subject);save();}
  const pair=node('div',null,'frame-pair'+(!c.second?' single-frame':''));
  for(const [label,r] of [['내 캐릭터',c.base],['움직이는 그림',c.second]]){if(!r)continue;const f=node('figure'),im=node('img');im.src=r.url;im.alt=label;f.append(im,node('figcaption',label));pair.append(f);}a.append(pair);
  a.append(node('p',c.second?'움직임이 마음에 들면 그림 주소를 만들고 게임에 넣어요.':'버튼을 누르면 이 캐릭터에 어울리는 움직임을 만들어요.'));
  a.append(btn(c.second?'움직임 다시 만들기':'움직이게 만들기',()=>{if(c.second&&!state.pending){delete c.second;delete c.normalized;}createMotion();},'primary motion-create'));
  const custom=node('details',null,'motion-custom');custom.append(node('summary','움직임을 직접 정하고 싶어요'));
  const label=node('label','어떻게 움직이면 좋을까요?'),motion=node('textarea');motion.value=c.motion;motion.rows=2;motion.maxLength=400;motion.setAttribute('aria-label','다음 동작 설명');motion.oninput=()=>{c.motion=motion.value;save();};label.append(motion);custom.append(label,btn('자동으로 정하기',()=>{c.motion=motionFor(c.subject);motion.value=c.motion;save();custom.open=false;}));a.append(custom);
  if(c.second){
   if(!c.normalized){a.append(btn('두 그림 준비 다시 시도',()=>work('그림을 준비하고 있어요…',async()=>{await applyFrames();render();})));}
   else{
    c.prepared||={frame1:c.normalized[0],frame2:state.assets.frame2||c.normalized[1]};const anim=node('img',null,'motion-preview');anim.alt='두 동작 번갈아보기';anim.src=c.prepared.frame1;a.append(anim);let frame=0;animation=setInterval(()=>{anim.src=c.prepared[++frame%2?'frame2':'frame1'];},state.settings.interval*1000);
    const details=node('details');details.append(node('summary','움직임 위치 맞추기'));
    for(const [key,title,min,max,step]of [['x','좌우',-48,48,1],['y','위아래',-48,48,1],['scale','크기',.65,1.4,.01]]){const row=node('label',title,'range-row'),input=node('input');input.type='range';Object.assign(input,{min,max,step,value:c.alignment[key]});input.setAttribute('aria-label','두 번째 동작 '+title);input.oninput=()=>{c.alignment[key]=Number(input.value);};input.onchange=async()=>{c.prepared.frame2=await alignFrame(c.normalized[1],c.alignment);delete c.hosted;c.applied=false;await save();render();note('위치를 바꿨어요. 새 그림 주소를 만들고 다시 넣어 주세요.');};row.append(input);details.append(row);}
    details.append(node('p','몸통이 흔들리면 두 번째 그림의 위치와 크기를 조금 조절해요.','note'));a.append(details);hostingPanel(a,c,['frame1','frame2'],'주인공');
   }
  }
  a.append(btn('첫 그림 다시 만들기',()=>createCharacter(c.subject)),btn('다른 캐릭터 고르기',()=>{state.character=null;save();render();}));return;
 }
 const grid=node('div',null,'grid');for(const id of ['01','02','04','07','11','14','15','17','18']){const choice=choices.find(c=>c.id===id),b=btn('',()=>createCharacter(choice.subject)),im=node('img',null,'choice-image');im.src=choice.url;im.alt='';b.append(im,node('span',({'01':'노란 새','02':'파란 새','04':'부엉이','07':'펭귄','11':'로봇','14':'공룡','15':'여우','17':'판다','18':'아기 용'})[id],'choice-label'));grid.append(b);}a.append(grid);inputForm(a,'예: 파란 날개를 가진 노란 새',createCharacter);const more=node('details');more.append(node('summary','캐릭터 더 보기'));const grid2=node('div',null,'grid');for(const c of choices.filter(c=>!['01','02','04','07','11','14','15','17','18'].includes(c.id))){const b=btn('',()=>createCharacter(c.subject)),im=node('img',null,'choice-image');im.src=c.url;im.alt='';b.append(im,node('span',c.subject));grid2.append(b);}more.append(grid2);a.append(more);
}
async function createAsset(kind,subject){await work('새 그림을 그리고 있어요…',async()=>{
 const result=await generate(kind,subject);state.assetJobs||={};state.assetJobs[kind]=result;await committed();await applyAsset(kind);history(names[state.step]+': '+subject);render();
});}
async function applyAsset(kind){const r=state.assetJobs[kind];const value=kind==='background'?await dataURL(r.url):(await prepareFrames([r.url])).frames[0];state.preparedAssets||={};state.preparedAssets[kind]={id:r.id,prepared:{[kind]:value}};await save();}
function renderAsset(a,kind){
 const existing=state.assetJobs?.[kind];if(existing){const im=node('img',null,'asset-preview');im.src=existing.url;im.alt=existing.subject;a.append(im,node('p',existing.subject));const entry=state.preparedAssets?.[kind];if(entry?.id!==existing.id)a.append(btn('이 그림 준비하기',()=>work('그림 준비 중…',async()=>{await applyAsset(kind);render();}),'primary'));else hostingPanel(a,entry,[kind],names[state.step]);}
 const grid=node('div',null,'grid');for(const [icon,title,subject]of presets[kind]){const b=btn('',()=>createAsset(kind,subject));b.append(node('span',icon,'choice-icon'),node('span',title,'choice-label'));grid.append(b);}a.append(grid);inputForm(a,'원하는 '+names[state.step]+'을 적어요.',text=>createAsset(kind,text));a.append(btn('지금 그림으로 다음 단계 →',()=>{state.step++;save();render();}));
}
function renderSetting(a,key,options){const grid=node('div',null,'grid');for(const [value,label] of options){const b=btn(label,()=>{state.settings[key]=value;save();preview();render();});b.setAttribute('aria-pressed',String(state.settings[key]===value));grid.append(b);}a.append(grid);actionBar(a);}
function render(){
 clearInterval(animation);$('conversation').replaceChildren();$('progress').textContent=(state.step+1)+' / 9 · '+names[state.step];document.querySelectorAll('.step-nav button').forEach((b,i)=>b.setAttribute('aria-current',String(i===state.step)));
 const historyBox=node('details');historyBox.append(node('summary','우리가 바꾼 것'));for(const text of state.history)historyBox.append(node('p',text,'note'));$('conversation').append(historyBox);
 const titles=['누구로 날아볼까?','어디로 날아갈까?','무엇을 피할까?','무엇을 모을까?','얼마나 빠르게 날까?','목숨은 몇 개로 할까?','어떤 능력을 쓸까?','소리를 켜 볼까?','내 생각을 더해요'];
 const a=say(state.step===0&&state.character?'내 캐릭터를 움직여 볼까?':titles[state.step],state.step===0?(state.character?'': '마음에 드는 캐릭터를 골라요.'):'그림이나 버튼을 골라 게임을 바꿔요.');a.className='step-message';
 if(state.step===0)renderCharacter(a);else if(state.step<4)renderAsset(a,['','background','obstacle','item'][state.step]);
 else if(state.step===4)renderSetting(a,'speed',[[.6,'🐢 천천히'],[1,'🐥 보통'],[1.5,'🚀 빠르게']]);
 else if(state.step===5)renderSetting(a,'lives',[[1,'❤️ 1개'],[3,'❤️ 3개'],[5,'❤️ 5개']]);
 else if(state.step===6)renderSetting(a,'ability',[['none','그대로'],['shield','🛡 한 번 보호'],['magnet','🧲 아이템 자석']]);
 else if(state.step===7)renderSetting(a,'sound',[[true,'🔊 소리 켜기'],[false,'🔇 소리 끄기']]);
 else{
  a.append(node('p','예: 아이템을 모으면 무지개 빛이 나오게 해 줘.'));inputForm(a,'바꾸고 싶은 게임 규칙을 적어요.',editGame,'게임 바꾸기');
  const bar=node('div',null,'actions');bar.append(btn('HTML 다운로드',download),btn('우리 반에 저장',share,'primary'),btn('처음 단계로',()=>{state.step=0;save();render();}));a.append(bar);
  if(state.template)a.append(btn('앞 단계에서 만든 게임으로 되돌리기',()=>{state.template=state.courseGames?.variant?.template||baseTemplate;save();preview();render();}));
 }
 if(state.pending){const p=node('div',null,'notice');p.append(node('p','진행하던 그림 요청이 있어요. 같은 요청으로 결과를 확인하면 중복 생성하지 않아요.'));p.append(btn('진행하던 결과 확인',()=>{const r=state.pending;if(r.kind==='character')createCharacter(r.subject);else if(r.kind==='motion')createMotion();else createAsset(r.kind,r.subject);}));a.prepend(p);}
 $('conversation').scrollTop=0;
}
async function editGame(prompt){await work('AI가 게임 규칙을 바꾸고 있어요…',async()=>{controller=new AbortController();const result=await api('/api/game',{method:'POST',signal:controller.signal,body:JSON.stringify({room,prompt,template:state.template||baseTemplate})});state.template=result.template;history('게임 수정: '+prompt);await save();preview();render();note('바꿨어요. 미리보기에서 해 보고 HTML로 저장해요.');});}
function share(){const d=node('dialog'),form=node('form');form.innerHTML='<h2>우리 반 작품 저장</h2><label>이름 또는 별명<input name="author" maxlength="40" required></label><label>작품 제목<input name="title" maxlength="80" required></label><p role="status"></p><button class="primary" type="submit">저장</button> <button type="button">닫기</button>';d.append(form);document.body.append(d);form.querySelector('[type=button]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove());form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('[type=submit]');b.disabled=true;try{await api('/api/board',{method:'POST',body:JSON.stringify({room,author:form.author.value,title:form.title.value,html:gameHTML(true)})});form.querySelector('[role=status]').textContent='저장했어요!';const a=node('a','우리 반 작품 보기');a.href='/board?room='+encodeURIComponent(room);a.target='_blank';a.rel='noopener';form.append(a);}catch(e){form.querySelector('[role=status]').textContent=e.message;}finally{b.disabled=false;}};d.showModal();}
const nav=node('nav',null,'step-nav');nav.setAttribute('aria-label','만들기 단계');names.forEach((name,i)=>nav.append(btn(name,()=>{state.step=i;save();render();})));$('chat-panel').insertBefore(nav,$('conversation'));
const originNote=node('div',null,'course-origin');$('chat-panel').insertBefore(originNote,nav);
function showOrigin(){originNote.replaceChildren(node('p',state.courseGames?.variant?'앞 단계에서 만든 내 코인 게임에 그림을 넣고 수정해요.':'지금은 연습용 게임이에요. 앞 단계에서 내 게임을 먼저 만들 수 있어요.'));if(!state.courseGames?.variant)originNote.append(btn('내 코인 게임 만들기로',()=>parent.postMessage({channel:'course-go',page:7},location.origin)));}
async function syncCourse(){if(!projectId)return;await saveQueue;const latest=await readProject(projectId);if(!latest?.courseGames)return;state.courseGames=latest.courseGames;if(latest.courseVariantId&&latest.courseVariantId!==state.courseVariantId){state.courseVariantId=latest.courseVariantId;state.template=latest.template;await save();preview();}showOrigin();}
const blocker=node('div',null,'');blocker.id='studio-lock';blocker.append(node('h2','선생님 설명을 들어 주세요'),node('p','게임 만들기 페이지가 열리면 시작해요.'));blocker.hidden=true;document.body.append(blocker);
$('jump').onclick=()=>{if(!permitted)return;$('game').contentWindow.postMessage({channel:'flappy-lesson',command:'tap'},'*');$('game').focus();};
$('restart').onclick=()=>{
 if(!active||!permitted||working)return;
 const frame=$('game');
 frame.addEventListener('load',()=>{if(active&&permitted&&!working&&frame.isConnected&&!document.hidden&&!frame.closest('[hidden],[inert],[aria-hidden="true"]')&&frame.getClientRects().length)frame.focus({preventScroll:true});},{once:true});
 preview();
};
$('download').onclick=download;
$('publish').onclick=()=>{if(permitted&&!working)share();};$('studio-board').href='/board?room='+encodeURIComponent(room);$('game-code').ontoggle=()=>{if($('game-code').open)$('game-source').textContent=gameHTML();};
window.addEventListener('message',e=>{
 if(e.source===parent&&e.origin===location.origin&&e.data?.channel==='grade1-classroom'){active=e.data.active===true;$('game').contentWindow.postMessage({channel:'flappy-lesson',command:active?'resume':'pause'},'*');if(!active&&controller)controller.abort();if(active)syncCourse();}
 if(e.source===$('game').contentWindow&&e.data?.channel==='flappy-state'&&!working)$('status').textContent=({ready:'준비',playing:'비행 중',dead:'게임 끝',resetting:'다시 준비'})[e.data.state]||'미리보기';
});
async function checkRoom(){try{const r=await api('/api/classroom/'+encodeURIComponent(room));const was=permitted;permitted=r.canManage||r.openPages.includes(8);blocker.hidden=permitted;if(was&&!permitted){controller?.abort();$('game').srcdoc='';}if(!was&&permitted&&baseTemplate)preview();}catch{permitted=false;blocker.hidden=false;$('game').srcdoc='';}}
let polling=false;async function poll(){if(polling)return;polling=true;try{await checkRoom();}finally{polling=false;}}
(async()=>{try{let tab=sessionStorage.getItem('flappy-student');if(!tab){tab=crypto.randomUUID();sessionStorage.setItem('flappy-student',tab);}projectId=room+':'+tab;const [template,c,old]=await Promise.all([fetch('/game-template.html').then(r=>r.text()),fetch('/choices.json').then(r=>r.json()),readProject(projectId)]);baseTemplate=template;choices=c;if(old)state={...state,...old,assets:old.assets||{},settings:{...state.settings,...old.settings},history:old.history||[]};showOrigin();await poll();render();preview();setInterval(poll,1500);}catch(e){note('수업을 열지 못했어요. '+e.message,true);}})();
