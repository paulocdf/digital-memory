
## RabbitMQ

The fact that you have a Java consumer that works correctly points to either amqplib-easy, amqplib or your code as the culprit. Also, note that using a single queue in RabbitMQ is an anti-pattern as queues are the unit of concurrency in the broker. [Link](https://stackoverflow.com/questions/47081053/how-to-handle-100-messages-per-second-with-amqp-node)


## Postgresql DB

See running queries:
```
SELECT pid, age(clock_timestamp(), query_start), usename, query
FROM pg_stat_activity
WHERE query != ‘<IDLE>’ AND query NOT ILIKE ‘%pg_stat_activity%’
ORDER BY query_start desc;
```


### Old migrations

```
==================================================================================
  Validate if the total retries matches between trackers and new partitioned table
  ==================================================================================
*/
​
-- Record Trackers
select account_id, sum(
        CASE
            WHEN attempt_disposition = 'INTERNAL'                       THEN 0
            WHEN attempt_disposition = 'DO_NOT_CALL_RECORD_RESCHEDULED' THEN 0
            ELSE 1
        END
    ) as "nr calls" FROM list_manager.record_trackers rt
  inner join list_api.records r on rt.record_id = r.id
  inner join list_api.record_lists rl on r.record_list_id = rl.id
group by 1 order by 2 desc;
​
-- Campaign Record Retries
select account_id, sum(total_retries) as "nr calls" from list_manager.campaign_records_retries
group by 1 order by 2 desc;

/*
  ===========================================================
  Determine what records do not exist in the Records_V2 table 
  WARNING: Do run in production unless strictly necessary
  ===========================================================
*/
SELECT r_v1.account_id, r_v1.id, r_v1.deleted, r_v2.account_id as "r_v2 account_id", r_v2.id as "r_v2 id", r_v2.deleted as "r_v2 deleted"
FROM (
 	SELECT r.*, rl.account_id
 	FROM list_api.records r
 	INNER JOIN list_api.record_lists rl ON r.record_list_id = rl.id
 ) as r_v1
FULL OUTER JOIN list_api.records_v2 AS r_v2 ON r_v1.id = r_v2.id
WHERE r_v2.id is NULL                -- record does not exist in v_2
	OR r_v1.deleted != r_v2.deleted  -- deleted field was updated in records table
  
```

Table partitioning migration example:

```

-----
----- CREATE PARTITION TABLES FROM DATA
-----
DO
$do$
DECLARE
    temprow record;
BEGIN
    FOR temprow IN
        SELECT
               account_id,
               concat('list_api.records_v2_account_', account_id) as t_record
        FROM list_api.record_lists
        GROUP BY 1
        LOOP
            EXECUTE 'CREATE TABLE ' || temprow.t_record || ' PARTITION OF list_api.records_v2 FOR VALUES IN (''' || temprow.account_id || ''')';
        END LOOP;
END
$do$;
​
-----
----- POPULATE DATA
-----
​
INSERT INTO list_api.records_v2 (id, record_list_uuid, phone_number, first_name, last_name, timezone, record_list_id, created_at, updated_at, weight, upload_request_id, created_by, priority, extra_data, deleted, external_provider, external_id, external_url, sync_external_id, account_id, contact_external_id)
SELECT r.id, rl.external_uuid, r.phone_number, r.first_name, r.last_name, r.timezone, r.record_list_id, r.created_at, r.updated_at, r.weight, r.upload_request_id, r.created_by, r.priority, r.extra_data, r.deleted, r.external_provider, r.external_id, r.external_url, r.sync_external_id, rl.account_id, null
FROM list_api.records r INNER JOIN list_api.record_lists rl on r.record_list_id = rl.id
ON CONFLICT (id, record_list_uuid, account_id)
DO UPDATE SET deleted = excluded.deleted,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at;
              
```


Transaction Routing datasource -> https://vladmihalcea.com/read-write-read-only-transaction-routing-spring/
Notes:
```
In my previous company we were using pgpool which stands as a middleware between your client and postgres servers, and serves also as load balancer.
The configuration in our app (python/django application) was the same as it was with one postgres server (we had master with r/w and multiple r/o replicas), and the app was not “aware” about underlying postgres servers. That worked pretty well for us.
Before that we were using pgbouncer which didn’t work well for us (can’t recall the reason but can check)
```
