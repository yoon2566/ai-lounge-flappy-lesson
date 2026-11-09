// Exercise the actual packaged Worker using local workerd/R2/D1 and the existing classroom suite.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {root,encoder} from './png8-helpers.mjs';
import {makeCloudPasswordHash} from '../src/classroom/classroom-cloud.mjs';
const require=createRequire(import.meta.url),{Miniflare,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE_PATH||path.join(process.env.APPDATA,'npm/node_modules/wrangler/node_modules/miniflare'));
const release=path.resolve(root,process.env.PNG8_RELEASE||'output/png8-release-20261109'),cfg=JSON.parse(fs.readFileSync(path.join(release,'wrangler.json'),'utf8'));
const mf=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,workers:[{name:cfg.name,modules:true,scriptPath:path.join(release,'modules/worker.js'),compatibilityDate:cfg.compatibility_date,
 assets:{directory:path.join(release,'assets'),binding:'ASSETS',routerConfig:{has_user_worker:true},run_worker_first:cfg.assets.run_worker_first,assetConfig:{html_handling:'none',not_found_handling:'none'}},
 d1Databases:{CLASSROOM_DB:'png8-classroom-test',ARTWORK_DB:'png8-artwork-test',FLAPPY_RANKINGS:'png8-rankings-test'},
 r2Buckets:{LESSON_IMAGE_BUCKET:'png8-images-test'},kvNamespaces:{LESSON_IMAGES:'png8-legacy-test'},
 durableObjects:{CLASSROOM_EVENTS:{className:'ClassroomEvents',useSQLite:true}},
 bindings:{TEACHER_PASSWORD_HASH:await makeCloudPasswordHash('local-classroom-test-only')},outboundService:()=>new Response('External requests disabled',{status:403})}]}));
try{
 const origin=(await mf.ready).origin;
 const classroom=await mf.getD1Database('CLASSROOM_DB'),artwork=await mf.getD1Database('ARTWORK_DB');
 for(const [db,names]of[[classroom,['src/classroom/classroom-schema.sql']],[artwork,['src/board-schema.sql','src/classroom/classroom-board-public-sync-schema.sql']]])for(const name of names){const sql=fs.readFileSync(path.join(root,name),'utf8').replace(/^--.*$/gm,'');for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();}
 await artwork.prepare('CREATE TABLE IF NOT EXISTS board_work_hearts(work_id TEXT NOT NULL,client_hash TEXT NOT NULL,PRIMARY KEY(work_id,client_hash)) WITHOUT ROWID').run();
 const png=encoder().encode(new Uint8Array([255,0,0,255,0,0,0,0]),2,1);
 for(const [bytes,type,ext]of[[png,'image/png','png'],[fs.readFileSync(path.join(root,'assets/background.webp')),'image/webp','webp']]){
  const res=await fetch(origin+'/api/assets',{method:'POST',headers:{Origin:origin,'Content-Type':type},body:bytes});assert.equal(res.status,200,res.ok?'':await res.clone().text());const out=await res.json();assert.equal(out.type,type);assert(out.url.endsWith('.'+ext));
  const stored=await (await mf.getR2Bucket('LESSON_IMAGE_BUCKET')).get(out.url.split('/').pop());assert.equal(stored.httpMetadata.contentType,type);
  for(const method of ['GET','HEAD']){const read=await fetch(out.url,{method});assert.equal(read.status,200);assert.equal(read.headers.get('Content-Type'),type);assert.deepEqual(Buffer.from(await read.arrayBuffer()),method==='HEAD'?Buffer.alloc(0):Buffer.from(bytes));}
 }
 const lesson=await(await fetch(origin+'/lesson')).text(),script=lesson.match(/<script src="([^"]+)"/)[1];assert.equal((await fetch(origin+script)).status,200);const data=JSON.parse(lesson.match(/<script id="deck-data"[^>]*>([\s\S]*?)<\/script>/)[1]);assert.equal((await fetch(origin+data.png8EncoderURL)).status,200);
 console.log('PASS packaged workerd: PNG/WebP upload, R2 metadata, GET/HEAD and lazy static asset');
 // Keep the existing test logic, redirect only its evidence files and block external browser requests.
 const target=path.join(root,'.build/png8-check/classroom-flow-isolated.cjs');
 let test=fs.readFileSync(path.join(root,'tests/classroom-flow.test.cjs'),'utf8').replaceAll("'evidence/","'.build/png8-check/work/evidence/");
 test=test.replace("errors=[];t.on", "errors=[];await tc.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());await sc.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());t.on");
 fs.writeFileSync(target,test);
 const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[target],{cwd:root,env:{...process.env,TEST_ORIGIN:origin},stdio:'inherit'});child.on('error',reject);child.on('exit',resolve);});assert.equal(exit,0,'existing classroom flow');
 fs.mkdirSync(path.join(root,'evidence/png8'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/png8/workerd-results.json'),JSON.stringify({packagedWorker:true,pngAndWebpUpload:true,metadataAndGETAndHEAD:true,staticAssets:true,classroomSuite:true,productionWrites:0},null,2));
}finally{await mf.dispose();}
