const SESSION_MS=8*60*60*1000,LOGIN_WINDOW_MS=15*60*1000;
const encoder=new TextEncoder();
const json=(value,status=200,headers={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const hex=bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
const randomHex=size=>hex(crypto.getRandomValues(new Uint8Array(size)));
export function generateClassroomCode(){
  const value=new Uint32Array(1);
  // Reject the incomplete final million-value block to avoid modulo bias.
  do{crypto.getRandomValues(value)}while(value[0]>=4294000000);
  return String(value[0]%1000000).padStart(6,'0');
}
const digest=async value=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
function unhex(value){return Uint8Array.from(value.match(/../g)||[],part=>parseInt(part,16))}
async function passwordBits(password,salt,iterations){
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  return crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations},key,256);
}
export async function makeCloudPasswordHash(password){
  const salt=randomHex(16),iterations=100000;
  return JSON.stringify({salt,iterations,hash:hex(await passwordBits(password,salt,iterations))});
}
async function validPassword(password,secret){
  if(typeof password!=='string'||password.length>128)return false;
  const stored=JSON.parse(secret);
  if(!/^[a-f0-9]{32}$/.test(stored.salt)||!/^[a-f0-9]{64}$/.test(stored.hash)||stored.iterations!==100000)throw Error('Password configuration');
  const actual=new Uint8Array(await passwordBits(password,stored.salt,stored.iterations)),expected=unhex(stored.hash);
  if(typeof crypto.subtle.timingSafeEqual==='function')return crypto.subtle.timingSafeEqual(actual,expected);
  let different=0;for(let i=0;i<actual.length;i++)different|=actual[i]^expected[i];return different===0;
}
async function body(request){
  if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))throw Object.assign(Error('요청 형식을 확인해 주세요.'),{status:415});
  const reader=request.body?.getReader();if(!reader)return {};
  const parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw Object.assign(Error('요청이 너무 커요.'),{status:413})}parts.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let position=0;for(const part of parts){bytes.set(part,position);position+=part.byteLength}
  try{const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)||'{}');if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result}catch{throw Object.assign(Error('요청 형식을 확인해 주세요.'),{status:400})}
}
export function roomState(room,slides,canManage){
  const openPages=slides.flatMap((_,index)=>(room.open_mask&(1<<index))?[index+1]:[]);
  return {code:room.code,name:room.name,boardVisibility:room.board_visibility==='class'?'class':'public',createdAt:room.created_at,openPages,maxPage:Math.max(0,...openPages),totalPages:slides.length,revision:room.revision,expiresAt:null,canManage,events:true};
}
export async function teacherSessionExpiry(request,db,now){
  const cookie=(request.headers.get('Cookie')||'').split(';').map(part=>part.trim()).find(part=>part.startsWith('lounge_teacher='))?.slice('lounge_teacher='.length);
  if(!/^[a-f0-9]{64}$/.test(cookie||''))return 0;
  const session=await db.prepare('SELECT expires_at FROM classroom_sessions WHERE token_hash=?1 AND expires_at>?2').bind(await digest(cookie),now).first();
  return session?.expires_at||0;
}
async function notifyClassroom(env,state){
  if(!env.CLASSROOM_EVENTS)return;
  try{await env.CLASSROOM_EVENTS.getByName(state.code).publish(state)}catch(error){console.warn(JSON.stringify({event:'classroom-notification-error',type:error.name||'Error'}))}
}
async function login(request,env,password,now){
  if(!env.TEACHER_PASSWORD_HASH)return json({error:'강사 비밀번호 설정을 확인해 주세요.'},503);
  const db=env.CLASSROOM_DB,address=await digest(env.TEACHER_PASSWORD_HASH+'|'+(request.headers.get('CF-Connecting-IP')||'local'));
  const attempt=await db.prepare('INSERT INTO classroom_login_attempts (address,attempts,expires_at) VALUES (?1,1,?2) ON CONFLICT(address) DO UPDATE SET attempts=CASE WHEN expires_at<=?3 THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=?3 THEN ?2 ELSE expires_at END RETURNING attempts').bind(address,now+LOGIN_WINDOW_MS,now).first();
  if(attempt.attempts>10)return json({error:'비밀번호 입력을 여러 번 시도했어요. 15분 뒤 다시 시도해 주세요.'},429,{'Retry-After':'900'});
  if(!await validPassword(password,env.TEACHER_PASSWORD_HASH))return json({error:'강사 비밀번호가 맞지 않아요.'},401);
  const token=randomHex(32),secure=new URL(request.url).protocol==='https:'?'; Secure':'';
  await db.batch([
    db.prepare('DELETE FROM classroom_login_attempts WHERE address=?1 OR expires_at<=?2').bind(address,now),
    db.prepare('DELETE FROM classroom_sessions WHERE expires_at<=?1').bind(now),
    db.prepare('INSERT INTO classroom_sessions (token_hash,expires_at) VALUES (?1,?2)').bind(await digest(token),now+SESSION_MS)
  ]);
  return json({authenticated:true},200,{'Set-Cookie':'lounge_teacher='+token+'; HttpOnly; SameSite=Strict; Path=/api/classroom; Max-Age=28800'+secure});
}
export async function handleClassroom(request,env,slides,now=Date.now()){
  const url=new URL(request.url),route=url.pathname,db=env.CLASSROOM_DB;
  if(!db)return json({error:'수업 저장소 연결을 확인해 주세요.'},503);
  if(slides.length>30)throw Error('Unsupported slide count');
  try{
    if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return json({error:'같은 수업 화면에서 요청해 주세요.'},403);
    if(route==='/api/classroom/login'&&request.method==='POST')return await login(request,env,(await body(request)).password,now);
    const instructor=Boolean(await teacherSessionExpiry(request,db,now));
    if(route==='/api/classroom/config'&&request.method==='GET')return json({slides,authenticated:instructor});
    if(route==='/api/classroom'&&request.method==='GET'){
      if(!instructor)return json({error:'선생님 비밀번호를 확인한 뒤 입장해 주세요.'},401);
      if(url.searchParams.has('limit')){
        const limit=Number(url.searchParams.get('limit')),cursor=url.searchParams.get('cursor');
        const match=cursor?/^(\d{1,16}):([0-9]{6})$/.exec(cursor):null;
        if(!Number.isInteger(limit)||limit<1||limit>50||(cursor&&(!match||!Number.isSafeInteger(Number(match[1])))))return json({error:'목록 요청을 확인해 주세요.'},400);
        const query=match?db.prepare('SELECT * FROM classrooms WHERE deleted_at IS NULL AND (created_at<?1 OR (created_at=?1 AND code<?2)) ORDER BY created_at DESC,code DESC LIMIT ?3').bind(Number(match[1]),match[2],limit+1):db.prepare('SELECT * FROM classrooms WHERE deleted_at IS NULL ORDER BY created_at DESC,code DESC LIMIT ?1').bind(limit+1);
        const {results}=await query.all(),page=results.slice(0,limit),last=page.at(-1);
        return json({rooms:page.map(room=>roomState(room,slides,true)),authenticated:true,nextCursor:results.length>limit?last.created_at+':'+last.code:null});
      }
      const {results}=await db.prepare('SELECT * FROM classrooms WHERE deleted_at IS NULL ORDER BY created_at DESC,code DESC').all();
      return json({rooms:results.map(room=>roomState(room,slides,true)),authenticated:true});
    }
    if(route==='/api/classroom'&&request.method==='POST'){
      if(!instructor)return json({error:'선생님 비밀번호를 확인한 뒤 입장해 주세요.'},401);
      const input=await body(request),name=typeof input.name==='string'?input.name.trim().slice(0,60):'';
      if(!name)return json({error:'수업 이름을 적어 주세요.'},400);
      const boardVisibility=input.boardVisibility===undefined?'class':input.boardVisibility;
      if(!['class','public'].includes(boardVisibility))return json({error:'게시판 공개 범위를 골라 주세요.'},400);
      for(let attempt=0;attempt<5;attempt++){
        const code=generateClassroomCode();
        const result=await db.prepare('INSERT OR IGNORE INTO classrooms (code,name,created_at,open_mask,revision,board_visibility) SELECT ?1,?2,(SELECT MAX(?3,COALESCE(MAX(created_at),0)+1) FROM classrooms),1,1,?4 WHERE (SELECT COUNT(*) FROM classrooms WHERE deleted_at IS NULL)<1000').bind(code,name,now,boardVisibility).run();
        if(result.meta.changes){const room=await db.prepare('SELECT * FROM classrooms WHERE code=?1').bind(code).first();return json(roomState(room,slides,true),201)}
        const collision=await db.prepare('SELECT code FROM classrooms WHERE code=?1').bind(code).first();
        if(!collision)return json({error:'만들 수 있는 수업 수를 초과했어요.'},429);
      }
      return json({error:'참여 코드를 만들지 못했어요. 다시 시도해 주세요.'},503);
    }
    const match=/^\/api\/classroom\/([0-9]{6})$/.exec(route);
    if(!match)return json({error:'수업 참여 코드를 확인해 주세요.'},404);
    const code=match[1],room=await db.prepare('SELECT * FROM classrooms WHERE code=?1 AND deleted_at IS NULL').bind(code).first();
    if(!room)return json({error:'수업을 찾지 못했어요. 참여 코드를 확인해 주세요.'},404);
    if(request.method==='GET')return json(roomState(room,slides,instructor));
    if(!['PATCH','DELETE'].includes(request.method))return json({error:'지원하지 않는 요청이에요.'},405);
    if(!instructor)return json({error:'선생님으로 입장한 뒤 변경해 주세요.'},403);
    if(request.method==='DELETE'){
      await db.prepare('UPDATE classrooms SET deleted_at=?1,revision=revision+1 WHERE code=?2 AND deleted_at IS NULL').bind(now,code).run();
      await notifyClassroom(env,{code,deleted:true});
      return json({deleted:true,code});
    }
    const input=await body(request);let expression,value;
    if(Object.hasOwn(input,'lockAll')){
      if(input.lockAll!==true)return json({error:'전체 잠금 요청을 확인해 주세요.'},400);expression='?1';value=0;
    }else if(Object.hasOwn(input,'page')){
      if(!Number.isInteger(input.page)||input.page<1||input.page>slides.length||typeof input.open!=='boolean')return json({error:'올바른 페이지와 열림 상태를 골라 주세요.'},400);
      expression=input.open?'open_mask | ?1':'open_mask & ?1';value=input.open?(1<<(input.page-1)):~(1<<(input.page-1));
    }else{
      if(!Number.isInteger(input.maxPage)||input.maxPage<1||input.maxPage>slides.length)return json({error:'올바른 페이지를 골라 주세요.'},400);expression='?1';value=(1<<input.maxPage)-1;
    }
    await db.prepare('UPDATE classrooms SET open_mask='+expression+',revision=revision+1 WHERE code=?2 AND deleted_at IS NULL').bind(value,code).run();
    const updated=await db.prepare('SELECT * FROM classrooms WHERE code=?1 AND deleted_at IS NULL').bind(code).first();
    if(!updated)return json({error:'수업을 찾지 못했어요.'},404);
    const snapshot=roomState(updated,slides,true);await notifyClassroom(env,snapshot);return json(snapshot);
  }catch(error){console.error(JSON.stringify({event:'classroom-api-error',type:error.name||'Error'}));return json({error:error.status?error.message:'수업 정보를 저장하지 못했어요. 다시 시도해 주세요.'},error.status||500)}
}
