require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const demoCustomers = [
  { id: 101, name: "Aarav Naik", email: "aarav@example.com", phone: "+91 90000 10001", ordersCount: 2 },
  { id: 102, name: "Mira Kamat", email: "mira@example.com", phone: "+91 90000 10002", ordersCount: 1 },
  { id: 103, name: "Rohan Dessai", email: "rohan@example.com", phone: "+91 90000 10003", ordersCount: 3 },
  { id: 104, name: "Anaya Prabhu", email: "anaya@example.com", phone: "+91 90000 10004", ordersCount: 1 }
];

const demoOrders = [
  { id: 5001, customer_id: 101, customer_name: "Aarav Naik", status: "processing", total: "₹1,499.00", date_created: "2026-10-14T10:15:00", line_items: [{ name: "Wireless Headphones", quantity: 1 }] },
  { id: 5002, customer_id: 102, customer_name: "Mira Kamat", status: "completed", total: "₹899.00", date_created: "2026-10-13T12:30:00", line_items: [{ name: "Desk Lamp", quantity: 1 }] },
  { id: 5003, customer_id: 103, customer_name: "Rohan Dessai", status: "on-hold", total: "₹2,199.00", date_created: "2026-10-12T09:10:00", line_items: [{ name: "Keyboard", quantity: 1 }] },
  { id: 5004, customer_id: 101, customer_name: "Aarav Naik", status: "completed", total: "₹499.00", date_created: "2026-10-08T14:45:00", line_items: [{ name: "Mouse Pad", quantity: 1 }] },
  { id: 5005, customer_id: 104, customer_name: "Anaya Prabhu", status: "cancelled", total: "₹699.00", date_created: "2026-10-07T16:20:00", line_items: [{ name: "Water Bottle", quantity: 1 }] }
];

function wcConfigured() {
  return Boolean(process.env.WC_STORE_URL && process.env.WC_CONSUMER_KEY && process.env.WC_CONSUMER_SECRET);
}

async function wcGet(resource) {
  const root = process.env.WC_STORE_URL.replace(/\/+$/, "");
  const url = `${root}/wp-json/wc/v3/${resource}`;
  const auth = Buffer.from(`${process.env.WC_CONSUMER_KEY}:${process.env.WC_CONSUMER_SECRET}`).toString("base64");
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WooCommerce returned ${response.status}: ${body.slice(0, 180)}`);
  }
  return response.json();
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, mode: wcConfigured() ? "woocommerce-configured" : "demo-data", message: "ShopConnect CRM backend is running." });
});

app.get("/api/customers", async (req, res) => {
  try {
    if (wcConfigured()) {
      const data = await wcGet("customers?per_page=100");
      return res.json(data.map(c => ({
        id: c.id, name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed customer",
        email: c.email || "", phone: c.billing?.phone || "", ordersCount: c.orders_count || 0
      })));
    }
    res.json(demoCustomers);
  } catch (error) {
    res.status(502).json({ error: "Could not fetch WooCommerce customers.", detail: error.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    if (wcConfigured()) {
      const [orders, customers] = await Promise.all([
        wcGet("orders?per_page=100"),
        wcGet("customers?per_page=100")
      ]);
      const customerMap = new Map(customers.map(c => [c.id, `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || "Guest customer"]));
      return res.json(orders.map(o => ({
        id: o.id, customer_id: o.customer_id,
        customer_name: customerMap.get(o.customer_id) || o.billing?.email || "Guest customer",
        status: o.status, total: `${o.currency || ""} ${o.total || "0"}`.trim(),
        date_created: o.date_created, line_items: (o.line_items || []).map(item => ({ name: item.name, quantity: item.quantity }))
      })));
    }
    res.json(demoOrders);
  } catch (error) {
    res.status(502).json({ error: "Could not fetch WooCommerce orders.", detail: error.message });
  }
});

app.post("/api/sync", async (req, res) => {
  if (!wcConfigured()) {
    return res.json({
      ok: true, mode: "demo-data",
      message: "Demo mode is active. Add WC_STORE_URL, WC_CONSUMER_KEY and WC_CONSUMER_SECRET to .env to sync a real WooCommerce store."
    });
  }
  try {
    const [customers, orders] = await Promise.all([
      wcGet("customers?per_page=100"),
      wcGet("orders?per_page=100")
    ]);
    res.json({ ok: true, mode: "woocommerce-configured", customersFetched: customers.length, ordersFetched: orders.length, message: "Fetched current records from WooCommerce. This starter displays them live; persistent database sync is a next step." });
  } catch (error) {
    res.status(502).json({ ok: false, error: "Sync failed. Check the store URL, API keys, permissions and network.", detail: error.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    if (wcConfigured()) {
      const o = await wcGet(`orders/${encodeURIComponent(req.params.id)}`);
      return res.json(o);
    }
    const order = demoOrders.find(o => String(o.id) === String(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found in demo data." });
    res.json(order);
  } catch (error) {
    res.status(502).json({ error: "Could not fetch order.", detail: error.message });
  }
});

app.post("/api/ai-assist", (req, res) => {
  const complaint = String(req.body.complaint || "").trim();
  const orderId = String(req.body.orderId || "").trim();
  if (!complaint) return res.status(400).json({ error: "Please enter a customer complaint." });

  const text = complaint.toLowerCase();
  let category = "General enquiry";
  if (/refund|return|money back|reimburse/.test(text)) category = "Refund / return";
  else if (/damaged|broken|cracked|defective/.test(text)) category = "Damaged product";
  else if (/wrong item|incorrect item|wrong product/.test(text)) category = "Wrong item";
  else if (/late|delay|delayed|not arrived|delivery|tracking|delivered but|never received|missing/.test(text)) category = "Delivery issue";

  const urgent = /never received|not received|delivered but|fraud|charged twice|damaged|urgent|three days|3 days/.test(text);
  const priority = urgent ? "High" : (/refund|return|late|delay|delayed|tracking/.test(text) ? "Medium" : "Low");
  const summary = `Customer reported a ${category.toLowerCase()}${orderId ? ` related to order #${orderId}` : ""}. Review the order details and confirm the next step with the customer.`;
  const reply = category === "Delivery issue"
    ? "We're sorry your delivery has not gone as expected. We will review the latest order status and investigate the issue. Our support team will update you as soon as we have confirmed information."
    : category === "Refund / return"
    ? "We're sorry for the inconvenience. We will review your order and the applicable return/refund details, then let you know the next steps."
    : category === "Damaged product"
    ? "We're sorry your item arrived damaged. Please share a photo if possible, and we will review the order and help with the available resolution."
    : "Thank you for contacting us. We have recorded your concern and our support team will review it and get back to you.";

  res.json({
    mode: "rule-based-demo",
    category, priority, summary, suggestedReply: reply,
    proposedAction: priority === "High" ? "Flag for human review and prioritise the ticket." : "Add to the support queue for review.",
    requiresHumanApproval: true,
    notice: "This starter uses transparent demo rules, not a live generative AI model. Describe it accurately in your presentation."
  });
});

app.listen(PORT, () => {
  console.log(`ShopConnect CRM running at http://localhost:${PORT}`);
  console.log(`Mode: ${wcConfigured() ? "WooCommerce integration configured" : "demo data (no store credentials needed)"}`);
});
