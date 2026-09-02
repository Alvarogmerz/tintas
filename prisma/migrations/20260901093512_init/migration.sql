-- CreateTable
CREATE TABLE "Department" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "departmentId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "snmpCommunity" TEXT NOT NULL DEFAULT 'public',
    "snmpVersion" TEXT NOT NULL DEFAULT '2c',
    "snmpPort" INTEGER NOT NULL DEFAULT 161,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "lastError" TEXT,
    "excelRowAnchor" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Printer_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrinterCartridgeRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "printerId" INTEGER NOT NULL,
    "skuGeneration" TEXT NOT NULL,
    "tintaColorSku" TEXT,
    "tintaNegroSku" TEXT,
    "excelRowIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PrinterCartridgeRow_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockCell" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cartridgeRowId" INTEGER NOT NULL,
    "colorSlot" TEXT NOT NULL,
    "cellType" TEXT NOT NULL,
    "pendingQty" INTEGER,
    "lastSyncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "updatedByUserId" INTEGER,
    CONSTRAINT "StockCell_cartridgeRowId_fkey" FOREIGN KEY ("cartridgeRowId") REFERENCES "PrinterCartridgeRow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCell_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InkLevelReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "printerId" INTEGER NOT NULL,
    "colorSlot" TEXT NOT NULL,
    "levelPercent" INTEGER,
    "rawValue" INTEGER,
    "capacityRaw" INTEGER,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pollCycleId" INTEGER,
    CONSTRAINT "InkLevelReading_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InkLevelReading_pollCycleId_fkey" FOREIGN KEY ("pollCycleId") REFERENCES "PollCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PollCycle" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "printersPolled" INTEGER NOT NULL DEFAULT 0,
    "printersFailed" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "PollCyclePrinterResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pollCycleId" INTEGER NOT NULL,
    "printerId" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "readingsCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PollCyclePrinterResult_pollCycleId_fkey" FOREIGN KEY ("pollCycleId") REFERENCES "PollCycle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PollCyclePrinterResult_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReorderEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "printerId" INTEGER NOT NULL,
    "colorSlot" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "cartridgeRowIds" TEXT NOT NULL,
    "ruleInputsJson" TEXT,
    "pollCycleId" INTEGER,
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excelWrittenAt" DATETIME,
    "excelWriteError" TEXT,
    "emailSentAt" DATETIME,
    "emailError" TEXT,
    CONSTRAINT "ReorderEvent_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReorderEvent_pollCycleId_fkey" FOREIGN KEY ("pollCycleId") REFERENCES "PollCycle" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExcelSyncLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "cellsWritten" INTEGER NOT NULL DEFAULT 0,
    "lockDetected" BOOLEAN NOT NULL DEFAULT false,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_name_key" ON "Department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Printer_departmentId_name_key" ON "Printer"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PrinterCartridgeRow_printerId_tintaColorSku_tintaNegroSku_key" ON "PrinterCartridgeRow"("printerId", "tintaColorSku", "tintaNegroSku");

-- CreateIndex
CREATE UNIQUE INDEX "StockCell_cartridgeRowId_colorSlot_key" ON "StockCell"("cartridgeRowId", "colorSlot");

-- CreateIndex
CREATE INDEX "InkLevelReading_printerId_colorSlot_readAt_idx" ON "InkLevelReading"("printerId", "colorSlot", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
