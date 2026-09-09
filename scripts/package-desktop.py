#!/usr/bin/env python3
"""Bundle the executable, Qt plugins and their linked libraries (not glibc)."""
import os,pathlib,re,shutil,subprocess,sys,tarfile
root=pathlib.Path(__file__).resolve().parents[1]
version='1.0.0';out=root/'dist'/f'fund-funeral-{version}-linux-x86_64'
if out.exists():shutil.rmtree(out)
(out/'bin').mkdir(parents=True);(out/'lib').mkdir();(out/'plugins').mkdir();(out/'share').mkdir()
shutil.copy2(root/'build/fund-funeral',out/'bin/fund-funeral')
(out/'bin/qt.conf').write_text('[Paths]\nPrefix=..\nPlugins=plugins\nLibraries=lib\n')
qt=shutil.which('qtpaths6') or shutil.which('qtpaths')
plugin_dir=pathlib.Path(subprocess.check_output([qt,'--plugin-dir'],text=True).strip()) if qt else pathlib.Path(subprocess.check_output(['qmake6','-query','QT_INSTALL_PLUGINS'],text=True).strip())
for category in ['platforms','platformthemes','wayland-shell-integration','wayland-decoration-client','wayland-graphics-integration-client','imageformats','iconengines','sqldrivers','tls','xcbglintegrations']:
    source=plugin_dir/category
    if source.exists():shutil.copytree(source,out/'plugins'/category)
# Only SQLite is used; unused database drivers would pull database client stacks.
for path in (out/'plugins/sqldrivers').glob('*'):
    if 'sqlite' not in path.name:path.unlink()
exclude=re.compile(r'^(ld-linux|libc\.|libm\.|libpthread\.|libdl\.|librt\.|libresolv\.|libnss_|libutil\.|libanl\.)')
queue=[out/'bin/fund-funeral',pathlib.Path(shutil.which('openssl')),*list((out/'plugins').rglob('*.so'))];seen=set()
while queue:
    file=queue.pop()
    result=subprocess.run(['ldd',str(file)],text=True,capture_output=True,check=False)
    for line in result.stdout.splitlines():
        match=re.search(r'^\s*(\S+) => (/\S+)',line)
        if not match:continue
        name,path=match.groups();name=os.path.basename(name)
        if exclude.match(name) or name in seen:continue
        seen.add(name);dest=out/'lib'/name;shutil.copy2(path,dest);queue.append(dest)
shutil.copy2(root/'assets/icon.png',out/'share/fund-funeral.png')
(out/'share/fonts.conf').write_text('''<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>/usr/share/fonts</dir><dir>/usr/local/share/fonts</dir><dir prefix="xdg">fonts</dir><dir>~/.fonts</dir><cachedir prefix="xdg">fund-funeral/fontconfig</cachedir><alias><family>sans-serif</family><prefer><family>Noto Sans</family><family>DejaVu Sans</family></prefer></alias><alias><family>monospace</family><prefer><family>Noto Sans Mono</family><family>DejaVu Sans Mono</family></prefer></alias></fontconfig>''')
for name in ['install.sh','uninstall.sh']:shutil.copy2(root/'scripts'/name,out/name)
for name in ['LICENSE','README.md','THIRD_PARTY.md']:shutil.copy2(root/name,out/name)
(out/'AppRun').write_text('''#!/usr/bin/env sh
set -eu
app_dir=$(CDPATH= cd -- "$(dirname -- "$(readlink -f -- "$0")")" && pwd)
export LD_LIBRARY_PATH="$app_dir/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export FONTCONFIG_FILE="${FONTCONFIG_FILE:-$app_dir/share/fonts.conf}"
export QT_PLUGIN_PATH="$app_dir/plugins"
export QT_QPA_PLATFORM_PLUGIN_PATH="$app_dir/plugins/platforms"
exec "$app_dir/bin/fund-funeral" "$@"
''')
(out/'AppRun').chmod(0o755)
with tarfile.open(str(out)+'.tar.gz','w:gz') as tar:tar.add(out,arcname=out.name)
print(out)
