# Repetition Control v1

Step 7d/7.5、Step 8 preflight、Step 9.5、Step 10で、同一入力の再実行と同一指摘の無制限反復を防ぐ共通規約である。

## 共通規則

- ledgerは`schema_version: 1`、`ledger_type`、`status`、`key`、非空の`outputs`、非空の`attempts`を持つ。
- `key`はcandidate、動画、入力画像、契約、validator、ツール、サンプル条件のrevisionを含む。
- `outputs`は絶対パスで、再利用直前に存在とSHA-256を再検証する。
- `pass`だけをキャッシュ再利用する。fail、timeout、JSON不正、未読、入力不足は再利用しない。
- cache missや入力revision変更は`rerun_allowed`として通常実行へ進める。timeout、低信頼、JSON不正、画像・動画未読は`needs_parent_decision`またはfail-closeにする。
- 同じfinding fingerprintが連続2回発生したら3回目を自動起動せず`needs_parent_decision`にする。
- Blender exporter、ffprobe、ffmpeg decode、snapshot/JSON読込などの実行失敗も、可能な場合は安定したerror fingerprintと失敗証跡をledgerへ記録し、同じ失敗を2回繰り返した時点で親へ戻す。
- Ministralの成功レポートを記録する場合は、各`observation`に`item`、絶対パスの`evidence_image`、`confidence`、`note`を必須とする。confidenceは数値なら0.6以上、ラベルなら`medium`または`high`だけを許可する。
- キャッシュやledgerは品質gateのpass、waiver、正本ownershipを変更しない。

## ledger種別

- `quantitative_qa`: candidate、cool、QA scope、contract、依存snapshot、validator revision。
- `ministral_preflight`: 目的、順序付き画像SHA-256、model/config、prompt/schema revision。最終レビュー結果は保存しない。
- `render_validation`: 動画SHA-256、`through`、validatorとffprobe/ffmpegのrevision。manifest構造は毎回検証する。
- `motion_qa`: blend/video、前cool動画、QA基準、frame sample revision、指摘fingerprint。

定型CLIは、quantitative QAの`run_blender_quantitative_qa.py --ledger`、動画検証の`validate_story_package.py --through render --ledger`、Ministral事前解析の`validate_preflight_cache.py`、ledger検証の`validate_repetition_ledger.py --key-file <current-key.json>`である。Ministralの成功後は`--record-report`で固定JSONレポートをledgerへ記録する。

## 親の責務

親はledgerの入力revision、出力SHA-256、再利用理由、`needs_parent_decision`を確認する。入力が変わった場合、またはキャッシュ判定が不明な場合は安全側で再実行する。
