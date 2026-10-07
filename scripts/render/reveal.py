"""The product-section reveal: Mark-0 assembling from its exploded state.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render/reveal.py -- \\
        [--scale percent] [--samples n] [--fps n] [--out dir] [--every n]

The 12 control drums swing in from a fanned ring while the camera orbits,
then the core drops into them, the heat pipes slide home into the core,
the drive heads settle on top and the base ring rises into place. It ends
on the hero composition, so the last frame doubles as the video's poster.

Frames land in <out>/frames/, graded with the black-set look (the
m0-full-01-hero entry of mark-0-black.json), and are encoded to
<out>/mark-0-reveal.mp4. --every n renders only every nth frame (held for
n frames in the video) for quick timing checks.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R  # noqa: E402

SECONDS = 8.0

# When each move happens (seconds) and how far it travels (metres, as
# modelled). Offsets ease to zero, so every part ends where the CAD has it.
SPLIT = {
    "base": {"group": "f1_cradle", "z_below": 0.15},
    "drives": {"group": "f2_reactivity", "z_above": 2.5},
}
MOVES = {
    # The drum ring closes like petals; the drive heads ride with it.
    "radial": {"f2_reactivity": (0.9, 0.3, 3.2), "drives": (0.9, 0.3, 3.2)},
    # Vertical offsets: start height and when each lands.
    "lift": {
        # Kept short so the exploded column still fits a 16:9 frame.
        "f3_core": (2.0, 2.0, 4.8),
        "f4_heatpipes_extra": (1.4, 3.4, 5.8),
        "drives": (0.9, 4.6, 6.6),
        "base": (-0.45, 5.4, 7.2),
    },
}
# Camera: a slow orbit and settle onto the hero angle.
# The framing fits whatever is visible, so the camera pulls in as the
# parts close up; zoom also eases in from a wider, breathing frame.
CAMERA = {"azimuth": (5, 30), "elevation": (24, 10), "zoom": (1.4, 1.12)}
HERO = {"lens": 85, "dof": 5.6, "focus_shift": 1.1}


def ease_out(t):
    """Fast start, long settle (expo-like), with a short ease-in so a part
    doesn't jump from rest."""
    t = min(max(t, 0.0), 1.0)
    t = t * t * (3 - 2 * t) * 0.35 + t * 0.65
    return 1 - (1 - t) ** 4


def ease_in_out(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * t * (t * (6 * t - 15) + 10)


def remaining(start, t0, t1, time):
    """Offset still to travel at `time` for a move of `start` metres."""
    return start * (1 - ease_out((time - t0) / (t1 - t0)))


def spec_at(time):
    radial = {g: remaining(d, a, b, time) for g, (d, a, b) in MOVES["radial"].items()}
    lift = {g: remaining(d, a, b, time) for g, (d, a, b) in MOVES["lift"].items()}
    explode = {
        "f3_core": [0, 0, lift["f3_core"]],
        # The heat pipes ride on the core, plus their own lift out of it.
        "f4_heatpipes": [0, 0, lift["f3_core"] + lift["f4_heatpipes_extra"]],
        "drives": [0, 0, lift["drives"]],
        "base": [0, 0, lift["base"]],
    }
    return {"split": SPLIT, "explode": explode, "radial": radial}


def camera_at(time):
    k = ease_in_out(time / SECONDS)
    cam = {key: a + (b - a) * k for key, (a, b) in CAMERA.items()}
    cam.update(HERO)
    return cam


def option(args, flag, default):
    if flag in args:
        return args[args.index(flag) + 1]
    return default


def main(spec_fn=None, camera_fn=None, seconds=None, name="mark-0-reveal", default_out="reveal", look_fn=None):
    """Render a reveal. Other choreographies (reveal_snap.py) pass their own
    spec_fn(time) -> arrange spec and camera_fn(time) -> camera dict;
    look_fn(time), if given, returns look settings to override per frame
    (exposure, for a fade)."""
    spec_fn = spec_fn or spec_at
    camera_fn = camera_fn or camera_at
    seconds = seconds or SECONDS
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    scale = int(option(args, "--scale", 100))
    samples = int(option(args, "--samples", 128))
    fps = int(option(args, "--fps", 24))
    every = int(option(args, "--every", 1))
    out = os.path.abspath(option(args, "--out", os.path.join(R.ROOT, "renders", default_out)))
    frames_dir = os.path.join(out, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    with open(os.path.join(R.HERE, "mark-0-black.json")) as f:
        hero = next(s for s in json.load(f) if s["name"] == "m0-full-01-hero")
    shot = dict(hero, name=name, resolution=[1920, 1080], samples=samples)

    R.enable_gpu()
    model = R.Model.load("mark-0")
    sc = bpy.context.scene
    frames = round(seconds * fps)
    pngs = []
    for n in range(0, frames, every):
        time = n / fps
        shot["camera"] = camera_fn(time)
        model.arrange(spec_fn(time))
        R.place_camera(shot, model)
        if n == 0:
            # Materials, world and render settings once; lights per frame,
            # since they're placed relative to the moving camera.
            R.reset_stage()
            R.LOOKS[shot["look"]][0](shot, model)
            sc.render.resolution_x, sc.render.resolution_y = shot["resolution"]
            sc.render.resolution_percentage = scale
            sc.render.use_persistent_data = True
            sc.render.image_settings.file_format = "OPEN_EXR"
            sc.render.image_settings.color_depth = "32"
            look = shot["look_settings"]
        else:
            for o in [o for o in sc.objects if o.type == "LIGHT"]:
                bpy.data.objects.remove(o)
            c = shot["camera"]
            target = model.lo + (model.hi - model.lo) * Vector(c.get("focus", (0.5, 0.5, 0.5)))
            view = {"azimuth": c["azimuth"], "radius": (model.hi - model.lo).length / 2 / c.get("zoom", 1)}
            rig = look["rig"]
            for i, light in enumerate(R.RIGS[rig] if isinstance(rig, str) else rig):
                R.add_light(f"light{i}", target, view, light)

        raw = os.path.join(frames_dir, f"{n:04d}.exr")
        sc.render.filepath = raw
        bpy.ops.render.render(write_still=True)
        rgb = R.load_exr(raw)
        os.remove(raw)
        if look_fn:
            shot["look_settings"] = dict(look, **look_fn(time))
        rgb = R.LOOKS[shot["look"]][1](rgb, shot)
        png = os.path.join(frames_dir, f"{n:04d}.png")
        R.save_png(R.finish(rgb, shot, seed=n), png)
        # Hold each rendered frame for `every` video frames.
        pngs.extend([png] * every)
        print(f"frame {n + 1}/{frames}", flush=True)

    R.encode_video(pngs[:frames], os.path.join(out, f"{name}.mp4"), fps)
    print(f"rendered {os.path.join(out, name + '.mp4')}", flush=True)


if __name__ == "__main__":
    main()
