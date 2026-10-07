"""The cinematic product reveal: Mark-0 drawn out of the dark by light.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render/reveal_cine.py -- \\
        [--scale percent] [--samples n] [--fps n] [--out dir] [--every n] [--stills t1,t2,...]

After the reference silhouette film, nothing simply fades in. The lights
come on as cues, each with its own timing: after a beat of black, thin rim
lines trace one edge of the vessel and then the other; a glow rises on the
backdrop behind the reactor so it stands as a silhouette; a raking key
light sweeps across the body, sliding its highlight along the cylinder;
the fill, the overhead card and the strip follow, and the polished parts
on top catch the light last. Meanwhile the camera pulls back steadily and
racks into focus. It ends exactly on the dark hero in setting A, with the
halo behind it, and holds there as the poster frame.

Exposure is fixed throughout; only the lights change, as on a real set.
--stills renders single frames at the given times (seconds) for checks.
"""
import hashlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render as R  # noqa: E402

SECONDS = 6.0

# Camera: a steady pull-back from tight on the vessel to the hero framing,
# with a slight drift round and up, and a focus rack as the light arrives.
TARGET = (0.0, 0.0, 1.55)
DISTANCE = (7.5, 15.4)
# Framing for the website: the reactor's top stays at the same height in
# the frame all the way through, about 15% down, leaving room for a title
# above it; the camera aims below the top by a fixed fraction of its
# distance, so as it pulls back more of the reactor appears beneath, and
# the base runs off the bottom of the frame at the end.
TOP_Z = 3.35
TOP_RATIO = 0.0570
AZIMUTH = (25.0, 30.0)
ELEVATION = (6.0, 10.0)
PULL = (0.0, 5.0)
FOCUS_RACK = (0.8, 2.6)
FOCUS_START_OFFSET = 4.0

# The reactor turns slowly on its axis under the fixed lights, so
# highlights travel across it, and comes to rest at the hero orientation.
SPIN = {"degrees": -50.0, "time": (0.0, 5.4)}

# The lights stay put while the camera moves: placed for the final framing.
LIGHT_AZIMUTH = 30.0
LIGHT_RADIUS = 1.9  # the hero's framed radius (zoom 1.45)

# Light cues: (start, end) seconds of each light's ramp to full power. The
# hero rig's lights are referred to by role.
CUES = {
    "rim_right": (0.8, 1.8),
    "rim_left": (1.2, 2.2),
    "rim_far": (1.4, 2.4),
    "key": (2.0, 3.0),
    "top": (3.0, 4.0),
}
# A rim from behind on the right draws the silhouette's other edge early
# on, then hands over to the key: the final look (setting A) has none.
RIM_RIGHT = {"azimuth": 150, "elevation": 20, "width": 0.08, "length": 3, "power": 0.35}
RIM_RIGHT_OUT = (3.6, 4.8)
HALO = (1.3, 3.6)
# The key light enters grazing from the side and sweeps round to its hero
# position, so its highlight travels across the vessel.
KEY_SWEEP = {"azimuth": (140.0, 80.0), "elevation": (20.0, 30.0), "time": (2.0, 4.8)}
# The key is brighter while it travels, so its highlight reads as a light
# passing over the vessel, then settles to its hero power.
KEY_SWEEP_BOOST = 1.8
# How bright the glow behind the reactor gets (backdrop light power).
HALO_POWER = 0.3
# Off for now: a pure black background, the reactor drawn by its own light.
HALO_ON = False


def clamp01(t):
    return min(max(t, 0.0), 1.0)


def smooth(t):
    t = clamp01(t)
    return t * t * t * (t * (6 * t - 15) + 10)


def ramp(time, cue):
    a, b = cue
    return smooth((time - a) / (b - a))


def lerp(pair, k):
    return pair[0] + (pair[1] - pair[0]) * k


def pull_at(time):
    # Steady, easing off only at the end.
    t = clamp01((time - PULL[0]) / (PULL[1] - PULL[0]))
    return 1 - (1 - t) ** 1.8


def camera_at(time):
    k = pull_at(time)
    rack = smooth((time - FOCUS_RACK[0]) / (FOCUS_RACK[1] - FOCUS_RACK[0]))
    return {
        "target": (TARGET[0], TARGET[1], TOP_Z - TOP_RATIO * lerp(DISTANCE, k)),
        "distance": lerp(DISTANCE, k),
        "azimuth": lerp(AZIMUTH, k),
        "elevation": lerp(ELEVATION, k),
        "lens": 85,
        "dof": 5.6,
        # Out of focus at first, racking onto the vessel's front edge.
        "focus_shift": 1.1 - FOCUS_START_OFFSET * (1 - rack),
    }


# Lights strike like studio strobes or fluorescent tubes rather than
# fading up: a few hard on/off stutters, more on than off as they catch,
# then steady. Frame-based and seeded per light, so every render of the
# film flickers identically. FLICKER sets how far through each cue the
# stutter lasts (0 turns it off).
FLICKER = 0
FLICKER_FPS = 24


def flicker(role, time, cue):
    a, b = cue
    u = (time - a) / (b - a)
    if u <= 0:
        return 0.0
    if u >= FLICKER:
        return 1.0
    frame = int(time * FLICKER_FPS)
    h = int(hashlib.md5(f"{role}:{frame}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    # The chance of being lit climbs from a quarter to nearly always.
    on = h < 0.25 + 0.7 * (u / FLICKER) ** 1.3
    return 1.0 if on else 0.04


def rig_at(time, hero_rig):
    """The final rig (setting A), each light scaled by its cue; the key also
    moving; plus the temporary right rim."""
    key, rim_far, rim_left, top = (dict(l) for l in hero_rig)
    roles = {"key": key, "rim_far": rim_far, "rim_left": rim_left, "top": top, "rim_right": dict(RIM_RIGHT)}
    lights = []
    for role, light in roles.items():
        k = flicker(role, time, CUES[role]) if FLICKER else ramp(time, CUES[role])
        if role == "rim_right":
            k *= 1 - ramp(time, RIM_RIGHT_OUT)
        if k <= 0:
            continue
        light["power"] *= k
        if role == "key":
            s = smooth((time - KEY_SWEEP["time"][0]) / (KEY_SWEEP["time"][1] - KEY_SWEEP["time"][0]))
            light["azimuth"] = lerp(KEY_SWEEP["azimuth"], s)
            light["elevation"] = lerp(KEY_SWEEP["elevation"], s)
            light["power"] *= 1 + (KEY_SWEEP_BOOST - 1) * math.sin(math.pi * s)
        lights.append((role, light))
    return lights


def spin_at(time):
    """Degrees still to turn: a constant-feeling glide that eases to a stop."""
    t = clamp01((time - SPIN["time"][0]) / (SPIN["time"][1] - SPIN["time"][0]))
    return SPIN["degrees"] * (1 - t) ** 2


# Real camera motion blur: the spin and the camera move are keyframed, so
# Cycles blurs whatever moves during the shutter (half a frame, 180°),
# smoothing the glints off thin parts into streaks as a film camera would.
MOTION_BLUR = True
SHUTTER = 0.5


def animate(sc, model, shot, frames, fps):
    """Keyframe the spin (on a pivot the reactor is parented to) and the
    camera, one key per frame plus one either side, so each frame's motion
    blur sees where things were a moment before and after."""
    centre = (model.full_lo + model.full_hi) / 2
    pivot = bpy.data.objects.new("spin", None)
    sc.collection.objects.link(pivot)
    pivot.location = centre
    bpy.context.view_layer.update()
    inverse = pivot.matrix_world.inverted()
    for o in model.meshes:
        # Keep each part exactly where it is: its old parents (the CAD
        # assembly nodes) carry the Z-up rotation, so take the world matrix
        # before reparenting and set it back as the local transform.
        world = o.matrix_world.copy()
        o.parent = pivot
        o.matrix_parent_inverse = inverse
        o.matrix_basis = world
    keys = range(-1, frames + 1)
    for n in keys:
        pivot.rotation_euler = (0, 0, math.radians(spin_at(n / fps)))
        pivot.keyframe_insert("rotation_euler", index=2, frame=n)

    poses = []
    for n in keys:
        shot["camera"] = camera_at(n / fps)
        R.place_camera(shot, model)
        bpy.context.view_layer.update()  # matrix_world is stale until then
        c = sc.camera
        poses.append((n, c.matrix_world.copy(), c.data.dof.focus_distance))
    template = sc.camera
    cam = bpy.data.objects.new("anim-camera", template.data.copy())
    sc.collection.objects.link(cam)
    bpy.data.objects.remove(template)
    sc.camera = cam
    cam.rotation_mode = "QUATERNION"
    prev = None
    for n, m, focus in poses:
        loc, rot, _ = m.decompose()
        if prev is not None and prev.dot(rot) < 0:
            rot.negate()
        prev = rot
        cam.location, cam.rotation_quaternion = loc, rot
        cam.keyframe_insert("location", frame=n)
        cam.keyframe_insert("rotation_quaternion", frame=n)
        cam.data.dof.focus_distance = focus
        cam.data.dof.keyframe_insert("focus_distance", frame=n)
    sc.render.use_motion_blur = True
    sc.render.motion_blur_shutter = SHUTTER


def option(args, flag, default):
    return args[args.index(flag) + 1] if flag in args else default


def main():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    scale = int(option(args, "--scale", 100))
    samples = int(option(args, "--samples", 192))
    fps = int(option(args, "--fps", 24))
    every = int(option(args, "--every", 1))
    stills = option(args, "--stills", None)
    out = os.path.abspath(option(args, "--out", os.path.join(R.ROOT, "renders", "reveal-cine")))
    frames_dir = os.path.join(out, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    # The dark look: setting A (mark-0-dark-a.json).
    with open(os.path.join(R.HERE, "mark-0-dark-a.json")) as f:
        hero = next(s for s in json.load(f) if s["name"] == "m0-full-01-hero")
    # The halo: a tight pool of light on a neutral grey wall, just behind
    # and slightly below the reactor's middle, falling off to black.
    look = dict(hero["look_settings"])
    if HALO_ON:
        look.update(dark=True, bg_power=HALO_POWER, wall="#5c5f63", bg_low=0.05, bg_size=0.45, bg_dist=0.3)
    hero_rig = look["rig"]
    if "--still-look" not in args:
        # Motion-safe versions of the still look. Detail finer than a pixel
        # (the blasted micro-bump, glints) shimmers and crawls as the
        # reactor turns; per-frame film grain and bloom on noisy highlights
        # read as flicker. Stills keep them; the film doesn't.
        look.update(texture=None, glints=0)
        # Softer edges: the many thin rails and parts on top catch and lose
        # the light as the reactor turns; brightened, polished edges make
        # each catch a hard white flash.
        look.update(edge_wear=0.25, edge_shine=0.1)
        # Slightly rougher metal: the polished handles and rails carry tiny,
        # very bright highlights that sparkle between frames.
        look.update(roughness_add=0.05)
        hero = dict(hero, post={"bloom": 0.0, "fringe": 0.0007, "vignette": 0.12, "grain": 0.0})
    shot = dict(hero, name="mark-0-reveal-cine", resolution=[1920, 1080], samples=samples, look_settings=look)
    if "--still-look" not in args:
        # A wider pixel filter for motion: thin bright edges stop stepping
        # between pixels from frame to frame.
        shot["filter_width"] = 1.5

    R.enable_gpu()
    model = R.Model.load("mark-0")
    model.arrange({})  # assembled, upright: the scene is set up at the end pose
    sc = bpy.context.scene

    # Set the scene up at the final framing, so the backdrop wall sits
    # where the hero shot wants it; the camera then moves in front of it.
    shot["camera"] = camera_at(SECONDS)
    R.place_camera(shot, model)
    R.reset_stage()
    R.LOOKS[shot["look"]][0](shot, model)
    for o in [o for o in sc.objects if o.type == "LIGHT" and o.name != "background"]:
        bpy.data.objects.remove(o)
    halo = sc.objects.get("background")
    halo_energy = halo.data.energy if halo else 0
    excluded = bpy.data.collections.get("backdrop-only")
    sc.render.resolution_x, sc.render.resolution_y = shot["resolution"]
    sc.render.resolution_percentage = scale
    sc.render.use_persistent_data = True
    # Clamp stray bright samples off glossy bounces: they land on different
    # pixels every frame and read as sparkle on the handles.
    sc.cycles.sample_clamp_indirect = 3.0
    # Same sample count in every pixel of every frame: adaptive sampling
    # stops at different points frame to frame, so the denoiser gets
    # slightly different input each time and fine detail boils.
    sc.cycles.use_adaptive_sampling = False
    sc.render.image_settings.file_format = "OPEN_EXR"
    sc.render.image_settings.color_depth = "32"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.film_transparent = False

    frames = round(SECONDS * fps)
    blur = MOTION_BLUR and "--no-blur" not in args
    if blur:
        animate(sc, model, shot, frames, fps)
    times = [float(t) for t in stills.split(",")] if stills else [n / fps for n in range(0, frames, every)]
    target = Vector(TARGET)
    view = {"azimuth": LIGHT_AZIMUTH, "radius": LIGHT_RADIUS}
    pngs = []
    for time in times:
        n = round(time * fps)
        done = os.path.join(frames_dir, f"{n:04d}.png")
        if not stills and os.path.exists(done):
            # Resume: frames finished by an earlier, interrupted run are kept.
            pngs.extend([done] * every)
            continue
        if blur:
            sc.frame_set(n)
        else:
            shot["camera"] = camera_at(time)
            model.arrange({"tilt": {"angle": spin_at(time), "axis": [0, 0, 1]}})
            R.place_camera(shot, model)
        # place_camera replaces the camera; keep the halo lamp unaffected.
        for o in [o for o in sc.objects if o.type == "LIGHT" and o.name != "background"]:
            bpy.data.objects.remove(o)
        for role, light in rig_at(time, hero_rig):
            R.add_light(role, target, view, light)
            if excluded:
                sc.objects[role].light_linking.receiver_collection = excluded
        if halo:
            halo.data.energy = max(halo_energy * ramp(time, HALO), 1e-6)

        raw = os.path.join(frames_dir, f"{n:04d}.exr")
        sc.render.filepath = raw
        bpy.ops.render.render(write_still=True)
        rgb = R.load_exr(raw)
        os.remove(raw)
        rgb = R.LOOKS[shot["look"]][1](rgb, shot)
        png = os.path.join(frames_dir, f"{n:04d}.png")
        R.save_png(R.finish(rgb, shot, seed=n), png)
        pngs.extend([png] * (1 if stills else every))
        print(f"frame {n + 1}/{frames} ({time:.2f}s)", flush=True)

    if not stills:
        R.encode_video(pngs[:frames], os.path.join(out, "mark-0-reveal-cine.mp4"), fps)
        print(f"rendered {os.path.join(out, 'mark-0-reveal-cine.mp4')}", flush=True)


if __name__ == "__main__":
    main()
