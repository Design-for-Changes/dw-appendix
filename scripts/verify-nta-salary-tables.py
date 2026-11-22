"""Compare the live salary-income function with the endpoints printed in NTA's tables.

Run: python3 scripts/verify-nta-salary-tables.py
Offline: add --pdf-2025 PATH --pdf-2026 PATH for copies of the same official PDFs.
Requires Node.js and Poppler pdftotext; the online mode also uses curl.
No files are written. The expectations for printed numeric rows come from the
PDFs themselves, not a duplicate of the simulator's formula.
"""

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NUMBER = re.compile(r"(?<![\d,])[1-9]\d{0,2}(?:,\d{3})+(?![\d,])")
TABLES = {
    2025: ("https://www.nta.go.jp/publication/pamph/gensen/nencho2025/pdf/114.pdf",
           1_900_000, 1_175, 651_000, 650_000),
    2026: ("https://www.nta.go.jp/publication/pamph/gensen/nencho2026/pdf/114.pdf",
           2_191_000, 1_103, 741_000, 740_000),
}
ACTUAL = """
import fs from 'node:fs';
import {salaryIncomeBeforeAdjustmentYen as salary} from './src/calc/employmentIncome.js';
const [year, inputs] = JSON.parse(fs.readFileSync(0, 'utf8'));
console.log(JSON.stringify(inputs.map(gross => salary(gross, year))));
"""


def literal_rows(pdf, start, row_count):
    if not pdf.startswith(b"%PDF-"):
        raise ValueError("source is not a PDF")
    text = subprocess.run(["pdftotext", "-layout", "-", "-"], input=pdf,
                          capture_output=True, check=True).stdout.decode("utf-8")
    rows = {}
    # Each page has three horizontal panels. A numeric cell row has three
    # successive values: [from, to), output. Ignore headings and prose cells.
    for line in text.splitlines():
        values = [int(n.replace(",", "")) for n in NUMBER.findall(line)]
        for lo, hi, expected in zip(values, values[1:], values[2:]):
            if start <= lo < hi <= 6_600_000 and hi - lo <= 4_000 and 0 < expected < lo:
                if lo in rows:
                    raise ValueError(f"duplicate source row at {lo:,}")
                rows[lo] = (hi, expected)
    if len(rows) != row_count:
        raise ValueError(f"extracted {len(rows)} rows; expected {row_count}")
    cursor = start
    for lo, (hi, _) in sorted(rows.items()):
        if cursor != lo:
            raise ValueError(f"missing/overlapping source rows: {cursor:,} to {lo:,}")
        cursor = hi
    if cursor != 6_600_000:
        raise ValueError(f"source ends at {cursor:,}, not 6,600,000")
    return sorted(rows.items())


def verify(year, local_path):
    url, start, row_count, minimum, deduction = TABLES[year]
    pdf = (local_path.read_bytes() if local_path else
           subprocess.check_output(["curl", "--fail", "--silent", "--show-error",
                                    "--location", "--max-time", "90", url]))
    rows = literal_rows(pdf, start, row_count)
    pairs = [(gross, expected) for lo, (hi, expected) in rows for gross in (lo, hi - 1)]
    # The first and last table bands give prose rules, not 4,000-yen rows.
    # 8,499,999 checks the official note to discard the fraction of one yen.
    pairs.extend([(0, 0), (minimum - 1, 0), (minimum, 1_000),
                  (start - 1, start - 1 - deduction), (6_600_000, 4_840_000),
                  (8_499_999, 6_549_999), (8_500_000, 6_550_000), (15_000_000, 13_050_000)])
    inputs = [gross for gross, _ in pairs]
    run = subprocess.run(["node", "--input-type=module", "-e", ACTUAL], cwd=ROOT,
                         input=json.dumps([year, inputs]), text=True, capture_output=True)
    if run.returncode:
        raise RuntimeError(run.stderr.strip() or "Node could not evaluate the module")
    outputs = json.loads(run.stdout)
    if not isinstance(outputs, list) or len(outputs) != len(pairs):
        raise ValueError(f"{year}: incomplete simulator output")
    errors = [(gross, expected, observed) for (gross, expected), observed in zip(pairs, outputs)
              if observed != expected]
    print(f"{year}: {len(rows):,} literal rows; {len(pairs):,} checks; {len(errors)} mismatches"
          f" (PDF SHA-256 {hashlib.sha256(pdf).hexdigest()})")
    if errors:
        raise ValueError(f"{year}: first mismatches (gross, NTA, simulator): {errors[:10]}")
    return len(pairs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for year in TABLES:
        parser.add_argument(f"--pdf-{year}", type=Path, help=f"local copy of the {year} NTA table")
    args = vars(parser.parse_args())
    total = sum(verify(year, args[f"pdf_{year}"]) for year in TABLES)
    print(f"OK: {total:,} year/salary checks; no mismatches")
