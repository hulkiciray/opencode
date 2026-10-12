class InsufficientStock(Exception):
    def __init__(self, sku, requested, available):
        super().__init__(f"{sku}: requested {requested}, available {available}")
        self.sku = sku
        self.requested = requested
        self.available = available


class Inventory:
    def __init__(self):
        self.stock = {}  # sku -> on-hand quantity
        self.reserved = {}  # sku -> reserved quantity

    def add_stock(self, sku, qty):
        if qty <= 0:
            raise ValueError("qty must be positive")
        self.stock[sku] = self.stock.get(sku, 0) + qty

    def remove_stock(self, sku, qty):
        have = self.stock.get(sku, 0)
        if qty > have:
            raise InsufficientStock(sku, qty, have)
        self.stock[sku] = have - qty

    def available(self, sku):
        return self.stock.get(sku, 0) - self.reserved.get(sku, 0)

    def reserve(self, items):
        for sku, qty in items.items():
            if qty > self.available(sku):
                raise InsufficientStock(sku, qty, self.available(sku))
        for sku, qty in items.items():
            self.reserved[sku] = self.reserved.get(sku, 0) + qty

    def release(self, items):
        for sku, qty in items.items():
            self.reserved[sku] -= qty

    def commit(self, items):
        self.release(items)
        for sku, qty in items.items():
            self.remove_stock(sku, qty)
