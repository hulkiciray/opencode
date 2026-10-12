def low_stock(inventory, threshold):
    """SKUs whose on-hand quantity is below threshold, sorted."""
    return sorted(sku for sku, qty in inventory.stock.items() if qty < threshold)


def stock_value(inventory, prices):
    return sum(qty * prices[sku] for sku, qty in inventory.stock.items())
