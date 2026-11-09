// Local packaging only. Never contacts Cloudflare or changes the working dist/.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const baseline=path.resolve(root,'../74_게시판_만족도버튼/release/flappy1');
const work=path.join(root,'.build/png8-check/work'),output=path.join(root,'output/png8-release-20261109');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const map=JSON.parse(fs.readFileSync(path.join(baseline,'modules/worker.js.map'),'utf8'));
for(let i=0;i<map.sources.length;i++){
 const name=map.sources[i].replaceAll('\\','/');
 if(!name.startsWith('src/')||name.includes('..'))throw Error('Unexpected baseline source: '+name);
 if(!['src/worker.mjs','src/image-storage.mjs'].includes(name)&&fs.readFileSync(path.join(root,name),'utf8')!==map.sourcesContent[i])throw Error('Unrelated server change: '+name);
}
fs.mkdirSync(work,{recursive:true});
for(const name of ['src','assets','tests','build-lesson.mjs'])fs.cpSync(path.join(root,name),path.join(work,name),{recursive:true});
fs.mkdirSync(path.join(work,'vendor'),{recursive:true});
for(const name of ['pako_deflate.min.js','pako.LICENSE','png8.js','README.md'])fs.copyFileSync(path.join(root,'vendor',name),path.join(work,'vendor',name));
// Preserve every old hashed asset and source notice for cached lesson pages.
fs.cpSync(path.join(baseline,'assets'),path.join(work,'dist'),{recursive:true});
execFileSync(process.execPath,[path.join(work,'build-lesson.mjs')],{cwd:root,stdio:'inherit'});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)).map(n=>e.name+'/'+n):[e.name]);}
const changed=[];let added=[];
for(const name of files(path.join(work,'dist'))){
 const old=path.join(baseline,'assets',name),fresh=path.join(work,'dist',name);
 if(!fs.existsSync(old)){added.push(name);continue;}
 if(hash(fs.readFileSync(old))!==hash(fs.readFileSync(fresh)))changed.push(name);
}
for(const name of changed)if(!['lesson.html','course-download.html','board.js','class-board.js'].includes(name))throw Error('Unexpected asset change: '+name);
for(const name of added)if(!/^static\/(lesson|png8)\.[a-f0-9]{12}\.js$/.test(name)&&!name.startsWith('source-notices/png8/'))throw Error('Unexpected added asset: '+name);
const hosted=fs.readFileSync(path.join(work,'dist/lesson.html'),'utf8');
// Do not package intermediate bundles left by local iterations. Retain all baseline hashes.
added=added.filter(name=>!name.startsWith('static/')||hosted.includes('/'+name));
const assetFiles=[...new Set([...files(path.join(baseline,'assets')),...added])];
const require=createRequire(import.meta.url);
const esbuild=require(process.env.ESBUILD_MODULE_PATH||path.join(process.env.APPDATA,'npm/node_modules/wrangler/node_modules/esbuild'));
fs.mkdirSync(path.join(output,'modules'),{recursive:true});
await esbuild.build({entryPoints:[path.join(root,'src/worker.mjs')],outfile:path.join(output,'modules/worker.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers'],sourcemap:true,logLevel:'warning'});
const previousManifest=path.join(output,'manifest.json');
if(fs.existsSync(previousManifest)){
 const previous=JSON.parse(fs.readFileSync(previousManifest,'utf8'));
 for(const name of previous.added){
  if(!name.startsWith('static/')||assetFiles.includes(name))continue;
  const filename=path.resolve(output,'assets',name);
  if(!filename.startsWith(path.resolve(output,'assets')+path.sep))throw Error('Invalid generated asset path');
  if(fs.existsSync(filename)){if(hash(fs.readFileSync(filename))!==previous.hashes['assets/'+name])throw Error('Generated file was edited: '+name);fs.unlinkSync(filename);}
 }
}
for(const name of assetFiles){const target=path.join(output,'assets',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(work,'dist',name),target);}
fs.copyFileSync(path.join(baseline,'wrangler.json'),path.join(output,'wrangler.json'));
const manifest={builtAt:new Date().toISOString(),baseline,recordedVersion:'2a526280-015e-4d95-83fd-7dc561de9e56',liveVersionVerified:false,output,changed,added,hashes:Object.fromEntries(files(output).filter(n=>n!=='manifest.json').map(n=>[n,hash(fs.readFileSync(path.join(output,n)))]))};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({output,changed,added,deployExecuted:false},null,2));
