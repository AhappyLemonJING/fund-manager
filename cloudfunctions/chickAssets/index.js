const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const DOC_ID = 'chick_assets_v2';
const ASSETS = {
  empty: 'chick-empty.webp',
  search: 'chick-search.webp',
  error: 'chick-error.webp',
  ai: 'chick-ai.webp',
  navFund: 'chick-nav-fund.webp',
  navMarket: 'chick-nav-market.webp',
  navDiscover: 'chick-nav-discover.webp'
};
const KEYS = Object.keys(ASSETS);

exports.main = async function(event) {
  const force = !!(event && event.force);
  const db = cloud.database();
  const docRef = db.collection('app_assets').doc(DOC_ID);
  let existing = null;

  try {
    const doc = await docRef.get();
    if (doc && doc.data) existing = doc.data;
  } catch (e) {
    // 首次调用时集合或文档还不存在，继续执行上传
  }

  const hasAll = existing &&
    existing.fileIds &&
    existing.urls &&
    KEYS.every(function(key) { return existing.fileIds[key] && existing.urls[key]; });
  if (!force && hasAll) {
    return { success: true, cached: true, assets: existing.fileIds, urls: existing.urls };
  }

  const fileIds = {};
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[i];
    const filename = ASSETS[key];
    const cloudPath = 'chick-assets/' + filename;
    try {
      const res = await cloud.uploadFile({
        cloudPath: cloudPath,
        fileContent: fs.readFileSync(path.join(__dirname, 'assets', filename))
      });
      fileIds[key] = res.fileID;
      console.log('chickAssets uploaded', key, cloudPath, res.fileID);
    } catch (e) {
      console.error('chickAssets upload failed', key, filename, e.message || e);
      throw e;
    }
  }

  const urlRes = await cloud.getTempFileURL({ fileList: KEYS.map(function(key) { return fileIds[key]; }) });
  const urlList = urlRes.fileList || urlRes.tempFileURLList || [];
  const urls = {};
  for (let i = 0; i < urlList.length; i++) {
    const item = urlList[i];
    if (!item.tempFileURL) continue;
    const key = KEYS.find(function(key) { return fileIds[key] === item.fileID; });
    if (key) urls[key] = item.tempFileURL;
  }

  try {
    await db.createCollection('app_assets');
  } catch (e) {
    // 集合已存在时忽略
  }
  await docRef.set({
    data: {
      fileIds: fileIds,
      urls: urls,
      updatedAt: Date.now(),
      force: force
    }
  });

  console.log('chickAssets ready, count=' + KEYS.length);
  return { success: true, cached: false, assets: fileIds, urls: urls };
};
