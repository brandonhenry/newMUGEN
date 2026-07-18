#!/usr/bin/env python3
"""Shared two-pass alpha cleanup for Story-mode actor sprites."""

from __future__ import annotations

from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter


def alpha_mask(image: Image.Image) -> bytearray:
    return bytearray(1 if alpha > 16 else 0 for alpha in image.convert("RGBA").getchannel("A").get_flattened_data())


def _within(channel: Image.Image, value: int, tolerance: int, size: tuple[int, int]) -> Image.Image:
    reference = Image.new("L", size, value)
    return ImageChops.difference(channel, reference).point(lambda distance: 255 if distance <= tolerance else 0)


def remove_exterior_matte(
    image: Image.Image,
    background: tuple[int, int, int],
    *,
    initial_tolerance: int = 34,
    fringe_tolerance: int = 54,
    peel_passes: int = 6,
) -> Image.Image:
    """Remove only matte colors connected to the sheet exterior, then its fringe."""
    source = image.convert("RGB")
    red, green, blue = source.split()
    candidates = ImageChops.multiply(
        _within(red, background[0], initial_tolerance, source.size),
        _within(green, background[1], initial_tolerance, source.size),
    )
    candidates = ImageChops.multiply(candidates, _within(blue, background[2], initial_tolerance, source.size))

    connected = candidates.copy()
    ImageDraw.floodfill(connected, (0, 0), 128)
    connected = connected.point(lambda value: 255 if value == 128 else 0)
    alpha = ImageChops.invert(connected)

    maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    minimum = ImageChops.darker(ImageChops.darker(red, green), blue)
    neutral = ImageChops.subtract(maximum, minimum).point(lambda chroma: 255 if chroma <= 32 else 0)
    near_matte = ImageChops.multiply(
        _within(red, background[0], fringe_tolerance, source.size),
        _within(green, background[1], fringe_tolerance, source.size),
    )
    near_matte = ImageChops.multiply(near_matte, _within(blue, background[2], fringe_tolerance, source.size))
    fringe = ImageChops.multiply(neutral, near_matte)

    for _ in range(peel_passes):
        boundary = ImageChops.subtract(alpha, alpha.filter(ImageFilter.MinFilter(3)))
        removal = ImageChops.multiply(boundary, fringe)
        if not removal.getbbox():
            break
        alpha = ImageChops.subtract(alpha, removal)

    result = source.convert("RGBA")
    result.putalpha(alpha.point(lambda value: 255 if value else 0))
    return result


def strip_exterior_neutral_fuzz(
    image: Image.Image,
    *,
    minimum_value: int = 72,
    maximum_value: int = 214,
    maximum_chroma: int = 30,
    peel_passes: int = 8,
) -> Image.Image:
    """Peel medium neutral halo pixels while stopping at dark/colored artwork."""
    source = image.convert("RGBA")
    red, green, blue, source_alpha = source.split()
    alpha = source_alpha.point(lambda value: 255 if value > 16 else 0)
    maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    minimum = ImageChops.darker(ImageChops.darker(red, green), blue)
    neutral = ImageChops.subtract(maximum, minimum).point(lambda chroma: 255 if chroma <= maximum_chroma else 0)
    neutral = ImageChops.multiply(
        neutral,
        maximum.point(lambda value: 255 if minimum_value <= value <= maximum_value else 0),
    )
    neutral = ImageChops.multiply(neutral, alpha)

    for _ in range(peel_passes):
        boundary = ImageChops.subtract(alpha, alpha.filter(ImageFilter.MinFilter(3)))
        removal = ImageChops.multiply(boundary, neutral)
        if not removal.getbbox():
            break
        alpha = ImageChops.subtract(alpha, removal)

    result = source.copy()
    result.putalpha(alpha)
    return result


def _inside_span(mask: bytearray, width: int, height: int, x: int, y: int) -> bool:
    return (
        any(mask[y * width + neighbor_x] for neighbor_x in range(x))
        and any(mask[y * width + neighbor_x] for neighbor_x in range(x + 1, width))
    ) or (
        any(mask[neighbor_y * width + x] for neighbor_y in range(y))
        and any(mask[neighbor_y * width + x] for neighbor_y in range(y + 1, height))
    )


def fill_small_enclosed_holes(source: Image.Image, current: Image.Image, *, max_pixels: int = 24) -> Image.Image:
    result = current.convert("RGBA").copy()
    width, height = result.size
    existing = alpha_mask(result)
    visited = bytearray(width * height)
    source_pixels = source.convert("RGBA").load()
    for start in range(width * height):
        if visited[start] or existing[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        component: list[int] = []
        touches_border = False
        while queue:
            key = queue.popleft()
            component.append(key)
            x, y = key % width, key // width
            touches_border = touches_border or x == 0 or y == 0 or x == width - 1 or y == height - 1
            for neighbor_x, neighbor_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if not 0 <= neighbor_x < width or not 0 <= neighbor_y < height:
                    continue
                neighbor = neighbor_y * width + neighbor_x
                if not visited[neighbor] and not existing[neighbor]:
                    visited[neighbor] = 1
                    queue.append(neighbor)
        if touches_border or len(component) > max_pixels:
            continue
        if not all(_inside_span(existing, width, height, key % width, key // width) for key in component):
            continue
        for key in component:
            x, y = key % width, key // width
            red, green, blue, _ = source_pixels[x, y]
            result.putpixel((x, y), (red, green, blue, 255))
    return result


def fill_dense_interior_gaps(source: Image.Image, current: Image.Image, *, radius: int = 3) -> Image.Image:
    result = current.convert("RGBA").copy()
    width, height = result.size
    existing = alpha_mask(result)
    source_pixels = source.convert("RGBA").load()
    repairs: list[tuple[int, int]] = []
    area = (radius * 2 + 1) ** 2
    for y in range(radius, height - radius):
        for x in range(radius, width - radius):
            key = y * width + x
            if existing[key]:
                continue
            left = any(existing[y * width + x - step] for step in range(1, radius + 1))
            right = any(existing[y * width + x + step] for step in range(1, radius + 1))
            above = any(existing[(y - step) * width + x] for step in range(1, radius + 1))
            below = any(existing[(y + step) * width + x] for step in range(1, radius + 1))
            if not (left and right and above and below):
                continue
            occupied = sum(
                existing[neighbor_y * width + neighbor_x]
                for neighbor_y in range(y - radius, y + radius + 1)
                for neighbor_x in range(x - radius, x + radius + 1)
            )
            if occupied * 2 >= area:
                repairs.append((x, y))
    for x, y in repairs:
        red, green, blue, _ = source_pixels[x, y]
        result.putpixel((x, y), (red, green, blue, 255))
    return result


def fill_single_pinholes(source: Image.Image, current: Image.Image) -> Image.Image:
    result = current.convert("RGBA").copy()
    pixels = result.load()
    source_pixels = source.convert("RGBA").load()
    repairs: list[tuple[int, int]] = []
    for y in range(1, result.height - 1):
        for x in range(1, result.width - 1):
            if pixels[x, y][3]:
                continue
            if all(pixels[nx, ny][3] for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))):
                repairs.append((x, y))
    for x, y in repairs:
        red, green, blue, _ = source_pixels[x, y]
        result.putpixel((x, y), (red, green, blue, 255))
    return result


def clean_transparent_sprite(image: Image.Image) -> Image.Image:
    """Run exterior fuzz removal, then both conservative interior-fill passes."""
    source = image.convert("RGBA")
    cleaned = strip_exterior_neutral_fuzz(source)
    cleaned = fill_small_enclosed_holes(source, cleaned)
    cleaned = fill_dense_interior_gaps(source, cleaned)
    cleaned = fill_single_pinholes(source, cleaned)
    return cleaned
