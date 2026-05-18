# CLAUDE.md - Claude Code 開発ガイド

このファイルは Claude Code が `tare-schedule` プロジェクトを開発する際の指針です。
詳細な仕様は `SPEC.md` を参照してください。

---

## プロジェクト概要

**tare-schedule** は KimFoods のタレ製造工程を管理するWebアプリです。

- **目的**: タレ製造のスケジュール表示 + 製造実績の自動記録 + 原材料出庫管理
- **対象端末**: iPad(横向き推奨)
- **ホスティング**: GitHub Pages
- **バックエンド**: Google Apps Script + Google Spreadsheet

---

## 現在のフェーズ

**Phase 1: フロントエンド開発(進行中)**

バックエンド連携はまだ実装しません。以下の機能のみ作成:

- [x] パターン①/②選択UI
- [x] スタート時刻入力
- [x] タレ種類選択(A/B/C)
- [x] 時刻計算ロジック
- [x] 時刻表表示(左右2カラム)
- [x] localStorage保存/復元
- [x] 現在時刻表示
- [x] マスター管理画面のUI(保存ボタンは仮実装でOK)

「製造開始」ボタンは画面上に置くが、現時点では「Phase 2で実装」と表示するだけ。

---

## 開発ルール

### ファイル構成

```
tare-schedule/
├── CLAUDE.md         ← このファイル
├── SPEC.md           ← 仕様書(詳細はこちら)
├── README.md         ← GitHub用説明
├── index.html        ← Phase 1のメインファイル(単一ファイル)
└── gas/              ← Phase 2以降で追加
```

**Phase 1 は単一の `index.html` ファイルのみ** で実装する。CSS / JavaScript はすべてこのファイル内に書く(`<style>` タグと `<script>` タグ内)。

### コーディング規約

- **インデント**: スペース2つ
- **JavaScript**: ES6+(`const` / `let` / `arrow function`)
- **コメント**: 日本語OK。各関数の役割を1-2行で説明
- **CSS**: BEM風の命名でも、シンプルなクラス名でもOK。一貫性重視
- **外部ライブラリ**: 使わない(jQueryもNG)。Vanilla JavaScript のみ
- **CDN**: Phase 1では使わない

### UI設計の原則

- **iPad横向き最適化**: 1024×768を基準に設計
- **大きめのタッチターゲット**: ボタンは最小44×44px(Appleの推奨)
- **時刻表示は大きく**: 22-24pxでタブレットから視認しやすく
- **シンプルな配色**: SPEC.md の 8.1 カラー仕様に従う
- **iPad縦向き / スマホ**: 動作はするが、最適化は不要

### localStorage キー

```javascript
const STORAGE_KEYS = {
  pattern: 'tare_pattern',      // '①' or '②'
  startTime: 'tare_startTime',  // 'HH:MM'
  tareTypes: 'tare_types',      // ['A'] or ['A', 'B']
  schedule: 'tare_schedule'     // 計算済み時刻表 JSON
};
```

### 工程時間の定数

```javascript
const PHASES = [
  { name: '水飴点火',     offset: 0 },
  { name: '回転釜点火',   offset: 60 },
  { name: '出汁開始',     offset: 110 },
  { name: 'タレ開始',     offset: 130 },
  { name: 'タレ取り出し', offset: 210 }
];

const BATCH2_START_OFFSET = 110;  // 2回目の水飴点火 = 1回目の出汁開始
```

### カラー定数

```css
:root {
  --color-batch1-bg: #EEEDFE;
  --color-batch1-text: #26215C;
  --color-batch2-bg: #E1F5EE;
  --color-batch2-text: #04342C;
  --color-simultaneous: #FAEEDA;
  --color-primary-text: #333;
  --color-button-primary: #3B82F6;
  --color-button-danger: #EF4444;
}
```

---

## テスト方法

1. ローカルで `index.html` をブラウザで開いて動作確認
   ```bash
   # 簡易サーバー(localStorageが動くようにする)
   python3 -m http.server 8000
   # ブラウザで http://localhost:8000 を開く
   ```

2. iPad での確認は GitHub Pages にデプロイ後
   ```bash
   git add . && git commit -m "..." && git push
   # 数分後にGitHub PagesのURLでアクセス
   ```

3. 主な確認ポイント:
   - パターン①でスタート9:00 → 5工程が正しい時刻で表示されるか
   - パターン②でスタート9:00 → 1回目と2回目が左右に並び、10:50の行が黄色になるか
   - リロードしても前回の入力が復元されるか
   - リセットボタンで全部消えるか
   - タレ種類A/B/Cの選択UIが動くか

---

## Git運用

### ブランチ

- `main`: 常にGitHub Pagesにデプロイされる安定版
- 機能ごとに `feature/xxx` ブランチを切るのが理想だが、小規模なので `main` 直接でもOK

### コミットメッセージ

日本語OK。プレフィックスを付けると分かりやすい:

- `feat: ` 新機能
- `fix: ` バグ修正
- `style: ` UIスタイル変更
- `refactor: ` リファクタリング
- `docs: ` ドキュメント更新

例:
```
feat: パターン②の時刻計算ロジック追加
fix: スタート時刻が空の時のエラー修正
style: iPad横向け時のレイアウト調整
```

### GitHub Pages 設定

リポジトリ作成後、以下を有効化:

1. リポジトリの **Settings → Pages**
2. **Source**: Deploy from a branch
3. **Branch**: `main` / `/ (root)`
4. **Save**

数分後に `https://jshangqian-afk.github.io/tare-schedule/` で公開される。

---

## 次のフェーズへの引き継ぎ

Phase 1 完成後、Phase 2 で以下を追加する:

1. **新規Spreadsheetを作成**
   - 4枚のシート(製造実績/原材料マスター/原材料出庫/月次集計/年次集計)
   - 原材料マスターに初期データ投入

2. **GASプロジェクトを作成(clasp使用)**
   ```bash
   mkdir gas && cd gas
   clasp create --title "tare-schedule-backend" --type webapp
   ```

3. **doGet / doPost を実装**
   - SPEC.md の「6. GAS API エンドポイント設計」に従う

4. **フロントから fetch でAPI呼び出し**
   - 「製造開始」ボタンの実装
   - マスター管理画面の保存機能

---

## 既知の注意点

- **CORS**: GAS WebApp に POST する時、`Content-Type: application/json` だとプリフライトリクエストでハマる可能性あり。`text/plain` で送信して GAS 側で `JSON.parse` するのが定番
- **localStorage**: iPadのSafariはプライベートブラウジングだとlocalStorageが効かない。エラーハンドリング推奨
- **時刻計算**: 日付をまたぐケース(例: スタート 22:00)は今回は考慮不要(タレ製造は日中のみ)

---

## 参考: 既存のKimFoodsプロジェクト

同じパターンで作っている他のシステム(コードスタイルや構成を参考に):

- `jshangqian-afk/sanada-schedule` - 真田工場製造スケジュール
- `jshangqian-afk/kimfoods-stock` - 在庫管理
- `jshangqian-afk/wakuwaku-delivery` - フラワーファクトリーフルール配達伝票

---

**最終更新**: 2026-05-17
