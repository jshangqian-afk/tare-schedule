/**
 * Helper.gs - 共通関数
 *
 * スプレッドシート取得、ID採番、日付フォーマット、レスポンス生成など。
 */

const TIMEZONE = 'Asia/Tokyo';

// 工程時間(分)。フロントエンドと同期。
const PHASES = {
  WATER_AME:    0,
  ROTATING_POT: 60,
  DASHI:        110,
  TARE:         130,
  PICKUP:       210
};

const BATCH2_START_OFFSET = 110;

// === スプレッドシート ===

/**
 * Script Properties に保存された SPREADSHEET_ID からスプレッドシートを取得。
 */
function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_ID が Script Properties に設定されていません。setSpreadsheetId() を先に実行してください。');
  }
  return SpreadsheetApp.openById(id);
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error('シートが見つかりません: ' + name);
  }
  return sheet;
}

// === 日付・時刻 ===

/** Date → 'yyyy-MM-dd' */
function formatDate(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

/** Date → 'yyyy-MM-dd HH:mm:ss' */
function formatTimestamp(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/** Date → 'yyyy-MM' */
function formatYearMonth(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM');
}

/** Date → 'yyyy' */
function formatYear(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy');
}

/**
 * 'yyyy-MM-dd' 文字列を Date(正午, スクリプトTZ) に変換する。
 * 過去日付の記録に対応。未指定・不正な形式の場合は fallback(通常は現在時刻) を返す。
 * 正午に固定するのは、タイムゾーン差による日付境界のズレを防ぐため。
 */
function parseProductionDate(str, fallback) {
  if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(String(str))) return fallback;
  const parts = String(str).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

/** 'HH:MM' に分を加算して 'HH:MM' で返す(日付またぎは考慮しない) */
function addMinutesToTime(timeStr, minutes) {
  const [h, m] = String(timeStr).split(':').map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return String(nh).padStart(2, '0') + ':' + String(nm).padStart(2, '0');
}

// === 製造ID採番 ===

/**
 * 'YYYYMMDD-NNN' 形式の製造IDを発番。
 * その日の既存IDの最大連番を見つけて +1 する。
 */
function generateProductionId(productionDate) {
  const datePrefix = Utilities.formatDate(productionDate, TIMEZONE, 'yyyyMMdd');
  const sheet = getSheet('製造実績');
  const lastRow = sheet.getLastRow();

  let maxSeq = 0;
  if (lastRow >= 2) {
    const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
    ids.forEach(row => {
      const id = String(row[0] || '');
      if (id.startsWith(datePrefix + '-')) {
        const seq = parseInt(id.substring(9), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }

  return datePrefix + '-' + String(maxSeq + 1).padStart(3, '0');
}

// === レスポンス生成 ===

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function successResponse(data) {
  return jsonResponse(Object.assign({ success: true }, data || {}));
}

function errorResponse(message) {
  return jsonResponse({ success: false, error: String(message) });
}
