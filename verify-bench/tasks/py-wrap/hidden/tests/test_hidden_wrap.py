import unittest

from wrap import wrap


class ParagraphUrlTest(unittest.TestCase):
    def test_paragraphs(self):
        self.assertEqual(wrap("one two\n\nthree", 20), ["one two", "", "three"])

    def test_multiple_blank_lines_collapse(self):
        self.assertEqual(wrap("a\n\n\n  \n\nb", 20), ["a", "", "b"])

    def test_no_leading_or_trailing_blank(self):
        self.assertEqual(wrap("\n\n a \n\n", 20), ["a"])

    def test_single_newline_still_joins(self):
        self.assertEqual(wrap("a\nb\n\nc\nd", 20), ["a b", "", "c d"])

    def test_paragraph_wrapping(self):
        self.assertEqual(wrap("aaa bbb ccc\n\nddd eee", 7), ["aaa bbb", "ccc", "", "ddd eee"])

    def test_long_url_own_line(self):
        url = "https://example.com/a/very/long/path"
        self.assertEqual(wrap(f"see {url} now", 10), ["see", url, "now"])

    def test_short_url_wraps_normally(self):
        self.assertEqual(wrap("go http://a.io ok", 20), ["go http://a.io ok"])

    def test_non_url_long_words_still_split(self):
        self.assertEqual(wrap("ftp://abcdefgh", 5), ["ftp:/", "/abcd", "efgh"])


if __name__ == "__main__":
    unittest.main()
