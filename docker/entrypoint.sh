#!/bin/sh
set -e
pnpm exec prisma db push
pnpm exec tsx prisma/seed.ts || true
exec node dist/server.js
