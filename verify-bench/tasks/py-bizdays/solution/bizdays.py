from datetime import date, timedelta


def is_business_day(d, holidays=()):
    return d.weekday() < 5 and d not in holidays


def add_business_days(start, n, holidays=()):
    """Return the date n business days after start (before, for negative n).

    The start date first rolls to a business day in the direction of travel.
    """
    holidays = set(holidays)
    step = timedelta(days=1 if n >= 0 else -1)
    d = start
    while not is_business_day(d, holidays):
        d += step
    remaining = abs(n)
    while remaining > 0:
        d += step
        if is_business_day(d, holidays):
            remaining -= 1
    return d


def business_days_between(a, b, holidays=()):
    if b < a:
        return -business_days_between(b, a, holidays)
    holidays = set(holidays)
    return sum(1 for i in range((b - a).days) if is_business_day(a + timedelta(days=i), holidays))
