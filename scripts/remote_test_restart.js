const { switchActiveEngine, getActiveEngine } = require('./database/engineManager');

const target = process.argv[2];
if (!target) {
    console.log('ACTIVE_ENGINE:', getActiveEngine());
    process.exit(0);
}

switchActiveEngine(target, 'RESTART_TEST')
    .then(res => {
        console.log('SWITCHED_TO:', target, 'SUCCESS:', res.success);
        process.exit(0);
    })
    .catch(err => {
        console.error('SWITCH_ERROR:', err.message);
        process.exit(1);
    });
