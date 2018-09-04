const AWS = require('aws-sdk');

const config = {
    region: process.env.AWS_REGION,
    queueUrl: process.env.SQS_QUEUE_URL,
    queue: process.env.SQS_QUEUE,
    cluster: process.env.CLUSTER_NAME,
    clusterService: process.env.CLUSTER_SERVICE
};

const cloudwatch = new AWS.CloudWatch({ region: config.region });
const sqs = new AWS.SQS({ region: config.region });
const ecs = new AWS.ECS({ region: config.region });

exports.getNumMessages = () => {
    return sqs.getQueueAttributes({
        QueueUrl: config.queueUrl,
        AttributeNames: [
            "ApproximateNumberOfMessages"
        ]
    }).promise()
        .then(response => response.Attributes.ApproximateNumberOfMessages);
};

exports.getNumTasks = () => {
    return ecs.describeServices({
        cluster: config.cluster,
        services: [ config.clusterService ]
    }).promise()
        .then(response => response.services[0])
        .then(svc => svc.runningCount + svc.pendingCount);
}

exports.storeMetric = (value) => {
    return cloudwatch.putMetricData({
        Namespace: "SQS/ECS",
        MetricData: [
            {
                MetricName: "Messages per ECS task",
                Value: value,
                Timestamp: Date.now() / 1000,
                Unit: "Count",
                StorageResolution: 60,
                Dimensions: [
                    {
                        Name: "Queue",
                        Value: config.queue
                    },
                    {
                        Name: "Service",
                        Value: config.clusterService
                    }
                ]
            }
        ]
    }).promise();
}

exports.run = async (event) => {
    let numMsgs = exports.getNumMessages();
    let numTasks = exports.getNumTasks();
    let value = await numMsgs / await numTasks;

    exports.storeMetric(value)
        .then(result => {
            return {
                statusCode: 200,
                body: JSON.stringify({ value: value })
            };
        });
};
