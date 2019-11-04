'use strict';

const fs = require('fs-extra');
const { Collection } = require('@cumulus/api/models');
const { parseS3Uri } = require('@cumulus/common/aws');
const { LambdaStep } = require('@cumulus/common/sfnStep');
const {
  buildAndExecuteWorkflow,
  addCollections,
  addProviders,
  cleanupCollections,
  cleanupProviders,
  granulesApi
} = require('@cumulus/integration-tests');
const { setupTestGranuleForIngest } = require('../../helpers/granuleUtils');
const {
  createTimestampedTestId,
  loadConfig,
  createTestSuffix,
  createTestDataPath,
  uploadTestDataToBucket,
  deleteFolder
} = require('../../helpers/testUtils');

describe('When the Ingest Granules workflow is configured to handle duplicates as "error" and it encounters data with a duplicated filename, and it is configured to catch the duplicate error', () => {
  const workflowName = 'IngestGranuleCatchDuplicateErrorTest';
  const s3data = [
    '@cumulus/test-data/granules/MOD09GQ.A2016358.h13v04.006.2016360104606.hdf.met',
    '@cumulus/test-data/granules/MOD09GQ.A2016358.h13v04.006.2016360104606.hdf',
    '@cumulus/test-data/granules/MOD09GQ.A2016358.h13v04.006.2016360104606_ndvi.jpg'
  ];
  const inputPayloadFilename = './spec/parallel/ingestGranule/IngestGranule.input.payload.json';
  const granuleRegex = '^MOD09GQ\\.A[\\d]{7}\\.[\\w]{6}\\.006\\.[\\d]{13}$';
  const collectionsDir = './data/collections/s3_MOD09GQ_006';
  const providersDir = './data/providers/s3/';

  let beforeAllFailed = true;

  let config;
  let granulesIngested;
  let inputPayload;
  let moveGranulesTaskInput;
  let moveGranulesTaskOutput;
  let testDataFolder;
  let testSuffix;
  let workflowExecution;

  beforeAll(async () => {
    config = await loadConfig();

    const testId = createTimestampedTestId(config.stackName, 'IngestGranuleDuplicateHandling');
    testSuffix = createTestSuffix(testId);
    const collection = { name: `MOD09GQ${testSuffix}`, version: '006' };
    const provider = { id: `s3_provider${testSuffix}` };

    testDataFolder = createTestDataPath(testId);

    await Promise.all([
      uploadTestDataToBucket(config.bucket, s3data, testDataFolder),
      addCollections(config.stackName, config.bucket, collectionsDir, testSuffix, testId),
      addProviders(config.stackName, config.bucket, providersDir, config.bucket, testSuffix)
    ]);

    const inputPayloadJson = fs.readFileSync(inputPayloadFilename, 'utf8');
    inputPayload = await setupTestGranuleForIngest(config.bucket, inputPayloadJson, granuleRegex, testSuffix, testDataFolder);

    const initialWorkflowExecution = await buildAndExecuteWorkflow(
      config.stackName, config.bucket, workflowName, collection, provider, inputPayload
    );

    if (initialWorkflowExecution.status !== 'SUCCEEDED') {
      throw new Error(`Execution failed: ${initialWorkflowExecution.executionArn}`);
    }

    const lambdaStep = new LambdaStep();

    const lambdaOutput = await lambdaStep.getStepOutput(initialWorkflowExecution.executionArn, 'MoveGranules');
    granulesIngested = lambdaOutput.payload.granules;

    process.env.CollectionsTable = `${config.stackName}-CollectionsTable`;
    await (new Collection()).update(collection, { duplicateHandling: 'error' });

    // Run ingest again, this time with duplicateHandling = error

    workflowExecution = await buildAndExecuteWorkflow(
      config.stackName, config.bucket, workflowName, collection, provider, inputPayload
    );

    moveGranulesTaskInput = await lambdaStep.getStepInput(workflowExecution.executionArn, 'MoveGranules');
    moveGranulesTaskOutput = await lambdaStep.getStepOutput(workflowExecution.executionArn, 'MoveGranules', 'failure');

    beforeAllFailed = false;
  });

  it('the collection is configured to handle duplicates as error', async () => {
    if (beforeAllFailed) {
      fail('beforeAll() failed');
    } else {
      expect(moveGranulesTaskInput.meta.collection.duplicateHandling).toEqual('error');
    }
  });

  it('fails the MoveGranules Lambda function', async () => {
    if (beforeAllFailed) {
      fail('beforeAll() failed');
    } else {
      const { error, cause } = moveGranulesTaskOutput;
      const errorCause = JSON.parse(cause);
      expect(error).toEqual('DuplicateFile');

      const expectedErrorMessages = granulesIngested[0].files.map((file) => {
        const parsed = parseS3Uri(file.filename);
        return `${parsed.Key} already exists in ${parsed.Bucket} bucket`;
      });

      expect(expectedErrorMessages.includes(errorCause.errorMessage)).toBe(true);
    }
  });

  it('the execution completes with a success status', () => {
    if (beforeAllFailed) {
      fail('beforeAll() failed');
    } else {
      expect(workflowExecution.status).toEqual('SUCCEEDED');
    }
  });

  afterAll(() => Promise.all([
    deleteFolder(config.bucket, testDataFolder),
    cleanupCollections(config.stackName, config.bucket, collectionsDir, testSuffix),
    cleanupProviders(config.stackName, config.bucket, providersDir, testSuffix),
    granulesApi.deleteGranule({
      prefix: config.stackName,
      granuleId: inputPayload.granules[0].granuleId
    })
  ]));
});
