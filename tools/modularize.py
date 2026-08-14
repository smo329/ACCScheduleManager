from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
html = INDEX.read_text(encoding="utf-8")

style_match = re.search(r"<style>(.*?)</style>", html, re.S)
if not style_match:
    raise SystemExit("No inline <style> block found")
css = style_match.group(1).strip() + "\n"

# Find inline script blocks and choose the largest one as the main application code.
script_matches = list(re.finditer(r"<script([^>]*)>(.*?)</script>", html, re.S))
inline_scripts = [m for m in script_matches if "src=" not in m.group(1).lower()]
if not inline_scripts:
    raise SystemExit("No inline application script found")
app_match = max(inline_scripts, key=lambda m: len(m.group(2)))
app_js = app_match.group(2).strip() + "\n"

lines = app_js.splitlines()
sections = {}
for i, line in enumerate(lines):
    if line.strip() == "/* =========================================================" and i + 1 < len(lines):
        sections[lines[i + 1].strip()] = i

for required in ["RENDERING", "WEEK SUBMISSION / LOCKING", "ACCOUNT MANAGER"]:
    if required not in sections:
        raise SystemExit(f"Missing expected section: {required}")

i_render = sections["RENDERING"]
i_workflow = sections["WEEK SUBMISSION / LOCKING"]
i_account = sections["ACCOUNT MANAGER"]

chunks = {
    "core.js": "\n".join(lines[:i_render]).strip() + "\n",
    "schedule.js": "\n".join(lines[i_render:i_workflow]).strip() + "\n",
    "workflow.js": "\n".join(lines[i_workflow:i_account]).strip() + "\n",
    "admin.js": "\n".join(lines[i_account:]).strip() + "\n",
}

assets = ROOT / "assets"
js_dir = assets / "js"
js_dir.mkdir(parents=True, exist_ok=True)
(assets / "styles.css").write_text(css, encoding="utf-8")
for name, content in chunks.items():
    (js_dir / name).write_text(content, encoding="utf-8")

# Replace inline CSS with the stylesheet link.
shell = html[:style_match.start()] + '<link rel="stylesheet" href="assets/styles.css">' + html[style_match.end():]

# Re-find the largest inline script in the modified shell before replacing it.
script_matches2 = list(re.finditer(r"<script([^>]*)>(.*?)</script>", shell, re.S))
inline_scripts2 = [m for m in script_matches2 if "src=" not in m.group(1).lower()]
app_match2 = max(inline_scripts2, key=lambda m: len(m.group(2)))

external_scripts = "\n".join([
    '<script src="assets/js/core.js"></script>',
    '<script src="assets/js/schedule.js"></script>',
    '<script src="assets/js/workflow.js"></script>',
    '<script src="assets/js/admin.js"></script>',
])
shell = shell[:app_match2.start()] + external_scripts + shell[app_match2.end():]

# Keep the post-load patch file last. If it already exists in index.html, leave it in place.
if 'assets/app-patches.js' not in shell:
    shell = shell.replace('</body>', '<script src="assets/app-patches.js"></script>\n</body>')

INDEX.write_text(shell, encoding="utf-8")

# Syntax-check generated JS files when Node is available.
for name in chunks:
    path = js_dir / name
    result = subprocess.run(["node", "--check", str(path)], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"Syntax check failed for {name}:\n{result.stderr}")

print("Modularization complete")
for path in [INDEX, assets / "styles.css", *(js_dir / n for n in chunks)]:
    print(path.relative_to(ROOT), path.stat().st_size)
