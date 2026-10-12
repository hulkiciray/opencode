import itertools

from inventory import Inventory


class OrderError(Exception):
    pass


class Order:
    def __init__(self, order_id, items):
        self.id = order_id
        self.items = dict(items)  # sku -> qty
        self.status = "pending"


class OrderService:
    def __init__(self, inventory: Inventory):
        self.inventory = inventory
        self.orders = {}
        self._ids = itertools.count(1)

    def create_order(self, items):
        if not items or any(q <= 0 for q in items.values()):
            raise OrderError("order needs positive quantities")
        order = Order(next(self._ids), items)
        self.orders[order.id] = order
        return order

    def fulfill(self, order_id):
        order = self._get(order_id, "pending")
        for sku, qty in order.items.items():
            self.inventory.remove_stock(sku, qty)
        order.status = "fulfilled"
        return order

    def cancel(self, order_id):
        order = self._get(order_id, "pending")
        order.status = "cancelled"
        return order

    def _get(self, order_id, status):
        order = self.orders.get(order_id)
        if order is None:
            raise OrderError(f"no order {order_id}")
        if order.status != status:
            raise OrderError(f"order {order_id} is {order.status}")
        return order
