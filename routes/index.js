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

  router.use('/auth', require('./authRoutes'));

  // ── Mount routes dengan limiter khusus ────────────────────────────────

  // Route sensitif (create/update banyak) → pakai strictLimiter
  router.use('/berita', beritaRouter);
  router.use('/pengumuman', pengumumanRouter);
  router.use('/alumni', alumniRouter);
  router.use('/pramuka', pramukaRouter);
  router.use('/ekstrakurikuler', ekstrakurikulerRouter);
  router.use('/layanan', layananRouter);
  router.use('/program', programRouter);
  router.use('/sejarah', sejarahSekolahRouter); 
  router.use('/guruTendik', guruTendikRouter); 
  router.use('/ppdb', ppdbRouter); 
  router.use('/osis', osisRouter); 

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
      message: 'API OK dari routes/index (1.0.0)',
      timestamp: new Date().toISOString()
    });
  });

  module.exports = router;