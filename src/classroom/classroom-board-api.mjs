import {handleBoard} from '../board-api.mjs';
import {isHeartPath,handleBoardHearts} from './board-hearts.mjs';
import {teacherSessionExpiry} from './classroom-cloud.mjs';

const PAGE_SIZE=20,MAX_HTML_BYTES=1500000,MAX_BODY_BYTES=3200000;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{...headers,...extra}});
const metadata='id,author,title,lesson,bytes,created_at,revision,updated_at';
const fail=(status,error,code,item)=>{throw {status,data:{error,...(code?{code}:{}),...(item?{item}:{})}}};
const itemOf=work=>({id:work.id,author:work.author,title:work.title,lesson:work.lesson,bytes:work.bytes,created_at:work.created_at,revision:work.revision||1,updated_at:work.updated_at||work.created_at});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
function errorResponse(error){
  if(error?.status)return json(error.data,error.status,error.status===429?{'Retry-After':'60'}:{});
  return json({error:'게시판에 연결하지 못했어요. 잠시 후 같은 작업을 다시 시도해 주세요.'},503);
}
function sameOrigin(request){const url=new URL(request.url);if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'수업 사이트에서 실행해 주세요.')}
async function readBody(request){
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))fail(415,'요청 형식을 확인해 주세요.');
  if(Number(request.headers.get('Content-Length'))>MAX_BODY_BYTES)fail(413,'게임 파일이 너무 커요.');
  const reader=request.body?.getReader();if(!reader)fail(400,'요청 내용을 확인해 주세요.');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY_BYTES){await reader.cancel();fail(413,'게임 파일이 너무 커요.')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{fail(400,'요청 내용을 확인해 주세요.')}
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.hasOwn(input,'__proto__')||Object.hasOwn(input,'prototype')||Object.hasOwn(input,'constructor'))fail(400,'요청 내용을 확인해 주세요.');return input;
}
function titleOf(input){if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>80)fail(400,'작품 제목을 80자 이내로 적어 주세요.');return input.title.trim()}
function gameOf(input){
  const title=titleOf(input);if(typeof input.html!=='string'||!/<html(?:\s|>)/i.test(input.html)||!/<\/html\s*>/i.test(input.html))fail(400,'완성된 HTML 게임을 먼저 만들어 주세요.');
  const bytes=new TextEncoder().encode(input.html).byteLength;if(bytes>MAX_HTML_BYTES)fail(413,'게임 파일이 너무 커요. 1.5MB 이하의 HTML을 공유해 주세요.');const author=input.author===undefined?'익명':typeof input.author==='string'?input.author.trim():'';if(!author||author.length>40)fail(400,'이름 또는 닉네임을 40자 이내로 적어 주세요.');return {title,html:input.html,bytes,author};
}
function revisionOf(input){if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)fail(400,'작품 버전을 확인해 주세요.');return input.expectedRevision}
function secretOf(input){if(typeof input.editSecret!=='string'||!/^[a-f0-9]{64}$/.test(input.editSecret))fail(403,'이 작품을 처음 게시한 화면에서 수정해 주세요.');return input.editSecret}
async function owns(work,input){
  const actual=await digest(secretOf(input)),expected=work.edit_secret_hash||'';let difference=actual.length^expected.length;
  for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^(expected.charCodeAt(i)||0);
  if(difference)fail(403,'이 작품을 처음 게시한 화면에서 수정해 주세요.');
}
function live(work){if(work.deleted_at!==null&&work.deleted_at!==undefined)fail(410,'삭제된 작품은 다시 게시할 수 없어요. 선생님께 알려 주세요.','WORK_DELETED')}
function conflict(work){fail(409,'작품이 다른 화면에서 변경됐어요. 최신 제목을 확인한 뒤 다시 저장해 주세요.','WORK_CONFLICT',itemOf(work))}
async function roomOf(env,code){
  if(!/^[0-9]{6}$/.test(code||''))fail(400,'숫자 6자리 수업 코드를 확인해 주세요.');if(!env.CLASSROOM_DB)fail(503,'수업 게시판 연결을 확인해 주세요.');
  const room=await env.CLASSROOM_DB.prepare('SELECT code,board_visibility FROM classrooms WHERE code=?1 AND deleted_at IS NULL').bind(code).first();if(!room)fail(404,'수업을 찾지 못했어요. 참여 코드를 확인해 주세요.');return room;
}
const workOf=(env,code,id)=>env.CLASSROOM_DB.prepare('SELECT * FROM classroom_works WHERE room_code=?1 AND id=?2').bind(code,id).first();
const isPublic=room=>room.board_visibility!=='class';
const ownerOf=(env,code,hash)=>env.CLASSROOM_DB.prepare('SELECT work_id FROM classroom_board_owners WHERE room_code=?1 AND owner_hash=?2').bind(code,hash).first();
const sessionRequired=()=>fail(428,'수업 화면을 새로고침한 뒤 다시 저장해 주세요.','BOARD_SESSION_REQUIRED');
function boardCookie(request,code){
  const name='classroom_board_'+code,values=(request.headers.get('Cookie')||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'=')).map(part=>part.slice(name.length+1));
  return values.length===1&&/^[a-f0-9]{64}$/.test(values[0])?values[0]:null;
}
async function browserOwner(request,code){const token=boardCookie(request,code);if(!token)sessionRequired();return digest(token)}
async function boundWork(env,code,hash,id){
  const owner=await ownerOf(env,code,hash);if(!owner)return null;
  const work=await workOf(env,code,owner.work_id);if(work)live(work);
  if(id&&owner.work_id!==id||!work&&!id)fail(403,'이미 게시한 작품만 수정할 수 있어요. 처음 게시한 화면에서 저장해 주세요.','ALREADY_POSTED');
  return work;
}
async function adoptWork(env,code,hash,work){
  await env.CLASSROOM_DB.prepare('INSERT OR IGNORE INTO classroom_board_owners (room_code,owner_hash,work_id,created_at) VALUES (?1,?2,?3,?4)').bind(code,hash,work.id,Date.now()).run();
  return boundWork(env,code,hash,work.id);
}
async function boardSession(request,env,room,url){
  let cookie;
  try{
    sameOrigin(request);const input=await readBody(request);
    if(Object.keys(input).some(key=>!['workId','editSecret'].includes(key)))fail(400,'작품 저장 정보를 확인해 주세요.');
    const adopting=Object.hasOwn(input,'workId')||Object.hasOwn(input,'editSecret');
    if(adopting&&(typeof input.workId!=='string'||!/^[a-f0-9]{32}$/.test(input.workId)))fail(400,'작품 저장 정보를 확인해 주세요.');
    let token=boardCookie(request,room.code);
    if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');cookie=`classroom_board_${room.code}=${token}; Path=/api/board; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`}
    const hash=await digest(token);let work=await boundWork(env,room.code,hash,adopting?input.workId:null);
    if(adopting){
      const existing=work||await workOf(env,room.code,input.workId);if(!existing)fail(404,'작품을 찾을 수 없어요.');await owns(existing,input);
      // Keep the ownership record even for a deleted work. Deletion never frees
      // this browser's posting slot, including adoption from an older client.
      work=work||await adoptWork(env,room.code,hash,existing);live(work);
    }
    return json({registered:!!work,...(work?{item:itemOf(work)}:{})},200,cookie?{'Set-Cookie':cookie}:{});
  }catch(error){const response=errorResponse(error);if(cookie)response.headers.set('Set-Cookie',cookie);return response}
}
function download(work){
  const filename=(work.title.replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').trim()||'공유한_게임')+'.html';
  return new Response(work.html.startsWith('\ufeff')?work.html:'\ufeff'+work.html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="game.html"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Content-Security-Policy':"sandbox; default-src 'none'"}});
}

// The classroom copy is canonical. Shared revisions and tombstones prevent a
// delayed write from undoing a newer edit or resurrecting a deleted public work.
async function syncPublic(env,work,origin){
  if(!work.public_sync_pending)return;if(!env.ARTWORK_DB)fail(503,'공용 게시판 연결을 확인해 주세요. 같은 작업을 다시 시도해 주세요.');
  const deleted=work.deleted_at!==null&&work.deleted_at!==undefined,source=origin;
  await env.ARTWORK_DB.batch([
    env.ARTWORK_DB.prepare('INSERT INTO classroom_work_sync (id,revision,deleted,source) VALUES (?1,?2,?3,?4) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,deleted=excluded.deleted WHERE classroom_work_sync.source=excluded.source AND excluded.revision>classroom_work_sync.revision').bind(work.id,work.revision,deleted?1:0,source),
    env.ARTWORK_DB.prepare('INSERT INTO works (id,author,title,lesson,html,bytes,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS (SELECT 1 FROM classroom_work_sync WHERE id=?1 AND revision=?8 AND deleted=0 AND source=?9) AND (EXISTS (SELECT 1 FROM works WHERE id=?1) OR (SELECT COUNT(*) FROM works WHERE created_at>?10)<5000) ON CONFLICT(id) DO UPDATE SET author=excluded.author,title=excluded.title,lesson=excluded.lesson,html=excluded.html,bytes=excluded.bytes WHERE EXISTS (SELECT 1 FROM classroom_work_sync WHERE id=?1 AND revision=?8 AND deleted=0 AND source=?9)').bind(work.id,work.author,work.title,work.lesson,work.html,work.bytes,work.created_at,work.revision,source,Date.now()-60000),
    env.ARTWORK_DB.prepare('DELETE FROM works WHERE id=?1 AND EXISTS (SELECT 1 FROM classroom_work_sync WHERE id=?1 AND revision=?2 AND deleted=1 AND source=?3)').bind(work.id,work.revision,source)
  ]);
  const state=await env.ARTWORK_DB.prepare('SELECT revision,deleted,source FROM classroom_work_sync WHERE id=?1').bind(work.id).first();
  if(!state||state.source!==source||state.revision<work.revision)throw Error('Public synchronization did not complete');
  if(!state.deleted&&!await env.ARTWORK_DB.prepare('SELECT id FROM works WHERE id=?1').bind(work.id).first())fail(429,'공유 요청이 많아요. 1분 뒤 같은 작업을 다시 눌러 주세요.');
  await env.CLASSROOM_DB.prepare('UPDATE classroom_works SET public_sync_pending=0 WHERE id=?1 AND revision=?2').bind(work.id,work.revision).run();
}
async function repairPending(env,code,origin){const {results}=await env.CLASSROOM_DB.prepare('SELECT * FROM classroom_works WHERE room_code=?1 AND public_sync_pending=1 ORDER BY updated_at LIMIT 10').bind(code).all();for(const work of results)await syncPublic(env,work,origin)}
async function finishWrite(env,work,origin){
  await syncPublic(env,work,origin);
  const latest=await workOf(env,work.room_code,work.id);if(!latest)fail(404,'작품을 찾을 수 없어요.');live(latest);
  if(latest.title!==work.title||latest.html!==work.html)conflict(latest);return latest;
}
async function publicResponse(request,env,context){
  const response=await handleBoard(request,env);if(!response.ok||!response.headers.get('Content-Type')?.includes('application/json'))return response;
  const data=await response.json(),items=data.items||[data.item].filter(Boolean);
  if(items.length){const {results}=await env.ARTWORK_DB.prepare(`SELECT id,revision FROM classroom_work_sync WHERE id IN (${items.map((_,i)=>'?'+(i+1)).join(',')})`).bind(...items.map(item=>item.id)).all();const revisions=new Map(results.map(row=>[row.id,row.revision]));for(const item of items)item.revision=revisions.get(item.id)||1}
  return json(data.items?{...data,...context}:data,response.status);
}
async function saveWork(request,env,room,url){
  sameOrigin(request);const browserHash=await browserOwner(request,room.code),input=await readBody(request),game=gameOf(input);
  if(typeof input.workKey!=='string'||!/^[a-f0-9]{32}$/.test(input.workKey))sessionRequired();
  const ownerHash=await digest(secretOf(input)),author=game.author,lesson='플래피 게임 만들기',editable=true;
  const identity=[url.origin,room.code,'editable-work',input.workKey];
  const id=(await digest(JSON.stringify(identity))).slice(0,32),existing=await workOf(env,room.code,id);
  await boundWork(env,room.code,browserHash,id);
  if(existing){await owns(existing,input);await adoptWork(env,room.code,browserHash,existing);live(existing);if(existing.title!==game.title||existing.html!==game.html)conflict(existing);const saved=await finishWrite(env,existing,url.origin);return json({item:itemOf(saved),duplicate:true,editable,boardVisibility:isPublic(room)?'public':'class'})}
  const now=Date.now();
  // The reservation and work insert commit together. The owner primary key
  // admits only one work even when two tabs submit different keys concurrently.
  const [,result]=await env.CLASSROOM_DB.batch([
    env.CLASSROOM_DB.prepare('INSERT OR IGNORE INTO classroom_board_owners (room_code,owner_hash,work_id,created_at) SELECT ?1,?2,?3,?4 WHERE (SELECT COUNT(*) FROM classroom_works WHERE created_at>?5)<5000 AND NOT EXISTS (SELECT 1 FROM classroom_works WHERE id=?3 AND (room_code<>?1 OR edit_secret_hash IS NULL OR edit_secret_hash<>?6))').bind(room.code,browserHash,id,now,now-60000,ownerHash),
    env.CLASSROOM_DB.prepare('INSERT OR IGNORE INTO classroom_works (id,room_code,author,title,lesson,html,bytes,created_at,edit_secret_hash,revision,updated_at,public_sync_pending) SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?8,?10 WHERE EXISTS (SELECT 1 FROM classroom_board_owners WHERE room_code=?2 AND owner_hash=?12 AND work_id=?1) AND (SELECT COUNT(*) FROM classroom_works WHERE created_at>?11)<5000').bind(id,room.code,author,game.title,lesson,game.html,game.bytes,now,ownerHash,isPublic(room)?1:0,now-60000,browserHash)
  ]);
  await boundWork(env,room.code,browserHash,id);
  let work=await workOf(env,room.code,id);if(!work)fail(429,'공유 요청이 많아요. 1분 뒤 다시 눌러 주세요.');await owns(work,input);live(work);if(work.title!==game.title||work.html!==game.html)conflict(work);work=await finishWrite(env,work,url.origin);
  return json({item:itemOf(work),duplicate:!result.meta.changes,editable,boardVisibility:isPublic(room)?'public':'class'},result.meta.changes?201:200);
}
async function updateStudent(request,env,room,id,url){
  sameOrigin(request);const browserHash=await browserOwner(request,room.code),input=await readBody(request),game=gameOf(input),expectedRevision=revisionOf(input);
  await boundWork(env,room.code,browserHash,id);
  let work=await workOf(env,room.code,id);if(!work)fail(404,'작품을 찾을 수 없어요.');await owns(work,input);await adoptWork(env,room.code,browserHash,work);live(work);
  if(work.title===game.title&&work.html===game.html&&work.author===game.author){work=await finishWrite(env,work,url.origin);return json({item:itemOf(work),duplicate:true})}if(work.revision!==expectedRevision)conflict(work);
  const changed=await env.CLASSROOM_DB.prepare('UPDATE classroom_works SET title=?1,html=?2,bytes=?3,author=?9,revision=revision+1,updated_at=?4,public_sync_pending=?5 WHERE id=?6 AND room_code=?7 AND revision=?8 AND deleted_at IS NULL').bind(game.title,game.html,game.bytes,Date.now(),isPublic(room)?1:0,id,room.code,expectedRevision,game.author).run();
  work=await workOf(env,room.code,id);live(work);if(!changed.meta.changes&&(work.title!==game.title||work.html!==game.html))conflict(work);work=await finishWrite(env,work,url.origin);return json({item:itemOf(work),updated:true});
}
async function listRoom(request,env,code,managed=false){
  const url=new URL(request.url),cursor=url.searchParams.get('cursor'),ids=managed?url.searchParams.get('ids'):null;let statement;
  if(ids!==null){const requested=ids.split(',');if(requested.length>20||requested.some(id=>!/^[a-f0-9]{32}$/.test(id)))fail(400,'작품 목록 요청을 확인해 주세요.');statement=env.CLASSROOM_DB.prepare(`SELECT ${metadata} FROM classroom_works WHERE room_code=?1 AND deleted_at IS NULL AND id IN (${requested.map((_,i)=>'?'+(i+2)).join(',')}) ORDER BY created_at DESC,id DESC`).bind(code,...requested)}
  else if(cursor){const parts=/^(\d{13})\.([a-f0-9]{32})$/.exec(cursor);if(!parts)fail(400,'페이지 주소를 확인해 주세요.');statement=env.CLASSROOM_DB.prepare(`SELECT ${metadata} FROM classroom_works WHERE room_code=?1 AND deleted_at IS NULL AND (created_at,id)<(?2,?3) ORDER BY created_at DESC,id DESC LIMIT ?4`).bind(code,Number(parts[1]),parts[2],PAGE_SIZE+1)}
  else statement=env.CLASSROOM_DB.prepare(`SELECT ${metadata} FROM classroom_works WHERE room_code=?1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT ?2`).bind(code,PAGE_SIZE+1);
  const {results}=await statement.all(),items=results.slice(0,PAGE_SIZE).map(work=>({...itemOf(work),...(managed?{canManage:true}:{})})),last=items.at(-1);return {items,nextCursor:results.length>PAGE_SIZE?`${last.created_at}.${last.id}`:null,...(managed?{canManage:true}:{})};
}
export async function handleClassroomBoard(request,env){
  const url=new URL(request.url),path=url.pathname;
  if(isHeartPath(path))return handleBoardHearts(request,env);
  if(!url.searchParams.has('room'))return request.method==='GET'&&path!=='/api/board/session'?handleBoard(request,env):json({error:'수업에 참여한 뒤 작품을 저장해 주세요.','code':'ROOM_REQUIRED'},400);
  try{
    if(url.searchParams.getAll('room').length!==1)fail(400,'수업 코드를 확인해 주세요.');const room=await roomOf(env,url.searchParams.get('room')),requestedScope=url.searchParams.get('scope');if(requestedScope!==null&&!['all','room'].includes(requestedScope))fail(400,'게시판 범위를 확인해 주세요.');
    const scope=isPublic(room)?requestedScope||'all':'room',match=/^\/api\/board\/([a-f0-9]{32})(\/download)?$/.exec(path);
    if(path==='/api/board/session')return request.method==='POST'?await boardSession(request,env,room,url):json({error:'지원하지 않는 요청이에요.'},405,{'Allow':'POST'});
    if(path==='/api/board'&&request.method==='POST')return await saveWork(request,env,room,url);
    if(match&&!match[2]&&request.method==='PATCH')return await updateStudent(request,env,room,match[1],url);
    if(request.method==='GET'){
      await repairPending(env,room.code,url.origin);
      if(scope==='all')return await publicResponse(request,env,{boardVisibility:'public',scope,roomCode:room.code});
      if(path==='/api/board')return json({...await listRoom(request,env,room.code),boardVisibility:isPublic(room)?'public':'class',scope,roomCode:room.code});
      if(match){const work=await workOf(env,room.code,match[1]);if(!work)fail(404,'작품을 찾을 수 없어요.');live(work);return match[2]?download(work):json({item:{...itemOf(work),html:work.html}})}
    }
    if(path==='/api/board'||match)return json({error:'지원하지 않는 요청이에요.'},405,{'Allow':path==='/api/board'?'GET, POST':match[2]?'GET':'GET, PATCH'});return json({error:'작품 주소를 확인해 주세요.'},404);
  }catch(error){return errorResponse(error)}
}
export async function handleClassroomWorkManagement(request,env){
  const url=new URL(request.url),match=/^\/api\/classroom\/([0-9]{6})\/works(?:\/([a-f0-9]{32}))?$/.exec(url.pathname);
  try{
    if(!match)fail(404,'작품 주소를 확인해 주세요.');if(!env.CLASSROOM_DB||!await teacherSessionExpiry(request,env.CLASSROOM_DB,Date.now()))fail(401,'선생님으로 로그인한 뒤 관리해 주세요.');const room=await roomOf(env,match[1]),id=match[2];
    if(request.method==='GET'&&!id){await repairPending(env,room.code,url.origin);return json(await listRoom(request,env,room.code,true))}
    if(!id||!['PATCH','DELETE'].includes(request.method))return json({error:'지원하지 않는 요청이에요.'},405,{'Allow':id?'PATCH, DELETE':'GET'});
    sameOrigin(request);const input=await readBody(request),expectedRevision=revisionOf(input);let work=await workOf(env,room.code,id);if(!work)fail(404,'이 반의 작품을 찾을 수 없어요.');
    if(request.method==='DELETE'&&work.deleted_at!==null){await syncPublic(env,work,url.origin);return json({deleted:true,id,revision:work.revision})}live(work);
    const title=request.method==='PATCH'?titleOf(input):null;if(title!==null&&work.title===title){work=await finishWrite(env,work,url.origin);return json({item:itemOf(work),duplicate:true})}if(work.revision!==expectedRevision)conflict(work);
    const now=Date.now();const changed=request.method==='PATCH'
      ?await env.CLASSROOM_DB.prepare('UPDATE classroom_works SET title=?1,revision=revision+1,updated_at=?2,public_sync_pending=?3 WHERE id=?4 AND room_code=?5 AND revision=?6 AND deleted_at IS NULL').bind(title,now,isPublic(room)?1:0,id,room.code,expectedRevision).run()
      :await env.CLASSROOM_DB.prepare("UPDATE classroom_works SET deleted_at=?1,html='',bytes=0,revision=revision+1,updated_at=?1,public_sync_pending=?2 WHERE id=?3 AND room_code=?4 AND revision=?5 AND deleted_at IS NULL").bind(now,isPublic(room)?1:0,id,room.code,expectedRevision).run();
    work=await workOf(env,room.code,id);if(!changed.meta.changes){if(request.method==='PATCH'){live(work);if(work.title!==title)conflict(work)}else if(work.deleted_at===null)conflict(work)}
    if(request.method==='DELETE'){await syncPublic(env,work,url.origin);return json({deleted:true,id,revision:work.revision})}
    work=await finishWrite(env,work,url.origin);return json({item:itemOf(work),updated:true});
  }catch(error){return errorResponse(error)}
}


// Teacher moderation authenticates on the current service, then updates the
// canonical classroom record even when it belongs to the other Dino version.
export async function handleAllWorkManagement(request,env){
 const url=new URL(request.url),match=/^\/api\/classroom\/works(?:\/([a-f0-9]{32}))?$/.exec(url.pathname);
 try{
  if(!await teacherSessionExpiry(request,env.CLASSROOM_DB,Date.now()))fail(401,'선생님으로 로그인한 뒤 관리해 주세요.');
  if(!match)fail(404,'작품 주소를 확인해 주세요.');
  const databases=[env.CLASSROOM_DB,env.OTHER_CLASSROOM_DB].filter(Boolean);
  async function locate(id){
   for(const db of databases){const work=await db.prepare('SELECT * FROM classroom_works WHERE id=?1').bind(id).first();if(work)return {work,db}}
   const work=await env.ARTWORK_DB.prepare('SELECT * FROM works WHERE id=?1').bind(id).first();return work?{work,db:null}:null;
  }
  if(request.method==='GET'&&!match[1]){
   const ids=(url.searchParams.get('ids')||'').split(',');
   if(ids.length>20||ids.some(id=>!/^[a-f0-9]{32}$/.test(id)))fail(400,'작품 목록 요청을 확인해 주세요.');
   const slots=ids.map((_,i)=>'?'+(i+1)).join(','),records=new Map();
   for(const db of databases){const {results}=await db.prepare('SELECT '+metadata+',deleted_at FROM classroom_works WHERE id IN ('+slots+')').bind(...ids).all();for(const work of results)if(!records.has(work.id))records.set(work.id,work)}
   const {results}=await env.ARTWORK_DB.prepare('SELECT id,author,title,lesson,bytes,created_at FROM works WHERE id IN ('+slots+')').bind(...ids).all();for(const work of results)if(!records.has(work.id))records.set(work.id,work);
   const items=ids.map(id=>records.get(id)).filter(work=>work&&work.deleted_at==null).map(itemOf);
   return json({items,canManage:true});
  }
  if(!match[1]||!['PATCH','DELETE'].includes(request.method))fail(405,'지원하지 않는 요청이에요.');
  sameOrigin(request);const input=await readBody(request),found=await locate(match[1]);if(!found)fail(404,'작품을 찾을 수 없어요.');
  let {work,db}=found;const deleting=request.method==='DELETE';
  const title=deleting?null:titleOf(input);
  const author=deleting?null:(input.author===undefined?work.author:typeof input.author==='string'?input.author.trim():null);
  if(!deleting&&(author===null||!author||author.length>40))fail(400,'작성자 이름을 1~40자로 적어 주세요.');
  if(db){
   const sync=await env.ARTWORK_DB.prepare('SELECT source FROM classroom_work_sync WHERE id=?1').bind(work.id).first();
   const room=await db.prepare('SELECT board_visibility FROM classrooms WHERE code=?1').bind(work.room_code).first();
   const source=sync?.source||(db===env.CLASSROOM_DB?url.origin:env.OTHER_CLASSROOM_ORIGIN);
   if(!source)fail(503,'원본 게시판 연결을 확인해 주세요.');
   const targetEnv={...env,CLASSROOM_DB:db};
   if(deleting&&work.deleted_at!=null){await syncPublic(targetEnv,work,source);return json({deleted:true,id:work.id})}
   live(work);const expected=revisionOf(input);
   if(!deleting&&work.title===title&&work.author===author){work=await finishWrite(targetEnv,work,source);return json({item:itemOf(work),duplicate:true})}
   if(work.revision!==expected)conflict(work);
   const now=Date.now(),pending=(sync||room&&isPublic(room))?1:0;
   const changed=deleting
    ?await db.prepare("UPDATE classroom_works SET deleted_at=?1,html='',bytes=0,revision=revision+1,updated_at=?1,public_sync_pending=?2 WHERE id=?3 AND revision=?4 AND deleted_at IS NULL").bind(now,pending,work.id,expected).run()
    :await db.prepare('UPDATE classroom_works SET title=?1,author=?2,revision=revision+1,updated_at=?3,public_sync_pending=?4 WHERE id=?5 AND revision=?6 AND deleted_at IS NULL').bind(title,author,now,pending,work.id,expected).run();
   work=await workOf(targetEnv,work.room_code,work.id);if(!changed.meta.changes)conflict(work);
   await syncPublic(targetEnv,work,source);
   return json(deleting?{deleted:true,id:work.id,revision:work.revision}:{item:itemOf(work),updated:true});
  }
  // Legacy public posts have no revision column: compare the displayed text
  // atomically so concurrent moderation cannot silently overwrite another edit.
  if(input.expectedTitle!==work.title||input.expectedAuthor!==work.author)conflict(work);
  const changed=deleting
   ?await env.ARTWORK_DB.prepare('DELETE FROM works WHERE id=?1 AND title=?2 AND author=?3').bind(work.id,work.title,work.author).run()
   :await env.ARTWORK_DB.prepare('UPDATE works SET title=?1,author=?2 WHERE id=?3 AND title=?4 AND author=?5').bind(title,author,work.id,work.title,work.author).run();
  if(!changed.meta.changes)fail(409,'다른 화면에서 게시물이 변경됐어요. 새로고침해 주세요.');
  return json(deleting?{deleted:true,id:work.id}:{item:itemOf({...work,title,author}),updated:true});
 }catch(error){return errorResponse(error)}
}
