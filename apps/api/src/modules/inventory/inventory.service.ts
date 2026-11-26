import type { Prisma } from '../../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/**
 * Creates the inventory row for a new variant and, when stock is provided, the immutable
 * OPENING movement. Phase 6 extends this module with inward/outward/adjust/reserve operations.
 */
export async function createInventoryWithOpening(
  tx: Tx,
  input: {
    variantId: string;
    warehouseId: string;
    sellerId: string;
    openingStock: number;
    reorderLevel: number;
    userId: string;
    referenceNo: string;
  },
) {
  const inventory = await tx.inventory.create({
    data: {
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      available: input.openingStock,
      reorderLevel: input.reorderLevel,
    },
  });
  if (input.openingStock > 0) {
    await tx.stockMovement.create({
      data: {
        inventoryId: inventory.id,
        sellerId: input.sellerId,
        type: 'OPENING',
        previousQty: 0,
        changeQty: input.openingStock,
        newQty: input.openingStock,
        reason: 'Opening stock',
        referenceNo: input.referenceNo,
        createdById: input.userId,
      },
    });
  }
  return inventory;
}
