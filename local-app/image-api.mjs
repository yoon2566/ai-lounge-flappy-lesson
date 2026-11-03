export const MODEL='black-forest-labs/flux-3-image-klein';
export function imageRequest({kind,subject,motion,referenceData}){
 if(!['character','motion','background','item','obstacle'].includes(kind))throw Error('그림 종류를 확인해 주세요.');
 if(typeof subject!=='string'||!subject.trim()||subject.length>800)throw Error('그림 설명을 800자 안으로 적어 주세요.');
 let prompt=subject.trim()+'. '+(kind==='background'?'픽셀아트.':'마젠타(#FF00FF) 단색 배경. 픽셀아트.'+(kind==='character'?' 오른쪽을 바라보기.':''));
 if(kind==='motion'){
  if(!referenceData)throw Error('첫 번째 캐릭터 그림이 필요해요.');
  if(typeof motion!=='string'||!motion.trim()||motion.length>400)throw Error('바꿀 동작을 적어 주세요.');
  prompt='첨부한 캐릭터의 다음 동작 한 장. '+motion.trim()+'. 몸통·얼굴·색·크기·위치는 유지. 오른쪽을 바라보기. 마젠타(#FF00FF) 단색 배경. 픽셀아트.';
 }
 const request={model:MODEL,prompt,aspect_ratio:kind==='background'?'9:16':'1:1',resolution:'1K',n:1};
 if(referenceData)request.input_references=[{type:'image_url',image_url:{url:referenceData}}];
 return request;
}
export async function generateImage(request,key,signal){
 const response=await fetch('https://openrouter.ai/api/v1/images',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','X-Title':'Flappy local classroom'},body:JSON.stringify(request),signal});
 if(!response.ok){await response.body?.cancel();throw Error(response.status===402?'OpenRouter 잔액을 확인해 주세요.':response.status===429?'요청이 많아요. 잠시 뒤 다시 시도해 주세요.':'그림 생성 연결에 실패했어요. ('+response.status+')');}
 const out=await response.json(),value=out.data?.[0]?.b64_json;if(!value)throw Error('그림 응답이 비어 있어요.');
 const bytes=Buffer.from(value,'base64'),type=bytes[0]===137?'png':bytes[0]===255?'jpg':bytes.toString('ascii',0,4)==='RIFF'?'webp':null;
 if(!type)throw Error('그림 형식을 확인하지 못했어요.');return {bytes,type,usage:out.usage||{}};
}
