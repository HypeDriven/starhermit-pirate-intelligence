#!/usr/bin/env python3
"""Prepare the pinned CPU model and its index; only needed by maintainers."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REVISION = '476854d00ede130660aba430d15f9347ad2e7d0e'
URL = f'https://huggingface.co/QuantFactory/SmolLM2-135M-Instruct-GGUF/resolve/{REVISION}/SmolLM2-135M-Instruct.Q8_0.gguf'
SHA256 = '40f7094960b6ede829145d102ca79451b364b27d9d8694d4406e002024cff357'
MODEL = ROOT / 'models/smollm2-135m-q8.gguf'
MODEL.parent.mkdir(exist_ok=True)
if not MODEL.exists():
    urllib.request.urlretrieve(URL, MODEL)
with MODEL.open('rb') as f:
    digest = hashlib.file_digest(f, 'sha256').hexdigest()
if digest != SHA256:
    raise SystemExit('Model SHA-256 mismatch; remove the incomplete model and retry.')

with MODEL.open('rb') as f:
    def unpack(fmt):
        return struct.unpack('<' + fmt, f.read(struct.calcsize('<' + fmt)))[0]
    def string():
        return f.read(unpack('Q')).decode('utf-8')
    def value(t):
        if t == 8:
            return string()
        if t == 9:
            kind, count = unpack('I'), unpack('Q')
            return [value(kind) for _ in range(count)]
        return unpack({0:'B',1:'b',2:'H',3:'h',4:'I',5:'i',6:'f',7:'?',10:'Q',11:'q',12:'d'}[t])
    assert f.read(4) == b'GGUF' and unpack('I') == 3
    tensors, count = unpack('Q'), unpack('Q')
    meta = {}
    for _ in range(count):
        key = string()
        meta[key] = value(unpack('I'))
    index = {}
    for _ in range(tensors):
        name = string()
        dims = [unpack('Q') for _ in range(unpack('I'))]
        kind, offset = unpack('I'), unpack('Q')
        assert kind in (0, 8), (name, kind)
        index[name] = {'shape':dims, 'type':kind, 'offset':offset}
    alignment = meta.get('general.alignment', 32)
    start = (f.tell() + alignment - 1) // alignment * alignment
    for t in index.values():
        t['offset'] += start
    assert meta['llama.embedding_length'] == 576
    assert meta['llama.attention.head_count'] == 9
    assert meta['llama.attention.head_count_kv'] == 3
    assert meta['llama.block_count'] == 30
    assert meta['llama.rope.dimension_count'] == 64
    tokenizer = {'tokens':meta['tokenizer.ggml.tokens'], 'merges':meta['tokenizer.ggml.merges']}
    (ROOT/'models/tokenizer.json').write_text(json.dumps(tokenizer, separators=(',',':')))

out = {'path':'models/smollm2-135m-q8.gguf', 'sha256':digest, 'bytes':MODEL.stat().st_size,
       'source':URL, 'tensors':index, 'ropeTheta':meta.get('llama.rope.freq_base',100000),
       'epsilon':meta.get('llama.attention.layer_norm_rms_epsilon',0.00001)}
(ROOT/'models/index.json').write_text(json.dumps(out,separators=(',',':'))+'\n')
subprocess.run(['rustc', str(ROOT/'tools/brain-kernel.rs'), '--target','wasm32-unknown-unknown',
               '-C','strip=symbols','--crate-type','cdylib','--edition','2021','-O','-C','panic=abort',
               '-C','target-feature=+simd128','-C','link-arg=--initial-memory=268435456',
               '-C','link-arg=--max-memory=268435456','-o',str(ROOT/'models/kernel.wasm')],check=True)
print(f'Prepared {MODEL.stat().st_size/1048576:.1f} MiB model, sha256={digest}')
