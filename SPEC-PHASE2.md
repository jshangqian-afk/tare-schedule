# Phase 2: バックエンド構築 作業手順書

このドキュメントは Phase 2(Google Apps Script + Spreadsheet バックエンド)を構築するための作業手順です。
詳細な仕様は `SPEC.md` を参照してください。

---

## 全体の流れ

```
1. clasp セットアップ確認
2. Googleスプレッドシート新規作成
3. GASプロジェクト作成(clasp)
4. 初期化スクリプト実装 & 実行(シート自動生成)
5. WebApp(doGet/doPost)実装
6. WebAppデプロイ & URL取得
7. フロントエンドからGAS WebApp接続
8. マスター管理画面で原材料データ入力
9. 動作確認
```

---

## ステップ1: clasp セットアップ確認

### 1.1 インストール確認

```bash
clasp --version
```

未インストールの場合:
```bash
npm install -g @google/clasp
```

### 1.2 ログイン確認

```bash
clasp login --status
```

未ログインの場合:
```bash
clasp login
```

ブラウザが開くのでGoogleアカウントでログイン。

---

## ステップ2: Googleスプレッドシート作成

### 2.1 手動で新規作成

1. [Google Drive](https://drive.google.com/) を開く
2. 新規 → Google スプレッドシート
3. ファイル名を「**タレ製造管理**」に変更

### 2.2 IDを取得

URLからIDをコピー:
```
https://docs.google.com/spreadsheets/d/{ここがID}/edit
```

このIDを後でGASのコードに埋め込む(または `Script Properties` で管理)。

---

## ステップ3: GASプロジェクト作成

プロジェクトのルートディレクトリで作業:

```bash
cd /Users/kim/Downloads/tare-schedule
mkdir gas
cd gas

# 新規GASプロジェクト作成(スタンドアロン型)
clasp create --title "tare-schedule-backend" --type standalone

# .clasp.json と appsscript.json が作成される
```

`--type standalone` を選ぶ理由: スプレッドシートに紐付けず、独立したGASプロジェクトとして作成。スプレッドシートIDをコードに渡して操作する方式。

---

## ステップ4: シート自動生成スクリプト

GASに以下の関数を実装し、**一度だけ実行**してシート構造を作る。

### 4.1 作成するシート(5枚)

| シート名 | 内容 |
|---------|------|
| `製造実績` | 製造日、製造ID、パターン、回数、タレ種類、スタート時刻、取り出し予定、記録日時 |
| `原材料マスター` | タレ種類、原材料名、1バッチ使用量、単位、最終更新日 |
| `原材料出庫` | 製造日、製造ID、タレ種類、原材料名、出庫量、単位、記録日時 |
| `月次集計` | 年月、タレ種類、製造回数、原材料名、合計使用量、単位 |
| `年次集計` | 年、タレ種類、製造回数、原材料名、合計使用量、単位 |

### 4.2 初期化関数 `initSheets()`

GAS側に実装:

```javascript
function initSheets() {
  const SPREADSHEET_ID = '【スプレッドシートID】';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const sheets = {
    '製造実績': ['製造日', '製造ID', 'パターン', '回数', 'タレ種類', 'スタート時刻', 'タレ取り出し予定時刻', '記録日時'],
    '原材料マスター': ['タレ種類', '原材料名', '1バッチ使用量', '単位', '最終更新日'],
    '原材料出庫': ['製造日', '製造ID', 'タレ種類', '原材料名', '出庫量', '単位', '記録日時'],
    '月次集計': ['年月', 'タレ種類', '製造回数', '原材料名', '合計使用量', '単位'],
    '年次集計': ['年', 'タレ種類', '製造回数', '原材料名', '合計使用量', '単位']
  };

  Object.entries(sheets).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  });

  // 最初の空のSheet1を削除
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('シート1');
  if (defaultSheet && ss.getSheets().length > 1) ss.deleteSheet(defaultSheet);
}
```

実行方法: GASエディタを開いて `initSheets` 関数を選択 → 実行ボタン。

---

## ステップ5: WebApp実装

### 5.1 主要関数

- `doGet(e)` - GET リクエスト処理(マスター取得など)
- `doPost(e)` - POST リクエスト処理(マスター保存、製造実績保存)

### 5.2 エンドポイント(SPEC.md 6章参照)

| action | メソッド | 内容 |
|--------|---------|------|
| `getMaster` | GET | A/B/Cタレの原材料マスター取得 |
| `saveMaster` | POST | 原材料マスター保存(タレ種類単位で全置換) |
| `saveProduction` | POST | 製造実績保存 + 原材料自動出庫 |
| `getHistory` | GET | 製造履歴取得(将来用) |

### 5.3 CORS対応

GASのWebAppはレスポンスヘッダーを自由に設定できないため、フロント側で以下のように送信:

```javascript
// Content-Type を 'text/plain' にしてプリフライト回避
fetch(GAS_URL, {
  method: 'POST',
  body: JSON.stringify({ action: 'saveProduction', ... })
  // Content-Typeは指定しない(text/plain扱いになる)
})
```

GAS側で `JSON.parse(e.postData.contents)` で受け取り。

---

## ステップ6: WebApp デプロイ

### 6.1 GASエディタからデプロイ

1. GASエディタを開く
2. 右上「**デプロイ**」 → **新しいデプロイ**
3. 種類: **ウェブアプリ**
4. 説明: `v1`
5. 実行者: **自分**
6. アクセスできるユーザー: **全員**
7. デプロイ → URL取得

### 6.2 URL を控える

```
https://script.google.com/macros/s/【デプロイID】/exec
```

このURLをフロントエンドの `index.html` に埋め込む。

### 6.3 更新デプロイ

コードを変更した後は:

```bash
# clasp で push
clasp push

# 既存デプロイを更新(GASエディタからまたは)
clasp deploy --deploymentId 【デプロイID】 --description "v2"
```

---

## ステップ7: フロントエンド接続

`index.html` に以下を追加・修正:

### 7.1 GAS URL の定数化

```javascript
const GAS_URL = 'https://script.google.com/macros/s/.../exec';
```

### 7.2 マスター取得関数

```javascript
async function loadMaster() {
  const res = await fetch(`${GAS_URL}?action=getMaster`);
  const data = await res.json();
  return data.data; // { A: [...], B: [...], C: [...] }
}
```

### 7.3 マスター保存関数

```javascript
async function saveMaster(tareType, ingredients) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveMaster', tareType, ingredients })
  });
  return await res.json();
}
```

### 7.4 製造実績保存関数

```javascript
async function saveProduction(pattern, startTime, tareTypes) {
  const res = await fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'saveProduction', pattern, startTime, tareTypes })
  });
  return await res.json();
}
```

「製造開始」ボタンのアラート実装を、上記関数の呼び出しに置き換える。

---

## ステップ8: マスター管理画面で初期データ入力

1. GitHub Pagesにデプロイされたアプリにアクセス
2. 「マスター管理画面へ」ボタン
3. Aタレタブで原材料を入力 → 保存
4. Bタレタブで原材料を入力 → 保存
5. Cタレタブで原材料を入力 → 保存

スプレッドシートの「原材料マスター」シートに反映されているか確認。

---

## ステップ9: 動作確認

### 9.1 マスターの取得・保存

- マスター管理画面で編集 → 保存 → スプレッドシートで確認
- リロードして再表示時に最新データが取得できているか

### 9.2 製造実績保存

- パターン①でスケジュール作成 → 「製造開始」ボタン
- スプレッドシートで以下を確認:
  - 製造実績シートに1行追加されているか
  - 原材料出庫シートにAタレの原材料が一括追加されているか
  - 月次集計シートが更新されているか

- パターン②でスケジュール作成 → 「製造開始」ボタン
- スプレッドシートで以下を確認:
  - 製造実績シートに2行追加されているか(1回目・2回目)
  - 原材料出庫に2種類のタレの原材料が記録されているか

### 9.3 集計の確認

- 月をまたぐ製造データを入れて、月次集計が正しく行・列を持つか
- 年をまたぐデータも同様

---

## ステップ10: Git管理

GASのコードもGitで管理する:

```bash
cd /Users/kim/Downloads/tare-schedule
git add gas/
git commit -m "feat: Phase 2 GASバックエンド実装"
git push
```

`.clasp.json` には認証情報が含まれないので、Gitにコミットしても問題ない。
ただし `.clasprc.json`(ホームディレクトリにある)は秘密情報なのでコミット禁止。

---

## 注意事項

### Script Properties に秘密情報を入れる(推奨)

スプレッドシートIDなどはコードに直書きせず、Script Propertiesで管理:

```javascript
// GAS内
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
```

設定方法: GASエディタ → プロジェクトの設定 → スクリプト プロパティ

### 重複登録防止

「製造開始」ボタンを連打した時に同じ製造実績が複数登録されないよう、フロント側でボタンを `disabled` にしておく。

### デプロイ運用

- 開発中は GASエディタから手動デプロイ(URLは変わらない)
- 大きな仕様変更時は新規デプロイ(URLが変わる → フロントの GAS_URL も更新)

---

## トラブルシューティング

### Q: WebAppにアクセスすると認証画面が出る
A: デプロイ設定で「アクセスできるユーザー: **全員**」になっているか確認

### Q: CORS エラーが出る
A: フロント側で `Content-Type` ヘッダーを指定していないか確認(指定しないのが正解)

### Q: スプレッドシートIDが間違っている
A: GASのコード or Script Properties の値を確認

### Q: clasp push でエラー
A: `clasp login` で再ログイン、または `.clasp.json` の `scriptId` を確認

---

**最終更新**: 2026-05-18
