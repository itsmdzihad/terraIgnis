"""Atomic generation publisher and rollback coverage."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import polars as pl

from app.api import pipeline


class AtomicPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name) / "backend"
        self.data = root / "data"
        self.data.mkdir(parents=True)
        self.processed = self.data / "processed"
        self.processed.mkdir()
        self.reports = self.data / "reports"
        self.reports.mkdir()
        self.outputs = tuple(
            self.processed / name
            for name in (
                "standardized_fires.parquet",
                "h3_fire_daily.parquet",
                "harmonized_fire.parquet",
                "burn_index.parquet",
                "anomalies.parquet",
            )
        ) + (self.reports / "fire_profile.json",)
        self.stages = tuple((f"Stage {i}", f"scripts/stage_{i}.py") for i in range(6))
        for output in self.outputs[:-1]:
            pl.DataFrame({"value": [1]}).write_parquet(output)
        self.outputs[-1].write_text('{"generation":"old"}', encoding="utf-8")
        self.job_id = "atomic-test-job"
        self.old_job = pipeline._JOB.copy()
        pipeline._JOB.update({
            "job_id": self.job_id,
            "status": "queued",
            "stage": None,
            "message": "Pipeline queued.",
            "stages": [{"name": name, "status": "pending"} for name, _ in self.stages],
            "logs": [],
            "started_at": None,
            "finished_at": None,
        })
        self.patches = [
            patch.object(pipeline, "BACKEND_ROOT", root),
            patch.object(pipeline, "DATA_ROOT", self.data),
            patch.object(pipeline, "RAW_ROOT", self.data / "raw"),
            patch.object(pipeline, "GENERATIONS_ROOT", self.data / ".generations"),
            patch.object(pipeline, "PIPELINE_STAGES", self.stages),
            patch.object(pipeline, "PIPELINE_OUTPUTS", self.outputs),
        ]
        for active in self.patches:
            active.start()

    def tearDown(self) -> None:
        for active in reversed(self.patches):
            active.stop()
        pipeline._JOB.clear()
        pipeline._JOB.update(self.old_job)
        self.temp.cleanup()

    def test_all_pipeline_outputs_publish_together_after_validation(self) -> None:
        stage_index = 0

        def run_stage(args, **kwargs):
            nonlocal stage_index
            data_root = Path(kwargs["env"]["TERRAIGNIS_DATA_ROOT"])
            output = data_root / self.outputs[stage_index].relative_to(self.data)
            output.parent.mkdir(parents=True, exist_ok=True)
            if output.suffix == ".parquet":
                pl.DataFrame({"value": [stage_index + 10]}).write_parquet(output)
            else:
                output.write_text('{"generation":"new"}', encoding="utf-8")
            stage_index += 1
            return SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(pipeline.subprocess, "run", side_effect=run_stage):
            pipeline._run_pipeline_locked(self.job_id)

        self.assertEqual(pipeline._JOB["status"], "succeeded")
        self.assertTrue(self.processed.is_symlink())
        self.assertTrue(all(output.is_file() for output in self.outputs[:-1]))
        self.assertEqual([pl.read_parquet(output)["value"][0] for output in self.outputs[:-1]], [10, 11, 12, 13, 14])
        self.assertEqual(self.outputs[-1].read_text(encoding="utf-8"), '{"generation":"new"}')

    def test_failed_stage_preserves_last_complete_generation(self) -> None:
        before = [output.read_bytes() for output in self.outputs]
        calls = 0

        def run_stage(args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1:
                data_root = Path(kwargs["env"]["TERRAIGNIS_DATA_ROOT"])
                output = data_root / self.outputs[0].relative_to(self.data)
                pl.DataFrame({"value": [999]}).write_parquet(output)
                return SimpleNamespace(returncode=0, stdout="", stderr="")
            return SimpleNamespace(returncode=1, stdout="", stderr="mock failure")

        with patch.object(pipeline.subprocess, "run", side_effect=run_stage):
            pipeline._run_pipeline_locked(self.job_id)

        self.assertEqual(pipeline._JOB["status"], "failed")
        self.assertFalse(self.processed.is_symlink())
        self.assertEqual([output.read_bytes() for output in self.outputs], before)
        self.assertIn("previous processed generation remains active", "\n".join(pipeline._JOB["logs"]))


if __name__ == "__main__":
    unittest.main()
