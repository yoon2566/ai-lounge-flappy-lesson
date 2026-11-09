export function imageType(bytes) {
  if (bytes.length >= 24 && bytes[0]===82 && bytes[1]===73 && bytes[2]===70 && bytes[3]===70 && bytes[8]===87 && bytes[9]===69 && bytes[10]===66 && bytes[11]===80) return 'image/webp';
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n) && bytes[8]===0 && bytes[9]===0 && bytes[10]===0 && bytes[11]===13 && bytes[12]===73 && bytes[13]===72 && bytes[14]===68 && bytes[15]===82) return 'image/png';
  return null;
}

const imageHeaders = key => new Headers({
  'Content-Type': key.endsWith('.png') ? 'image/png' : 'image/webp',
  'Cache-Control': 'public, max-age=31536000, immutable',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex'
});

export function imageStorageMode(env) {
  return env.LESSON_IMAGE_BUCKET ? 'r2' : env.LESSON_IMAGES ? 'kv' : 'unconfigured';
}

export async function storeImage(env, key, bytes) {
  const type = imageType(bytes);
  if (!type || !key.endsWith(type === 'image/png' ? '.png' : '.webp')) throw new Error('그림을 저장하지 못했습니다. 다시 시도해 주세요.');
  if (env.LESSON_IMAGE_BUCKET) {
    const object = await env.LESSON_IMAGE_BUCKET.put(key, bytes, {
      httpMetadata: {
        contentType: type,
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });
    if (!object) throw new Error('이미지를 저장하지 못했습니다. 다시 시도해 주세요.');
    return;
  }
  // Keep the existing deployment usable until the R2 binding is enabled.
  if (!env.LESSON_IMAGES) throw new Error('이미지 저장소가 연결되지 않았습니다.');
  await env.LESSON_IMAGES.put(key, bytes);
}

export async function readImage(env, key, method = 'GET') {
  const headers = imageHeaders(key);
  let r2Error;
  if (env.LESSON_IMAGE_BUCKET) {
    try {
      const object = method === 'HEAD'
        ? await env.LESSON_IMAGE_BUCKET.head(key)
        : await env.LESSON_IMAGE_BUCKET.get(key);
      if (object) {
        headers.set('Content-Length', String(object.size));
        headers.set('ETag', object.httpEtag);
        return new Response(method === 'HEAD' ? null : object.body, {headers});
      }
    } catch (error) {
      // Existing KV links should stay readable during an R2 outage.
      r2Error = error;
    }
  }
  if (env.LESSON_IMAGES) {
    const bytes = await env.LESSON_IMAGES.get(key, {type: 'arrayBuffer'});
    if (bytes !== null) {
      headers.set('Content-Length', String(bytes.byteLength));
      return new Response(method === 'HEAD' ? null : bytes, {headers});
    }
  }
  if (r2Error) throw r2Error;
  if (imageStorageMode(env) === 'unconfigured') throw new Error('Image storage unavailable');
  return new Response('Not found', {status: 404});
}
