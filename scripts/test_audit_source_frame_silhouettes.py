import importlib.util
from pathlib import Path
import unittest

from PIL import Image


MODULE_PATH = Path(__file__).with_name("audit-source-frame-silhouettes.py")
SPEC = importlib.util.spec_from_file_location("audit_source_frame_silhouettes", MODULE_PATH)
audit = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(audit)


class ExpectedSilhouetteTests(unittest.TestCase):
    def test_restores_dark_matte_only_inside_existing_silhouette_span(self):
        source = Image.new("RGBA", (5, 5), (0, 0, 0, 255))
        current = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
        for point in ((0, 2), (4, 2)):
            source.putpixel(point, (96, 96, 96, 255))
            current.putpixel(point, (96, 96, 96, 255))

        candidate, _, missing, _ = audit.expected_silhouette(
            source,
            current,
            {(0, 0, 0), (96, 96, 96)},
            {(0, 0, 0)},
            set(),
        )

        self.assertEqual(missing[(0, 0, 0)], 3)
        self.assertEqual(candidate.getpixel((2, 2)), (0, 0, 0, 255))
        self.assertEqual(candidate.getpixel((2, 1))[3], 0)

    def test_never_restores_a_character_key_color(self):
        source = Image.new("RGBA", (5, 5), (0, 0, 248, 255))
        current = Image.new("RGBA", (5, 5), (0, 0, 0, 0))
        current.putpixel((0, 2), (96, 96, 96, 255))
        current.putpixel((4, 2), (96, 96, 96, 255))

        candidate, _, missing, _ = audit.expected_silhouette(
            source,
            current,
            {(0, 0, 248), (96, 96, 96)},
            {(0, 0, 248)},
            {(0, 0, 248)},
        )

        self.assertFalse(missing)
        self.assertEqual(candidate.tobytes(), current.tobytes())


if __name__ == "__main__":
    unittest.main()
