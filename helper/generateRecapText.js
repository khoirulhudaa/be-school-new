const generateRekapText = (data, date) => {
  const { summary, data: classes } = data;
  let text = `📊 *REKAP KEHADIRAN HARIAN*\n`;
  text += `📅 ${date}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `📌 *RINGKASAN*\n`;
  text += `✅ Hadir: *${summary.totalAllHadir}*\n`;
  text += `❌ Belum Hadir: *${summary.totalAllBelumHadir}*\n`;
  text += `👥 Total Siswa: *${summary.totalAllStudents}*\n\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📚 *REKAP PER KELAS*\n\n`;

  classes?.forEach(cls => {
    const pct = Math.round(((cls.stats.onTime + cls.stats.late) / cls.totalStudents) * 100);
    text += `🏫 *${cls.className}* (${cls.totalStudents} siswa)\n`;
    text += `  ✅ Tepat Waktu: ${cls.stats.onTime} | ⏰ Telat: ${cls.stats.late}\n`;
    text += `  🤒 Sakit: ${cls.stats.sakit} | 📝 Izin: ${cls.stats.izin} | ❌ Alpha: ${cls.stats.alpha}\n`;
    text += `  ⬜ Belum Absen: ${cls.stats.belumHadir}\n`;
    text += `  📊 Persentase Hadir: *${pct}%*\n\n`;
  });

  text += `\n_Dikirim otomatis oleh KiraProject_`;
  return text;
};

module.exports = {
    generateRekapText
}