export const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 1000;

export function slowQueryThresholdMs(): number {
  const configured = Number(process.env.SLOW_QUERY_THRESHOLD_MS ?? DEFAULT_SLOW_QUERY_THRESHOLD_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_SLOW_QUERY_THRESHOLD_MS;
}

export function isSlowQuery(durationMs: number, thresholdMs = slowQueryThresholdMs()): boolean {
  return Number.isFinite(durationMs) && durationMs >= thresholdMs;
}

export const OBSERVABILITY_DB_QUERIES = {
  topByTotalTime: `
    select
      queryid::text as query_id,
      calls,
      round(mean_exec_time::numeric, 2) as mean_ms,
      round(max_exec_time::numeric, 2) as max_ms,
      round(total_exec_time::numeric, 2) as total_ms,
      rows,
      left(query, 500) as query
    from pg_stat_statements
    where query not ilike '%pg_stat_statements%'
    order by total_exec_time desc
    limit 10
  `,
  topByMeanTime: `
    select
      queryid::text as query_id,
      calls,
      round(mean_exec_time::numeric, 2) as mean_ms,
      round(max_exec_time::numeric, 2) as max_ms,
      round(total_exec_time::numeric, 2) as total_ms,
      rows,
      left(query, 500) as query
    from pg_stat_statements
    where calls >= 2
      and query not ilike '%pg_stat_statements%'
    order by mean_exec_time desc
    limit 10
  `,
  connections: `
    select
      count(*) filter (where state = 'active')::int as active_connections,
      count(*)::int as total_connections,
      current_setting('max_connections')::int as max_connections,
      round(100.0 * count(*) / nullif(current_setting('max_connections')::numeric, 0), 2) as utilization_pct
    from pg_stat_activity
  `,
  cacheHitRatio: `
    select
      'index' as kind,
      round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) as hit_ratio
    from pg_statio_user_indexes
    union all
    select
      'table' as kind,
      round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) as hit_ratio
    from pg_statio_user_tables
  `,
  longRunningQueries: `
    select
      pid,
      usename,
      state,
      now() - query_start as duration,
      left(query, 500) as query
    from pg_stat_activity
    where state = 'active'
      and pid <> pg_backend_pid()
      and query_start < now() - interval '1 second'
    order by query_start asc
    limit 20
  `,
} as const;
