const generateClassSpecificText = (cls, date) => {
  const hadir = cls.stats.onTime + cls.stats.late;
  const pct = Math.round((hadir / cls.totalStudents) * 100);
  return `📚 *REKAP KELAS ${cls.className}*\n📅 ${date}\n━━━━━━━━━━━━━━━━━━━━\n✅ Tepat Waktu: *${cls.stats.onTime}*\n⏰ Terlambat: *${cls.stats.late}*\n🤒 Sakit: *${cls.stats.sakit}*\n📝 Izin: *${cls.stats.izin}*\n❌ Alpha: *${cls.stats.alpha}*\n⬜ Belum Absen: *${cls.stats.belumHadir}*\n👥 Total: *${cls.totalStudents}*\n📊 Kehadiran: *${pct}%*\n\n_Dikirim otomatis via KiraProject_`;
};

module.exports = {
  generateClassSpecificText
}