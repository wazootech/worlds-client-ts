/**
 * DenokvHexastoreIndex enumerates supported KV secondary-index families used to accelerate match().
 */
export type DenokvHexastoreIndex = "spog" | "posg" | "ospg" | "gspo";

/** DEFAULT_DENOKV_HEXASTORE_INDEXES enables all KV hexastore index families. */
export const DEFAULT_DENOKV_HEXASTORE_INDEXES: readonly DenokvHexastoreIndex[] =
  [
    "spog",
    "posg",
    "ospg",
    "gspo",
  ];
