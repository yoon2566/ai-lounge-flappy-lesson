import fs from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const store=new URL('.local/',import.meta.url);fs.mkdirSync(store,{recursive:true});const file=new URL('rooms.json',store);
if(!fs.existsSync(file)){fs.writeFileSync(file,JSON.stringify({version:2,rooms:[{code:'F1A001',name:'플래피 미리보기',createdAt:Date.now(),token:randomBytes(24).toString('hex'),openPages:[1,2,3,4,5,6,7,8],revision:1,expiresAt:null}]},null,2));console.log('미리보기 클래스 F1A001 준비 완료');}
else console.log('기존 로컬 클래스 유지');
