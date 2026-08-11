#!/usr/bin/env python3
"""Convert address_text/latitude/longitude CSV files for GAVADR import."""

import argparse
import csv
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Konvertér en adresse-CSV til formatet for GAVADR-import.",
    )
    parser.add_argument("input", type=Path, help="Eksisterende CSV-fil")
    parser.add_argument("output", type=Path, help="Ny CSV-fil til import")
    return parser.parse_args()


def convert(input_path: Path, output_path: Path) -> int:
    if input_path.resolve() == output_path.resolve():
        raise ValueError("Input- og outputfilen skal være forskellige.")

    with input_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required_columns = {"address_text", "latitude", "longitude"}
        missing = required_columns - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Filen mangler kolonnerne: {', '.join(sorted(missing))}")

        converted: list[dict[str, str | float]] = []
        for row_number, row in enumerate(reader, start=2):
            if not any((value or "").strip() for value in row.values()):
                continue
            try:
                address_text = (row["address_text"] or "").strip()
                address, postal_city = address_text.rsplit(",", maxsplit=1)
                postal_code, city = postal_city.strip().split(maxsplit=1)
                longitude = float(row["longitude"] or "")
                latitude = float(row["latitude"] or "")

                if not address.strip():
                    raise ValueError("adressen mangler")
                if len(postal_code) != 4 or not postal_code.isdigit():
                    raise ValueError("postnummeret skal bestå af fire cifre")
                if not city.strip():
                    raise ValueError("lokaliteten mangler")
                if not 7 <= longitude <= 16:
                    raise ValueError("longitude ligger uden for Danmark")
                if not 54 <= latitude <= 58:
                    raise ValueError("latitude ligger uden for Danmark")

                converted.append({
                    "adresse": address.strip(),
                    "postnummer": postal_code,
                    "lokalitet": city.strip(),
                    "longitude": longitude,
                    "latitude": latitude,
                })
            except (AttributeError, ValueError) as error:
                raise ValueError(f"Fejl på CSV-række {row_number}: {error}") from error

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=["adresse", "postnummer", "lokalitet", "longitude", "latitude"],
            delimiter=";",
            lineterminator="\n",
        )
        writer.writeheader()
        writer.writerows(converted)
    return len(converted)


def main() -> None:
    args = parse_args()
    try:
        count = convert(args.input, args.output)
    except (OSError, ValueError) as error:
        raise SystemExit(f"Fejl: {error}") from error
    print(f"Oprettede {args.output} med {count} adresser.")


if __name__ == "__main__":
    main()
