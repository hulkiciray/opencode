import functools
import time


def retry(times, exceptions=(Exception,), delay=0.0, sleep=time.sleep):
    """Call the function up to `times` times while it raises one of `exceptions`.

    Waits `delay` seconds between attempts. Re-raises the last exception when
    all attempts fail. Other exceptions propagate immediately.
    """
    if times < 1:
        raise ValueError("times must be >= 1")

    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, times + 1):
                try:
                    return fn(*args, **kwargs)
                except exceptions:
                    if attempt == times:
                        raise
                    if delay:
                        sleep(delay)

        return wrapper

    return decorator
