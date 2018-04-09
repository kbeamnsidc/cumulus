'use strict';

const test = require('ava');
const path = require('path');
const {
  findTestDataDirectory,
  randomString
} = require('@cumulus/common/test-utils');
const { CollectionConfigStore } = require('@cumulus/common');
const { parsePdr } = require('../parse-pdr');
const {
  aws: {
    recursivelyDeleteS3Bucket,
    s3
  }
} = require('@cumulus/common');

test.beforeEach(async (t) => {
  t.context.internalBucket = `internal-bucket-${randomString().slice(0, 6)}`;
  t.context.stackName = `stack-${randomString().slice(0, 6)}`;
  t.context.collectionConfigStore =
    new CollectionConfigStore(t.context.internalBucket, t.context.stackName);

  await s3().createBucket({ Bucket: t.context.internalBucket }).promise();
});

test.afterEach(async (t) => {
  await Promise.all([
    recursivelyDeleteS3Bucket(t.context.internalBucket)
  ]);
});

test('parse-pdr properly parses a simple PDR file', async (t) => {
  const testDataDirectory = await findTestDataDirectory();
  const pdrFilename = path.join(testDataDirectory, 'pdrs', 'MOD09GQ.PDR');

  const pdrName = `${randomString()}.PDR`;

  const collectionConfig = { granuleIdExtraction: '^(.*)\.hdf' };
  await t.context.collectionConfigStore.put('MOD09GQ', collectionConfig);

  const result = await parsePdr(pdrFilename, t.context.collectionConfigStore, pdrName);

  t.is(result.filesCount, 2);
  t.is(result.granulesCount, 1);
  t.is(result.granules.length, 1);
  t.is(result.totalSize, 17909733);

  const granule = result.granules[0];
  t.is(granule.dataType, 'MOD09GQ');

  const hdfFile = result.granules[0].files.find((file) => file.name === 'MOD09GQ.A2017224.h09v02.006.2017227165020.hdf'); // eslint-disable-line max-len
  t.truthy(hdfFile);
  t.is(hdfFile.path, '/MODOPS/MODAPS/EDC/CUMULUS/FPROC/DATA');
  t.is(hdfFile.fileSize, 17865615);
  t.is(hdfFile.checksumType, 'CKSUM');
  t.is(hdfFile.checksumValue, 4208254019);

  const metFile = result.granules[0].files.find((file) => file.name === 'MOD09GQ.A2017224.h09v02.006.2017227165020.hdf.met'); // eslint-disable-line max-len
  t.truthy(metFile);
  t.is(metFile.path, '/MODOPS/MODAPS/EDC/CUMULUS/FPROC/DATA');
  t.is(metFile.fileSize, 44118);
});

test('parse-pdr properly parses PDR with granules of different data-types', async (t) => {
  const testDataDirectory = await findTestDataDirectory();
  const pdrFilename = path.join(testDataDirectory, 'pdrs', 'multi-data-type.PDR');

  const pdrName = `${randomString()}.PDR`;

  const mod09CollectionConfig = {
    granuleIdExtraction: '^(.*)\.hdf'
  };

  const mod87CollectionConfig = {
    granuleIdExtraction: '^PENS-(.*)\.hdf'
  };

  await Promise.all([
    t.context.collectionConfigStore.put('MOD09GQ', mod09CollectionConfig),
    t.context.collectionConfigStore.put('MOD87GQ', mod87CollectionConfig)
  ]);

  const result = await parsePdr(pdrFilename, t.context.collectionConfigStore, pdrName);

  t.is(result.filesCount, 4);
  t.is(result.granulesCount, 2);
  t.is(result.granules.length, 2);
  t.is(result.totalSize, 35819466);

  const mod09Granule = result.granules.find((granule) => granule.dataType === 'MOD09GQ');
  t.truthy(mod09Granule);
  t.is(mod09Granule.granuleId, 'MOD09GQ.A2017224.h09v02.006.2017227165020');
  t.is(mod09Granule.granuleSize, 17909733);

  const mod09HdfFile = mod09Granule.files.find((file) => file.name === 'MOD09GQ.A2017224.h09v02.006.2017227165020.hdf'); // eslint-disable-line max-len
  t.truthy(mod09HdfFile);
  t.is(mod09HdfFile.path, '/MODOPS/MODAPS/EDC/CUMULUS/FPROC/DATA');
  t.is(mod09HdfFile.fileSize, 17865615);
  t.is(mod09HdfFile.checksumType, 'CKSUM');
  t.is(mod09HdfFile.checksumValue, 4208254019);

  const mod09MetFile = mod09Granule.files.find((file) => file.name === 'MOD09GQ.A2017224.h09v02.006.2017227165020.hdf.met'); // eslint-disable-line max-len
  t.truthy(mod09MetFile);
  t.is(mod09MetFile.path, '/MODOPS/MODAPS/EDC/CUMULUS/FPROC/DATA');
  t.is(mod09MetFile.fileSize, 44118);

  const mod87Granule = result.granules.find((granule) => granule.dataType === 'MOD87GQ');
  t.truthy(mod87Granule);
  t.is(mod87Granule.granuleId, 'MOD87GQ.A2017224.h09v02.006.2017227165020');
  t.is(mod87Granule.granuleSize, 17909733);

  const mod87HdfFile = mod87Granule.files.find((file) => file.name === 'PENS-MOD87GQ.A2017224.h09v02.006.2017227165020.hdf'); // eslint-disable-line max-len
  t.truthy(mod87HdfFile);
  t.is(mod87HdfFile.path, '/MODOPS/MODAPS/EDC/CUMULUS/FPROC/DATA');
  t.is(mod87HdfFile.fileSize, 17865615);
  t.is(mod87HdfFile.checksumType, 'CKSUM');
  t.is(mod87HdfFile.checksumValue, 4208254019);

  const mod87MetFile = mod87Granule.files.find((file) => file.name === 'PENS-MOD87GQ.A2017224.h09v02.006.2017227165020.hdf.met'); // eslint-disable-line max-len
  t.truthy(mod87MetFile);
  t.is(mod87MetFile.path, '/MODOPS/MODAPS/EDC/CUMULUS/FPROC/DATA');
  t.is(mod87MetFile.fileSize, 44118);
});