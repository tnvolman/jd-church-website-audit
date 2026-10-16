#!/usr/bin/env python3
"""Build a 1:1 plugin icon from Journey Digital's public mark.

Artwork: https://journeydigital.ai/static/journeydigital_mark.png
Plate: #111111, the site background (--bg) on https://journeydigital.ai/audit

The mark is centered, unscaled, on a solid square. Transparent pixels take
the plate color. No other brand mark is added.
"""

from __future__ import annotations

import struct
import urllib.request
import zlib
from pathlib import Path

SOURCE_URL = "https://journeydigital.ai/static/journeydigital_mark.png"
PLATE = (0x11, 0x11, 0x11, 255)
CANVAS = 1024
OUT = Path(__file__).resolve().parents[1] / "assets" / "icon.png"


def read_png(data: bytes) -> tuple[int, int, list[bytearray]]:
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit("source is not a PNG")
    pos = 8
    width = height = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, bit, color, comp, filt, inter = struct.unpack(">IIBBBBB", chunk[:13])
            if (bit, color, inter) != (8, 6, 0):
                raise SystemExit(f"unsupported PNG {bit=} {color=} {inter=}")
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
        pos += 12 + length
    if not width or not height:
        raise SystemExit("PNG missing IHDR")
    raw = zlib.decompress(idat)
    bpp = 4
    stride = width * bpp
    rows: list[bytearray] = []
    prev = bytearray(stride)
    i = 0
    for _y in range(height):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride

        def left(x: int) -> int:
            return row[x - bpp] if x >= bpp else 0

        def up(x: int) -> int:
            return prev[x]

        def up_left(x: int) -> int:
            return prev[x - bpp] if x >= bpp else 0

        if filt == 0:
            pass
        elif filt == 1:
            for x in range(stride):
                row[x] = (row[x] + left(x)) & 255
        elif filt == 2:
            for x in range(stride):
                row[x] = (row[x] + up(x)) & 255
        elif filt == 3:
            for x in range(stride):
                row[x] = (row[x] + ((left(x) + up(x)) // 2)) & 255
        elif filt == 4:
            for x in range(stride):
                a, b, c = left(x), up(x), up_left(x)
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                row[x] = (row[x] + pred) & 255
        else:
            raise SystemExit(f"bad filter {filt}")
        rows.append(row)
        prev = row
    return width, height, rows


def composite(width: int, height: int, rows: list[bytearray]) -> bytearray:
    if width > CANVAS or height > CANVAS:
        raise SystemExit("mark is larger than the plate")
    ox = (CANVAS - width) // 2
    oy = (CANVAS - height) // 2
    plate = bytearray(CANVAS * CANVAS * 4)
    pr, pg, pb, pa = PLATE
    for i in range(0, len(plate), 4):
        plate[i : i + 4] = bytes((pr, pg, pb, pa))
    for y in range(height):
        src = rows[y]
        for x in range(width):
            sr, sg, sb, sa = src[x * 4 : x * 4 + 4]
            if sa == 0:
                continue
            di = ((oy + y) * CANVAS + (ox + x)) * 4
            if sa == 255:
                plate[di : di + 4] = bytes((sr, sg, sb, 255))
                continue
            a = sa / 255
            plate[di] = int(round(sr * a + pr * (1 - a)))
            plate[di + 1] = int(round(sg * a + pg * (1 - a)))
            plate[di + 2] = int(round(sb * a + pb * (1 - a)))
            plate[di + 3] = 255
    return plate


def write_png(pixels: bytearray, path: Path) -> None:
    raw = bytearray()
    stride = CANVAS * 4
    for y in range(CANVAS):
        raw.append(0)
        raw.extend(pixels[y * stride : (y + 1) * stride])

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", CANVAS, CANVAS, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def main() -> None:
    request = urllib.request.Request(
        SOURCE_URL,
        headers={"User-Agent": "JourneyDigitalChurchAuditPlugin/1.0 (+https://journeydigital.ai/audit)"},
    )
    with urllib.request.urlopen(request, timeout=30) as resp:
        data = resp.read()
    width, height, rows = read_png(data)
    write_png(composite(width, height, rows), OUT)
    print(f"wrote {OUT} {CANVAS}x{CANVAS} from {width}x{height} {SOURCE_URL}")


if __name__ == "__main__":
    main()
