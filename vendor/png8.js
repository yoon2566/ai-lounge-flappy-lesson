/* Local PNG-8 encoder. pako supplies zlib; no browser compression API is used. */
(function (global) {
  'use strict';
  var crcTable = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c;
  }
  function chunk(name, bytes) {
    var out = new Uint8Array(bytes.length + 12), view = new DataView(out.buffer);
    view.setUint32(0, bytes.length);
    for (var i = 0; i < 4; i++) out[i + 4] = name.charCodeAt(i);
    out.set(bytes, 8);
    var crc = 0xffffffff;
    for (var j = 4; j < out.length - 4; j++) crc = crcTable[(crc ^ out[j]) & 255] ^ (crc >>> 8);
    view.setUint32(out.length - 4, (crc ^ 0xffffffff) >>> 0);
    return out;
  }
  function colorKey(px, i) {
    return (px[i] | px[i + 1] << 8 | px[i + 2] << 16 | px[i + 3] << 24) >>> 0;
  }
  function binKey(px, i) {
    // Bounded 4-bit RGBA histogram; alpha endpoints get separate bins/groups.
    return (px[i] >> 4) | (px[i + 1] >> 4) << 4 | (px[i + 2] >> 4) << 8 |
      (px[i + 3] === 255 ? 16 : px[i + 3] >> 4) << 12;
  }
  function makeBox(colors) {
    var lo = [255,255,255,255], hi = [0,0,0,0], count = 0;
    colors.forEach(function (c) {
      count += c.n;
      for (var d = 0; d < 4; d++) { lo[d] = Math.min(lo[d], c.v[d]); hi[d] = Math.max(hi[d], c.v[d]); }
    });
    var axis = 0;
    for (var d = 1; d < 4; d++) if (hi[d] - lo[d] > hi[axis] - lo[axis]) axis = d;
    return {colors: colors, count: count, axis: axis, score: (hi[axis] - lo[axis]) * Math.sqrt(count)};
  }
  function paletteFor(px) {
    var exact = new Map(), palette = [], indices = new Uint8Array(px.length / 4);
    for (var i = 0; i < px.length; i += 4) {
      var key = colorKey(px, i), index = exact.get(key);
      if (index === undefined) {
        if (palette.length === 256) break;
        index = palette.length; exact.set(key, index);
        palette.push([px[i],px[i+1],px[i+2],px[i+3]]);
      }
      indices[i / 4] = index;
    }
    if (i === px.length) return {palette: palette, indices: indices};
    // Weighted median cut only when there are more than 256 distinct RGBA colors.
    // Reserve fully transparent pixels; never mix opaque and translucent pixels.
    var bins = new Map(), transparent = false;
    for (i = 0; i < px.length; i += 4) {
      if (px[i+3] === 0) { transparent = true; continue; }
      key = binKey(px, i);
      var bin = bins.get(key);
      if (!bin) { bin = {key:key, n:0, v:[0,0,0,0]}; bins.set(key, bin); }
      bin.n++;
      for (var d = 0; d < 4; d++) bin.v[d] += px[i+d];
    }
    var opaque = [], translucent = [];
    bins.forEach(function (b) {
      for (var d = 0; d < 4; d++) b.v[d] /= b.n;
      (b.v[3] === 255 ? opaque : translucent).push(b);
    });
    var boxes = [];
    if (opaque.length) boxes.push(makeBox(opaque));
    if (translucent.length) boxes.push(makeBox(translucent));
    var limit = transparent ? 255 : 256;
    while (boxes.length < limit) {
      var best = -1;
      for (i = 0; i < boxes.length; i++) if (boxes[i].colors.length > 1 && (best < 0 || boxes[i].score > boxes[best].score)) best = i;
      if (best < 0) break;
      var box = boxes[best], axis = box.axis, sum = 0, cut = 0;
      box.colors.sort(function (a,b) { return a.v[axis] - b.v[axis] || a.key - b.key; });
      while (cut < box.colors.length - 1 && sum < box.count / 2) sum += box.colors[cut++].n;
      boxes[best] = makeBox(box.colors.slice(0,cut));
      boxes.push(makeBox(box.colors.slice(cut)));
    }
    palette = transparent ? [[0,0,0,0]] : [];
    boxes.forEach(function (box) {
      var index = palette.length, mean = [0,0,0,0];
      box.colors.forEach(function (b) {
        b.index = index;
        for (var d = 0; d < 4; d++) mean[d] += b.v[d] * b.n;
      });
      palette.push(mean.map(function (v) { return Math.round(v / box.count); }));
    });
    for (i = 0; i < px.length; i += 4) indices[i/4] = px[i+3] === 0 ? 0 : bins.get(binKey(px,i)).index;
    return {palette:palette, indices:indices};
  }
  function encode(rgba, width, height) {
    if (!width || !height || rgba.length !== width * height * 4) throw new Error('Invalid canvas');
    var colors = paletteFor(rgba), palette = colors.palette;
    var ihdr = new Uint8Array(13), header = new DataView(ihdr.buffer);
    header.setUint32(0,width); header.setUint32(4,height); ihdr[8] = 8; ihdr[9] = 3;
    var plte = new Uint8Array(palette.length * 3), trns = new Uint8Array(palette.length);
    palette.forEach(function (c,i) { plte.set(c.slice(0,3),i*3); trns[i] = c[3]; });
    var rows = new Uint8Array((width+1)*height);
    for (var y = 0; y < height; y++) rows.set(colors.indices.subarray(y*width,(y+1)*width),y*(width+1)+1);
    var parts = [new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('PLTE',plte),chunk('tRNS',trns),chunk('IDAT',global.pako.deflate(rows,{level:9})),chunk('IEND',new Uint8Array(0))];
    var length = parts.reduce(function (n,p) { return n+p.length; },0), out = new Uint8Array(length), offset = 0;
    parts.forEach(function (p) { out.set(p,offset); offset += p.length; });
    return out;
  }
  global.FlappyPNG8 = {encode:encode, fromCanvas:function (canvas) {
    var bytes = encode(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height), binary = '';
    for (var i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
    return 'data:image/png;base64,' + btoa(binary);
  }};
})(window);
