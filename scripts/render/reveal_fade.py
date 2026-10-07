"""The product reveal as a slow pull-back out of the dark, after the
reference silhouette film: the frame opens tight on the reactor and almost
black; the light comes up, catching the edges first, while the camera
eases back to the full hero composition. The background stays black.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/render/reveal_fade.py -- \\
        [--scale percent] [--samples n] [--fps n] [--out dir] [--every n]

Same options and output as reveal.py; writes <out>/mark-0-reveal-fade.mp4.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import reveal  # noqa: E402

SECONDS = 3.5
# The move and the fade run together for MOVE seconds, then the frame holds.
MOVE = 3.0
CENTRE = 1.55
START_DISTANCE, END_DISTANCE = 8.5, 18.5
# Exposure as a fraction of the hero's: from nearly black up to full.
START_LIGHT = 0.03


def ease_out(t):
    t = min(max(t, 0.0), 1.0)
    # Gentle: the reference pulls back steadily across the whole clip,
    # easing off only towards the end.
    return 1 - (1 - t) ** 1.7


def ease_in_out(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def spec_at(time):
    return {}


def camera_at(time):
    pull = ease_out(time / MOVE)
    return {
        "target": (0.0, 0.0, CENTRE),
        "distance": START_DISTANCE + (END_DISTANCE - START_DISTANCE) * pull,
        "azimuth": 30,
        "elevation": 10,
        "lens": 85,
        "dof": 5.6,
        "focus_shift": 1.1,
    }


HERO_EXPOSURE = None


def look_at(time):
    k = START_LIGHT + (1 - START_LIGHT) * ease_in_out(time / MOVE)
    return {"exposure": HERO_EXPOSURE * k}


if __name__ == "__main__":
    import json

    import render as R

    with open(os.path.join(R.HERE, "mark-0-black.json")) as f:
        HERO_EXPOSURE = next(s for s in json.load(f) if s["name"] == "m0-full-01-hero")["look_settings"]["exposure"]
    reveal.main(spec_at, camera_at, SECONDS, name="mark-0-reveal-fade", default_out="reveal-fade", look_fn=look_at)
