#!/bin/bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:/home/u727965524/.local/bin:/usr/local/bin:/usr/bin:/usr/local/sbin:/usr/sbin
if ! curl -s -f http://82.112.232.112:8080/api/healthz > /dev/null 2>&1; then
    echo [Mon Sep 21 04:54:57 AM UTC 2026] Backend down, attempting pm2 resurrect... >> /home/u727965524/keep-alive.log
    pm2 resurrect >> /home/u727965524/keep-alive.log 2>&1
    sleep 3
    if ! curl -s -f http://82.112.232.112:8080/api/healthz > /dev/null 2>&1; then
        echo [Mon Sep 21 04:54:57 AM UTC 2026] Backend still down, starting directly... >> /home/u727965524/keep-alive.log
        cd /home/u727965524/backend && pm2 start index.js --name airesume-backend >> /home/u727965524/keep-alive.log 2>&1
        pm2 save >> /home/u727965524/keep-alive.log 2>&1
    fi
fi
