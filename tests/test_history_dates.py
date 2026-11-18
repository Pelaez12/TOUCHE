import sys
import unittest
from datetime import date,datetime
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'scripts'))
from history_dates import reconcile

class DateReconciliationTests(unittest.TestCase):
    cutoff=date(2026,10,27)
    def dates(self,value,header):return reconcile(value,header,self.cutoff)
    def test_annual_year_uses_authorized_2025_column(self):
        self.assertEqual(self.dates(datetime(2026,12,19),2025)['dates'],['2025-12-19'])
    def test_multiple_days_are_separate_visits(self):
        self.assertEqual(self.dates('2, 17, 31',datetime(2026,1,1))['dates'],['2026-01-02','2026-01-17','2026-01-31'])
        self.assertEqual(self.dates('4, 29 Jun',datetime(2026,6,1))['dates'],['2026-06-04','2026-06-29'])
    def test_september_header_typo_keeps_complete_real_date(self):
        self.assertEqual(self.dates(datetime(2026,9,19),datetime(2020,9,1))['dates'],['2026-09-19'])
    def test_complete_date_takes_precedence_over_month_position(self):
        self.assertEqual(self.dates(datetime(2026,3,28),datetime(2026,2,1))['dates'],['2026-03-28'])
    def test_explicit_months_and_annual_day_month(self):
        self.assertEqual(self.dates('17 0CT',2025)['dates'],['2025-10-17'])
        self.assertEqual(self.dates('23 12',2025)['dates'],['2025-12-23'])
        self.assertEqual(self.dates('5, 26 Set',datetime(2026,9,1))['dates'],['2026-09-05','2026-09-26'])
    def test_unknown_day_future_or_invalid_date_stays_pending(self):
        for value,header in [('|5 oct',datetime(2026,10,1)),('PATRICIA',datetime(2026,2,1)),(datetime(2026,12,16),datetime(2026,1,1)),('31 Feb',datetime(2026,2,1)),('1, 29 Oct',datetime(2026,10,1))]:
            result=self.dates(value,header)
            self.assertEqual(result['dates'],[])
            self.assertTrue(result['error'])
    def test_window_boundaries(self):
        self.assertEqual(self.dates(datetime(2026,10,27),datetime(2026,10,1))['dates'],['2026-10-27'])
        self.assertFalse(self.dates(datetime(2024,1,1),datetime(2026,1,1))['dates'])

if __name__=='__main__':unittest.main()
