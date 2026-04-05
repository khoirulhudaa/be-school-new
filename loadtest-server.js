const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
const http = require('http');

// --- TWEAK DISINI ---
const PORT = 5005; 
const HOST = '127.0.0.1'; // Pakai IP, jangan localhost
const ENDPOINT = '/scan-qr/double-qr';
const TOTAL_STUDENTS = 1000;
const SCHOOL_ID = 101;
const JWT_SECRET = 'BESCHOOLNEW';

// Helper Warna
const C = {
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m',
  cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m',
};

function singleRequest(token, userId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      qrCodeData: `SCHOOL_QR_${SCHOOL_ID}_LEFT`,
      userLat: -6.9175,
      userLon: 107.6191,
    });

    const options = {
      hostname: HOST,
      port: PORT,
      path: ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(body)
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', (err) => resolve({ status: 0, body: err.message }));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`${C.cyan}${C.bold}=== RUNNING TEST ===${C.reset}\n`);

  // 1. Token Generation
  // Saya buat dua versi payload (pilih salah satu yang paling cocok dengan model User kamu)
  const tokens = Array.from({ length: TOTAL_STUDENTS }, (_, i) => {
    const studentId = i + 1;
    const payload = {
      id: studentId,
      schoolId: SCHOOL_ID,
      role: 'student',
      // Jika backend kamu pakai req.user.profile.id, gunakan struktur di bawah:
      // profile: { id: studentId, schoolId: SCHOOL_ID } 
    };
    return jwt.sign(payload, JWT_SECRET);
  });

  // 2. Redis Flush
  const redis = new Redis({ host: '127.0.0.1', port: 6379, password: 'e7ee408114792b1c' });
  await redis.flushall();
  await redis.quit();
  console.log(`${C.green}Redis Cleaned.${C.reset}\n`);

  // 3. Execution
  let success = 0, fail = 0;
  for (let i = 0; i < TOTAL_STUDENTS; i++) {
    const res = await singleRequest(tokens[i], i + 1);
    
    if (res.status === 200 || res.status === 201) {
      success++;
      process.stdout.write(`${C.green}✓${C.reset}`);
    } else {
      fail++;
      process.stdout.write(`${C.red}✗${C.reset}`);
      // Munculkan bocoran error pertama agar kita tahu kenapa gagal
      if (fail === 1) {
        console.log(`\n\n${C.red}Bocoran Error Pertama:${C.reset}`);
        console.log(`Status: ${res.status}`);
        console.log(`Response: ${JSON.stringify(res.body)}\n`);
      }
    }
    if ((i + 1) % 50 === 0) console.log(` [${i+1}]`);
  }
  
  console.log(`\n\nSelesai. Sukses: ${success}, Gagal: ${fail}`);
}

main();