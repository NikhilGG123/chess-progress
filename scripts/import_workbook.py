#!/usr/bin/env python3
"""Turn the coaches' Group Sheets workbook into SQL this app can load.

    python scripts/import_workbook.py "../Group Sheets.xlsx"
    python scripts/import_workbook.py "../Group Sheets.xlsx" --only enrolled.txt
    node scripts/apply-sql.mjs supabase/import/real_data.sql

By default it only reports: nothing is written to the database, and the SQL it
produces has to be applied deliberately with apply-sql.mjs. Read the report
before you do -- it is the last chance to catch a name that should not be
imported.

SUPERSEDED. The centre moved to a Supabase app before this workbook was
retired, so scripts/import_supabase.mjs is the importer that actually ran.
This is kept as the fallback for the spreadsheet, and as the record of how
the cell codes were worked out.

WHAT IT ASSUMES, AND WHY
  * Columns map to topics by position, not by name. The level sheets abbreviate
    ("Dev", "# Pat"), the Topic List tab spells them out, and the two are in the
    same order. Position is the only reliable join.
  * A student appearing in several level sheets is currently in the highest of
    them; the lower ones import as completed history, which is exactly what the
    app's schema is built to hold.
  * The cell codes are the coaches' own: I seen, T needs testing, a tick
    complete, R unexplained (see --r). What X meant was genuinely open when
    this was written, which is why it comes from --x rather than the table
    below, and why the report argues the case. It has since been settled --
    X means COMPLETE, confirmed by the coaches, by the workbook's own grid
    formula, and by the 3,702 rows their database labels 'Completed'. Run
    this with --x checked_off.
  * Real children's names never reach the repository: the output directory is
    gitignored.
"""
from __future__ import annotations

import argparse
import collections
import pathlib
import re
import sys
import unicodedata

try:
    import openpyxl
except ImportError:  # pragma: no cover - environment problem, not logic
    sys.exit("openpyxl is required:  pip install openpyxl")

# The coaches' marks, as they appear in the cells. X is deliberately absent:
# what it means is disputed, so it comes from --x. See the note in main().
CODE_TO_STATUS = {
    "I": "seen",
    "T": "needs_testing",
    "✓": "checked_off",
    "✔": "checked_off",
}

# Rows that are scaffolding rather than children.
JUNK_NAMES = {"student list", "copypasta", "copy paste", "vanilla", "test", "asdf"}

LEVEL_SHEETS = {1: "Level 1", 2: "Level 2", 3: "Level 3"}
TOPIC_SHEET = "Topic List"
FIRST_DATA_ROW = 3
FIRST_TOPIC_COLUMN = 3  # column C; A is the name, B is spacing


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def clean_name(raw: object) -> str | None:
    if raw is None:
        return None
    name = unicodedata.normalize("NFKC", str(raw)).strip()
    name = re.sub(r"\s+", " ", name)
    if not name or name.lower() in JUNK_NAMES:
        return None
    # A cell holding a formula error, or a stray number.
    if name.startswith("#") or re.fullmatch(r"[\d.]+", name):
        return None
    return name


def read_topics(workbook) -> dict[int, list[str]]:
    """{level number: [topic names in order]} from the Topic List tab."""
    topics: dict[int, list[str]] = collections.OrderedDict()
    for level, _key, name in workbook[TOPIC_SHEET].iter_rows(
        min_row=1, max_col=3, values_only=True
    ):
        if not level or not name:
            continue
        number = int(str(level).strip().lower().replace("level", ""))
        topics.setdefault(number, []).append(str(name).strip())
    return topics


class Report:
    def __init__(self) -> None:
        self.codes: collections.Counter = collections.Counter()
        self.unknown: collections.Counter = collections.Counter()
        self.per_level: dict[int, int] = {}
        self.duplicates: list[str] = []
        self.multi_level: dict[str, list[int]] = {}
        self.skipped_not_enrolled = 0
        self.cells = 0


def read_level(sheet, topic_names: list[str], report: Report, r_status: str, x_status: str):
    """[(student name, [(topic name, status), ...]), ...] for one level sheet."""
    rows = []
    last_column = FIRST_TOPIC_COLUMN + len(topic_names) - 1

    for row in sheet.iter_rows(
        min_row=FIRST_DATA_ROW, max_col=last_column, values_only=True
    ):
        name = clean_name(row[0])
        if not name:
            continue

        marks = []
        for index, cell in enumerate(row[FIRST_TOPIC_COLUMN - 1 : last_column]):
            if cell is None:
                continue
            code = str(cell).strip().upper()
            if not code:
                continue

            report.codes[code] += 1
            if code == "R":
                status = r_status
            elif code == "X":
                status = x_status
            else:
                status = CODE_TO_STATUS.get(code)

            if status is None:
                report.unknown[code] += 1
                continue
            # 'not seen' is what a fresh row already holds.
            if status == "not_seen":
                continue

            marks.append((topic_names[index], status))

        rows.append((name, marks))

    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workbook", help="path to Group Sheets.xlsx")
    parser.add_argument(
        "--out",
        default="supabase/import/real_data.sql",
        help="where to write the SQL (default: %(default)s)",
    )
    parser.add_argument(
        "--x",
        dest="x_status",
        default="not_seen",
        choices=["not_seen", "checked_off"],
        help="what X means (default: %(default)s, which is what the coaches "
        "said). The workbook's own formula and the mark counts both point the "
        "other way -- read the warning in the report before importing.",
    )
    parser.add_argument(
        "--r",
        dest="r_status",
        default="needs_testing",
        choices=sorted(set(CODE_TO_STATUS.values()) | {"needs_testing"}),
        help="what the unexplained R code means (default: %(default)s). "
        "Ask the coaches before trusting this.",
    )
    parser.add_argument(
        "--only",
        metavar="FILE",
        help="a file of currently enrolled names, one per line. Without it "
        "every row in the workbook is imported, including students who left "
        "years ago.",
    )
    args = parser.parse_args()

    path = pathlib.Path(args.workbook)
    if not path.exists():
        return print(f"no such workbook: {path}") or 1

    enrolled: set[str] | None = None
    if args.only:
        enrolled = {
            line.strip().lower()
            for line in pathlib.Path(args.only).read_text(encoding="utf-8").splitlines()
            if line.strip()
        }

    workbook = openpyxl.load_workbook(path, data_only=True, read_only=False)
    topics = read_topics(workbook)
    report = Report()

    # {name: {level: [(topic, status)]}}
    students: dict[str, dict[int, list[tuple[str, str]]]] = collections.OrderedDict()

    for number, sheet_name in LEVEL_SHEETS.items():
        if sheet_name not in workbook.sheetnames:
            print(f"warning: no '{sheet_name}' tab, skipping level {number}")
            continue

        rows = read_level(
            workbook[sheet_name], topics.get(number, []), report, args.r_status, args.x_status
        )
        seen_here: collections.Counter = collections.Counter()
        kept = 0

        for name, marks in rows:
            if enrolled is not None and name.lower() not in enrolled:
                report.skipped_not_enrolled += 1
                continue

            seen_here[name.lower()] += 1
            if seen_here[name.lower()] > 1:
                # Two rows for one name in one level. Keep both but make them
                # distinguishable; the coaches decide which is real.
                label = f"{name} ({seen_here[name.lower()]})"
                report.duplicates.append(f"{name} — level {number}")
            else:
                label = name

            students.setdefault(label, {})[number] = marks
            report.cells += len(marks)
            kept += 1

        report.per_level[number] = kept

    for name, levels in students.items():
        if len(levels) > 1:
            report.multi_level[name] = sorted(levels)

    # ---- the report ------------------------------------------------------
    print()
    print("=" * 66)
    print("  IMPORT REPORT — nothing has been written to the database")
    print("=" * 66)
    print(f"  workbook          {path}")
    print(f"  students          {len(students)}")
    for number in sorted(report.per_level):
        print(f"    level {number}         {report.per_level[number]} rows")
    print(f"  progress marks    {report.cells}")
    if enrolled is not None:
        print(f"  skipped (not on the enrolled list)   {report.skipped_not_enrolled}")
    print()
    print("  cell codes found:")
    for code, count in report.codes.most_common():
        if code == "R":
            meaning = "R -> " + args.r_status
        elif code == "X":
            meaning = "X -> " + args.x_status
        else:
            meaning = CODE_TO_STATUS.get(code, "UNRECOGNISED")
        print(f"    {code:<4} {count:>6}   {meaning}")
    print()

    if report.unknown:
        print("  ! codes that were skipped because nothing maps to them:")
        for code, count in report.unknown.most_common():
            print(f"      {code!r} x{count}")
        print()

    complete = report.codes["✓"] + report.codes["✔"] + (
        report.codes["X"] if args.x_status == "checked_off" else 0
    )
    if complete < report.cells * 0.05:
        print("  !! ALMOST NOTHING IMPORTS AS COMPLETE")
        print(f"     Only {complete} of {report.cells} marks mean 'checked off'.")
        print("     A centre that promotes students between four levels should")
        print("     have far more. Two things point at X being 'complete', not")
        print("     'not seen':")
        print("       - the workbook's own grid formula reads a topic as X when")
        print("         the lesson log recorded it with an X suffix, and falls")
        print("         back to I when the topic was merely taught;")
        print(f"       - X appears {report.codes['X']} times while the tick appears")
        print(f"         {report.codes['✓'] + report.codes['✔']}.")
        print("     Ask the coaches, then re-run with --x checked_off if so.")
        print()

    if report.multi_level:
        print(f"  students in more than one level ({len(report.multi_level)}) —")
        print("  the highest becomes their current level, the rest become history:")
        for name, levels in list(report.multi_level.items())[:10]:
            print(f"      {name}: levels {', '.join(map(str, levels))} -> current {max(levels)}")
        if len(report.multi_level) > 10:
            print(f"      … and {len(report.multi_level) - 10} more")
        print()

    if report.duplicates:
        print(f"  ! duplicate names within a level ({len(report.duplicates)}) —")
        print("    imported with a numeric suffix; rename them in the app:")
        for entry in report.duplicates[:10]:
            print(f"      {entry}")
        print()

    if enrolled is None:
        print("  ! every row was imported, including students who have left.")
        print("    Pass --only enrolled.txt with the current register.")
        print()

    # ---- the SQL ---------------------------------------------------------
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = [
        "-- Generated by scripts/import_workbook.py — do not edit by hand.",
        f"-- Source: {path.name}",
        f"-- Students: {len(students)}   Marks: {report.cells}   R read as: {args.r_status}",
        "--",
        "-- Apply with:  node scripts/apply-sql.mjs " + str(out).replace('\\', '/'),
        "--",
        "-- Run supabase/seed/999_placeholder_teardown.sql FIRST, or the demo",
        "-- students will sit alongside the real ones.",
        "",
        "begin;",
        "",
    ]

    for label, levels in students.items():
        current = max(levels)
        lines.append(f"-- {label}")
        lines.append(
            "insert into students (full_name, current_level_id)\n"
            f"select {sql_quote(label)}, id from levels where number = {current}\n"
            f"  and not exists (select 1 from students where full_name = {sql_quote(label)});"
        )

        for number in sorted(levels):
            # Every level they have been through needs its rows, and only the
            # current level gets them from the insert trigger.
            if number != current:
                lines.append(
                    "insert into progress (student_id, topic_id, status)\n"
                    "select s.id, t.id, 'not_seen'\n"
                    "  from students s, topics t, levels l\n"
                    f" where s.full_name = {sql_quote(label)}\n"
                    f"   and t.level_id = l.id and l.number = {number}\n"
                    "on conflict (student_id, topic_id) do nothing;"
                )

            by_status: dict[str, list[str]] = collections.defaultdict(list)
            for topic_name, status in levels[number]:
                by_status[status].append(topic_name)

            for status, topic_names in by_status.items():
                names = ", ".join(sql_quote(n) for n in sorted(set(topic_names)))
                lines.append(
                    f"update progress p set status = '{status}'\n"
                    "  from students s, topics t, levels l\n"
                    " where p.student_id = s.id and p.topic_id = t.id\n"
                    "   and t.level_id = l.id\n"
                    f"   and s.full_name = {sql_quote(label)}\n"
                    f"   and l.number = {number}\n"
                    f"   and t.name in ({names});"
                )
        lines.append("")

    lines.append("commit;")
    lines.append("")
    lines.append("-- Check before trusting it:")
    lines.append("--   select count(*) from students;")
    lines.append("--   select status, count(*) from progress group by status;")

    out.write_text("\n".join(lines), encoding="utf-8", newline="\n")

    print(f"  SQL written to {out}")
    print("  Nothing is live until you run:")
    print(f"    node scripts/apply-sql.mjs {str(out).replace(chr(92), '/')}")
    print("=" * 66)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
