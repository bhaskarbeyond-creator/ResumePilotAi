import zipfile
import os

print("Creating local restore point zip archive...")
zip_filename = "scratch/restore_point_checkpoint17.zip"

excluded_dirs = {'node_modules', '.git', 'dist', 'scratch'}

with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in excluded_dirs]
        for file in files:
            if file.endswith('.zip') or file.endswith('.pyc'):
                continue
            filePath = os.path.join(root, file)
            zipf.write(filePath, os.path.relpath(filePath, '.'))

print(f"Local restore point saved to: {os.path.abspath(zip_filename)}")
