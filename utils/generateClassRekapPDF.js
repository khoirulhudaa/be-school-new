// utils/generateClassRekapPDF.js
const PDFDocument = require('pdfkit');

const generateClassRekapPDF = (cls, targetDate, schoolName = 'Sekolah') => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - 80;

    // Header
    doc
      .fontSize(16).font('Helvetica-Bold')
      .text(`REKAP KEHADIRAN KELAS ${cls.className}`, { align: 'center' });

    doc
      .fontSize(11).font('Helvetica')
      .text(schoolName, { align: 'center' })
      .text(`Tanggal: ${targetDate}`, { align: 'center' })
      .text(`Wali Kelas: ${cls.walikelas?.name || '-'}`, { align: 'center' })
      .moveDown(0.5);

    doc
      .moveTo(40, doc.y).lineTo(40 + W, doc.y)
      .lineWidth(1).strokeColor('#cccccc').stroke()
      .moveDown(0.5);

    // Stats
    const hadirTotal = cls.stats.onTime + cls.stats.late;
    const rows = [
      ['Total Siswa',         cls.totalStudents],
      ['Hadir Tepat Waktu',   cls.stats.onTime],
      ['Hadir Terlambat',     cls.stats.late],
      ['Izin',                cls.stats.izin],
      ['Sakit',               cls.stats.sakit],
      ['Alpha',               cls.stats.alpha],
      ['Belum Hadir',         cls.stats.belumHadir],
      ['Persentase Kehadiran',
        cls.totalStudents > 0
          ? `${((hadirTotal / cls.totalStudents) * 100).toFixed(1)}%`
          : '0%'
      ],
    ];

    rows.forEach(([label, val]) => {
      doc
        .font('Helvetica-Bold').fontSize(10)
        .text(label, 40, doc.y, { continued: true, width: 220 })
        .font('Helvetica')
        .text(`: ${val}`);
    });

    doc.moveDown(1);
    doc
      .fontSize(8).font('Helvetica').fillColor('#888888')
      .text(
        `Digenerate otomatis oleh KiraProject • ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
        { align: 'center' }
      );

    doc.end();
  });
};

module.exports = { generateClassRekapPDF };