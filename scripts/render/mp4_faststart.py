#!/usr/bin/env python3
"""Move an MP4's index (the moov box) in front of the media data, so a
browser can start playing before the whole file has downloaded — what
ffmpeg calls -movflags +faststart. Blender's encoder writes it at the end.

    python3 scripts/render/mp4_faststart.py in.mp4 out.mp4
"""
import struct
import sys

CONTAINERS = {b"moov", b"trak", b"mdia", b"minf", b"stbl", b"edts", b"dinf", b"udta"}


def boxes(data, start, end):
    i = start
    while i < end:
        size, kind = struct.unpack(">I4s", data[i : i + 8])
        header = 8
        if size == 1:
            size = struct.unpack(">Q", data[i + 8 : i + 16])[0]
            header = 16
        elif size == 0:
            size = end - i
        yield i, size, header, kind
        i += size


def shift_offsets(moov, delta):
    """Add `delta` to every chunk offset (stco / co64) inside moov."""
    moov = bytearray(moov)

    def walk(start, end):
        for i, size, header, kind in boxes(moov, start, end):
            if kind in CONTAINERS:
                walk(i + header, i + size)
            elif kind == b"stco":
                count = struct.unpack(">I", moov[i + 12 : i + 16])[0]
                for k in range(count):
                    at = i + 16 + 4 * k
                    struct.pack_into(">I", moov, at, struct.unpack(">I", moov[at : at + 4])[0] + delta)
            elif kind == b"co64":
                count = struct.unpack(">I", moov[i + 12 : i + 16])[0]
                for k in range(count):
                    at = i + 16 + 8 * k
                    struct.pack_into(">Q", moov, at, struct.unpack(">Q", moov[at : at + 8])[0] + delta)

    walk(0, len(moov))
    return bytes(moov)


def main(src, dst):
    data = open(src, "rb").read()
    top = list(boxes(data, 0, len(data)))
    kinds = [k for _, _, _, k in top]
    if kinds.index(b"moov") < kinds.index(b"mdat"):
        open(dst, "wb").write(data)
        return
    moov = next(data[i : i + s] for i, s, _, k in top if k == b"moov")
    rest = [data[i : i + s] for i, s, _, k in top if k != b"moov"]
    # Everything after ftyp moves down by moov's size.
    moov = shift_offsets(moov, len(moov))
    out = rest[0] + moov + b"".join(rest[1:])
    open(dst, "wb").write(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
