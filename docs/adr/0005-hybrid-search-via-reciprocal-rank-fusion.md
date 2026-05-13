# ADR 0005: Hybrid search relevance blending via Reciprocal Rank Fusion

## Status

Accepted

## Context

To enable high-quality, semantic information retrieval, the system leverages a
hybrid search facility combining native SQLite Full-Text Search (FTS5) and
vector similarity traversal.

Combining results from these two distinct search drivers into a single,
relevance-sorted result set is mathematically complex. Each engine evaluates
relevance using completely different scoring domains:

1. **Vector Space:** Evaluates cosine similarity, producing bounded decimal
   floats in the `[-1, 1]` or `[0, 1]` range.
2. **Keyword Search:** Evaluates Okapi BM25 metrics, producing unbounded decimal
   floats where higher numbers indicate greater relevance but scale meaning
   depends entirely on corpus frequency.

Direct summation (e.g., `score = (alpha * cosine) + (beta * bm25)`) creates a
fragile **Scale Mismatch Trap**. It requires continuous hyperparameter tuning
and complex normalization math to prevent BM25 outliers from completely flooding
out subtle vector correlations.

## Decision

We will standardize on **Reciprocal Rank Fusion (RRF)** to blend relevance
signals inside the SQL search assembler.

Instead of attempting to calibrate the continuous scoring domains, we convert
them into discrete rank positions and calculate a combined score via the
standard RRF formula:

$$RRF(d) = \sum_{m \in M} \frac{1}{k + rank_m(d)}$$

Where:

- **$M$**: The set of retrieval engines (Keyword FTS5, Semantic Vectors).
- **$rank_m(d)$**: The 1-based integer rank position of document $d$ within
  engine $m$.
- **$k$**: The smoothing constant, set to the industry standard **$k = 60$**.

### Key Formula Configurations:

- **Smoothing Constant (60):** Ensures that small differences in top rankings
  (e.g., Rank 1 vs. Rank 2) do not disproportionately dwarf items that rank
  moderately well across both systems. It serves to reduce the impact of
  outliers from a single engine.
- **Null Suppression:** Documents appearing in only one retrieval engine are
  implicitly assigned a reciprocal rank value of `0.0` for the missing source,
  preventing mathematical undefined errors while allowing singular matches to
  survive.

## Consequences

- **Positive:** Fully eliminates manual normalization calibration math. Scoring
  is stable irrespective of underlying corpus scale changes.
- **Positive:** Proactively boosts "highly correlated" records that score in the
  top-tier of BOTH engines, resulting in extremely intuitive search relevancy.
- **Negative:** Discards granular continuous distance metrics (e.g., the
  difference between cosine $0.95$ and $0.94$ is flattened to simple ranking
  integer steps).
- **Negative:** Increases implementation complexity inside SQL builders,
  requiring windowing partitions (`row_number() OVER ()`) and Full Outer Joins.

## References

- **Simon Willison (2024):**
  [Hybrid full-text search and vector search with SQLite](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/),
  outlining standard industrial conventions for executing Reciprocal Rank Fusion
  using pure SQLite windowing primitives.
