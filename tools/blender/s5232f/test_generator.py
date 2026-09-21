"""Run inside Blender: validates reruns in the same session and linked mesh reuse."""
from pathlib import Path
import hashlib
import runpy
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from config import qsfp_position
from validate_s5232f import validate_glb

assert len({qsfp_position(i) for i in range(1, 33)}) == 32
for bad in (0, 33):
    try: qsfp_position(bad)
    except ValueError: pass
    else: raise AssertionError("Invalid physical port accepted")
module = runpy.run_path(str(HERE / "generate_s5232f.py"))
glb = HERE.parents[2] / "public/assets/models/switches/powerswitch-s5232f-on.glb"
module["main"]()
first = hashlib.sha256(glb.read_bytes()).hexdigest()
module["main"]()
assert hashlib.sha256(glb.read_bytes()).hexdigest() == first, "GLB is not deterministic"
assert validate_glb(glb)["counts"]["qsfp28"] == 32
print(f"VERIFIED: same-session idempotence and byte-identical GLB {first}")
