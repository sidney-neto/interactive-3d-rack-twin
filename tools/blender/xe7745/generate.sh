#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BLENDER_EXEC="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
if [[ ! -x "$BLENDER_EXEC" ]]; then
  printf 'Blender executable not found: %s\nSet BLENDER_BIN to the Blender executable path.\n' "$BLENDER_EXEC" >&2
  exit 1
fi
exec "$BLENDER_EXEC" --background --factory-startup --python-exit-code 1 \
  --python "$SCRIPT_DIR/generate_xe7745.py"
