import unittest

from inventory import InsufficientStock, Inventory
from orders import OrderError, OrderService
from reports import low_stock, stock_value


def setup():
    inv = Inventory()
    inv.add_stock("apple", 10)
    inv.add_stock("pear", 3)
    return inv, OrderService(inv)


class ShopTest(unittest.TestCase):
    def test_fulfill_deducts(self):
        inv, svc = setup()
        order = svc.create_order({"apple": 4})
        svc.fulfill(order.id)
        self.assertEqual(order.status, "fulfilled")
        self.assertEqual(inv.available("apple"), 6)
        self.assertEqual(inv.stock["apple"], 6)

    def test_cancel(self):
        inv, svc = setup()
        order = svc.create_order({"pear": 1})
        svc.cancel(order.id)
        self.assertEqual(order.status, "cancelled")
        with self.assertRaises(OrderError):
            svc.fulfill(order.id)

    def test_bad_orders(self):
        _, svc = setup()
        with self.assertRaises(OrderError):
            svc.create_order({})
        with self.assertRaises(OrderError):
            svc.create_order({"apple": 0})
        with self.assertRaises(OrderError):
            svc.fulfill(999)

    def test_remove_stock_errors(self):
        inv, _ = setup()
        with self.assertRaises(InsufficientStock) as ctx:
            inv.remove_stock("pear", 5)
        self.assertEqual(ctx.exception.available, 3)

    def test_reports(self):
        inv, svc = setup()
        self.assertEqual(low_stock(inv, 5), ["pear"])
        self.assertEqual(stock_value(inv, {"apple": 2, "pear": 10}), 50)


if __name__ == "__main__":
    unittest.main()
