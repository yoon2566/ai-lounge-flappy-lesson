// Local-only packaging. Preserve all prior releases and unrelated working files.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const baseline=path.join(root,'output/qr-release-20261110'),output=path.join(root,'output/visibility-release-20261110'),work=path.join(root,'.build/visibility-check/build-work');
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)).map(n=>e.name+'/'+n):[e.name]);
const hashes=d=>Object.fromEntries(files(d).map(n=>[n,hash(fs.readFileSync(path.join(d,n)))]));
const before=hashes(baseline),manifest=JSON.parse(fs.readFileSync(path.join(baseline,'manifest.json'),'utf8'));
for(const [name,expected]of Object.entries(manifest.hashes))assert.equal(before[name],expected,'Baseline changed: '+name);
const oldMap=JSON.parse(fs.readFileSync(path.join(baseline,'modules/worker.js.map'),'utf8'));
for(let i=0;i<oldMap.sources.length;i++){
 const name=oldMap.sources[i].replaceAll('\\','/').replace(/^.*?(?=src\/)/,'');
 if(name==='src/classroom/classroom-cloud.mjs')continue;
 assert.equal(fs.readFileSync(path.join(root,name),'utf8'),oldMap.sourcesContent[i],'Unrelated server source: '+name);
}
fs.mkdirSync(work,{recursive:true});
for(const name of ['src','assets','build-lesson.mjs','vendor'])fs.cpSync(path.join(root,name),path.join(work,name),{recursive:true,filter:p=>path.basename(p)!=='.git'});
fs.cpSync(path.join(baseline,'assets'),path.join(work,'dist'),{recursive:true});
execFileSync(process.execPath,[path.join(work,'build-lesson.mjs')],{cwd:root,stdio:'inherit'});
const hosted=fs.readFileSync(path.join(work,'dist/lesson.html'),'utf8');
const css=hosted.match(/<link rel="stylesheet" href="\/([^"]+)"/)[1],js=hosted.match(/<script src="\/([^"]+)"/)[1];
const changed=['assets/lesson.html','assets/course-download.html','modules/worker.js','modules/worker.js.map'];
const added=[css,js].map(n=>'assets/'+n);
for(const name of files(path.join(work,'dist'))){
 if(['lesson.html','course-download.html',css,js].includes(name)||/^static\/lesson\.[a-f0-9]{12}\.(css|js)$/.test(name))continue;
 assert.equal(hash(fs.readFileSync(path.join(work,'dist',name))),before['assets/'+name],'Unexpected generated change: '+name);
}
// Remove only this preparation's obsolete generated lesson bundles on rebuild.
const previousManifest=path.join(output,'manifest.json');
if(fs.existsSync(previousManifest)){
 const previous=JSON.parse(fs.readFileSync(previousManifest,'utf8'));
 for(const [name,expected]of Object.entries(previous.hashes)){
  if(!/^assets\/static\/lesson\.[a-f0-9]{12}\.(css|js)$/.test(name)||Object.hasOwn(before,name)||added.includes(name))continue;
  const target=path.resolve(output,name);assert(target.startsWith(path.resolve(output)+path.sep));
  assert.equal(hash(fs.readFileSync(target)),expected,'Edited generated bundle: '+name);fs.unlinkSync(target);
 }
}
fs.cpSync(baseline,output,{recursive:true});
for(const name of [...changed.filter(n=>n.startsWith('assets/')),...added]){
 const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(work,'dist',name.slice(7)),target);
}
const require=createRequire(import.meta.url),esbuild=require(process.env.ESBUILD_MODULE_PATH||path.join(process.env.APPDATA,'npm/node_modules/wrangler/node_modules/esbuild'));
await esbuild.build({entryPoints:[path.join(root,'src/worker.mjs')],outfile:path.join(output,'modules/worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers'],sourcemap:true,logLevel:'warning'});
assert.deepEqual(hashes(baseline),before,'Existing QR release changed');
const after=hashes(output);
for(const [name,expected]of Object.entries(before))if(name!=='manifest.json'&&!changed.includes(name))assert.equal(after[name],expected,'Preserved release file: '+name);
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),baseline,baselineVersion:'02d77649 (user supplied)',output,changed,added,serverChanged:true,serverSourcesChanged:['src/classroom/classroom-cloud.mjs'],bindingsChanged:false,deployExecuted:false,hashes:Object.fromEntries(Object.entries(after).filter(([n])=>n!=='manifest.json'))},null,2));
console.log(JSON.stringify({output,changed,added,deployExecuted:false}));
