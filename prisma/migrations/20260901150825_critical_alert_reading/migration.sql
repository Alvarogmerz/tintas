-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InkLevelReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "printerId" INTEGER NOT NULL,
    "colorSlot" TEXT NOT NULL,
    "levelPercent" INTEGER,
    "rawValue" INTEGER,
    "capacityRaw" INTEGER,
    "criticalAlert" BOOLEAN NOT NULL DEFAULT false,
    "alertText" TEXT,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pollCycleId" INTEGER,
    CONSTRAINT "InkLevelReading_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InkLevelReading_pollCycleId_fkey" FOREIGN KEY ("pollCycleId") REFERENCES "PollCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InkLevelReading" ("capacityRaw", "colorSlot", "id", "levelPercent", "pollCycleId", "printerId", "rawValue", "readAt") SELECT "capacityRaw", "colorSlot", "id", "levelPercent", "pollCycleId", "printerId", "rawValue", "readAt" FROM "InkLevelReading";
DROP TABLE "InkLevelReading";
ALTER TABLE "new_InkLevelReading" RENAME TO "InkLevelReading";
CREATE INDEX "InkLevelReading_printerId_colorSlot_readAt_idx" ON "InkLevelReading"("printerId", "colorSlot", "readAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
