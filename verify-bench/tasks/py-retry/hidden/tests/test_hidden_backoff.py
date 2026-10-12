import unittest

from retry import retry
from tests.test_retry import Flaky


class BackoffTest(unittest.TestCase):
    def test_exponential(self):
        slept = []
        retry(5, delay=1, backoff=2, sleep=slept.append)(Flaky(4))()
        self.assertEqual(slept, [1, 2, 4, 8])

    def test_max_delay(self):
        slept = []
        retry(5, delay=1, backoff=3, max_delay=5, sleep=slept.append)(Flaky(4))()
        self.assertEqual(slept, [1, 3, 5, 5])

    def test_jitter(self):
        slept = []
        values = iter([0.0, 0.5, 0.999999])
        retry(4, delay=2, jitter=0.5, rng=lambda: next(values), sleep=slept.append)(Flaky(3))()
        self.assertAlmostEqual(slept[0], 1.0)
        self.assertAlmostEqual(slept[1], 2.0)
        self.assertAlmostEqual(slept[2], 3.0, places=4)

    def test_jitter_after_cap(self):
        slept = []
        retry(3, delay=10, backoff=2, max_delay=10, jitter=0.1, rng=lambda: 1.0 - 1e-12, sleep=slept.append)(Flaky(2))()
        self.assertAlmostEqual(slept[1], 11.0, places=4)

    def test_on_retry(self):
        calls = []
        retry(3, delay=1, backoff=2, sleep=lambda s: None, on_retry=lambda a, e, w: calls.append((a, str(e), w)))(Flaky(2))()
        self.assertEqual(calls, [(1, "fail 1", 1), (2, "fail 2", 2)])

    def test_on_retry_not_called_after_last(self):
        calls = []
        with self.assertRaises(ValueError):
            retry(2, sleep=lambda s: None, on_retry=lambda *a: calls.append(a))(Flaky(5))()
        self.assertEqual(len(calls), 1)

    def test_validation(self):
        for kwargs in ({"backoff": 0.5}, {"jitter": -0.1}, {"jitter": 1.5}, {"max_delay": 0}):
            with self.assertRaises(ValueError):
                retry(3, **kwargs)

    def test_defaults_unchanged(self):
        slept = []
        retry(3, delay=0.5, sleep=slept.append)(Flaky(2))()
        self.assertEqual(slept, [0.5, 0.5])


if __name__ == "__main__":
    unittest.main()
