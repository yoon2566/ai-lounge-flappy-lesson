# PNG-8 fallback

- `pako_deflate.min.js`: pako **1.0.11**, unchanged deflate-only browser build (MIT AND Zlib), from the existing local npm package. Upstream: https://github.com/nodeca/pako/tree/1.0.11 . License: `pako.LICENSE`; the minified distribution also carries its license header.
- `png8.js`: local single-frame indexed PNG writer. Always emits 8-bit color type 3, PLTE and tRNS, with CRC32 and pako zlib compression. No CDN, WASM or CompressionStream.
- Up to 256 distinct **RGBA** values: exact palette, including alpha. Above 256: bounded RGBA histogram and weighted median cut, at most 256 entries. Fully transparent pixels have a reserved entry; opaque pixels stay opaque and partial alpha is represented by tRNS. More than 256 colors are necessarily lossy.
- The build combines these files into a hashed same-origin asset. Only the failed WebP branch requests/executes it. The self-contained course download carries inert source text and creates a script Blob only on fallback.
- Tests decode independently with Node zlib, verify chunk CRCs and pixels, and exercise the browser save/upload/edit paths.
