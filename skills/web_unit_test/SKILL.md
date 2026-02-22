---
name: web-unit-test
description: Web アプリケーションの単体テスト（Unit Test）を作成する際に使用するスキル。ユーティリティ関数、カスタム Hook、Reducer、ユーザインタラクションを伴わないコンポーネントを対象とし、最小ロジック単位の正当性と副作用を検証する。Vitest / React Testing Library / vitest-axe を使用する。
---

# webユニットテストルール

## 単体テスト（ユニットテスト=Unit Test）

- 目的: 最小のロジック単位が正しく動作することを保証する
- 対象:
  - ユーティリティ関数、カスタム Hook、Reducer など
  - コンポーネントで発生する副作用（関数発火、API 呼び出しなど）
  - ユーザインタラクションのないコンポーネントの表示・構造
  - コンポーネントの a11y の violation 確認（Storybook 同様 UI パターンを網羅）
- 特徴:
  - 外部依存（API、Storage など）はモック化
- 技術:
  - Vitest / React Testing Library / vitest-axe
- 配置: テスト対象ファイルと同一階層の `__tests__` ディレクトリにテストを配置すること
