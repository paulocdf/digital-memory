
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

## Best practices
### [Solid](https://www.digitalocean.com/community/conceptual_articles/s-o-l-i-d-the-first-five-principles-of-object-oriented-design)


### Index Creation Partitioning Strategy for PostgreSQL example:
```
Query to check if index is created:
-- List Indexes
SELECT *
from pg_catalog.pg_statio_all_indexes all_i 
inner join pg_catalog.pg_index pg_i on all_i.indexrelid = pg_i.indexrelid 
where schemaname = 'list_api' and relname  like 'partitioning_%'
Setup new partitioned table with data:
-- Create new partitinoed table
CREATE TABLE list_api.partitioning_test (
    id character varying NOT NULL,
    account_id character varying NOT NULL
) PARTITION BY LIST (account_id);
ALTER TABLE ONLY list_api.partitioning_test ADD CONSTRAINT partitioning_test_pkey PRIMARY KEY (id, account_id);

-- Create 2 partitions
CREATE TABLE list_api.partitioning_test_account_acc1 PARTITION OF list_api.partitioning_test FOR VALUES IN ('acc_1');
CREATE TABLE list_api.partitioning_test_account_acc2 PARTITION OF list_api.partitioning_test FOR VALUES IN ('acc_2')

-- Insert Data
insert into list_api.partitioning_test values ('1', 'acc_1');
insert into list_api.partitioning_test values ('1', 'acc_2');
select * from list_api.partitioning_test where account_id = 'acc_1';

-- Add Columns
alter table list_api.partitioning_test add column deleted boolean default false;
alter table list_api.partitioning_test add column updated_at timestamp default current_timestamp;
create index concurrently for partitions:
CREATE INDEX concurrently partitioning_test_created_at_idx_1 ON only list_api.partitioning_test_account_acc1 USING btree (updated_at)  WHERE (deleted = false);
create new account and check that it does not have new index:
CREATE TABLE list_api.partitioning_test_account_acc3 PARTITION OF list_api.partitioning_test FOR VALUES IN ('acc_3');
create remaninig index:
CREATE INDEX concurrently partitioning_test_created_at_idx_2 ON only list_api.partitioning_test_account_acc2 USING btree (updated_at)  WHERE (deleted = false);
CREATE INDEX concurrently partitioning_test_created_at_idx_3 ON only list_api.partitioning_test_account_acc3 USING btree (updated_at)  WHERE (deleted = false);
create index WITHOUT Recursive
-- Create IDX without Recursive
CREATE INDEX partitioning_test_created_at_idx ON only list_api.partitioning_test USING btree (updated_at)  WHERE (deleted = false);
create new partition table:
CREATE TABLE list_api.partitioning_test_account_acc4 PARTITION OF list_api.partitioning_test FOR VALUES IN ('acc_4');





16:48
now if you check the new indexes, you notice that Postgresql creates automatically new index:
-- List Indexes
SELECT *
from pg_catalog.pg_statio_all_indexes all_i 
inner join pg_catalog.pg_index pg_i on all_i.indexrelid = pg_i.indexrelid 
where schemaname = 'list_api' and relname  like 'partitioning_%'

```

