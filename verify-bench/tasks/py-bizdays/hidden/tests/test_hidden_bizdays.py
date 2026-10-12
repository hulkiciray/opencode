import unittest
from datetime import date

from bizdays import add_business_days, business_days_between, is_business_day
from invoices import due_date

GOOD_FRIDAY = date(2026, 4, 3)
EASTER_MONDAY = date(2026, 4, 6)
HOLS = {GOOD_FRIDAY, EASTER_MONDAY}


class HolidayTest(unittest.TestCase):
    def test_is_business_day_holiday(self):
        self.assertFalse(is_business_day(GOOD_FRIDAY, holidays=HOLS))
        self.assertTrue(is_business_day(GOOD_FRIDAY))

    def test_skips_holidays(self):
        self.assertEqual(add_business_days(date(2026, 4, 2), 1, holidays=HOLS), date(2026, 4, 7))

    def test_zero_on_holiday_rolls_forward(self):
        self.assertEqual(add_business_days(GOOD_FRIDAY, 0, holidays=HOLS), date(2026, 4, 7))

    def test_negative(self):
        self.assertEqual(add_business_days(date(2026, 3, 9), -1), date(2026, 3, 6))
        self.assertEqual(add_business_days(date(2026, 4, 7), -1, holidays=HOLS), date(2026, 4, 2))
        self.assertEqual(add_business_days(date(2026, 3, 13), -5), date(2026, 3, 6))

    def test_negative_from_weekend_rolls_back_first(self):
        self.assertEqual(add_business_days(date(2026, 3, 8), -1), date(2026, 3, 5))

    def test_between(self):
        self.assertEqual(business_days_between(date(2026, 3, 2), date(2026, 3, 9)), 5)
        self.assertEqual(business_days_between(date(2026, 3, 9), date(2026, 3, 2)), -5)
        self.assertEqual(business_days_between(date(2026, 3, 6), date(2026, 3, 6)), 0)
        self.assertEqual(business_days_between(date(2026, 3, 30), date(2026, 4, 10), holidays=HOLS), 7)

    def test_due_date_holidays(self):
        self.assertEqual(due_date(date(2026, 4, 2), "net5", holidays=HOLS), date(2026, 4, 13))
        self.assertEqual(due_date(date(2026, 4, 2), "net5"), date(2026, 4, 9))

    def test_holidays_any_iterable(self):
        self.assertEqual(add_business_days(date(2026, 4, 2), 1, holidays=[GOOD_FRIDAY, EASTER_MONDAY]), date(2026, 4, 7))


if __name__ == "__main__":
    unittest.main()
