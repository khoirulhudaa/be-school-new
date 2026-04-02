// const fs = require('fs');

// const fileName = 'users.csv';
// const totalData = 200;
// const schoolId = 1;

// // ✅ HAPUS TOKEN
// let csvContent = 'userId;qrCodeData;userLat;userLon\n';

// const baseLat = -6.7239; 
// const baseLon = 108.5555;

// for (let i = 1; i <= totalData; i++) {

//     const side = i % 2 === 0 ? 'LEFT' : 'RIGHT';

//     const qrCodeData = `SCHOOL_QR_${schoolId}_${side}`;

//     const lat = (baseLat + (Math.random() * 0.0001)).toFixed(6);
//     const lon = (baseLon + (Math.random() * 0.0001)).toFixed(6);

//     // ✅ TANPA TOKEN
//     csvContent += `${i};${qrCodeData};${lat};${lon}\n`;
// }

// try {
//     fs.writeFileSync(fileName, csvContent);
//     console.log(`✅ Berhasil membuat ${totalData} data di ${fileName}`);
// } catch (err) {
//     if (err.code === 'EBUSY') {
//         console.error("❌ File sedang dibuka (Excel?), tutup dulu!");
//     } else {
//         console.error("❌ ERROR:", err.message);
//     }
// }


require('dotenv').config();
const fs = require('fs');
const sequelize = require('./config/database');
const Student = require('./models/siswa');

const fileName = 'users.csv';
const schoolId = 1;
const baseLat = -6.7239;
const baseLon = 108.5555;

async function generate() {
    await sequelize.authenticate();

    const students = await Student.findAll({
        attributes: ['id'],
        where: { schoolId },
        order: [['id', 'ASC']],
        limit: 200,
        raw: true
    });

    if (students.length === 0) {
        console.error('❌ Tidak ada siswa di DB dengan schoolId:', schoolId);
        process.exit(1);
    }

    let csvContent = 'userId;qrCodeData;userLat;userLon\n';

    students.forEach((student, i) => {
        const side = i % 2 === 0 ? 'LEFT' : 'RIGHT';
        // ✅ Pastikan hasilnya valid decimal
        const lat = parseFloat((baseLat + Math.random() * 0.0001).toFixed(6));
        const lon = parseFloat((baseLon + Math.random() * 0.0001).toFixed(6));
        csvContent += `${student.id};SCHOOL_QR_${schoolId}_${side};${lat};${lon}\n`;
    });

    fs.writeFileSync(fileName, csvContent);
    console.log(`✅ Generated ${students.length} rows dengan ID siswa dari DB`);
    await sequelize.close();
}

generate().catch(console.error);