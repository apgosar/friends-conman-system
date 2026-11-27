-- The on-prem update approved in Settings, installed by the server's daily job (lib/app-update.ts)
CREATE TABLE "update_state" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NONE',
    "version" TEXT,
    "fromVersion" TEXT,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "log" TEXT,
    "lastCheckedAt" TIMESTAMP(3),

    CONSTRAINT "update_state_pkey" PRIMARY KEY ("id")
);
