"""Read-only, source-backed audit of the application's formation_france catalogue.

No database write, inferred long-title backfill, web scraping or LLM generation.
Proposals preserve legacy ids, source keys and the application's array/text types.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DATASET = "fr-esr-cartographie_formations_parcoursup"
API = "https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets"
RULE_VERSION = "formation-catalog-v4"
ARRAY_FIELDS = ("nm", "tf", "fl", "amg")
TEXT_FIELDS = ("app", "int", "aut")
REPAIR_FIELDS = ARRAY_FIELDS + TEXT_FIELDS
IDENTITY_FIELDS = ("annee", "gta", "etab_uai")
OFFICIAL_REFERENCES = {
    "parcoursup": f"{API}/{DATASET}",
    "masters": f"{API}/fr-esr-mon_master",
    "doctoral_schools": f"{API}/fr-esr-ecoles_doctorales_annuaire",
    "qualification_levels": "https://www.service-public.gouv.fr/particuliers/vosdroits/F199",
}


def normalized(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", text.lower().replace("’", "'")).strip()


def text_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return [item.strip() for item in value if item.strip()]
    raise ValueError(f"Expected text or a list of text, got {type(value).__name__}")


def is_missing(value: Any) -> bool:
    return value is None or value == [] or (isinstance(value, str) and not value.strip())


def legacy_value(field: str, value: Any) -> Any:
    if field in TEXT_FIELDS and isinstance(value, str) and value.strip().startswith("{") and value.strip().endswith("}"):
        # psycopg's old list-to-text adaptation stored PostgreSQL array literals.
        contents = value.strip()[1:-1]
        value = next(csv.reader([contents], escapechar="\\")) if contents else []
    values = text_values(value)
    if not values:
        return None
    if field in ARRAY_FIELDS:
        return values
    if field in TEXT_FIELDS:
        return "; ".join(values)
    raise ValueError(f"Field {field!r} is not allowed in a repair proposal")


def _family(text: str, *, short_code: bool = False) -> str | None:
    text = normalized(text)
    if re.search(r"^(?:mise a niveau|classe de mise a niveau|annee preparatoire|insertion a la licence)\b|^man-|^anp$", text):
        return "preparation"
    if re.search(r"\b(?:doctorat d.exercice|docteur en (?:medecine|pharmacie|chirurgie dentaire)|veterinaire)\b", text):
        return "doctorat_exercice" if "doct" in text else "veterinaire"
    if re.search(r"^(?:diplome national de )?(?:doctorat|ph\.?d\.?)\b", text):
        return "doctorat_recherche"
    if re.search(r"^(?:diplome (?:inter[- ]?)?universitaire\b|diplome d'universite\b|(?:du|diu)\b)", text):
        return "du_diu"
    if re.search(r"^(?:mastere|mba|msc|m\.?sc\.?)\b", text):
        return "diplome_etablissement_postgrade"
    if re.search(r"\bdn\s*made\b|^dnm-", text):
        return "dn_made"
    patterns = [
        ("btsa", r"\bbtsa\b"), ("btsm", r"\bbtsm\b"), ("bts", r"\bbts\b"),
        ("but", r"\bbut\b"), ("dut", r"\bdut\b"), ("deust", r"\bdeust\b"),
        ("dscg", r"\bdscg\b"), ("dcg", r"\bdcg\b"),
        ("dnsep", r"\bdnsep\b"), ("dna", r"\bdna\b"),
        ("licence_professionnelle", r"\blicence pro(?:fessionnelle)?\b|^lp-"),
        ("licence", r"\blicence\b|^l[123]-"),
        ("master", r"\bdiplome national de master\b|^master\b|^m[12]-"),
        ("pass", r"^pass\b|\bparcours (?:specifique )?acces sante\b"),
        ("cupge", r"\bcupge\b|\bcycle universitaire preparatoire\b"),
        ("cpes", r"\bcpes\b|\bcycle pluridisciplinaire d.etudes superieures\b"),
        ("cpge", r"\bcpge\b|\bclasses? preparatoires? aux grandes ecoles\b"),
        ("cmi", r"\bcmi\b|\bcursus master en ingenierie\b"),
        ("cap", r"\bcap\b"), ("bac_professionnel", r"\bbac(?:calaureat)? pro(?:fessionnel)?\b"),
        ("bma", r"\bbma\b"), ("brevet_professionnel", r"\bbrevet professionnel\b"),
        ("bachelor", r"\bbachelor\b"), ("ingenieur", r"\bingenieur\b|^fi-bac"),
        ("titre_professionnel", r"\btitre professionnel\b|^tp-"),
        ("certificat_specialisation", r"\bcertificat de specialisation\b|\bmention complementaire\b|^cs-"),
        ("fcil", r"\bfcil\b"),
        ("certification", r"\brncp\b|\bcertificat\b"),
    ]
    matches = [
        (match.start(), position, family)
        for position, (family, pattern) in enumerate(patterns)
        if (match := re.search(pattern, text))
    ]
    if matches:
        return min(matches)[2]
    if short_code:
        for prefix, family in [
            ("ifsi", "sante_paramedical"), ("dnm-", "dn_made"), ("fc-", "ecole_commerce"),
            ("ie", "sciences_po_iep"), ("bpjeps", "sport"),
        ]:
            if text.startswith(prefix):
                return family
    return None


FAMILY_QUALIFICATIONS = {
    "bts": (2, 5, None), "btsa": (2, 5, None), "btsm": (2, 5, None),
    "but": (3, 6, "licence"), "dut": (2, 5, None), "deust": (2, 5, None),
    "licence": (3, 6, "licence"), "licence_professionnelle": (3, 6, "licence"),
    "master": (5, 7, "master"), "doctorat_recherche": (8, 8, "doctorat"),
    "dn_made": (3, 6, "licence"), "dcg": (3, 6, "licence"), "dscg": (5, 7, "master"),
    "dna": (3, 6, None), "dnsep": (5, 7, None),
    "cap": (None, 3, None), "bac_professionnel": (0, 4, None),
    "bma": (0, 4, None), "brevet_professionnel": (0, 4, None),
}
GROUP_FAMILIES = {
    "diplomes d'universite ou d'etablissement": "du_diu",
    "etudes de sante": "sante",
    "formations aux metiers du sport": "sport",
    "formations aux metiers de l'hotellerie restauration": "hotellerie_restauration",
    "formations d'architecture, du paysage et du patrimoine": "architecture_paysage",
    "formations d'art, de design et du spectacle vivant": "arts_design_spectacle",
    "formations des ecoles d'ingenieurs": "ingenieur",
    "formations des ecoles de commerce et de management": "ecole_commerce",
    "formations des ecoles veterinaires": "veterinaire",
    "formations diplomantes du travail social": "travail_social",
    "formations professionnelles": "formation_professionnelle",
    "formations preparatoires a l'enseignement superieur": "preparation",
    "sciences po - instituts d'etudes politiques": "sciences_po_iep",
}


def classify_formation(row: dict[str, Any]) -> dict[str, Any]:
    """Propose an auditable family; absence of proof stays explicit."""
    titles = text_values(row.get("nm"))
    code = str(row.get("nmc") or "").strip()
    types = text_values(row.get("tf"))
    title_family = _family(titles[0]) if titles else None
    code_family = _family(code, short_code=True)
    family = title_family or code_family
    evidence = []
    issues = []
    if title_family:
        evidence.append({"field": "nm", "value": titles[0]})
    if code_family:
        evidence.append({"field": "nmc", "value": code})
    compatible = [
        {"bts", "btsa", "btsm"}, {"licence", "licence_professionnelle"},
        {"ingenieur", "bachelor", "cmi"}, {"titre_professionnel", "certification"},
        {"pass", "licence"}, {"cmi", "licence"}, {"cupge", "licence"}, {"cpes", "licence"},
    ]
    if title_family and code_family and title_family != code_family:
        if not any({title_family, code_family} <= group for group in compatible):
            issues.append("conflicting_diploma_evidence")
            family = "unknown"
    if code_family in {"pass", "cupge", "cpes"} and family == "licence":
        family = code_family
    if not family:
        for label in types:
            family = GROUP_FAMILIES.get(normalized(label)) or _family(label)
            if family:
                evidence.append({"field": "tf", "value": label})
                break
    precise_types = {
        "licence", "licence selective", "licence professionnelle", "but", "dut",
        "deust", "master", "doctorat", "dcg", "dscg", "cpge",
    }
    for label in types:
        type_family = _family(label)
        if family and normalized(label) in precise_types and type_family and family != type_family:
            if not any({family, type_family} <= group for group in compatible):
                issues.append("conflicting_diploma_evidence")
                evidence.append({"field": "tf", "value": label})
                family = "unknown"
    family = family or "unknown"
    if family == "unknown":
        issues.append("diploma_needs_review")
    bac, rncp, grade = FAMILY_QUALIFICATIONS.get(family, (None, None, None))
    primary = normalized(" ".join([titles[0] if titles else "", code]))
    if family not in FAMILY_QUALIFICATIONS and family not in {"unknown", "du_diu", "cpge", "pass", "doctorat_exercice"}:
        declared = re.search(r"\bbac\s*\+?\s*([234568])\b", primary)
        if declared and not re.search(r"\b(?:apres|acces|admission|recrutement)\b.{0,30}\bbac", primary):
            bac = int(declared[1])
        registered = re.search(r"\brncp\s*(?:niveau\s*)?([3-8])\b", primary)
        if registered:
            rncp = int(registered[1])
    # A DU, marketing label or RNCP level does not establish an academic grade.
    if family not in FAMILY_QUALIFICATIONS and family not in {
        "unknown", "doctorat_exercice", "pass", "cupge", "preparation", "cmi", "cpes",
    }:
        declared_grade = re.search(r"\bgrade (?:de )?(licence|master)\b", primary)
        grade = declared_grade[1] if declared_grade else None
        if grade == "master" and re.search(r"\bbachelor\b", primary):
            grade = None
            issues.append("conflicting_grade_evidence")
        elif grade and bac is None:
            bac = 5 if grade == "master" else 3
    study_year = re.match(r"^[lm]([123])(?:-|$)", normalized(code))
    modality = normalized(" ".join(text_values(row.get("app"))))
    apprenticeship = None
    if "apprentissage" in modality or "alternance" in modality or re.search(r"(?:-|/)app$", normalized(code)):
        apprenticeship = not bool(re.search(r"\b(?:hors|sans|pas d')\s*(?:apprentissage|alternance)", modality))
    return {
        "rule_version": RULE_VERSION,
        "diploma_family": family,
        "qualification_bac_level": bac,
        "qualification_rncp_level": rncp,
        "academic_grade": grade,
        "study_year": int(study_year[1]) if study_year else None,
        "apprenticeship": apprenticeship,
        "programme_kind": (
            "preparation" if family in {"cpge", "preparation", "pass", "cupge"}
            else "integrated_pathway" if family in {"cmi", "cpes"} else "degree_or_course"
        ),
        "status": "needs_review" if issues else "source_label" if title_family else "code_or_type_rule",
        "evidence": evidence,
        "issues": issues,
    }


def source_key(row: dict[str, Any]) -> tuple[str, str, str] | None:
    parts = tuple(str(row.get(field) or "").strip() for field in IDENTITY_FIELDS)
    return parts if all(parts) else None


def audit_rows(rows: list[dict[str, Any]], *, complete: bool = False) -> dict[str, Any]:
    identities: dict[tuple[str, str, str], list[Any]] = defaultdict(list)
    families: Counter[str] = Counter()
    years: Counter[str] = Counter()
    missing: Counter[str] = Counter()
    levels: Counter[str] = Counter()
    for row in rows:
        classification = classify_formation(row)
        families[classification["diploma_family"]] += 1
        levels["bac_levels_known"] += classification["qualification_bac_level"] is not None
        levels["rncp_levels_known"] += classification["qualification_rncp_level"] is not None
        levels["academic_grades_established"] += classification["academic_grade"] is not None
        years[str(row.get("annee") or "unknown")] += 1
        for field in ("nm", "nmc", "tf", "fl", "gta", "gti", "etab_uai", "code_formation", "geom"):
            missing[field] += int(is_missing(row.get(field)))
        key = source_key(row)
        if key:
            identities[key].append(row.get("id"))
    return {
        "rows_examined": len(rows),
        "complete_database_snapshot": complete,
        "missing": dict(missing),
        "diploma_families": dict(sorted(families.items())),
        "classification_coverage": dict(levels),
        "sessions": dict(sorted(years.items())),
        "duplicate_source_keys": [
            {"key": list(key), "ids": ids} for key, ids in identities.items() if len(ids) > 1
        ],
    }


def build_repair_plan(
    current: list[dict[str, Any]], source: list[dict[str, Any]], *,
    provenance: dict[str, Any], complete_snapshot: bool = False,
) -> dict[str, Any]:
    """Fill missing legacy metadata only after an exact, unambiguous source match."""
    index: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for record in source:
        key = source_key(record)
        if key:
            index[key].append(record)
    changes, review, classifications = [], [], []
    for row in current:
        row_id = row.get("id")
        if not isinstance(row_id, int) or isinstance(row_id, bool):
            raise ValueError("A repair requires the existing numeric formation_france.id")
        key = source_key(row)
        candidates = index.get(key, []) if key else []
        if len(candidates) != 1:
            review.append({"id": row_id, "reason": "source_not_found" if not candidates else "ambiguous_source_key"})
            continue
        authoritative = candidates[0]
        if normalized(row.get("nmc")) != normalized(authoritative.get("nmc")):
            review.append({"id": row_id, "reason": "source_short_title_changed"})
            continue
        projected = dict(row)
        before, after = {}, {}
        for field in REPAIR_FIELDS:
            value = legacy_value(field, authoritative.get(field))
            existing = legacy_value(field, row.get(field))
            if is_missing(existing) and not is_missing(value):
                before[field] = row.get(field)
                after[field] = value
                projected[field] = value
            elif not is_missing(existing) and not is_missing(value):
                if existing != value:
                    review.append({"id": row_id, "field": field, "reason": "existing_value_differs_from_source"})
        classification = classify_formation(projected)
        classifications.append({"id": row_id, **classification})
        if classification["status"] == "needs_review":
            review.append({"id": row_id, "reason": "classification_requires_review"})
            continue
        if after:
            changes.append({
                "id": row_id, "identity": dict(zip(IDENTITY_FIELDS, key)),
                "before": before, "after": after,
                "classification": classification,
            })
    return {
        "format": "zelia-formation-repair-preview-v1",
        "dry_run": True,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "provenance": provenance,
        "audit_before": audit_rows(current, complete=complete_snapshot),
        "summary": {
            "rows_examined": len(current), "rows_with_proposed_repairs": len(changes),
            "fields_proposed": dict(Counter(field for change in changes for field in change["after"])),
            "rows_requiring_review": len({entry["id"] for entry in review}),
            "bac_levels_known_after_source_match": sum(item["qualification_bac_level"] is not None for item in classifications),
            "rncp_levels_known_after_source_match": sum(item["qualification_rncp_level"] is not None for item in classifications),
        },
        "changes": changes,
        "classifications": classifications,
        "review": review,
        "publication": "NOT APPLIED. Validate a staging import and application compatibility before any database update.",
    }


def fetch_json(url: str) -> Any:
    for attempt in range(3):
        try:
            request = Request(url, headers={
                "User-Agent": "Zelia-CatalogAudit/1.0", "Accept": "application/json",
                "Accept-Encoding": "identity",
            })
            with urlopen(request, timeout=30) as response:
                body = response.read()
                encoding = response.headers.get("Content-Encoding", "").lower()
                if encoding == "gzip" or body.startswith(b"\x1f\x8b"):
                    body = gzip.decompress(body)
                elif encoding not in {"", "identity"}:
                    raise RuntimeError(f"Unsupported source compression: {encoding}")
                return json.loads(body)
        except HTTPError as error:
            if error.code not in {429, 502, 503, 504} or attempt == 2:
                raise RuntimeError(f"Official source returned HTTP {error.code}") from error
            time.sleep(2**attempt)
        except (URLError, TimeoutError) as error:
            if attempt == 2:
                raise RuntimeError("Official source unavailable after three attempts") from error
            time.sleep(2**attempt)
    raise RuntimeError("Official source request did not complete")


def fetch_matching_parcoursup(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    metadata = fetch_json(f"{API}/{DATASET}")
    keys = sorted({key for row in rows if (key := source_key(row))})
    records: list[dict[str, Any]] = []
    for start in range(0, len(keys), 30):
        batch = keys[start:start + 30]
        terms = []
        for year, gta, uai in batch:
            if not (re.fullmatch(r"\d{4}", year) and re.fullmatch(r"\d+", gta) and re.fullmatch(r"[A-Za-z0-9]+", uai)):
                raise ValueError("Unexpected Parcoursup source key; review instead of interpolating it")
            terms.append(f'(annee="{year}" AND gta="{gta}" AND etab_uai="{uai}")')
        offset = 0
        while True:
            url = f"{API}/{DATASET}/records?{urlencode({'where': ' OR '.join(terms), 'limit': 100, 'offset': offset})}"
            page = fetch_json(url)
            if not isinstance(page.get("results"), list) or not isinstance(page.get("total_count"), int):
                raise ValueError("Invalid official source response")
            records.extend(page["results"])
            offset += len(page["results"])
            if offset >= page["total_count"]:
                break
            if not page["results"] or offset >= 10000:
                raise RuntimeError("Source pagination incomplete; use a full official export")
    payload = json.dumps(records, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return records, {
        "dataset": DATASET, "url": OFFICIAL_REFERENCES["parcoursup"],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "publisher_modified_at": metadata.get("metas", {}).get("default", {}).get("modified"),
        "license": metadata.get("metas", {}).get("default", {}).get("license"),
        "records": len(records), "sha256": hashlib.sha256(payload).hexdigest(),
        "scope": "exact matching source keys only", "references": OFFICIAL_REFERENCES,
    }


def master_preview(record: dict[str, Any]) -> dict[str, Any]:
    """Keep Mon Master identity separate from Parcoursup gta/gti and database ids."""
    for field in ("session", "ifc", "eta_uai", "mention"):
        if is_missing(record.get(field)):
            raise ValueError(f"Mon Master record missing {field}")
    title = "Master - " + str(record["mention"]).strip()
    if record.get("parcours"):
        title += " - " + str(record["parcours"]).strip()
    projection = {
        "annee": str(record["session"]), "etab_uai": record["eta_uai"],
        "etab_nom": record.get("eta_nom"), "nmc": title, "nm": [title],
        "tf": ["Master"], "fl": [value for value in [record["mention"], record.get("parcours")] if value],
        "app": "Formations en apprentissage" if str(record.get("alternance")) == "1" else None,
        "gta": None, "gti": None, "code_formation": None,
        "commune": None, "departement": None, "geom": None, "fiche": None,
    }
    return {
        "source": "fr-esr-mon_master",
        "source_key": [str(record["session"]), str(record["ifc"]), record["eta_uai"]],
        "record_kind": "master_course", "eligible_for_publication": False,
        "legacy_projection": projection,
        "classification": classify_formation(projection),
        "campus_source_text": record.get("lieux"),
        "review": [
            "Resolve each real teaching campus, its department and coordinates; do not use the institution headquarters.",
            "Verify the current offer and official programme URL; annual admission statistics do not prove current availability.",
            "Assign a new stable database id in staging; never reuse an existing id or copy ifc into gta/gti.",
        ],
    }


def doctoral_school_preview(record: dict[str, Any]) -> dict[str, Any]:
    """A directory of doctoral schools is not a catalogue of open thesis positions."""
    if not record.get("id_ed") or not record.get("libelle_ed"):
        raise ValueError("Doctoral school record missing id_ed or libelle_ed")
    return {
        "source": "fr-esr-ecoles_doctorales_annuaire",
        "source_key": str(record["id_ed"]),
        "record_kind": "doctoral_school",
        "eligible_for_publication": False,
        "label": record["libelle_ed"],
        "discipline": record.get("discipline_principale"),
        "accreditation_year": record.get("annee_d_accreditation"),
        "accreditation_duration": record.get("duree_d_accreditation"),
        "review": [
            "Verify current accreditation, programme, teaching location and entry requirements.",
            "Do not turn this institution into a doctorate course or a funded thesis vacancy.",
        ],
    }


def complementary_source_previews(limit: int = 5) -> dict[str, Any]:
    if not 1 <= limit <= 100:
        raise ValueError("Preview limit must be between 1 and 100")
    master_select = "session,ifc,eta_uai,eta_nom,mention,parcours,alternance,lieux"
    school_select = "id_ed,libelle_ed,discipline_principale,annee_d_accreditation,duree_d_accreditation"
    output = {}
    for key, dataset, select, adapter in [
        ("masters", "fr-esr-mon_master", master_select, master_preview),
        ("doctoral_schools", "fr-esr-ecoles_doctorales_annuaire", school_select, doctoral_school_preview),
    ]:
        url = f"{API}/{dataset}/records?{urlencode({'select': select, 'limit': limit})}"
        page = fetch_json(url)
        if not isinstance(page.get("results"), list):
            raise ValueError(f"Invalid {dataset} response")
        output[key] = {"url": url, "total_source_records": page.get("total_count"), "preview": [adapter(row) for row in page["results"]]}
    return output


def database_snapshot(server_dir: Path, *, limit: int = 200, all_rows: bool = False) -> dict[str, Any]:
    command = ["node", str(server_dir / "scripts" / "export_formation_catalog.mjs")]
    command += ["--all"] if all_rows else ["--limit", str(limit)]
    result = subprocess.run(command, cwd=server_dir, capture_output=True, text=True, encoding="utf-8", timeout=600, check=False)
    if result.returncode:
        raise RuntimeError("Read-only catalogue export failed. Check the server environment and Node dependencies; no notebook credentials are needed.")
    snapshot = json.loads(result.stdout)
    if snapshot.get("table") != "formation_france" or not isinstance(snapshot.get("rows"), list):
        raise ValueError("Unexpected database snapshot shape")
    return snapshot


def save_preview(plan: dict[str, Any], target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".partial", dir=target.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(plan, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        # Publish only a complete file and never replace an existing report.
        os.link(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, required=True, help="Read-only JSON snapshot from export_formation_catalog.mjs")
    parser.add_argument("--source", type=Path, help="Optional official JSON export; otherwise query exact public source keys")
    parser.add_argument("--output", type=Path, required=True, help="New dry-run JSON report; existing files are never overwritten")
    args = parser.parse_args()
    snapshot = json.loads(args.snapshot.read_text(encoding="utf-8"))
    rows = snapshot["rows"]
    if args.source:
        content = args.source.read_bytes()
        source = json.loads(content)
        if isinstance(source, dict) and source.get("type") == "FeatureCollection":
            source = [feature["properties"] for feature in source["features"]]
        if not isinstance(source, list):
            raise ValueError("The official export must be a JSON array or GeoJSON FeatureCollection")
        provenance = {"dataset": DATASET, "file": args.source.name, "sha256": hashlib.sha256(content).hexdigest()}
    else:
        source, provenance = fetch_matching_parcoursup(rows)
    plan = build_repair_plan(rows, source, provenance=provenance, complete_snapshot=bool(snapshot.get("complete")))
    save_preview(plan, args.output)
    print(json.dumps(plan["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
