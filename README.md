# tare-schedule

KimFoods タレ製造スケジュール管理アプリ

## 概要

タレ製造工程のスケジュール表示と、製造実績・原材料出庫の自動管理を行うWebアプリです。

- スタート時刻を入力すると各工程の時刻が自動表示される
- A/B/Cタレの3種類に対応
- パターン①(1回)とパターン②(2回連続)の2モード
- 製造実績と原材料出庫を Google Spreadsheet に自動記録

## 使用技術

- **フロントエンド**: HTML + CSS + JavaScript(Vanilla JS、外部ライブラリ不使用)
- **ホスティング**: GitHub Pages
- **バックエンド**: Google Apps Script + Google Spreadsheet
- **対象端末**: iPad(横向き推奨)

## URL

https://jshangqian-afk.github.io/tare-schedule/

## 開発状況

- [x] 仕様書作成
- [ ] Phase 1: フロントエンド開発(進行中)
- [ ] Phase 2: バックエンド構築
- [ ] Phase 3: フロント-バックエンド連携
- [ ] Phase 4: 運用テスト

## ドキュメント

- [SPEC.md](./SPEC.md) - 詳細仕様書
- [CLAUDE.md](./CLAUDE.md) - Claude Code 開発ガイド

## ローカル動作確認

```bash
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```
