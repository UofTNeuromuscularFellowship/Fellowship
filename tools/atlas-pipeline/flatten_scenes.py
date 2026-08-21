#!/usr/bin/env python3
"""
Flatten a multi-scene GLB into a single scene.

`gltf-transform merge` keeps each input file as its own glTF SCENE. three.js's
GLTFLoader — and therefore drei's useGLTF — only ever mounts the default scene,
so everything from the second file is loaded into memory and then silently
never rendered. That failure is invisible: no error, no warning, the layer
toggle just does nothing.

This moves every scene's root nodes into scene 0 and drops the rest.

    python3 tools/atlas-pipeline/flatten_scenes.py in.glb out.glb
"""

import json
import struct
import sys

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, _length = struct.unpack_from('<III', data, 0)
    if magic != GLB_MAGIC:
        raise SystemExit(f'{path} is not a GLB')
    chunks, off = [], 12
    while off + 8 <= len(data):
        clen, ctype = struct.unpack_from('<II', data, off)
        chunks.append((ctype, data[off + 8: off + 8 + clen]))
        off += 8 + clen + ((4 - clen % 4) % 4)
    return version, chunks


def write_glb(path, version, gltf, bin_chunk):
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)          # JSON pads with spaces
    out = bytearray()
    body = bytearray()
    body += struct.pack('<II', len(js), CHUNK_JSON) + js
    if bin_chunk is not None:
        b = bin_chunk + b'\x00' * ((4 - len(bin_chunk) % 4) % 4)  # BIN pads with zeros
        body += struct.pack('<II', len(b), CHUNK_BIN) + b
    out += struct.pack('<III', GLB_MAGIC, version, 12 + len(body))
    out += body
    open(path, 'wb').write(bytes(out))


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]

    version, chunks = read_glb(src)
    gltf = json.loads(next(c[1] for c in chunks if c[0] == CHUNK_JSON))
    bin_chunk = next((c[1] for c in chunks if c[0] == CHUNK_BIN), None)

    scenes = gltf.get('scenes', [])
    if len(scenes) <= 1:
        write_glb(dst, version, gltf, bin_chunk)
        print(f'[flatten] {src}: already one scene, copied through')
        return

    keep = gltf.get('scene', 0)
    roots = list(scenes[keep].get('nodes', []))
    moved = 0
    for i, sc in enumerate(scenes):
        if i == keep:
            continue
        for n in sc.get('nodes', []):
            if n not in roots:
                roots.append(n)
                moved += 1

    scenes[keep]['nodes'] = roots
    gltf['scenes'] = [scenes[keep]]
    gltf['scene'] = 0

    write_glb(dst, version, gltf, bin_chunk)
    node_names = [gltf['nodes'][n].get('name') for n in roots]
    print(f'[flatten] {src} -> {dst}: merged {len(scenes)} scenes, moved {moved} root nodes')
    print(f'[flatten] scene now has {len(roots)} roots, e.g. {node_names[:3]}')


if __name__ == '__main__':
    main()
