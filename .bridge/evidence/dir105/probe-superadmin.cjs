// DIR-105 probe: which accounts can reach the superAdminOnly settings panels?
require('dotenv').config({ path: require('path').join(__dirname, '../../..', 'backend/.env') });
const { getPool } = require('../../../backend/database/mysql.js');

(async () => {
    try {
        const [rows] = await getPool().query(
            'SELECT id, email, role FROM users ORDER BY id LIMIT 12',
        );
        console.log('accounts:');
        for (const r of rows) console.log(' ', JSON.stringify(r));
    } catch (error) {
        console.log('DB ERROR:', error.message);
    }
    process.exit(0);
})();
