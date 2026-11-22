# B524 spike (throwaway): writes the spike's own resources into engine-mod/src/gametest/resources/:
# flat pictures of our own (no vanilla pixels) for the boat, chest boat and villager type layers under
# assets/msm_b524/textures/entity/, and the GameTest structure msm_runtime_gametest:b524_yard (17x10x17, a stone floor).
# Usage: python3 -I make-resources.py <engine-mod/src/gametest/resources>
import os
import sys

from PIL import Image
root = os.path.join(sys.argv[1], "assets", "msm_b524")
def save(rel, img):
    p = os.path.join(root, rel); os.makedirs(os.path.dirname(p), exist_ok=True); img.save(p)
def stripes(w, h, a, b, step=4):
    img = Image.new("RGBA", (w, h))
    for x in range(w):
        for y in range(h):
            img.putpixel((x, y), b if (x // step) % 2 else a)
    return img
teal, dteal = (40, 170, 160, 255), (20, 110, 105, 255)
save("textures/entity/boat/spike.png", stripes(128, 64, teal, dteal))
cb = stripes(128, 128, teal, dteal)
for x in range(128):
    for y in range(64, 128):
        cb.putpixel((x, y), (230, 140, 30, 255) if (x // 4 + y // 4) % 2 else (160, 90, 10, 255))
save("textures/entity/chest_boat/spike.png", cb)
v = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
for x in range(64):
    for y in range(20, 64):
        v.putpixel((x, y), (150, 40, 200, 255) if (x // 2 + y // 2) % 2 else (90, 20, 130, 255))
save("textures/entity/villager/type/spike.png", v)
z = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
for x in range(64):
    for y in range(20, 64):
        z.putpixel((x, y), (230, 200, 30, 255) if (x // 2 + y // 2) % 2 else (150, 120, 10, 255))
save("textures/entity/zombie_villager/type/spike.png", z)
n, h = 17, 10
rows = ['        {pos: [%d, 0, %d], state: "minecraft:stone"}' % (x, z) for x in range(n) for z in range(n)]
yard = os.path.join(sys.argv[1], "data", "msm_runtime_gametest", "gametest", "structure", "b524_yard.snbt")
os.makedirs(os.path.dirname(yard), exist_ok=True)
with open(yard, "w") as f:
    f.write("{\n    DataVersion: 2730,\n    size: [%d, %d, %d],\n    data: [\n%s\n    ],\n    entities: [],\n    palette: [\n        \"minecraft:stone\"\n    ]\n}\n" % (n, h, n, ",\n".join(rows)))
