import functools
import random
import time


def retry(times, exceptions=(Exception,), delay=0.0, sleep=time.sleep, backoff=1, max_delay=None, jitter=0.0, rng=random.random, on_retry=None):
    """Call the function up to `times` times while it raises one of `exceptions`.

    Waits delay * backoff**(k-1) seconds (capped by max_delay, then jittered)
    between attempts. Re-raises the last exception when all attempts fail.
    Other exceptions propagate immediately.
    """
    if times < 1:
        raise ValueError("times must be >= 1")
    if backoff < 1:
        raise ValueError("backoff must be >= 1")
    if not 0 <= jitter <= 1:
        raise ValueError("jitter must be in [0, 1]")
    if max_delay is not None and max_delay <= 0:
        raise ValueError("max_delay must be > 0")

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions as exc:
                    if attempt == times:
                        raise
                    wait = delay * backoff ** (attempt - 1)
                    if max_delay is not None:
                        wait = min(wait, max_delay)
                    if jitter:
                        wait *= 1 - jitter + 2 * jitter * rng()
                    if on_retry:
                        on_retry(attempt, exc, wait)
                    if wait:
                        sleep(wait)

        return wrapper

    return decorator
