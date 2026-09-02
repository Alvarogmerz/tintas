-- CreateTable
CREATE TABLE "ReceiptEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "printerId" INTEGER NOT NULL,
    "colorSlot" TEXT NOT NULL,
    "qtyReceived" INTEGER NOT NULL,
    "cartridgeRowIds" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByUserId" INTEGER,
    CONSTRAINT "ReceiptEvent_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReceiptEvent_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailAlertState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "printerId" INTEGER NOT NULL,
    "colorSlot" TEXT NOT NULL,
    "currentlyBelow" BOOLEAN NOT NULL DEFAULT false,
    "lastAlertedAt" DATETIME,
    CONSTRAINT "EmailAlertState_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StockCell" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cartridgeRowId" INTEGER NOT NULL,
    "colorSlot" TEXT NOT NULL,
    "cellType" TEXT NOT NULL,
    "pendingQty" INTEGER,
    "syncedPendingQty" INTEGER,
    "stockOnHand" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "updatedByUserId" INTEGER,
    CONSTRAINT "StockCell_cartridgeRowId_fkey" FOREIGN KEY ("cartridgeRowId") REFERENCES "PrinterCartridgeRow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockCell_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StockCell" ("cartridgeRowId", "cellType", "colorSlot", "id", "lastSyncedAt", "pendingQty", "syncedPendingQty", "updatedAt", "updatedByUserId") SELECT "cartridgeRowId", "cellType", "colorSlot", "id", "lastSyncedAt", "pendingQty", "syncedPendingQty", "updatedAt", "updatedByUserId" FROM "StockCell";
DROP TABLE "StockCell";
ALTER TABLE "new_StockCell" RENAME TO "StockCell";
CREATE UNIQUE INDEX "StockCell_cartridgeRowId_colorSlot_key" ON "StockCell"("cartridgeRowId", "colorSlot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EmailAlertState_printerId_colorSlot_key" ON "EmailAlertState"("printerId", "colorSlot");
