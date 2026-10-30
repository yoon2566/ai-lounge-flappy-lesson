// Included in the game itself so previews, downloads and board copies behave alike.
function safeGameHTML(html){
 if(!html||html.includes('id="flappy-image-cors-guard-v1"'))return html;
 const boot=`<script id="flappy-image-cors-guard-v1">(()=>{
 const hostedOrigin=${JSON.stringify(HOST)},proto=HTMLImageElement.prototype,src=Object.getOwnPropertyDescriptor(proto,'src'),setAttribute=proto.setAttribute;
 function prepare(image,value){try{const url=new URL(String(value),document.baseURI);if(url.origin===hostedOrigin&&/^\\/(images|assets)\\//.test(url.pathname))image.crossOrigin='anonymous';}catch{}}
 if(src?.set&&src.configurable)Object.defineProperty(proto,'src',{...src,set(value){prepare(this,value);src.set.call(this,value);}});
 proto.setAttribute=function(name,value){if(String(name).toLowerCase()==='src')prepare(this,value);return setAttribute.call(this,name,value);};
 })();<\/script>`;
 if(/<head(?:\s[^>]*)?>/i.test(html))return html.replace(/<head(?:\s[^>]*)?>/i,tag=>tag+boot);
 if(/<html(?:\s[^>]*)?>/i.test(html))return html.replace(/<html(?:\s[^>]*)?>/i,tag=>tag+'<head>'+boot+'</head>');
 return boot+html;
}
