import copy
import contextlib
import gzip
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))
import formation_catalog as catalog


def current_row(**overrides):
    return {
        "id": 25, "annee": "2025", "gta": "21092", "gti": "21092",
        "etab_uai": "9730429D", "nmc": "L1-Info", "nm": None, "tf": None, "fl": None,
        "etab_nom": "Université Exemple", "commune": "Ville Exemple",
        "geom": {"type": "Point", "coordinates": [-52.3, 4.9]},
        **overrides,
    }


def source_row(**overrides):
    return {
        "annee": "2025", "gta": "21092", "gti": "21092", "etab_uai": "9730429D",
        "nmc": "L1-Info", "nm": ["Licence - Informatique"], "tf": ["Licence"],
        "fl": ["L1 - Informatique"], **overrides,
    }


class DiplomaClassificationTests(unittest.TestCase):
    def test_degree_families_use_declared_qualifications_not_marketing_equivalences(self):
        examples = [
            ("BTS-SIO", "BTS Services informatiques aux organisations", "bts", 2, 5, None),
            ("BTSA-GPN", "BTSA Gestion et protection de la nature", "btsa", 2, 5, None),
            ("BTSM", "BTSM", "btsm", 2, 5, None),
            ("BUT-Info", "BUT Informatique", "but", 3, 6, "licence"),
            ("DUT-TC", "DUT Techniques de commercialisation", "dut", 2, 5, None),
            ("L1-Info", "Licence - Informatique", "licence", 3, 6, "licence"),
            ("L2-Droit", "Licence droit", "licence", 3, 6, "licence"),
            ("LP-Metiers", "Licence professionnelle métiers du numérique", "licence_professionnelle", 3, 6, "licence"),
            ("M1-Droit", "Master Droit", "master", 5, 7, "master"),
            ("M2-Info", "Diplôme national de master Informatique", "master", 5, 7, "master"),
            ("Doctorat-Bio", "Doctorat en biologie", "doctorat_recherche", 8, 8, "doctorat"),
            ("PhD", "PhD Computer Science", "doctorat_recherche", 8, 8, "doctorat"),
            ("DNM-Numérique", "DN MADE Numérique", "dn_made", 3, 6, "licence"),
            ("DCG", "DCG", "dcg", 3, 6, "licence"),
            ("DSCG", "DSCG", "dscg", 5, 7, "master"),
            ("DEUST", "DEUST informatique", "deust", 2, 5, None),
            ("CAP", "CAP Cuisine", "cap", None, 3, None),
            ("BAC-PRO", "Bac professionnel cuisine", "bac_professionnel", 0, 4, None),
        ]
        for code, title, family, bac, rncp, grade in examples:
            with self.subTest(code=code):
                result = catalog.classify_formation({"nmc": code, "nm": [title]})
                self.assertEqual((result["diploma_family"], result["qualification_bac_level"], result["qualification_rncp_level"], result["academic_grade"]), (family, bac, rncp, grade))

    def test_du_is_not_a_phd_and_has_no_automatic_level(self):
        for title in ["DU Nutrition", "DIU Nutrition", "Diplôme universitaire Nutrition"]:
            result = catalog.classify_formation({"nm": [title], "nmc": "DU-Nutrition"})
            self.assertEqual(result["diploma_family"], "du_diu")
            self.assertIsNone(result["qualification_bac_level"])
            self.assertIsNone(result["academic_grade"])
        self.assertEqual(catalog.classify_formation({"nm": ["Licence histoire du droit"]})["diploma_family"], "licence")

    def test_health_access_and_exercise_doctorates_are_not_research_doctorates(self):
        for title, expected in [
            ("PASS - Parcours accès santé", "pass"),
            ("Diplôme d'État de docteur en médecine", "doctorat_exercice"),
            ("Doctorat d'exercice en pharmacie", "doctorat_exercice"),
        ]:
            result = catalog.classify_formation({"nm": [title]})
            self.assertEqual(result["diploma_family"], expected)
            self.assertIsNone(result["academic_grade"])
            self.assertNotEqual(result["qualification_bac_level"], 8)

    def test_bachelor_mba_mastere_and_engineering_require_separate_grade_evidence(self):
        for title in ["Bachelor Management", "MBA Marketing", "Mastère spécialisé cybersécurité", "Formation d'ingénieur"]:
            result = catalog.classify_formation({"nm": [title]})
            self.assertIsNone(result["academic_grade"])
            self.assertIsNone(result["qualification_bac_level"])
        result = catalog.classify_formation({"nm": ["Bachelor Management Bac +3"]})
        self.assertEqual(result["qualification_bac_level"], 3)
        self.assertIsNone(result["academic_grade"])
        result = catalog.classify_formation({"nm": ["Titre professionnel RNCP niveau 7"]})
        self.assertEqual(result["qualification_rncp_level"], 7)
        self.assertIsNone(result["qualification_bac_level"])
        self.assertIsNone(result["academic_grade"])

    def test_explicit_sciences_po_master_grade_is_not_lost_by_its_diploma_family(self):
        result = catalog.classify_formation({
            "nmc": "ScPo",
            "nm": ["Sciences Po / Instituts d'études politiques - Grade Master - Cursus général"],
            "tf": ["Sciences Po - Instituts d'études politiques"],
        })
        self.assertEqual(result["diploma_family"], "sciences_po_iep")
        self.assertEqual(result["academic_grade"], "master")
        self.assertEqual(result["qualification_bac_level"], 5)
        contradictory = catalog.classify_formation({
            "nmc": "ScPo",
            "nm": ["Sciences Po - Grade Master - Campus de Paris, Bachelor de Sciences Po"],
        })
        self.assertIsNone(contradictory["academic_grade"])
        self.assertEqual(contradictory["status"], "needs_review")

    def test_preparatory_classes_are_not_degree_awards(self):
        result = catalog.classify_formation({"nmc": "CPGE-MPSI", "nm": ["CPGE MPSI"]})
        self.assertEqual(result["programme_kind"], "preparation")
        self.assertIsNone(result["qualification_bac_level"])
        for code, title in [
            ("MAN-MPGEM", "Mise à niveau - Classe de mise à niveau au BTS Maritime"),
            ("AnP", "Insertion à la Licence Scientifique"),
        ]:
            result = catalog.classify_formation({"nmc": code, "nm": [title]})
            self.assertEqual(result["diploma_family"], "preparation")
            self.assertIsNone(result["qualification_bac_level"])

    def test_actual_parcoursup_pathways_may_have_a_licence_source_group_without_being_terminal_licences(self):
        examples = [
            ("PASS", "Licence - Parcours d'Accès Spécifique Santé (PASS)", "pass", "preparation"),
            ("CMI-SV", "C.M.I - Cursus Master en Ingénierie - Biologie-Santé", "cmi", "integrated_pathway"),
            ("CUPGE", "CUPGE - Cycle Universitaire Préparatoire aux Grandes Ecoles d'ingénieur", "cupge", "preparation"),
            ("CPES-SI", "Cycle pluridisciplinaire d'Études Supérieures - Sciences pour l'ingénieur", "cpes", "integrated_pathway"),
        ]
        for code, title, family, kind in examples:
            with self.subTest(code=code):
                result = catalog.classify_formation({"nmc": code, "nm": [title], "tf": ["Licence sélective"]})
                self.assertEqual(result["diploma_family"], family)
                self.assertEqual(result["programme_kind"], kind)
                self.assertIsNone(result["qualification_bac_level"])
                self.assertNotEqual(result["status"], "needs_review")
        result = catalog.classify_formation({"nmc": "DU", "nm": ["Diplôme d'Université - Bachelor Business Data Science"]})
        self.assertEqual(result["diploma_family"], "du_diu")

    def test_specialisation_and_fcil_are_not_forced_into_a_bts_or_master_level(self):
        for code, title, family in [
            ("CS-AR", "Certificat de Spécialisation - Accueil-réception", "certificat_specialisation"),
            ("FCIL", "FCIL Contrôle Technique", "fcil"),
        ]:
            result = catalog.classify_formation({"nmc": code, "nm": [title]})
            self.assertEqual(result["diploma_family"], family)
            self.assertNotEqual(result["status"], "needs_review")
            self.assertIsNone(result["qualification_bac_level"])

    def test_entry_level_is_not_silently_an_exit_level(self):
        result = catalog.classify_formation({"nm": ["MBA Marketing - admission après Bac+5"]})
        self.assertIsNone(result["qualification_bac_level"])
        result = catalog.classify_formation({"nmc": "L1-Info"})
        self.assertEqual(result["study_year"], 1)
        self.assertEqual(result["qualification_bac_level"], 3)

    def test_conflicting_titles_are_quarantined(self):
        result = catalog.classify_formation({"nmc": "BTS-SIO", "nm": ["Licence informatique"]})
        self.assertEqual(result["status"], "needs_review")
        self.assertIsNone(result["qualification_bac_level"])
        self.assertEqual(result["diploma_family"], "unknown")
        result = catalog.classify_formation({"nmc": "BTS-SIO", "nm": ["BTS Informatique"], "tf": ["Licence"]})
        self.assertEqual(result["status"], "needs_review")

    def test_unknown_family_is_not_fabricated_and_aut_is_not_diploma_evidence(self):
        result = catalog.classify_formation({"nmc": "Inconnu", "aut": "Poursuite en doctorat"})
        self.assertEqual(result["status"], "needs_review")
        self.assertIsNone(result["qualification_bac_level"])
        self.assertEqual(catalog.classify_formation({"nmc": "DU-Nutrition", "nm": ["DU Nutrition : préparation au doctorat"]})["diploma_family"], "du_diu")
        self.assertEqual(catalog.classify_formation({"nmc": "L1-Droit", "nm": ["Licence droit : poursuite en mastère"]})["diploma_family"], "licence")

    def test_apprenticeship_is_not_assumed_when_the_source_is_silent(self):
        self.assertIsNone(catalog.classify_formation({"nmc": "BTS-SIO"})["apprenticeship"])
        self.assertTrue(catalog.classify_formation({"nmc": "BTS-SIO-App"})["apprenticeship"])
        self.assertTrue(catalog.classify_formation({"nmc": "BTS-SIO", "app": ["Formations en apprentissage"]})["apprenticeship"])
        self.assertFalse(catalog.classify_formation({"nmc": "BTS-SIO", "app": "Sans apprentissage"})["apprenticeship"])


class RepairPlanTests(unittest.TestCase):
    def plan(self, current=None, source=None):
        return catalog.build_repair_plan(current or [current_row()], source or [source_row()], provenance={"dataset": catalog.DATASET})

    def test_missing_arrays_are_recovered_from_the_exact_official_record(self):
        current, source = current_row(), source_row()
        original_current, original_source = copy.deepcopy(current), copy.deepcopy(source)
        plan = self.plan([current], [source])
        self.assertTrue(plan["dry_run"])
        change = plan["changes"][0]
        self.assertEqual(change["id"], 25)
        self.assertEqual(change["after"], {"nm": ["Licence - Informatique"], "tf": ["Licence"], "fl": ["L1 - Informatique"]})
        self.assertFalse({"id", "nmc", "geom", "gta", "gti", "etab_uai"} & change["after"].keys())
        self.assertEqual(current, original_current)
        self.assertEqual(source, original_source)

    def test_year_school_and_source_id_must_all_match(self):
        for field in catalog.IDENTITY_FIELDS:
            with self.subTest(field=field):
                plan = self.plan(source=[source_row(**{field: "different"})])
                self.assertEqual(plan["changes"], [])
                self.assertEqual(plan["review"][0]["reason"], "source_not_found")

    def test_ambiguous_source_matches_are_not_picked_arbitrarily(self):
        plan = self.plan(source=[source_row(), source_row(nm=["Licence informatique option réseaux"])])
        self.assertEqual(plan["changes"], [])
        self.assertEqual(plan["review"][0]["reason"], "ambiguous_source_key")

    def test_existing_values_and_changed_short_titles_require_review(self):
        plan = self.plan(current=[current_row(nm=["Libellé existant"])])
        self.assertNotIn("nm", plan["changes"][0]["after"])
        self.assertTrue(any(item["reason"] == "existing_value_differs_from_source" for item in plan["review"]))
        plan = self.plan(source=[source_row(nmc="L1-Math")])
        self.assertEqual(plan["changes"], [])

    def test_rerun_is_idempotent(self):
        plan = self.plan()
        enriched = current_row(**plan["changes"][0]["after"])
        self.assertEqual(self.plan(current=[enriched])["changes"], [])

    def test_source_can_be_empty_without_inventing_names(self):
        plan = catalog.build_repair_plan([current_row()], [], provenance={})
        self.assertEqual(plan["changes"], [])
        self.assertEqual(plan["summary"]["rows_requiring_review"], 1)

    def test_text_flags_remain_text_and_array_fields_remain_arrays(self):
        plan = self.plan(source=[source_row(app=["Formations en apprentissage"], amg="Aménagement")])
        after = plan["changes"][0]["after"]
        self.assertIsInstance(after["app"], str)
        self.assertEqual(after["amg"], ["Aménagement"])
        with self.assertRaises(ValueError):
            catalog.legacy_value("nm", {"unexpected": "object"})

    def test_legacy_postgres_text_arrays_do_not_create_false_source_conflicts(self):
        plan = self.plan(
            current=[current_row(app='{"Formations en apprentissage"}')],
            source=[source_row(app=["Formations en apprentissage"])],
        )
        self.assertFalse(any(item.get("field") == "app" for item in plan["review"]))
        self.assertNotIn("app", plan["changes"][0]["after"])
        self.assertEqual(catalog.legacy_value("aut", '{"Avec, précision","Seconde option"}'), "Avec, précision; Seconde option")
        self.assertIsNone(catalog.legacy_value("app", "{}"))

    def test_partial_snapshot_is_explicit_and_duplicate_source_keys_are_reported(self):
        audit = catalog.audit_rows([current_row(), current_row(id=26)], complete=False)
        self.assertFalse(audit["complete_database_snapshot"])
        self.assertEqual(audit["duplicate_source_keys"][0]["ids"], [25, 26])
        self.assertEqual(audit["classification_coverage"]["bac_levels_known"], 2)

    def test_report_does_not_overwrite_an_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "preview.json"
            catalog.save_preview(self.plan(), target)
            self.assertTrue(json.loads(target.read_text(encoding="utf-8"))["dry_run"])
            with self.assertRaises(FileExistsError):
                catalog.save_preview(self.plan(), target)


class SourceTransportTests(unittest.TestCase):
    def test_official_gzip_response_is_decoded_before_json(self):
        response = MagicMock()
        response.headers = {"Content-Encoding": "gzip"}
        response.read.return_value = gzip.compress(json.dumps({"nm": ["Licence Économie"]}).encode("utf-8"))
        response.__enter__.return_value = response
        with patch.object(catalog, "urlopen", return_value=response):
            self.assertEqual(catalog.fetch_json("https://source.example/records"), {"nm": ["Licence Économie"]})

    def test_matching_requests_keep_full_source_identity_and_provenance(self):
        calls = []

        def fake_json(url):
            calls.append(url)
            if not url.endswith("/records"):
                if "/records?" not in url:
                    return {"metas": {"default": {"modified": "2026-01-01", "license": "Licence Ouverte v2.0"}}}
            return {"total_count": 1, "results": [source_row()]}

        with patch.object(catalog, "fetch_json", side_effect=fake_json):
            rows, provenance = catalog.fetch_matching_parcoursup([current_row()])
        self.assertEqual(len(rows), 1)
        self.assertIn("etab_uai", calls[1])
        self.assertEqual(provenance["publisher_modified_at"], "2026-01-01")
        self.assertEqual(len(provenance["sha256"]), 64)

    def test_invalid_source_keys_fail_explicitly(self):
        with patch.object(catalog, "fetch_json", return_value={}):
            with self.assertRaises(ValueError):
                catalog.fetch_matching_parcoursup([current_row(gta='1" OR true')])


class ComplementarySourceTests(unittest.TestCase):
    def test_master_is_a_new_source_identity_not_an_existing_parcoursup_id(self):
        preview = catalog.master_preview({
            "session": "2025", "ifc": "MASTER-123", "eta_uai": "0755976N",
            "eta_nom": "Université Exemple", "mention": "Informatique",
            "parcours": "Logiciels", "alternance": "1", "lieux": "Campus Paris|Campus Lyon",
        })
        self.assertFalse(preview["eligible_for_publication"])
        self.assertEqual(preview["source_key"], ["2025", "MASTER-123", "0755976N"])
        self.assertEqual(preview["classification"]["diploma_family"], "master")
        projection = preview["legacy_projection"]
        self.assertNotIn("id", projection)
        self.assertIsNone(projection["gta"])
        self.assertIsNone(projection["commune"], "Do not guess a campus from the institution")
        self.assertIsInstance(projection["nm"], list)

    def test_doctoral_directory_entry_is_not_a_formation_or_an_open_vacancy(self):
        preview = catalog.doctoral_school_preview({
            "id_ed": "ED1", "libelle_ed": "École doctorale exemple",
            "annee_d_accreditation": "2019", "duree_d_accreditation": "5",
        })
        self.assertEqual(preview["record_kind"], "doctoral_school")
        self.assertFalse(preview["eligible_for_publication"])
        self.assertNotIn("legacy_projection", preview)
        self.assertIn("current accreditation", preview["review"][0])

    def test_incomplete_complementary_sources_are_errors_not_empty_courses(self):
        with self.assertRaises(ValueError):
            catalog.master_preview({"mention": "Informatique"})
        with self.assertRaises(ValueError):
            catalog.doctoral_school_preview({"libelle_ed": "Exemple"})


class SafeNotebookTests(unittest.TestCase):
    def test_every_default_code_cell_executes_without_network_or_database_access(self):
        root = Path(__file__).resolve().parents[2]
        notebook = json.loads((root / "server/notebooks/formation_catalog_quality.ipynb").read_text(encoding="utf-8"))
        context = {}
        with patch.dict("os.environ", {"ZELIA_REPO": str(root)}), \
             patch("urllib.request.urlopen", side_effect=AssertionError("Default notebook must not fetch sources")), \
             patch("subprocess.run", side_effect=AssertionError("Default notebook must not access the database")), \
             contextlib.redirect_stdout(io.StringIO()):
            for index, cell in enumerate(notebook["cells"]):
                if cell["cell_type"] == "code":
                    self.assertEqual(cell["outputs"], [])
                    self.assertIsNone(cell["execution_count"])
                    code = "".join(cell["source"])
                    exec(compile(code, f"notebook-cell-{index}", "exec"), context)
        self.assertIsNone(context["repair_plan"])
        self.assertFalse(context["RUN_DATABASE_AUDIT"])
        self.assertFalse(context["SAVE_PREVIEW"])


class ApplicationCompatibilityTests(unittest.TestCase):
    def test_enriched_rows_keep_application_title_links_level_and_relevance_working(self):
        plan = catalog.build_repair_plan([current_row()], [source_row()], provenance={})
        row = current_row(**plan["changes"][0]["after"])
        script = """
import assert from 'node:assert/strict';
import { getFormationSlug, parseFormationIdFromParam } from './client/src/lib/formationDisplay.js';
import { inferNationalStudyLevel, nationalFormationMatches } from './client/src/lib/nationalFormationMatching.js';
import { nationalExplorerCards } from './client/src/lib/formationExplorer.js';
let input='';for await (const chunk of process.stdin) input+=chunk;
const row=JSON.parse(input);
assert.equal(inferNationalStudyLevel(row),3);
assert.equal(parseFormationIdFromParam('old-title-25'),'25');
assert.equal(parseFormationIdFromParam(getFormationSlug(row)),'25');
assert.equal(nationalFormationMatches(row,{formation_preferences:['licence']}),true);
const cards=nationalExplorerCards([row],{analysis:{studyRecommendations:[{degree:'Licence informatique'}]},profile:{formation_preferences:['licence']}});
assert.equal(cards.length,1);assert.ok(cards[0].score>=80);
"""
        root = Path(__file__).resolve().parents[2]
        # Node's -e source is an argument; JSON data goes only to stdin.
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script], input=json.dumps(row),
            text=True, capture_output=True, encoding="utf-8", cwd=root, timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_main_diploma_families_still_work_with_the_real_application_level_helper(self):
        examples = [
            ("BTS-SIO", "BTS Services informatiques aux organisations", 2),
            ("BUT-Informatique", "BUT Informatique", 3),
            ("L1-Info", "Licence informatique", 3),
            ("M2-Droit", "Master Droit", 5),
            ("Doctorat-Bio", "Doctorat biologie", 8),
            ("DNM-Numérique", "DN MADE Numérique", 3),
            ("FI-BAC5", "Formation d'ingénieur Bac +5", 5),
        ]
        rows = []
        for code, title, expected in examples:
            plan = catalog.build_repair_plan(
                [current_row(nmc=code)], [source_row(nmc=code, nm=[title], tf=[title], fl=None)], provenance={},
            )
            self.assertEqual(len(plan["changes"]), 1)
            rows.append({"row": current_row(nmc=code, **plan["changes"][0]["after"]), "level": expected})
        script = """
import assert from 'node:assert/strict';
import { inferNationalStudyLevel } from './client/src/lib/nationalFormationMatching.js';
let input='';for await(const chunk of process.stdin) input+=chunk;
for(const {row,level} of JSON.parse(input)) assert.equal(inferNationalStudyLevel(row),level,row.nmc);
"""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script], input=json.dumps(rows),
            text=True, capture_output=True, encoding="utf-8",
            cwd=Path(__file__).resolve().parents[2], timeout=30, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
