// Local packaging only: layer dialog centering over the buttons + PNG-8 release.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const baseline=path.join(root,'output/buttons-release-20261109');
const output=path.join(root,'output/final-release-20261109');
const work=path.join(root,'.build/center-check/work');
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)).map(n=>e.name+'/'+n):[e.name]);
const manifest=JSON.parse(fs.readFileSync(path.join(baseline,'manifest.json'),'utf8'));
for(const [name,expected] of Object.entries(manifest.hashes))assert.equal(hash(fs.readFileSync(path.join(baseline,name))),expected,'Baseline changed: '+name);
fs.mkdirSync(work,{recursive:true});
for(const name of ['src','assets','tests','build-lesson.mjs'])fs.cpSync(path.join(root,name),path.join(work,name),{recursive:true});
fs.mkdirSync(path.join(work,'vendor'),{recursive:true});
for(const name of ['pako_deflate.min.js','pako.LICENSE','png8.js','README.md'])fs.copyFileSync(path.join(root,'vendor',name),path.join(work,'vendor',name));
fs.cpSync(path.join(baseline,'assets'),path.join(work,'dist'),{recursive:true});
execFileSync(process.execPath,[path.join(work,'build-lesson.mjs')],{cwd:root,stdio:'inherit'});
const hosted=fs.readFileSync(path.join(work,'dist/lesson.html'),'utf8');
const css=hosted.match(/<link rel="stylesheet" href="\/([^"]+)"/)[1];
const js=hosted.match(/<script src="\/([^"]+)"/)[1];
const previousHosted=fs.readFileSync(path.join(baseline,'assets/lesson.html'),'utf8');
assert.equal(hosted,previousHosted.replace(/<script src="[^"]+"><\/script>/,'<script src="/'+js+'"></script>').replace(/<link rel="stylesheet" href="[^"]+">/,'<link rel="stylesheet" href="/'+css+'">'),'Unexpected hosted HTML change');
const previousJS=previousHosted.match(/<script src="\/([^"]+)"/)[1];
const newScript=fs.readFileSync(path.join(work,'dist',js),'utf8'),oldScript=fs.readFileSync(path.join(baseline,'assets',previousJS),'utf8');
const dialogPattern=/function gameDialog[\s\S]*?(?=function imageApplied)/;
assert.equal(newScript.replace(dialogPattern,()=>oldScript.match(dialogPattern)[0]),oldScript,'Unexpected JS change outside gameDialog');
const changed=['assets/lesson.html','assets/course-download.html'];
// Any other generated file must be byte-identical to the PNG-8 release.
for(const name of files(path.join(work,'dist'))){
 if(['lesson.html','course-download.html',css,js].includes(name)||/^static\/lesson\.[a-f0-9]{12}\.(css|js)$/.test(name))continue;
 assert.equal(hash(fs.readFileSync(path.join(work,'dist',name))),hash(fs.readFileSync(path.join(baseline,'assets',name))),'Unexpected generated change: '+name);
}
fs.cpSync(baseline,output,{recursive:true});
for(const name of ['lesson.html','course-download.html',css,js])fs.copyFileSync(path.join(work,'dist',name),path.join(output,'assets',name));
const offline=fs.readFileSync(path.join(output,'assets/course-download.html'),'utf8');
const previousOffline=fs.readFileSync(path.join(baseline,'assets/course-download.html'),'utf8');
assert.equal(offline.replace(/<script>([\s\S]*?)<\/script>/g,()=>'<script></script>').replace(/<style>[\s\S]*?<\/style>/,()=>previousOffline.match(/<style>[\s\S]*?<\/style>/)[0]),previousOffline.replace(/<script>([\s\S]*?)<\/script>/g,()=>'<script></script>'),'Unexpected offline HTML change');
assert(offline.includes(fs.readFileSync(path.join(root,'src/lesson.css'),'utf8')),'Offline CSS missing');
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),baseline,output,changed,added:['assets/'+css,'assets/'+js],deployExecuted:false,hashes:Object.fromEntries(files(output).filter(n=>n!=='manifest.json').map(n=>[n,hash(fs.readFileSync(path.join(output,n)))]))},null,2));
assert(offline.includes(fs.readFileSync(path.join(root,'src/lesson.js'),'utf8').match(/function gameDialog[\s\S]*?(?=function imageApplied)/)[0]),'Offline dialog JS missing');
console.log(JSON.stringify({output,changed,added:css,offlineCSSVerified:true,deployExecuted:false}));
