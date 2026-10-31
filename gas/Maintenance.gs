/**
 * Maintenance.gs - データ修復用メンテナンス関数
 *
 * 原材料マスターの二重登録に起因する「原材料出庫」「月次集計」「年次集計」の
 * 重複・水増しを修復する。runCleanup() を1回だけ実行すればよい。
 *
 * 実行手順(いずれか):
 *   - GAS エディタで runCleanup を選択して実行
 *   - 一時エンドポイント POST { action:'runCleanup', token: CLEANUP_TOKEN }
 *
 * 安全のため、実行前に対象4シートのバックアップ(_backup_日時)を作成する。
 */

// 一時トークン(クリーンアップ実行後、doPost のエンドポイントごと撤去する)
const CLEANUP_TOKEN = 'kimfoods-cleanup-7f3a9c';

/**
 * バックアップ → マスター重複削除 → 出庫重複削除 → 集計再構築 を順に実行。
 */
function runCleanup() {
  const ss = getSpreadsheet();
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd_HHmmss');
  const summary = { stamp: stamp, backups: [], master: null, dispatch: null, aggregates: null };

  // 1) バックアップ(既存データを別シートに複製)
  ['原材料マスター', '原材料出庫', '月次集計', '年次集計'].forEach(name => {
    const src = ss.getSheetByName(name);
    if (!src) return;
    const copy = src.copyTo(ss);
    copy.setName(name + '_backup_' + stamp);
    summary.backups.push(copy.getName());
  });

  // 2) 原材料マスターの重複削除(タレ種類×原材料名で一意化)
  summary.master = dedupeMasterSheet_();

  // 3) 原材料出庫の重複削除(製造ID×タレ種類×原材料名で一意化)
  summary.dispatch = dedupeDispatchSheet_();

  // 4) 月次・年次集計を「出庫(重複削除後)＋製造実績」から再構築
  summary.aggregates = rebuildAggregateSheets_();

  return summary;
}

/**
 * 指定した製造ID群を「製造実績」「原材料出庫」から削除し、集計を再構築する。
 * 二重送信などで誤って採番された製造を取り消す用途。実行前にバックアップを作成。
 * ids: 製造IDの配列(例 ['20260613-002','20260622-002'])
 */
function purgeProductionIds(ids) {
  const idSet = {};
  (ids || []).forEach(id => { idSet[String(id).trim()] = true; });
  if (!Object.keys(idSet).length) throw new Error('削除対象の製造IDが空です');

  const ss = getSpreadsheet();
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd_HHmmss');
  const result = { stamp: stamp, ids: Object.keys(idSet), removed: {} };

  ['製造実績', '原材料出庫'].forEach(name => {
    const sheet = getSheet(name);
    const copy = sheet.copyTo(ss);
    copy.setName(name + '_backup_' + stamp);

    const lastRow = sheet.getLastRow();
    let removed = 0;
    if (lastRow >= 2) {
      // 製造ID は両シートとも 2列目。下から削除して行番号のズレを防ぐ。
      const idCol = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
      for (let i = idCol.length - 1; i >= 0; i--) {
        if (idSet[String(idCol[i][0]).trim()]) {
          sheet.deleteRow(i + 2);
          removed++;
        }
      }
    }
    result.removed[name] = removed;
  });

  result.aggregates = rebuildAggregateSheets_();
  return result;
}

/**
 * 二重記録(①で押したあと②に切り替えて押し直したもの)を取り消す。GAS エディタから1回だけ実行。
 * 対象の行が想定(パターン・タレ)と違えば、何も消さずに止まる。
 */
function purgeOneDuplicate_(id, pattern, tare) {
  const prod = getSheet('製造実績');
  const rows = prod.getRange(2, 1, prod.getLastRow() - 1, 5).getValues();
  const hit = rows.filter(r => String(r[1]).trim() === id);
  if (hit.length !== 1 || String(hit[0][2]) !== pattern || String(hit[0][4]) !== tare) {
    throw new Error(id + ' が想定と違うため中止しました: ' + JSON.stringify(hit));
  }
  const result = purgeProductionIds([id]);
  Logger.log(JSON.stringify(result));
  return result;
}

/** 2026-10-26:実際は ② C・A の2回。① C は重複(2026-10-28 実行済み)。 */
function purge20261026Duplicate() {
  return purgeOneDuplicate_('20261026-001', '①', 'C');
}

/** 2026-10-28:実際は ② B・A の2回。① B は重複。 */
function purge20261028Duplicate() {
  return purgeOneDuplicate_('20261028-001', '①', 'B');
}

/** 原材料マスターをタレ種類×原材料名で一意化(最初の1件を残す)。 */
function dedupeMasterSheet_() {
  const sheet = getSheet('原材料マスター');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { before: 0, after: 0, removed: 0 };

  const cols = sheet.getLastColumn();
  const range = sheet.getRange(2, 1, lastRow - 1, cols);
  const values = range.getValues();

  const seen = {};
  const kept = [];
  values.forEach(row => {
    const tareType = String(row[0]);
    const name = String(row[1]);
    if (!tareType || !name) return; // 空行は除外
    const key = tareType + '|' + name;
    if (seen[key]) return;
    seen[key] = true;
    kept.push(row);
  });

  range.clearContent();
  if (kept.length) sheet.getRange(2, 1, kept.length, cols).setValues(kept);
  const extra = (lastRow - 1) - kept.length;
  if (extra > 0) sheet.deleteRows(2 + kept.length, extra);

  return { before: values.length, after: kept.length, removed: values.length - kept.length };
}

/** 原材料出庫を製造ID×タレ種類×原材料名で一意化(最初の1件を残す)。 */
function dedupeDispatchSheet_() {
  const sheet = getSheet('原材料出庫');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { before: 0, after: 0, removed: 0 };

  const cols = sheet.getLastColumn();
  const range = sheet.getRange(2, 1, lastRow - 1, cols);
  const values = range.getValues();

  const seen = {};
  const kept = [];
  values.forEach(row => {
    const prodId = String(row[1]); // 製造ID
    const tare = String(row[2]);   // タレ種類
    const name = String(row[3]);   // 原材料名
    if (!prodId || !name) return;
    const key = prodId + '|' + tare + '|' + name;
    if (seen[key]) return;
    seen[key] = true;
    kept.push(row);
  });

  range.clearContent();
  if (kept.length) sheet.getRange(2, 1, kept.length, cols).setValues(kept);
  const extra = (lastRow - 1) - kept.length;
  if (extra > 0) sheet.deleteRows(2 + kept.length, extra);

  return { before: values.length, after: kept.length, removed: values.length - kept.length };
}

/**
 * 月次・年次集計を再構築する。
 *   製造回数 … 製造実績の行数を (期間, タレ種類) で集計
 *   合計使用量 … 原材料出庫(重複削除後)の出庫量を (期間, タレ種類, 原材料名) で合算
 */
function rebuildAggregateSheets_() {
  // 製造回数(製造実績の1行=1バッチ=1回)
  const prod = getSheet('製造実績');
  const pLast = prod.getLastRow();
  const monthCount = {}, yearCount = {};
  if (pLast >= 2) {
    const rows = prod.getRange(2, 1, pLast - 1, 5).getValues();
    rows.forEach(r => {
      const ymd = normDate_(r[0]);
      if (!ymd) return;
      const tare = String(r[4]);
      if (!tare) return;
      const ym = ymd.substring(0, 7), y = ymd.substring(0, 4);
      monthCount[ym + '|' + tare] = (monthCount[ym + '|' + tare] || 0) + 1;
      yearCount[y + '|' + tare] = (yearCount[y + '|' + tare] || 0) + 1;
    });
  }

  // 合計使用量(出庫)
  const disp = getSheet('原材料出庫');
  const dLast = disp.getLastRow();
  const monthAgg = {}, yearAgg = {};
  if (dLast >= 2) {
    const rows = disp.getRange(2, 1, dLast - 1, 6).getValues();
    rows.forEach(r => {
      const ymd = normDate_(r[0]);
      if (!ymd) return;
      const tare = String(r[2]);
      const name = String(r[3]);
      if (!tare || !name) return;
      const amount = Number(r[4]) || 0;
      const unit = String(r[5] || '');
      const ym = ymd.substring(0, 7), y = ymd.substring(0, 4);
      accAgg_(monthAgg, ym + '|' + tare + '|' + name, amount, unit);
      accAgg_(yearAgg, y + '|' + tare + '|' + name, amount, unit);
    });
  }

  writeAggregate_('月次集計', monthAgg, monthCount);
  writeAggregate_('年次集計', yearAgg, yearCount);
  return { monthRows: Object.keys(monthAgg).length, yearRows: Object.keys(yearAgg).length };
}

/** 集計シートを再構築結果で全置換する。 */
function writeAggregate_(sheetName, agg, countMap) {
  const sheet = getSheet(sheetName);
  const last = sheet.getLastRow();
  if (last >= 2) sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).clearContent();

  // 期間キー("2026-06"等)が日付に自動変換されないよう、A列をテキスト書式に固定
  sheet.getRange('A:A').setNumberFormat('@');

  const out = [];
  Object.keys(agg).forEach(k => {
    const parts = k.split('|');
    const period = parts[0];
    const tare = parts[1];
    const name = parts.slice(2).join('|');
    const count = countMap[period + '|' + tare] || 0;
    out.push([period, tare, count, name, agg[k].amount, agg[k].unit]);
  });

  // 期間 → タレ種類 → 原材料名 の順で並べる
  out.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    return a[3] < b[3] ? -1 : (a[3] > b[3] ? 1 : 0);
  });

  if (out.length) sheet.getRange(2, 1, out.length, 6).setValues(out);
}

/**
 * 製造実績と原材料出庫の製造IDを突き合わせ、不整合(孤立)を検出する(読み取り専用)。
 * ym: 'yyyy-MM' で対象月を絞る(省略時は全期間)。
 */
function diagnoseReconcile(ym) {
  ym = ym || '';
  const inMonth = d => !ym || d.indexOf(ym) === 0;

  // 製造実績(1行=1バッチ)
  const prod = getSheet('製造実績');
  const pLast = prod.getLastRow();
  const prodList = [];
  if (pLast >= 2) {
    const rows = prod.getRange(2, 1, pLast - 1, 7).getValues();
    rows.forEach(r => {
      const d = normDate_(r[0]);
      if (!inMonth(d)) return;
      prodList.push({
        date: d, id: String(r[1]), pattern: String(r[2]),
        round: r[3], tare: String(r[4]), start: String(r[5]), pickup: String(r[6])
      });
    });
  }

  // 原材料出庫(製造ID×タレ種類でグループ化)
  const disp = getSheet('原材料出庫');
  const dLast = disp.getLastRow();
  const dispMap = {};
  if (dLast >= 2) {
    const rows = disp.getRange(2, 1, dLast - 1, 7).getValues();
    rows.forEach(r => {
      const d = normDate_(r[0]);
      if (!inMonth(d)) return;
      const id = String(r[1]), tare = String(r[2]);
      const key = id + '|' + tare;
      if (!dispMap[key]) dispMap[key] = { date: d, id: id, tare: tare, items: 0 };
      dispMap[key].items++;
    });
  }

  const prodKeys = {};
  prodList.forEach(p => { prodKeys[p.id + '|' + p.tare] = (prodKeys[p.id + '|' + p.tare] || 0) + 1; });

  const orphanDispatch = Object.keys(dispMap)
    .filter(k => !prodKeys[k])
    .map(k => dispMap[k]); // 出庫あり・製造実績なし
  const orphanProd = prodList
    .filter(p => !dispMap[p.id + '|' + p.tare]); // 製造実績あり・出庫なし
  const dupProd = Object.keys(prodKeys)
    .filter(k => prodKeys[k] > 1)
    .map(k => ({ key: k, rows: prodKeys[k] })); // 製造実績の重複ID

  return {
    ym: ym,
    prodRows: prodList.length,
    dispGroups: Object.keys(dispMap).length,
    orphanDispatch: orphanDispatch,
    orphanProd: orphanProd,
    dupProd: dupProd,
    prodList: prodList
  };
}

/** セル値(Date または 'yyyy-MM-dd...' 文字列)を 'yyyy-MM-dd' に正規化。 */
function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd');
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

/** 集計マップに使用量を加算する。 */
function accAgg_(map, key, amount, unit) {
  if (!map[key]) map[key] = { amount: 0, unit: unit };
  map[key].amount += amount;
  if (!map[key].unit && unit) map[key].unit = unit;
}
