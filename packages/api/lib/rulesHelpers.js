const { schedule } = require('../lambdas/sf-scheduler');
const Rule = require('../models/rules');

/**
 * Queue a workflow message for the kinesis/sqs rule with the message passed
 * to stream/queue as the payload
 *
 * @param {Object} rule - rule to queue the message for
 * @param {Object} eventObject - message passed to stream/queue
 * @returns {Promise} promise resolved when the message is queued
 */
async function queueMessageForRule(rule, eventObject) {
  const item = {
    workflow: rule.workflow,
    provider: rule.provider,
    collection: rule.collection,
    meta: rule.meta,
    payload: eventObject
  };

  const payload = await Rule.buildPayload(item);

  return schedule(payload);
}

module.exports = {
  queueMessageForRule
};
