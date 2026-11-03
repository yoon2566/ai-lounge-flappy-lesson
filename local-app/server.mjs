import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {createClassroomService,makePasswordHash} from './classroom-server.cjs';
import {MODEL,imageRequest,generateImage} from './image-api.mjs';
import {COURSE_PROMPTS,generateCourse} from './course-api.mjs';
import {refinePrompt} from './prompt-api.mjs';
import {createLocalRankings} from './rankings-local.mjs';
import {createRankingBridge} from './rankings-bridge.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),pub=path.join(root,'public'),store=process.env.FLAPPY_STORE_DIR||path.join(root,'.local');
fs.mkdirSync(path.join(store,'media'),{recursive:true});fs.mkdirSync(path.join(store,'jobs'),{recursive:true});
let key=process.env.SHERPA_OPENROUTER_KEY;
if(!key&&process.platform==='win32')key=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"[Environment]::GetEnvironmentVariable('2_AI_Sherpa(openroter)','User')"],{encoding:'utf8',windowsHide:true}).trim();
const slides=JSON.parse(fs.readFileSync(path.join(pub,'slides.json'),'utf8')),authFile=path.join(store,'auth.json');
const roomsFile=path.join(store,'rooms.json');
if(fs.existsSync(roomsFile)&&slides.length===8){const data=JSON.parse(fs.readFileSync(roomsFile,'utf8'));if(data.version===1){fs.copyFileSync(roomsFile,roomsFile+'.before-course-v2');const map={1:1,2:2,3:3,4:6,5:8};for(const room of data.rooms||[]){room.openPages=room.openPages?.length===5?[1,2,3,4,5,6,7,8]:(room.openPages||[1]).map(n=>map[n]).filter(Boolean);room.revision++;}data.version=2;fs.writeFileSync(roomsFile,JSON.stringify(data,null,2));}}
const service=createClassroomService({slides,storeFile:path.join(store,'rooms.json'),passwordHash:fs.existsSync(authFile)?JSON.parse(fs.readFileSync(authFile,'utf8')):null});
const ranking=createLocalRankings(store,key);
const rankingBridge=createRankingBridge(store,ranking);
const jobs=new Map();
for(const name of fs.readdirSync(path.join(store,'jobs'))){if(!name.endsWith('.json'))continue;const job=JSON.parse(fs.readFileSync(path.join(store,'jobs',name),'utf8'));if(job.status==='pending'){job.status='error';job.error='서버가 재시작되어 결과를 확인하지 못했어요. 요청 기록을 확인한 뒤 다시 생성해 주세요.';}jobs.set(job.id,job);}
const saveJob=job=>fs.writeFileSync(path.join(store,'jobs',job.id+'.json'),JSON.stringify(job,null,2));
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
async function body(req,max=2e6){let chunks=[],n=0;for await(const b of req){n+=b.length;if(n>max)throw Object.assign(Error('요청이 너무 커요.'),{status:413});chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw Object.assign(Error('요청 형식이 맞지 않아요.'),{status:400});}}
function allow(req,room,page=8){if(!service.canAccess(req,room,page))throw Object.assign(Error('선생님이 이 페이지를 열면 시작할 수 있어요.'),{status:403});}
const publicJob=j=>({id:j.id,status:j.status,kind:j.kind,subject:j.subject,motion:j.motion,referenceId:j.referenceId,url:j.url,cost:j.usage?.cost,error:j.error});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return json(res,{error:'로컬 주소에서 열어 주세요.'},403);
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==url.origin)return json(res,{error:'수업 화면에서 요청해 주세요.'},403);
 if(url.pathname==='/api/local-config')return json(res,{requiresSetup:!fs.existsSync(authFile),keyAvailable:!!key,model:MODEL});
 if(url.pathname==='/api/setup'&&req.method==='POST'){
  if(fs.existsSync(authFile))return json(res,{error:'이미 비밀번호가 설정되어 있어요.'},409);
  const data=await body(req,4096);if(typeof data.password!=='string'||data.password.length<4||data.password.length>128)return json(res,{error:'선생님 비밀번호를 4~128자로 정해 주세요.'},400);
  const hash=makePasswordHash(data.password);fs.writeFileSync(authFile,JSON.stringify(hash),{flag:'wx'});service.setPasswordHash(hash);return json(res,{ok:true});
 }
 if(await service.handle(req,res,url))return;
 if(url.pathname==='/api/rankings-config'&&req.method==='GET')return json(res,rankingBridge.info);
 if(url.pathname.startsWith('/api/flappy/')){if(!['GET','POST'].includes(req.method))return json(res,{error:'지원하지 않는 요청이에요.'},405);const payload=req.method==='POST'?await body(req,2048):{},room=payload.room||url.searchParams.get('room');allow(req,room,4);const route=url.pathname.slice('/api/flappy/'.length);if(req.method==='GET'&&route!=='leaderboard')return json(res,{error:'POST 요청이 필요해요.'},405);return json(res,await rankingBridge.request(route,room,payload,req.method));}
 if(url.pathname==='/api/health')return json(res,{ok:true,localOnly:true,keyAvailable:!!key,model:MODEL});
 if(url.pathname==='/api/course-prompts'&&req.method==='GET')return json(res,COURSE_PROMPTS);
 if(url.pathname==='/api/course-prompt'&&req.method==='POST'){
  const data=await body(req,16000);allow(req,data.room,data.kind==='classic'?5:7);if(!key)return json(res,{error:'셰르파 API 키를 확인해 주세요.'},503);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  try{return json(res,await refinePrompt(data,key,controller.signal));}finally{clearTimeout(timer);}
 }
 if(url.pathname==='/api/course'&&req.method==='POST'){
  const data=await body(req);allow(req,data.room,data.kind==='classic'?5:7);if(!key)return json(res,{error:'셰르파 API 키를 확인해 주세요.'},503);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);res.on('close',()=>{if(!res.writableEnded)controller.abort();});
  const id=randomUUID(),dir=path.join(store,'code');fs.mkdirSync(dir,{recursive:true});
  const streaming=data.stream===true;
  const send=event=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(event)+'\n');};
  if(streaming){res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.flushHeaders();send({type:'start'});}
  try{const result=await generateCourse(data,key,controller.signal,result=>fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({id,room:data.room,kind:data.kind,prompt:data.prompt,createdAt:new Date().toISOString(),...result},null,2)),streaming?delta=>send({type:'delta',text:delta}):null);if(streaming){send({type:'complete',...result,id});return res.end();}return json(res,{...result,id});}
  catch(error){if(!streaming)throw error;send({type:'error',error:error.name==='AbortError'?'기다리기를 멈췄어요. 이전 게임은 그대로 있어요.':error.message});res.end();}finally{clearTimeout(timer);}
 }
 if(url.pathname==='/api/assets'&&req.method==='POST'){
  const data=await body(req,7e6);allow(req,data.room);if(!['frame1','frame2','background','item','obstacle'].includes(data.kind))return json(res,{error:'그림 종류를 확인해 주세요.'},400);
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(data.dataURL||'');if(!match)return json(res,{error:'저장할 그림을 확인해 주세요.'},400);
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>5e6||bytes.length<20)return json(res,{error:'그림 크기를 확인해 주세요.'},400);
  const ext=bytes[0]===137?'png':bytes[0]===255?'jpg':bytes.toString('ascii',0,4)==='RIFF'?'webp':null;if(!ext)return json(res,{error:'그림 파일이 아니에요.'},400);
  const file=randomUUID()+'.'+ext;fs.writeFileSync(path.join(store,'media',file),bytes);return json(res,{url:url.origin+'/media/'+file,kind:data.kind,bytes:bytes.length});
 }
 if(url.pathname==='/api/images'&&req.method==='POST'){
  const data=await body(req,12000);allow(req,data.room);if(!key)return json(res,{error:'사용자 환경 변수의 셰르파 OpenRouter 키를 확인해 주세요.'},503);
  if(!/^[a-f0-9-]{36}$/.test(data.id||''))return json(res,{error:'요청 번호를 확인해 주세요.'},400);
  const fingerprint=createHash('sha256').update(JSON.stringify([data.room,data.kind,data.subject,data.motion||'',data.referenceId||''])).digest('hex');
  if(jobs.has(data.id)){const old=jobs.get(data.id);if(old.fingerprint!==fingerprint)return json(res,{error:'같은 요청 번호의 내용이 달라요.'},409);return json(res,publicJob(old));}
  if([...jobs.values()].filter(j=>j.status==='pending').length>=3)return json(res,{error:'그림을 만들고 있어요. 잠시 뒤 다시 눌러 주세요.'},429);
  let referenceData;
  if(data.kind==='motion'){const ref=jobs.get(data.referenceId);if(!ref||ref.status!=='success'||ref.kind!=='character'||ref.room!==data.room)return json(res,{error:'이 수업에서 만든 첫 그림을 선택해 주세요.'},400);referenceData='data:'+mime[path.extname(ref.file)]+';base64,'+fs.readFileSync(path.join(store,'media',ref.file)).toString('base64');}
  const request=imageRequest({...data,referenceData});
  const job={id:data.id,room:data.room,kind:data.kind,subject:data.subject,motion:data.motion,referenceId:data.referenceId,fingerprint,status:'pending',model:MODEL,prompt:request.prompt,aspectRatio:request.aspect_ratio,startedAt:new Date().toISOString()};jobs.set(job.id,job);saveJob(job);
  (async()=>{try{const result=await generateImage(request,key,AbortSignal.timeout(180000));job.file=job.id+'.'+result.type;fs.writeFileSync(path.join(store,'media',job.file),result.bytes);Object.assign(job,{status:'success',url:'/media/'+job.file,usage:result.usage,sha256:createHash('sha256').update(result.bytes).digest('hex')});}catch(e){job.status='error';job.error=e.message;}finally{job.finishedAt=new Date().toISOString();saveJob(job);}})();
  return json(res,publicJob(job),202);
 }
 const jm=/^\/api\/image-jobs\/([a-f0-9-]{36})$/.exec(url.pathname);
 if(jm&&req.method==='GET'){const job=jobs.get(jm[1]);if(!job)return json(res,{error:'그림 요청을 찾지 못했어요.'},404);allow(req,job.room);return json(res,publicJob(job));}
 if(url.pathname==='/api/game'&&req.method==='POST'){
  const data=await body(req);allow(req,data.room);if(!key)return json(res,{error:'API 키를 확인해 주세요.'},503);
  if(typeof data.prompt!=='string'||!data.prompt.trim()||data.prompt.length>1500||typeof data.template!=='string'||data.template.length>180000)return json(res,{error:'바꾸고 싶은 내용을 확인해 주세요.'},400);
  const inlineAssets=[];const promptTemplate=data.template.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g,value=>{const id=inlineAssets.push(value)-1;return '__INLINE_ASSET_'+id+'__';});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);res.on('close',()=>{if(!res.writableEnded)controller.abort()});
  try{const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Title':'Flappy local code edit'},body:JSON.stringify({model:'anthropic/claude-haiku-5.5',messages:[{role:'system',content:'플래피 게임 HTML 편집자. 요청 부분만 수정하고 나머지 기능을 보존한다. 전체 독립 실행 HTML 하나를 html 코드블록으로 반환한다. 외부 통신·외부 라이브러리 없이 실행한다. __FLAPPY_CONFIG__ 자리표시자와 window.FLAPPY_CONFIG 설정/이미지 로딩, flappy-lesson 부모 메시지 조작을 반드시 보존한다. 이미지 데이터 대신 __INLINE_ASSET_숫자__ 자리표시자를 그대로 유지한다. 게임은 allow-scripts sandbox에서 실행한다.'},{role:'user',content:data.prompt+'\n\n현재 게임:\n'+promptTemplate}],max_tokens:20000,reasoning:{effort:'low'},stream:false})});if(!upstream.ok){await upstream.body?.cancel();throw Error('게임 수정 연결 실패 ('+upstream.status+')');}const out=await upstream.json(),text=out.choices?.[0]?.message?.content||'',html=text.match(/```html\s*([\s\S]*?)```/i)?.[1]||text;if(!html.includes('__FLAPPY_CONFIG__')||!/<html/i.test(html)||!/<\/html>/i.test(html))throw Error('완성된 게임 응답이 아니에요. 이전 게임을 유지합니다.');const restored=html.replace(/__INLINE_ASSET_(\d+)__/g,(_,i)=>inlineAssets[Number(i)]||'');if((restored.match(/__FLAPPY_CONFIG__/g)||[]).length!==1)throw Error('게임 설정을 보존하지 못했어요. 다시 요청해 주세요.');for(const match of restored.replace('__FLAPPY_CONFIG__','{}').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){new vm.Script(match[1]);}return json(res,{template:restored,cost:out.usage?.cost});}finally{clearTimeout(timer);}
 }
 if(url.pathname==='/api/board'&&req.method==='POST'){
  const data=await body(req,15e6);allow(req,data.room);if(typeof data.html!=='string'||data.html.length>14e6||typeof data.title!=='string'||!data.title.trim())return json(res,{error:'작품 제목과 게임을 확인해 주세요.'},400);
  const id=randomUUID(),dir=path.join(store,'board');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,id+'.html'),data.html);fs.writeFileSync(path.join(dir,id+'.json'),JSON.stringify({id,title:data.title.slice(0,80),author:String(data.author||'익명').slice(0,40),room:data.room,createdAt:Date.now()}));return json(res,{id});
 }
 if(url.pathname==='/api/board'&&req.method==='GET'){const dir=path.join(store,'board');const items=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))).filter(i=>i.room===url.searchParams.get('room')).sort((a,b)=>b.createdAt-a.createdAt):[];return json(res,{items});}
 const bm=/^\/api\/board\/([a-f0-9-]{36})$/.exec(url.pathname);
 if(bm&&req.method==='GET'){const file=path.join(store,'board',bm[1]+'.html');if(!fs.existsSync(file))return json(res,{error:'작품을 찾지 못했어요.'},404);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src data:",'X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(file));}
 if(!['GET','HEAD'].includes(req.method))return json(res,{error:'지원하지 않는 요청이에요.'},405);
 const mm=/^\/media\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/.exec(url.pathname);
 const aliases={'/':'index.html','/classes':'index.html','/lesson':'lesson.html','/board':'board.html'};
 const file=mm?path.join(store,'media',mm[1]):path.resolve(pub,aliases[url.pathname]||'.'+decodeURIComponent(url.pathname));
 if(!mm&&!file.startsWith(pub+path.sep)||!mime[path.extname(file)]||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,{error:'페이지를 찾지 못했어요.'},404);
 res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(e){if(!res.headersSent)json(res,{error:e.message||'다시 시도해 주세요.'},e.status||400);else res.destroy();}});
server.listen(Number(process.env.PORT||8160),'127.0.0.1',()=>console.log('로컬 플래피: http://127.0.0.1:'+(process.env.PORT||8160)+' · 셰르파 키 '+(key?'연결됨':'없음')));
