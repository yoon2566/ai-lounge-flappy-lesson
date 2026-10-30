import {SYSTEM} from './ai-system.mjs';
import {generateImage} from './image-generation.mjs';

export const CHAT_MODEL='anthropic/claude-haiku-5.5';
const json=(data,status)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});

export async function generateLesson(body,env,signal){
  if(!env.SHERPA_OPENROUTER_KEY)return json({error:'셰르파 API 연결 설정을 확인해 주세요.'},503);
  if(body.imageMode===true){
    const prompt=body.messages.at(-1).content;
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>12000||prompt.includes('[첨부 HTML 파일:'))return json({error:'이미지 설명을 12,000자 이내로 입력해 주세요.'},400);
    return generateImage(prompt.trim(),env,signal);
  }
  try{
    const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',signal,
      headers:{Authorization:'Bearer '+env.SHERPA_OPENROUTER_KEY,'Content-Type':'application/json','X-Title':'AI Sherpa Flappy'},
      body:JSON.stringify({model:CHAT_MODEL,messages:[{role:'system',content:SYSTEM},...body.messages],reasoning:{enabled:false,effort:'high',exclude:true},provider:{sort:'throughput',allow_fallbacks:true},max_tokens:128000,stream:true,stream_options:{include_usage:true}})
    });
    if(!response.ok){
      await response.body?.cancel();
      const status=response.status===402?402:response.status===429?429:502;
      return json({error:status===402?'API 사용 잔액을 확인해 주세요.':status===429?'요청이 많습니다. 잠시 후 다시 실행해 주세요.':'게임 생성 모델에 연결하지 못했습니다. 잠시 후 다시 요청해 주세요.'},status);
    }
    if(!response.body)return json({error:'모델 응답이 비어 있습니다.'},502);
    const headers=new Headers({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const generation=response.headers.get('X-Generation-Id');if(generation)headers.set('X-Generation-Id',generation);
    return new Response(response.body,{headers});
  }catch{return json({error:signal.aborted?'생성을 중지했습니다.':'모델 연결이 끊겼습니다. 다시 요청해 주세요.'},502);}
}
