import unittest

from config import ConfigError, parse


class ParseTest(unittest.TestCase):
    def test_sections_and_root(self):
        cfg = parse("name = app\n[db]\nhost = localhost\nport = 5432\n")
        self.assertEqual(cfg, {"": {"name": "app"}, "db": {"host": "localhost", "port": "5432"}})

    def test_comments(self):
        cfg = parse("# comment\n; other\n[a]\nx = 1 # trailing\ny = 2 ; trailing\n")
        self.assertEqual(cfg["a"], {"x": "1", "y": "2"})

    def test_hash_without_space_is_kept(self):
        self.assertEqual(parse("color = #fff\nurl = a#b\n")[""], {"color": "", "url": "a#b"})

    def test_quoted_values_keep_comment_chars_and_spaces(self):
        cfg = parse('msg = "  hello # not a comment ; nope "\n')
        self.assertEqual(cfg[""]["msg"], "  hello # not a comment ; nope ")

    def test_last_key_wins(self):
        self.assertEqual(parse("a = 1\na = 2\n")[""]["a"], "2")

    def test_equals_in_value(self):
        self.assertEqual(parse("q = a=b\n")[""]["q"], "a=b")

    def test_errors_have_line_numbers(self):
        with self.assertRaisesRegex(ConfigError, "line 2"):
            parse("a = 1\nbroken\n")
        with self.assertRaisesRegex(ConfigError, "line 1"):
            parse("[oops\n")


if __name__ == "__main__":
    unittest.main()
