"""Zips what the Colab notebook needs. Run after generate.py: python training/pack.py"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')
FILES = [f'{m}.{s}.jsonl' for m in ('router', 'actor', 'checker') for s in ('train', 'eval')] + ['prompts.json']

with zipfile.ZipFile(os.path.join(HERE, 'upload.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
    for f in FILES:
        z.write(os.path.join(DATA, f), f)
    z.write(os.path.join(HERE, 'tools.json'), 'tools.json')
print('training/upload.zip:', ', '.join(FILES + ['tools.json']))
