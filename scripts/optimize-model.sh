#!/usr/bin/env bash
# Rebuild a raw Blender/CAD .glb export into a web-ready asset.
#
#   ./scripts/optimize-model.sh ~/Downloads/Cylinder_clean.glb static/models/cylinder.glb
#
# Re-run this on every re-export from the 3D artist — never hand-optimise in
# Blender, or the work is lost the next time the model changes.
set -euo pipefail

IN="${1:?usage: optimize-model.sh <input.glb> <output.glb>}"
OUT="${2:?usage: optimize-model.sh <input.glb> <output.glb>}"
GT="npx --yes @gltf-transform/cli@4"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mb() { echo "scale=2; $(stat -f%z "$1" 2>/dev/null || stat -c%s "$1")/1000000" | bc; }

echo "input      $(mb "$IN") MB"

# dedup MUST precede instance: the exporter gives every node its own unique
# mesh object, so the instancer cannot see the repetition until identical
# meshes are collapsed into shared references.
$GT dedup    "$IN"        "$TMP/1.glb" >/dev/null
$GT instance "$TMP/1.glb" "$TMP/2.glb" >/dev/null   # -> EXT_mesh_gpu_instancing
$GT prune    "$TMP/2.glb" "$TMP/3.glb" >/dev/null   # drops unread UVs & orphans
$GT weld     "$TMP/3.glb" "$TMP/4.glb" >/dev/null
$GT reorder  "$TMP/4.glb" "$TMP/5.glb" >/dev/null   # vertex-cache locality
$GT meshopt  "$TMP/5.glb" "$OUT" --level high >/dev/null

# NOTE: deliberately no `simplify` — it collapses the hard edges that make
# machined CAD surfaces read correctly. Add it only for distant LODs.

echo "output     $(mb "$OUT") MB"
