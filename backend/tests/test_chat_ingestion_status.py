"""Ignish can answer operational ingestion-status questions safely."""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from app.api import chat as chat_api


class IgnishIngestionStatusTests(unittest.TestCase):
    def test_read_only_status_tool_is_available_to_ignish(self) -> None:
        calls: list[dict[str, object]] = []

        async def openai_call(api_key, model, instructions, input_items):
            calls.append({"instructions": instructions, "input": input_items})
            if len(calls) == 1:
                return {"output": [{
                    "type": "function_call",
                    "name": "get_ingestion_status",
                    "call_id": "status-call",
                    "arguments": "{}",
                }]}
            return {"output": [{
                "type": "message",
                "content": [{"type": "output_text", "text": "NRT last succeeded today."}],
            }]}

        operational_status = {
            "nrt": {"enabled": True, "status": "succeeded", "last_success_at": "2026-11-11T00:00:00+00:00"},
            "historical": {"active_job": None, "jobs": []},
        }

        async def run():
            request = chat_api.ChatRequest(messages=[chat_api.ChatMessage(role="user", content="When was FIRMS last updated?")])
            with patch.dict("os.environ", {"OPENAI_API_KEY": "test-only"}), \
                 patch.object(chat_api, "_call_openai", side_effect=openai_call), \
                 patch.object(chat_api, "_query_ingestion_status", return_value=operational_status) as status_call:
                result = await chat_api.chat(request)
            status_call.assert_called_once_with()
            return result

        result = asyncio.run(run())
        self.assertEqual(result.reply, "NRT last succeeded today.")
        self.assertIn("read-only", calls[0]["instructions"])
        tool_output = calls[1]["input"][-1]
        self.assertEqual(tool_output["type"], "function_call_output")
        self.assertIn("last_success_at", tool_output["output"])
        self.assertNotIn("test-only", str(calls))


if __name__ == "__main__":
    unittest.main()
