from bizdays import add_business_days

TERMS = {"net5": 5, "net10": 10, "due_on_receipt": 0}


def due_date(issued, terms):
    if terms not in TERMS:
        raise KeyError(f"unknown terms: {terms}")
    return add_business_days(issued, TERMS[terms])
