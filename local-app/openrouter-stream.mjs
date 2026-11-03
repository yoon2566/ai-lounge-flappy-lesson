// Decode SSE across arbitrary UTF-8/chunk boundaries; ignore heartbeat comments.
export async function readCompletionStream(body,onDelta=()=>{}){
 const reader=body.getReader(),decoder=new TextDecoder();let buffer='',text='',id,usage,finishReason,ended=false;
 function event(block){
  const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
  if(!data)return;if(data==='[DONE]'){ended=true;return;}
  const out=JSON.parse(data),choice=out.choices?.[0];
  if(out.error||choice?.finish_reason==='error')throw Error('코드를 받는 중 연결이 끊겼어요. 이전 게임은 그대로 있어요.');
  id=out.id||id;usage=out.usage||usage;finishReason=choice?.finish_reason||finishReason;
  if(typeof choice?.delta?.content==='string'&&choice.delta.content){text+=choice.delta.content;onDelta(choice.delta.content);}
 }
 try{while(true){const {value,done}=await reader.read();buffer+=done?decoder.decode():decoder.decode(value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}if(done)break;}if(buffer.trim())event(buffer);
  if(!ended||finishReason==='length'||!text)throw Error('코드를 끝까지 받지 못했어요. 이전 게임은 그대로 있어요.');
  return {id,usage,choices:[{message:{content:text},finish_reason:finishReason}]};
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
