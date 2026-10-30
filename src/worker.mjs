import {handleBoard} from './board-api.mjs';
import {slides} from './course-data.mjs';
import {handleRankings} from './rankings.mjs';
import {generateLesson} from './sherpa-ai.mjs';
import {imageStorageMode,readImage,storeImage} from './image-storage.mjs';
const buckets = new Map();
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function limited(request,kind){
  const minute=Math.floor(Date.now()/60000),ip=request.headers.get('CF-Connecting-IP')||'local';
  if(buckets.size>5000)for(const [key,value] of buckets)if(value.minute<minute)buckets.delete(key);
  for(const [key,max] of [[kind+':'+ip,kind==='upload'?30:60],[kind+':all',kind==='upload'?500:1000]]){
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
  if(url.pathname.startsWith('/api/board')){if(request.method==='POST'&&limited(request,'board'))return json({error:'잠시 후 다시 게시해 주세요.'},429);return handleBoard(request,env);}
  if(url.pathname.startsWith('/api/flappy/'))return handleRankings(request,env,url,limited);
  if(url.pathname==='/api/health')return json({ok:true,course:'flappy-image-lesson',slides:slides.length,chatModel:'anthropic/claude-haiku-5.5',effort:'high',thinkingEnabled:false,imageModel:'recraft/recraft-v4.1-flash',aiProvider:'openrouter',aiCredential:'sherpa',aiConfigured:Boolean(env.SHERPA_OPENROUTER_KEY),imageHosting:imageStorageMode(env)!=='unconfigured',imageStorage:imageStorageMode(env),legacyKVImages:Boolean(env.LESSON_IMAGES),rankings:Boolean(env.FLAPPY_RANKINGS),nicknameCheck:{model:'anthropic/claude-haiku-5.5',effort:'low',thinkingEnabled:false}});
  if(url.pathname.startsWith('/images/')){
    if(!['GET','HEAD'].includes(request.method))return json({error:'이미지는 읽기만 가능합니다.'},405);
    const key=url.pathname.slice(8);if(!/^[a-f0-9-]{36}\.webp$/.test(key))return new Response('Not found',{status:404});
    try{return await readImage(env,key,request.method);}catch{return json({error:'이미지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},503);}
  }
  if(url.pathname.startsWith('/api/')){
    if(request.method!=='POST')return json({error:'POST 요청만 가능합니다.'},405);
    if(!sameOrigin(request,url))return json({error:'배포된 수업 화면에서 실행해 주세요.'},403);
    if(!['/api/chat','/api/assets'].includes(url.pathname))return json({error:'없는 기능입니다.'},404);
    const kind=url.pathname==='/api/assets'?'upload':'ai';
    if(limited(request,kind))return json({error:'요청이 많습니다. 1분 뒤 다시 실행해 주세요.'},429);
    try{
      if(kind==='upload'){
        if(request.headers.get('Content-Type')?.split(';')[0]!=='image/webp')return json({error:'WebP 파일을 올려 주세요.'},415);
        const bytes=await readLimited(request,2*1024*1024),sig=new TextDecoder('ascii').decode(bytes.slice(0,12));
        if(bytes.length<24||sig.slice(0,4)!=='RIFF'||sig.slice(8,12)!=='WEBP')return json({error:'정상적인 WebP 이미지가 아닙니다.'},415);
        const key=crypto.randomUUID()+'.webp';await storeImage(env,key,bytes);
        return json({url:url.origin+'/images/'+key,bytes:bytes.length,type:'image/webp'});
      }
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'요청 형식을 확인해 주세요.'},415);
      const body=JSON.parse(new TextDecoder().decode(await readLimited(request,320*1024)));
      if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>8)throw Error('대화 내용을 확인해 주세요.');
      for(const message of body.messages)if(!['user','assistant'].includes(message.role)||typeof message.content!=='string'||message.content.length>220000)throw Error('요청 내용을 확인해 주세요.');
      return await generateLesson(body,env,request.signal);
    }catch(error){return json({error:error instanceof SyntaxError?'요청 내용을 읽지 못했습니다.':error.message||'연결에 실패했습니다.'},400);}
  }
  return env.ASSETS.fetch(request);
}};
