require('dotenv').config();
const sequelize = require('./config/database');
const Student = require('./models/siswa');

async function seed() {
    await sequelize.authenticate();

    const data = [];
    for (let i = 1; i <= 200; i++) {
        data.push({
            name: `Siswa Test ${i}`,
            schoolId: 1,
            class: 'XII RPL',
            nis: `NIS${String(i).padStart(6, '0')}`, // ← tambah ini
            isActive: true,
            batch: '2025',
            isGraduated: false,
        });
    }

    await Student.bulkCreate(data);
    console.log('✅ Seed 200 siswa selesai');
    await sequelize.close();
}

seed().catch(console.error);