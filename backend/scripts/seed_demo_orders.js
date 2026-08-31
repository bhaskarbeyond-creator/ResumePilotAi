'use strict';

const { getPool } = require('../database/mysql');
const { billingSnapshotHash } = require('../services/invoiceService');

async function seedOrdersAndInvoices() {
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const supplierSnapshot = {
      legalName: 'ResumePilot AI Private Limited',
      tradeName: 'ResumePilot AI',
      gstin: '27AABCU9603R1ZM',
      pan: 'AABCU9603R',
      address: 'Unit 402, Apex Business Park, Bandra Kurla Complex',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateCode: '27',
      pincode: '400051',
      country: 'India',
      sacCode: '998313',
      gstRate: 18,
      invoicePrefix: 'INV',
      financialYear: '26-27',
      email: 'billing@resumepilot.ai',
      phone: '+91 22 6123 4567',
      website: 'https://resumepilot.ai',
    };

    const ordersToSeed = [
      { id: 'po_demo_001', uid: 'cert-backup-user', name: 'Aria Backup', email: 'backup@certification.local', planId: 'quarterly', amount: 39900, provider: 'razorpay', providerRef: 'pay_RzpDemo001' },
      { id: 'po_demo_002', uid: 'cert-user-a', name: 'Aria Certification', email: 'a@certification.local', planId: 'yearly', amount: 49900, provider: 'stripe', providerRef: 'ch_StrDemo002' },
      { id: 'po_demo_003', uid: 'OhZdiSIFL7ePA1TMkfu9bnR935D3', name: 'Babu M', email: 'bhaskar.beyond@gmail.com', planId: 'monthly', amount: 19900, provider: 'phonepe', providerRef: 'T260831PhonePe003' },
      { id: 'po_demo_004', uid: 'QftU4OxDuiZjpmUbFx9rvQUkXqG3', name: 'Babu M', email: 'bhaskarbabumadala@gmail.com', planId: 'monthly', amount: 19900, provider: 'razorpay', providerRef: 'pay_RzpDemo004' },
      { id: 'po_demo_005', uid: 'cert-user-a', name: 'Aria Certification', email: 'a@certification.local', planId: 'monthly', amount: 19900, provider: 'paytm', providerRef: 'PTM_TXN_005' },
    ];

    let seq = 1;
    for (const item of ordersToSeed) {
      const billingSnapshot = {
        name: item.name,
        company: '',
        email: item.email,
        gstin: '',
        type: 'B2C / Individual',
        address: 'Customer Address, Bandra Kurla Complex',
        city: 'Mumbai',
        state: 'Maharashtra',
        stateCode: '27',
        pincode: '400051',
        country: 'India',
      };
      const hash = billingSnapshotHash({ billingSnapshot, supplierSnapshot });
      const totalAmount = item.amount / 100;
      const taxableAmount = Math.round((totalAmount / 1.18) * 100) / 100;
      const taxAmount = Math.round((totalAmount - taxableAmount) * 100) / 100;
      const cgst = Math.round((taxAmount / 2) * 100) / 100;
      const sgst = Math.round((taxAmount - cgst) * 100) / 100;

      // Insert payment order
      await connection.query(
        `INSERT INTO payment_orders (
          id, uid, plan_id, provider, amount, original_amount, currency, status,
          billing_snapshot, supplier_snapshot, billing_snapshot_hash, billing_snapshot_version,
          provider_payment_id, activated_at, revision
        ) VALUES (?, ?, ?, ?, ?, ?, 'INR', 'ACTIVE', ?, ?, ?, 1, ?, NOW(), 1)
        ON DUPLICATE KEY UPDATE status = 'ACTIVE', amount = VALUES(amount), updated_at = NOW()`,
        [
          item.id, item.uid, item.planId, item.provider, item.amount, item.amount,
          JSON.stringify(billingSnapshot), JSON.stringify(supplierSnapshot), hash,
          item.providerRef,
        ]
      );

      // Prepare Invoice Payload
      const invoiceNumber = `INV-26-27-${String(seq).padStart(6, '0')}`;
      const invoicePayload = {
        invoiceNumber,
        invoiceSequence: seq,
        financialYear: '26-27',
        paymentOrderId: item.id,
        userId: item.uid,
        paymentReference: item.providerRef,
        paymentStatus: 'ACTIVE',
        currency: 'INR',
        taxableAmount,
        totalTax: taxAmount,
        grandTotal: totalAmount,
        supplierSnapshot,
        customerSnapshot: billingSnapshot,
        lineItems: [
          {
            description: `ResumePilot Pro Subscription (${item.planId})`,
            sacCode: '998313',
            quantity: 1,
            unitPrice: taxableAmount,
            taxableAmount,
            gstRate: 18,
            cgstAmount: cgst,
            sgstAmount: sgst,
            igstAmount: 0,
            totalTax: taxAmount,
            lineTotal: totalAmount,
          }
        ],
        issuedAt: new Date().toISOString(),
      };

      // Insert Invoice
      await connection.query(
        `INSERT INTO invoices (
          id, invoice_number, invoice_sequence, financial_year, payment_order_id,
          user_id, payment_reference, payment_status, currency, taxable_amount,
          tax_amount, total_amount, payload, issued_at
        ) VALUES (?, ?, ?, '26-27', ?, ?, ?, 'ACTIVE', 'INR', ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE total_amount = VALUES(total_amount), payload = VALUES(payload)`,
        [
          `inv_${item.id}`, invoiceNumber, seq, item.id, item.uid,
          item.providerRef, taxableAmount, taxAmount, totalAmount, JSON.stringify(invoicePayload)
        ]
      );

      seq++;
    }

    // Update global stats
    const [[statsRow]] = await connection.query("SELECT data FROM stats WHERE id = 'global_stats'");
    let currentStats = {};
    if (statsRow && statsRow.data) {
      currentStats = typeof statsRow.data === 'string' ? JSON.parse(statsRow.data) : statsRow.data;
    }
    currentStats.downloads = currentStats.downloads || 4;
    currentStats.documents_downloaded = currentStats.documents_downloaded || 4;
    currentStats.revenue = 1495;
    currentStats.total_revenue = 1495;
    await connection.query("UPDATE stats SET data = ? WHERE id = 'global_stats'", [JSON.stringify(currentStats)]);

    await connection.commit();
    console.log('Successfully seeded 5 payment orders & invoices! Total Revenue: ₹1,495.00');
    process.exit(0);
  } catch (error) {
    await connection.rollback();
    console.error('Error seeding orders:', error);
    process.exit(1);
  } finally {
    connection.release();
  }
}

seedOrdersAndInvoices().catch(e => { console.error(e); process.exit(1); });
