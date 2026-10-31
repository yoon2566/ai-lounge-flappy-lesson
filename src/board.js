'use strict';
const $=id=>document.getElementById(id),cursors=[null];let page=0,nextCursor=null,busy=false,viewerRequest=null,returnFocus=null,viewerFrame=null,downloadURL=null;
const date=value=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(value);
function element(tag,cls,text){const el=document.createElement(tag);el.className=cls;if(text)el.textContent=text;return el}
function releaseViewer(){viewerFrame?._gameCleanup?.();viewerFrame=null;if(downloadURL){URL.revokeObjectURL(downloadURL);downloadURL=null;}}
async function getJson(url,options){const response=await fetch(url,{cache:'no-store',...options}),data=await response.json();if(!response.ok)throw Error(data.error||'불러오지 못했어요. 다시 시도해 주세요.');return data}
async function loadPage(target){
  if(busy)return;busy=true;$('refresh').disabled=$('previous').disabled=$('next').disabled=true;$('status').textContent='공유한 작품을 불러오고 있어요.';$('works').setAttribute('aria-busy','true');
  try{
    const data=await getJson('/api/board'+(cursors[target]?'?cursor='+encodeURIComponent(cursors[target]):''));
    page=target;nextCursor=data.nextCursor;$('works').replaceChildren();
    for(const work of data.items){
      const card=element('button','card');card.type='button';card.setAttribute('aria-label',work.title+' · '+work.author+' · 게임 해보기');
      const top=element('div','card-top');top.append(element('span','card-mark','↗'),element('span','card-size',Math.max(1,Math.round(work.bytes/1000))+' KB'));
      card.append(top,element('h3','',work.title),element('div','card-meta',work.author+' · '+date(work.created_at)),element('div','card-play','게임 해보기 →'));
      card.addEventListener('click',()=>openWork(work.id,card));$('works').append(card);
    }
    if(!data.items.length){const empty=element('div','empty');empty.append(element('strong','','아직 공유된 작품이 없어요.'),element('div','','수업 마지막 화면에서 첫 번째 게임을 공유해 보세요!'));$('works').append(empty)}
    $('status').textContent=data.items.length?('최신순 · 이 페이지에 작품 '+data.items.length+'개'):'';$('page').textContent=(page+1)+' 페이지';
  }catch(error){$('status').textContent=error.message}
  finally{busy=false;$('refresh').disabled=false;$('previous').disabled=page===0;$('next').disabled=!nextCursor;$('works').setAttribute('aria-busy','false')}
}
async function openWork(id,source){
  if(!/^[a-f0-9]{32}$/.test(id))return;
  returnFocus=source||$('refresh');viewerRequest?.abort();releaseViewer();const controller=new AbortController();viewerRequest=controller;
  const timer=setTimeout(()=>controller.abort(),20000);
  $('work-title').textContent='공유한 게임';$('work-by').textContent='';$('play').replaceChildren(element('div','viewer-loading','게임을 불러오고 있어요.'));$('download').hidden=true;$('play-hint').textContent='게임 화면을 클릭한 뒤 조작해 보세요.';
  if(!$('viewer').open)$('viewer').showModal();
  const url=new URL(location.href);url.searchParams.set('work',id);history.replaceState(null,'',url);
  try{
    const {item}=await getJson('/api/board/'+id,{signal:controller.signal});
    if(viewerRequest!==controller||!$('viewer').open)return;
    $('work-title').textContent=item.title;$('work-by').textContent=item.author+' · '+date(item.created_at);
    const frame=document.createElement('iframe');frame.title=item.title;frame.setAttribute('allow','fullscreen');viewerFrame=frame;
    const reload=()=>mountGameFrame(frame,item.html,status=>{$('play-hint').textContent=gameStatusText(status);});$('reload-game').onclick=reload;
    frame.addEventListener('load',()=>{if(frame.isConnected)frame.focus({preventScroll:true})});$('play').replaceChildren(frame);reload();
    downloadURL=URL.createObjectURL(new Blob(['\ufeff',safeGameHTML(item.html)],{type:'text/html;charset=utf-8'}));$('download').href=downloadURL;$('download').download=(item.title.replace(/[<>:"/\\|?*]/g,'_')||'공유한_게임')+'.html';$('download').hidden=false;
  }catch(error){if(viewerRequest===controller&&$('viewer').open)$('play').replaceChildren(element('div','viewer-loading',error.name==='AbortError'?'연결이 지연되고 있어요. 닫은 뒤 다시 열어 주세요.':error.message))}
  finally{clearTimeout(timer)}
}
function closeWork(){viewerRequest?.abort();viewerRequest=null;releaseViewer();$('play').replaceChildren();$('viewer').close();const url=new URL(location.href);url.searchParams.delete('work');history.replaceState(null,'',url);if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})}
$('close').addEventListener('click',closeWork);$('viewer').addEventListener('cancel',event=>{event.preventDefault();closeWork()});
$('refresh').addEventListener('click',()=>{if(busy)return;cursors.splice(1);loadPage(0)});
$('previous').addEventListener('click',()=>loadPage(page-1));$('next').addEventListener('click',()=>{if(!nextCursor||busy)return;cursors[page+1]=nextCursor;loadPage(page+1)});
loadPage(0);const initialWork=new URLSearchParams(location.search).get('work');if(initialWork)openWork(initialWork);

const HOST=location.origin;
let uploadHTML='',uploadBusy=false,uploadVersion=0,uploadFrame=null,uploadValid=false;
function closeUpload(){if(uploadBusy)return;uploadVersion++;uploadHTML='';uploadValid=false;uploadFrame?._gameCleanup?.();uploadFrame=null;$('upload-preview').replaceChildren();$('upload-preview').hidden=true;$('upload-form').reset();$('upload-submit').disabled=true;$('upload-status').textContent='';$('uploader').close();$('upload-open').focus()}
$('upload-open').addEventListener('click',()=>$('uploader').showModal());
$('upload-close').addEventListener('click',closeUpload);
$('uploader').addEventListener('cancel',event=>{event.preventDefault();closeUpload()});
$('upload-file').addEventListener('change',async()=>{
 const version=++uploadVersion;uploadHTML='';uploadValid=false;uploadFrame?._gameCleanup?.();uploadFrame=null;$('upload-submit').disabled=true;$('upload-preview').replaceChildren();$('upload-preview').hidden=true;
 const file=$('upload-file').files[0];if(!file){$('upload-status').textContent='';return}
 try{
  if(!/\.html?$/i.test(file.name))throw Error('HTML 파일(.html 또는 .htm)을 선택해 주세요.');
  if(file.size>1500000)throw Error('HTML 파일은 1.5 MB 이하로 올려 주세요.');
  const raw=await file.text();if(version!==uploadVersion)return;
  if(!/<html[\s>]/i.test(raw)||!/<\/html\s*>/i.test(raw))throw Error('완전한 HTML 문서가 아니에요. 게임을 HTML 파일로 다시 저장해 주세요.');
  const html=safeGameHTML(raw);if(new TextEncoder().encode(html).length>1500000)throw Error('HTML 파일은 1.5 MB 이하로 올려 주세요.');
  uploadHTML=html;if(!$('upload-name').value.trim())$('upload-name').value=file.name.replace(/\.html?$/i,'').slice(0,80);
  const frame=document.createElement('iframe');frame.title='업로드할 게임 미리보기';uploadFrame=frame;
  $('upload-preview').append(frame);$('upload-preview').hidden=false;mountGameFrame(frame,html,status=>{if(version!==uploadVersion)return;uploadValid=status.valid;$('upload-submit').disabled=uploadBusy||!uploadValid;$('upload-status').textContent=gameStatusText(status);});
 }catch(error){if(version===uploadVersion)$('upload-status').textContent=error.message}
});
$('upload-form').addEventListener('submit',async event=>{
 event.preventDefault();if(uploadBusy||!uploadHTML||!uploadValid)return;
 const author=$('upload-author').value.trim(),title=$('upload-name').value.trim();if(!author||!title){$('upload-status').textContent='닉네임과 작품 제목을 입력해 주세요.';return}
 uploadBusy=true;for(const id of ['upload-submit','upload-file','upload-author','upload-name','upload-close'])$(id).disabled=true;$('upload-status').textContent='게시하고 있어요.';
 try{
  const data=await getJson('/api/board',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({author,title,html:uploadHTML})});
  uploadBusy=false;closeUpload();cursors.splice(1);await loadPage(0);$('status').textContent=data.duplicate?'이미 게시된 작품이에요.':'작품을 게시했어요.';
 }catch(error){$('upload-status').textContent=error.message}
 finally{uploadBusy=false;for(const id of ['upload-file','upload-author','upload-name','upload-close'])$(id).disabled=false;$('upload-submit').disabled=!uploadHTML||!uploadValid}
});
