#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest

from PIL import Image


SCRIPT = Path(__file__).with_name("repair-character-frame-transparency.py")
SPEC = importlib.util.spec_from_file_location("repair_transparency", SCRIPT)
assert SPEC and SPEC.loader
repair = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(repair)


class TransparencyRepairTests(unittest.TestCase):
    def test_border_connected_background_does_not_clear_enclosed_matching_color(self) -> None:
        image = Image.new("RGBA", (7, 7), (0, 128, 128, 255))
        for y in range(1, 6):
            for x in range(1, 6):
                image.putpixel((x, y), (30, 30, 30, 255))
        image.putpixel((3, 3), (0, 128, 128, 255))
        cleaned = repair.clear_border_background(image, [(0, 128, 128)], 0)
        self.assertEqual(cleaned.getpixel((0, 0))[3], 0)
        self.assertEqual(cleaned.getpixel((3, 3))[3], 255)

    def test_make_candidate_preserves_intentional_current_hole(self) -> None:
        source = Image.new("RGBA", (7, 7), (0, 128, 128, 255))
        for y in range(1, 6):
            for x in range(1, 6):
                source.putpixel((x, y), (200, 80, 40, 255))
        source.putpixel((3, 3), (2, 127, 127, 255))
        current = source.crop((1, 1, 6, 6))
        current.putpixel((2, 2), (2, 127, 127, 0))
        candidate, _, _ = repair.make_candidate(source, (1, 1, 6, 6), current, [(0, 128, 128)], 1, 8, 18)
        self.assertEqual(candidate.getpixel((3, 3))[3], 0)

    def test_make_candidate_restores_non_background_pixel(self) -> None:
        source = Image.new("RGBA", (7, 7), (0, 128, 128, 255))
        for y in range(1, 6):
            for x in range(1, 6):
                source.putpixel((x, y), (40, 90, 120, 255))
        current = source.crop((1, 1, 6, 6))
        current.putpixel((2, 2), (40, 90, 120, 0))
        candidate, _, metrics = repair.make_candidate(source, (1, 1, 6, 6), current, [(0, 128, 128)], 1, 8, 18)
        self.assertEqual(candidate.getpixel((3, 3))[3], 255)
        self.assertGreater(metrics["restoredPixels"], 0)

    def test_duplicate_identical_sources_are_not_ambiguous(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.png"
            second = Path(directory) / "second.png"
            Image.new("RGBA", (8, 8), (1, 2, 3, 255)).save(first)
            second.write_bytes(first.read_bytes())
            frames = [{"index": 0, "box": [1, 1, 4, 4]}]
            resolved, reason = repair.resolve_source_path("same.png", [first, second], frames)
            self.assertIsNotNone(resolved)
            self.assertEqual(reason, "duplicate-identical")

    def test_nonidentical_fitting_sources_are_ambiguous(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory) / "first.png"
            second = Path(directory) / "second.png"
            Image.new("RGBA", (8, 8), (1, 2, 3, 255)).save(first)
            Image.new("RGBA", (8, 8), (4, 5, 6, 255)).save(second)
            frames = [{"index": 0, "box": [1, 1, 4, 4]}]
            resolved, reason = repair.resolve_source_path("same.png", [first, second], frames)
            self.assertIsNone(resolved)
            self.assertEqual(reason, "ambiguous-source")

    def test_exact_key_cleanup_is_character_scoped_and_trimmable(self) -> None:
        image = Image.new("RGBA", (5, 5), (248, 0, 248, 255))
        image.putpixel((2, 2), (40, 50, 60, 255))
        cleaned, removed = repair.clear_exact_keys(image, {(248, 0, 248)})
        trimmed, source_box = repair.trim_candidate(cleaned, (10, 20, 15, 25))
        self.assertEqual(removed, 24)
        self.assertEqual(trimmed.size, (3, 3))
        self.assertEqual(source_box, (11, 21, 14, 24))

    def test_naruto_matte_keys_are_scoped_away_from_authored_effect_palettes(self) -> None:
        self.assertEqual(repair.EXACT_KEYS_BY_CHARACTER["choji-akimichi"], {(48, 200, 152)})
        self.assertEqual(repair.EXACT_KEYS_BY_CHARACTER["gaara"], {(0, 0, 248), (0, 200, 120), (0, 216, 0)})
        self.assertEqual(repair.EXACT_KEYS_BY_CHARACTER["kiba-inuzuka"], {(248, 0, 0), (0, 0, 248)})
        self.assertEqual(repair.EXACT_KEYS_BY_CHARACTER["pain"], {(248, 0, 248)})
        self.assertEqual(repair.EXACT_KEYS_BY_CHARACTER["suigetsu"], {(248, 0, 248)})
        self.assertNotIn("sai", repair.EXACT_KEYS_BY_CHARACTER)
        self.assertNotIn("sasori", repair.EXACT_KEYS_BY_CHARACTER)
        self.assertNotIn("kidomaru-curse-mark", repair.EXACT_KEYS_BY_CHARACTER)


if __name__ == "__main__":
    unittest.main()
