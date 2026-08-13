from pathlib import Path
import unittest


SKILL_DIR = Path(__file__).resolve().parents[1]


class Step8ReviewDocumentationTests(unittest.TestCase):
    def _read(self, relative_path):
        return (SKILL_DIR / relative_path).read_text(encoding="utf-8")

    def test_control_contract_is_referenced_by_workflow_and_prompts(self):
        control = self._read("references/step8-review-control.md")
        skill = self._read("SKILL.md")
        prompts = self._read("references/step8-review-prompts.md")
        self.assertIn("ReviewReport v1", control)
        self.assertIn("ReviewLedger v1", control)
        self.assertIn("step8-review-control.md", skill)
        self.assertIn("validate_step8_review.py", skill)
        self.assertIn("step8-review-control.md", prompts)
        self.assertGreaterEqual(prompts.count("JSONオブジェクトだけを返してください"), 3)

    def test_codex_route_is_luna_mcp_and_ministral_is_not_used(self):
        skill = self._read("SKILL.md")
        delegation = self._read("references/codex-delegation.md")
        for content in (skill, delegation):
            self.assertIn("mcp__codex__codex", content)
            self.assertIn("gpt-5.6-luna", content)
            self.assertIn("Ministralへフォールバックしない", content)
            self.assertIn("Codex MCP画像一次解析", content)
            self.assertNotIn("ministral-3:8b-16k", content)
            self.assertNotIn("ollama-local", content)
        self.assertIn("mcp__codex__codex_reply", delegation)

    def test_codex_image_preflight_contract_matches_skill_contract(self):
        skill = self._read("SKILL.md")
        delegation = self._read("references/codex-delegation.md")
        for field in ("purpose", "input_images", "observations", "uncertainties", "failure"):
            self.assertIn(f"`{field}`", skill)
            self.assertIn(f'"{field}"', delegation)
        self.assertNotIn('"case_type": "reference_comparison"', delegation)

    def test_review_prompts_keep_independent_agent_and_scope_boundaries(self):
        prompts = self._read("references/step8-review-prompts.md")
        self.assertGreaterEqual(prompts.count("subagent_type: isometric-story-review"), 1)
        self.assertIn("8Bに8C観点を混ぜない", prompts)
        self.assertIn("8B・8Cに生成参考画像を渡さない", prompts)
        self.assertIn("作業経緯・既知の課題・過去の指摘履歴", prompts)

    def test_review_contract_documents_closed_fields_and_manifest_bindings(self):
        control = self._read("references/step8-review-control.md")
        prompts = self._read("references/step8-review-prompts.md")
        manifest = self._read("references/manifest-schema.md")
        self.assertIn("閉じたJSON契約", control)
        self.assertIn("current_render_sha256", control)
        self.assertIn("--manifest", control)
        self.assertIn("定義されていないキーを追加しない", prompts)
        self.assertIn("gates.visual_acceptance.status", manifest)


if __name__ == "__main__":
    unittest.main()
