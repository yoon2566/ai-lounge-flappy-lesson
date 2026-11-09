import {handleClassroom,teacherSessionExpiry} from './classroom/classroom-cloud.mjs';
import {handleClassroomBoard,handleClassroomWorkManagement,handleAllWorkManagement} from './classroom/classroom-board-api.mjs';
export {ClassroomEvents} from './classroom/classroom-events.mjs';
import {handleBoard} from './board-api.mjs';
import {slides} from './course-data.mjs';
import {handleRankings} from './rankings.mjs';
import {generateLesson} from './sherpa-ai.mjs';
import {imageStorageMode,imageType,readImage,storeImage} from './image-storage.mjs';
const buckets = new Map();
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function limited(request,kind){
  const minute=Math.floor(Date.now()/60000),ip=request.headers.get('CF-Connecting-IP')||'local';
  if(buckets.size>5000)for(const [key,value] of buckets)if(value.minute<minute)buckets.delete(key);
  for(const [key,max] of [[kind+':'+ip,6000],[kind+':all',5000]]){
    let entry=buckets.get(key);if(!entry||entry.minute!==minute)entry={minute,count:0};
    buckets.set(key,entry);if(++entry.count>max)return true;
  }
  return false;
}
function sameOrigin(request,url){return request.headers.get('Origin')===url.origin&&request.headers.get('Sec-Fetch-Site')!=='cross-site';}
async function readLimited(request,limit){
  if(Number(request.headers.get('Content-Length'))>limit)throw Error('요청 파일이 너무 큽니다.');
  if(!request.body)throw Error('내용이 비어 있습니다.');
  const reader=request.body.getReader(),parts=[];let size=0;
  try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('요청 파일이 너무 큽니다.');}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  const path=url.pathname;
  const events=/^\/api\/classroom\/([0-9]{6})\/events$/.exec(path);
  if(events){
    if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'실시간 연결을 확인해 주세요.'},426);
    if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json({error:'같은 수업 화면에서 연결해 주세요.'},403);
    const stateUrl=new URL(url);stateUrl.pathname='/api/classroom/'+events[1];
    const response=await handleClassroom(new Request(stateUrl,{headers:request.headers}),env,slides);if(!response.ok)return response;
    const state=await response.json(),headers=new Headers(request.headers);headers.set('X-Classroom-State',encodeURIComponent(JSON.stringify(state)));headers.set('X-Classroom-Code',events[1]);headers.set('X-Classroom-Can-Manage',String(state.canManage));headers.set('X-Classroom-Auth-Until',String(state.canManage?await teacherSessionExpiry(request,env.CLASSROOM_DB,Date.now()):0));headers.delete('Cookie');headers.delete('Authorization');
    return env.CLASSROOM_EVENTS.getByName(events[1]).fetch(new Request(request,{headers}));
  }
  if(path==='/api/classroom/works'||path.startsWith('/api/classroom/works/'))return handleAllWorkManagement(request,env);
  if(/^\/api\/classroom\/[^/]+\/works(?:\/|$)/.test(path))return handleClassroomWorkManagement(request,env);
  if(path==='/api/classroom'||path.startsWith('/api/classroom/'))return handleClassroom(request,env,slides);
  if(path.startsWith('/api/board')&&url.searchParams.has('room')){if(!['GET','HEAD'].includes(request.method)&&limited(request,'board'))return json({error:'잠시 후 다시 게시해 주세요.'},429);return handleClassroomBoard(request,env);}
  if(url.pathname.startsWith('/api/board')){if(request.method==='POST'&&limited(request,'board'))return json({error:'잠시 후 다시 게시해 주세요.'},429);return handleBoard(request,env);}
  if(url.pathname.startsWith('/api/flappy/'))return handleRankings(request,env,url,limited);
  if(url.pathname==='/api/health')return json({ok:true,classroom:true,realtime:Boolean(env.CLASSROOM_EVENTS),course:'flappy-image-lesson',slides:slides.length,chatModel:'anthropic/claude-haiku-5.5',effort:'high',thinkingEnabled:false,imageModel:'recraft/recraft-v4.1-flash',aiProvider:'openrouter',aiCredential:'sherpa',aiConfigured:Boolean(env.SHERPA_OPENROUTER_KEY),imageHosting:imageStorageMode(env)!=='unconfigured',imageStorage:imageStorageMode(env),legacyKVImages:Boolean(env.LESSON_IMAGES),rankings:Boolean(env.FLAPPY_RANKINGS),nicknameCheck:{model:'anthropic/claude-haiku-5.5',effort:'low',thinkingEnabled:false}});
  if(url.pathname.startsWith('/images/')){
    if(!['GET','HEAD'].includes(request.method))return json({error:'이미지는 읽기만 가능합니다.'},405);
    const key=url.pathname.slice(8);if(!/^[a-f0-9-]{36}\.(?:webp|png)$/.test(key))return new Response('Not found',{status:404});
    try{return await readImage(env,key,request.method);}catch{return json({error:'이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
  }
  if(url.pathname.startsWith('/api/')){
    if(request.method!=='POST')return json({error:'POST 요청만 가능합니다.'},405);
    if(!sameOrigin(request,url))return json({error:'배포된 수업 화면에서 실행해 주세요.'},403);
    if(!['/api/chat','/api/assets'].includes(url.pathname))return json({error:'없는 기능입니다.'},404);
    if(url.searchParams.has('room')){const room=url.searchParams.get('room');if(!/^[0-9]{6}$/.test(room||'')||!await env.CLASSROOM_DB.prepare('SELECT code FROM classrooms WHERE code=?1 AND deleted_at IS NULL').bind(room).first())return json({error:'참여 코드를 확인해 주세요.'},404);}
    const kind=url.pathname==='/api/assets'?'upload':'ai';
    if(limited(request,kind))return json({error:'요청이 많습니다. 1분 뒤 다시 실행해 주세요.'},429);
    try{
      if(kind==='upload'){
        const declaredType=request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
        if(!['image/webp','image/png'].includes(declaredType))return json({error:'그림을 저장하지 못했습니다. 다시 시도해 주세요.'},415);
        const bytes=await readLimited(request,2*1024*1024),type=imageType(bytes);
        if(!type||type!==declaredType)return json({error:'그림을 저장하지 못했습니다. 다시 시도해 주세요.'},415);
        const key=crypto.randomUUID()+(type==='image/png'?'.png':'.webp');await storeImage(env,key,bytes);
        return json({url:url.origin+'/images/'+key,bytes:bytes.length,type});
      }
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'요청 형식을 확인해 주세요.'},415);
      const body=JSON.parse(new TextDecoder().decode(await readLimited(request,320*1024)));
      if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>8)throw Error('대화 내용을 확인해 주세요.');
      for(const message of body.messages)if(!['user','assistant'].includes(message.role)||typeof message.content!=='string'||message.content.length>220000)throw Error('요청 내용을 확인해 주세요.');
      return await generateLesson(body,env,request.signal);
    }catch(error){return json({error:error instanceof SyntaxError?'요청 내용을 읽지 못했습니다.':error.message||'연결에 실패했습니다.'},400);}
  }
  if(!['GET','HEAD'].includes(request.method))return json({error:'허용되지 않은 요청입니다.'},405);
  if(path==='/'&&url.searchParams.has('room'))return Response.redirect(url.origin+'/lesson'+url.search,302);
  if(path==='/teacher')return Response.redirect(url.origin+'/classes',302);
  const routes={'/':'/index.html','/classes':'/index.html','/lesson':'/lesson.html','/board':url.searchParams.has('room')?'/class-board.html':'/board.html','/board.html':url.searchParams.has('room')?'/class-board.html':'/board.html'};
  if(routes[path]){const target=new URL(url);target.pathname=routes[path];const result=await env.ASSETS.fetch(new Request(target,request));const headers=new Headers(result.headers);headers.set('Cache-Control','no-store');return new Response(result.body,{status:result.status,headers});}
  return env.ASSETS.fetch(request);
}};
