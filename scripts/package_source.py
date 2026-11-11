"""Create a reviewable source archive without credentials, output, or Site identity."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
archive = root / 'public' / 'quotefollow-source.zip'
allowed = ['README.md', 'package.json', 'package-lock.json', '.env.example', '.gitignore',
           'index.html', 'vite.config.js', '.github', 'src', 'server', 'shared', 'supabase', 'tests', 'scripts', 'docs', 'public/favicon.svg']
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    for name in allowed:
        p = root / name
        for f in sorted(p.rglob('*')) if p.is_dir() else [p]:
            if f.is_symlink():
                raise RuntimeError('Refusing symlink')
            if f.is_file() and '__pycache__' not in f.parts:
                z.write(f, 'quotefollow/' + f.relative_to(root).as_posix())
print(f'Created {archive.name}: {archive.stat().st_size:,} bytes')
