# Delegate選択フロー

この文書は、`~/.agents/AGENTS.md`の委任方針を素早く判断するためのクイックリファレンスである。詳細な実行条件、権限、再開、禁止操作、結果形式は`~/.agents/references/delegate-policy.md`を参照する。

## 基本フロー

```mermaid
flowchart TD
    A[ユーザーの依頼] --> B{質問だけか}
    B -->|Yes| C[先に回答<br/>作業・委任は開始しない]
    B -->|No| D{独立した委任可能タスクがあるか}
    D -->|No| E[親が担当]
    D -->|Yes| F[親が目的・入力・出力・検証条件を固定]
    F --> G{許可範囲と受入れ条件を固定できるか}
    G -->|No| E
    G -->|Yes| H{親の実行主体}
    H -->|Claude| C1
    H -->|Codex| N1

    subgraph Claude_parent[Claude親: codex exec経路]
        C1[rtk proxy node ~/.agents/bin/codex-delegate.mjs] --> C2{ラッパー・CLI・モデル・effortを確認できるか}
        C2 -->|No / unknown| B1[BLOCKEDを親へ返す]
        C2 -->|Yes| C3{権限状態}
        C3 -->|read-only| C4[新規execはread-only sandbox]
        C3 -->|approved-write| C5[明示承認済みの範囲<br/>workspace-write]
        C3 -->|unknown / unapproved| B1
        C4 --> C6{同一目的・成果物・権限で<br/>sessionを継続するか}
        C5 --> C6
        C6 -->|Yes、session ID確認済み| C7{前回がFAILED / BLOCKEDか}
        C7 -->|Yes| B1
        C7 -->|No| C8{sandboxとcwdを再現できるか}
        C8 -->|Yes| C9[対応する設定と子プロセスcwdでexec resume]
        C8 -->|No| B1
        C6 -->|No、新規目的または範囲変更| C10[親が再定義して新しいcodex exec]
    end

    subgraph Codex_parent[Codex親: native subagent経路]
        N1[native subagent] --> N2{Luna / maxを指定できるか}
        N2 -->|No / unknown| B2[BLOCKEDを親へ返す]
        N2 -->|Yes| N3{権限状態}
        N3 -->|read-only| N4[read-onlyのnative subagent]
        N3 -->|approved-write| N5[明示承認済みの限定範囲で実行]
        N3 -->|unknown / unapproved| B2
        N4 --> N6[委任を開始]
        N5 --> N6
    end

    C9 --> R[委任先がDONE / FAILED / BLOCKEDを返す]
    C10 --> R
    N6 --> R
    R --> V[親が結果、実差分、成果物、検証を確認]
    V --> W{受入れ条件を満たすか}
    W -->|Yes| X[親が統合・最終判断]
    W -->|No、FAILED、BLOCKED| E
    B1 --> E
    B2 --> E
```

経路、モデル、effortが利用不能または`unknown`なら、Codex MCPや別モデルへ自動で切り替えず親が担当する。`FAILED`や`BLOCKED`も親へ戻し、自動再試行しない。

## 実行主体別の標準経路

| 親エージェント | 標準経路 | モデル・effort | 権限と利用不能時 |
|---|---|---|---|
| Claude | `rtk proxy node ~/.agents/bin/codex-delegate.mjs`経由で`codex exec` | `gpt-6-luna` / `max` | 読み取り専用を既定にする。利用不能・不明なら親が担当 |
| Codex | native subagent | `gpt-6-luna` / `max` | 読み取り専用を既定にする。指定不可・不明なら親が担当 |

書き込みはユーザーが承認した作業だけに限る。親が変更内容、許可パス、禁止操作、検証条件を指定し、Codex CLIでは`workspace-write`を使う。`danger-full-access`や承認回避は使わない。承認状態または許可範囲が不明なら`BLOCKED`で親へ戻す。

## resumeの判断

- 同じ目的・成果物・許可パス・承認状態の追跡だけ、確認済みsession IDで`codex exec resume <session-id>`を使う。
- session IDは`codex exec --json`のJSONLイベントから取得する。IDがない、矛盾する、または確認できない場合はresumeせず`BLOCKED`。
- 目的、受入れ条件、権限または許可範囲が変わったら、新しいタスクを定義する。
- 前回が`FAILED`または`BLOCKED`なら自動resume・再試行をせず、親が原因を確認して次を決める。
- 継続が必要な実行では`--ephemeral`を使わない。
- `codex exec resume`は`--sandbox`と`-C` / `--cd`に対応しない。ラッパーはsandboxを設定値で明示し、子プロセスの作業ディレクトリを固定する。CLIがこの指定方法に対応しない場合は起動せず`BLOCKED`を親へ返す。

## 結果と親の責務

子の最終状態は`DONE`、`FAILED`、`BLOCKED`のいずれか1つとする。`DONE`は指定作業と条件を満たした場合だけ返す。異常終了、timeout、不正または欠落した結果は成功として扱わず、親へ戻す。

親は報告文ではなく実際の差分、変更ファイル、成果物、検証結果を確認する。`DONE`でも親の受入れ確認が終わるまでは統合済みとしない。失敗や受入れ不能時は親が引き継ぎ、別経路への黙ったフォールバックをしない。

```mermaid
flowchart LR
    A[AGENTS.md] -->|常時適用する概要| B[親エージェント]
    C[delegate-flow.md] -->|経路と判断フロー| B
    D[delegate-policy.md] -->|権限・実行・検証の詳細| B
    E[hook] -->|規約の補助| B
    B -->|実行、検証、統合、最終判定| F[完了]
```

- hookは方針を補助するだけで、実行主体、モデル、経路、承認状態を自動判定・選択・生成しない。
- AGENTS.mdは常時適用する原則と詳細文書への入口を担う。
- この文書は経路の選択フロー、delegate-policy.mdは実行上の詳細条件を担う。
- 分解、横断的な統合、設計判断、品質判定、最終報告は親が担う。
