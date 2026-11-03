import fs from 'node:fs';
import path from 'node:path';
const base=path.join(import.meta.dirname,'public');
for(const [file,styles] of Object.entries({'index.html':['duo-base','duo-shell'],'lesson.html':['duo-base','duo-shell'],'board.html':['duo-base','duo-shell'],'course-code.html':['duo-base','duo-question-art','duo-course'],'practice/index.html':['duo-base','duo-studio']})){
 const target=path.join(base,file);let html=fs.readFileSync(target,'utf8');
 for(const style of styles)html=html.replace(new RegExp('<link rel="stylesheet" href="/'+style+'\\.css">','g'),'');
 html=html.replace('</head>',styles.map(s=>`<link rel="stylesheet" href="/${s}.css">`).join('')+'</head>');fs.writeFileSync(target,html);
}
console.log('Duolingo-inspired styles attached to all five local app surfaces');
