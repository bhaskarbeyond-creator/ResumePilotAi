import os, shutil

src_dir = r'd:\xampp\htdocs\ai-resume-builder\scratch\system_fonts'
dest_dir = r'd:\xampp\htdocs\ai-resume-builder\backend\fonts'

os.makedirs(dest_dir, exist_ok=True)

files = os.listdir(src_dir)
for f in files:
    src_path = os.path.join(src_dir, f)
    dest_path = os.path.join(dest_dir, f)
    shutil.copy2(src_path, dest_path)
    print(f'Copied {f} to backend/fonts/')

print(f'Total {len(files)} font files copied to backend/fonts/')
