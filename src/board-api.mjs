const PAGE_SIZE=20,MAX_HTML_BYTES=1500000,MAX_BODY_BYTES=3200000;
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});
const metadata='id, author, title, lesson, bytes, created_at';
async function readBody(request){
  if(Number(request.headers.get('Content-Length'))>MAX_BODY_BYTES)throw 413;
  const reader=request.body?.getReader();if(!reader)throw 400;
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY_BYTES){await reader.cancel();throw 413}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw 400}
}
export async function handleBoard(request,env){
  if(!env.ARTWORK_DB)return json({error:'게시판 연결을 준비하고 있어요. 잠시 후 다시 열어 주세요.'},503);
  const url=new URL(request.url),path=url.pathname;
  try{
    if(path==='/api/board'&&request.method==='GET'){
      const cursor=url.searchParams.get('cursor');let statement;
      if(cursor){
        const match=/^(\d{13})\.([a-f0-9]{32})$/.exec(cursor);
        if(!match)return json({error:'페이지 주소를 확인해 주세요.'},400);
        statement=env.ARTWORK_DB.prepare(`SELECT ${metadata} FROM works WHERE (created_at, id) < (?1, ?2) ORDER BY created_at DESC, id DESC LIMIT ?3`).bind(Number(match[1]),match[2],PAGE_SIZE+1);
      }else statement=env.ARTWORK_DB.prepare(`SELECT ${metadata} FROM works ORDER BY created_at DESC, id DESC LIMIT ?1`).bind(PAGE_SIZE+1);
      const {results}=await statement.all(),hasMore=results.length>PAGE_SIZE,items=results.slice(0,PAGE_SIZE),last=items.at(-1);
      return json({items,nextCursor:hasMore?`${last.created_at}.${last.id}`:null});
    }
    if(path==='/api/board'&&request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return json({error:'수업 사이트에서 공유해 주세요.'},403);
      if(!(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))return json({error:'공유 형식을 확인해 주세요.'},415);
      const input=await readBody(request);
      if(typeof input?.author!=='string'||!input.author.trim()||input.author.trim().length>40)return json({error:'이름 또는 닉네임을 40자 이내로 적어 주세요.'},400);
      if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>80)return json({error:'작품 제목을 80자 이내로 적어 주세요.'},400);
      if(typeof input.html!=='string'||!/<html(?:\s|>)/i.test(input.html)||!/<\/html\s*>/i.test(input.html))return json({error:'완성된 HTML 게임을 먼저 만들어 주세요.'},400);
      const size=new TextEncoder().encode(input.html).byteLength;
      if(size>MAX_HTML_BYTES)return json({error:'게임 파일이 너무 커요. 1.5MB 이하의 HTML을 공유해 주세요.'},413);
      const author=input.author.trim(),title=input.title.trim(),lesson='플래피 이미지 게임';
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([lesson,author,title,input.html])));
      const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);
      const existing=await env.ARTWORK_DB.prepare(`SELECT ${metadata} FROM works WHERE id=?1`).bind(id).first();
      if(existing)return json({item:existing,duplicate:true},200);
      const now=Date.now();
      const result=await env.ARTWORK_DB.prepare('INSERT OR IGNORE INTO works (id,author,title,lesson,html,bytes,created_at) SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE (SELECT COUNT(*) FROM works WHERE created_at>?8)<1000').bind(id,author,title,lesson,input.html,size,now,now-60000).run();
      if(result.meta.changes===0){
        const duplicate=await env.ARTWORK_DB.prepare(`SELECT ${metadata} FROM works WHERE id=?1`).bind(id).first();
        if(duplicate)return json({item:duplicate,duplicate:true});
        return json({error:'공유 요청이 많아요. 1분 뒤 다시 눌러 주세요.'},429,{'Retry-After':'60'});
      }
      return json({item:{id,author,title,lesson,bytes:size,created_at:now}},201);
    }
    const match=/^\/api\/board\/([a-f0-9]{32})(\/download)?$/.exec(path);
    if(match&&request.method==='GET'){
      const work=await env.ARTWORK_DB.prepare(`SELECT ${metadata}, html FROM works WHERE id=?1`).bind(match[1]).first();
      if(!work)return json({error:'작품을 찾을 수 없어요.'},404);
      if(match[2]){
        const filename=(work.title.replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').trim()||'공유한_게임')+'.html';
        return new Response(work.html.startsWith('\ufeff')?work.html:'\ufeff'+work.html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="game.html"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Content-Security-Policy':"sandbox; default-src 'none'"}});
      }
      return json({item:work});
    }
    if(path==='/api/board'||match)return json({error:'지원하지 않는 요청이에요.'},405,{'Allow':path==='/api/board'?'GET, POST':'GET'});
    return json({error:'작품 주소를 확인해 주세요.'},404);
  }catch(error){
    if(error===413)return json({error:'게임 파일이 너무 커요. 1.5MB 이하의 HTML을 공유해 주세요.'},413);
    if(error===400)return json({error:'공유할 내용을 확인해 주세요.'},400);
    return json({error:'게시판에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'},503);
  }
}
