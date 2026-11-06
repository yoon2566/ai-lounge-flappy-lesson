import {DurableObject} from 'cloudflare:workers';

// D1 owns the lesson state. Each classroom has its own read-only broadcast channel.
export class ClassroomEvents extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.latest=null;this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'))}
  permitted(ws){const info=ws.deserializeAttachment();return info?.canManage===true&&info.expiresAt>Date.now()}
  fetch(request){
    const code=request.headers.get('X-Classroom-Code');
    if(request.method!=='GET'||request.headers.get('Upgrade')?.toLowerCase()!=='websocket'||!/^[A-F0-9]{6}$/.test(code||''))return new Response('WebSocket required',{status:426});
    let initial;try{initial=JSON.parse(decodeURIComponent(request.headers.get('X-Classroom-State')||''));if(initial.code!==code)throw Error()}catch{return new Response('Invalid classroom state',{status:400})}
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({canManage:request.headers.get('X-Classroom-Can-Manage')==='true',expiresAt:Number(request.headers.get('X-Classroom-Auth-Until')||0)});
    // The Worker has already checked D1. Complete the handshake without another I/O.
    // Clients reconcile with D1 on open; revisions reject any delayed snapshots.
    if(!this.latest||!this.latest.deleted&&initial.revision>=this.latest.revision)this.latest=initial;
    server.send(JSON.stringify({...this.latest,canManage:this.permitted(server)}));
    if(this.latest.deleted)server.close(1000,'Classroom deleted');
    return new Response(null,{status:101,webSocket:client});
  }
  async publish(snapshot){
    if(!this.latest||snapshot.deleted||!this.latest.deleted&&snapshot.revision>=this.latest.revision)this.latest=snapshot;
    else return {delivered:0};
    let delivered=0;
    for(const ws of this.ctx.getWebSockets()){
      try{ws.send(JSON.stringify({...snapshot,canManage:this.permitted(ws)}));delivered++;if(snapshot.deleted)ws.close(1000,'Classroom deleted')}catch{try{ws.close(1011,'Please reconnect')}catch{}}
    }
    return {delivered};
  }
  webSocketMessage(ws,message){if(message==='ping')ws.send('pong');else ws.close(1008,'Read-only connection')}
  webSocketClose(ws,code,reason){try{ws.close([1005,1006,1015].includes(code)?1000:code,reason)}catch{}}
  webSocketError(ws){try{ws.close(1011,'Please reconnect')}catch{}}
}
