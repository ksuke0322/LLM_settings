# ストーリー契約ファイル

`story_contract.json`は、設計書ファイル(`design/story_design.md`)と本番制作差分メモ(`design/prompt_notes.md`)を一度読み込んだ後に作る**検証専用の最小スナップショット**である。人間向けの物語・意図・資料の正本はこの2ファイルのままとし、`story_contract.json`へ長文説明やルール本文を複製しない。

## 運用

- 保存先は`pomodoro_assets/<theme>_<story>/story_contract.json`とする。
- `source.design_doc_path`と`source.design_doc_revision`には設計書ファイルの絶対パスとファイルmtime(ISO 8601秒精度)を記録する。ステップ5後は`source.prompt_notes_path`と`source.prompt_notes_revision`も記録する。
- 各クールの開始時は最初に設計書ファイル・プロンプトノートファイルのmtimeだけを軽量確認する。一致すれば契約ファイルを入力に進み、不一致なら該当ファイルをReadして契約を更新し、`validate_story_contract.py`を再実行する。
- このファイルは新規ストーリー専用。既存ストーリーの遡及補正には使わない。
- フィールド名は移行前(Notion運用時代)の`notion_url`/`revision`/`prompt_page_url`/`prompt_revision`から改名したものである。バリデータ(`quantitative_validation.py`)は後方互換のため旧フィールド名も一時的に許容するが、新規作成時は必ず新フィールド名を使う。

## 必須構造

```json
{
  "schema_version": 1,
  "theme_id": "lighthouse",
  "story_id": "lighthouse-story-01",
  "source": {"design_doc_path": "/Users/.../pomodoro_assets/lighthouse_story-01/design/story_design.md", "design_doc_revision": "2026-07-15T10:30:00", "prompt_notes_path": "/Users/.../pomodoro_assets/lighthouse_story-01/design/prompt_notes.md", "prompt_notes_revision": "2026-07-15T10:35:00"},
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
      "signature_parts": [
        {"name": "灯室の輪郭", "visualization": "silhouette", "dominant_dimension": 0.12},
        {"name": "回廊の陰影", "visualization": "contrast", "dominant_dimension": 0.03}
      ],
      "shared_material": true
    }
  ]
}
```

## 署名パーツのpx予算フィールド

新規契約の各`objects[]`には、`signature_details`で意図を列挙した署名パーツに対応する
`signature_parts`を必ず持たせる。`signature_parts[]`の必須フィールドは次の3つである。

| フィールド | 型 | 意味 |
|---|---|---|
| `name` | string | `signature_details`と対応する名前付きパーツ |
| `visualization` | `silhouette` または `contrast` | 輪郭で見せるか、色差・陰影で見せるか |
| `dominant_dimension` | positive number | 現行設計で画面上の意味を支配するworld寸法 |

描画スケールは`check_px_budget.py`へ渡し、`dominant_dimension * scale`をpxへ変換する。
`silhouette`は12px未満、`contrast`は6px未満をFAILとする。未達のままStep 8へ進めず、設計を
粗くするか、現スケールでは実現不能であることを設計記録へ残す。

## validator入力

- `validate_story_contract.py`: 上記契約ファイルそのもの。
- `validate_scene_contract.py`: `{"contract": <契約>, "scene": <Blenderから抽出したscene snapshot>}`。sceneにはCollection、主役のsafe-area占有率、アセットごとのティア・材質・作り込み・接地・stage内判定・寸法比、背景の可視数/種類数を入れる。
- `validate_cool_continuity.py`: `{"contract": <契約>, "previous": <前クールscene snapshot>, "current": <現クールscene snapshot>, "approved_changes": []}`。
- `validate_timeline.py`: `{"contract": <契約>, "timeline": {"cool_number": 1, "transitions": [...]}}`。F-Curve/keyframeから実frame・easing・演出タイプを抽出する。
- `validate_review_evidence.py`: `required_gates`で現在のgateだけを指定し、各レビュー・パケットと主要成果物の絶対パスを渡す。ステップ9は`["animatic", "still_human_review"]`、ステップ12は3 gateすべてを指定する。
- `validate_theme_integration.py`: `{"contract": <契約>, "app_root": "/absolute/path/IsometricPomodoro", "session_seconds": 1500}`。`Content/themes.json`と`Content/Videos`を検証する。

## Blender実測証跡

`run_blender_quantitative_qa.py`の入力は`--blend`、`--contract`、`--cool`、必要に応じて`--video`である。runnerがheadless Blenderから生成する`raw/scene_snapshot.json`と`raw/timeline_snapshot.json`だけを上記validatorへ渡す。手入力JSONは禁止する。

- `raw/measurement_report.json`: BBox/raycast/BVH、カメラ投影、材質ノード、GN/散布、state、FCurveを測定したcheck一覧。
- `quantitative_qa_report.json`: 実測check、scene/timeline validator、`ffprobe`の集約結果。FAILまたはwaiver理由なしのWARNで終了コード1。
- `quantitative_qa_report.md`: 人間レビューに添付する読みやすい同一内容の表。

各render可視アセットは`story_id`、`story_tier`、`story_type` Custom Propertyで契約へ紐付ける。実行時の詳細と追加propertyは`blender-isometric-rules/references/quantitative-qa.md`を正本とする。

すべてのvalidatorは`--json-only`で`valid`と`errors`だけを返す。エージェントは生データを再要約せず、失敗項目だけを修正判断へ使う。
