import unittest

from retry import retry


class Flaky:
    def __init__(self, failures, exc=ValueError):
        self.failures = failures
        self.calls = 0
        self.exc = exc

    def __call__(self, x=1):
        self.calls += 1
        if self.calls <= self.failures:
            raise self.exc(f"fail {self.calls}")
        return x * 2


class RetryTest(unittest.TestCase):
    def test_succeeds_after_failures(self):
        f = Flaky(2)
        self.assertEqual(retry(3)(f)(5), 10)
        self.assertEqual(f.calls, 3)

    def test_reraises_last(self):
        f = Flaky(5)
        with self.assertRaisesRegex(ValueError, "fail 3"):
            retry(3)(f)()
        self.assertEqual(f.calls, 3)

    def test_other_exceptions_propagate_immediately(self):
        f = Flaky(5, exc=KeyError)
        with self.assertRaises(KeyError):
            retry(3, exceptions=(ValueError,))(f)()
        self.assertEqual(f.calls, 1)

    def test_constant_delay(self):
        slept = []
        retry(4, delay=0.5, sleep=slept.append)(Flaky(3))()
        self.assertEqual(slept, [0.5, 0.5, 0.5])

    def test_no_sleep_after_last_attempt(self):
        slept = []
        with self.assertRaises(ValueError):
            retry(2, delay=1, sleep=slept.append)(Flaky(5))()
        self.assertEqual(slept, [1])

    def test_wraps(self):
        @retry(2)
        def hello():
            """doc"""

        self.assertEqual(hello.__name__, "hello")
        self.assertEqual(hello.__doc__, "doc")

    def test_bad_times(self):
        with self.assertRaises(ValueError):
            retry(0)


if __name__ == "__main__":
    unittest.main()
