"""
Audit script to check UI entry points, links, and missing components in src/
"""
import os, re

SRC_DIR = r'd:\xampp\htdocs\ai-resume-builder\src'

def search_text(pattern, is_regex=False):
    matches = []
    for root, dirs, files in os.walk(SRC_DIR):
        for f in files:
            if f.endswith('.jsx') or f.endswith('.js'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                    if is_regex:
                        if re.search(pattern, content):
                            matches.append(os.path.relpath(path, SRC_DIR))
                    else:
                        if pattern in content:
                            matches.append(os.path.relpath(path, SRC_DIR))
    return matches

print("1. Components referencing 'signOut':")
for m in search_text('signOut'):
    print(f"   - {m}")

print("\n2. Components with 'Coming Soon' / placeholder text:")
for m in search_text('isCommingSoonShowed'):
    print(f"   - {m}")

print("\n3. Password reset / change password components:")
for m in search_text('Password', is_regex=True):
    print(f"   - {m}")
