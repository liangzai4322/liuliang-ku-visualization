#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将「流量库.csv」转换为双击 HTML 可用的 traffic-data.js。"""

from __future__ import annotations

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path


COLUMN_CONFIG = {
    "库名": {"display": False, "label": "库名", "area": "hidden"},
    "来源文件": {"display": False, "label": "来源文件", "area": "hidden"},
    "归档日期": {"display": False, "label": "归档日期", "area": "hidden"},
    "案例日期": {"display": True, "label": "案例日期", "area": "title"},
    "大分类": {"display": True, "label": "大分类", "area": "title"},
    "细分赛道": {"display": True, "label": "细分赛道", "area": "title"},
    "案例/来源": {"display": True, "label": "案例/来源", "area": "title"},
    "引流平台": {"display": True, "label": "引流平台", "area": "body"},
    "引流钩子": {"display": True, "label": "引流钩子", "area": "body"},
    "冷启动方式": {"display": True, "label": "冷启动方式", "area": "body"},
    "规模化路径": {"display": True, "label": "规模化路径", "area": "body"},
    "证据/备注": {"display": True, "label": "证据/备注", "area": "detail"},
}

CSV_FILE = Path("流量库.csv")
JSON_FILE = Path("traffic-data.json")
JS_FILE = Path("traffic-data.js")
DATE_ISO_FIELD = "案例日期_ISO"
DATE_TS_FIELD = "案例日期_TS"
RAW_INDEX_FIELD = "__rawIndex"

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def clean_cell(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\ufeff", "").strip()
    return re.sub(r"\s+", " ", text)


def build_iso_date(year: int, month: int) -> tuple[str, int]:
    if year < 2000 or month < 1 or month > 12:
        return "", 0
    iso_date = f"{year:04d}-{month:02d}-01"
    timestamp = int(datetime(year, month, 1, tzinfo=timezone.utc).timestamp())
    return iso_date, timestamp


def parse_case_date(value: str) -> tuple[str, int]:
    text = clean_cell(value)
    if not text:
        return "", 0

    normalized = text.replace("_", "-").replace("/", "-").replace(".", "-")
    normalized = re.sub(r"\s+", "-", normalized)

    match = re.match(r"^(?P<year>\d{4})-(?P<month>\d{1,2})(?:-\d{1,2})?$", normalized)
    if match:
        return build_iso_date(int(match.group("year")), int(match.group("month")))

    match = re.match(r"^(?P<year>\d{2})-(?P<month>\d{1,2})(?:-\d{1,2})?$", normalized)
    if match:
        return build_iso_date(2000 + int(match.group("year")), int(match.group("month")))

    match = re.match(r"^(?P<year>\d{2,4})-(?P<month>[A-Za-z]+)$", normalized)
    if not match:
        match = re.match(r"^(?P<month>[A-Za-z]+)-(?P<year>\d{2,4})$", normalized)
    if match:
        year = int(match.group("year"))
        if year < 100:
            year += 2000
        month = MONTHS.get(match.group("month").lower(), 0)
        return build_iso_date(year, month)

    match = re.match(r"^(?P<year>\d{2,4})年(?P<month>\d{1,2})月", text)
    if match:
        year = int(match.group("year"))
        if year < 100:
            year += 2000
        return build_iso_date(year, int(match.group("month")))

    return "", 0


def normalize_row(row: dict[str, str], raw_index: int) -> dict[str, object]:
    item: dict[str, object] = {RAW_INDEX_FIELD: raw_index}
    for column, config in COLUMN_CONFIG.items():
        if config["display"]:
            item[column] = clean_cell(row.get(column, ""))

    iso_date, timestamp = parse_case_date(str(item.get("案例日期", "")))
    item[DATE_ISO_FIELD] = iso_date
    item[DATE_TS_FIELD] = timestamp
    return item


def convert(csv_path: Path = CSV_FILE, json_path: Path = JSON_FILE, js_path: Path = JS_FILE) -> int:
    if not csv_path.exists():
        raise FileNotFoundError(f"找不到 CSV 文件：{csv_path}")

    records: list[dict[str, object]] = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames:
            json_path.write_text("[]\n", encoding="utf-8")
            js_path.write_text("window.TRAFFIC_DATA = [];\n", encoding="utf-8")
            return 0

        for raw_index, row in enumerate(reader, start=1):
            try:
                records.append(normalize_row(row or {}, raw_index))
            except Exception as exc:  # noqa: BLE001 - 数据清洗脚本要尽量不中断。
                records.append(
                    {
                        RAW_INDEX_FIELD: raw_index,
                        "案例/来源": f"第 {raw_index} 行解析失败",
                        "案例日期": "",
                        "大分类": "未分类",
                        "细分赛道": "未分类",
                        "引流平台": "",
                        "引流钩子": "",
                        "冷启动方式": "",
                        "规模化路径": "",
                        "证据/备注": f"原始行存在脏数据：{exc}",
                        DATE_ISO_FIELD: "",
                        DATE_TS_FIELD: 0,
                    }
                )

    json_text = json.dumps(records, ensure_ascii=False, indent=2)
    json_path.write_text(json_text + "\n", encoding="utf-8")
    js_path.write_text(
        "window.TRAFFIC_DATA = "
        + json.dumps(records, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    return len(records)


if __name__ == "__main__":
    total = convert()
    print(f"已生成 {JSON_FILE} 和 {JS_FILE}，共 {total} 条记录。")
