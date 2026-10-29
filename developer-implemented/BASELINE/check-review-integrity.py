import hashlib, json, os, sys
from pathlib import Path
root = Path('developer-review')
baseline = json.loads(Path('developer-implemented/BASELINE/developer-review-inventory.json').read_text())
old = {item['path']: (item['size_bytes'], item['sha256']) for item in baseline['files']}
new = {}
for base, dirs, names in os.walk(root):
    dirs.sort(); names.sort()
    for name in names:
        p = Path(base) / name
        if p.is_symlink():
            print('Unexpected symlink:', p); sys.exit(1)
        data = p.read_bytes()
        new[str(p.relative_to(root))] = (len(data), hashlib.sha256(data).hexdigest())
for name in sorted(old.keys() | new.keys()):
    if old.get(name) != new.get(name): print('DIFFERENCE', name, old.get(name), new.get(name))
if old != new:
    sys.exit(1)
print('PASS:', len(old), 'historical files unchanged (paths, sizes, SHA-256)')
