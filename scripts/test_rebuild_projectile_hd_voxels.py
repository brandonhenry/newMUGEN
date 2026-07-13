import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image


SCRIPT = Path(__file__).with_name("rebuild-projectile-hd-voxels.py")
SPEC = importlib.util.spec_from_file_location("rebuild_projectile_hd_voxels", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ProjectileHdVoxelBuilderTests(unittest.TestCase):
    def build(self, image: Image.Image, target_rows: int = 64):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "frame-000.png"
            image.save(path)
            return MODULE.build_payload(path, "/characters/test/projectiles/shot/frames/frame-000.png", target_rows=target_rows)

    def test_normalizes_low_resolution_foreground_to_target_rows(self):
        image = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
        for y in range(2, 6):
            for x in range(2, 6):
                image.putpixel((x, y), (255, 48, 16, 255))
        payload = self.build(image)
        self.assertEqual(payload["source"]["crop"], [2, 2, 6, 6])
        self.assertEqual(payload["source"]["effectiveRows"], 64)
        self.assertEqual(payload["source"]["columns"], 64)
        self.assertNotIn("#000000", payload["palette"])

    def test_preserves_wide_aspect_ratio(self):
        image = Image.new("RGBA", (12, 6), (255, 220, 40, 255))
        payload = self.build(image)
        self.assertEqual(payload["source"]["columns"], 128)
        self.assertAlmostEqual(payload["source"]["modelWidth"] / payload["source"]["modelHeight"], 2, places=4)

    def test_premultiplied_resize_does_not_create_dark_halos(self):
        image = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
        image.putpixel((2, 2), (255, 32, 16, 255))
        payload = self.build(image)
        colors = [int(color[1:3], 16) for color in payload["palette"]]
        self.assertTrue(colors)
        self.assertGreater(min(colors), 128)

    def test_output_is_deterministic_and_merged(self):
        image = Image.new("RGBA", (4, 2), (80, 160, 240, 255))
        first = self.build(image, target_rows=32)
        second = self.build(image, target_rows=32)
        self.assertEqual(first, second)
        self.assertLess(len(first["voxels"]), first["source"]["columns"] * first["source"]["targetRows"])


if __name__ == "__main__":
    unittest.main()
