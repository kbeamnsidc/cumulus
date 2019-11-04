'use strict';

const fs = require('fs-extra');
const path = require('path');
const { Collection, Granule } = require('@cumulus/api/models');
const { parseS3Uri, s3 } = require('@cumulus/common/aws');
const { LambdaStep } = require('@cumulus/common/sfnStep');
const { randomString } = require('@cumulus/common/test-utils');
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
  getFilesMetadata,
  deleteFolder
} = require('../../helpers/testUtils');
const { waitForModelStatus } = require('../../helpers/apiUtils');

describe('When the Ingest Granules workflow is configured to keep both files when encountering duplicate filenames and it encounters data with a duplicated filename', () => {
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
  let currentFiles;
  let existingFiles;
  let fileNotUpdated;
  let fileUpdated;
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

    // const lambdaOutput = await lambdaStep.getStepOutput(initialWorkflowExecution.executionArn, 'MoveGranules');
    // granulesIngested = lambdaOutput.payload.granules;

    process.env.CollectionsTable = `${config.stackName}-CollectionsTable`;
    await (new Collection()).update(collection, { duplicateHandling: 'version' });

    // Run ingest again, this time with duplicateHandling = version

    workflowExecution = await buildAndExecuteWorkflow(
      config.stackName, config.bucket, workflowName, collection, provider, inputPayload
    );

    moveGranulesTaskInput = await lambdaStep.getStepOutput(workflowExecution.executionArn, 'MoveGranules');
    existingFiles = await getFilesMetadata(moveGranulesTaskInput.payload.granules[0].files);
    // update one of the input files, so that the file has different checksum
    const content = randomString();
    const fileToUpdate = inputPayload.granules[0].files[0];
    fileUpdated = fileToUpdate.name;
    const updateParams = {
      Bucket: config.bucket, Key: path.join(fileToUpdate.path, fileToUpdate.name), Body: content
    };
    fileNotUpdated = inputPayload.granules[0].files[1].name;

    await s3().putObject(updateParams).promise();
    inputPayload.granules[0].files[0].size = content.length;

    workflowExecution = await buildAndExecuteWorkflow(
      config.stackName, config.bucket, workflowName, collection, provider, inputPayload
    );

    // TODO Throw an exception if this returns `undefined`
    moveGranulesTaskOutput = await lambdaStep.getStepOutput(workflowExecution.executionArn, 'MoveGranules');

    currentFiles = await getFilesMetadata(moveGranulesTaskOutput.payload.granules[0].files);

    beforeAllFailed = false;
  });

  it('does not raise a workflow error', () => {
    if (beforeAllFailed) fail('beforeAll() failed');
    else {
      expect(workflowExecution.status).toEqual('SUCCEEDED');
    }
  });

  it('MoveGranules outputs', () => {
    if (beforeAllFailed) fail('beforeAll() failed');
    else {
      expect(currentFiles.length).toEqual(5);
    }
  });

  describe('encounters a duplicated filename with different checksum', () => {
    it('moves the existing data to a file with a suffix to distinguish it from the new file', async () => {
      if (beforeAllFailed) fail('beforeAll() failed');
      else {
        const renamedFiles = currentFiles.filter((f) => path.basename(parseS3Uri(f.filename).Key).startsWith(`${fileUpdated}.v`));
        expect(renamedFiles.length).toEqual(1);

        const expectedRenamedFileSize = existingFiles.filter((f) => f.filename.endsWith(fileUpdated))[0].size;
        expect(renamedFiles[0].size).toEqual(expectedRenamedFileSize);
      }
    });

    it('captures both files', async () => {
      if (beforeAllFailed) fail('beforeAll() failed');
      else {
        process.env.GranulesTable = `${config.stackName}-GranulesTable`;
        const record = await waitForModelStatus(
          new Granule(),
          { granuleId: inputPayload.granules[0].granuleId },
          'completed'
        );
        expect(record.status).toEqual('completed');

        const granuleResponse = await granulesApi.getGranule({
          prefix: config.stackName,
          granuleId: inputPayload.granules[0].granuleId
        });
        const granule = JSON.parse(granuleResponse.body);
        expect(granule.files.length).toEqual(5);
        console.log('granule.files:', JSON.stringify(granule.files, null, 2));
      }
    });

    describe('encounters data with a duplicated filename with duplicate checksum', () => {
      it('does not create a copy of the file', () => {
        if (beforeAllFailed) fail('beforeAll() failed');
        else {
          expect(currentFiles.filter((f) => f.filename.endsWith(fileNotUpdated)))
            .toEqual(existingFiles.filter((f) => f.filename.endsWith(fileNotUpdated)));
        }
      });
    });
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
