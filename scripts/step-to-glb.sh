#!/usr/bin/env bash
# Convert an NX STEP export (.stp/.step) into a web-ready .glb.
#
#   ./scripts/step-to-glb.sh "src/lib/cad files/Mark-0.stp" static/models/cad/mark-0.glb [deflection]
#   ./scripts/step-to-glb.sh "src/lib/cad files/Mark-0.stp" static/models/cad/mark-0.parts.glb 0.0008 --parts
#   ./scripts/step-to-glb.sh "src/lib/cad files/Mark-0.stp" static/models/cad/mark-0.glb 0.0004 --tags scripts/cad-tags/mark-0.json
#
# deflection is the tessellation tolerance as a fraction of the model's
# bounding-box diagonal (default 0.0004). Lower is finer and heavier.
# --parts gives every body its own node (p00001, …) for the tagging tool.
# --tags <file> regroups the parts by that tool's saved tags (apply-cad-tags.mjs),
# then simplifies and merges each group into one mesh for the site (web-model.mjs).
#
# Uses native OpenCascade (cadquery-ocp) rather than the WASM build: the
# WASM heap stops at 4 GB, and the larger NX assemblies need more than that.
# The Python environment is created on first run in node_modules/.cache.
set -euo pipefail

USAGE="usage: step-to-glb.sh <input.stp> <output.glb> [deflection] [--parts | --tags <file>]"
IN="${1:?$USAGE}"
OUT="${2:?$USAGE}"
DEFL="${3:-0.0004}"
MODE="${4:-}"
TAGS="${5:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
VENV="$HERE/../node_modules/.cache/cad-venv"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$MODE" in
	"" | --parts) ;;
	--tags) [ -f "$TAGS" ] || { echo "no tags file: $TAGS"; exit 1; } ;;
	*) echo "$USAGE"; exit 1 ;;
esac

if [ ! -x "$VENV/bin/python" ]; then
	echo "setting up OpenCascade (one-off, ~170 MB)"
	python3 -m venv "$VENV"
	"$VENV/bin/pip" install -q --upgrade pip
	"$VENV/bin/pip" install -q cadquery-ocp
fi

"$VENV/bin/python" "$HERE/step_to_glb.py" "$IN" "$TMP/raw.glb" "$DEFL" ${MODE:+--parts}
node "$HERE/gltf-zup-to-yup.mjs" "$TMP/raw.glb" "$TMP/yup.glb"
if [ -n "$MODE" ]; then
	node "$HERE/gltf-unique-parts.mjs" "$TMP/yup.glb" "$TMP/unique.glb"
	mv "$TMP/unique.glb" "$TMP/yup.glb"
fi
if [ "$MODE" = "--tags" ]; then
	node "$HERE/apply-cad-tags.mjs" "$TMP/yup.glb" "$TAGS" "$TMP/tagged.glb"
	node --max-old-space-size=16000 "$HERE/web-model.mjs" "$TMP/tagged.glb" "$TMP/yup.glb"
fi
mkdir -p "$(dirname "$OUT")"
# Part nodes (the tool) and group nodes (the site) must survive, so
# instancing, which folds repeated nodes together, stays off.
bash "$HERE/optimize-model.sh" "$TMP/yup.glb" "$OUT" ${MODE:+--keep-nodes}
