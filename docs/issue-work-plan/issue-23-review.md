# #23 ドリフト計測の確認記録

確認日: 2026-10-17 JST。参照main: `52011e0`。

## 実装

- `bin/measure-skill-drift.mjs` と12件のfixtureを追加。株式系7Skillとstock-sharedはローカル内容・上流情報の読取前に除外する。
- lockHash、指定上流の採取commit/tree SHA、ローカルcontent digestを別に保持。baseline比較、lock値の変化、上流lock比較、patch/wrapper宣言は独立した欄に出力する。
- ローカルdigestの規則を固定し、symlinkや欠落は理由付きunknown。異なる方式の値を直接比較しない。全体statusはunknownのまま、新規gateや自動更新を導入しない。
- 公式installer固定commit `13e4063a1cf913f5606d57d42ab83a86f5001e04` の一次資料をread-only調査で確認。GitHub lock v3のtree仕様とroot Skillの扱いを実装へ反映。[仕様・利用手順](../skill-drift.md)に根拠URLを記録。
- 上流は明示したチェックアウトのGit objectだけを読む。origin一致、sourceType、lock版、40桁値、パスを検査し、取得したcommitを固定する。ネットやcloneは行わず、指定HEADを最新版だと推定しない。

## 実測と未確認

18件を計測。再計測で17件のローカルbaselineが一致し、playwright-skillはsymlinkによりdigest null。上流チェックアウト未指定のため上流照合は18件ともunknown、全体statusも18件unknown。Skillが上流と一致するとの結論ではない。以前の11一致/6不一致/1不在を現時点の値として再利用しない。

上流一致・変化・パス不在・異なるorigin・root Skill等は隔離した一時Git fixtureで検証。実際の18件の上流状態を確認済みとは扱わない。カスタマイズ未指定はunknownであり、宣言の有効性もunverified。

## 検証

- Luna/maxへ2ファイル限定の小委任を順次実施。起動不能Redを機能Redから分離し、旧実装の除外不足とsymlink処理、新規入力未対応、root Skill非対応を再現後に修正。
- 親の内容ハッシュ除去、株式除外無効化、上流不一致の常時一致化は全てテストで検出し復元。
- 関連12件と非Archify89件は全件通過。
- 同じNode 22.12.0、shared/jevの同一installコマンド、Archify依存未導入で全件実行。参照1010件/918通過、候補1022件/930通過。双方Archify内69失敗・23スキップ。失敗名・診断内容はworktree/一時パス/時間を正規化後に一致、skip項目も一致。承認済み非Archify例外を適用。
- 全件コマンド: `git ls-files -z '*.test.mjs' | xargs -0 node --test --test-reporter=tap`。main checkoutでは実行していない。ログは `/tmp/issue23-{baseline,candidate,nonarch}.tap` と `/tmp/issue23-mutation-{content,exclusion,upstream}.tap`。

## 完了条件と残リスク

完成対象は再現可能な監査方法であり、全Skillの整合性を確認済みとするものではない。実測のunknownは保持する。baselineの採否、意図したカスタマイズの有効性、指定commitが確認目的に合うかは親が判断する。

mainマージ・内容保全・clean確認・今回の専用/参照worktree通常削除後にtodoとHTMLを完了へ更新する。旧dirty候補は保全する。
