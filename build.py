import json
import re
from pathlib import Path


ROOT = Path(__file__).parent
CONTENT_DIR = ROOT / "content"
INDEX_FILE = CONTENT_DIR / "articles.json"


def parse_frontmatter(text):
    if not text.startswith("---"):
        return {}

    end = text.find("\n---", 3)
    if end == -1:
        return {}

    meta = {}
    raw = text[3:end].strip()
    for line in raw.splitlines():
        if ":" not in line:
            continue

        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip().strip("\"'")

        if value.startswith("[") and value.endswith("]"):
            value = [
                item.strip().strip("\"'")
                for item in value[1:-1].split(",")
                if item.strip()
            ]

        meta[key] = value

    return meta


def order_value(meta, fallback):
    raw = meta.get("order", fallback)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return fallback


articles = []
for fallback, path in enumerate(sorted(CONTENT_DIR.glob("*.md")), start=1000):
    meta = parse_frontmatter(path.read_text(encoding="utf-8"))
    articles.append(
        {
            "file": str(path.relative_to(ROOT)),
            "order": order_value(meta, fallback),
        }
    )

articles.sort(key=lambda item: (item["order"], item["file"]))
INDEX_FILE.write_text(
    json.dumps({"articles": articles}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

print(f"Generated {INDEX_FILE} with {len(articles)} articles.")
