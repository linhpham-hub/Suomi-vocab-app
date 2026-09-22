#!/usr/bin/env python3
"""
Rebuilds data/vocab.json from the "Glossary chapter *.docx" Word files.

Usage:
    python3 scripts/build_vocab.py "/path/to/word lists and games" [--out data/vocab.json]

Each source .docx is expected to contain one table with a header row
("FIN", "ENG") followed by one Finnish/English word pair per row -- this is
the format used by the Metropolia Finnish A1.2 glossary handouts.

Re-run this whenever a new "Glossary chapter N.docx" file is added to the
course folder (e.g. chapter 6, 7, ...): it picks up any file matching
"Glossary chapter*.docx" automatically, so no code changes are needed.
"""
import argparse
import glob
import json
import os
import re
import sys

try:
    import docx
except ImportError:
    sys.exit(
        "Missing dependency 'python-docx'. Install it with:\n"
        "    pip install python-docx --break-system-packages\n"
        "(or just: pip install python-docx)"
    )

CHAPTER_LABEL_OVERRIDES = {
    "1-2": "Chapters 1-2",
}


def chapter_label_from_filename(filename: str) -> str:
    """'Glossary chapter 3.docx' -> 'Chapter 3'; 'Glossary chapter 1-2.docx' -> 'Chapters 1-2'."""
    m = re.search(r"chapter\s+([0-9-]+)", filename, re.IGNORECASE)
    if not m:
        return os.path.splitext(filename)[0]
    key = m.group(1)
    if key in CHAPTER_LABEL_OVERRIDES:
        return CHAPTER_LABEL_OVERRIDES[key]
    return f"Chapter {key}"


def chapter_sort_key(label: str):
    nums = [int(n) for n in re.findall(r"\d+", label)]
    return nums[0] if nums else 999


def extract_pairs(path: str):
    d = docx.Document(path)
    if not d.tables:
        return []
    table = d.tables[0]
    pairs = []
    for row in table.rows[1:]:  # skip header ("FIN", "ENG")
        cells = [c.text.strip() for c in row.cells]
        if len(cells) < 2:
            continue
        fi = re.sub(r"\s+", " ", cells[0]).strip()
        en = re.sub(r"\s+", " ", cells[1]).strip()
        if not fi and not en:
            continue
        pairs.append((fi, en))
    return pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source_dir", help="Folder containing 'Glossary chapter *.docx' files")
    ap.add_argument("--out", default="data/vocab.json", help="Output JSON path")
    args = ap.parse_args()

    pattern = os.path.join(args.source_dir, "Glossary chapter*.docx")
    files = sorted(glob.glob(pattern))
    if not files:
        sys.exit(f"No files matching 'Glossary chapter*.docx' found in {args.source_dir}")

    by_file = {}
    for path in files:
        fname = os.path.basename(path)
        label = chapter_label_from_filename(fname)
        by_file.setdefault(label, []).extend(extract_pairs(path))

    ordered_labels = sorted(by_file.keys(), key=chapter_sort_key)

    words = []
    uid = 1
    for label in ordered_labels:
        for fi, en in by_file[label]:
            words.append({"id": uid, "chapter": label, "fi": fi, "en": en})
            uid += 1

    out_path = args.out
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(
            {"chapters": ordered_labels, "words": words},
            f,
            ensure_ascii=False,
            indent=2,
        )

    print(f"Wrote {len(words)} words across {len(ordered_labels)} chapters -> {out_path}")
    for label in ordered_labels:
        print(f"  {label}: {len(by_file[label])} words")


if __name__ == "__main__":
    main()
