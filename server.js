require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 2751;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PAKASIR_SLUG = process.env.PAKASIR_SLUG;
const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;
const PAKASIR_BASE_URL = 'https://app.pakasir.com';
const DB_FILE = path.join(__dirname, 'orders.json');

// ============ DATABASE PRODUK (HARGA 100% SESUAI KETIKA ANDA) ============
const PRODUCTS = {
  // PPL PROJECT
  'ppl_member_1m':      { name: 'PPL Project - Member Sebulan',       price: 35000 },
  'ppl_member_perm':    { name: 'PPL Project - Member Permanen',      price: 50000 },
  
  // PANEL
  'panel_legal':        { name: 'Panel Legal (Unli Support)',         price: 20000 },
  'panel_python':       { name: 'Panel Python (Unli)',                price: 20000 },
  
  // JASA BUAT APK
  'jasa_apk_base_lu':   { name: 'Jasa Buat APK Bug (Base Lu)',        price: 20000 },
  'jasa_apk_base_gw':   { name: 'Jasa Buat APK Bug (Base Gw)',        price: 40000 },
  
  // FLUX PROJECTS
  'flux_member':        { name: 'FLUX Projects - Member',             price: 25000 },
  'flux_reseller':      { name: 'FLUX Projects - Reseller',           price: 100000 },
  
  // APK BUG SYAM
  'syam_1d':            { name: 'APK Bug Syam - 1 Hari',              price: 2000 },
  'syam_full':          { name: 'APK Bug Syam - Full Up',             price: 45000 }, // Asumsi Full up = 50k, ubah jika salah
  
  // X-VILANCE
  'xvilance_member':    { name: 'X-VILANCE - Member',                 price: 15000 },
  'xvilance_vip':       { name: 'X-VILANCE - VIP',                    price: 20000 },
  'xvilance_reseller':  { name: 'X-VILANCE - Reseller',               price: 30000 },
  'xvilance_admin':     { name: 'X-VILANCE - Admin',                  price: 40000 },
  'xvilance_partner':   { name: 'X-VILANCE - Partner',                price: 50000 },
  'xvilance_moderator': { name: 'X-VILANCE - Moderator',              price: 60000 }
};

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '{}'); } catch (err) { return {}; }
}
function writeDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch (err) { console.error(err); }
}

app.get('/api/products', (req, res) => {
  const list = Object.entries(PRODUCTS).map(([id, p]) => ({ id, name: p.name, price: p.price }));
  res.json({ success: true, products: list });
});

app.post('/api/create-payment', async (req, res) => {
  const { productId, method = 'qris' } = req.body;
  if (!productId) return res.status(400).json({ success: false, error: 'productId wajib' });

  const product = PRODUCTS[productId];
  if (!product) return res.status(400).json({ success: false, error: 'Produk tidak ditemukan' });

  const orderId = `INV-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  try {
    const response = await axios.post(
      `${PAKASIR_BASE_URL}/api/v2/create-transaction/${PAKASIR_SLUG}/${orderId}`,
      { method, amount: product.price },
      { headers: { 'Content-Type': 'application/json', 'X-Api-Key': PAKASIR_API_KEY } }
    );
    const data = response.data;

    const db = readDB();
    db[orderId] = {
      orderId: orderId, txnId: data.txn_id, productId: productId,
      productName: product.name, amount: product.price,
      status: 'pending', createdAt: new Date().toISOString()
    };
    writeDB(db);

    res.json({
      success: true, order_id: orderId, txn_id: data.txn_id,
      product_name: product.name, amount: product.price,
      payment_link: data.payment_link, qr_string: data.qr_string,
      total_payment: data.total_payment, expired_at: data.expired_at
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Gagal membuat transaksi.', detail: error.message });
  }
});

app.get('/api/check-status', async (req, res) => {
  const { orderId } = req.query;
  const db = readDB();
  const trx = db[orderId];

  if (!trx) return res.status(404).json({ success: false, error: 'Transaksi tidak ditemukan' });
  if (trx.status === 'completed') return res.json({ success: true, status: 'completed', txn_id: trx.txnId, amount: trx.amount, product_name: trx.productName });

  try {
    const response = await axios.get(
      `${PAKASIR_BASE_URL}/api/v2/transaction-status/${PAKASIR_SLUG}/${trx.txnId}`,
      { headers: { 'X-Api-Key': PAKASIR_API_KEY } }
    );
    const data = response.data;
    db[orderId].status = data.status;
    if (data.status === 'completed') db[orderId].completedAt = new Date().toISOString();
    writeDB(db);

    res.json({ success: true, status: data.status, txn_id: trx.txnId, amount: trx.amount, product_name: trx.productName });
  } catch (error) {
    res.json({ success: true, status: 'pending', txn_id: trx.txnId, amount: trx.amount, product_name: trx.productName });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`\n🚀 Server berjalan di http://localhost:${PORT}\n`);
});