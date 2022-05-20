
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
