import importlib.util
from pathlib import Path
import unittest

from PIL import Image


SCRIPT = Path(__file__).with_name("repair-jugo-transparency.py")
SPEC = importlib.util.spec_from_file_location("repair_jugo_transparency", SCRIPT)
assert SPEC and SPEC.loader
repair = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(repair)


class RepairJugoTransparencyTest(unittest.TestCase):
    def test_exact_matte_crop_preserves_near_magenta_art(self) -> None:
        image = Image.new("RGBA", (5, 5), (248, 0, 248, 255))
        image.putpixel((2, 2), (240, 8, 240, 255))
        candidate, source_box = repair.exact_matte_crop(image, (0, 0, 5, 5))

        self.assertEqual(candidate.size, (1, 1))
        self.assertEqual(candidate.getpixel((0, 0)), (240, 8, 240, 255))
        self.assertEqual(source_box, [2, 2, 3, 3])

    def test_source_mapping_skips_effect_cells_and_keeps_portrait(self) -> None:
        source_indices = [*range(repair.AUTHORED_FRAME_COUNT - 1), repair.PORTRAIT_SOURCE_CELL]

        self.assertEqual(len(source_indices), repair.AUTHORED_FRAME_COUNT)
        self.assertEqual(source_indices[-2:], [143, 147])
        self.assertNotIn(144, source_indices)
        self.assertNotIn(145, source_indices)
        self.assertNotIn(146, source_indices)


if __name__ == "__main__":
    unittest.main()
