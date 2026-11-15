"""Build the browser catalog and triangle index from the cited astronomy data."""
import itertools
import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree


source = Path(sys.argv[1])
output = Path(sys.argv[2])
bin_count = 85
neighbor_count = 48


def load(name):
    return json.loads((source / (name + ".json")).read_text())


stars = sorted(
    (feature for feature in load("stars.8")["features"] if feature["properties"]["mag"] <= 6.35),
    key=lambda feature: feature["properties"]["mag"],
)
magnitudes = np.array([star["properties"]["mag"] for star in stars])
coordinates = np.array([star["geometry"]["coordinates"] for star in stars])
ra, dec = np.radians(coordinates.T)
vectors = np.column_stack([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)])
names = load("starnames")
constellations = {feature["id"]: feature for feature in load("constellations")["features"]}
figures = [
    [
        line["id"],
        constellations[line["id"]]["properties"]["ru"],
        constellations[line["id"]]["properties"]["la"],
        constellations[line["id"]]["geometry"]["coordinates"],
        line["geometry"]["coordinates"],
    ]
    for line in load("constellations.lines")["features"]
]
roman = []
for line in (source / "roman.txt").read_text().splitlines():
    if line.strip() and not line.lstrip().startswith("#"):
        low, high, south, constellation = line.split()
        roman.append([float(low), float(high), float(south), constellation])

catalog = {
    "bins": bin_count,
    "neighborCount": neighbor_count,
    "stars": [
        [*star["geometry"]["coordinates"], star["properties"]["mag"], star["id"]]
        for star in stars
    ],
    "names": {
        str(star["id"]): names[str(star["id"])]["name"]
        for star in stars
        if str(star["id"]) in names and names[str(star["id"])]["name"]
    },
    "figures": figures,
    "regions": roman,
}
(output / "catalog.json").write_text(json.dumps(catalog, separators=(",", ":"), ensure_ascii=False))


def chord(degrees):
    return 2 * math.sin(math.radians(degrees) / 2)


buckets = [[] for _ in range(bin_count * bin_count)]
seen = set()
for limit, count in [(3.55, 17), (4.3, 18), (4.95, 16), (5.5, 14), (6.05, 12), (6.35, 10)]:
    end = np.searchsorted(magnitudes, limit, side="right")
    tree = cKDTree(vectors[:end])
    distances, close = tree.query(vectors[:end], k=count + 1, distance_upper_bound=chord(59))
    for a, local in enumerate(close):
        local = local[1:]
        local = local[local < end]
        if not len(local):
            continue
        positions_b, positions_c = np.triu_indices(len(local), 1)
        b, c = local[positions_b], local[positions_c]
        opposite_a = np.linalg.norm(vectors[b] - vectors[c], axis=1)
        lengths = distances[a, 1:1 + len(local)]
        sides = np.column_stack((opposite_a, lengths[positions_c], lengths[positions_b]))
        ordering = np.argsort(sides, axis=1)
        sorted_sides = np.take_along_axis(sides, ordering, axis=1)
        short, middle, long = sorted_sides.T
        u = middle / long
        v = short / long
        height = np.sqrt(np.maximum(0, u * u - ((1 + u * u - v * v) / 2) ** 2))
        keep = (long >= chord(3.4)) & (long <= chord(62)) & (v >= 0.24) & (height >= 0.14)
        vertices = np.column_stack((np.full(len(b), a), b, c))
        for tri, xi, yi in zip(np.take_along_axis(vertices, ordering, axis=1)[keep], u[keep], v[keep]):
            key = tuple(int(i) for i in tri)
            if key in seen:
                continue
            seen.add(key)
            index = min(bin_count - 1, int(xi * bin_count)) * bin_count + min(bin_count - 1, int(yi * bin_count))
            buckets[index].append(key)

offsets = np.zeros(len(buckets) + 1, dtype="<u4")
triangles = np.empty((len(seen), 3), dtype="<u2")
index = 0
for group, bucket in enumerate(buckets):
    offsets[group] = index
    bucket.sort(key=sum)
    end = index + len(bucket)
    if bucket:
        triangles[index:end] = bucket
    index = end
offsets[-1] = index

tree = cKDTree(vectors)
all_near = tree.query_ball_point(vectors, chord(38))
_, closest = tree.query(vectors, k=14)
neighbors = np.full((len(stars), neighbor_count), 65535, dtype="<u2")
for i, indices in enumerate(all_near):
    # Nearby faint stars help solve close views. The brightest stars within
    # a larger radius make the first verification useful for phone photos.
    near = list(dict.fromkeys([*closest[i, 1:], *sorted(indices)]))
    near = [j for j in near if j != i][:neighbor_count]
    neighbors[i, :len(near)] = near

with (output / "index.bin").open("wb") as stream:
    offsets.tofile(stream)
    triangles.tofile(stream)
    neighbors.tofile(stream)
print(f"{len(stars):,} stars and {len(seen):,} indexed triangles")
