// utils/generateRekapPDF.js
const PDFDocument = require('pdfkit');

/**
 * Generate buffer PDF laporan rekap harian
 * @param {object} rekapData - { summary, data }
 * @param {string} targetDate - 'YYYY-MM-DD'
 * @param {string} schoolName - nama sekolah
 * @returns {Promise<Buffer>}
 */
const generateRekapPDF = (rekapData, targetDate, schoolName = 'Sekolah') => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { summary, data } = rekapData;
    const W = doc.page.width - 80; // usable width

    // ── HEADER ──────────────────────────────────────────────────
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('LAPORAN REKAP KEHADIRAN HARIAN', { align: 'center' });

    doc
      .fontSize(11)
      .font('Helvetica')
      .text(schoolName, { align: 'center' })
      .text(`Tanggal: ${targetDate}`, { align: 'center' })
      .moveDown(0.5);

    // Garis pemisah
    doc
      .moveTo(40, doc.y)
      .lineTo(40 + W, doc.y)
      .lineWidth(1)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown(0.5);

    // ── SUMMARY TOTAL ────────────────────────────────────────────
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('RINGKASAN TOTAL', { underline: true })
      .moveDown(0.3);

    const summaryRows = [
      ['Total Siswa Aktif',  summary.totalAllStudents],
      ['Hadir',             summary.totalAllHadir],
      ['Belum / Tidak Hadir', summary.totalAllBelumHadir],
      ['Persentase Kehadiran',
        summary.totalAllStudents > 0
          ? `${((summary.totalAllHadir / summary.totalAllStudents) * 100).toFixed(1)}%`
          : '0%'
      ],
    ];

    summaryRows.forEach(([label, val]) => {
      doc
        .font('Helvetica-Bold').fontSize(10).text(label, 40, doc.y, { continued: true, width: 200 })
        .font('Helvetica').text(`: ${val}`, { align: 'left' });
    });

    doc.moveDown(0.8);

    // Garis pemisah
    doc
      .moveTo(40, doc.y)
      .lineTo(40 + W, doc.y)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown(0.5);

    // ── TABEL PER KELAS ──────────────────────────────────────────
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('DETAIL PER KELAS', { underline: true })
      .moveDown(0.5);

    // Header kolom tabel
    const colX   = [40, 150, 210, 255, 295, 340, 385, 435];
    const colW   = [110, 55, 45, 40, 45, 45, 50, 50];
    const headers = ['Kelas', 'Siswa', 'Tepat', 'Terlambat', 'Izin', 'Sakit', 'Alpha', 'Blm Hadir'];

    const drawRow = (cells, isHeader = false) => {
      const rowY = doc.y;
      const rowH = 18;

      // Background header
      if (isHeader) {
        doc.rect(40, rowY, W, rowH).fill('#1e3a5f');
        doc.fillColor('white');
      } else {
        doc.fillColor('black');
      }

      cells.forEach((text, i) => {
        doc
          .fontSize(isHeader ? 8 : 9)
          .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(text), colX[i], rowY + 4, {
            width: colW[i],
            align: i === 0 ? 'left' : 'center',
            lineBreak: false
          });
      });

      doc.y = rowY + rowH;

      // Garis bawah baris
      doc
        .moveTo(40, doc.y)
        .lineTo(40 + W, doc.y)
        .lineWidth(0.3)
        .strokeColor('#dddddd')
        .stroke();
    };

    drawRow(headers, true);

    // Sort kelas alphabetical
    const sortedData = [...data].sort((a, b) => a.className?.localeCompare(b.className));

    sortedData.forEach((cls, idx) => {
      // Zebra stripe
      if (idx % 2 === 0) {
        doc.rect(40, doc.y, W, 18).fill('#f9f9f9');
      }

      drawRow([
        cls.className || '-',
        cls.totalStudents,
        cls.stats.onTime,
        cls.stats.late,
        cls.stats.izin,
        cls.stats.sakit,
        cls.stats.alpha,
        cls.stats.belumHadir,
      ]);
    });

    doc.fillColor('black').moveDown(1);

    // ── FOOTER ───────────────────────────────────────────────────
    doc
      .moveTo(40, doc.y)
      .lineTo(40 + W, doc.y)
      .strokeColor('#cccccc')
      .stroke()
      .moveDown(0.4);

    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#888888')
      .text(
        `Digenerate otomatis oleh KiraProject • ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
        { align: 'center' }
      );

    doc.end();
  });
};

module.exports = { generateRekapPDF };