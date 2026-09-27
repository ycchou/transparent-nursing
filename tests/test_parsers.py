#!/usr/bin/env python3
"""
資料解析器測試：拿 repo 內固定的原始檔（PDF／ODS）跑建置腳本的解析函式，結果必須與
tests/expected/ 下存好的預期值完全相同。

用途：官方檔案格式一變、或改了解析程式，數字若跟著變，測試會立刻失敗，不會悄悄上線。
（例：110/04 官方檔名把「區域醫院」誤植為「區域中心」，就曾讓整月資料漏讀。）

  python -m unittest discover tests            # 跑全部測試
  python tests/test_parsers.py --update         # 確認解析結果「應該」改變時，更新預期值

需要：pdfplumber（人力監控）、odfpy＋pandas（醫院財務）
"""
import importlib.util
import json
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPECTED = os.path.join(ROOT, 'tests', 'expected')
UPDATE = '--update' in sys.argv

# 固定範例：各取一份代表性的原始檔（都已在版控內）
PERSONNEL_PDF = os.path.join(ROOT, 'data', '醫院醫事人力持續性監測', '115年07月',
                             '115年7月份「醫院醫事人力持續性監測結果」(醫學中心).pdf')
NURSE_ODS = os.path.join(ROOT, 'data', 'VPN登錄之各月份三班護病比',
                         '115年7月全民健康保險特約醫院於VPN登錄之各月份急性一般病床三班護病比(公告版).ods')
FIN_ODS = os.path.join(ROOT, 'data', '財務報告醫院醫療服務申報情形', '113年財務報告醫院醫療服務申報情形.ods')


def load_tool(name):
    """載入 tools/<name>.py（檔名有連字號，無法直接 import）"""
    path = os.path.join(ROOT, 'tools', f'{name}.py')
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def check_expected(test, name, actual):
    """與 tests/expected/<name>.json 比對；--update 時改寫預期值"""
    path = os.path.join(EXPECTED, f'{name}.json')
    data = json.loads(json.dumps(actual, ensure_ascii=False))   # 正規化（tuple → list 等）
    if UPDATE or not os.path.exists(path):
        os.makedirs(EXPECTED, exist_ok=True)
        with open(path, 'w', encoding='utf-8') as fp:
            json.dump(data, fp, ensure_ascii=False, indent=1, sort_keys=True)
        return
    with open(path, encoding='utf-8') as fp:
        expected = json.load(fp)
    test.assertEqual(data, expected, f'{name} 的解析結果與 tests/expected/{name}.json 不同'
                     '（若確認是應有的改變，跑 python tests/test_parsers.py --update）')


class PersonnelParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bp = load_tool('build-personnel')

    def test_parse_one_pdf(self):
        status, recs = self.bp.parse_one((PERSONNEL_PDF, '醫學中心', '11507'))
        self.assertEqual(status, 'OK', recs)
        self.assertGreaterEqual(len(recs), 25, '醫學中心應有 25 家以上')
        recs = sorted(recs, key=lambda r: (r['code'], r['branch']))
        check_expected(self, 'personnel-11507-medical-center', recs)

    def test_level_aliases(self):
        # 官方檔名誤植（110/04）也要認得
        self.assertEqual(self.bp.level_of('110年4月份「…」(區域中心).pdf'), '區域醫院')
        self.assertEqual(self.bp.level_of('110年4月份「…」(地區中心).pdf'), '地區醫院')
        self.assertEqual(self.bp.level_of('115年7月份「…」(醫學中心).pdf'), '醫學中心')
        self.assertIsNone(self.bp.level_of('說明.pdf'))

    def test_norm_code_restores_leading_zero(self):
        # PDF 偶爾掉了代碼開頭的 0；沒補回會讓下一家的數字覆蓋到上一家
        self.assertEqual(self.bp.norm_code('145030020'), '0145030020')
        self.assertEqual(self.bp.norm_code('1132070011'), '1132070011')
        self.assertIsNone(self.bp.norm_code('醫院'))

    def test_month_key(self):
        self.assertEqual(self.bp.month_key('115年07月'), '11507')
        self.assertEqual(self.bp.month_key('108年7月'), '10807')


class NurseRatioParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bn = load_tool('build-nurse-ratio')

    def test_parse_ods(self):
        rows = self.bn.parseOds(NURSE_ODS)
        hosp = self.bn.extractHospitalRatios(rows)
        self.assertGreaterEqual(len(hosp), 400, '每月應有 400 家以上醫院')
        # 回傳以 (機構代號, 院區) 為鍵的 dict；轉成排序後的清單才能存成 JSON 比對
        recs = [{'code': c, 'branch': b, **v} for (c, b), v in sorted(hosp.items())]
        check_expected(self, 'nurse-ratio-11507', recs)

    def test_filename_to_month(self):
        self.assertEqual(self.bn.rocFilenameToKey('115年7月全民健康保險…三班護病比(公告版).ods'), '11507')
        self.assertEqual(self.bn.rocFilenameToKey('112年12月…ods'), '11212')
        self.assertIsNone(self.bn.rocFilenameToKey('說明.ods'))


class FinancialsParser(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bf = load_tool('build-financials')

    def test_parse_ods(self):
        rows = self.bf.parse_ods(FIN_ODS, '113')
        self.assertGreaterEqual(len(rows), 200, '年度報表應有 200 家以上醫院')
        rows = sorted(rows, key=lambda r: r.get('code', ''))
        check_expected(self, 'financials-113', rows)


class FetchAndImport(unittest.TestCase):
    def test_fetch_personnel_level_aliases(self):
        fp = load_tool('fetch-personnel')
        files = ['(醫學中心).pdf', '(區域中心).pdf', '(地區中心).pdf']
        self.assertTrue(all(fp.has_level(files, lv) for lv in fp.LEVELS))
        self.assertFalse(fp.has_level(['(醫學中心).pdf'], '地區醫院'))

    def test_update_data_roc_slash(self):
        ud = load_tool('update-data')
        self.assertEqual(ud.roc_slash('115年07月'), '115/07')
        self.assertEqual(ud.roc_slash('11507'), '115/07')


if __name__ == '__main__':
    argv = [a for a in sys.argv if a != '--update']
    unittest.main(argv=argv)
