#!/usr/bin/env python3
"""Build small CJK font subsets for UI and article content.

Requires fonttools[woff] and a complete Noto Serif CJK SC variable font:

  FONT_SOURCE=/path/to/NotoSerifCJKsc-VF.otf python3 scripts/build-fonts.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SOURCE = Path(
    os.environ.get("FONT_SOURCE", "/tmp/NotoSerifCJKsc-VF.otf")
)
OUTPUT = ROOT / "public" / "fonts"


def collect_text(paths: list[Path]) -> str:
    characters: set[str] = set()
    for path in paths:
        text = path.read_text(encoding="utf-8", errors="ignore")
        characters.update(character for character in text if ord(character) > 127)
    return "".join(sorted(characters))


def build_subset(name: str, characters: str) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    text_file = OUTPUT / f".{name}-characters.txt"
    variable_file = OUTPUT / f".{name}-variable.woff2"
    output_file = OUTPUT / f"{name}.woff2"
    text_file.write_text(characters, encoding="utf-8")
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(SOURCE),
            f"--text-file={text_file}",
            f"--output-file={variable_file}",
            "--flavor=woff2",
            "--layout-features=*",
            "--no-hinting",
            "--desubroutinize",
        ],
        check=True,
    )
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.varLib.instancer",
            str(variable_file),
            "wght=450",
            f"--output={output_file}",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
    )
    text_file.unlink(missing_ok=True)
    variable_file.unlink(missing_ok=True)
    print(
        f"{name}: {len(characters)} glyph candidates, weight 450, "
        f"{output_file.stat().st_size:,} bytes"
    )


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Font source not found: {SOURCE}")

    catalog = json.loads((ROOT / "src" / "data" / "catalog.json").read_text())
    ui_text = json.dumps(catalog["groups"], ensure_ascii=False)
    ui_text += json.dumps(
        [
            {
                "title": section["title"],
                "menuTitle": section["menuTitle"],
                "groupTitle": section["groupTitle"],
            }
            for section in catalog["sections"]
        ],
        ensure_ascii=False,
    )
    ui_source = OUTPUT / ".ui-source.txt"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ui_source.write_text(ui_text, encoding="utf-8")
    app_sources = [
        *(ROOT / "src" / "components").glob("*.tsx"),
        *(ROOT / "src" / "pages").glob("*.tsx"),
        *(ROOT / "src" / "context").glob("*.tsx"),
        ui_source,
    ]
    ui_characters = collect_text(app_sources)
    ui_source.unlink(missing_ok=True)
    build_subset("ui-zh", ui_characters)

    article_sources = [
        *(ROOT / "sections").glob("*.html"),
        ROOT / "public" / "search-index.json",
    ]
    build_subset("article-zh", collect_text(article_sources))


if __name__ == "__main__":
    main()
