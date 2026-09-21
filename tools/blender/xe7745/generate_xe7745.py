"""Generate the complete exterior and internal XE7745 asset."""

from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from generate_xe7745_exterior import main


if __name__ == "__main__":
    main(include_internals=True)
