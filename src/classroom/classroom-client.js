const lessonDeck=data;
// Teacher permission is confirmed by the server. Students can only visit open pages.
const classroomParams=new URLSearchParams(location.search);
const classroom={room:classroomParams.get('room')?.toUpperCase()||null,teacherRequested:classroomParams.get('role')==='teacher',isTeacher:false,screenLocked:false,openPages:[],maxPage:1,revision:0,connected:false,message:'',loaded:false,busy:false,waiting:true,name:'',events:false,unavailable:false};
let pendingClassroomState=null;
if(classroom.room)document.body.classList.add('with-classroom');
let classroomScreenLockTimer;
function updateClassroomScreenLock(){
  const overlay=$('classroom-screen-overlay');if(!overlay)return;
  const locked=Boolean(classroom.room&&!classroom.isTeacher&&classroom.screenLocked);
  clearTimeout(classroomScreenLockTimer);
  if(locked){
    if(!overlay.open){document.activeElement?.blur?.();overlay.showModal();overlay.focus({preventScroll:true})}
    requestAnimationFrame(()=>{if(classroom.screenLocked&&!classroom.isTeacher)overlay.classList.add('is-visible')});
  }else if(overlay.open){
    overlay.classList.remove('is-visible');
    classroomScreenLockTimer=setTimeout(()=>{if(!classroom.screenLocked||classroom.isTeacher)overlay.close()},200);
  }
}
for(const type of ['keydown','keyup','keypress'])document.addEventListener(type,event=>{if($('classroom-screen-overlay')&&classroom.room&&!classroom.isTeacher&&(classroom.screenLocked||!classroom.loaded)){event.preventDefault();event.stopPropagation()}},true);
document.addEventListener('cancel',event=>{if(event.target?.id==='classroom-screen-overlay'&&(classroom.screenLocked||!classroom.loaded))event.preventDefault()},true);
document.addEventListener('focusin',event=>{const overlay=$('classroom-screen-overlay');if(overlay?.open&&(classroom.screenLocked||!classroom.loaded)&&event.target!==overlay)overlay.focus({preventScroll:true})},true);
window.addEventListener('blur',()=>{const overlay=$('classroom-screen-overlay');if(overlay?.open&&(classroom.screenLocked||!classroom.loaded))setTimeout(()=>{if(document.activeElement?.tagName==='IFRAME')overlay.focus({preventScroll:true})},0)});
function canVisitPage(next){return !classroom.room||classroom.isTeacher||classroom.openPages.includes(next+1)}
function classroomNeighbor(direction){
  if(!classroom.room||classroom.isTeacher)return state.page+direction;
  const pages=classroom.openPages.map(page=>page-1).filter(page=>direction>0?page>state.page:page<state.page).sort((a,b)=>direction>0?a-b:b-a);return pages[0]??-1;
}
function stepPage(direction){const next=classroomNeighbor(direction);if(next<0||next>=lessonDeck.slides.length){if(classroom.room)showClassroomBrake();return false}return go(next)}
function edgePage(last){const pages=classroom.room&&!classroom.isTeacher?classroom.openPages:lessonDeck.slides.map((_,i)=>i+1);if(!pages.length)return;go((last?pages.at(-1):pages[0])-1)}
function updateClassroomNavigation(){
  const banner=$('classroom-banner');if(!banner)return;
  $('classroom-header').hidden=!classroom.room;
  $('classroom-lock-controls').hidden=!classroom.room||!classroom.isTeacher;
  $('classroom-qr-open').hidden=!classroom.room||!classroom.isTeacher;
  if(!classroom.isTeacher)$('classroom-qr-dialog')?.close();
  document.body.classList.toggle('classroom-teacher',Boolean(classroom.room&&classroom.isTeacher));
  if(!classroom.room)return;
  banner.hidden=false;banner.textContent=classroom.message||(classroom.connected?(classroom.name+' · 열린 페이지 '+classroom.openPages.length+'/'+lessonDeck.slides.length):'수업 연결 중…');
  banner.classList.toggle('is-waiting',!classroom.connected);
  $('classroom-role').textContent=classroom.isTeacher?'선생님':'학생';
  $('classroom-back').href=classroom.isTeacher?'/classes':'/';$('classroom-back').textContent=classroom.isTeacher?'← 수업 목록':'← 홈으로';
  $('classroom-code').textContent='코드 '+classroom.room;
  const next=classroomNeighbor(1),previous=classroomNeighbor(-1);
  $('next').disabled=next<0||next>=lessonDeck.slides.length;$('previous').disabled=previous<0||previous>=lessonDeck.slides.length;

  $('page-number').max=lessonDeck.slides.length;$('page-number').disabled=classroom.waiting;
  const lock=$('classroom-page-lock'),open=classroom.openPages.includes(state.page+1);lock.hidden=!classroom.isTeacher;
  lock.textContent=open?'이 페이지 숨기기':'이 페이지 보이기';lock.disabled=classroom.busy;
  lock.setAttribute('aria-pressed',String(open));lock.setAttribute('aria-label',(state.page+1)+'쪽 '+(open?'열림 · 눌러 잠그기':'잠김 · 눌러 열기'));
  lock.title=open?'이 페이지를 학생에게 숨깁니다':'이 페이지를 학생에게 엽니다';
  $('classroom-lock-all').disabled=classroom.busy||!classroom.openPages.length;
  $('classroom-open-all').disabled=classroom.busy||classroom.openPages.length===lessonDeck.slides.length;
  const screenButton=$('classroom-screen-lock');if(screenButton){screenButton.disabled=classroom.busy;screenButton.textContent=classroom.screenLocked?'전체 화면 해제':'전체 화면 잠금';screenButton.classList.toggle('is-locked',classroom.screenLocked);screenButton.setAttribute('aria-pressed',String(classroom.screenLocked));$('classroom-screen-status').textContent='현재 페이지는 학생에게 '+(open?'보이며':'숨겨져 있으며')+', 전체 화면은 '+(classroom.screenLocked?'잠겨 있습니다':'해제되어 있습니다')}
  $('classroom-waiting').hidden=!classroom.waiting;document.body.classList.toggle('classroom-waiting',classroom.waiting);
  for(const button of [$('next'),$('previous')])button.title=button.disabled?'선생님이 다음 페이지를 열면 이동할 수 있어요':'';
}
function showClassroomBrake(){classroom.message='아직 잠긴 페이지예요. 선생님이 열어 주시면 이동할 수 있어요.';$('page-number').value=state.page+1;updateClassroomNavigation()}
function suspendClassroomSlide(){
  controller?.abort();document.querySelectorAll('dialog:not(#classroom-screen-overlay)').forEach(d=>{d.querySelectorAll('iframe').forEach(f=>f._gameCleanup?.());d.close();d.remove();});if(animation){clearInterval(animation);animation=null;}currentFrame?._gameCleanup?.();currentFrame=null;const content=$('slide-content');content.querySelector('.error-stage,.quiz-stage,.sharing-stage')?.dispose?.();content.replaceChildren();
}
function classroomUnavailable(){suspendClassroomSlide();pendingClassroomState=null;classroom.unavailable=true;classroom.connected=false;classroom.isTeacher=false;classroom.openPages=[];classroom.waiting=true;classroom.message='삭제되었거나 찾을 수 없는 수업이에요. 참여 코드를 확인해 주세요.';updateClassroomNavigation()}
function receiveClassroomState(data){
  if(classroom.unavailable)return;
  if(data.deleted){classroomUnavailable();return}
  if(classroom.busy){if(!pendingClassroomState||data.revision>=pendingClassroomState.revision)pendingClassroomState=data;return}
  applyClassroomState(data);
}
function applyClassroomState(data){
  if(classroom.unavailable)return;
  if(Number.isInteger(data.revision)&&data.revision<classroom.revision)return;
  if(!Array.isArray(data.openPages)||data.openPages.some(page=>!Number.isInteger(page)||page<1||page>lessonDeck.slides.length))throw Error('수업 정보를 확인하지 못했어요.');
  const wasWaiting=classroom.waiting,changed=JSON.stringify(classroom.openPages)!==JSON.stringify(data.openPages);
  classroom.openPages=[...new Set(data.openPages)].sort((a,b)=>a-b);classroom.maxPage=Math.max(0,...classroom.openPages);classroom.revision=data.revision||classroom.revision;classroom.name=data.name||'플래피 수업';
  classroom.isTeacher=classroom.teacherRequested&&data.canManage===true;classroom.connected=true;classroom.loaded=true;
  classroom.events=data.events===true;const boardLink=$('classroom-board-link');if(boardLink)boardLink.href='/board?room='+classroom.room;
  classroom.screenLocked=data.screenLocked===true;
  updateClassroomScreenLock();
  if(classroom.teacherRequested&&!classroom.isTeacher){location.replace('/classes?teach='+classroom.room);return}
  classroom.waiting=!classroom.isTeacher&&!classroom.openPages.length;
  if(classroom.isTeacher&&!$('slide-content').firstElementChild)render();
  if(changed||classroom.message.startsWith('연결')||classroom.message.startsWith('수업'))classroom.message='';
  if(classroom.waiting&&!wasWaiting)suspendClassroomSlide();
  if(!classroom.isTeacher&&!classroom.waiting&&(wasWaiting||!canVisitPage(state.page))){
    const prior=classroom.openPages.filter(page=>page<=state.page+1).at(-1)||classroom.openPages[0];state.page=prior-1;render();
  }
  updateClassroomNavigation();
}
async function changeClassroomPages(change){
  if(!classroom.isTeacher||classroom.busy)return;
  classroom.busy=true;classroom.message='';updateClassroomNavigation();
  try{
    const response=await fetch('/api/classroom/'+classroom.room,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(change),signal:AbortSignal.timeout(6000)}),data=await response.json();
    if(!response.ok)throw Error(data.error||'페이지 상태를 바꾸지 못했어요.');applyClassroomState(data);
  }catch(error){classroom.message=error.message}finally{classroom.busy=false;if(pendingClassroomState){const latest=pendingClassroomState;pendingClassroomState=null;applyClassroomState(latest)}updateClassroomNavigation()}
}
function toggleClassroomPage(){const page=state.page+1;return changeClassroomPages({page,open:!classroom.openPages.includes(page)})}
function lockAllClassroomPages(){if(classroom.openPages.length)return changeClassroomPages({lockAll:true})}
function openAllClassroomPages(){if(classroom.openPages.length<lessonDeck.slides.length)return changeClassroomPages({maxPage:lessonDeck.slides.length})}
async function connectClassroom(){
  if(!classroom.room)return;
  $('classroom-qr-open').onclick=openClassroomQR;
  $('classroom-page-lock').onclick=toggleClassroomPage;
  $('classroom-lock-all').onclick=lockAllClassroomPages;
  $('classroom-open-all').onclick=openAllClassroomPages;
  if($('classroom-screen-lock'))$('classroom-screen-lock').onclick=()=>changeClassroomPages({screenLock:!classroom.screenLocked});
  $('classroom-code').onclick=async()=>{try{await navigator.clipboard.writeText(classroom.room);classroom.message='참여 코드를 복사했어요.'}catch{classroom.message='참여 코드: '+classroom.room}updateClassroomNavigation()};
  let stopped=false,pending=false,timer,socket=null,socketReady=false,reconnectTimer,reconnectDelay=1000;
  function connectEvents(){
    if(stopped||classroom.unavailable||!classroom.events||reconnectTimer||typeof WebSocket==='undefined'||socket&&socket.readyState<2)return;
    const url=new URL('/api/classroom/'+classroom.room+'/events',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
    let current;try{current=new WebSocket(url)}catch{return}
    socket=current;
    current.onopen=()=>{if(socket!==current)return;socketReady=true;reconnectDelay=1000;clearTimeout(timer);poll()};
    current.onmessage=event=>{
      if(socket!==current||event.data==='pong')return;
      try{const data=JSON.parse(event.data);if(data.code!==classroom.room)throw Error('Wrong classroom');receiveClassroomState(data);if(classroom.unavailable){clearTimeout(timer);clearTimeout(reconnectTimer);current.close(1000,'Classroom deleted')}}catch{current.close(1008,'Invalid classroom state')}
    };
    current.onerror=()=>current.close();
    current.onclose=()=>{if(socket!==current)return;socket=null;socketReady=false;if(stopped||classroom.unavailable)return;clearTimeout(timer);poll();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(()=>{reconnectTimer=null;connectEvents()},reconnectDelay+Math.random()*250);reconnectDelay=Math.min(15000,reconnectDelay*2)};
  }
  async function poll(){
    if(stopped||pending||classroom.unavailable)return;pending=true;
    try{
      const response=await fetch('/api/classroom/'+encodeURIComponent(classroom.room),{cache:'no-store',signal:AbortSignal.timeout(8000)}),data=await response.json();
      if(!response.ok)throw Object.assign(Error(data.error||'수업 연결을 확인해 주세요.'),{status:response.status});
      receiveClassroomState(data);
    }catch(error){
      if(error.status===404||error.status===410)classroomUnavailable();
      else if(!socketReady){classroom.connected=false;classroom.message='연결을 확인해 주세요. 마지막으로 열린 페이지만 이동할 수 있어요.'}
    }finally{pending=false;updateClassroomNavigation();if(!stopped&&!classroom.unavailable){connectEvents();clearTimeout(timer);timer=setTimeout(poll,socketReady?30000+Math.random()*5000:1500+Math.random()*250)}}
  }
  window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);clearTimeout(reconnectTimer);reconnectTimer=null;socket?.close()},{once:true});
  window.addEventListener('pageshow',event=>{if(event.persisted){stopped=false;poll()}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){clearTimeout(timer);poll()}});
  await poll();
}

// qrcode-generator (MIT) is a same-origin vendor asset, requested only on click.
let classroomQRLibrary=null;
function loadClassroomQR(){
  if(typeof window.qrcode==='function')return Promise.resolve(window.qrcode);
  if(classroomQRLibrary)return classroomQRLibrary;
  classroomQRLibrary=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const fail=()=>{clearTimeout(timer);script.remove();reject(Error('QR을 불러오지 못했어요. 닫은 뒤 다시 눌러 주세요.'))};
    const timer=setTimeout(fail,10000);
    script.src='/vendor/qrcode-generator-2.0.4.js';script.async=true;
    script.onload=()=>{if(typeof window.qrcode!=='function'){fail();return}clearTimeout(timer);resolve(window.qrcode)};
    script.onerror=fail;document.head.append(script);
  }).catch(error=>{classroomQRLibrary=null;throw error});
  return classroomQRLibrary;
}
async function openClassroomQR(){
  if(!classroom.isTeacher||!/^\d{6}$/.test(classroom.room)||$('classroom-qr-dialog'))return;
  const url=new URL('/lesson',location.origin);url.searchParams.set('room',classroom.room);
  const dialog=document.createElement('dialog');dialog.id='classroom-qr-dialog';dialog.className='classroom-qr-card';
  dialog.setAttribute('aria-labelledby','classroom-qr-title');dialog.setAttribute('aria-describedby','classroom-qr-help');
  const title=document.createElement('h2');title.id='classroom-qr-title';title.textContent=classroom.name;
  const close=document.createElement('button');close.id='classroom-qr-close';close.type='button';close.textContent='✕';close.setAttribute('aria-label','QR 크게 보기 닫기');
  const picture=document.createElement('div');picture.className='classroom-qr-picture';picture.setAttribute('aria-busy','true');
  const canvas=document.createElement('canvas');canvas.id='classroom-qr-canvas';canvas.hidden=true;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',classroom.name+' 학생 입장 QR');
  const status=document.createElement('p');status.className='classroom-qr-status';status.setAttribute('role','status');status.textContent='QR을 준비하고 있어요…';picture.append(canvas,status);
  const code=document.createElement('p');code.id='classroom-qr-code';code.textContent='코드 '+classroom.room;
  const help=document.createElement('p');help.id='classroom-qr-help';help.textContent='카메라로 찍으면 바로 들어와요';
  dialog.append(close,title,picture,code,help);document.body.append(dialog);
  close.onclick=()=>dialog.close();
  dialog.addEventListener('click',event=>{const rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close()});
  dialog.addEventListener('close',()=>{dialog.remove();$('classroom-qr-open')?.focus({preventScroll:true})},{once:true});
  dialog.showModal();close.focus({preventScroll:true});
  try{
    const generate=await loadClassroomQR();if(!dialog.isConnected||!dialog.open)return;
    const qr=generate(0,'M');qr.addData(url.href,'Byte');qr.make();
    // Integer-sized modules plus exactly four white modules on every side.
    const modules=qr.getModuleCount(),quiet=4,scale=16,size=(modules+quiet*2)*scale;
    canvas.width=canvas.height=size;const context=canvas.getContext('2d');
    context.fillStyle='#fff';context.fillRect(0,0,size,size);context.fillStyle='#000';
    for(let row=0;row<modules;row++)for(let col=0;col<modules;col++)if(qr.isDark(row,col))context.fillRect((col+quiet)*scale,(row+quiet)*scale,scale,scale);
    canvas.hidden=false;status.remove();
  }catch(error){if(dialog.isConnected)status.textContent=error.message}
  finally{picture.setAttribute('aria-busy','false')}
}
