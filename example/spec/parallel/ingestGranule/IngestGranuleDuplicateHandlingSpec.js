'use strict';

const fs = require('fs-extra');
const path = require('path');
const { Collection, Granule } = require('@cumulus/api/models');
const {
  aws: { s3 },
  testUtils: { randomString }
} = require('@cumulus/common');
const { LambdaStep } = require('@cumulus/common/sfnStep');
const {
  addCollections,
  addProviders,
  buildAndExecuteWorkflow,
  cleanupCollections,
  cleanupProviders,
  granulesApi: granulesApiTestUtils
} = require('@cumulus/integration-tests');
const {
  loadConfig,
  uploadTestDataToBucket,
  deleteFolder,
  createTimestampedTestId,
  createTestDataPath,
  createTestSuffix
} = require('../../helpers/testUtils');
const { setupTestGranuleForIngest } = require('../../helpers/granuleUtils');
const { waitForModelStatus } = require('../../helpers/apiUtils');

const lambdaStep = new LambdaStep();
// the workflow has no cmrstep
const workflowName = 'IngestGranuleCatchDuplicateErrorTest';

const granuleRegex = '^MOD09GQ\\.A[\\d]{7}\\.[\\w]{6}\\.006\\.[\\d]{13}$';

const s3data = [
  '@cumulus/test-data/granules/MOD09GQ.A2016358.h13v04.006.2016360104606.hdf.met',
  '@cumulus/test-data/granules/MOD09GQ.A2016358.h13v04.006.2016360104606.hdf',
  '@cumulus/test-data/granules/MOD09GQ.A2016358.h13v04.006.2016360104606_ndvi.jpg'
];

describe('When the Ingest Granules workflow is configured\n', () => {
  const inputPayloadFilename = './spec/parallel/ingestGranule/IngestGranule.input.payload.json';
  const providersDir = './data/providers/s3/';
  const collectionsDir = './data/collections/s3_MOD09GQ_006';

  let collection;
  let collectionModel;
  let config;
  let granuleModel;
  let inputPayload;
  let provider;
  let testDataFolder;
  let testSuffix;
  let workflowExecution;

  beforeAll(async () => {
    config = await loadConfig();

    const testId = createTimestampedTestId(config.stackName, 'IngestGranuleDuplicateHandling');
    testSuffix = createTestSuffix(testId);
    testDataFolder = createTestDataPath(testId);

    collection = { name: `MOD09GQ${testSuffix}`, version: '006' };
    provider = { id: `s3_provider${testSuffix}` };

    process.env.CollectionsTable = `${config.stackName}-CollectionsTable`;
    collectionModel = new Collection();

    process.env.GranulesTable = `${config.stackName}-GranulesTable`;
    granuleModel = new Granule();

    // populate collections, providers and test data
    await Promise.all([
      uploadTestDataToBucket(config.bucket, s3data, testDataFolder),
      addCollections(config.stackName, config.bucket, collectionsDir, testSuffix, testId),
      addProviders(config.stackName, config.bucket, providersDir, config.bucket, testSuffix)
    ]);

    const inputPayloadJson = fs.readFileSync(inputPayloadFilename, 'utf8');
    // update test data filepaths
    inputPayload = await setupTestGranuleForIngest(config.bucket, inputPayloadJson, granuleRegex, testSuffix, testDataFolder);

    workflowExecution = await buildAndExecuteWorkflow(
      config.stackName, config.bucket, workflowName, collection, provider, inputPayload
    );
  });

  afterAll(async () => {
    // clean up stack state added by test
    await Promise.all([
      deleteFolder(config.bucket, testDataFolder),
      cleanupCollections(config.stackName, config.bucket, collectionsDir, testSuffix),
      cleanupProviders(config.stackName, config.bucket, providersDir, testSuffix),
      granulesApiTestUtils.deleteGranule({
        prefix: config.stackName,
        granuleId: inputPayload.granules[0].granuleId
      })
    ]);
  });

  describe('to keep both files when encountering duplicate filenames', () => {
    beforeAll(async () => {
      // set collection duplicate handling to 'version'
      await collectionModel.update(collection, { duplicateHandling: 'version' });
    });

    describe('and it encounters data with a duplicated filename with different checksum and there is an existing versioned file', () => {
      let lambdaOutput;
      let updatedFileName;

      beforeAll(async () => {
        // update one of the input files, so that the file has different checksum
        let content = randomString();
        const fileToUpdate = inputPayload.granules[0].files[0];
        let updateParams = {
          Bucket: config.bucket, Key: path.join(fileToUpdate.path, fileToUpdate.name), Body: content
        };

        await s3().putObject(updateParams).promise();
        inputPayload.granules[0].files[0].size = content.length;

        workflowExecution = await buildAndExecuteWorkflow(
          config.stackName, config.bucket, workflowName, collection, provider, inputPayload
        );

        lambdaOutput = await lambdaStep.getStepOutput(workflowExecution.executionArn, 'MoveGranules');

        // update one of the input files, so that the file has different checksum
        content = randomString();
        const file = inputPayload.granules[0].files[0];
        updatedFileName = file.name;
        updateParams = {
          Bucket: config.bucket, Key: path.join(file.path, file.name), Body: content
        };

        await s3().putObject(updateParams).promise();
        inputPayload.granules[0].files[0].size = content.length;

        workflowExecution = await buildAndExecuteWorkflow(
          config.stackName, config.bucket, workflowName, collection, provider, inputPayload
        );
      });

      it('does not raise a workflow error', () => {
        expect(workflowExecution.status).toEqual('SUCCEEDED');
      });

      it('moves the existing data to a file with a suffix to distinguish it from the new file and existing versioned file', async () => {
        lambdaOutput = await lambdaStep.getStepOutput(workflowExecution.executionArn, 'MoveGranules');
        const files = lambdaOutput.payload.granules[0].files;
        expect(files.length).toEqual(6);

        const renamedFiles = files.filter((f) => f.name.startsWith(`${updatedFileName}.v`));
        expect(renamedFiles.length).toEqual(2);
      });

      it('captures all files', async () => {
        const record = await waitForModelStatus(
          granuleModel,
          { granuleId: inputPayload.granules[0].granuleId },
          'completed'
        );
        expect(record.status).toEqual('completed');

        const granuleResponse = await granulesApiTestUtils.getGranule({
          prefix: config.stackName,
          granuleId: inputPayload.granules[0].granuleId
        });

        const granule = JSON.parse(granuleResponse.body);

        expect(granule.files.length).toEqual(6);
      });
    });
  });
});
