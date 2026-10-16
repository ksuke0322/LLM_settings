# 外部Skillのドリフト計測

この監査は計測結果を返し、lock、Skill、基準ファイルを更新しない。株式系7Skillとstock-sharedは内容を読む前に除外する。

## 値の意味

GitHub由来のlock v3 `skillFolderHash` は、上流のSkillフォルダーのGit tree SHAである。公式installerの固定commit [`13e4063`](https://github.com/vercel-labs/skills/blob/13e4063a1cf913f5606d57d42ab83a86f5001e04/src/skill-lock.ts#L8-L29) と [`fetchSkillFolderHash`](https://github.com/vercel-labs/skills/blob/13e4063a1cf913f5606d57d42ab83a86f5001e04/src/skill-lock.ts#L152-L172)、[フォルダーtreeの選択](https://github.com/vercel-labs/skills/blob/13e4063a1cf913f5606d57d42ab83a86f5001e04/src/blob.ts#L281-L300) に根拠がある。リポジトリ直下のSkillならルートtreeを使う。他のsourceTypeやlock版へ同じ意味を推定しない。

ローカル内容は別方式 `skill-folder-content-v1` で計測する。SHA-256に識別子とNUL、UTF-8相対パスのバイト順で整列した各通常ファイルのパス長（32bit big-endian）・パス・内容長（64bit big-endian）・内容を入れる。空ディレクトリと実行属性は対象外。シンボリックリンクがあれば追跡せずdigestをnullとする。Git tree SHAとこのdigestを直接比較しない。

## 再現手順

専用worktreeで実行し、報告先は監査者が選ぶ。以下は一時報告の例で、正本baselineを自動更新する指示ではない。

```sh
node bin/measure-skill-drift.mjs --root . --json > /tmp/skill-measurement.json
node bin/measure-skill-drift.mjs --root . --json --baseline /tmp/skill-measurement.json
```

`--baseline` は過去の本CLI出力を受ける。同一algorithm IDと有効な両digestがある場合だけlocal-baseline-match / locally-modifiedを返す。未指定・欠損・不正schema・別方式・nullは理由付きverification-unknown。lock値の変化は別欄のlock-match / lock-changedに記録する。内容変化だけで、意図した変更か事故かは断定しない。承認済み変更を確認した親が、新しいbaselineの採否を判断する。

### 上流のlock更新漏れを調べる

既に用意した上流チェックアウトをJSONで明示する。CLIはclone、fetch、ネット接続を行わない。

```json
{"sources":{"owner/repository":"/absolute/path/to/upstream-checkout"}}
```

```sh
node bin/measure-skill-drift.mjs --root . --json --upstream-checkouts /absolute/path/to/checkouts.json
```

lock v3、GitHub由来、40桁hex、確認可能なSkillパス、取得元と一致するoriginを満たす場合だけ採取時HEAD commitを固定し、そのGit objectからtree SHAを読む。チェックアウト内の未コミット編集は含まず、dirty状態を別記する。指定HEADを現行最新版だと推定しない。

上流tree SHAと同種のlock値だけを比較し、upstream-lock-match / lock-update-neededを返す。後者は指定commitのtreeとlockが異なるという測定結果で、ローカル改変の証拠ではない。取得不能、違うorigin、他sourceType、対象パス欠落は理由付きunknown。未知や差分は監査結果であり、このCLIに新たなmerge gateは設けない。

### 意図したカスタマイズ

上流Skillへ直接編集を重ねる代わりに、ローカルwrapperまたはpatchを別管理し、理由・対象・適用した上流commit・検証記録を残す。宣言入力の例:

```json
{"skills":{"example":{"type":"patch","reference":"patches/example.patch","reason":"利用環境への調整。適用元commitは別の確認記録を参照"}}}
```

`--customizations /absolute/path/to/declarations.json` を指定する。typeはpatch/wrapper。宣言はそのまま記録するが適用状態や参照の有効性はunverifiedであり、未指定を「カスタマイズなし」とは解釈しない。既存Skillを自動的にpatchへ変換する操作ではない。

## 更新時の確認

同じ方式の前回baselineと、明示した上流チェックアウトを用意して監査する。localComparison、lockComparison、upstreamComparison、customizationを別々に読む。全体statusはverification-unknownを維持し、上流とローカルが完全に一致するとの保証はしない。報告は参照元metadata、採取commit、理由を保持する。定期監査から同じコマンドを実行できる。
