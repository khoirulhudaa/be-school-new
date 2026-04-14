// utils/generateClassRekapPDF.js
const PDFDocument = require('pdfkit');

/**
 * Generate buffer PDF laporan rekap kelas (untuk Wali Kelas)
 * @param {object} cls - { className, totalStudents, stats, walikelas }
 * @param {string} targetDate - 'YYYY-MM-DD'
 * @param {string} schoolName - nama sekolah
 * @returns {Promise<Buffer>}
 */
const generateClassRekapPDF = (cls, targetDate, schoolName = 'Sekolah') => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80;
    const hadirTotal = cls.stats.onTime + cls.stats.late;
    const hadirPct = cls.totalStudents > 0
      ? ((hadirTotal / cls.totalStudents) * 100).toFixed(1)
      : '0';

    // ── HEADER ──────────────────────────────────────────────────
    doc
      .rect(40, 40, W, 80)
      .fill('#0f4c81');

    doc
      .fillColor('white')
      .fontSize(15)
      .font('Helvetica-Bold')
      .text(`REKAP KEHADIRAN KELAS ${cls.className}`, 40, 52, { align: 'center', width: W });

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(schoolName.toUpperCase(), 40, 73, { align: 'center', width: W })
      .text(`Wali Kelas: ${cls.walikelas?.name || '-'}   |   Tanggal: ${targetDate}`, 40, 89, { align: 'center', width: W });

    doc.y = 135;

    // ── SUMMARY BOXES ────────────────────────────────────────────
    const boxW = (W - 20) / 5;
    const boxes = [
      { label: 'Total Siswa',     value: cls.totalStudents,    color: '#2563eb' },
      { label: 'Hadir',           value: hadirTotal,           color: '#16a34a' },
      { label: 'Izin',            value: cls.stats.izin,       color: '#d97706' },
      { label: 'Sakit',           value: cls.stats.sakit,      color: '#0891b2' },
      { label: 'Alpha',           value: cls.stats.alpha,      color: '#dc2626' },
    ];

    boxes.forEach((box, i) => {
      const bx = 40 + i * (boxW + 5);
      doc.rect(bx, doc.y, boxW, 55).fill(box.color);
      doc
        .fillColor('white')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(String(box.value), bx, doc.y + 7, { width: boxW, align: 'center' });
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(box.label.toUpperCase(), bx, doc.y + 35, { width: boxW, align: 'center' });
    });

    doc.y += 65;
    doc.moveDown(0.5);

    // ── DETAIL KEHADIRAN ─────────────────────────────────────────
    doc
      .fillColor('#0f4c81')
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('DETAIL KEHADIRAN', 40, doc.y);

    doc.moveDown(0.5);

    const detailRows = [
      { label: 'Hadir Tepat Waktu',   value: cls.stats.onTime,         icon: '✓', color: '#16a34a' },
      { label: 'Hadir Terlambat',     value: cls.stats.late,           icon: '!', color: '#d97706' },
      { label: 'Izin',               value: cls.stats.izin,           icon: 'I', color: '#d97706' },
      { label: 'Sakit',              value: cls.stats.sakit,          icon: 'S', color: '#0891b2' },
      { label: 'Alpha',              value: cls.stats.alpha,          icon: 'X', color: '#dc2626' },
      { label: 'Belum Hadir',        value: cls.stats.belumHadir,     icon: '-', color: '#6b7280' },
    ];

    detailRows.forEach((row, idx) => {
      const rowY = doc.y;
      const bgColor = idx % 2 === 0 ? '#f8fafc' : '#ffffff';

      doc.rect(40, rowY, W, 22).fill(bgColor);

      // Icon circle
      doc.circle(60, rowY + 11, 8).fill(row.color);
      doc
        .fillColor('white')
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(row.icon, 53, rowY + 6, { width: 14, align: 'center', lineBreak: false });

      // Label
      doc
        .fillColor('#1e293b')
        .fontSize(10)
        .font('Helvetica')
        .text(row.label, 78, rowY + 6, { width: 200, lineBreak: false });

      // Progress bar background
      const barX = 280;
      const barW = W - 250;
      const barH = 8;
      const barY = rowY + 7;
      const fillW = cls.totalStudents > 0
        ? Math.max(0, (row.value / cls.totalStudents) * barW)
        : 0;

      doc.rect(barX, barY, barW, barH).fill('#e2e8f0');
      if (fillW > 0) {
        doc.rect(barX, barY, fillW, barH).fill(row.color);
      }

      // Value
      doc
        .fillColor('#1e293b')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(String(row.value), barX + barW + 6, rowY + 6, { width: 30, align: 'right', lineBreak: false });

      // Border bawah
      doc
        .moveTo(40, rowY + 22)
        .lineTo(40 + W, rowY + 22)
        .lineWidth(0.3)
        .strokeColor('#e2e8f0')
        .stroke();

      doc.y = rowY + 22;
    });

    // Border luar detail
    const detailEndY = doc.y;
    doc.y -= detailRows.length * 22;
    doc
      .rect(40, doc.y, W, detailRows.length * 22)
      .lineWidth(0.5)
      .strokeColor('#cbd5e1')
      .stroke();
    doc.y = detailEndY;

    doc.moveDown(1);

    // ── PERSENTASE KEHADIRAN ─────────────────────────────────────
    doc
      .rect(40, doc.y, W, 45)
      .fill('#1e3a5f');

    doc
      .fillColor('white')
      .fontSize(11)
      .font('Helvetica')
      .text('PERSENTASE KEHADIRAN', 40, doc.y + 8, { align: 'center', width: W });

    doc
      .fontSize(26)
      .font('Helvetica-Bold')
      .fillColor(parseFloat(hadirPct) >= 80 ? '#4ade80' : parseFloat(hadirPct) >= 60 ? '#fbbf24' : '#f87171')
      .text(`${hadirPct}%`, 40, doc.y + 16, { align: 'center', width: W });

    doc.y += 55;
    doc.moveDown(1.5);

    // ── FOOTER ───────────────────────────────────────────────────
    doc
      .moveTo(40, doc.y)
      .lineTo(40 + W, doc.y)
      .lineWidth(0.5)
      .strokeColor('#cbd5e1')
      .stroke()
      .moveDown(0.4);

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#94a3b8')
      .text(
        `Digenerate otomatis oleh KiraProject • ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
        { align: 'center' }
      );

    doc.end();
  });
};

module.exports = { generateClassRekapPDF };