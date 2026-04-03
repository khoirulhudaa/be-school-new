// =============================================
// loadtest-santai.js — Super Santai Load Test
// Cocok untuk testing locking absensi QR
// =============================================

const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const http = require('http');

const HOST = 'http://localhost:5005';
const ENDPOINT = '/scan-qr/double-qr';
const TOTAL_STUDENTS = 1000;
const SCHOOL_ID = 1;
const JWT_SECRET = 'BESCHOOLNEW';

const CLASSES = [
  'X RPL 1', 'X RPL 2', 'X TKJ 1', 'X TKJ 2',
  'XI RPL 1', 'XI RPL 2', 'XI TKJ 1', 'XI TKJ 2',
  'XII RPL 1', 'XII RPL 2', 'XII TKJ 1', 'XII TKJ 2',
];

const C = {
  green: '\x1b[32m', 
  yellow: '\x1b[33m', 
  red: '\x1b[31m',
  cyan: '\x1b[36m', 
  bold: '\x1b[1m', 
  reset: '\x1b[0m',
};

// Helper: single request
function singleRequest(token, userId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      qrCodeData: `SCHOOL_QR_${SCHOOL_ID}_LEFT`,
      userLat: -6.9175,
      userLon: 107.6191,
    });

    const options = {
      hostname: 'localhost',
      port: 5005,
      path: ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ userId, status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ userId, status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => resolve({ userId, status: 0, body: err.message }));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`${C.cyan}${C.bold}=============================================${C.reset}`);
  console.log(`${C.cyan}${C.bold}  KiraProject Load Test — SUPER SANTAI        ${C.reset}`);
  console.log(`${C.cyan}${C.bold}=============================================${C.reset}\n`);

  // 1. Generate Tokens
  console.log(`${C.yellow}[1/4] Generating ${TOTAL_STUDENTS} JWT tokens...${C.reset}`);
  const tokens = Array.from({ length: TOTAL_STUDENTS }, (_, i) => {
    const studentId = i + 1;
    const kelas = CLASSES[i % CLASSES.length];
    const payload = {
      profile: {
        id: studentId,
        schoolId: SCHOOL_ID,
        name: `Siswa Test ${studentId}`,
        role: 'siswa',
        class: kelas
      }
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
  });
  console.log(`${C.green}      ${TOTAL_STUDENTS} tokens generated.${C.reset}\n`);

  // 2. Flush Redis
  const today = new Date().toISOString().split('T')[0];
  console.log(`${C.yellow}[2/4] Flushing Redis locks...${C.reset}`);
  const redis = new Redis({ host: '127.0.0.1', port: 6379 });
  const pipeline = redis.pipeline();
  for (let i = 1; i <= TOTAL_STUDENTS; i++) {
    pipeline.del(`absensi_check:${SCHOOL_ID}:${i}:${today}`);
    pipeline.del(`absensi_lock:${SCHOOL_ID}:${i}:${today}`);
  }
  await pipeline.exec();
  await redis.quit();
  console.log(`${C.green}      Redis flushed.${C.reset}\n`);

  // 3. Diagnostic
  console.log(`${C.yellow}[3/4] Diagnostic — 5 sample requests...${C.reset}`);
  for (const uid of [1, 2, 3, 10, 20]) {
    const result = await singleRequest(tokens[uid-1], uid);
    const color = result.status === 200 ? C.green : C.red;
    console.log(`      userId ${uid.toString().padEnd(4)} → ${color}HTTP ${result.status}${C.reset} | ${JSON.stringify(result.body)}`);
  }
  console.log('');

  // ==================== SUPER SANTAI TEST ====================
  console.log(`${C.yellow}[4/4] Menjalankan SUPER SANTAI Load Test...${C.reset}`);
  console.log(`      Strategy : 1 request per siswa dengan jeda realistis`);
  console.log(`      Estimasi waktu : ± 3 - 4 menit\n`);

  let success = 0;
  let failed = 0;
  let tooManyRequests = 0;
  let alreadyAbsen = 0;
  const startTime = Date.now();

  for (let i = 0; i < TOTAL_STUDENTS; i++) {
    const userId = i + 1;
    const token = tokens[i];

    const result = await singleRequest(token, userId);

    if (result.status === 200) {
      success++;
      process.stdout.write(`${C.green}✓${C.reset}`);
    } 
    else if (result.status === 429) {
      tooManyRequests++;
      process.stdout.write(`${C.yellow}⏳${C.reset}`);
    } 
    else if (result.status === 400 && 
             result.body?.message?.includes("sudah absen")) {
      alreadyAbsen++;
      process.stdout.write(`${C.yellow}⛔${C.reset}`);
    } 
    else {
      failed++;
      process.stdout.write(`${C.red}✗${C.reset}`);
    }

    // Jeda yang sangat santai (realistis)
    const delay = (i % 10 === 0) ? 800 : 300;   // 800ms setiap 10 siswa, 300ms sisanya
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  const durationSec = (Date.now() - startTime) / 1000;
  const successRate = ((success / TOTAL_STUDENTS) * 100).toFixed(1);

  console.log(`\n\n${C.cyan}${C.bold}=============================================${C.reset}`);
  console.log(`${C.cyan}${C.bold}  HASIL LOAD TEST SUPER SANTAI                 ${C.reset}`);
  console.log(`${C.cyan}${C.bold}=============================================${C.reset}`);
  
  console.log(`  Total Request          : ${TOTAL_STUDENTS}`);
  console.log(`  Sukses (200)           : ${C.green}${success} (${successRate}%)${C.reset}`);
  console.log(`  Too Many Requests (429): ${C.yellow}${tooManyRequests}${C.reset}`);
  console.log(`  Sudah Absen (400)      : ${C.yellow}${alreadyAbsen}${C.reset}`);
  console.log(`  Lainnya (gagal)        : ${C.red}${failed}${C.reset}`);
  console.log(`  Durasi Test            : ${durationSec.toFixed(1)} detik`);
  console.log(`  Rata-rata Req/sec      : ${(TOTAL_STUDENTS / durationSec).toFixed(1)}`);

  console.log(`\n${C.cyan}Interpretasi:${C.reset}`);
  if (successRate > 85) {
    console.log(`  ${C.green}✓ Locking sudah cukup baik dan realistis!${C.reset}`);
  } else if (successRate > 70) {
    console.log(`  ${C.yellow}⚠ Masih cukup baik, tapi bisa dioptimasi lagi${C.reset}`);
  } else {
    console.log(`  ${C.red}✗ Masih perlu perbaikan di sisi locking / TTL${C.reset}`);
  }

  console.log(`${C.cyan}${C.bold}=============================================${C.reset}\n`);
}

main().catch(err => {
  console.error(`${C.red}[FATAL] ${err.message}${C.reset}`);
});