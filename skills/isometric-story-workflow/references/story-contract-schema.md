# ストーリー契約ファイル

`story_contract.json`は、Notionの設計書とBlender用プロンプトDBを一度読み込んだ後に作る**検証専用の最小スナップショット**である。人間向けの物語・意図・資料の正本はNotionのままとし、このファイルへ長文説明やルール本文を複製しない。

## 運用

- 保存先は`test_gen_ai/<story>/story_contract.json`とする。
- `source.notion_url`と`source.revision`には設計書のNotion URLと更新識別子を記録する。ステップ5後は`source.prompt_page_url`と`source.prompt_revision`も記録する。
- 各クールの開始時は最初にNotion両ページの更新識別子だけを軽量確認する。一致すれば契約ファイルを入力に進み、不一致なら該当ページをfetchして契約を更新し、`validate_story_contract.py`を再実行する。
- このファイルは新規ストーリー専用。既存ストーリーの遡及補正には使わない。

## 必須構造

```json
{
  "schema_version": 1,
  "theme_id": "lighthouse",
  "story_id": "lighthouse-story-01",
  "source": {"notion_url": "https://www.notion.so/...", "revision": "2026-07-15T10:30:00Z", "prompt_page_url": "https://www.notion.so/...", "prompt_revision": "2026-07-15T10:35:00Z"},
  "frames_per_second": 30,
  "stage_extent": 10,
  "common_environment": "common_environment",
  "cools": [
    {
      "number": 1,
      "start_frame": 1,
      "end_frame": 300,
      "duration_seconds": 10,
      "hero": "tower",
      "emotional_reward": "灯りがともる",
      "concurrent_motion_limit": 1,
      "technical_risks": [],
      "spike_required": false,
      "transitions": [{"object_id": "tower", "start_frame": 1, "end_frame": 45, "easing": "ease_out", "entry_type": "drop"}],
      "background": {"visible_count": 15, "types": ["grass", "stone", "flower", "path", "fence"]}
    }
  ],
  "objects": [
    {
      "id": "tower",
      "category": "hero",
      "first_cool": 1,
      "tier": "hero",
      "size_ratio": 0.5,
      "entry_type": "drop",
      "motion_kind": "vertical",
      "signature_details": ["灯室", "回廊"],
      "shared_material": true
    }
  ]
}
```

## validator入力

- `validate_story_contract.py`: 上記契約ファイルそのもの。
- `validate_scene_contract.py`: `{"contract": <契約>, "scene": <Blenderから抽出したscene snapshot>}`。sceneにはCollection、主役のsafe-area占有率、アセットごとのティア・材質・作り込み・接地・stage内判定・寸法比、背景の可視数/種類数を入れる。
- `validate_cool_continuity.py`: `{"contract": <契約>, "previous": <前クールscene snapshot>, "current": <現クールscene snapshot>, "approved_changes": []}`。
- `validate_timeline.py`: `{"contract": <契約>, "timeline": {"cool_number": 1, "transitions": [...]}}`。F-Curve/keyframeから実frame・easing・演出タイプを抽出する。
- `validate_review_evidence.py`: `required_gates`で現在のgateだけを指定し、各レビュー・パケットと主要成果物の絶対パスを渡す。ステップ9は`["animatic", "still_human_review"]`、ステップ12は3 gateすべてを指定する。
- `validate_theme_integration.py`: `{"contract": <契約>, "app_root": "/absolute/path/IsometricPomodoro", "session_seconds": 1500}`。`Content/themes.json`と`Content/Videos`を検証する。

すべてのvalidatorは`--json-only`で`valid`と`errors`だけを返す。エージェントは生データを再要約せず、失敗項目だけを修正判断へ使う。
