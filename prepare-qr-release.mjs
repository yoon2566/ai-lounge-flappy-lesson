// Local packaging only. Keep the PNG-8, button wrapping and centered game dialog.
// Reuse the final release's server modules and bindings without deploying anything.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const baseline=path.join(root,'output/final-release-20261109');
const output=path.join(root,'output/qr-release-20261110');
const work=path.join(root,'.build/qr-check/build-work');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(dir,entry.name)).map(name=>entry.name+'/'+name):[entry.name]);
const hashes=dir=>Object.fromEntries(files(dir).map(name=>[name,hash(fs.readFileSync(path.join(dir,name)))]));
const before=hashes(baseline),manifest=JSON.parse(fs.readFileSync(path.join(baseline,'manifest.json'),'utf8'));
for(const [name,expected]of Object.entries(manifest.hashes))assert.equal(before[name],expected,'Baseline changed: '+name);
fs.mkdirSync(work,{recursive:true});
for(const name of ['src','assets','tests','build-lesson.mjs'])fs.cpSync(path.join(root,name),path.join(work,name),{recursive:true});
const vendor=['pako_deflate.min.js','pako.LICENSE','png8.js','README.md','qrcode-generator-2.0.4.js','qrcode-generator.LICENSE','qrcode-generator.README.md'];
fs.mkdirSync(path.join(work,'vendor'),{recursive:true});
for(const name of vendor)fs.copyFileSync(path.join(root,'vendor',name),path.join(work,'vendor',name));
fs.cpSync(path.join(baseline,'assets'),path.join(work,'dist'),{recursive:true});
execFileSync(process.execPath,[path.join(work,'build-lesson.mjs')],{cwd:root,stdio:'inherit'});
const hosted=fs.readFileSync(path.join(work,'dist/lesson.html'),'utf8');
const css=hosted.match(/<link rel="stylesheet" href="\/([^"]+)"/)[1];
const js=hosted.match(/<script src="\/([^"]+)"/)[1];
const changed=['assets/lesson.html','assets/course-download.html'];
const added=[css,js,...vendor.filter(name=>name.startsWith('qrcode-')).map(name=>'vendor/'+name)].map(name=>'assets/'+name);
const permitted=new Set([...changed,...added].map(name=>name.slice(7)));
for(const name of files(path.join(work,'dist'))){
  if(permitted.has(name)||/^static\/lesson\.[a-f0-9]{12}\.(css|js)$/.test(name))continue;
  assert.equal(hash(fs.readFileSync(path.join(work,'dist',name))),before['assets/'+name],'Unexpected generated change: '+name);
}
fs.cpSync(baseline,output,{recursive:true});
for(const name of [...changed,...added]){
  const destination=path.join(output,name);fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(path.join(work,'dist',name.slice(7)),destination);
}
const offline=fs.readFileSync(path.join(output,'assets/course-download.html'),'utf8');
for(const name of ['src/lesson.js','src/enhanced-flow.js']){
  // All earlier lesson behavior is embedded via the normal source build.
  const source=fs.readFileSync(path.join(root,name),'utf8');
  if(name.endsWith('lesson.js'))assert(offline.includes(source.match(/function gameDialog[\s\S]*?(?=function imageApplied)/)[0]),'Centered game dialog missing');
  else assert(offline.includes(source),'Existing enhanced flow missing');
}
assert(offline.includes(fs.readFileSync(path.join(root,'src/lesson.css'),'utf8')),'Existing button CSS missing');
assert(hosted.includes('png8EncoderURL'),'Existing PNG-8 path missing');
assert.deepEqual(hashes(baseline),before,'The final-release baseline must stay untouched');
const after=hashes(output);
for(const [name,expected]of Object.entries(before))if(name!=='manifest.json'&&!changed.includes(name))assert.equal(after[name],expected,'Preserved release file changed: '+name);
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),baseline,output,changed,added,serverChanged:false,bindingsChanged:false,deployExecuted:false,hashes:Object.fromEntries(Object.entries(after).filter(([name])=>name!=='manifest.json'))},null,2));
console.log(JSON.stringify({output,changed,added,serverChanged:false,bindingsChanged:false,deployExecuted:false}));
