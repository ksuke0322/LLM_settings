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

    def test_codex_route_is_luna_mcp_and_ministral_is_not_fallback(self):
        skill = self._read("SKILL.md")
        delegation = self._read("references/codex-delegation.md")
        for content in (skill, delegation):
            self.assertIn("mcp__codex__codex", content)
            self.assertIn("gpt-5.6-luna", content)
            self.assertIn("Ministralへフォールバックしない", content)
        self.assertIn("mcp__codex__codex_reply", delegation)

    def test_review_prompts_keep_independent_agent_and_scope_boundaries(self):
        prompts = self._read("references/step8-review-prompts.md")
        self.assertGreaterEqual(prompts.count("subagent_type: isometric-story-review"), 1)
        self.assertIn("8Bに8C観点を混ぜない", prompts)
        self.assertIn("8B・8Cに生成参考画像を渡さない", prompts)
        self.assertIn("作業経緯・既知の課題・過去の指摘履歴", prompts)


if __name__ == "__main__":
    unittest.main()
