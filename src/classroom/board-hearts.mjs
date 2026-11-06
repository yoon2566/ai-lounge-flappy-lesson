const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff', ...headers}
});
const ID = /^[a-f0-9]{32}$/, CLIENT = /^[a-f0-9]{64}$/;
const MAX_IDS = 20, MAX_BYTES = 4096;
const reject = (status, message) => { throw Object.assign(new Error(message), {status}); };
const missing = () => reject(404, '이 게시판에서 작품을 찾을 수 없어요.');
const slots = (count, start = 1) => Array.from({length:count}, (_, i) => '?' + (i + start)).join(',');

async function readJson(request) {
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') reject(415, 'JSON 형식으로 요청해 주세요.');
  if (Number(request.headers.get('Content-Length')) > MAX_BYTES) reject(413, '하트 요청이 너무 커요.');
  const reader = request.body?.getReader();
  if (!reader) reject(400, '요청 내용을 확인해 주세요.');
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let text = '', bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); reject(413, '하트 요청이 너무 커요.'); }
      text += decoder.decode(chunk.value, {stream:true});
    }
    const input = JSON.parse(text + decoder.decode());
    if (!input || typeof input !== 'object' || Array.isArray(input)) reject(400, '요청 내용을 확인해 주세요.');
    return input;
  } catch (error) {
    if (error.status) throw error;
    reject(400, '요청 내용을 확인해 주세요.');
  } finally { reader.releaseLock(); }
}

async function context(url, env) {
  const rooms = url.searchParams.getAll('room'), scopes = url.searchParams.getAll('scope');
  if (rooms.length > 1 || scopes.length > 1 || scopes.length && !['all','room'].includes(scopes[0])) reject(400, '게시판 범위를 확인해 주세요.');
  if (!rooms.length) {
    if (scopes[0] === 'room') reject(400, '우리 반 수업 코드를 확인해 주세요.');
    return {db:env.ARTWORK_DB, shared:true, room:null, roomOnly:false};
  }
  if (!/^[0-9]{6}$/.test(rooms[0])) reject(400, '숫자 6자리 수업 코드를 확인해 주세요.');
  const room = await env.CLASSROOM_DB.prepare('SELECT code,board_visibility FROM classrooms WHERE code=?1 AND deleted_at IS NULL').bind(rooms[0]).first();
  if (!room) reject(404, '수업을 찾을 수 없어요.');
  const shared = room.board_visibility !== 'class';
  return {db:shared ? env.ARTWORK_DB : env.CLASSROOM_DB, shared, room:room.code, roomOnly:!shared || scopes[0] === 'room'};
}

async function visiblePublicIds(ctx, env, ids) {
  const placeholders = slots(ids.length);
  // A public copy may briefly outlive a canonical tombstone when the shared
  // database was unavailable during moderation. Check each source once per page.
  const databases = [env.CLASSROOM_DB, env.OTHER_CLASSROOM_DB].filter(Boolean);
  const snapshots = await Promise.all(databases.map(db => db.prepare(
    'SELECT w.id,w.room_code,CASE WHEN w.deleted_at IS NULL AND c.code IS NOT NULL AND c.deleted_at IS NULL AND COALESCE(c.board_visibility,\'public\')=\'public\' THEN 1 ELSE 0 END AS live ' +
    'FROM classroom_works w LEFT JOIN classrooms c ON c.code=w.room_code WHERE w.id IN ('+placeholders+')'
  ).bind(...ids).all()));
  const canonical = new Map(), denied = new Set(), ownRoom = new Set();
  snapshots.forEach(({results}, index) => {
    for (const row of results) {
      if (!row.live) denied.add(row.id);
      else { canonical.set(row.id, true); if (index === 0 && row.room_code === ctx.room) ownRoom.add(row.id); }
    }
  });
  const {results} = await ctx.db.prepare(
    'SELECT w.id,s.id AS synced FROM works w LEFT JOIN classroom_work_sync s ON s.id=w.id WHERE w.id IN ('+placeholders+') AND COALESCE(s.deleted,0)=0'
  ).bind(...ids).all();
  return new Set(results.filter(row => !denied.has(row.id) && (!row.synced || canonical.has(row.id)) && (!ctx.roomOnly || ownRoom.has(row.id))).map(row => row.id));
}

async function visibleIds(ctx, env, ids) {
  if (!ids.length) return [];
  if (ctx.shared) {
    const allowed = await visiblePublicIds(ctx, env, ids);
    return ids.filter(id => allowed.has(id));
  }
  const {results} = await ctx.db.prepare(
    'SELECT w.id FROM classroom_works w JOIN classrooms c ON c.code=w.room_code WHERE w.room_code=?1 AND c.deleted_at IS NULL AND c.board_visibility=\'class\' AND w.deleted_at IS NULL AND w.id IN ('+slots(ids.length,2)+')'
  ).bind(ctx.room,...ids).all();
  const allowed = new Set(results.map(row => row.id));
  return ids.filter(id => allowed.has(id));
}

async function identity(workId, token) {
  if (!token) return null;
  // Scope the digest to this work. A stored reaction cannot identify another
  // work's voter merely by comparing their hashes.
  const bytes = new TextEncoder().encode('dino-board-heart-v1\n'+workId+'\n'+token);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function reactions(ctx, ids, clientId) {
  if (!ids.length) return [];
  const hashes = await Promise.all(ids.map(id => identity(id,clientId)));
  const values = ids.map((_,i) => '(?'+(i*2+1)+',?'+(i*2+2)+')').join(',');
  const params = ids.flatMap((id,i) => [id,hashes[i]]);
  const {results} = await ctx.db.prepare(
    'WITH requested(id,mine) AS (VALUES '+values+') SELECT r.id,COUNT(h.client_hash) AS count,COALESCE(MAX(h.client_hash=r.mine),0) AS liked '+
    'FROM requested r LEFT JOIN board_work_hearts h ON h.work_id=r.id GROUP BY r.id'
  ).bind(...params).all();
  const byId = new Map(results.map(row => [row.id,{id:row.id,count:Number(row.count),liked:Boolean(row.liked)}]));
  return ids.map(id => byId.get(id));
}

async function setReaction(ctx, env, id, clientId, liked) {
  if (!(await visibleIds(ctx,env,[id])).length) missing();
  const hash = await identity(id,clientId);
  // Repeat the work's local visibility predicate in the atomic write itself.
  const stillVisible = ctx.shared
    ? 'EXISTS (SELECT 1 FROM works w LEFT JOIN classroom_work_sync s ON s.id=w.id WHERE w.id=?1 AND COALESCE(s.deleted,0)=0)'
    : 'EXISTS (SELECT 1 FROM classroom_works w JOIN classrooms c ON c.code=w.room_code WHERE w.id=?1 AND c.code=?3 AND c.deleted_at IS NULL AND c.board_visibility=\'class\' AND w.deleted_at IS NULL)';
  const params = ctx.shared ? [id,hash] : [id,hash,ctx.room];
  if (liked) {
    await ctx.db.prepare('INSERT INTO board_work_hearts(work_id,client_hash) SELECT ?1,?2 WHERE '+stillVisible+' ON CONFLICT(work_id,client_hash) DO NOTHING').bind(...params).run();
  } else {
    await ctx.db.prepare('DELETE FROM board_work_hearts WHERE work_id=?1 AND client_hash=?2 AND '+stillVisible).bind(...params).run();
  }
  if (!(await visibleIds(ctx,env,[id])).length) missing();
  return (await reactions(ctx,[id],clientId))[0];
}

export function isHeartPath(path) {
  return path==='/api/board/hearts' || /^\/api\/board\/[^/]+\/heart$/.test(path);
}

export async function handleBoardHearts(request, env) {
  try {
    const url = new URL(request.url), batch = url.pathname === '/api/board/hearts';
    const match = /^\/api\/board\/([a-f0-9]{32})\/heart$/.exec(url.pathname);
    if (!batch && !match) missing();
    if (request.method !== 'POST') return json({error:'지원하지 않는 요청이에요.'},405,{Allow:'POST'});
    if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') reject(403, '수업 사이트에서 하트를 눌러 주세요.');
    const input = await readJson(request);
    const expected = batch ? ['ids','clientId'] : ['liked','clientId'];
    if (Object.keys(input).some(key => !expected.includes(key))) reject(400, '하트 요청을 확인해 주세요.');
    if ((!batch || Object.hasOwn(input,'clientId')) && (typeof input.clientId !== 'string' || !CLIENT.test(input.clientId))) reject(400, '브라우저의 하트 정보를 확인해 주세요.');
    if (batch && (!Array.isArray(input.ids) || input.ids.length > MAX_IDS || input.ids.some(id => typeof id !== 'string' || !ID.test(id)))) reject(400, '작품 목록을 확인해 주세요.');
    if (!batch && typeof input.liked !== 'boolean') reject(400, '하트 상태를 확인해 주세요.');
    const ctx = await context(url,env);
    if (batch) {
      const visible = await visibleIds(ctx,env,[...new Set(input.ids)]);
      return json({items:await reactions(ctx,visible,input.clientId)});
    }
    return json(await setReaction(ctx,env,match[1],input.clientId,input.liked));
  } catch (error) {
    return error.status ? json({error:error.message},error.status) : json({error:'하트를 확인하지 못했어요. 잠시 후 다시 해 주세요.'},503);
  }
}
