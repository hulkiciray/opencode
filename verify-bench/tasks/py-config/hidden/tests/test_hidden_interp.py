import unittest

from config import ConfigError, parse


class InterpolationTest(unittest.TestCase):
    def test_simple(self):
        self.assertEqual(parse("host = ${HOST}\n", env={"HOST": "db1"})[""]["host"], "db1")

    def test_inside_text_and_quotes(self):
        cfg = parse('url = "postgres://${USER}@${HOST}/x"\n', env={"USER": "u", "HOST": "h"})
        self.assertEqual(cfg[""]["url"], "postgres://u@h/x")

    def test_default(self):
        self.assertEqual(parse("p = ${PORT:-5432}\n", env={})[""]["p"], "5432")
        self.assertEqual(parse("p = ${PORT:-5432}\n", env={"PORT": ""})[""]["p"], "5432")
        self.assertEqual(parse("p = ${PORT:-5432}\n", env={"PORT": "1"})[""]["p"], "1")

    def test_empty_default(self):
        self.assertEqual(parse("p = x${NOPE:-}y\n", env={})[""]["p"], "xy")

    def test_missing_raises_with_name_and_line(self):
        with self.assertRaises(ConfigError) as ctx:
            parse("a = 1\nb = ${SECRET}\n", env={})
        self.assertIn("SECRET", str(ctx.exception))
        self.assertIn("line 2", str(ctx.exception))

    def test_escape(self):
        self.assertEqual(parse("t = $${HOME}\n", env={})[""]["t"], "${HOME}")

    def test_comments_not_interpolated(self):
        cfg = parse("# ${MISSING}\na = 1 # ${MISSING}\n", env={})
        self.assertEqual(cfg[""]["a"], "1")

    def test_value_with_hash_from_env_is_not_a_comment(self):
        self.assertEqual(parse("c = ${C}\n", env={"C": "x #y"})[""]["c"], "x #y")

    def test_keys_not_interpolated(self):
        self.assertEqual(parse("${K} = v\n", env={"K": "z"})[""], {"${K}": "v"})

    def test_default_uses_os_environ(self):
        import os

        os.environ["APPCONFIG_TEST_VAR"] = "yes"
        try:
            self.assertEqual(parse("v = ${APPCONFIG_TEST_VAR}\n")[""]["v"], "yes")
        finally:
            del os.environ["APPCONFIG_TEST_VAR"]


if __name__ == "__main__":
    unittest.main()
