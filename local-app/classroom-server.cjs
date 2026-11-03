const {randomBytes,timingSafeEqual,scryptSync}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
function makePasswordHash(password){const salt=randomBytes(16).toString('hex');return {salt,hash:scryptSync(password,salt,32).toString('hex')}}
function createClassroomService({slides,now=Date.now,ttl=0,storeFile=null,passwordHash=null}){
  const rooms=new Map(),sessions=new Map(),attempts=new Map();let lastCreated=0;
  if(storeFile&&fs.existsSync(storeFile)){
    const stored=JSON.parse(fs.readFileSync(storeFile,'utf8'));
    for(const room of stored.rooms||[]){
      if(!/^[A-F0-9]{6}$/.test(room.code)||typeof room.name!=='string')continue;
      room.openPages=(room.openPages||[1]).filter(n=>Number.isInteger(n)&&n>=1&&n<=slides.length);rooms.set(room.code,room);lastCreated=Math.max(lastCreated,room.createdAt||0);
    }
  }
  function persist(){if(!storeFile)return;fs.mkdirSync(path.dirname(storeFile),{recursive:true});const temp=storeFile+'.tmp';fs.writeFileSync(temp,JSON.stringify({version:2,rooms:[...rooms.values()]},null,2));fs.renameSync(temp,storeFile)}
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
  const state=(room,canManage=false)=>({code:room.code,name:room.name,createdAt:room.createdAt,maxPage:Math.max(0,...room.openPages),openPages:[...room.openPages].sort((a,b)=>a-b),totalPages:slides.length,revision:room.revision,expiresAt:room.expiresAt,canManage});
  function signedIn(req){
    const token=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('flappy_teacher='))?.slice('flappy_teacher='.length);
    const until=sessions.get(token);if(until&&until>now())return true;if(token)sessions.delete(token);return false;
  }
  function allowed(req,room){
    if(signedIn(req))return true;
    const token=String(req.headers.authorization||'').replace(/^Bearer /,'');
    return /^[a-f0-9]{48}$/.test(token)&&typeof room?.token==='string'&&timingSafeEqual(Buffer.from(token),Buffer.from(room.token));
  }
  function login(req,res,password){
    const address=req.socket?.remoteAddress||'local',prior=attempts.get(address);
    if(prior&&prior.until>now()&&prior.count>=10)return {status:429,error:'비밀번호 입력을 여러 번 시도했어요. 잠시 후 다시 시도해 주세요.'};
    if(!passwordHash)return {status:503,error:'강사 비밀번호 설정을 확인해 주세요.'};
    const valid=typeof password==='string'&&password.length<=128&&timingSafeEqual(scryptSync(password,passwordHash.salt,32),Buffer.from(passwordHash.hash,'hex'));
    if(!valid){attempts.set(address,{until:prior&&prior.until>now()?prior.until:now()+15*60000,count:prior&&prior.until>now()?prior.count+1:1});return {status:401,error:'강사 비밀번호가 맞지 않아요.'}}
    attempts.delete(address);const token=randomBytes(32).toString('hex');sessions.set(token,now()+8*60*60*1000);
    res.setHeader('Set-Cookie','flappy_teacher='+token+'; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800');return null;
  }
  async function body(req){
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw Object.assign(Error('요청이 너무 커요.'),{status:413})}
    try{return JSON.parse(text||'{}')}catch{throw Object.assign(Error('요청 형식을 확인해 주세요.'),{status:400})}
  }
  return {setPasswordHash(value){passwordHash=value},canAccess(req,code,page){const room=rooms.get(code);return !!(room && room.deletedAt==null && (signedIn(req)||room.openPages.includes(page)))},async handle(req,res,url){
    if(!url.pathname.startsWith('/api/classroom'))return false;
    try{
      if(req.method!=='GET'&&req.headers.origin&&req.headers.origin!==url.origin){send(res,403,{error:'같은 수업 화면에서 요청해 주세요.'});return true}
      for(const [code,room] of rooms)if(room.expiresAt&&room.expiresAt<=now())rooms.delete(code);
      const instructor=signedIn(req);
      if(url.pathname==='/api/classroom/config'&&req.method==='GET'){send(res,200,{slides,authenticated:instructor});return true}
      if(url.pathname==='/api/classroom/login'&&req.method==='POST'){
        const data=await body(req),failure=login(req,res,data.password);send(res,failure?.status||200,failure?{error:failure.error}:{authenticated:true});return true;
      }
      if(url.pathname==='/api/classroom'&&req.method==='GET'){
        if(!instructor){send(res,401,{error:'선생님 비밀번호를 확인한 뒤 입장해 주세요.'});return true}
        let list=[...rooms.values()].filter(room=>room.deletedAt==null).sort((a,b)=>b.createdAt-a.createdAt||b.code.localeCompare(a.code));
        if(url.searchParams.has('limit')){
          const limit=Number(url.searchParams.get('limit')),cursor=url.searchParams.get('cursor'),match=cursor?/^(\d{1,16}):([A-F0-9]{6})$/.exec(cursor):null;
          if(!Number.isInteger(limit)||limit<1||limit>50||(cursor&&(!match||!Number.isSafeInteger(Number(match[1]))))){send(res,400,{error:'목록 요청을 확인해 주세요.'});return true}
          if(match)list=list.filter(room=>room.createdAt<Number(match[1])||(room.createdAt===Number(match[1])&&room.code<match[2]));
          const page=list.slice(0,limit),last=page.at(-1);
          send(res,200,{rooms:page.map(room=>state(room,true)),authenticated:true,nextCursor:list.length>limit?last.createdAt+':'+last.code:null});return true;
        }
        send(res,200,{rooms:list.map(room=>state(room,true)),authenticated:true});return true;
      }
      if(url.pathname==='/api/classroom'&&req.method==='POST'){
        const data=await body(req);
        if(!instructor){const failure=login(req,res,data.password);if(failure){send(res,failure.status,{error:failure.error});return true}}
        if([...rooms.values()].filter(room=>room.deletedAt==null).length>=1000){send(res,429,{error:'만들 수 있는 수업 수를 초과했어요.'});return true}
        const name=typeof data.name==='string'?data.name.trim().slice(0,60):'';
        if(!name){send(res,400,{error:'수업 이름을 적어 주세요.'});return true}
        let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(code));
        const room={code,name,createdAt:Math.max(now(),lastCreated+1),token:randomBytes(24).toString('hex'),openPages:[1],revision:1,expiresAt:ttl?now()+ttl:null};lastCreated=room.createdAt;
        rooms.set(code,room);try{persist()}catch(error){rooms.delete(code);throw error}
        send(res,201,{...state(room,true),teacherToken:room.token});return true;
      }
      const match=url.pathname.match(/^\/api\/classroom\/([A-F0-9]{6})$/);
      if(!match){send(res,404,{error:'수업 참여 코드를 확인해 주세요.'});return true}
      const room=rooms.get(match[1]);if(!room||room.deletedAt!=null){send(res,404,{error:'수업을 찾지 못했어요. 참여 코드를 확인해 주세요.'});return true}
      if(req.method==='GET'){send(res,200,state(room,instructor));return true}
      if(req.method==='DELETE'){
        if(!allowed(req,room)){send(res,403,{error:'선생님으로 입장한 뒤 삭제해 주세요.'});return true}
        room.deletedAt=now();room.revision++;
        try{persist()}catch(error){delete room.deletedAt;room.revision--;throw error}
        send(res,200,{deleted:true,code:room.code});return true;
      }
      if(req.method!=='PATCH'){send(res,405,{error:'지원하지 않는 요청이에요.'});return true}
      if(!allowed(req,room)){send(res,403,{error:'선생님으로 입장한 뒤 페이지를 열어 주세요.'});return true}
      const data=await body(req);let openPages;
      if(Object.hasOwn(data,'lockAll')){
        if(data.lockAll!==true){send(res,400,{error:'전체 잠금 요청을 확인해 주세요.'});return true}
        openPages=[];
      }else if(Object.hasOwn(data,'page')){
        if(!Number.isInteger(data.page)||data.page<1||data.page>slides.length||typeof data.open!=='boolean'){send(res,400,{error:'올바른 페이지와 열림 상태를 골라 주세요.'});return true}
        const pages=new Set(room.openPages);if(data.open)pages.add(data.page);else pages.delete(data.page);openPages=[...pages].sort((a,b)=>a-b);
      }else{
        if(!Number.isInteger(data.maxPage)||data.maxPage<1||data.maxPage>slides.length){send(res,400,{error:'올바른 페이지를 골라 주세요.'});return true}
        openPages=Array.from({length:data.maxPage},(_,i)=>i+1);
      }
      const old={...room};room.openPages=openPages;room.revision++;if(ttl)room.expiresAt=now()+ttl;
      try{persist()}catch(error){Object.assign(room,old);throw error}
      send(res,200,state(room,true));return true;
    }catch(error){send(res,error.status||500,{error:error.status?error.message:'수업 정보를 저장하지 못했어요. 다시 시도해 주세요.'});return true}
  }};
}
module.exports={createClassroomService,makePasswordHash};
