import { execSync } from 'node:child_process';
import fs from 'node:fs';

const phpScript = `<?php
echo "=== PHP 8.3 REDIS DIAGNOSTIC ===\\n";
if (extension_loaded('redis')) {
    echo "Extension 'redis': LOADED\\n";
    echo "Extension Version: " . phpversion('redis') . "\\n";
    $r = new Redis();
    try {
        $ok = @$r->connect('127.0.0.1', 6379, 1.0);
        if ($ok) {
            echo "Connected to 127.0.0.1:6379: SUCCESS\\n";
            echo "PING response: " . $r->ping() . "\\n";
        } else {
            echo "Connected to 127.0.0.1:6379: FAILED (ECONNREFUSED - No daemon on localhost:6379)\\n";
        }
    } catch (Throwable $e) {
        echo "Exception: " . $e->getMessage() . "\\n";
    }
} else {
    echo "Extension 'redis': NOT LOADED\\n";
}
`;

fs.writeFileSync('test-redis.php', phpScript);
try {
  execSync('scp test-redis.php airesume:backend/test-redis.php', { stdio: 'inherit' });
  const out = execSync('ssh airesume "/opt/alt/php83/usr/bin/php backend/test-redis.php && rm backend/test-redis.php"', { encoding: 'utf8' });
  console.log(out);
} finally {
  if (fs.existsSync('test-redis.php')) fs.unlinkSync('test-redis.php');
}
