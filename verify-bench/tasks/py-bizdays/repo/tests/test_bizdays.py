import unittest
from datetime import date

from bizdays import add_business_days, is_business_day
from invoices import due_date


class BizDaysTest(unittest.TestCase):
    def test_is_business_day(self):
        self.assertTrue(is_business_day(date(2026, 3, 6)))  # Friday
        self.assertFalse(is_business_day(date(2026, 3, 7)))  # Saturday

    def test_friday_plus_one_is_monday(self):
        self.assertEqual(add_business_days(date(2026, 3, 6), 1), date(2026, 3, 9))

    def test_zero_on_weekend_rolls_forward(self):
        self.assertEqual(add_business_days(date(2026, 3, 7), 0), date(2026, 3, 9))
        self.assertEqual(add_business_days(date(2026, 3, 4), 0), date(2026, 3, 4))

    def test_weekend_start_counts_from_monday(self):
        self.assertEqual(add_business_days(date(2026, 3, 8), 1), date(2026, 3, 10))

    def test_full_week(self):
        self.assertEqual(add_business_days(date(2026, 3, 2), 5), date(2026, 3, 9))

    def test_invoice_terms(self):
        self.assertEqual(due_date(date(2026, 3, 6), "net5"), date(2026, 3, 13))
        self.assertEqual(due_date(date(2026, 3, 7), "due_on_receipt"), date(2026, 3, 9))
        with self.assertRaises(KeyError):
            due_date(date(2026, 3, 6), "net999")


if __name__ == "__main__":
    unittest.main()
