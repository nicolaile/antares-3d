"""Still renders of the converted CAD models, in the moodboard looks.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render/render.py -- \\
        [shot ...] [--shots file.json] [--out dir] [--scale percent] [--save] [--clay]

Shots come from scripts/render/shots.json unless --shots names another
list; with no shot names given, every shot in the list renders. Output goes
to renders/<shot>.png, or --out, alongside a contact-sheet.png of the batch.
--scale overrides every shot's resolution percentage for quick previews.
--save also writes <shot>.blend, to open in Blender and tune by hand before
copying the numbers back into the shot list. --clay renders every surface
18% grey to check the lighting balance on its own.

The scene is built from scratch on every run so a look is defined only in
this file, never in a hand-edited .blend that drifts from it. Consecutive
shots of the same model share one import, so order a list by model.
"""
import hashlib
import json
import math
import os
import re
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

# Named groups of the CAD's own materials. The STEP files carry no useful
# part names, but each part keeps its NX colour, which the converter turns
# into mat_<n>. These were found by where each colour's geometry sits in
# the model, so re-check them after a model is re-exported from NX.
# A colour can also be reused elsewhere, so a part may limit itself to a
# height band (world z, metres); faces of that colour outside it stay plain.
PARTS = {
    "mark-0": {
        # r < 0.56 m, z 0.5–2.1 m: the fuel blocks of the hex core. The drive
        # motors on top share the colour, hence the band.
        "core": {"materials": ["mat_0"], "z": [0.3, 2.3]},
        # The vessel wall: upper shell, and the lower shell's two halves. The
        # CAD draws them in different colours, but they read as one vessel,
        # so they share one finish — that of `shell_finish` (default upper).
        "shell": ["mat_48", "mat_40", "mat_52"],
        # Other pieces drawn in two halves that should read as one: the
        # base ring and its nuts.
        "matched": [["mat_22", "mat_42"], ["mat_39", "mat_43"]],
        # Where the upper and lower shells meet the stiffening ring, 1.50 m
        # up, between radii 1.10 and 1.25 m from the vessel axis.
        "welds": [{"z": 1.50, "r": [1.09, 1.26]}],
        # Nameplates on the vessel wall: azimuth (degrees, world), height
        # (m), and which plate.
        "plates": [
            {"azimuth": 45, "z": 2.05, "kind": "nameplate"},
            {"azimuth": 18, "z": 2.2, "kind": "caution"},
            {"azimuth": 215, "z": 2.05, "kind": "nameplate"},
            {"azimuth": 120, "z": 0.75, "kind": "caution"},
        ],
    },
}

# Models built from others, in import order. Mark-1 is Mark-0 with the power
# conversion system's heat exchanger stacked on its deck, joined as the site
# joins them (numbers from src/lib/three/assembly.ts): Mark-0 turns 30° so
# the heat pipes meet, drops its drive motors, and the exchanger, its heat
# pipe ends and outlet pipe rise 0.39 m; a filler tube closes the gap that
# leaves in the down pipe. Parts tagged `remove` (scripts/cad-tags) go too,
# and so does the exchanger's stand (`standalone`), which the stack replaces.
ASSEMBLIES = {
    "mark-1": {
        "models": {
            "mark-0": {"turn": -30, "drop": ["remove", "f2_drives"]},
            "power-conversion-system": {
                "drop": ["remove", "standalone"],
                "lift": {"by": 0.39, "groups": ["f5_phx", "f4_heatpipes"], "parts": ["p06285", "p06286", "p06293"]},
            },
        },
        # glTF −z is Blender +y.
        "filler": {"x": 0.56, "y": 1.27, "from": 4.32, "length": 0.41, "radius": 0.11},
    },
}
# Mark-0's materials keep their names in the stack, so its parts carry over.
PARTS["mark-1"] = PARTS["mark-0"]


# The material names the finishes (and PARTS) are keyed on, by CAD colour
# (linear, 2 dp). Re-exports can renumber mat_<n>, which would reshuffle
# every part's finish; renaming by colour on import keeps the approved look.
LEGACY_NAMES = {
    "mark-0": [
        ("mat_0", (0.13, 0.13, 0.13)),
        ("mat_1", (0.33, 0.39, 0.41)),
        ("mat_10", (1.0, 0.0, 0.0)),
        ("mat_11", (0.87, 0.6, 0.24)),
        ("mat_12", (0.47, 0.62, 0.55)),
        ("mat_13", (0.13, 0.6, 1.0)),
        ("mat_14", (1.0, 0.32, 0.0)),
        ("mat_15", (1.0, 0.91, 0.39)),
        ("mat_16", (1.0, 0.35, 0.05)),
        ("mat_17", (0.0, 0.0, 0.0)),
        ("mat_18", (0.87, 0.06, 0.04)),
        ("mat_19", (0.74, 0.74, 0.74)),
        ("mat_2", (0.07, 0.07, 0.07)),
        ("mat_20", (0.32, 0.49, 0.67)),
        ("mat_21", (0.13, 0.53, 0.09)),
        ("mat_22", (0.0, 0.43, 0.87)),
        ("mat_23", (0.56, 0.39, 0.27)),
        ("mat_24", (0.6, 0.6, 0.6)),
        ("mat_25", (0.75, 0.54, 0.06)),
        ("mat_26", (0.25, 0.47, 1.0)),
        ("mat_27", (0.64, 0.45, 0.34)),
        ("mat_28", (1.0, 0.59, 0.0)),
        ("mat_29", (0.43, 0.71, 0.71)),
        ("mat_3", (0.13, 0.13, 0.6)),
        ("mat_30", (0.23, 0.35, 0.43)),
        ("mat_31", (0.53, 0.64, 0.75)),
        ("mat_32", (0.18, 0.14, 0.3)),
        ("mat_33", (0.26, 0.24, 0.15)),
        ("mat_34", (0.0, 0.3, 0.16)),
        ("mat_35", (0.02, 0.02, 0.02)),
        ("mat_36", (0.32, 1.0, 0.59)),
        ("mat_37", (0.04, 0.26, 0.27)),
        ("mat_38", (0.0, 0.0, 0.0)),
        ("mat_39", (0.32, 0.13, 0.13)),
        ("mat_4", (1.0, 0.4, 1.0)),
        ("mat_40", (0.44, 0.18, 0.29)),
        ("mat_41", (0.6, 0.79, 0.58)),
        ("mat_42", (0.51, 1.0, 1.0)),
        ("mat_43", (0.58, 0.31, 0.13)),
        ("mat_44", (0.22, 0.47, 0.55)),
        ("mat_45", (0.62, 0.32, 0.33)),
        ("mat_46", (0.96, 0.57, 0.35)),
        ("mat_47", (0.24, 0.17, 0.12)),
        ("mat_48", (0.91, 0.52, 0.69)),
        ("mat_49", (1.0, 0.13, 0.13)),
        ("mat_5", (0.0, 0.0, 1.0)),
        ("mat_50", (1.0, 1.0, 1.0)),
        ("mat_51", (0.77, 0.65, 0.34)),
        ("mat_52", (0.25, 0.06, 0.13)),
        ("mat_53", (0.32, 0.32, 0.32)),
        ("mat_54", (0.0, 0.0, 0.53)),
        ("mat_6", (0.6, 1.0, 0.13)),
        ("mat_7", (0.79, 0.71, 0.07)),
        ("mat_8", (0.03, 0.03, 0.03)),
        ("mat_9", (0.21, 0.21, 0.21)),
    ],
}


def srgb_to_linear(hex_colour):
    c = np.array([int(hex_colour[i : i + 2], 16) / 255 for i in (1, 3, 5)])
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


# ---------------------------------------------------------------- scene


class Model:
    """The imported model, kept between shots of the same model."""

    current = None

    def __init__(self, name):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.name = name
        if name in ASSEMBLIES:
            self.assemble(ASSEMBLIES[name])
        else:
            bpy.ops.import_scene.gltf(filepath=self.source(name))
            self.restore_names(name)
        self.meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        # The CAD material in each slot, before any look replaces it.
        self.split_parts()
        self.slots = {o: [s.material.name for s in o.material_slots] for o in self.meshes}
        for o in self.meshes:
            for s in o.material_slots:
                s.material.use_fake_user = True
        self.lo, self.hi = Vector((math.inf,) * 3), Vector((-math.inf,) * 3)
        for o in self.meshes:
            for corner in o.bound_box:
                p = o.matrix_world @ Vector(corner)
                self.lo = Vector(map(min, self.lo, p))
                self.hi = Vector(map(max, self.hi, p))
        self.full_lo, self.full_hi = self.lo.copy(), self.hi.copy()
        # The reactor's own bounds, which its finishes are placed by: the
        # whole model, or in an assembly the first model's.
        self.reactor = getattr(self, "reactor", None) or (self.full_lo.copy(), self.full_hi.copy())
        self.base = {o: o.matrix_world.copy() for o in self.meshes}
        self.boxes = {}
        for o in self.meshes:
            pts = np.array([o.matrix_world @ Vector(c) for c in o.bound_box])
            self.boxes[o] = (pts.min(0), pts.max(0))
        self.components = self.find_components()

    def find_components(self):
        """Which component each part belongs to, from the site's tagging
        (scripts/cad-tags/<model>.json: group → part ids, which are the
        object names in the parts file). Parts the tagging leaves out
        (fasteners, hidden internals, untagged) go with their nearest
        tagged neighbour, so a bolt travels with what it holds."""
        from mathutils.kdtree import KDTree
        group = getattr(self, "tags", None)
        if group is None:
            path = os.path.join(ROOT, "scripts", "cad-tags", f"{self.name}.json")
            if not os.path.exists(path):
                return {}
            with open(path) as f:
                tags = json.load(f)["groups"]
            group = {pid: g for g, ids in tags.items() if g != "remove" for pid in ids}
        tagged = [o for o in self.meshes if o.name in group]
        # Each tagged part as its box corners and centre: a rough surface
        # to measure "nearest" against, so a bolt on a big plate finds the
        # plate rather than a small part whose centre happens to be closer.
        points = []
        for o in tagged:
            lo, hi = self.boxes[o]
            for x in (lo[0], hi[0]):
                for y in (lo[1], hi[1]):
                    for z in (lo[2], hi[2]):
                        points.append(((x, y, z), group[o.name]))
            points.append((tuple((lo + hi) / 2), group[o.name]))
        tree = KDTree(len(points))
        for i, (co, _) in enumerate(points):
            tree.insert(co, i)
        tree.balance()
        out = {}
        for o in self.meshes:
            if o.name in group:
                out[o] = group[o.name]
            else:
                lo, hi = self.boxes[o]
                out[o] = points[tree.find(tuple((lo + hi) / 2))[1]][1]
        return out

    def arrange(self, spec):
        """Show, hide and move components for one shot (see shot "parts"):

        - "show": component ids to keep; everything else is hidden.
        - "unit": keep one copy of a repeated component, e.g. one of the 12
          drive units: {"group", "index", "count", "start"} picks the part
          sector at start + index * 360/count degrees around the vertical
          axis.
        - "explode": component → [dx, dy, dz] metres to move it.
        - "radial": component → metres to push it outwards from the axis,
          each part along its own direction, so a ring of units opens up.
        - "split": new name → {"group", "z_above" | "z_below"}: carve a
          component by height (metres, as modelled), e.g. the drive heads
          off the top of their drums, so the pieces can move separately.
        - "lay": lay the model on its side, its vertical axis along +x,
          after exploding, for a horizontal exploded view.

        Framing then fits what's visible, so the camera spec of a shot
        works the same on one part as on the whole model.
        """
        cx = (self.full_lo.x + self.full_hi.x) / 2
        cy = (self.full_lo.y + self.full_hi.y) / 2
        show = set(spec.get("show", []))
        unit = spec.get("unit")
        explode = spec.get("explode", {})
        radial = spec.get("radial", {})
        split = spec.get("split", {})
        centre = (np.array(self.full_lo) + np.array(self.full_hi)) / 2
        lay = Matrix.Identity(4)
        tilt = spec.get("tilt")
        if tilt and tilt.get("angle"):
            # Rotate the whole (exploded) model as one body about an axis
            # through a pivot, for animated turns under fixed lights.
            pivot = Vector(tilt.get("pivot", centre))
            lay = (Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(tilt["angle"]), 4, Vector(tilt["axis"]))
                   @ Matrix.Translation(-pivot))
        if spec.get("lay"):
            pivot = Vector(centre)
            lay = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(90), 4, "Y") @ Matrix.Translation(-pivot)
        lo, hi = np.full(3, math.inf), np.full(3, -math.inf)
        for o in self.meshes:
            g = self.components.get(o, "untagged")
            blo, bhi = self.boxes[o]
            c = (blo + bhi) / 2
            for name, rule in split.items():
                if g == rule["group"] and (c[2] > rule.get("z_above", -math.inf)) and (c[2] < rule.get("z_below", math.inf)):
                    g = name
                    break
            az = math.degrees(math.atan2(c[1] - cy, c[0] - cx)) % 360
            visible = not show or g in show
            if unit and visible:
                step = 360 / unit.get("count", 12)
                centre = unit.get("start", 15) + unit.get("index", 0) * step
                off = (az - centre + 180) % 360 - 180
                visible = g == unit["group"] and abs(off) <= step / 2
            o.hide_render = not visible
            move = np.array(explode.get(g, (0, 0, 0)), dtype=float)
            if g in radial:
                d = np.array([c[0] - cx, c[1] - cy, 0.0])
                n = np.linalg.norm(d)
                if n > 1e-6:
                    move = move + d / n * radial[g]
            o.matrix_world = lay @ Matrix.Translation(Vector(move)) @ self.base[o]
            if visible:
                corners = np.array([lay @ Vector((x, y, z)) for x in (blo[0], bhi[0]) for y in (blo[1], bhi[1])
                                    for z in (blo[2], bhi[2])]) + np.array(lay.to_3x3() @ Vector(move))
                lo = np.minimum(lo, corners.min(0))
                hi = np.maximum(hi, corners.max(0))
        if np.isfinite(lo).all():
            self.lo, self.hi = Vector(lo), Vector(hi)
        else:
            self.lo, self.hi = self.full_lo.copy(), self.full_hi.copy()
        bpy.context.view_layer.update()

    @staticmethod
    def source(name):
        # Renders want full CAD detail and the original per-colour
        # materials (which the finishes are keyed on). The site's
        # <name>.glb is a simplified, merged web model, so prefer the
        # full-detail <name>.parts.glb next to it when there is one.
        cad = os.path.join(ROOT, "static", "models", "cad")
        full = os.path.join(cad, f"{name}.parts.glb")
        return full if os.path.exists(full) else os.path.join(cad, f"{name}.glb")

    def assemble(self, spec):
        """Import several models into one frame (see ASSEMBLIES)."""
        # Each part's component, by its name in the scene, for find_components.
        self.tags = {}
        for name, rule in spec["models"].items():
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=self.source(name))
            # Each model's materials are renamed before the next import, so
            # a later model's clashing mat_<n> gets the .001 suffix instead.
            self.restore_names(name)
            new = [o for o in bpy.data.objects if o not in before]
            with open(os.path.join(ROOT, "scripts", "cad-tags", f"{name}.json")) as f:
                tags = json.load(f)["groups"]
            # Part ids are the object names, less any suffix a clash added.
            group = {pid: g for g, ids in tags.items() for pid in ids}
            group_of = lambda o: group.get(o.name.split(".")[0])
            for o in [o for o in new if o.type == "MESH" and group_of(o) in rule.get("drop", [])]:
                new.remove(o)
                bpy.data.objects.remove(o)
            turn = Matrix.Rotation(math.radians(rule.get("turn", 0)), 4, "Z")
            for o in new:
                if o.parent is None:
                    o.matrix_world = turn @ o.matrix_world
            bpy.context.view_layer.update()
            lift = rule.get("lift")
            if lift:
                up = Matrix.Translation((0, 0, lift["by"]))
                for o in new:
                    if o.type == "MESH" and (group_of(o) in lift["groups"] or o.name.split(".")[0] in lift["parts"]):
                        o.matrix_world = up @ o.matrix_world
            bpy.context.view_layer.update()
            self.tags.update({o.name: group_of(o) for o in new if o.type == "MESH" and group_of(o)})
            if not hasattr(self, "reactor"):
                pts = np.array([o.matrix_world @ Vector(c) for o in new if o.type == "MESH" for c in o.bound_box])
                self.reactor = (Vector(pts.min(0)), Vector(pts.max(0)))
        pipe = spec.get("filler")
        if pipe:
            # A plain open tube, in the finish of the pipe it continues.
            centre = Vector((pipe["x"], pipe["y"], pipe["from"] + pipe["length"] / 2))
            nearest = min((o for o in bpy.data.objects if o.type == "MESH" and o.material_slots),
                          key=lambda o: (o.matrix_world @ (sum((Vector(c) for c in o.bound_box), Vector()) / 8)
                                         - centre).length)
            bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=pipe["radius"], depth=pipe["length"],
                                                end_fill_type="NOTHING", location=centre)
            tube = bpy.context.active_object
            tube.name = "filler"
            tube.data.materials.append(nearest.material_slots[0].material)
            bpy.ops.object.shade_smooth()

    def restore_names(self, name):
        legacy = LEGACY_NAMES.get(name)
        if not legacy:
            return
        used = set()
        mats = [m for m in bpy.data.materials if m.node_tree and "Principled BSDF" in m.node_tree.nodes]
        for m in mats:
            m.name = f"cad-{m.name}"
        for m in mats:
            c = tuple(round(x, 2) for x in m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value[:3])
            match = next((n for n, col in legacy if n not in used and all(abs(a - b) < 0.006 for a, b in zip(col, c))), None)
            if match:
                used.add(match)
                m.name = match
            else:
                print(f"no legacy name for {m.name} {c}")

    def split_parts(self):
        """Move faces outside a part's height band onto a '<mat>~outside' copy
        of their material, so only the part itself matches by name."""
        for part in PARTS.get(self.name, {}).values():
            if "z" not in part:
                continue
            z0, z1 = part["z"]
            for o in self.meshes:
                me = o.data
                names = [s.material.name for s in o.material_slots]
                n = len(me.polygons)
                index = np.empty(n, np.int32)
                me.polygons.foreach_get("material_index", index)
                centre = np.empty(n * 3, np.float32)
                me.polygons.foreach_get("center", centre)
                m = np.array(o.matrix_world)
                z = centre.reshape(-1, 3) @ m[2, :3] + m[2, 3]
                for name in part["materials"]:
                    if name not in names:
                        continue
                    outside = (index == names.index(name)) & ((z < z0) | (z > z1))
                    if not outside.any():
                        continue
                    copy = bpy.data.materials.get(f"{name}~outside") or bpy.data.materials[name].copy()
                    copy.name = f"{name}~outside"
                    me.materials.append(copy)
                    index[outside] = len(me.materials) - 1
                me.polygons.foreach_set("material_index", index)
                me.update()

    @classmethod
    def load(cls, name):
        if not cls.current or cls.current.name != name:
            cls.current = cls(name)
        return cls.current

    def corners(self):
        return [Vector((x, y, z)) for x in (self.lo.x, self.hi.x) for y in (self.lo.y, self.hi.y) for z in (self.lo.z, self.hi.z)]


def place_camera(shot, model):
    """Aim at the model and frame it.

    `focus` picks the aim point as fractions of the bounding box (0.5 is the
    middle) so crops carry across models of any size; `offset` then nudges
    it in metres. Framing fits the whole model, then `zoom` crops in.
    `position`, in the same fractions, instead puts the camera at an exact
    spot — inside the model, for instance — still looking at `focus`.
    """
    c = shot["camera"]
    sc = bpy.context.scene
    for old in [o for o in sc.objects if o.type == "CAMERA"]:
        bpy.data.objects.remove(old)
    target = model.lo + (model.hi - model.lo) * Vector(c.get("focus", (0.5, 0.5, 0.5)))
    target += Vector(c.get("offset", (0, 0, 0)))
    if "target" in c:
        # An absolute aim point (world metres), for animation, where
        # framing must not follow the bounds of parts in motion.
        target = Vector(c["target"])
    az, el = math.radians(c.get("azimuth", 0)), math.radians(c.get("elevation", 0))
    direction = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    radius = (model.hi - model.lo).length / 2
    margin, zoom = c.get("margin", 1.1), c.get("zoom", 1)

    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.clip_end = radius * 100
    w, h = shot.get("resolution", (1600, 2000))
    if c.get("type") == "ortho":
        cam.data.type = "ORTHO"
        cam.location = target + direction * radius * 4
    else:
        cam.data.lens = c.get("lens", 50)
        # Fit the bounding sphere into the narrower side of the frame.
        narrow = 36 * min(w, h) / max(w, h)
        fit = radius / math.sin(math.atan(narrow / 2 / cam.data.lens))
        cam.location = target + direction * c.get("distance", fit * margin / zoom)
    if c.get("fit") == "box" and c.get("type") != "ortho" and "distance" not in c:
        # Fit the bounding box's corners as the camera sees them rather than
        # a sphere around it, which leaves tall or thin subjects (one drive
        # unit, an exploded stack) small in the frame.
        view = -direction
        right = view.cross(Vector((0, 0, 1)))
        right = right.normalized() if right.length > 1e-6 else Vector((1, 0, 0))
        up = right.cross(view)
        roll = math.radians(c.get("roll", 0))
        right, up = right * math.cos(roll) + up * math.sin(roll), up * math.cos(roll) - right * math.sin(roll)
        long_tan = 18 / cam.data.lens
        tan_x = long_tan if w >= h else long_tan * w / h
        tan_y = long_tan if h > w else long_tan * h / w
        need = 0.0
        for p in model.corners():
            q = p - target
            ahead = q.dot(view)
            need = max(need, margin * abs(q.dot(right)) / tan_x - ahead, margin * abs(q.dot(up)) / tan_y - ahead)
        cam.location = target - view * need / zoom
    if "position" in c:
        cam.location = model.lo + (model.hi - model.lo) * Vector(c["position"])
    cam.data.clip_start = c.get("clip_start", min(0.1, radius / 1000))
    if "cut" in c:
        # A cutaway: clip everything nearer than `cut` metres in front of
        # the aim point, opening the model up like a section.
        cam.data.clip_start = max((target - cam.location).length - c["cut"], 0.01)
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.rotation_euler.rotate_axis("Z", math.radians(c.get("roll", 0)))

    if c.get("type") == "ortho":
        # Fit the model's silhouette as the camera sees it, not its largest
        # axis: a box seen corner-on is wider than any of its sides.
        bpy.context.view_layer.update()
        inv = cam.matrix_world.inverted()
        pts = [inv @ p for p in model.corners()]
        span_x = max(p.x for p in pts) - min(p.x for p in pts)
        span_y = max(p.y for p in pts) - min(p.y for p in pts)
        # ortho_scale spans the frame's longer side.
        if w >= h:
            fit = max(span_x, span_y * w / h)
        else:
            fit = max(span_y, span_x * h / w)
        cam.data.ortho_scale = fit * margin / zoom

    dof = c.get("dof")
    if dof:
        cam.data.dof.use_dof = True
        # `focus_shift` pulls focus that many metres towards the camera,
        # e.g. onto the front edge of a full shot.
        cam.data.dof.focus_distance = c.get("focus_distance", (cam.location - target).length) - c.get("focus_shift", 0)
        cam.data.dof.aperture_fstop = dof


# ---------------------------------------------------------------- looks


def xray_material(look, name="xray", tint=None):
    """A radiograph, rendered rather than faked.

    Every solid is see-through glass with no refraction (Transparent BSDF)
    filled with an absorbing volume. The camera looks at a flat white world
    through the model, so each pixel is that white dimmed by how much metal
    the ray crossed — thick or stacked parts go dark, thin walls stay pale,
    the way film behaves under X-rays. The surface itself also dims a little
    at grazing angles, which draws the outline of every face the ray passes
    through: the fine linework in the references.

    `tint` makes an accent part coloured glass: it lets its own colour
    through and absorbs the rest, so the colour survives every layer in
    front of and behind it, and grade_xray() can pick it back out.

    Nothing is lit, so there's no noise to sample away; a handful of
    samples is only for anti-aliasing.
    """
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")

    weight = nt.nodes.new("ShaderNodeLayerWeight")
    weight.inputs["Blend"].default_value = look.get("edge_blend", 0.25)
    edge = nt.nodes.new("ShaderNodeMapRange")
    edge.inputs["To Min"].default_value = look.get("face", 0.99)
    edge.inputs["To Max"].default_value = look.get("edge", 0.45)
    nt.links.new(weight.outputs["Facing"], edge.inputs["Value"])
    transparent = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(edge.outputs["Result"], transparent.inputs["Color"])
    nt.links.new(transparent.outputs["BSDF"], out.inputs["Surface"])

    absorb = nt.nodes.new("ShaderNodeVolumeAbsorption")
    # Absorption is (1 - colour) × density: black takes every channel
    # equally, a tint passes its own hue.
    absorb.inputs["Color"].default_value = (*tint, 1) if tint is not None else (0, 0, 0, 1)
    # Per metre of material: exp(-density) of the light survives 1 m.
    absorb.inputs["Density"].default_value = look.get("density", 0.8)
    nt.links.new(absorb.outputs["Volume"], out.inputs["Volume"])
    return m


def setup_xray(shot, model):
    look = shot.get("look_settings", {})
    for m in [m for m in bpy.data.materials if m.name.startswith("xray")]:
        bpy.data.materials.remove(m)
    mat = xray_material(look)
    accent = look.get("accent")
    accent_names, accent_mat = set(), None
    if accent:
        accent_names = set(PARTS[model.name][accent["part"]]["materials"])
        accent_mat = xray_material(look, "xray-accent", srgb_to_linear(accent["colour"]))
    for o, names in model.slots.items():
        for slot, original in zip(o.material_slots, names):
            slot.material = accent_mat if original in accent_names else mat

    sc = bpy.context.scene
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    sc.world = world

    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.samples = shot.get("samples", 24)
    sc.cycles.use_denoising = False
    # A ray through the drive units crosses hundreds of surfaces. Matching
    # the minimum to the maximum turns off Russian roulette, which would
    # otherwise end rays at random and speckle the dense areas.
    sc.cycles.transparent_max_bounces = 1024
    sc.cycles.min_transparent_bounces = 1024
    sc.cycles.max_bounces = 1024
    sc.cycles.volume_bounces = 0
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"


def optical_density(rgb):
    # The least-transmitted channel: neutral parts dim all three alike, and
    # an accent part's absorbed channels keep it as dense as its neighbours.
    # Film responds to the log of exposure, so grade optical density rather
    # than transmitted light: a linear grade crushes the core to flat black.
    return -np.log10(np.clip(rgb, 1e-6, 1).min(axis=2, keepdims=True))


def xray_exposure(rgb, shot):
    """The density that prints as full ink: the densest few percent."""
    od = optical_density(rgb)
    return float(np.percentile(od[od > 0.01], shot.get("look_settings", {}).get("black_point", 90)))


def grade_xray(rgb, shot):
    """Map transmitted light (1 = nothing in the way) to the final palette.

    `paper` is the empty film and `ink` the densest metal; a negative just
    swaps them, so density glows out of black like the see-through car and
    vest references. An accent part let more of its own colour through than
    the rest, so how far a pixel's channels drift apart says how much accent
    the ray crossed, and that much of the accent colour is laid on top.
    """
    look = shot.get("look_settings", {})
    rgb = np.clip(rgb, 1e-6, 1)
    od = optical_density(rgb)
    black = look.get("max_density") or xray_exposure(rgb, shot)
    t = rgb.min(axis=2, keepdims=True)
    density = np.clip(od / black, 0, 1) ** look.get("gamma", 0.9)
    paper = srgb_to_linear(look.get("paper", "#b8c6c3"))
    ink = srgb_to_linear(look.get("ink", "#0b1216"))
    out = paper * (1 - density) + ink * density

    accent = look.get("accent")
    if accent:
        hi = rgb.max(axis=2, keepdims=True)
        amount = np.clip((hi - t) / hi, 0, 1) ** accent.get("gamma", 0.9) * accent.get("strength", 0.6)
        out = out * (1 - amount) + srgb_to_linear(accent["colour"]) * amount
    return out


# ---------------------------------------------------------------- lit looks


def unit_hash(text, salt):
    """A stable 0–1 number per (material, property), so a part keeps its
    finish from shot to shot and run to run. A Blender clash suffix
    (mat_5.001, from the second model of an assembly) is ignored, so a
    model draws the same finishes in an assembly as on its own."""
    text = re.sub(r"\.\d{3}(?=~|$)", "", text)
    return int(hashlib.md5(f"{salt}:{text}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


# Finish families a CAD material can be given, with real-world linear
# albedo: polished steel and aluminium sit around 0.5–0.65, cast iron near
# 0.2, black anodising and polymers a few percent. A look can scale them all
# with `albedo_scale`; the frosted family takes the look's own `albedo`.
FINISHES = {
    # Turned or milled steel: tight highlights stretched around the turning
    # axis. Deburred edges, so a small radius.
    "machined": {"metal": 1, "albedo": (0.52, 0.6), "roughness": (0.14, 0.24), "grain": (3000, 0.03),
                 "anisotropic": 0.5, "scratches": 0.12, "prints": 1.0, "bevel": 0.0004},
    # Bead-blasted aluminium: aluminium reflects ~90%, the blasting makes it
    # rough rather than dark.
    "blasted": {"metal": 1, "albedo": (0.75, 0.88), "roughness": (0.4, 0.52), "grain": (4000, 0.14), "bevel": 0.0008},
    # Brushed sheet stainless: long streaks around the vessel, reflections
    # smeared along them; folded sheet edges.
    "brushed": {"metal": 1, "albedo": (0.5, 0.56), "roughness": (0.22, 0.32), "grain": (2500, 0.02),
                "anisotropic": 0.7, "streaks": 0.015, "scratches": 0.08, "prints": 0.7, "runs": 1.0, "bevel": 0.0012},
    # Sand-cast iron or steel: dark, matte, dense grain and pitting, soft
    # cast edges.
    "cast": {"metal": 1, "albedo": (0.18, 0.25), "roughness": (0.48, 0.62), "grain": (2600, 0.18), "pits": 0.06,
             "runs": 1.0, "bevel": 0.003},
    # Black hard anodising is a dyed oxide layer: it reflects like a
    # dielectric (~4% head-on), not like a dark metal, with a thin sealed
    # sheen on top.
    "anodised": {"metal": 0, "albedo": (0.018, 0.03), "roughness": (0.28, 0.38), "grain": (2000, 0.05), "coat": 0.3,
                 "ior": 1.65, "scratches": 0.06, "prints": 1.0, "runs": 0.6, "bevel": 0.0006},
    # Moulded or coated polymer and rubber: non-metal, soft sheen, a little
    # light scattering under the surface softens its shading.
    "polymer": {"metal": 0, "albedo": (0.025, 0.05), "roughness": (0.55, 0.75), "grain": (1200, 0.06), "specular": 0.35,
                "subsurface": 0.08, "ior": 1.46, "bevel": 0.0015},
    # Sintered nylon-like white, for the inside look.
    "frosted": {"metal": 0, "roughness": (0.5, 0.7), "grain": (2200, 0.12), "pits": 0.02, "ior": 1.49, "bevel": 0.001},
}

# The CAD colours are engineering codes, but whether a part was drawn light
# or dark still says something about it, and keeping that grouping makes an
# assembly read as designed rather than randomly dressed: light parts become
# bright metals, mid tones cast or brushed, dark parts black finishes.
FINISH_BANDS = [
    (0.85, {"machined": 0.5, "blasted": 0.5}),
    (0.55, {"brushed": 0.3, "cast": 0.35, "anodised": 0.35}),
    (0.0, {"anodised": 0.6, "polymer": 0.4}),
]


def cad_lightness(original):
    """How light the designer drew a part, 0–1 in display terms (glTF
    stores colours linear)."""
    m = bpy.data.materials.get(original)
    try:
        c = m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value
    except (AttributeError, KeyError):
        return 0.5
    y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    return 12.92 * y if y <= 0.0031308 else 1.055 * y ** (1 / 2.4) - 0.055


def pick_finish(original, look):
    weights = look.get("finishes")
    if weights is None:
        light = cad_lightness(original.split("~")[0])
        weights = next(w for floor, w in FINISH_BANDS if light >= floor)
    u = unit_hash(original, "finish") * sum(weights.values())
    for name, w in weights.items():
        if u < w:
            return name
        u -= w
    return name


def lit_material(original, look):
    """A photographic finish per CAD material.

    Each CAD material is given a finish family by how light the designer
    drew it (see FINISH_BANDS), and its own shade and roughness within that
    family. On top of the family's look, every surface carries the wear a
    photographed part has:

    - edges are rounded at render time (CAD edges are knife-sharp and never
      catch light), and the rounding doubles as a wear mask: edges come out
      a little brighter and more polished, as handled parts do;
    - roughness drifts in soft patches, like handling marks, and polished
      finishes pick up fine random scratches;
    - upward faces collect a little dust; crevices darken, like grime;
    - large panels are very slightly wavy, as rolled sheet is, which bends
      long reflections the way a perfect CAD surface never does;
    - the family's own micro-texture goes in the bump: casting grain and
      pits, turning rings, brushing streaks, or a moulded tooth.
    """
    kind = pick_finish(original, look)
    finish = FINISHES[kind]
    m = bpy.data.materials.new(f"lit:{original}")
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes.new, nt.links.new
    bsdf = nt.nodes["Principled BSDF"]

    def op(kind, a, b=None, clamp=False):
        n = N("ShaderNodeMath")
        n.operation = kind
        n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs[0]

    def map_range(value, a, b, c, d, smooth=False):
        n = N("ShaderNodeMapRange")
        if smooth:
            n.interpolation_type = "SMOOTHSTEP"
        for key, v in (("From Min", a), ("From Max", b), ("To Min", c), ("To Max", d)):
            n.inputs[key].default_value = v
        L(value, n.inputs["Value"])
        return n.outputs["Result"]

    def coords(scale=(1, 1, 1), rotate=0.0):
        mp = N("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = scale
        mp.inputs["Rotation"].default_value = (rotate * 0.7, rotate * 0.3, rotate)
        L(tc.outputs["Object"], mp.inputs["Vector"])
        return mp.outputs["Vector"]

    def noise(scale, detail=2.0, roughness=0.5, vector=None):
        n = N("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = roughness
        L(vector if vector is not None else tc.outputs["Object"], n.inputs["Vector"])
        return n.outputs["Fac"]

    tc = N("ShaderNodeTexCoord")
    geo = N("ShaderNodeNewGeometry")
    lo, hi = finish.get("albedo") or look.get("albedo", (0.6, 0.8))
    shade = min(0.9, (lo + (hi - lo) * unit_hash(original, "albedo")) * look.get("albedo_scale", 1.0))
    r0, r1 = look.get("roughness", finish["roughness"])
    rough = r0 + (r1 - r0) * unit_hash(original, "rough")

    # Edge mask from the render-time bevel: where the rounded normal leans
    # away from the true face normal, we're on an edge.
    bevel = N("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = look.get("bevel", finish.get("bevel", 0.0012))
    bevel.samples = 6
    dot = N("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    L(bevel.outputs["Normal"], dot.inputs[0])
    L(geo.outputs["Normal"], dot.inputs[1])
    edge = map_range(dot.outputs["Value"], 0.995, 0.9, 0.0, 1.0)

    # Crevice grime.
    ao = N("ShaderNodeAmbientOcclusion")
    ao.only_local = True
    ao.samples = 8
    ao.inputs["Distance"].default_value = look.get("cavity", 0.015)
    cavity = map_range(ao.outputs["AO"], 0.0, 1.0, look.get("cavity_depth", 0.55), 1.0)

    # Dust: fine specks, only where a surface faces up.
    specks = N("ShaderNodeTexVoronoi")
    specks.inputs["Scale"].default_value = 900
    L(tc.outputs["Object"], specks.inputs["Vector"])
    up = N("ShaderNodeSeparateXYZ")
    L(geo.outputs["Normal"], up.inputs["Vector"])
    dust = op("MULTIPLY", map_range(specks.outputs["Distance"], 0.0, 0.06, 1.0, 0.0),
              map_range(up.outputs["Z"], 0.3, 0.85, 0.0, look.get("dust", 0.5), smooth=True))

    # Fine scratches: two sets of long thin noise streaks at different
    # angles, thresholded to hairlines.
    scratch_amount = finish.get("scratches", 0) * look.get("scratches", 1.0)
    scratches = None
    if scratch_amount:
        lines = []
        for angle in (unit_hash(original, "s1") * 3.1, unit_hash(original, "s2") * 3.1):
            # Hairlines a few centimetres long, sparse.
            n = noise(1.0, 2, 0.5, coords((900, 25, 25), angle))
            lines.append(map_range(n, 0.7, 0.72, 0.0, 1.0, smooth=True))
        scratches = op("MULTIPLY", op("MAXIMUM", *lines), scratch_amount)

    # World position, for marks that have a real-world direction (wiping
    # runs sideways, water runs down) whatever axes the mesh was drawn in.
    def world(scale):
        mp = N("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = scale
        L(geo.outputs["Position"], mp.inputs["Vector"])
        return mp.outputs["Vector"]

    # Handling: clusters of fingerprint-sized smears where hands go, on
    # finishes that show them.
    prints = None
    if finish.get("prints"):
        cluster = map_range(noise(2.5, 2, 0.5, world((1, 1, 1))), 0.6, 0.72, 0.0, 1.0, smooth=True)
        blob = N("ShaderNodeTexVoronoi")
        blob.inputs["Scale"].default_value = 60
        L(world((1, 1, 1)), blob.inputs["Vector"])
        smear = map_range(blob.outputs["Distance"], 0.12, 0.38, 1.0, 0.0, smooth=True)
        prints = op("MULTIPLY", op("MULTIPLY", cluster, smear), finish["prints"] * look.get("prints", 1.0))

    # Run marks: faint vertical streaks of dried water and grime, sparse.
    runs = None
    if finish.get("runs"):
        streaks = map_range(noise(1.0, 3, 0.5, world((70, 70, 1.2))), 0.6, 0.72, 0.0, 1.0, smooth=True)
        patches = map_range(noise(3.0, 2, 0.5, world((1, 1, 1))), 0.5, 0.65, 0.0, 1.0, smooth=True)
        runs = op("MULTIPLY", op("MULTIPLY", streaks, patches), finish["runs"] * look.get("runs", 1.0))

    # Weld beads where shells were joined: a raised bead a few millimetres
    # wide, and a heat-tinted, rougher band either side.
    bead = heat = None
    for weld in look.get("_welds", []):
        cx, cy = look.get("_axis", (0.0, 0.0))
        pos = N("ShaderNodeSeparateXYZ")
        L(geo.outputs["Position"], pos.inputs["Vector"])
        dx, dy = op("SUBTRACT", pos.outputs["X"], cx), op("SUBTRACT", pos.outputs["Y"], cy)
        radius = op("SQRT", op("ADD", op("MULTIPLY", dx, dx), op("MULTIPLY", dy, dy)))
        inside = op("MULTIPLY", map_range(radius, weld["r"][0] - 0.01, weld["r"][0], 0.0, 1.0),
                    map_range(radius, weld["r"][1], weld["r"][1] + 0.01, 1.0, 0.0))
        dz = op("ABSOLUTE", op("SUBTRACT", pos.outputs["Z"], weld["z"]))
        b = op("MULTIPLY", map_range(dz, 0.0, 0.004, 1.0, 0.0, smooth=True), inside)
        ripple = noise(1.0, 2, 0.5, world((1, 1, 900)))
        b = op("MULTIPLY", b, op("ADD", 0.7, op("MULTIPLY", ripple, 0.6)))
        h = op("MULTIPLY", map_range(dz, 0.004, 0.035, 1.0, 0.0, smooth=True), inside)
        bead = b if bead is None else op("MAXIMUM", bead, b)
        heat = h if heat is None else op("MAXIMUM", heat, h)

    wear = look.get("edge_wear", 0.8 if finish["metal"] else 0.3)
    value = op("MULTIPLY", op("MULTIPLY", op("ADD", op("MULTIPLY", edge, wear), 1.0), shade), cavity)
    if runs is not None:
        value = op("MULTIPLY", value, op("SUBTRACT", 1.0, op("MULTIPLY", runs, 0.18)))
    if heat is not None:
        value = op("MULTIPLY", value, op("SUBTRACT", 1.0, op("MULTIPLY", heat, 0.3)))
    value = op("ADD", op("MULTIPLY", value, op("SUBTRACT", 1.0, dust)), op("MULTIPLY", dust, 0.35))
    colour = N("ShaderNodeCombineColor")
    L(value, colour.inputs[0])
    L(value, colour.inputs[1])
    L(op("MULTIPLY", value, 1.03), colour.inputs[2])
    L(colour.outputs["Color"], bsdf.inputs["Base Color"])

    # Wipe marks: roughness that drifts in long horizontal bands, the way a
    # cloth leaves a surface, rather than in cloudy blotches.
    wipe_amount = look.get("wipes", 0.035)
    wipes = map_range(noise(1.0, 4, 0.55, world((3, 3, 30))), 0.3, 0.7, -wipe_amount, wipe_amount)
    r = op("MULTIPLY", op("ADD", wipes, rough), op("SUBTRACT", 1.0, op("MULTIPLY", edge, 0.45)))
    if scratches is not None:
        r = op("ADD", r, scratches)
    if prints is not None:
        r = op("ADD", r, op("MULTIPLY", prints, 0.14))
    if runs is not None:
        r = op("ADD", r, op("MULTIPLY", runs, 0.08))
    if heat is not None:
        r = op("ADD", r, op("MULTIPLY", heat, 0.15))
    r = op("ADD", op("MULTIPLY", r, op("SUBTRACT", 1.0, dust)), op("MULTIPLY", dust, 0.9), clamp=True)
    L(r, bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = finish["metal"]
    if "specular" in finish:
        bsdf.inputs["Specular IOR Level"].default_value = finish["specular"]
    # Real refractive indices for the dielectrics: they set how strongly a
    # surface reflects head-on (Fresnel). Aluminium oxide ~1.65, PMMA-like
    # label film ~1.49, general plastics ~1.46.
    if "ior" in finish:
        bsdf.inputs["IOR"].default_value = finish["ior"]
        if "coat" in finish:
            bsdf.inputs["Coat IOR"].default_value = finish["ior"]
    if "subsurface" in finish:
        bsdf.inputs["Subsurface Weight"].default_value = finish["subsurface"]
        bsdf.inputs["Subsurface Scale"].default_value = 0.0015
    if "coat" in finish:
        bsdf.inputs["Coat Weight"].default_value = finish["coat"]
        bsdf.inputs["Coat Roughness"].default_value = 0.15
    if "anisotropic" in finish:
        bsdf.inputs["Anisotropic"].default_value = finish["anisotropic"]
        # Brushing and turning run around vertical parts: the world-space
        # direction across each face's normal and the vertical. (Object
        # axes can't be trusted here: imported meshes keep their CAD frame.)
        across = N("ShaderNodeVectorMath")
        across.operation = "CROSS_PRODUCT"
        across.inputs[0].default_value = (0, 0, 1)
        L(geo.outputs["Normal"], across.inputs[1])
        unit = N("ShaderNodeVectorMath")
        unit.operation = "NORMALIZE"
        L(across.outputs["Vector"], unit.inputs[0])
        L(unit.outputs["Vector"], bsdf.inputs["Tangent"])

    # Micro-texture.
    scale, strength = finish["grain"]
    height = noise(scale * look.get("grain_scale_factor", 1.0), 3, 0.6)
    if finish.get("pits"):
        vor = N("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 350
        L(tc.outputs["Object"], vor.inputs["Vector"])
        height = op("ADD", height, map_range(vor.outputs["Distance"], 0.0, 0.12, -finish["pits"] * 4, 0.0))
    if finish.get("rings"):
        wave = N("ShaderNodeTexWave")
        wave.wave_type = "RINGS"
        wave.rings_direction = "Z"
        wave.inputs["Scale"].default_value = 900
        L(tc.outputs["Object"], wave.inputs["Vector"])
        height = op("ADD", height, op("MULTIPLY", wave.outputs["Fac"], finish["rings"] / max(strength, 1e-3)))
    if finish.get("streaks"):
        # Brushing runs around the vessel, so the streaks vary fast in world
        # height and slowly around.
        world = N("ShaderNodeMapping")
        world.inputs["Scale"].default_value = (4, 4, 1500)
        L(geo.outputs["Position"], world.inputs["Vector"])
        streak = noise(1.0, 4, 0.6, world.outputs["Vector"])
        height = op("ADD", height, op("MULTIPLY", streak, finish["streaks"] / max(strength, 1e-3)))
    if scratches is not None:
        height = op("SUBTRACT", height, op("MULTIPLY", scratches, 0.6))
    if bead is not None:
        height = op("ADD", height, op("MULTIPLY", bead, 6.0 / max(strength, 1e-3) * 0.05))

    # Panel waviness under everything, at its own (much larger) depth.
    wavy = N("ShaderNodeBump")
    wavy.inputs["Strength"].default_value = look.get("waviness", 0.015) if finish["metal"] else 0.0
    wavy.inputs["Distance"].default_value = 0.004
    L(noise(1.6, 2, 0.5), wavy.inputs["Height"])
    L(bevel.outputs["Normal"], wavy.inputs["Normal"])
    bump = N("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength * look.get("grain", 1.0)
    bump.inputs["Distance"].default_value = 0.0002
    L(height, bump.inputs["Height"])
    L(wavy.outputs["Normal"], bump.inputs["Normal"])
    L(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


# The approved studio look (the studio-more / studio-closeups sets): every
# CAD material draws one of these finishes at random, scaled within the
# look's dark albedo range, so housings come out pale and bright and the
# vessel dark and reflective under the soft studio light. Improvements to
# realism go into lit_material_classic without changing this balance.
CLASSIC_FINISHES = {
    "cast": {"metal": 1, "albedo": 1.0, "roughness": (0.42, 0.6), "grain": (2600, 0.18), "pits": 0.06},
    "machined": {"metal": 1, "albedo": 3.0, "roughness": (0.16, 0.28), "grain": (3000, 0.04), "anisotropic": 0.55,
                 "rings": 0.03, "scratches": 0.06},
    "anodised": {"metal": 1, "albedo": 1.0, "roughness": (0.3, 0.42), "grain": (2000, 0.05), "coat": 0.25,
                 "scratches": 0.04},
    "polymer": {"metal": 0, "albedo": 0.8, "roughness": (0.55, 0.75), "grain": (1200, 0.06), "specular": 0.35,
                "ior": 1.46, "subsurface": 0.06},
}
CLASSIC_MIX = {"cast": 0.35, "machined": 0.2, "anodised": 0.3, "polymer": 0.15}

# Real materials (look "materials": "real"): one per kind of part, with
# measured linear albedo ("abs_albedo") rather than the classic look's
# relative shades. Steel reflects ~55%, aluminium ~85-90%, graphite ~5%,
# black anodising and rubber 2-4% (as dielectrics), powder coat by colour.
REAL_FINISHES = {
    # Nuclear-grade graphite: dark grey, matte, a faint sheen and fine grain.
    "graphite": {"metal": 0, "abs_albedo": (0.08, 0.11), "roughness": (0.7, 0.82), "grain": (2500, 0.12),
                 "specular": 0.45, "surface": "graphite"},
    # Brushed stainless sheet: the vessel. Brushing runs around it.
    "stainless-brushed": {"metal": 1, "abs_albedo": (0.52, 0.58), "roughness": (0.22, 0.3), "grain": (2500, 0.02),
                          "anisotropic": 0.65},
    # Bead-blasted stainless: base ring, cradle, brackets.
    "stainless-blasted": {"metal": 1, "abs_albedo": (0.5, 0.56), "roughness": (0.42, 0.52), "grain": (4000, 0.1), "surface": "blasted"},
    # Machined stainless: core hardware, lugs, plates.
    "stainless-machined": {"metal": 1, "abs_albedo": (0.55, 0.6), "roughness": (0.15, 0.22), "grain": (3000, 0.03),
                           "anisotropic": 0.4},
    # Aluminium: control drums blasted, small drive parts machined.
    "aluminium-blasted": {"metal": 1, "abs_albedo": (0.8, 0.88), "roughness": (0.4, 0.5), "grain": (4000, 0.1), "surface": "blasted"},
    "aluminium-machined": {"metal": 1, "abs_albedo": (0.85, 0.9), "roughness": (0.15, 0.25), "grain": (3000, 0.03),
                           "anisotropic": 0.4},
    # Dark matte anodised / blasted aluminium, after the moodboard's black
    # motor: dark grey bodies with a soft even sheen, and every machined
    # chamfer cut back to bright bare metal, so shapes read as thin bright
    # lines. Wider chamfers than the default so they hold at distance.
    "dark-anodised": {"metal": 1, "abs_albedo": (0.09, 0.13), "roughness": (0.45, 0.55), "grain": (3000, 0.03),
                      "edge_polish": 0.9, "bevel": 0.0025, "no_gloss": True, "specks": 1.0},
    # A lighter, satin version: mid-dark grey with a soft sheen, so dark
    # parts still read as metal next to bright ones.
    "dark-satin-anodised": {"metal": 1, "abs_albedo": (0.2, 0.26), "roughness": (0.3, 0.38), "grain": (3000, 0.03),
                            "edge_polish": 0.8, "bevel": 0.0025, "no_gloss": True, "specks": 0.7},
    # Industrial paint: light grey semi-gloss enamel over steel, as on
    # skids and frames. A dielectric with a smooth coat.
    "painted-grey": {"metal": 0, "abs_albedo": (0.32, 0.38), "roughness": (0.28, 0.36), "grain": (1500, 0.04),
                     "coat": 0.25, "ior": 1.5, "edge_polish": 0.0},
    # Face-milled aluminium plates: bright, satin, with the fine arc marks
    # a fly-cutter leaves, which break up their reflections.
    "aluminium-milled": {"metal": 1, "abs_albedo": (0.85, 0.9), "roughness": (0.24, 0.32), "grain": (3000, 0.03),
                         "rings": 0.04, "anisotropic": 0.3},
    # Light grey powder coat on the drive housings.
    "powder-light": {"metal": 0, "abs_albedo": (0.5, 0.58), "roughness": (0.45, 0.55), "grain": (1500, 0.05),
                     "specular": 0.5, "ior": 1.5},
    # Black hard anodising (an oxide, so a dielectric) and black rubber.
    "anodised-black": {"metal": 0, "abs_albedo": (0.02, 0.035), "roughness": (0.28, 0.36), "grain": (2000, 0.04),
                       "coat": 0.3, "ior": 1.65},
    # Zinc-plated fasteners.
    "zinc": {"metal": 1, "abs_albedo": (0.6, 0.66), "roughness": (0.3, 0.4), "grain": (3000, 0.04), "surface": "blasted"},
    # Drawn stainless tube: the heat pipes.
    "drawn-tube": {"metal": 1, "abs_albedo": (0.55, 0.6), "roughness": (0.15, 0.22), "grain": (3000, 0.02),
                   "anisotropic": 0.6},
    # Dark coated vessel, satin and matte versions: no clear coat and kept
    # out of the look's gloss boost, so it holds a soft sheen instead of
    # mirror-like highlights.
    "dark-satin": {"metal": 0, "abs_albedo": (0.035, 0.045), "roughness": (0.42, 0.48), "grain": (2000, 0.04),
                   "ior": 1.5, "no_gloss": True, "surface": "coat"},
    "dark-matte": {"metal": 0, "abs_albedo": (0.035, 0.045), "roughness": (0.58, 0.66), "grain": (2000, 0.05),
                   "ior": 1.5, "no_gloss": True, "surface": "coat"},
    # Optional dark coated vessel, if the stainless reads too bright.
    "dark-coated": {"metal": 0, "abs_albedo": (0.03, 0.045), "roughness": (0.3, 0.4), "grain": (2000, 0.03),
                    "coat": 0.4, "ior": 1.5},
}


def real_kind(model, o, original, look):
    """Which real material a part is, from its component (the site's part
    tagging), its size, where it sits and how light the designer drew it.
    Look "palette": "dark" swaps the large pale bodies for dark anodised
    metal with bright chamfers, keeping small machined parts bright."""
    kind = _real_kind(model, o, original, look)
    if look.get("palette") == "dark" and kind in look.get("darken", ("aluminium-blasted", "powder-light",
                                                                      "stainless-blasted", "aluminium-milled")):
        return look.get("dark_finish", "dark-anodised")
    return kind


def _real_kind(model, o, original, look):
    g = model.components.get(o, "untagged")
    blo, bhi = model.boxes[o]
    size = float(np.linalg.norm(bhi - blo))
    zc = float((blo[2] + bhi[2]) / 2)
    reactor_lo, reactor_hi = model.reactor
    height = reactor_hi.z - reactor_lo.z
    light = cad_lightness(original.split("~")[0])
    if size < 0.035:
        return "zinc"
    dims = np.sort(bhi - blo)
    flat = dims[0] < 0.15 * dims[2]
    if g == "f3_core":
        # Core hardware is blasted, not mirror-polished: a mirror finish
        # only reflects the black studio and turns into dark blotches.
        return "graphite" if original == "mat_0" else "stainless-blasted"
    if g == "f4_heatpipes":
        return "drawn-tube"
    if g == "f2_reactivity":
        if zc > reactor_lo.z + 0.73 * height:
            if light < 0.25:
                return "anodised-black"
            if flat:
                return "aluminium-milled"
            return "powder-light" if size > 0.12 else "aluminium-machined"
        return "anodised-black" if light < 0.25 else "aluminium-blasted"
    if g == "f1_cradle":
        if original in PARTS.get(model.name, {}).get("shell", []):
            return look.get("vessel", "stainless-brushed")
        return "stainless-blasted"
    return "anodised-black" if light < 0.25 else "stainless-blasted"


# Grain of the blasted texture per finish, in metres: cast and blasted
# metal coarse and sparkly, anodising finer, polymer a fine powder-coat
# stipple. Machined steel keeps its smooth turned finish.
BLAST = {
    "cast": {"grain": 0.0016, "sparkle": 0.2, "depth": 0.9},
    "anodised": {"grain": 0.0012, "sparkle": 0.15, "depth": 0.7},
    "polymer": {"grain": 0.0009, "sparkle": 0.12, "depth": 0.7},
    "machined": {"grain": 0.0007, "sparkle": 0.06, "depth": 0.25},
    "blasted-aluminium": {"grain": 0.0014, "sparkle": 0.2, "depth": 0.9},
    "default": {"grain": 0.0012, "sparkle": 0.12, "depth": 0.6},
}


def lit_material_classic(original, look, force=None):
    """The approved studio finish, with realism added in ways that keep its
    look: wear follows how parts are really handled instead of drifting
    in cloudy patches (which read as smoke on the big vessel), polished
    finishes carry a few hairline scratches, welded seams get a bead, and
    plastics scatter a little light under the surface."""
    # Parts that should look like one piece share a key (see PARTS "shell").
    key = look.get("_alias", {}).get(original, original)
    weights = look.get("finishes", CLASSIC_MIX)
    u = unit_hash(key, "finish") * sum(weights.values())
    for kind, w in weights.items():
        if u < w:
            break
        u -= w
    finish = CLASSIC_FINISHES[kind]
    if force:
        kind, finish = force, REAL_FINISHES[force]
    elif look.get("vessel_finish") and original in look.get("_shell", ()):
        # The vessel wall in a chosen real finish, so it reads as metal
        # rather than whatever classic finish its CAD colour drew.
        kind, finish = look["vessel_finish"], REAL_FINISHES[look["vessel_finish"]]
    if kind == "polymer" and look.get("housings") == "aluminium":
        # The pale moulded housings as light-grey bead-blasted aluminium
        # instead, like the moodboard's cast parts: metal, soft sheen,
        # coarse grain.
        kind = "blasted-aluminium"
        finish = {"metal": 1, "albedo": look.get("housing_albedo", 2.4), "roughness": (0.38, 0.48),
                  "grain": (3000, 0.05)}
    if kind == "polymer" and look.get("housings") == "gunmetal":
        # The pale housings as dark satin gunmetal, like the moodboard's
        # black motor and dryer: a dark metal body whose form comes from
        # soft reflections sliding across it, not from its own colour.
        kind = "gunmetal"
        finish = {"metal": 1, "albedo": look.get("housing_albedo", 3.0), "roughness": (0.32, 0.42),
                  "grain": (3000, 0.03), "coat": 0.2}
    m = bpy.data.materials.new(f"lit:{original}")
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes.new, nt.links.new
    bsdf = nt.nodes["Principled BSDF"]

    def op(kind, a, b=None, clamp=False):
        n = N("ShaderNodeMath")
        n.operation = kind
        n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs[0]

    def map_range(value, a, b, c, d, smooth=False):
        n = N("ShaderNodeMapRange")
        if smooth:
            n.interpolation_type = "SMOOTHSTEP"
        for key, v in (("From Min", a), ("From Max", b), ("To Min", c), ("To Max", d)):
            n.inputs[key].default_value = v
        L(value, n.inputs["Value"])
        return n.outputs["Result"]

    def noise(scale, detail=2.0, roughness=0.5, vector=None):
        n = N("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = roughness
        L(vector if vector is not None else geo.outputs["Position"], n.inputs["Vector"])
        return n.outputs["Fac"]

    def world(scale):
        mp = N("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = scale
        L(geo.outputs["Position"], mp.inputs["Vector"])
        return mp.outputs["Vector"]

    # Surface texture is sized in world metres. Object coordinates can't be
    # trusted: the full-detail parts file stores each part scaled by its
    # own quantisation factor, so "1 mm" in one part's space is 0.01 mm in
    # another's.
    tc = N("ShaderNodeTexCoord")
    geo = N("ShaderNodeNewGeometry")
    if "abs_albedo" in finish:
        lo, hi = finish["abs_albedo"]
        shade = min(0.95, (lo + (hi - lo) * unit_hash(key, "albedo")) * look.get("albedo_scale", 1.0))
    else:
        lo, hi = look.get("albedo", (0.02, 0.09))
        shade = min(0.75, (lo + (hi - lo) * unit_hash(key, "albedo")) * finish["albedo"])
    r0, r1 = look.get("roughness", finish["roughness"])
    rough = r0 + (r1 - r0) * unit_hash(key, "rough")
    # Soften every finish at once while keeping their differences.
    rough = min(1.0, rough + look.get("roughness_add", 0.0))

    bevel = N("ShaderNodeBevel")
    bevel.inputs["Radius"].default_value = finish.get("bevel", look.get("bevel", 0.0012))
    bevel.samples = 6
    dot = N("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    L(bevel.outputs["Normal"], dot.inputs[0])
    L(geo.outputs["Normal"], dot.inputs[1])
    edge = map_range(dot.outputs["Value"], 0.995, 0.9, 0.0, 1.0)

    ao = N("ShaderNodeAmbientOcclusion")
    ao.only_local = True
    ao.samples = 8
    ao.inputs["Distance"].default_value = look.get("cavity", 0.015)
    cavity = map_range(ao.outputs["AO"], 0.0, 1.0, look.get("cavity_depth", 0.55), 1.0)

    # Weld beads where shells were joined (PARTS[model]["welds"]).
    bead = heat = None
    for weld in look.get("_welds", []):
        cx, cy = look.get("_axis", (0.0, 0.0))
        pos = N("ShaderNodeSeparateXYZ")
        L(geo.outputs["Position"], pos.inputs["Vector"])
        dx, dy = op("SUBTRACT", pos.outputs["X"], cx), op("SUBTRACT", pos.outputs["Y"], cy)
        radius = op("SQRT", op("ADD", op("MULTIPLY", dx, dx), op("MULTIPLY", dy, dy)))
        inside = op("MULTIPLY", map_range(radius, weld["r"][0] - 0.01, weld["r"][0], 0.0, 1.0),
                    map_range(radius, weld["r"][1], weld["r"][1] + 0.01, 1.0, 0.0))
        dz = op("ABSOLUTE", op("SUBTRACT", pos.outputs["Z"], weld["z"]))
        b = op("MULTIPLY", map_range(dz, 0.0, 0.004, 1.0, 0.0, smooth=True), inside)
        b = op("MULTIPLY", b, op("ADD", 0.7, op("MULTIPLY", noise(1.0, 2, 0.5, world((1, 1, 900))), 0.6)))
        h = op("MULTIPLY", map_range(dz, 0.004, 0.03, 1.0, 0.0, smooth=True), inside)
        bead = b if bead is None else op("MAXIMUM", bead, b)
        heat = h if heat is None else op("MAXIMUM", heat, h)

    value = op("MULTIPLY", op("MULTIPLY", op("ADD", op("MULTIPLY", edge, look.get("edge_wear", 0.8 if finish["metal"] else 0.3)), 1.0), shade), cavity)
    specks = None
    if finish.get("specks") and look.get("specks", 1.0):
        # Dust and blasting media caught in the matte anodising: sparse
        # pale specks a fraction of a millimetre across, as on black
        # anodised machine parts photographed up close. Matte, so they
        # read in light and shadow alike.
        cells = N("ShaderNodeTexVoronoi")
        cells.inputs["Scale"].default_value = 1.0 / 0.0012
        L(geo.outputs["Position"], cells.inputs["Vector"])
        sep = N("ShaderNodeSeparateColor")
        L(cells.outputs["Color"], sep.inputs["Color"])
        pick = map_range(sep.outputs["Red"], 0.965, 0.97, 0.0, 1.0)
        dot = map_range(cells.outputs["Distance"], 0.12, 0.2, 1.0, 0.0)
        specks = op("MULTIPLY", op("MULTIPLY", pick, dot), finish["specks"] * look.get("specks", 1.0))
        value = op("ADD", op("MULTIPLY", value, op("SUBTRACT", 1.0, specks)), op("MULTIPLY", specks, 0.45))
    polish = look.get("edge_polish", 0.0)
    polish = finish.get("edge_polish", polish)
    if polish and finish["metal"]:
        # Machined chamfers: every edge is a narrow band of bright, polished
        # bare metal, so outlines catch the light as crisp lines, the way
        # the edges of the references' dark parts do.
        value = op("ADD", op("MULTIPLY", value, op("SUBTRACT", 1.0, op("MULTIPLY", edge, polish))),
                   op("MULTIPLY", edge, polish * 0.6))
    if heat is not None:
        value = op("MULTIPLY", value, op("SUBTRACT", 1.0, op("MULTIPLY", heat, 0.2)))
    colour = N("ShaderNodeCombineColor")
    L(value, colour.inputs[0])
    L(value, colour.inputs[1])
    L(op("MULTIPLY", value, 1.04), colour.inputs[2])
    L(colour.outputs["Color"], bsdf.inputs["Base Color"])

    # Wipe marks: roughness drifting in long horizontal bands, the way a
    # cloth leaves a surface, in place of the old cloudy patches.
    # Blasted metal barely holds wipe marks; keep them for smooth finishes.
    wipe = look.get("wipes", 0.03) * (0.2 if finish.get("surface") == "blasted" else 1.0)
    r = op("ADD", map_range(noise(1.0, 4, 0.55, world((3, 3, 30))), 0.3, 0.7, -wipe, wipe), rough)
    r = op("MULTIPLY", r, op("SUBTRACT", 1.0, op("MULTIPLY", edge, max(look.get("edge_shine", 0.45), polish))))
    scratches = None
    if finish.get("scratches"):
        lines = []
        for angle in (unit_hash(original, "s1") * 3.1, unit_hash(original, "s2") * 3.1):
            mp = N("ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (900, 25, 25)
            mp.inputs["Rotation"].default_value = (angle * 0.7, angle * 0.3, angle)
            L(geo.outputs["Position"], mp.inputs["Vector"])
            lines.append(map_range(noise(1.0, 2, 0.5, mp.outputs["Vector"]), 0.7, 0.72, 0.0, 1.0, smooth=True))
        scratches = op("MULTIPLY", op("MAXIMUM", *lines), finish["scratches"] * look.get("scratches", 1.0))
        r = op("ADD", r, scratches)
    if heat is not None:
        r = op("ADD", r, op("MULTIPLY", heat, 0.1))
    # Blasted texture (look "texture": "blasted"): sand-cast and bead-
    # blasted metal is a field of tiny facets, each catching the light a
    # little differently, which is what makes it sparkle under a hard
    # light. Give every grain its own roughness, and (below) its own tilt.
    blast = look.get("texture") == "blasted"
    grain_cell = None
    if blast:
        size = BLAST.get(kind, BLAST["default"])
        if size:
            k = look.get("grain_boost", 1.0)
            size = dict(size, depth=size["depth"] * k, sparkle=size["sparkle"] * min(k, 1.5))
            vor = N("ShaderNodeTexVoronoi")
            vor.inputs["Scale"].default_value = 1.0 / size["grain"]
            L(geo.outputs["Position"], vor.inputs["Vector"])
            grain_cell = vor
            jitter = map_range(vor.outputs["Color"], 0.0, 1.0, -size["sparkle"], size["sparkle"])
            r = op("ADD", r, jitter)
    blasted = (kind == "cast" or finish.get("surface") == "blasted") and look.get("blasted_grit", True)
    if look.get("texture") == "micro" and (blasted or kind in ("cast", "machined")):
        # Blasted micro-roughness softens the highlight itself.
        r = op("ADD", r, look.get("micro_rough", 0.05))
    if look.get("pbr_metal") and finish["metal"]:
        # A scanned brushed-metal roughness map, box-projected in world
        # space, breaks the even procedural sheen with real streaks and
        # irregular wear; mixed in around the finish's own roughness.
        ptex = N("ShaderNodeTexImage")
        pdir = os.path.join(HERE, "textures", "pbr", look["pbr_metal"])
        ptex.image = bpy.data.images.load(os.path.join(pdir, f"{look['pbr_metal']}_2K-JPG_Roughness.jpg"), check_existing=True)
        ptex.image.colorspace_settings.name = "Non-Color"
        ptex.projection = "BOX"
        ptex.projection_blend = 0.3
        pmap = N("ShaderNodeMapping")
        pmap.inputs["Scale"].default_value = (look.get("pbr_tiling", 2.0),) * 3
        L(geo.outputs["Position"], pmap.inputs["Vector"])
        L(pmap.outputs["Vector"], ptex.inputs["Vector"])
        amount = look.get("pbr_amount", 0.6)
        centred = map_range(ptex.outputs["Color"], 0.0, 1.0, -0.5 * amount, 0.5 * amount)
        r = op("ADD", r, op("MULTIPLY", centred, rough * 1.6 + 0.05))
        pbr_height = ptex.outputs["Color"]
    else:
        pbr_height = None
    if look.get("gloss", 1.0) != 1.0 and not finish.get("no_gloss") and not blasted:
        # Glossier finishes: tighter, crisper highlights on dark bodies.
        r = op("MULTIPLY", r, 1.0 / look["gloss"])
    if specks is not None:
        r = op("ADD", op("MULTIPLY", r, op("SUBTRACT", 1.0, specks)), op("MULTIPLY", specks, 0.9))
    L(op("ADD", r, 0.0, clamp=True), bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = finish["metal"]
    if "specular" in finish:
        bsdf.inputs["Specular IOR Level"].default_value = finish["specular"]
    if "ior" in finish:
        bsdf.inputs["IOR"].default_value = finish["ior"]
    if "subsurface" in finish:
        bsdf.inputs["Subsurface Weight"].default_value = finish["subsurface"]
        bsdf.inputs["Subsurface Scale"].default_value = 0.0015
    if "coat" in finish:
        bsdf.inputs["Coat Weight"].default_value = finish["coat"]
        bsdf.inputs["Coat Roughness"].default_value = finish.get("coat_roughness", 0.15)
    if "anisotropic" in finish:
        bsdf.inputs["Anisotropic"].default_value = finish["anisotropic"]
        # Around the vertical, in world space: the parts file stores each
        # part in its own scaled frame, so an object-space radial tangent
        # swirls in patches across a part instead of running around it.
        across = N("ShaderNodeVectorMath")
        across.operation = "CROSS_PRODUCT"
        across.inputs[0].default_value = (0, 0, 1)
        L(geo.outputs["Normal"], across.inputs[1])
        unit = N("ShaderNodeVectorMath")
        unit.operation = "NORMALIZE"
        L(across.outputs["Vector"], unit.inputs[0])
        L(unit.outputs["Vector"], bsdf.inputs["Tangent"])

    scale, strength = finish["grain"]
    height = noise(scale, 3, 0.6)
    if finish.get("pits"):
        vor = N("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 350
        L(geo.outputs["Position"], vor.inputs["Vector"])
        height = op("ADD", height, map_range(vor.outputs["Distance"], 0.0, 0.12, -finish["pits"] * 4, 0.0))
    if finish.get("rings"):
        wave = N("ShaderNodeTexWave")
        wave.wave_type = "RINGS"
        wave.rings_direction = "Z"
        wave.inputs["Scale"].default_value = 900
        L(geo.outputs["Position"], wave.inputs["Vector"])
        height = op("ADD", height, op("MULTIPLY", wave.outputs["Fac"], finish["rings"] / max(strength, 1e-3)))
    if scratches is not None:
        height = op("SUBTRACT", height, op("MULTIPLY", scratches, 0.6))
    if bead is not None:
        height = op("ADD", height, op("MULTIPLY", bead, 0.3 / max(strength, 1e-3)))
    if grain_cell is not None:
        # Each grain a small rounded dome: distance to its centre, inverted.
        dome = map_range(grain_cell.outputs["Distance"], 0.0, 0.6, 1.0, 0.0, smooth=True)
        speck = noise(1.0 / (size["grain"] * 0.35), 2, 0.6)
        height = op("ADD", op("MULTIPLY", dome, size["depth"] / max(strength, 1e-3)),
                    op("MULTIPLY", speck, size["depth"] * 0.5 / max(strength, 1e-3)))
    if pbr_height is not None:
        height = op("ADD", height, op("MULTIPLY", pbr_height, look.get("pbr_bump", 0.25) / max(strength, 1e-3)))
    micro = look.get("texture") == "micro"
    if micro:
        # Physically scaled surface (look "texture": "micro"): real blasted
        # grains are far below a pixel here, so they show as a fine micro-
        # roughness that softens highlights, not as a visible pattern.
        # Powder coat instead has a soft, low "orange peel" wave.
        if finish.get("surface") == "graphite":
            # Graphite: a fine, dull grain from the machined carbon.
            height = op("ADD", op("MULTIPLY", height, 0.3),
                        op("MULTIPLY", noise(1.0 / 0.0004, 3, 0.6, geo.outputs["Position"]), 0.5 / max(strength, 1e-3)))
        elif finish.get("surface") == "coat":
            # Satin coating: a very faint, wide orange peel.
            peel = noise(1.0 / 0.003, 2, 0.4, geo.outputs["Position"])
            height = op("ADD", op("MULTIPLY", height, 0.2), op("MULTIPLY", peel, 0.25 / max(strength, 1e-3)))
        elif finish["metal"]:
            height = op("ADD", op("MULTIPLY", height, 0.25),
                        op("MULTIPLY", noise(1.0 / 0.00015, 2, 0.5, geo.outputs["Position"]),
                           look.get("micro_depth", 0.9) * (1.6 if blasted else 1.0) / max(strength, 1e-3)))
        else:
            peel = noise(1.0 / 0.0018, 2, 0.45, geo.outputs["Position"])
            height = op("ADD", op("MULTIPLY", height, 0.25), op("MULTIPLY", peel, 0.5 / max(strength, 1e-3)))
    bump = N("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength * look.get("grain", 1.0)
    bump.inputs["Distance"].default_value = 0.0002 if not micro else (0.00004 if finish["metal"] else 0.0004)
    L(height, bump.inputs["Height"])
    L(bevel.outputs["Normal"], bump.inputs["Normal"])
    L(bump.outputs["Normal"], bsdf.inputs["Normal"])

    glint_kinds = look.get("glint_kinds")
    # Satin gunmetal is a smooth coated finish: no blasted glints.
    if look.get("materials") == "real" and not blasted:
        glint_kinds = ["__none__"]
    if micro and finish["metal"] and kind != "gunmetal" and look.get("glints", 0.04) and (not glint_kinds or kind in glint_kinds):
        # Glints: a sparse few micro-facets are near-mirror and randomly
        # tilted, so each flashes only when it happens to reflect a light
        # into the lens — sparkle that lives in the highlights and vanishes
        # in shadow, as on real blasted or cast metal.
        cells = N("ShaderNodeTexVoronoi")
        cells.inputs["Scale"].default_value = 1.0 / look.get("glint_size", 0.0002)
        L(geo.outputs["Position"], cells.inputs["Vector"])
        sep = N("ShaderNodeSeparateColor")
        L(cells.outputs["Color"], sep.inputs["Color"])
        share = look.get("glints", 0.04)
        mask = map_range(sep.outputs["Red"], 1.0 - share, 1.0 - share + 0.002, 0.0, 1.0)
        tilt = N("ShaderNodeVectorMath")
        tilt.operation = "SUBTRACT"
        L(cells.outputs["Color"], tilt.inputs[0])
        tilt.inputs[1].default_value = (0.5, 0.5, 0.5)
        scale = N("ShaderNodeVectorMath")
        scale.operation = "SCALE"
        L(tilt.outputs["Vector"], scale.inputs[0])
        scale.inputs["Scale"].default_value = look.get("glint_tilt", 0.7)
        bent = N("ShaderNodeVectorMath")
        bent.operation = "ADD"
        L(bump.outputs["Normal"], bent.inputs[0])
        L(scale.outputs["Vector"], bent.inputs[1])
        unit = N("ShaderNodeVectorMath")
        unit.operation = "NORMALIZE"
        L(bent.outputs["Vector"], unit.inputs[0])
        glint = N("ShaderNodeBsdfPrincipled")
        glint.inputs["Metallic"].default_value = 1.0
        glint.inputs["Roughness"].default_value = look.get("glint_roughness", 0.1)
        L(colour.outputs["Color"], glint.inputs["Base Color"])
        L(unit.outputs["Vector"], glint.inputs["Normal"])
        mix = N("ShaderNodeMixShader")
        L(mask, mix.inputs["Fac"])
        out = nt.nodes["Material Output"]
        L(bsdf.outputs["BSDF"], mix.inputs[1])
        L(glint.outputs["BSDF"], mix.inputs[2])
        L(mix.outputs["Shader"], out.inputs["Surface"])
    return m


def add_light(name, target, view, light):
    """An area light placed relative to the camera: `azimuth` 0 is behind
    the camera, 180 is behind the model facing it. Sizes and distance are
    in units of the framed area, so a rig reads the same on a 3 m crop and
    a 30 m wide shot."""
    az = math.radians(view["azimuth"] + light["azimuth"])
    el = math.radians(light.get("elevation", 0))
    d = view["radius"] * light.get("distance", 3)
    at = target + d * Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    if light.get("flag"):
        # A black flag: matte black board that soaks up light from its side,
        # so metal facing it reflects a dark band (negative fill). Hidden
        # from the camera, real to everything else.
        bpy.ops.mesh.primitive_plane_add(size=1, location=at)
        flag = bpy.context.active_object
        flag.name, flag["stage"] = name, True
        flag.scale = (view["radius"] * light.get("width", 1.5), view["radius"] * light.get("length", 2.5), 1)
        flag.rotation_euler = (target - at).to_track_quat("Z", "Y").to_euler()
        flag.data.materials.append(simple_material("flag", "#050505", 0.95))
        flag.visible_camera = False
        return
    data = bpy.data.lights.new(name, "AREA")
    data.shape = "RECTANGLE"
    data.size = view["radius"] * light.get("width", 0.3)
    data.size_y = view["radius"] * light.get("length", 2.5)
    # Power falls off with distance squared; scale it back up so `power`
    # means the same brightness on the subject at any size.
    data.energy = light.get("power", 1) * 400 * d * d
    obj = bpy.data.objects.new(name, data)
    obj.location = at
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)


RIGS = {
    # The approved studio light: a big soft box overhead and slightly in
    # front for broad, even form, with rim strips either side behind to
    # cut the silhouette out of the backdrop.
    # Stronger variants of the approved light: a smaller key for crisper
    # shadows, brighter rims, set with a lower ambient "fill".
    "studio-strong": [
        {"azimuth": 30, "elevation": 50, "width": 1.6, "length": 1.6, "power": 0.55},
        {"azimuth": 140, "elevation": 25, "width": 0.15, "length": 3, "power": 1.4},
        {"azimuth": -140, "elevation": 25, "width": 0.15, "length": 3, "power": 1.0},
    ],
    "studio-stronger": [
        {"azimuth": 35, "elevation": 45, "width": 0.9, "length": 0.9, "power": 0.6},
        {"azimuth": 140, "elevation": 25, "width": 0.12, "length": 3, "power": 1.8},
        {"azimuth": -140, "elevation": 25, "width": 0.12, "length": 3, "power": 1.1},
    ],
    # Like the moodboard's pump and cast housing: one hard-ish key from the
    # side, a rim from behind on the other side tracing the edges, and
    # no fill to speak of, so shadows fall away to black.
    "studio-dramatic": [
        {"azimuth": 80, "elevation": 30, "distance": 2.2, "width": 0.5, "length": 1.0, "power": 1.1},
        {"azimuth": -150, "elevation": 20, "width": 0.1, "length": 3, "power": 1.6},
        {"azimuth": 20, "elevation": 70, "width": 2.5, "length": 2.5, "power": 0.06},
    ],
    # The dramatic light for a black backdrop: with nothing behind the
    # subject, the shadow side needs its own thin rim or its silhouette
    # disappears into the black.
    "studio-black": [
        {"azimuth": 80, "elevation": 30, "distance": 2.2, "width": 0.5, "length": 1.0, "power": 1.0},
        {"azimuth": -150, "elevation": 20, "width": 0.1, "length": 3, "power": 1.6},
        {"azimuth": -165, "elevation": 12, "width": 0.05, "length": 3, "power": 0.9},
        {"azimuth": 20, "elevation": 70, "width": 2.5, "length": 2.5, "power": 0.06},
    ],
    # The approved "C" lighting: as above, but the back rim at camera-right
    # (whose mirror reflection otherwise blows out the vessel's left edge)
    # turned well down, and a long soft strip above the camera for dark,
    # glossy metal to reflect so it keeps its detail.
    "studio-c": [
        {"azimuth": 80, "elevation": 30, "distance": 2.2, "width": 0.5, "length": 1.0, "power": 1.1},
        {"azimuth": -150, "elevation": 20, "width": 0.1, "length": 3, "power": 0.25},
        {"azimuth": 20, "elevation": 70, "width": 2.5, "length": 2.5, "power": 0.06},
        {"azimuth": 10, "elevation": 40, "distance": 2.5, "width": 0.25, "length": 3, "power": 0.25},
    ],
    "studio-black-c": [
        {"azimuth": 80, "elevation": 30, "distance": 2.2, "width": 0.5, "length": 1.0, "power": 1.0},
        {"azimuth": -150, "elevation": 20, "width": 0.1, "length": 3, "power": 0.25},
        {"azimuth": -165, "elevation": 12, "width": 0.05, "length": 3, "power": 0.6},
        {"azimuth": 20, "elevation": 70, "width": 2.5, "length": 2.5, "power": 0.06},
        {"azimuth": 10, "elevation": 40, "distance": 2.5, "width": 0.25, "length": 3, "power": 0.25},
    ],
    # Black-detail light, after the moodboard's black motor and dryer: two
    # big soft boxes whose reflections slide across dark glossy metal as
    # long gradients (the mid-tones the references are full of), a hard
    # strip rim either side behind for crisp edge lines, and nothing else.
    "black-detail": [
        {"azimuth": 55, "elevation": 40, "distance": 2.0, "width": 1.6, "length": 2.4, "power": 0.45},
        {"azimuth": -40, "elevation": 15, "distance": 2.4, "width": 1.0, "length": 2.8, "power": 0.18},
        {"azimuth": 150, "elevation": 20, "width": 0.08, "length": 3, "power": 0.35},
        {"azimuth": -160, "elevation": 15, "width": 0.06, "length": 3, "power": 0.3},
        # A big dim card overhead: something for flat metal tops to reflect.
        {"azimuth": 0, "elevation": 80, "width": 2.5, "length": 2.5, "power": 0.12},
    ],
    # A soft high-key cove: a huge overhead box, a big frontal fill and two
    # broad side cards, so the subject is evenly lit with gentle falloff and
    # glass parts glow softly; no hard key.
    "soft-cove": [
        {"azimuth": 0, "elevation": 75, "distance": 2.0, "width": 3.5, "length": 3.5, "power": 0.35},
        {"azimuth": 15, "elevation": 20, "distance": 2.6, "width": 3.0, "length": 2.0, "power": 0.18},
        {"azimuth": 80, "elevation": 25, "distance": 2.4, "width": 1.6, "length": 2.6, "power": 0.12},
        {"azimuth": -80, "elevation": 25, "distance": 2.4, "width": 1.6, "length": 2.6, "power": 0.1},
    ],
    "studio-classic": [
        {"azimuth": 25, "elevation": 55, "width": 3, "length": 3, "power": 0.5},
        {"azimuth": 140, "elevation": 25, "width": 0.15, "length": 3, "power": 1.0},
        {"azimuth": -140, "elevation": 25, "width": 0.15, "length": 3, "power": 0.8},
    ],
    # Long thin strips skimming in from behind, so only edges and the turn
    # of each surface catch light, and a faint wash from above that just
    # separates the top planes from the black.
    "void": [
        {"azimuth": 125, "elevation": 20, "width": 0.12, "length": 3, "power": 1.6},
        {"azimuth": -110, "elevation": 8, "width": 0.08, "length": 3, "power": 0.7},
        {"azimuth": 10, "elevation": 70, "width": 1.5, "length": 1.5, "power": 0.08},
    ],
    # Product-photography lighting with a clear direction: a large key
    # high at camera-left, close enough that inverse-square falloff shows
    # across the subject; a dim fill card low at camera-right for roughly
    # a 4:1 ratio; a strip rim from behind to cut the silhouette; and a
    # black flag at camera-right so metal there reflects a dark band.
    "studio": [
        {"azimuth": 40, "elevation": 35, "distance": 1.8, "width": 1.0, "length": 1.4, "power": 0.6},
        {"azimuth": -30, "elevation": 5, "distance": 2.4, "width": 2.5, "length": 2.0, "power": 0.05},
        {"azimuth": 145, "elevation": 30, "distance": 1.3, "width": 0.15, "length": 2.5, "power": 1.0},
        {"flag": True, "azimuth": -75, "elevation": 10, "distance": 1.4, "width": 1.6, "length": 2.6},
    ],
}


def reset_stage():
    """Clear what the previous shot added around the model: lights and any
    context set (floors, props, planets)."""
    for o in [o for o in bpy.context.scene.objects if o.type == "LIGHT" or "stage" in o]:
        bpy.data.objects.remove(o)


def is_panel(model, o):
    """A large thin plate: an enclosure wall or cover."""
    blo, bhi = model.boxes[o]
    dims = np.sort(bhi - blo)
    return dims[2] > 0.6 and dims[0] < 0.06 * dims[2] and dims[1] > 0.25 * dims[2]


def frosted_glass(look):
    m = bpy.data.materials.new("lit:frosted")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb_to_linear(look.get("frost_colour", "#e6e9ec")), 1)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["Roughness"].default_value = look.get("frost_roughness", 0.32)
    if look.get("smudges"):
        # Handling marks: a scanned fingerprint map roughens patches of the
        # glass, so it reads as a real panel rather than perfect CG glass.
        nt = m.node_tree
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (look.get("smudge_tiling", 2.5),) * 3
        nt.links.new(geo.outputs["Position"], mp.inputs["Vector"])
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(os.path.join(HERE, "textures", "pbr", "Fingerprints001",
                                                      "Fingerprints001_2K-JPG_Roughness.jpg"), check_existing=True)
        tex.image.colorspace_settings.name = "Non-Color"
        tex.projection = "BOX"
        tex.projection_blend = 0.4
        nt.links.new(mp.outputs["Vector"], tex.inputs["Vector"])
        r = nt.nodes.new("ShaderNodeMapRange")
        r.inputs["To Min"].default_value = look.get("frost_roughness", 0.32)
        r.inputs["To Max"].default_value = look.get("frost_roughness", 0.32) + look["smudges"]
        nt.links.new(tex.outputs["Color"], r.inputs["Value"])
        nt.links.new(r.outputs["Result"], b.inputs["Roughness"])
    b.inputs["IOR"].default_value = 1.49
    return m


def assign_lit_materials(model, look):
    parts = PARTS.get(model.name, {})
    shell = parts.get("shell", [])
    alias = {name: look.get("shell_finish", shell[0]) for name in shell} if shell else {}
    for names in parts.get("matched", []):
        alias.update({name: names[0] for name in names})
    look = dict(look, _welds=parts.get("welds", []), _alias=alias, _shell=tuple(shell),
                _axis=((model.reactor[0].x + model.reactor[1].x) / 2, (model.reactor[0].y + model.reactor[1].y) / 2))
    for m in [m for m in bpy.data.materials if m.name.startswith(("xray", "lit:"))]:
        bpy.data.materials.remove(m)
    cache = {}
    real = look.get("materials") == "real"
    for o, names in model.slots.items():
        for slot, original in zip(o.material_slots, names):
            if real:
                # Per part, not per CAD colour: instanced parts share mesh
                # data, so the material goes on the object.
                kind = real_kind(model, o, original, look)
                # Material tryouts: one finish for everything ("force_kind"),
                # optionally another for the big bodies ("big_kind": vessels,
                # tanks, anything over 0.8 m across).
                if look.get("force_kind"):
                    kind = look["force_kind"]
                if look.get("big_kind"):
                    blo, bhi = model.boxes[o]
                    if float(np.linalg.norm(bhi - blo)) > 0.8:
                        kind = look["big_kind"]
                k = (kind, original)
                if k not in cache:
                    cache[k] = lit_material_classic(original, look, force=kind)
                    cache[k].name = f"lit:{kind}:{original}"
                slot.link = "OBJECT"
                slot.material = cache[k]
                continue
            big = look.get("frosted_big") and float(np.linalg.norm(model.boxes[o][1] - model.boxes[o][0])) > look["frosted_big"]
            if (look.get("frosted_panels") and is_panel(model, o)) or big:
                # Enclosure panels as frosted glass, so the internals show
                # through as darker shapes, like a ghosted product render.
                if "frosted" not in cache:
                    cache["frosted"] = frosted_glass(look)
                slot.link = "OBJECT"
                slot.material = cache["frosted"]
                continue
            slot.link = "DATA"
            if original not in cache:
                make = lit_material_classic if look.get("style") == "classic" else lit_material
                cache[original] = make(original, look)
            slot.material = cache[original]


def lit_render_settings(shot):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.samples = shot.get("samples", 192)
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    # Keep fine surface detail: prefilter the guide passes accurately and
    # use the highest-quality model, so grain isn't smeared into blotches.
    sc.cycles.denoising_prefilter = "ACCURATE"
    if hasattr(sc.cycles, "denoising_quality"):
        sc.cycles.denoising_quality = "HIGH"
    sc.cycles.max_bounces = 12
    sc.cycles.glossy_bounces = 8
    sc.cycles.transmission_bounces = 12
    # Sample where it's needed and stop where it's clean.
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = shot.get("noise_threshold", 0.005)
    # A narrower pixel filter than the default 1.5 px: crisper edges and
    # fine detail, as a sharp lens gives.
    sc.cycles.filter_width = shot.get("filter_width", 1.0)
    sc.cycles.transparent_max_bounces = 16
    sc.cycles.min_transparent_bounces = 0
    sc.cycles.volume_bounces = 0
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"


def studio_environment(nt, camera_azimuth, look):
    """What the metal sees: a procedural photo studio around the subject.

    Polished metal is a mirror, and in a real studio it mirrors the room —
    a lit cyclorama wall making a bright band at the horizon, a grey floor
    below, a dark ceiling with a big softbox overhead, and tall strip boxes
    either side of the camera. Reflected in curved steel those become the
    long highlights and dark bands that make metal read as metal. The
    camera never sees any of this; it only ever sees the backdrop.
    Returns the shader socket.
    """
    N, L = nt.nodes.new, nt.links.new

    def smooth(value, a, b):
        n = N("ShaderNodeMapRange")
        n.interpolation_type = "SMOOTHSTEP"
        n.inputs["From Min"].default_value = a
        n.inputs["From Max"].default_value = b
        L(value, n.inputs["Value"])
        return n.outputs["Result"]

    def op(kind, a, b=None):
        n = N("ShaderNodeMath")
        n.operation = kind
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs[0]

    tc = N("ShaderNodeTexCoord")
    turn = N("ShaderNodeVectorRotate")
    turn.rotation_type = "Z_AXIS"
    turn.inputs["Angle"].default_value = -math.radians(camera_azimuth)
    L(tc.outputs["Generated"], turn.inputs["Vector"])
    xyz = N("ShaderNodeSeparateXYZ")
    L(turn.outputs["Vector"], xyz.inputs["Vector"])
    z = xyz.outputs["Z"]
    # Azimuth relative to the camera: 0 is straight back towards it.
    az = op("ARCTAN2", xyz.outputs["Y"], xyz.outputs["X"])

    s = look.get("environment", 0.18)
    floor = op("MULTIPLY", op("SUBTRACT", 1.0, smooth(z, -0.25, 0.0)), 0.12 * s)
    band = op("MULTIPLY", op("MULTIPLY", smooth(z, -0.08, 0.04), op("SUBTRACT", 1.0, smooth(z, 0.12, 0.35))), 0.45 * s)
    overhead = op("MULTIPLY", smooth(z, 0.78, 0.9), 0.6 * s)
    total = op("ADD", op("ADD", floor, band), op("ADD", overhead, 0.012 * s))
    # One tall strip box at camera-left only; the right side is flagged.
    for side in (1,):
        offset = op("ABSOLUTE", op("SUBTRACT", az, side * math.radians(55)))
        width = op("SUBTRACT", 1.0, smooth(offset, math.radians(4), math.radians(9)))
        height = op("MULTIPLY", smooth(z, -0.15, -0.05), op("SUBTRACT", 1.0, smooth(z, 0.7, 0.8)))
        total = op("ADD", total, op("MULTIPLY", op("MULTIPLY", width, height), 2.4 * s))
    bg = N("ShaderNodeBackground")
    L(total, bg.inputs["Strength"])
    bg.inputs["Color"].default_value = (0.95, 0.97, 1.0, 1)
    return bg.outputs["Background"]


# Per-model defaults for the lit looks. The spacecraft isn't something that
# stands on a floor, so it floats in front of the backdrop instead.
MODEL_LOOK = {"space-nuclear": {"sweep": False}}


def add_sweep(model, camera_azimuth, look):
    """A photo studio's paper sweep: floor running under the model, curving
    up into a tall wall behind it (away from the camera). Real geometry,
    so the model stands on it, casts contact shadows and the backdrop's
    gradient is just the key light falling off across it."""
    import bmesh
    r = (model.hi - model.lo).length / 2
    behind, bend, height, front, width = r * 1.7, r * 1.4, r * 14, r * 60, r * 40
    profile = [(-front, 0.0), (behind, 0.0)]
    for i in range(1, 17):
        a = math.pi / 2 * i / 16
        profile.append((behind + bend * math.sin(a), bend * (1 - math.cos(a))))
    profile.append((behind + bend, height))
    bm = bmesh.new()
    rows = []
    for x in (-width / 2, width / 2):
        rows.append([bm.verts.new((x, y, z)) for y, z in profile])
    for i in range(len(profile) - 1):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    mesh = bpy.data.meshes.new("sweep")
    bm.to_mesh(mesh)
    bm.free()
    mesh.shade_smooth()
    obj = stage_object("sweep", mesh, ((model.lo.x + model.hi.x) / 2, (model.lo.y + model.hi.y) / 2, model.lo.z - 0.001))
    # Local +Y points away from the camera.
    obj.rotation_euler = (0, 0, math.radians(camera_azimuth + 90))
    paper = simple_material("sweep", look.get("sweep_colour", "#4d5459"), look.get("sweep_roughness", 0.85))
    nt = paper.node_tree
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 40
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.03
    nt.links.new(n.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], nt.nodes["Principled BSDF"].inputs["Normal"])
    mesh.materials.append(paper)


PLATES = {
    # Riveted brushed-aluminium data plate with etched black text.
    "nameplate": {"size": (0.2, 0.11), "finish": "brushed", "ink": "polymer", "rivets": True,
                  "lines": [("ANTARES", 0.026, 0.028), ("MARK-0  MICROREACTOR", 0.0105, -0.002),
                            ("MODEL  MK-0", 0.0075, -0.024), ("SERIAL  000-000", 0.0075, -0.036)]},
    # Printed safety label on white polymer film.
    "caution": {"size": (0.13, 0.065), "finish": "label", "ink": "polymer", "rivets": False,
                "lines": [("CAUTION", 0.02, 0.008), ("RADIATION AREA", 0.0085, -0.017)]},
}


def add_plates(model, look):
    """Nameplates and labels on the vessel wall, from PARTS[model]["plates"].

    Each is found by casting a ray at the wall, then built flat and wrapped
    onto the wall's own radius around the model's vertical axis, so a plate
    sits flush on a curved vessel instead of touching it at one line.
    """
    specs = PARTS.get(model.name, {}).get("plates", [])
    if not specs:
        return
    cx, cy = (model.lo.x + model.hi.x) / 2, (model.lo.y + model.hi.y) / 2
    outer = max(model.hi.x - cx, model.hi.y - cy) * 1.5
    depsgraph = bpy.context.evaluated_depsgraph_get()
    finishes = {
        "brushed": lit_material("plate:brushed", dict(look, finishes={"brushed": 1})),
        "label": lit_material("plate:label", dict(look, finishes={"frosted": 1}, albedo=(0.7, 0.72))),
        "polymer": lit_material("plate:ink", dict(look, finishes={"polymer": 1})),
    }

    def wrap(obj, theta, wall, z, lift):
        """Bend a flat object (x across, y up, z out) onto the wall."""
        me = obj.data
        for v in me.vertices:
            u, h, w = v.co
            a = theta + u / wall
            rr = wall + lift + w
            v.co = (cx + rr * math.cos(a), cy + rr * math.sin(a), z + h)
        obj.matrix_world = Matrix.Identity(4)

    for spec in specs:
        plate = PLATES[spec["kind"]]
        theta = math.radians(spec["azimuth"])
        z = spec["z"]
        origin = Vector((cx + outer * math.cos(theta), cy + outer * math.sin(theta), z))
        hit, where, *_ = bpy.context.scene.ray_cast(depsgraph, origin, Vector((-math.cos(theta), -math.sin(theta), 0)))
        if not hit:
            continue
        wall = math.hypot(where.x - cx, where.y - cy)
        w, h = plate["size"]
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=32, y_subdivisions=2, size=1)
        base = bpy.context.active_object
        base.name, base["stage"] = f"plate-{spec['kind']}", True
        base.scale = (w, h, 1)
        bpy.ops.object.transform_apply(scale=True)
        solid = base.modifiers.new("thickness", "SOLIDIFY")
        solid.thickness = 0.0012
        solid.offset = 1
        bpy.ops.object.modifier_apply(modifier=solid.name)
        wrap(base, theta, wall, z, 0.0004)
        base.data.materials.append(finishes[plate["finish"]])
        base.data.shade_smooth()

        for text, size, y in plate["lines"]:
            curve = bpy.data.curves.new("text", "FONT")
            curve.body = text
            curve.size = size
            curve.align_x = "CENTER"
            curve.extrude = 0.00008
            curve.resolution_u = 4
            font = bpy.data.objects.new("text", curve)
            bpy.context.scene.collection.objects.link(font)
            font.location = (0, y - size * 0.35, 0)
            bpy.context.view_layer.update()
            mesh = bpy.data.meshes.new_from_object(font.evaluated_get(bpy.context.evaluated_depsgraph_get()))
            for v in mesh.vertices:
                v.co = (v.co.x, v.co.y + font.location.y, v.co.z)
            bpy.data.objects.remove(font)
            ink = stage_object("plate-text", mesh)
            wrap(ink, theta, wall, z, 0.0004 + 0.0012 + 0.00002)
            mesh.materials.append(finishes[plate["ink"]])

        if plate["rivets"]:
            for sx in (-1, 1):
                for sy in (-1, 1):
                    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.0035,
                                                         location=(sx * (w / 2 - 0.008), sy * (h / 2 - 0.008), 0))
                    rivet = bpy.context.active_object
                    rivet.name, rivet["stage"] = "rivet", True
                    rivet.scale = (1, 1, 0.45)
                    bpy.ops.object.transform_apply(location=True, scale=True)
                    wrap(rivet, theta, wall, z, 0.0004 + 0.0012)
                    rivet.data.materials.append(finishes["brushed"])
                    rivet.data.shade_smooth()
        depsgraph = bpy.context.evaluated_depsgraph_get()


def add_backdrop_wall(model, look):
    """A real backdrop for the dark set, lit the way a studio lights one.

    A huge matte slate wall stands square to the camera, far enough behind
    the model that the key and rims don't spill onto it, as a photographer
    would place it. Its tone comes from its own soft background light,
    hidden behind the model and facing the wall (area lights emit only
    forwards, so it never touches the model): a pool of light behind the
    subject that falls off naturally towards the edges of the frame.
    """
    # The camera was just placed; commit it so matrix_world is current.
    bpy.context.view_layer.update()
    cam = bpy.context.scene.camera
    fwd = (cam.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
    origin = cam.matrix_world.translation.copy()
    far = max((p - origin).dot(fwd) for p in model.corners())
    radius = (model.full_hi - model.full_lo).length / 2
    depth = far + radius * look.get("wall_gap", 2.5)
    at = origin + fwd * depth
    # Built from data rather than an operator: operators act on whatever
    # is active, which isn't reliable in a background render.
    half = depth * 3
    mesh = bpy.data.meshes.new("backdrop")
    mesh.from_pydata([(-half, -half, 0), (half, -half, 0), (half, half, 0), (-half, half, 0)], [], [(0, 1, 2, 3)])
    wall = stage_object("backdrop", mesh, at)
    wall.rotation_euler = (-fwd).to_track_quat("Z", "Y").to_euler()
    paper = simple_material("backdrop", look.get("wall", "#5a6578"), 0.9)
    paper.node_tree.nodes["Principled BSDF"].inputs["Specular IOR Level"].default_value = 0.2
    wall.data.materials.append(paper)

    # Background light: just behind the model, a little low, aimed at the
    # wall, so the pool sits behind the subject and the top of the frame
    # stays darker, like the moodboard's pump.
    gap = depth - far
    data = bpy.data.lights.new("background", "AREA")
    data.shape = "DISK"
    # A smaller lamp closer to the wall makes a tighter pool of light.
    data.size = gap * look.get("bg_size", 1.6)
    d = gap * look.get("bg_dist", 0.6)
    data.energy = look.get("bg_power", 1.0) * 60 * d * d
    up = (cam.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()
    lamp = stage_object("background", data, at - fwd * d - up * gap * look.get("bg_low", 0.25))
    lamp.rotation_euler = fwd.to_track_quat("-Z", "Y").to_euler()
    lamp.visible_camera = False

    # Light linking: the rig lights the model only, the background light
    # the wall only — what flags and placement do on a real set.
    only_wall = bpy.data.collections.get("backdrop-only") or bpy.data.collections.new("backdrop-only")
    for o in list(only_wall.objects):
        only_wall.objects.unlink(o)
    only_wall.objects.link(wall)
    for item in only_wall.collection_objects:
        item.light_linking.link_state = "EXCLUDE"
    for light in [o for o in bpy.context.scene.objects if o.type == "LIGHT" and o is not lamp]:
        light.light_linking.receiver_collection = only_wall
    wall_only = bpy.data.collections.get("wall-only") or bpy.data.collections.new("wall-only")
    for o in list(wall_only.objects):
        wall_only.objects.unlink(o)
    wall_only.objects.link(wall)
    lamp.light_linking.receiver_collection = wall_only


def setup_lit(shot, model):
    kind = shot["look"]
    # Studio defaults to the approved look; "physical" is the reworked
    # one (sweep floor, key/fill/flag, AgX), kept for comparison.
    look = dict({"style": "classic"} if kind == "studio" else {}, **shot.get("look_settings", {}))
    shot["look_settings"] = look
    classic = look.get("style") == "classic"
    sc = bpy.context.scene
    assign_lit_materials(model, look)

    c = shot["camera"]
    target = model.lo + (model.hi - model.lo) * Vector(c.get("focus", (0.5, 0.5, 0.5))) + Vector(c.get("offset", (0, 0, 0)))
    # The rig scales with the framed area. `rig_zoom` sizes it as a shot
    # with that zoom would, whatever the framing: a box-fitted wide shot at
    # 1.45 lights like the approved hero (zoom 1.45), whose vessel reads
    # dark and polished, where its own zoom of 1 washes the metal out.
    view = {"azimuth": c.get("azimuth", 0), "radius": (model.hi - model.lo).length / 2 / c.get("rig_zoom", c.get("zoom", 1))}
    rig = look.get("rig", "studio-classic" if classic and kind == "studio" else kind)
    for i, light in enumerate(RIGS[rig] if isinstance(rig, str) else rig):
        add_light(f"light{i}", target, view, light)
    if kind == "studio" and look.get("cove"):
        # A light seamless cove (floor curving into wall) with a soft sheen
        # on the floor, so the subject sits on it with a faint reflection.
        add_sweep(model, c.get("azimuth", 0), look)
    elif kind == "studio" and not classic and look.get("sweep", MODEL_LOOK.get(model.name, {}).get("sweep", True)):
        add_sweep(model, c.get("azimuth", 0), look)
    if kind in ("studio", "void") and look.get("plates", not classic):
        add_plates(model, look)
    if kind == "studio" and look.get("dark"):
        add_backdrop_wall(model, look)

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes["Background"]
    if kind == "studio":
        # The camera sees a vertical gradient fixed to the frame (window
        # coordinates), whatever the angle; everything else gets a dim
        # neutral fill so shadows aren't dead black.
        coords = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        top, bottom = look.get("backdrop", ("#5b6770", "#b4bec3"))
        ramp.color_ramp.elements[0].color = (*srgb_to_linear(bottom), 1)
        ramp.color_ramp.elements[1].color = (*srgb_to_linear(top), 1)
        nt.links.new(coords.outputs["Window"], sep.inputs["Vector"])
        nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
        if classic:
            flat = nt.nodes.new("ShaderNodeBackground")
            # Ambient fill: lower it for deeper shadows. On a dark set it
            # takes the room's slate colour, so shadow sides and reflections
            # pick up the same blue-grey as the backdrop.
            f = look.get("fill", 0.05)
            if look.get("dark"):
                room = srgb_to_linear(look.get("room", "#3a4252"))
                flat.inputs["Color"].default_value = (*(room * f / 0.04), 1)
            else:
                flat.inputs["Color"].default_value = (f, f * 1.1, f * 1.2, 1)
            fill = flat.outputs["Background"]
            if look.get("hdri"):
                # A photographed studio for everything but the camera: real
                # softboxes, stands and walls for metal and glass to reflect,
                # and the light they bounce. Turned with the camera so the
                # same part of the room is behind it in every shot.
                tc = nt.nodes.new("ShaderNodeTexCoord")
                rot = nt.nodes.new("ShaderNodeMapping")
                rot.inputs["Rotation"].default_value[2] = math.radians(c.get("azimuth", 0) + look.get("hdri_rotation", 0))
                nt.links.new(tc.outputs["Generated"], rot.inputs["Vector"])
                env = nt.nodes.new("ShaderNodeTexEnvironment")
                env.image = bpy.data.images.load(os.path.join(HERE, "textures", "hdri", look["hdri"]), check_existing=True)
                nt.links.new(rot.outputs["Vector"], env.inputs["Vector"])
                hdr = nt.nodes.new("ShaderNodeBackground")
                hdr.inputs["Strength"].default_value = look.get("hdri_strength", 1.0)
                nt.links.new(env.outputs["Color"], hdr.inputs["Color"])
                fill = hdr.outputs["Background"]
        else:
            fill = studio_environment(nt, c.get("azimuth", 0), look)
        path = nt.nodes.new("ShaderNodeLightPath")
        mix = nt.nodes.new("ShaderNodeMixShader")
        backdrop = nt.nodes.new("ShaderNodeBackground")
        nt.links.new(ramp.outputs["Color"], backdrop.inputs["Color"])
        nt.links.new(path.outputs["Is Camera Ray"], mix.inputs["Fac"])
        nt.links.new(fill, mix.inputs[1])
        nt.links.new(backdrop.outputs["Background"], mix.inputs[2])
        nt.links.new(mix.outputs["Shader"], nt.nodes["World Output"].inputs["Surface"])
    else:
        bg.inputs["Color"].default_value = (0, 0, 0, 1)
    sc.world = world
    lit_render_settings(shot)


# ---------------------------------------------------------------- inside


def setup_inside(shot, model):
    """Inside the structure, as in the white lattice reference: every part
    frosted white, lit by an even grey sky that reaches in through the
    gaps, so depth reads as soft occlusion — open space bright, deep pockets
    grey — rather than as shadows from a key light. A soft lamp at the
    camera, like an inspection light, keeps enclosed spaces from going dark.
    """
    look = dict({"albedo": (0.6, 0.82), "finishes": {"frosted": 1}, "edge_wear": 0.1, "cavity_depth": 0.8,
                 "saturation": 0.08, "tint": "#eef2f5"}, **shot.get("look_settings", {}))
    shot["look_settings"] = look
    assign_lit_materials(model, look)
    sss = look.get("translucency", 0.2)
    cap = srgb_to_linear(look.get("cap", "#cdd2d5"))
    for m in bpy.data.materials:
        if m.name.startswith("lit:"):
            nt = m.node_tree
            b = nt.nodes["Principled BSDF"]
            b.inputs["Subsurface Weight"].default_value = sss
            b.inputs["Subsurface Scale"].default_value = look.get("translucency_depth", 0.004)
            # Section caps: a cutaway opens solids, and through the cut you
            # only ever see a part's inside — its back faces. Painting those
            # one flat tone fills the cut like a section drawing instead of
            # leaving dark hollow shells (the same trick as CadViewer.ts).
            geo = nt.nodes.new("ShaderNodeNewGeometry")
            flat = nt.nodes.new("ShaderNodeEmission")
            flat.inputs["Color"].default_value = (*cap, 1)
            flat.inputs["Strength"].default_value = look.get("cap_strength", 0.6)
            mix = nt.nodes.new("ShaderNodeMixShader")
            out = nt.nodes["Material Output"]
            nt.links.new(geo.outputs["Backfacing"], mix.inputs["Fac"])
            nt.links.new(b.outputs["BSDF"], mix.inputs[1])
            nt.links.new(flat.outputs["Emission"], mix.inputs[2])
            nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])

    sc = bpy.context.scene
    world = bpy.data.worlds.new("inside")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*srgb_to_linear(look.get("sky", "#d9dde0")), 1)
    bg.inputs["Strength"].default_value = look.get("sky_strength", 1.0)
    sc.world = world

    cam = sc.camera
    data = bpy.data.lights.new("headlamp", "AREA")
    data.shape = "DISK"
    span = (cam.location - (model.lo + (model.hi - model.lo) * Vector(shot["camera"].get("focus", (0.5, 0.5, 0.5))))).length
    data.size = span * 0.6
    data.energy = look.get("headlamp", 40) * span * span
    # At the near clip plane, so a cutaway's removed wall can't shade it
    # (lights ignore camera clipping).
    ahead = cam.matrix_world.to_3x3() @ Vector((0, 0, -1))
    lamp = stage_object("headlamp", data, cam.location + ahead * cam.data.clip_start)
    lamp.rotation_euler = cam.rotation_euler
    lit_render_settings(shot)
    sc.cycles.max_bounces = 12
    sc.cycles.diffuse_bounces = 8


# ---------------------------------------------------------------- context


def stage_object(name, data, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, data)
    obj["stage"] = True
    obj.location = location
    bpy.context.scene.collection.objects.link(obj)
    return obj


def primitive(kind, name, **kw):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(**kw)
    obj = bpy.context.active_object
    obj.name = name
    obj["stage"] = True
    return obj


def simple_material(name, colour, roughness=0.5, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*srgb_to_linear(colour), 1)
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    return m


def sun(direction, strength, angle=0.53):
    data = bpy.data.lights.new("sun", "SUN")
    data.energy = strength
    data.angle = math.radians(angle)
    obj = stage_object("sun", data)
    obj.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()


def view_direction(shot, azimuth_offset, elevation):
    """A world direction placed relative to the camera, like the light rigs:
    azimuth 0 is behind the camera, 180 behind the model."""
    az = math.radians(shot["camera"].get("azimuth", 0) + azimuth_offset)
    el = math.radians(elevation)
    return Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))


# NASA Blue Marble Next Generation imagery (public domain), downloaded into
# scripts/render/textures/ (gitignored). Without them the orbit look falls
# back to a procedural Earth.
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74218/world.200412.3x21600x10800.jpg
#   https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif
EARTH_TEXTURES = {
    "colour": os.path.join(HERE, "textures", "blue-marble-december-21600.jpg"),
    "clouds": os.path.join(HERE, "textures", "clouds-8192.tif"),
}


def stage_orbit(shot, model, look):
    """Low Earth orbit, to scale: a 6371 km planet `altitude` below the
    model, a cloud shell with relief, and a single-scattering atmosphere
    over both. By default the model sits over the South Atlantic off
    Argentina, under a swirl of mid-latitude weather."""
    R = 6.371e6
    h = look.get("altitude", 420e3)
    centre = (model.lo + model.hi) / 2
    earth_at = centre - Vector((0, 0, R + h))
    to_sun = view_direction(shot, look.get("sun_azimuth", 110), look.get("sun_elevation", 12))
    sun(to_sun, look.get("sun_strength", 5))

    def shell(name, radius, material):
        obj = primitive("uv_sphere", name, segments=512, ring_count=256, radius=radius, location=earth_at)
        obj.data.shade_smooth()
        obj.data.materials.append(material)
        # The sphere's pole is under the model; spin it about that pole to
        # bring `longitude` (degrees east) round, then tip it so `latitude`
        # sits there instead. Z first: tipping first would leave the spin
        # turning the planet in place under the model.
        obj.rotation_mode = "ZYX"
        obj.rotation_euler = (math.radians(90 - look.get("latitude", -40)), 0, math.radians(90 - look.get("longitude", -50)))
        return obj

    def image(nt, path, colour=True):
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path, check_existing=True)
        tex.image.colorspace_settings.name = "sRGB" if colour else "Non-Color"
        tex.interpolation = "Cubic"
        return tex

    real = all(os.path.exists(p) for p in EARTH_TEXTURES.values())

    def noise(nt, scale, detail, roughness=0.6):
        coords = nt.nodes.new("ShaderNodeTexCoord")
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.noise_dimensions = "3D"
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = roughness
        nt.links.new(coords.outputs["Generated"], n.inputs["Vector"])
        return n

    def ramp(nt, source, stops):
        r = nt.nodes.new("ShaderNodeValToRGB")
        els = r.color_ramp.elements
        els[0].position, els[0].color = stops[0][0], (*stops[0][1], 1)
        els[1].position, els[1].color = stops[1][0], (*stops[1][1], 1)
        nt.links.new(source, r.inputs["Fac"])
        return r

    ground = bpy.data.materials.new("earth")
    ground.use_nodes = True
    nt = ground.node_tree
    b = nt.nodes["Principled BSDF"]
    if real:
        tex = image(nt, EARTH_TEXTURES["colour"])
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
        # Water is where blue clearly beats red in the imagery: give it a
        # smooth surface so the sun glints off it, land stays matte.
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(tex.outputs["Color"], sep.inputs["Color"])
        diff = nt.nodes.new("ShaderNodeMath")
        diff.operation = "SUBTRACT"
        nt.links.new(sep.outputs["Blue"], diff.inputs[0])
        nt.links.new(sep.outputs["Red"], diff.inputs[1])
        water = ramp(nt, diff.outputs["Value"], [(0.01, (0.85, 0.85, 0.85)), (0.04, (0.18, 0.18, 0.18))])
        nt.links.new(water.outputs["Color"], b.inputs["Roughness"])
        shell("earth", R, ground)
    land = noise(nt, 7, 12, 0.62)
    mask = ramp(nt, land.outputs["Fac"], [(0.53, (0, 0, 0)), (0.56, (1, 1, 1))])
    colour = nt.nodes.new("ShaderNodeMix")
    colour.data_type = "RGBA"
    colour.inputs["A"].default_value = (0.002, 0.008, 0.02, 1)
    colour.inputs["B"].default_value = (0.045, 0.05, 0.035, 1)
    nt.links.new(mask.outputs["Color"], colour.inputs["Factor"])
    if not real:
        nt.links.new(colour.outputs["Result"], b.inputs["Base Color"])
        rough = ramp(nt, mask.outputs["Color"], [(0, (0.12, 0.12, 0.12)), (1, (0.9, 0.9, 0.9))])
        nt.links.new(rough.outputs["Color"], b.inputs["Roughness"])
        shell("earth", R, ground)

    def node(nt, kind, *inputs, op=None):
        """A math node with its inputs wired: sockets link, numbers and
        vectors are set as defaults."""
        n = nt.nodes.new(kind)
        if op:
            n.operation = op
        for i, value in enumerate(inputs):
            # A vector scale's factor is its own socket, after the vectors.
            socket = n.inputs["Scale"] if op == "SCALE" and i == 1 else n.inputs[i]
            if isinstance(value, bpy.types.NodeSocket):
                nt.links.new(value, socket)
            else:
                socket.default_value = value
        return n.outputs[1 if kind == "ShaderNodeVectorMath" and op in ("DOT_PRODUCT", "LENGTH", "DISTANCE") else 0]

    def m(nt, op, *inputs):
        return node(nt, "ShaderNodeMath", *inputs, op=op)

    def v(nt, op, *inputs):
        return node(nt, "ShaderNodeVectorMath", *inputs, op=op)

    def metric_noise(nt, size, detail, roughness=0.6, distortion=0.0):
        """Noise with features `size` metres across, wherever on the planet."""
        coords = nt.nodes.new("ShaderNodeTexCoord")
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.noise_dimensions = "3D"
        n.inputs["Scale"].default_value = 1 / size
        n.inputs["Detail"].default_value = detail
        n.inputs["Roughness"].default_value = roughness
        n.inputs["Distortion"].default_value = distortion
        nt.links.new(coords.outputs["Object"], n.inputs["Vector"])
        return n.outputs["Fac"]

    clouds = bpy.data.materials.new("clouds")
    clouds.use_nodes = True
    nt = clouds.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    # Weather systems (large, swirled), cloud fields within them, and
    # cumulus texture within those; each layer multiplies the last.
    big = noise(nt, 5, 4)
    big.inputs["Distortion"].default_value = 1.2
    fine = noise(nt, 40, 14, 0.65)
    fine.inputs["Distortion"].default_value = 0.4
    puffs = noise(nt, 260, 8, 0.6)
    three = m(nt, "MULTIPLY", m(nt, "MULTIPLY", big.outputs["Fac"], fine.outputs["Fac"]), puffs.outputs["Fac"])
    cover = look.get("clouds", 0.33)
    density = m(nt, "MULTIPLY", three, 2.8)
    lo, hi = cover, cover + 0.05
    if real:
        # NASA's cloud map is brightness = cloud, but at 5 km a pixel it is
        # soft from orbit. Erode it with metre-scaled noise so edges break
        # into cloud streets and cells, as real decks do from 400 km.
        cl = image(nt, EARTH_TEXTURES["clouds"], colour=False)
        # Two scales: cloud fields tens of kilometres across, and the
        # cumulus cells a few kilometres across that texture them.
        fields = metric_noise(nt, look.get("cloud_detail_size", 40e3), 12, 0.64, 0.3)
        detail = metric_noise(nt, look.get("cloud_cell_size", 4e3), 8, 0.62, 0.5)
        density = cl.outputs["Color"]
        for n, amount in ((fields, look.get("cloud_erosion", 0.55)), (detail, look.get("cloud_cells", 0.3))):
            density = m(nt, "ADD", density, m(nt, "MULTIPLY", m(nt, "SUBTRACT", n, 0.5), amount))
        lo, hi = look.get("cloud_cover", (0.2, 0.55))
    alpha = ramp(nt, density, [(lo, (0, 0, 0)), (hi, (1, 1, 1))])
    white = nt.nodes.new("ShaderNodeBsdfDiffuse")
    white.inputs["Color"].default_value = (*([look.get("cloud_albedo", 0.88)] * 3), 1)
    if real:
        # Relief: thick cloud stands kilometres proud, and a low sun picks
        # out every billow. Height follows the same noise as the erosion.
        relief = nt.nodes.new("ShaderNodeBump")
        relief.inputs["Distance"].default_value = look.get("cloud_relief", 800)
        nt.links.new(m(nt, "MULTIPLY", alpha.outputs["Color"], detail), relief.inputs["Height"])
        nt.links.new(relief.outputs["Normal"], white.inputs["Normal"])
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(alpha.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(clear.outputs["BSDF"], mix.inputs[1])
    nt.links.new(white.outputs["BSDF"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    shell("clouds", R + 9e3, clouds)

    # The atmosphere, single-scattered, worked out per ray on one thin
    # shell rather than marched as a volume. A ray's closest approach to
    # the planet's centre, b, sets how much air it crosses: looking down,
    # 1/cos of the angle it meets the ground at; grazing past the limb, the
    # Chapman column, which falls off exponentially with the ray's lowest
    # altitude. Rayleigh (blue, 8 km scale height) and aerosol (grey,
    # 1.2 km) each turn that into optical depth; what the ray gains is sun
    # scattered towards the camera, what it loses tints whatever is behind.
    # So the limb grades white to blue to black as it does in every orbital
    # photograph, and haze thickens towards the horizon.
    air = bpy.data.materials.new("atmosphere")
    air.use_nodes = True
    air.cycles.emission_sampling = "NONE"
    nt = air.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    P = v(nt, "SUBTRACT", geo.outputs["Position"], earth_at)
    D = v(nt, "SCALE", geo.outputs["Incoming"], -1)
    b =v(nt, "LENGTH", v(nt, "CROSS_PRODUCT", P, D))
    x = m(nt, "DIVIDE", b, R)
    slant = m(nt, "DIVIDE", 1, m(nt, "SQRT", m(nt, "MAXIMUM", m(nt, "SUBTRACT", 1, m(nt, "MULTIPLY", x, x)), 1e-6)))
    lowest = m(nt, "SUBTRACT", b, R)

    def airmass(H):
        most = math.sqrt(2 * math.pi * R / H)
        limb = m(nt, "MULTIPLY", most, m(nt, "EXPONENT", m(nt, "DIVIDE", lowest, -H)))
        return m(nt, "MINIMUM", m(nt, "MINIMUM", slant, most), limb)

    rayleigh = [t * look.get("rayleigh", 1.0) for t in (0.036, 0.097, 0.24)]
    haze = look.get("haze", 0.05)
    tau_r = v(nt, "SCALE", rayleigh, airmass(8e3))
    tau_m = m(nt, "MULTIPLY", haze, airmass(1.2e3))
    tau = v(nt, "ADD", tau_r, v(nt, "SCALE", (1, 1, 1), tau_m))
    trans = v(nt, "POWER", (math.e,) * 3, v(nt, "SCALE", tau, -1))
    # Scattering angle between the view ray and the sun.
    c = v(nt, "DOT_PRODUCT", D, to_sun)
    p_r = m(nt, "MULTIPLY", 0.75, m(nt, "ADD", 1, m(nt, "MULTIPLY", c, c)))
    g = 0.6
    p_m = m(nt, "DIVIDE", 1 - g * g, m(nt, "POWER", m(nt, "SUBTRACT", 1 + g * g, m(nt, "MULTIPLY", 2 * g, c)), 1.5))
    # Per channel, the scattered share of what was lost, weighted by phase:
    # (1 - T) * (tau_r p_r + tau_m p_m) / tau.
    weighted = v(nt, "ADD", v(nt, "SCALE", tau_r, p_r), v(nt, "SCALE", (1, 1, 1), m(nt, "MULTIPLY", tau_m, p_m)))
    gained = v(nt, "MULTIPLY", v(nt, "SUBTRACT", (1, 1, 1), trans), v(nt, "DIVIDE", weighted, v(nt, "MAXIMUM", tau, (1e-6,) * 3)))
    # Lit where the ray's lowest point (or, looking down, the ground under
    # it) faces the sun, fading through twilight past the terminator.
    tangent = v(nt, "SUBTRACT", P, v(nt, "SCALE", D, v(nt, "DOT_PRODUCT", P, D)))
    pick = nt.nodes.new("ShaderNodeMix")
    pick.data_type = "VECTOR"
    nt.links.new(m(nt, "GREATER_THAN", x, 1), pick.inputs["Factor"])
    # The vector variants of the mix node's A, B and Result sockets.
    nt.links.new(P, pick.inputs[4])
    nt.links.new(tangent, pick.inputs[5])
    under = v(nt, "NORMALIZE", pick.outputs[1])
    sunlit = nt.nodes.new("ShaderNodeMapRange")
    sunlit.interpolation_type = "SMOOTHSTEP"
    sunlit.inputs["From Min"].default_value = -0.1
    sunlit.inputs["From Max"].default_value = 0.2
    nt.links.new(v(nt, "DOT_PRODUCT", under, to_sun), sunlit.inputs["Value"])
    front = m(nt, "SUBTRACT", 1, geo.outputs["Backfacing"])
    # Single scattering alone leaves the horizon too dim: real haze also
    # scatters light more than once, and is lit from below by the cloud
    # deck. `atmosphere` stands in for both.
    k = look.get("sun_strength", 5) / (4 * math.pi) * look.get("atmosphere", 1.8)
    strength = m(nt, "MULTIPLY", m(nt, "MULTIPLY", sunlit.outputs["Result"], front), k)
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(gained, emit.inputs["Color"])
    nt.links.new(strength, emit.inputs["Strength"])
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(trans, clear.inputs["Color"])
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(clear.outputs["BSDF"], add.inputs[0])
    nt.links.new(emit.outputs["Emission"], add.inputs[1])
    nt.links.new(add.outputs["Shader"], out.inputs["Surface"])
    shell("atmosphere", R + 100e3, air)

    world = bpy.data.worlds.new("space")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0, 0, 0, 1)
    bpy.context.scene.world = world
    cam = bpy.context.scene.camera.data
    cam.clip_start, cam.clip_end = 0.5, 2e7


def tread_material():
    """Aluminium tread plate: a 45° grid of small raised lozenges."""
    m = bpy.data.materials.new("tread")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.62, 0.63, 0.64, 1)
    b.inputs["Metallic"].default_value = 1
    b.inputs["Roughness"].default_value = 0.38
    coords = nt.nodes.new("ShaderNodeTexCoord")
    turn = nt.nodes.new("ShaderNodeMapping")
    turn.inputs["Rotation"].default_value[2] = math.radians(45)
    nt.links.new(coords.outputs["Object"], turn.inputs["Vector"])
    waves = []
    for axis in ("X", "Y"):
        w = nt.nodes.new("ShaderNodeTexWave")
        w.wave_type = "BANDS"
        w.bands_direction = axis
        w.inputs["Scale"].default_value = 28
        nt.links.new(turn.outputs["Vector"], w.inputs["Vector"])
        waves.append(w)
    both = nt.nodes.new("ShaderNodeMath")
    both.operation = "MULTIPLY"
    nt.links.new(waves[0].outputs["Fac"], both.inputs[0])
    nt.links.new(waves[1].outputs["Fac"], both.inputs[1])
    bumps = nt.nodes.new("ShaderNodeMapRange")
    bumps.inputs["From Min"].default_value = 0.55
    bumps.inputs["From Max"].default_value = 0.75
    nt.links.new(both.outputs["Value"], bumps.inputs["Value"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(bumps.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def stage_factory(shot, model, look):
    """A clean assembly hall from above: epoxy floor, a tread-plate
    platform with painted keep-out lines around it, a few crates and a
    cable drum, lit by a grid of ceiling panels."""
    z0 = model.lo.z
    centre = (model.lo + model.hi) / 2
    foot = max(model.hi.x - model.lo.x, model.hi.y - model.lo.y)

    floor = primitive("plane", "floor", size=foot * 14, location=(centre.x, centre.y, z0 - 0.003))
    floor.data.materials.append(simple_material("epoxy", look.get("floor", "#c3c6c7"), 0.32))
    plate = primitive("plane", "platform", size=foot * 1.45, location=(centre.x, centre.y, z0 - 0.001))
    plate.data.materials.append(tread_material())

    paint = simple_material("paint", "#e9e9e6", 0.55)
    edge, width = foot * 1.9, foot * 0.025
    for i, (dx, dy, sx, sy) in enumerate([(0, 1, edge, width), (0, -1, edge, width), (1, 0, width, edge), (-1, 0, width, edge)]):
        line = primitive("plane", f"line{i}", size=1, location=(centre.x + dx * edge / 2, centre.y + dy * edge / 2, z0 - 0.002))
        line.scale = (sx, sy, 1)
        line.data.materials.append(paint)

    if look.get("props", True):
        crate = simple_material("crate", "#5d6266", 0.6)
        drum = simple_material("drum", "#2a2c2e", 0.5)
        for i, (dx, dy, w, d, h) in enumerate([(1.35, 1.25, 0.32, 0.24, 0.2), (1.2, -1.4, 0.26, 0.26, 0.24), (-1.45, 1.1, 0.3, 0.22, 0.18)]):
            box = primitive("cube", f"crate{i}", size=1, location=(centre.x + dx * foot, centre.y + dy * foot, z0 + h * foot / 2))
            box.scale = (w * foot, d * foot, h * foot)
            box.data.materials.append(crate)
        reel = primitive("cylinder", "reel", radius=foot * 0.13, depth=foot * 0.12, vertices=96,
                         location=(centre.x - 1.35 * foot, centre.y - 1.3 * foot, z0 + foot * 0.06))
        reel.data.shade_smooth()
        reel.data.materials.append(drum)

    # Ceiling panels.
    for i in (-1, 0, 1):
        for j in (-1, 0, 1):
            data = bpy.data.lights.new(f"panel{i}{j}", "AREA")
            data.shape = "SQUARE"
            data.size = foot * 0.9
            data.energy = look.get("panel_power", 120) * foot * foot
            stage_object(f"panel{i}{j}", data, (centre.x + i * foot * 1.6, centre.y + j * foot * 1.6, model.hi.z + foot * 2.5))

    world = bpy.data.worlds.new("hall")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.35, 0.36, 0.37, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    bpy.context.scene.world = world


def stage_dusk(shot, model, look):
    """Outdoors after sunset: a physical sky with the sun just under the
    horizon behind the subject, a dark concrete apron, and the subject
    mostly silhouette with a thin rim where the last light catches it."""
    z0 = model.lo.z
    radius = (model.hi - model.lo).length / 2
    ground = primitive("plane", "ground", size=radius * 400, location=((model.lo.x + model.hi.x) / 2, (model.lo.y + model.hi.y) / 2, z0 - 0.002))
    concrete = bpy.data.materials.new("concrete")
    concrete.use_nodes = True
    nt = concrete.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.03, 0.03, 0.03, 1)
    # Weak specular, or the grazing view turns the whole apron into a
    # mirror of the bright horizon.
    b.inputs["Specular IOR Level"].default_value = 0.15
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 3
    n.inputs["Detail"].default_value = 10
    r = nt.nodes.new("ShaderNodeMapRange")
    r.inputs["To Min"].default_value = 0.7
    r.inputs["To Max"].default_value = 0.95
    nt.links.new(n.outputs["Fac"], r.inputs["Value"])
    nt.links.new(r.outputs["Result"], b.inputs["Roughness"])
    ground.data.materials.append(concrete)

    to_sun = view_direction(shot, look.get("sun_azimuth", 165), look.get("sun_elevation", 1.5))
    sun(to_sun, look.get("sun_strength", 2.5), angle=1.0)
    world = bpy.data.worlds.new("dusk")
    world.use_nodes = True
    nt = world.node_tree
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = False
    sky.sun_elevation = math.radians(look.get("sun_elevation", 1.5))
    # Blender measures sky rotation from +Y towards -X.
    sky.sun_rotation = math.atan2(-to_sun.x, to_sun.y)
    sky.aerosol_density = look.get("haze", 2.0)
    nt.links.new(sky.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = look.get("sky_strength", 0.15)
    bpy.context.scene.world = world


STAGES = {"orbit": stage_orbit, "factory": stage_factory, "dusk": stage_dusk}

# Each context starts from a model finish that suits it; a shot's
# look_settings can still override any of these.
CONTEXT_FINISH = {
    "orbit": {"saturation": 0.5},
    "factory": {"saturation": 0.3},
    "dusk": {"albedo_scale": 0.4, "saturation": 0.35},
}


def setup_context(shot, model):
    look = dict(CONTEXT_FINISH[shot["look"]], **shot.get("look_settings", {}))
    shot["look_settings"] = look
    assign_lit_materials(model, look)
    STAGES[shot["look"]](shot, model, look)
    lit_render_settings(shot)


def grade_lit(rgb, shot):
    """Scene light to a quiet, near-monochrome print.

    Exposure is set from the brightest highlights rather than fixed, so a
    rig reads the same at any scale; a filmic curve rolls them off, and most
    of the colour is drained out, leaving a trace of cool in the steel.
    """
    look = shot.get("look_settings", {})
    if look.get("style") == "classic":
        # The approved grade: fixed exposure, so the backdrop comes out the
        # same in every shot; an ACES-style film curve; most colour drained,
        # a trace of cool left.
        x = rgb * look.get("exposure", 1.0)
        if look.get("auto_exposure"):
            # Meter off the subject's highlights: put its 99.5th-percentile
            # brightness at a set level, so real albedos (which change how
            # bright everything is) don't need the exposure hand-tuned.
            lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
            lit = lum[lum > 1e-4]
            if lit.size:
                # 98th percentile: broad highlights, not the few hot specular
                # pixels, which would leave the rest of the frame dark.
                gain = look["auto_exposure"] / max(np.percentile(lit, 98), 1e-6) * look.get("exposure_trim", 1.0)
                print(f"metered exposure {gain:.4f}", flush=True)
                x = rgb * gain
        if look.get("agx"):
            # Blender's AgX camera response: highlights roll off smoothly
            # rather than clipping, which matters most in high-key scenes.
            grey = (x @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
            x = grey + (x - grey) * look.get("saturation", 0.25)
            x = agx(x, look["agx"] if isinstance(look["agx"], str) else "AgX - Base Contrast")
        else:
            x = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
            grey = (x @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
            x = grey + (x - grey) * look.get("saturation", 0.25)
        x = x * srgb_to_linear(look.get("tint", "#f2f6f8")) / srgb_to_linear("#ffffff")
        if look.get("contrast_curve"):
            # Contrast in display space: pin the blacks, then an S-curve so
            # midtones separate into deep shadow and bright highlight
            # instead of sitting grey.
            d = linear_to_srgb(x)
            bp = look.get("black_point", 0.02)
            d = np.clip((d - bp) / (1 - bp), 0, 1)
            k = look["contrast_curve"]
            curve = d * d * (3 - 2 * d)
            d = d + (curve - d) * k
            x = srgb_to_linear_array(d)
        if look.get("split_tone"):
            # Cool steel: shadows and mids lean blue, highlights stay near
            # neutral, measured off the references (shadows about 15-20%
            # bluer than red, saturation about 0.14).
            shadow, high = (srgb_to_linear(c) / srgb_to_linear("#ffffff") for c in look["split_tone"])
            d = linear_to_srgb(x)
            lum = (d @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
            x = x * (shadow * (1 - lum) + high * lum)
        if look.get("white_cap"):
            # Polished metal in the references peaks around 200/255 rather
            # than clipping: roll the top off smoothly to that ceiling.
            d = linear_to_srgb(x)
            cap = look["white_cap"]
            knee = cap * 0.7
            over = np.clip(d - knee, 0, None)
            d = np.where(d > knee, knee + (cap - knee) * (1 - np.exp(-over / (cap - knee))), d)
            x = srgb_to_linear_array(d)
        return x
    if shot["look"] == "studio":
        # Meter like a camera: put the frame's middle tone at a set grey
        # (centre-weighted), rather than metering off highlights, which
        # would swing with whatever polished steel is in frame.
        h, w, _ = rgb.shape
        yy, xx = np.mgrid[0:h, 0:w]
        centre = np.hypot((xx - w / 2) / w, (yy - h / 2) / h) < 0.35
        lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
        mid = np.percentile(lum[centre], 50)
        x = rgb * (look.get("key", 0.11) * look.get("exposure", 1.0) / max(mid, 1e-6))
    else:
        lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
        bright = np.percentile(lum, look.get("white_point", 99.6))
        x = rgb * (look.get("exposure", 1.0) * 0.9 / max(bright, 1e-6))
    # Veiling glare, on scene light before the tone curve, where only
    # genuinely bright highlights (above 1.0) bleed: a lens's response.
    x = bloom(x, look.get("bloom", 0.04), threshold=1.0, size=0.02)
    grey = (x @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    sat = look.get("saturation", 0.25)
    x = grey + (x - grey) * sat
    x = agx(x, look.get("contrast", "AgX - Base Contrast"))

    # Print the display image: a gentle S-curve for snap, a toe that keeps
    # blacks at a few percent instead of crushing them, then split toning —
    # cool shadows, faintly warm highlights.
    d = linear_to_srgb(x)
    curve = d * d * (3 - 2 * d)
    d = d + (curve - d) * look.get("s_curve", 0.25)
    lift = look.get("black_lift", 0.02)
    d = lift + (1 - lift) * d
    x = srgb_to_linear_array(d)
    lum = (d @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    shadows = srgb_to_linear(look.get("shadow_tint", "#e4ebf2"))
    highlights = srgb_to_linear(look.get("highlight_tint", "#fbf9f5"))
    return x * (shadows * (1 - lum) + highlights * lum)


def srgb_to_linear_array(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def agx(rgb, contrast):
    """Blender's AgX camera response, applied to a graded linear frame:
    highlights roll off and desaturate the way film and sensors do instead
    of clipping flat. Returns display-referred values, linearised so the
    rest of the post can keep working in linear light."""
    h, w, _ = rgb.shape
    sc = bpy.context.scene
    keep = (sc.view_settings.view_transform, sc.view_settings.look, sc.render.image_settings.file_format,
            sc.render.image_settings.color_depth)
    img = bpy.data.images.new("agx-in", w, h, float_buffer=True)
    img.pixels.foreach_set(np.concatenate([rgb, np.ones((h, w, 1))], axis=2).astype(np.float32).ravel())
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = contrast
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_depth = "16"
    path = os.path.join(bpy.app.tempdir, "agx.png")
    img.save_render(path, scene=sc)
    bpy.data.images.remove(img)
    out = bpy.data.images.load(path)
    out.colorspace_settings.name = "Non-Color"
    px = np.empty(w * h * 4, dtype=np.float32)
    out.pixels.foreach_get(px)
    bpy.data.images.remove(out)
    (sc.view_settings.view_transform, sc.view_settings.look, sc.render.image_settings.file_format,
     sc.render.image_settings.color_depth) = keep
    c = px.reshape(h, w, 4)[..., :3]
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


LOOKS = {}


# ---------------------------------------------------------------- post


def box_blur(img, r):
    """Three box passes per axis: a cheap, close Gaussian."""
    r = max(1, int(r))
    for axis in (0, 1):
        for _ in range(3):
            c = np.cumsum(np.pad(img, [(r + 1, r) if a == axis else (0, 0) for a in range(img.ndim)], mode="edge"), axis=axis)
            img = (np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return img


def bloom(rgb, amount, threshold=0.75, size=0.012):
    """Glow around the brightest highlights, as lens and sensor give them."""
    h, w, _ = rgb.shape
    hot = np.clip(rgb - threshold, 0, None)
    k = 4
    small = hot[: h // k * k, : w // k * k].reshape(h // k, k, w // k, k, 3).mean(axis=(1, 3))
    small = box_blur(small, size * w / k)
    glow = np.repeat(np.repeat(small, k, axis=0), k, axis=1)
    glow = np.pad(glow, ((0, h - glow.shape[0]), (0, w - glow.shape[1]), (0, 0)), mode="edge")
    return rgb + box_blur(glow, 2) * amount


def fringe(rgb, amount, distortion=0.0):
    """Lens geometry: barrel distortion (`distortion` < 0 bows straight
    lines outwards, by that fraction at the corners) and lateral chromatic
    aberration (red scaled out, blue in), both growing towards the corners
    as with a real lens."""
    h, w, _ = rgb.shape
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2, (h - 1) / 2
    half = math.hypot(cx, cy)
    r2 = ((x - cx) ** 2 + (y - cy) ** 2) / (half * half)
    bend = 1 + distortion * r2
    out = rgb.copy()
    for channel, k in ((0, 1 + amount), (1, 1.0), (2, 1 - amount)):
        sx = np.clip(cx + (x - cx) * bend / k, 0, w - 1.001)
        sy = np.clip(cy + (y - cy) * bend / k, 0, h - 1.001)
        x0, y0 = sx.astype(int), sy.astype(int)
        fx, fy = sx - x0, sy - y0
        c = rgb[..., channel]
        out[..., channel] = (c[y0, x0] * (1 - fx) * (1 - fy) + c[y0, x0 + 1] * fx * (1 - fy)
                             + c[y0 + 1, x0] * (1 - fx) * fy + c[y0 + 1, x0 + 1] * fx * fy)
    return out


def finish(rgb, shot, seed=1):
    h, w, _ = rgb.shape
    if shot["look"] == "xray":
        # The radiograph is film, not a lens: just its vignette and grain.
        post = dict(shot.get("post", {}))
        y, x = np.mgrid[0:h, 0:w]
        r = np.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2))
        rgb = rgb * (1 - post.get("vignette", 0.12) * np.clip(r - 0.4, 0, None) ** 2)[..., None]
        srgb = linear_to_srgb(rgb)
        grain = np.random.default_rng(seed).normal(0, post.get("grain", 0.012), (h, w, 1))
        return np.clip(srgb + grain, 0, 1)

    if shot.get("look_settings", {}).get("style") == "classic":
        # The approved post: soft bloom on the brightest highlights, faint
        # lens fringing, a gentle vignette — and grain that behaves like a
        # sensor's: heavier in the shadows, softened off single pixels.
        post = dict({"bloom": 0.08, "fringe": 0.0007, "vignette": 0.12, "grain": 0.012}, **shot.get("post", {}))
        if post["bloom"]:
            rgb = bloom(rgb, post["bloom"])
        if post["fringe"]:
            rgb = fringe(rgb, post["fringe"])
        y, x = np.mgrid[0:h, 0:w]
        r = np.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2))
        rgb = rgb * (1 - post["vignette"] * np.clip(r - 0.4, 0, None) ** 2)[..., None]
        if "_alpha" in shot:
            # Premultiplied subject over the flat background colour.
            bg = srgb_to_linear(shot["look_settings"]["bg_color"])
            rgb = rgb + bg * (1 - shot["_alpha"])
        srgb = linear_to_srgb(rgb)
        if post.get("sharpen"):
            # Output sharpening, as a camera or retoucher applies.
            srgb = np.clip(srgb + (srgb - box_blur(srgb, 1)) * post["sharpen"], 0, 1)
        return np.clip(srgb + sensor_grain(srgb, post["grain"], seed), 0, 1)

    post = dict({"fringe": 0.0012, "distortion": -0.01, "vignette": 0.25, "sharpen": 0.3, "grain": 0.014},
                **shot.get("post", {}))
    if post["fringe"] or post["distortion"]:
        rgb = fringe(rgb, post["fringe"], post["distortion"])
    # Optical falloff, about a third of a stop in the corners.
    y, x = np.mgrid[0:h, 0:w]
    r = np.hypot(x - w / 2, y - h / 2) / math.hypot(w / 2, h / 2)
    rgb = rgb * (1 - post["vignette"] * r ** 2.5)[..., None]
    srgb = linear_to_srgb(rgb)
    # Output sharpening, as a camera applies.
    if post["sharpen"]:
        srgb = srgb + (srgb - box_blur(srgb, 1)) * post["sharpen"]
    # Sensor noise: stronger in the shadows than the highlights, softened so
    # it isn't single-pixel salt, and scaled so a preview isn't noisier than
    # the full-size frame.
    return np.clip(srgb + sensor_grain(srgb, post["grain"], seed), 0, 1)


def sensor_grain(srgb, strength, seed):
    """Sensor noise: stronger in the shadows than the highlights, softened
    so it isn't single-pixel salt, and scaled so a preview isn't noisier
    than the full-size frame."""
    h, w, _ = srgb.shape
    lum = (np.clip(srgb, 0, 1) @ np.array([0.2126, 0.7152, 0.0722]))[..., None]
    noise = np.random.default_rng(seed).normal(0, 1, (h, w, 1)).astype(np.float32)
    k = np.array([0.25, 0.5, 0.25], dtype=np.float32)
    noise = (np.pad(noise, ((1, 1), (0, 0), (0, 0)), mode="edge")[:-2] * k[0] + noise * k[1]
             + np.pad(noise, ((1, 1), (0, 0), (0, 0)), mode="edge")[2:] * k[2])
    noise = (np.pad(noise, ((0, 0), (1, 1), (0, 0)), mode="edge")[:, :-2] * k[0] + noise * k[1]
             + np.pad(noise, ((0, 0), (1, 1), (0, 0)), mode="edge")[:, 2:] * k[2]) * 2.6
    return noise * strength * min(1.0, (max(w, h) / 2000) ** 0.5) * (0.35 + 0.9 * (1 - lum) ** 1.5)


def save_png(rgb, path):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(os.path.basename(path), w, h, float_buffer=False)
    img.pixels.foreach_set(np.concatenate([rgb, np.ones((h, w, 1))], axis=2).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def load_exr(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[..., :3]


def load_exr_alpha(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[..., 3:]


def clay():
    """Swap every surface for 18% grey diffuse, keeping the lights, so the
    key/fill/rim balance can be judged without materials in the way."""
    grey = bpy.data.materials.get("clay") or simple_material("clay", "#767676", 0.6)
    flag = bpy.data.materials.get("flag")
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            if slot.material is not flag:
                slot.material = grey


def render(shot, out_dir, scale=None, save_blend=False, clay_mode=False):
    if "turntable" in shot:
        return render_turntable(shot, out_dir, scale)
    model = Model.load(shot["model"])
    model.arrange(shot.get("parts", {}))
    place_camera(shot, model)
    reset_stage()
    LOOKS[shot["look"]][0](shot, model)
    if clay_mode:
        clay()

    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = shot.get("resolution", (1600, 2000))
    sc.render.resolution_percentage = scale or shot.get("scale", 100)
    crop = shot.get("crop")
    sc.render.use_border = bool(crop)
    sc.render.use_crop_to_border = bool(crop)
    if crop:
        # Render only part of the frame (fractions, origin bottom-left), for
        # judging detail at full size without paying for the whole image.
        sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = crop
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, f"{shot['name']}.blend"), copy=True, compress=True)

    raw = os.path.join(out_dir, f"{shot['name']}.raw.exr")
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.filepath = raw
    # An exact background colour (look "bg_color"): render the subject over
    # transparency and lay it on that flat colour after the grade, so the
    # grade's curves and tints can't shift it.
    bg = shot.get("look_settings", {}).get("bg_color")
    sc.render.film_transparent = bool(bg)
    bpy.ops.render.render(write_still=True)

    rgb = load_exr(raw)
    if bg:
        shot = dict(shot, _alpha=np.clip(load_exr_alpha(raw), 0, 1))
    os.remove(raw)
    rgb = LOOKS[shot["look"]][1](rgb, shot)
    path = os.path.join(out_dir, f"{shot['name']}.png")
    save_png(finish(rgb, shot), path)
    print(f"rendered {path}", flush=True)
    return path


def render_turntable(shot, out_dir, scale=None):
    """A seamless loop: the camera circles the model once at constant speed.

    The camera orbits rather than the model turning, which is the same
    picture for a look with no lights, and leaves the model untouched so
    Cycles can keep its BVH between frames (persistent data). Exposure is
    measured on the first frame and held, or the auto-exposure would pump
    as denser views come round; grain changes every frame, as film would.

    Frames land in <out>/<shot>/, raw renders are kept until the loop is
    graded, and a re-run picks up after the last frame it finished.
    """
    t = shot["turntable"]
    fps = t.get("fps", 24)
    frames = round(t.get("seconds", 20) * fps)
    model = Model.load(shot["model"])
    model.arrange(shot.get("parts", {}))
    place_camera(shot, model)
    reset_stage()
    LOOKS[shot["look"]][0](shot, model)

    sc = bpy.context.scene
    cam = sc.camera
    pivot = bpy.data.objects.new("pivot", None)
    sc.collection.objects.link(pivot)
    pivot.location = model.lo + (model.hi - model.lo) * Vector(shot["camera"].get("focus", (0.5, 0.5, 0.5)))
    bpy.context.view_layer.update()
    world = cam.matrix_world.copy()
    cam.parent = pivot
    cam.matrix_world = world
    # Frame n sits at n/frames of the turn, so the last frame hands
    # straight back to the first with no repeated angle.
    turn = math.radians(t.get("degrees", 360)) * t.get("direction", 1)
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    pivot.rotation_euler.z = 0
    pivot.keyframe_insert("rotation_euler", index=2, frame=0)
    pivot.rotation_euler.z = turn
    pivot.keyframe_insert("rotation_euler", index=2, frame=frames)

    sc.render.resolution_x, sc.render.resolution_y = shot.get("resolution", (1080, 1350))
    sc.render.resolution_percentage = scale or shot.get("scale", 100)
    sc.render.fps = fps
    sc.frame_start, sc.frame_end = 0, frames - 1
    sc.frame_step = t.get("step", 1)
    sc.render.use_persistent_data = True
    folder = os.path.join(out_dir, shot["name"])
    raw_dir = os.path.join(folder, "raw")
    os.makedirs(raw_dir, exist_ok=True)
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    sc.render.filepath = os.path.join(raw_dir, "####")
    sc.render.use_overwrite = False
    sc.render.use_placeholder = True
    bpy.ops.render.render(animation=True)

    graded = dict(shot, look_settings=dict(shot.get("look_settings", {})))
    numbers = range(sc.frame_start, frames, sc.frame_step)
    first = load_exr(os.path.join(raw_dir, f"{numbers[0]:04d}.exr"))
    if shot["look"] == "xray":
        graded["look_settings"].setdefault("max_density", xray_exposure(first, shot))
    pngs = []
    for n in numbers:
        png = os.path.join(folder, f"{n:04d}.png")
        if not os.path.exists(png):
            rgb = LOOKS[shot["look"]][1](load_exr(os.path.join(raw_dir, f"{n:04d}.exr")), graded)
            save_png(finish(rgb, graded, seed=n), png)
        pngs.append(png)
    path = encode_video(pngs, os.path.join(out_dir, f"{shot['name']}.mp4"), fps / sc.frame_step)
    for f in os.listdir(raw_dir):
        os.remove(os.path.join(raw_dir, f))
    os.rmdir(raw_dir)
    print(f"rendered {path}", flush=True)
    return pngs[0]


def encode_video(pngs, path, fps):
    """H.264 from a PNG sequence, through Blender's own FFmpeg (the system
    may have none)."""
    sc = bpy.data.scenes.new("encode")
    first = bpy.data.images.load(pngs[0])
    # H.264 needs even dimensions; a preview --scale can give odd ones.
    sc.render.resolution_x, sc.render.resolution_y = (d - d % 2 for d in first.size)
    bpy.data.images.remove(first)
    sc.render.resolution_percentage = 100
    sc.render.fps = round(fps)
    se = sc.sequence_editor_create()
    strips = se.strips if hasattr(se, "strips") else se.sequences
    strip = strips.new_image("frames", pngs[0], 1, 1)
    for p in pngs[1:]:
        strip.elements.append(os.path.basename(p))
    sc.frame_start, sc.frame_end = 1, len(pngs)
    sc.view_settings.view_transform = "Standard"
    if hasattr(sc.render.image_settings, "media_type"):
        sc.render.image_settings.media_type = "VIDEO"
    sc.render.image_settings.file_format = "FFMPEG"
    sc.render.ffmpeg.format = "MPEG4"
    sc.render.ffmpeg.codec = "H264"
    sc.render.ffmpeg.constant_rate_factor = "PERC_LOSSLESS"
    sc.render.ffmpeg.ffmpeg_preset = "BEST"
    sc.render.filepath = path
    with bpy.context.temp_override(scene=sc):
        bpy.ops.render.render(animation=True, scene=sc.name)
    bpy.data.scenes.remove(sc)
    return path


def contact_sheet(paths, out_dir, cell=480, columns=6):
    """Every render of the batch on one page, labelled by file order."""
    if len(paths) < 2:
        return
    rows = math.ceil(len(paths) / columns)
    gap = 16
    sheet = np.full((rows * (cell + gap) + gap, columns * (cell + gap) + gap, 3), 0.11, dtype=np.float32)
    for i, path in enumerate(paths):
        img = bpy.data.images.load(path)
        w, h = img.size
        k = cell / max(w, h)
        img.scale(max(1, round(w * k)), max(1, round(h * k)))
        tw, th = img.size
        px = np.empty(tw * th * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        # Image rows run bottom-up; place each thumbnail centred in its cell.
        r, c = divmod(i, columns)
        y0 = sheet.shape[0] - (r + 1) * (cell + gap) + (cell - th) // 2
        x0 = gap + c * (cell + gap) + (cell - tw) // 2
        sheet[y0 : y0 + th, x0 : x0 + tw] = px.reshape(th, tw, 4)[..., :3]
    save_png(sheet, os.path.join(out_dir, "contact-sheet.png"))


LOOKS.update(
    xray=(setup_xray, grade_xray),
    void=(setup_lit, grade_lit),
    studio=(setup_lit, grade_lit),
    orbit=(setup_context, grade_lit),
    inside=(setup_inside, grade_lit),
    factory=(setup_context, grade_lit),
    dusk=(setup_context, grade_lit),
)


def enable_gpu():
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True


def option(args, flag, default=None):
    if flag in args:
        i = args.index(flag)
        value = args[i + 1]
        del args[i : i + 2]
        return value
    return default


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    shots_file = option(args, "--shots", os.path.join(HERE, "shots.json"))
    out_dir = os.path.abspath(option(args, "--out", os.path.join(ROOT, "renders")))
    scale = option(args, "--scale")
    save_blend = "--save" in args
    clay_mode = "--clay" in args
    names = [a for a in args if not a.startswith("--")]
    with open(shots_file) as f:
        shots = json.load(f)
    unknown = set(names) - {s["name"] for s in shots}
    if unknown:
        sys.exit(f"unknown shot(s): {', '.join(sorted(unknown))}")
    os.makedirs(out_dir, exist_ok=True)
    enable_gpu()
    paths = [
        render(shot, out_dir, int(scale) if scale else None, save_blend, clay_mode)
        for shot in shots
        if not names or shot["name"] in names
    ]
    contact_sheet(paths, out_dir)
