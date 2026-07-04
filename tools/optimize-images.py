"""Create web-sized image variants while preserving the original files."""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]


def save_webp(source: Path, destination: Path, max_width: int, quality: int) -> None:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        width, height = image.size

        if width > max_width:
            target_height = round(height * max_width / width)
            image = image.resize(
                (max_width, target_height),
                Image.Resampling.LANCZOS,
            )

        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, "WEBP", quality=quality, method=6)

        size_kib = destination.stat().st_size / 1024
        print(
            f"{destination.relative_to(ROOT)}: "
            f"{image.width}x{image.height}, {size_kib:.0f} KiB"
        )


def optimize_team() -> None:
    source_dir = ROOT / "assets" / "team"
    output_dir = source_dir / "optimized"

    for name in ("mario", "mihhail", "egor", "sofia", "jekaterina", "andrei"):
        source = source_dir / f"{name}.png"

        for width in (480, 960):
            save_webp(
                source,
                output_dir / f"{name}-{width}.webp",
                max_width=width,
                quality=80,
            )


def optimize_gala() -> None:
    source_dir = ROOT / "assets" / "tunnustusgala"
    output_dir = source_dir / "optimized"

    for source in sorted(source_dir.glob("gala-*.jpg")):
        save_webp(
            source,
            output_dir / f"{source.stem}.webp",
            max_width=1200,
            quality=78,
        )


def optimize_street_dance() -> None:
    source_dir = ROOT / "assets" / "street-dance-jam"
    output_dir = source_dir / "optimized"

    for source in sorted(source_dir.glob("*.jpg")):
        save_webp(
            source,
            output_dir / f"{source.stem}.webp",
            max_width=1200,
            quality=80,
        )


def optimize_news() -> None:
    news_dir = ROOT / "assets" / "news"

    for source in sorted(news_dir.rglob("*.jpg")):
        save_webp(
            source,
            source.with_suffix(".webp"),
            max_width=1600,
            quality=80,
        )


def optimize_icons() -> None:
    with Image.open(ROOT / "assets" / "logo.png") as opened:
        source = ImageOps.exif_transpose(opened).convert("RGBA")

        favicon = source.resize((96, 96), Image.Resampling.LANCZOS)
        favicon.save(ROOT / "favicon.png", "PNG", optimize=True)

        apple_touch_icon = source.resize((180, 180), Image.Resampling.LANCZOS)
        apple_touch_icon.save(
            ROOT / "apple-touch-icon.png",
            "PNG",
            optimize=True,
        )

        source.save(
            ROOT / "favicon.ico",
            "ICO",
            sizes=[(16, 16), (32, 32), (48, 48)],
        )

        print("favicon.png: 96x96")
        print("apple-touch-icon.png: 180x180")
        print("favicon.ico: 16x16, 32x32, 48x48")


if __name__ == "__main__":
    optimize_team()
    optimize_gala()
    optimize_street_dance()
    optimize_news()
    optimize_icons()
