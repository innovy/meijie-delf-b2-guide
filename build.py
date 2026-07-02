import csv
import json
import re
from io import StringIO
from pathlib import Path


ROOT = Path(__file__).parent
CONTENT_DIR = ROOT / "content"
DATA_FILE = CONTENT_DIR / "data.json"
SITE_FILE = CONTENT_DIR / "site.json"
INDEX_FILE = CONTENT_DIR / "articles.json"
CATEGORY_DIR = CONTENT_DIR / "categories"
CATEGORY_INDEX_FILE = CONTENT_DIR / "categories.json"


DEFAULT_SITE = {
    "title": "妹姐的DELF B2超级攻略",
    "subtitle": "Guide DELF B2",
    "logo": "assets/brand/meijie-logo.png",
    "searchPlaceholder": "搜索考试流程、写作、口语...",
    "authorCard": {
        "name": "妹姐老师",
        "avatar": "assets/brand/meijie-avatar.jpg",
        "bio": [
            "DALF C2 95分",
            "巴黎索邦大学语言学硕士",
            "12年帮助2000+学员通过B2/C1/C2",
        ],
        "wechatId": "meijie_fr",
        "wechatQr": "assets/brand/wechat-qr.jpg",
        "wechatButtonText": "加微信",
    },
    "socials": [],
}


def split_frontmatter(text):
    normalized = text.replace("\r\n", "\n")
    if not normalized.startswith("---\n"):
        return {}, normalized.strip()

    end = normalized.find("\n---", 4)
    if end == -1:
        return {}, normalized.strip()

    marker_end = normalized.find("\n", end + 4)
    if marker_end == -1:
        body = ""
    else:
        body = normalized[marker_end + 1 :]

    return parse_frontmatter_block(normalized[4:end]), body.strip()


def parse_frontmatter_block(raw):
    meta = {}
    for line in raw.strip().splitlines():
        if ":" not in line:
            continue

        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()

        if value.startswith("[") and value.endswith("]"):
            meta[key] = parse_inline_list(value[1:-1])
        else:
            meta[key] = strip_quotes(value)

    return meta


def parse_inline_list(raw):
    reader = csv.reader(StringIO(raw), skipinitialspace=True)
    return [strip_quotes(item.strip()) for item in next(reader, []) if item.strip()]


def strip_quotes(value):
    value = str(value).strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def read_json(path, fallback):
    if not path.exists():
        return fallback
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return fallback


def read_site():
    if SITE_FILE.exists():
        return read_json(SITE_FILE, DEFAULT_SITE)
    existing = read_json(DATA_FILE, {})
    return existing.get("site") or DEFAULT_SITE


def order_value(meta, fallback):
    raw = meta.get("order", fallback)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return fallback


def normalize_list(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in re.split(r"[,，]", value) if item.strip()]
    return []


def slugify(value, fallback="item"):
    slug = re.sub(r"[^\w\u4e00-\u9fff]+", "-", str(value or "").strip().lower(), flags=re.UNICODE)
    return slug.strip("-") or fallback


def truncate_text(text, max_length=92):
    normalized = re.sub(r"\s+", " ", text).strip()
    if len(normalized) <= max_length:
        return normalized
    return re.sub(r"[，。；、,.!?！？\s]+$", "", normalized[:max_length]) + "..."


def strip_markdown(markdown):
    text = str(markdown or "")
    text = re.sub(r"!\[(.*?)\]\((.*?)\)", r"\1", text)
    text = re.sub(r"\[\[([^\]|]+)\|?([^\]]*)\]\]", lambda m: f"{m.group(2)} {m.group(1)}", text)
    text = re.sub(r"\[([^\]]+)\]\((.*?)\)", r"\1", text)
    text = re.sub(r"[#>*`_-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def generate_summary(body):
    blocks = [
        block.strip()
        for block in str(body or "").replace("\r\n", "\n").split("\n\n")
        if block.strip()
    ]
    first = next(
        (
            block
            for block in blocks
            if not block.startswith("#") and not block.startswith("!") and not block.startswith("|")
        ),
        str(body or ""),
    )
    return truncate_text(strip_markdown(first))


def load_categories():
    categories = []
    if not CATEGORY_DIR.exists():
        return categories

    for fallback, path in enumerate(sorted(CATEGORY_DIR.glob("*.md")), start=1000):
        meta, _body = split_frontmatter(path.read_text(encoding="utf-8"))
        title = meta.get("title") or path.stem
        slug = meta.get("slug") or slugify(title or path.stem)
        categories.append(
            {
                "id": slug,
                "title": title,
                "order": order_value(meta, fallback),
                "sourceFile": str(path.relative_to(ROOT)),
            }
        )

    categories.sort(key=lambda item: (item["order"], item["title"]))
    return categories


def resolve_category_id(meta, categories):
    category_id = meta.get("categoryId")
    category_name = meta.get("category")
    by_id = {item["id"]: item for item in categories}
    by_title = {item["title"]: item for item in categories}

    if category_id in by_id:
        return category_id
    if category_name in by_id:
        return category_name
    if category_name in by_title:
        return by_title[category_name]["id"]
    if categories:
        return categories[0]["id"]
    return "uncategorized"


def load_articles(categories):
    articles = []
    for fallback, path in enumerate(sorted(CONTENT_DIR.glob("*.md")), start=1000):
        if path.parent == CATEGORY_DIR:
            continue

        meta, body = split_frontmatter(path.read_text(encoding="utf-8"))
        title = meta.get("title") or path.stem
        slug = meta.get("slug") or slugify(title or path.stem)
        article = {
            "id": meta.get("id") or slug,
            "title": title,
            "slug": slug,
            "categoryId": resolve_category_id(meta, categories),
            "order": order_value(meta, fallback),
            "author": meta.get("author") or "妹姐",
            "summary": meta.get("summary") or generate_summary(body),
            "tags": normalize_list(meta.get("tags")),
            "aliases": normalize_list(meta.get("aliases")),
            "body": body,
            "sourceFile": str(path.relative_to(ROOT)),
        }
        articles.append(article)

    category_order = {category["id"]: category["order"] for category in categories}
    articles.sort(
        key=lambda item: (
            category_order.get(item["categoryId"], 9999),
            item["order"],
            item["title"],
        )
    )
    return articles


def add_missing_categories(categories, articles):
    known = {category["id"] for category in categories}
    for article in articles:
        category_id = article.get("categoryId") or "uncategorized"
        if category_id in known:
            continue
        known.add(category_id)
        categories.append(
            {
                "id": category_id,
                "title": category_id,
                "order": max([item["order"] for item in categories] or [0]) + 1,
                "sourceFile": "",
            }
        )
    categories.sort(key=lambda item: (item["order"], item["title"]))


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    site = read_site()
    categories = load_categories()
    articles = load_articles(categories)
    add_missing_categories(categories, articles)

    write_json(
        DATA_FILE,
        {
            "version": 1,
            "site": site,
            "categories": categories,
            "articles": articles,
        },
    )

    write_json(
        INDEX_FILE,
        {
            "articles": [
                {"file": article["sourceFile"], "order": article["order"]}
                for article in sorted(articles, key=lambda item: (item["order"], item["sourceFile"]))
            ]
        },
    )

    write_json(
        CATEGORY_INDEX_FILE,
        {
            "categories": [
                {
                    "title": category["title"],
                    "slug": category["id"],
                    "order": category["order"],
                    "file": category.get("sourceFile", ""),
                }
                for category in categories
            ]
        },
    )

    print(
        f"Generated {DATA_FILE.relative_to(ROOT)}, {INDEX_FILE.relative_to(ROOT)} "
        f"and {CATEGORY_INDEX_FILE.relative_to(ROOT)} from Markdown source."
    )


if __name__ == "__main__":
    main()
