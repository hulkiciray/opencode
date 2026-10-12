import unittest

from inventory import InsufficientStock, Inventory
from orders import OrderService
from reports import low_stock, stock_value


def setup():
    inv = Inventory()
    inv.add_stock("apple", 10)
    inv.add_stock("pear", 3)
    return inv, OrderService(inv)


class ReservationTest(unittest.TestCase):
    def test_create_reserves(self):
        inv, svc = setup()
        svc.create_order({"apple": 4})
        self.assertEqual(inv.available("apple"), 6)
        self.assertEqual(inv.stock["apple"], 10)

    def test_oversell_rejected_atomically(self):
        inv, svc = setup()
        svc.create_order({"pear": 2})
        with self.assertRaises(InsufficientStock):
            svc.create_order({"apple": 1, "pear": 2})
        self.assertEqual(inv.available("apple"), 10)
        self.assertEqual(inv.available("pear"), 1)
        self.assertEqual(len(svc.orders), 1)

    def test_cancel_releases(self):
        inv, svc = setup()
        order = svc.create_order({"pear": 3})
        self.assertEqual(inv.available("pear"), 0)
        svc.cancel(order.id)
        self.assertEqual(inv.available("pear"), 3)
        self.assertEqual(inv.stock["pear"], 3)

    def test_fulfill_converts_reservation(self):
        inv, svc = setup()
        a = svc.create_order({"apple": 4})
        svc.create_order({"apple": 5})
        svc.fulfill(a.id)
        self.assertEqual(inv.stock["apple"], 6)
        self.assertEqual(inv.available("apple"), 1)

    def test_reports_use_on_hand(self):
        inv, svc = setup()
        svc.create_order({"apple": 8})
        self.assertEqual(low_stock(inv, 5), ["pear"])
        self.assertEqual(stock_value(inv, {"apple": 2, "pear": 10}), 50)

    def test_unknown_sku(self):
        inv, svc = setup()
        with self.assertRaises(InsufficientStock):
            svc.create_order({"kiwi": 1})
        self.assertEqual(svc.orders, {})


if __name__ == "__main__":
    unittest.main()
