    const express = require('express');
    const router = express.Router();

    // Import semua route handlers
    const albumRouter       = require('./albumRoutes');
    const alumniRouter      = require('./alumniRoutes');
    const galleryRouter     = require('./galleryRoutes');
    const beritaRouter      = require('./beritaRoutes');
    const pengumumanRouter  = require('./pengumumanRoutes');
    const fasilitasRouter   = require('./fasilitasRoutes');
    const profileRouter     = require('./profileSekolahRoutes');   
    const visiMisiRouter     = require('./visiMisiRoutes');   
    const prestasiRouter     = require('./prestasiRoutes');   
    const pramukaRouter     = require('./kegiatanPramukaRoutes');   
    const ekstrakurikulerRouter     = require('./ekstrakurikulerRoutes');   
    const layananRouter = require('./layananRoutes');
    const programRouter = require('./programRoutes');
    const sejarahSekolahRouter = require('./sejarahSekolahRoutes'); 
    const guruTendikRouter = require('./guruTendikRoutes');
    const ppdbRouter = require('./ppdbRoutes');
    const osisRouter = require('./osisRoutes');
    const kalenderRouter = require('./kalenderRoutes');
    const jadwalRouter = require('./jadwalRoutes');
    const kurikulumRouter = require('./kurikulumRoutes');
    const ppidRouter = require('./ppidRoutes');
    const ratingRouter = require('./komentarRoutes');
    const organisasiRouter = require('./organisasiRoutes');
    const partnerRouter = require('./partnerRoutes');
    const waRouter = require('./waRouter');
    const votingRouter = require('./votingRoutes');
    const faqRouter = require('./faqRoutes');
    const ruleRouter = require('./ruleRoutes');
    const jadwalSDRouter = require('./jadwalSDRoutes');
    const feedRouter = require('./feedRoutes');
    const registerRouter = require('./registerRoutes');
    const siswaRouter = require('./siswaRoutes');
    const kelasRouter = require('./kelasRoutes');
    const exportExcel = require('./exportExcelAttedancesYearly');
    const dataSekolah = require('./sekolahRoutes');
    const tugasSekolah = require('./tugasRouter');
    const scanQrStatis = require('./scanQrStatis');
    const orangTua = require('./orangTuaRoutes');
    const admin = require('./adminRoutes');
    const faceRouter = require('./face');

    router.use('/auth', require('./authRoutes'));
    router.use('/profile', require('./updateProfileRouter'));

    // ── Mount routes dengan limiter khusus ────────────────────────────────

    // Route sensitif (create/update banyak) → pakai strictLimiter
    router.use('/berita', beritaRouter);
    router.use('/pengumuman', pengumumanRouter);
    router.use('/alumni', alumniRouter);
    router.use('/pramuka', pramukaRouter);
    router.use('/siswa', siswaRouter);
    router.use('/ekstrakurikuler', ekstrakurikulerRouter);
    router.use('/layanan', layananRouter);
    router.use('/program', programRouter);
    router.use('/sejarah', sejarahSekolahRouter); 
    router.use('/admin', admin); 
    router.use('/guruTendik', guruTendikRouter); 
    router.use('/ppdb', ppdbRouter); 
    router.use('/osis', osisRouter); 
    router.use('/wa', waRouter); 
    router.use('/kalender', kalenderRouter); 
    router.use('/jadwal', jadwalRouter); 
    router.use('/kurikulum', kurikulumRouter); 
    router.use('/ppid', ppidRouter); 
    router.use('/rating', ratingRouter); 
    router.use('/organisasi', organisasiRouter); 
    router.use('/partner', partnerRouter); 
    router.use('/voting', votingRouter); 
    router.use('/faq', faqRouter); 
    router.use('/tata-tertib', ruleRouter); 
    router.use('/jadwal-sd', jadwalSDRouter); 
    router.use('/feed', feedRouter); 
    router.use('/akun', registerRouter); 
    router.use('/kelas', kelasRouter);
    router.use('/export-excel', exportExcel);
    router.use('/sekolah', dataSekolah);
    router.use('/tugas', tugasSekolah);
    router.use('/scan-qr', scanQrStatis);
    router.use('/orang-tua', orangTua);
    router.use('/face', faceRouter);
    
    // Route dengan upload/file berat → pakai uploadLimiter
    router.use('/gallery', galleryRouter);
    router.use('/fasilitas', fasilitasRouter);
    router.use('/albums', albumRouter);
    router.use('/profileSekolah', profileRouter);
    router.use('/visi-misi', visiMisiRouter);
    router.use('/prestasi', prestasiRouter);

    // Route testing (hanya ikut global limiter dari app.js)
    router.get('/testing', (req, res) => {
      res.json({
        success: true,
        message: 'API SEKOLAH (1.0.1) WITH PM2',
        timestamp: new Date().toISOString()
      });
    });

    module.exports = router;