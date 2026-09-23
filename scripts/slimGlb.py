# GLB 瘦身：刪除指定節點的網格、去掉 TANGENT、清掉沒用到的資源、貼圖縮小（無透明 PNG 轉 JPEG）
# 用法：python3 scripts/slimGlb.py 輸入.glb 輸出.glb [最大尺寸=2048] [要移除的節點名正規式]
import json, struct, subprocess, sys, tempfile, os, re

src, dst = sys.argv[1], sys.argv[2]
max_size = int(sys.argv[3]) if len(sys.argv) > 3 else 2048
drop_re = re.compile(sys.argv[4]) if len(sys.argv) > 4 else None
data = open(src, 'rb').read()
assert data[:4] == b'glTF'
jlen = struct.unpack('<I', data[12:16])[0]
gltf = json.loads(data[20:20 + jlen])
bin_start = 20 + jlen + 8
bin_chunk = data[bin_start:bin_start + struct.unpack('<I', data[20 + jlen:24 + jlen])[0]]

# ---- 移除節點網格 + 清理未使用資源 ----
if drop_re:
    for n in gltf['nodes']:
        if 'mesh' in n and drop_re.search(n.get('name', '')): del n['mesh']
for m in gltf['meshes']:
    for p in m['primitives']: p['attributes'].pop('TANGENT', None)

def remap(items, used):
    order = sorted(used); mp = {o: i for i, o in enumerate(order)}
    return [items[o] for o in order], mp

used_mesh = {n['mesh'] for n in gltf['nodes'] if 'mesh' in n}
gltf['meshes'], mm = remap(gltf['meshes'], used_mesh)
for n in gltf['nodes']:
    if 'mesh' in n: n['mesh'] = mm[n['mesh']]
used_acc, used_mat = set(), set()
for m in gltf['meshes']:
    for p in m['primitives']:
        used_acc.update(p['attributes'].values())
        if 'indices' in p: used_acc.add(p['indices'])
        if 'material' in p: used_mat.add(p['material'])
gltf['accessors'], am = remap(gltf['accessors'], used_acc)
gltf['materials'], mtm = remap(gltf['materials'], used_mat)
for m in gltf['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: am[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = am[p['indices']]
        if 'material' in p: p['material'] = mtm[p['material']]
def tex_refs(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k.endswith('Texture') and isinstance(v, dict) and 'index' in v: yield v
            else: yield from tex_refs(v)
    elif isinstance(o, list):
        for v in o: yield from tex_refs(v)
refs = list(tex_refs(gltf['materials']))
used_tex = {r['index'] for r in refs}
gltf['textures'], tm = remap(gltf.get('textures', []), used_tex)
for r in refs: r['index'] = tm[r['index']]
used_img = {t['source'] for t in gltf['textures']}
gltf['images'], im_map = remap(gltf.get('images', []), used_img)
for t in gltf['textures']: t['source'] = im_map[t['source']]
used_bv = {a['bufferView'] for a in gltf['accessors'] if 'bufferView' in a} | {i['bufferView'] for i in gltf['images']}
old_bvs = gltf['bufferViews']
gltf['bufferViews'], bm = remap(old_bvs, used_bv)
for a in gltf['accessors']:
    if 'bufferView' in a: a['bufferView'] = bm[a['bufferView']]
for i in gltf['images']: i['bufferView'] = bm[i['bufferView']]
print(f"保留網格 {len(gltf['meshes'])}、材質 {len(gltf['materials'])}、貼圖 {len(gltf['images'])}")

def png_has_alpha(b):
    # IHDR 的 color type：4 = 灰階+alpha，6 = RGBA
    return b[:8] == b'\x89PNG\r\n\x1a\n' and b[25] in (4, 6)

replaced = {}
tmp = tempfile.mkdtemp()
for i, im in enumerate(gltf.get('images', [])):
    bv = gltf['bufferViews'][im['bufferView']]
    raw = bin_chunk[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    is_png = raw[:4] == b'\x89PNG'
    keep_png = is_png and png_has_alpha(raw)
    inp = os.path.join(tmp, f'i{i}.' + ('png' if is_png else 'jpg'))
    out = os.path.join(tmp, f'o{i}.' + ('png' if keep_png else 'jpg'))
    open(inp, 'wb').write(raw)
    args = ['sips', '-Z', str(max_size)]
    if not keep_png: args += ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85']
    subprocess.run(args + [inp, '--out', out], check=True, capture_output=True)
    new = open(out, 'rb').read()
    if len(new) < len(raw):
        replaced[im['bufferView']] = new
        im['mimeType'] = 'image/png' if keep_png else 'image/jpeg'
    print(f'圖 {i}: {len(raw)/1e6:.1f}MB → {len(replaced.get(im["bufferView"], raw))/1e6:.2f}MB {"(PNG 保留透明)" if keep_png else ""}')

# 重建 BIN：依序寫入每個 bufferView，4 位元組對齊
out_bin = bytearray()
for k, bv in enumerate(gltf['bufferViews']):
    chunk = replaced.get(k)
    if chunk is None:
        off = bv.get('byteOffset', 0)
        chunk = bin_chunk[off:off + bv['byteLength']]
    while len(out_bin) % 4: out_bin += b'\x00'
    bv['byteOffset'] = len(out_bin)
    bv['byteLength'] = len(chunk)
    out_bin += chunk
while len(out_bin) % 4: out_bin += b'\x00'
gltf['buffers'] = [{'byteLength': len(out_bin)}]

js = json.dumps(gltf, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
total = 12 + 8 + len(js) + 8 + len(out_bin)
with open(dst, 'wb') as f:
    f.write(struct.pack('<4sII', b'glTF', 2, total))
    f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
    f.write(struct.pack('<I4s', len(out_bin), b'BIN\x00')); f.write(out_bin)
print(f'完成：{len(data)/1e6:.1f}MB → {total/1e6:.1f}MB  → {dst}')
