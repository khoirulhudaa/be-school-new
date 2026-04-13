const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client = null;
let isReady = false;
let qrCodeData = null;

const initWhatsApp = () => {
  client = new Client({
    authStrategy: new LocalAuth({
      dataPath: './wa_session' // simpan session agar tidak perlu scan ulang
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', (qr) => {
    qrCodeData = qr;
    isReady = false;
    qrcode.generate(qr, { small: true }); // tampil di terminal
    console.log('📱 Scan QR Code di atas untuk login WhatsApp');
  });

  client.on('ready', () => {
    isReady = true;
    qrCodeData = null;
    console.log('✅ WhatsApp Client siap digunakan!');
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    console.log('❌ WhatsApp disconnect:', reason);
    // Auto reconnect setelah 5 detik
    setTimeout(() => initWhatsApp(), 5000);
  });

  client.on('auth_failure', () => {
    isReady = false;
    console.log('❌ Auth failure, perlu scan ulang');
  });

  client.initialize();

  return client;
};

const getClient = () => client;
const getIsReady = () => isReady;
const getQRCode = () => qrCodeData;

module.exports = { initWhatsApp, getClient, getIsReady, getQRCode };