from datetime import date, timedelta


def is_business_day(d):
    return d.weekday() < 5


def add_business_days(start, n):
    """Return the date n business days after start.

    n == 0 returns start if it is a business day, otherwise the next business day.
    """
    if n < 0:
        raise ValueError("n must be >= 0")
    d = start
    while not is_business_day(d):
        d += timedelta(days=1)
    while n > 0:
        d += timedelta(days=1)
        if is_business_day(d):
            n -= 1
    return d
