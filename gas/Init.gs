/**
 * Init.gs - 初期化スクリプト
 *
 * 最初に setSpreadsheetId() を実行してスプレッドシートIDを Script Properties に保存し、
 * 続いて initSheets() を実行して5枚のシートとヘッダーを自動生成する。
 */

// このIDは初期化時にのみ参照される。実運用では Script Properties から取得する。
const TARGET_SPREADSHEET_ID = '1W6jKEiBxWmkYMlAqI6A8O2ELMS3ATtSWvip0qZOG4WM';

const SHEET_DEFINITIONS = {
  '製造実績': [
    '製造日', '製造ID', 'パターン', '回数', 'タレ種類',
    'スタート時刻', 'タレ取り出し予定時刻', '記録日時'
  ],
  // F〜H は原価計算用に後から追加した列(既存の列位置は動かさない)
  '原材料マスター': [
    'タレ種類', '原材料名', '1バッチ使用量', '単位', '最終更新日',
    '入荷量', '入荷単位', '入荷金額(税抜)'
  ],
  '原材料出庫': [
    '製造日', '製造ID', 'タレ種類', '原材料名', '出庫量', '単位', '記録日時'
  ],
  '月次集計': [
    '年月', 'タレ種類', '製造回数', '原材料名', '合計使用量', '単位'
  ],
  '年次集計': [
    '年', 'タレ種類', '製造回数', '原材料名', '合計使用量', '単位'
  ]
};

/**
 * スプレッドシートIDを Script Properties に保存する。
 * 一度だけ実行すればよい。
 */
function setSpreadsheetId() {
  PropertiesService.getScriptProperties()
    .setProperty('SPREADSHEET_ID', TARGET_SPREADSHEET_ID);
  Logger.log('SPREADSHEET_ID を Script Properties に保存しました: ' + TARGET_SPREADSHEET_ID);
}

/**
 * 5枚のシートとヘッダーを自動生成する。
 * Script Properties に SPREADSHEET_ID が保存されていることが前提。
 */
function initSheets() {
  const ss = getSpreadsheet();

  Object.entries(SHEET_DEFINITIONS).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      Logger.log('シート作成: ' + name);
    } else {
      Logger.log('シート既存(ヘッダー再設定): ' + name);
    }

    // ヘッダー行のみリセット(既存データは温存)
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);

    // 余計な列を縮める
    if (sheet.getMaxColumns() > headers.length) {
      sheet.deleteColumns(headers.length + 1, sheet.getMaxColumns() - headers.length);
    }
  });

  // デフォルトの空シートを削除
  ['Sheet1', 'シート1'].forEach(name => {
    const s = ss.getSheetByName(name);
    if (s && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
      Logger.log('デフォルトシート削除: ' + name);
    }
  });

  Logger.log('initSheets 完了');
}
