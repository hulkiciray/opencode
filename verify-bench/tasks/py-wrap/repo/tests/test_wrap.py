import unittest

from wrap import wrap


class WrapTest(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(wrap("the quick brown fox", 10), ["the quick", "brown fox"])

    def test_exact_width(self):
        self.assertEqual(wrap("aaaa bbbb", 9), ["aaaa bbbb"])

    def test_collapses_whitespace_and_single_newlines(self):
        self.assertEqual(wrap("  a\tb \n c  ", 20), ["a b c"])

    def test_long_words_split(self):
        self.assertEqual(wrap("abcdefghij xy", 4), ["abcd", "efgh", "ij", "xy"])
        self.assertEqual(wrap("hi abcdefgh", 4), ["hi", "abcd", "efgh"])

    def test_empty(self):
        self.assertEqual(wrap("", 10), [])
        self.assertEqual(wrap("   \n  ", 10), [])

    def test_bad_width(self):
        with self.assertRaises(ValueError):
            wrap("x", 0)


if __name__ == "__main__":
    unittest.main()
