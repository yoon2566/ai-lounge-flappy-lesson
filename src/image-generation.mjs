export const IMAGE_MODEL='recraft/recraft-v4.1-flash';
export const IMAGE_PRICE_USD=0.007;

export function imageAspectRatio(prompt){
 const explicit=prompt.match(/(?:^|[^\d])(16:9|9:16|4:3|3:4|1:1)(?:[^\d]|$)/);
 if(explicit)return explicit[1];
 if(/세로|수직|portrait|vertical/i.test(prompt))return '9:16';
 if(/가로|와이드|배경|landscape|wide/i.test(prompt))return '16:9';
 return '1:1';
}
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function generateImage(prompt,env,signal){
 try{
  const response=await fetch('https://openrouter.ai/api/v1/images',{
   method:'POST',headers:{Authorization:'Bearer '+env.SHERPA_OPENROUTER_KEY,'Content-Type':'application/json','X-Title':'AI Sherpa Flappy Image'},
   signal:AbortSignal.any([signal,AbortSignal.timeout(90000)]),
   body:JSON.stringify({model:IMAGE_MODEL,prompt,n:1,aspect_ratio:imageAspectRatio(prompt)})
  });
  if(!response.ok){await response.body?.cancel();const code=response.status;
   return reply({error:code===402?'API 사용 잔액을 확인해 주세요.':code===429?'이미지 생성 요청이 많습니다. 잠시 후 다시 보내 주세요.':code===400||code===422?'이 요청으로 이미지를 만들지 못했습니다. 이미지 설명을 바꾸어 다시 요청해 주세요.':'이미지 생성 모델에 연결하지 못했습니다. 잠시 후 다시 요청해 주세요.'},code===402?402:code===429?429:502);
  }
  if(Number(response.headers.get('content-length'))>20*1024*1024)throw Error('large');
  const data=await response.json();
  const item=data.data?.[0],base64=item?.b64_json;
  if(typeof base64!=='string'||base64.length>14*1024*1024||!base64.length||base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw Error('invalid');
  const prefix=atob(base64.slice(0,32));
  const mime=prefix.startsWith('\x89PNG\r\n\x1a\n')?'image/png':prefix.startsWith('\xff\xd8\xff')?'image/jpeg':prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP'?'image/webp':null;
  if(!mime)throw Error('format');
  return reply({type:'image',model:IMAGE_MODEL,image:'data:'+mime+';base64,'+base64,mediaType:mime,costUsd:typeof data.usage?.cost==='number'&&Number.isFinite(data.usage.cost)?data.usage.cost:IMAGE_PRICE_USD});
 }catch(error){return reply({error:signal.aborted?'이미지 생성을 중지했습니다.':error.name==='TimeoutError'?'이미지 생성 시간이 길어지고 있습니다. 잠시 후 다시 요청해 주세요.':'이미지 생성 결과를 받지 못했습니다. 다시 요청해 주세요.'},502);}
}
