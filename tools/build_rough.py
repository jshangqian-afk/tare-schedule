"""index.html からテスト版(ラフ)を作る。GAS への通信を偽物に差し替え、本番のシートには何も送らない。

使い方: python3 tools/build_rough.py <出力先.html>
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
src = (ROOT / 'index.html').read_text(encoding='utf-8')

# 公開時に枠(doctype/head/body)が付くので、元の枠は外す
src = re.sub(r'<!DOCTYPE html>\s*', '', src, flags=re.I)
src = re.sub(r'</?html[^>]*>\s*', '', src)
src = re.sub(r'</?head>\s*', '', src)
src = re.sub(r'</?body>\s*', '', src)
src = re.sub(r'<meta name="viewport"[^>]*>\s*', '', src)
src = src.replace('<title>タレ製造スケジュール - KimFoods</title>', '<title>タレ製造 テスト版</title>')

BANNER = """
<style>
  .rough-bar {
    background: #FEF3C7; color: #78350F; border-bottom: 1px solid #F59E0B;
    padding: 10px 24px; font-size: 15px; line-height: 1.5;
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  }
  .rough-bar strong { font-size: 16px; }
  .rough-bar .rough-tools { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
  .rough-bar button {
    min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid #D97706;
    background: white; color: #78350F; font-size: 14px; font-weight: 600; cursor: pointer;
  }
</style>
<div class="rough-bar">
  <strong>テスト版</strong>
  <span>「記録する」を押しても本番のシートには記録されません。通信は約2秒かかるようにしてあります。</span>
  <span class="rough-tools">
    <button type="button" id="rough-stale">前の日の時刻表にする</button>
    <button type="button" id="rough-clear">記録済みの履歴を消す</button>
  </span>
</div>
"""

MOCK = """
<script>
  // テスト版:GAS への通信を偽物に差し替える(本番には送らない)
  (function () {
    const realFetch = window.fetch.bind(window);
    let n = 0;
    window.fetch = function (url, opts) {
      if (String(url).indexOf('script.google.com') === -1) return realFetch(url, opts);
      const isPost = opts && opts.method === 'POST';
      return new Promise(resolve => setTimeout(() => {
        let body = { success: true, data: { A: [], B: [], C: [] } };
        if (isPost) {
          const req = JSON.parse(opts.body);
          const d = String(req.productionDate || '').replace(/-/g, '');
          body = { success: true, productionIds: (req.tareTypes || []).map(() => d + '-T' + String(++n).padStart(2, '0')) };
        }
        resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
      }, isPost ? 2000 : 400));
    };
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('rough-stale').addEventListener('click', () => {
        try {
          const s = JSON.parse(localStorage.getItem('tare_schedule') || 'null');
          if (!s) return;
          s.createdOn = '2000-01-01';
          localStorage.setItem('tare_schedule', JSON.stringify(s));
          location.reload();
        } catch (e) { /* 保存できない環境では何もしない */ }
      });
      document.getElementById('rough-clear').addEventListener('click', () => {
        try { localStorage.removeItem('tare_submitted'); } catch (e) { /* 同上 */ }
      });
    });
  })();
</script>
"""

src = src.replace('<!-- メイン画面 -->', BANNER + '\n<!-- メイン画面 -->', 1)
src = src.replace("<script>\n  'use strict';", MOCK + "\n<script>\n  'use strict';", 1)
assert 'rough-bar' in src and 'テスト版:GAS' in src

out = Path(sys.argv[1])
out.write_text(src, encoding='utf-8')
print('wrote', out, len(src), 'bytes')
