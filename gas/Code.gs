/**
 * Code.gs - WebApp エントリーポイントと各種API
 *
 * フロントエンドからの呼び出しを doGet/doPost で受け、action パラメータで分岐。
 *
 * エンドポイント:
 *   GET  ?action=getMaster                       原材料マスター取得
 *   GET  ?action=getHistory&year=2026&month=05   月次集計取得
 *   POST { action: 'saveMaster', ... }           原材料マスター保存
 *   POST { action: 'saveProduction', ... }       製造実績保存 + 原材料自動出庫
 */

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    switch (action) {
      case 'getMaster':  return getMaster();
      case 'getHistory': return getHistory(e.parameter);
      default:           return errorResponse('Unknown action: ' + action);
    }
  } catch (err) {
    return errorResponse(err.message || err);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case 'saveMaster':     return saveMaster(body);
      case 'saveProduction': return saveProduction(body);
      default:               return errorResponse('Unknown action: ' + body.action);
    }
  } catch (err) {
    return errorResponse(err.message || err);
  }
}

// ============================================================
// 原材料マスター
// ============================================================

/**
 * 全タレ種類の原材料マスターを取得。
 * レスポンス: { success: true, data: { A: [...], B: [...], C: [...] } }
 */
function getMaster() {
  const sheet = getSheet('原材料マスター');
  const lastRow = sheet.getLastRow();
  const data = { A: [], B: [], C: [] };

  if (lastRow < 2) return successResponse({ data: data });

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  rows.forEach(row => {
    const [tareType, name, amount, unit] = row;
    if (!tareType || !data[tareType]) return;
    if (!name) return;
    data[tareType].push({
      name: String(name),
      amount: Number(amount) || 0,
      unit: String(unit || '')
    });
  });

  return successResponse({ data: data });
}

/**
 * 指定タレ種類の原材料マスターを全置換。
 * body: { action, tareType: 'A', ingredients: [{ name, amount, unit }, ...] }
 */
function saveMaster(body) {
  const tareType = body.tareType;
  const ingredients = body.ingredients || [];

  if (!['A', 'B', 'C'].includes(tareType)) {
    return errorResponse('tareType は A/B/C のいずれかを指定してください: ' + tareType);
  }

  const sheet = getSheet('原材料マスター');
  const lastRow = sheet.getLastRow();
  const now = new Date();
  const timestamp = formatTimestamp(now);

  // 該当タレ種類の既存行を削除(下から削除すると行番号がずれない)
  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (values[i][0] === tareType) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  // 新しい行を末尾に追加
  if (ingredients.length > 0) {
    const newRows = ingredients.map(ing => [
      tareType,
      String(ing.name || ''),
      Number(ing.amount) || 0,
      String(ing.unit || ''),
      timestamp
    ]);
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 5).setValues(newRows);
  }

  return successResponse({ tareType: tareType, count: ingredients.length });
}

// ============================================================
// 製造実績
// ============================================================

/**
 * 製造実績を保存し、原材料を自動出庫、月次・年次集計を更新する。
 * body: { action, pattern: '①' | '②', startTime: 'HH:MM', tareTypes: ['A'] | ['A','B'] }
 */
function saveProduction(body) {
  const pattern = body.pattern;
  const startTime = body.startTime;
  const tareTypes = body.tareTypes || [];

  if (!['①', '②'].includes(pattern)) {
    return errorResponse('pattern は ① または ② を指定してください: ' + pattern);
  }
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
    return errorResponse('startTime は HH:MM 形式で指定してください: ' + startTime);
  }
  if (pattern === '①' && tareTypes.length < 1) {
    return errorResponse('パターン①では tareTypes に1要素が必要です');
  }
  if (pattern === '②' && tareTypes.length < 2) {
    return errorResponse('パターン②では tareTypes に2要素が必要です');
  }

  const now = new Date();
  const timestamp = formatTimestamp(now);

  // 製造日: body.productionDate('yyyy-MM-dd') があればその日付を、無ければ当日を使う。
  // 過去日付の記録に対応。製造ID・月次/年次集計のキーもこの日付に揃える。
  // 一方 timestamp(記録日時) は実際に記録した現在時刻のまま残す。
  const prodDateObj = parseProductionDate(body.productionDate, now);
  const productionDate = formatDate(prodDateObj);

  // 全マスターを一度取得(出庫処理で使う)
  const masterAll = readMasterMap();

  // バッチごとの情報を組み立てる
  const batches = [];
  batches.push({
    round: 1,
    tareType: tareTypes[0],
    startTime: startTime,
    pickupTime: addMinutesToTime(startTime, PHASES.PICKUP)
  });
  if (pattern === '②') {
    const batch2Start = addMinutesToTime(startTime, BATCH2_START_OFFSET);
    batches.push({
      round: 2,
      tareType: tareTypes[1],
      startTime: batch2Start,
      pickupTime: addMinutesToTime(batch2Start, PHASES.PICKUP)
    });
  }

  // 製造ID採番(各バッチごと)
  const productionIds = [];
  batches.forEach(b => {
    b.productionId = generateProductionId(prodDateObj);
    productionIds.push(b.productionId);
  });

  // 製造実績シートに追記
  const productionSheet = getSheet('製造実績');
  const productionRows = batches.map(b => [
    productionDate,
    b.productionId,
    pattern,
    b.round,
    b.tareType,
    b.startTime,
    b.pickupTime,
    timestamp
  ]);
  productionSheet.getRange(productionSheet.getLastRow() + 1, 1, productionRows.length, 8)
    .setValues(productionRows);

  // 原材料出庫 + 集計更新
  const dispatchSheet = getSheet('原材料出庫');
  batches.forEach(b => {
    const ingredients = masterAll[b.tareType] || [];
    if (ingredients.length === 0) return;

    const dispatchRows = ingredients.map(ing => [
      productionDate,
      b.productionId,
      b.tareType,
      ing.name,
      ing.amount,
      ing.unit,
      timestamp
    ]);
    dispatchSheet.getRange(dispatchSheet.getLastRow() + 1, 1, dispatchRows.length, 7)
      .setValues(dispatchRows);

    updateAggregate('月次集計', formatYearMonth(prodDateObj), b.tareType, ingredients);
    updateAggregate('年次集計', formatYear(prodDateObj), b.tareType, ingredients);
  });

  return successResponse({ productionIds: productionIds });
}

/**
 * マスターを { A: [...], B: [...], C: [...] } の形で読み込む。
 */
function readMasterMap() {
  const sheet = getSheet('原材料マスター');
  const lastRow = sheet.getLastRow();
  const result = { A: [], B: [], C: [] };
  if (lastRow < 2) return result;

  const rows = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  rows.forEach(row => {
    const [tareType, name, amount, unit] = row;
    if (!result[tareType] || !name) return;
    result[tareType].push({
      name: String(name),
      amount: Number(amount) || 0,
      unit: String(unit || '')
    });
  });
  return result;
}

// ============================================================
// 集計(月次・年次共通)
// ============================================================

/**
 * 集計シートを更新する。
 * keyValue: 年月(YYYY-MM)または年(YYYY)
 * シート構造: [キー, タレ種類, 製造回数, 原材料名, 合計使用量, 単位]
 */
function updateAggregate(sheetName, keyValue, tareType, ingredients) {
  const sheet = getSheet(sheetName);
  const lastRow = sheet.getLastRow();
  const data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 6).getValues() : [];

  // 既存行を (原材料名 → シート行番号) で索引化、同時に既存 製造回数 を読む
  const ingredientRowMap = {};
  let existingCount = 0;
  data.forEach((row, i) => {
    if (String(row[0]) === String(keyValue) && row[1] === tareType) {
      ingredientRowMap[String(row[3])] = i + 2; // シート上の行番号(1-based、ヘッダー除く)
      existingCount = Number(row[2]) || 0;
    }
  });

  const newCount = existingCount + 1;

  // 各原材料を加算 or 新規追加
  ingredients.forEach(ing => {
    const rowNum = ingredientRowMap[ing.name];
    if (rowNum) {
      const oldAmount = Number(sheet.getRange(rowNum, 5).getValue()) || 0;
      sheet.getRange(rowNum, 3).setValue(newCount);
      sheet.getRange(rowNum, 5).setValue(oldAmount + (Number(ing.amount) || 0));
    } else {
      sheet.appendRow([keyValue, tareType, newCount, ing.name, Number(ing.amount) || 0, ing.unit]);
    }
  });

  // 既存行の製造回数を新カウントに統一(マスター変更で消えた原材料の行も整合させる)
  Object.values(ingredientRowMap).forEach(rowNum => {
    sheet.getRange(rowNum, 3).setValue(newCount);
  });
}

// ============================================================
// 履歴取得(将来用)
// ============================================================

/**
 * 月次集計を取得。
 * params: { year: '2026', month: '05' }
 */
function getHistory(params) {
  const year = params && params.year;
  const month = params && params.month;
  const sheet = getSheet('月次集計');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return successResponse({ data: [] });

  const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  let filtered = rows;

  if (year && month) {
    const yearMonth = year + '-' + String(month).padStart(2, '0');
    filtered = rows.filter(r => String(r[0]) === yearMonth);
  } else if (year) {
    filtered = rows.filter(r => String(r[0]).startsWith(year));
  }

  const data = filtered.map(r => ({
    yearMonth:    String(r[0]),
    tareType:     r[1],
    count:        Number(r[2]) || 0,
    ingredient:   String(r[3]),
    totalAmount:  Number(r[4]) || 0,
    unit:         String(r[5] || '')
  }));

  return successResponse({ data: data });
}
