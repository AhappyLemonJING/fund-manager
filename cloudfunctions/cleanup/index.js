const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var AI_CACHE_COLLECTION = 'fund_analysis_cache';
var PAGE_SIZE = 100;
var REMOVE_BATCH_SIZE = 50;

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

function getShanghaiDayKey() {
  try {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    var map = {};
    parts.forEach(function(part) { map[part.type] = part.value; });
    if (map.year && map.month && map.day) return map.year + '-' + map.month + '-' + map.day;
  } catch (e) {}

  var shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.getUTCFullYear() + '-' + pad2(shifted.getUTCMonth() + 1) + '-' + pad2(shifted.getUTCDate());
}

function isCollectionNotExistError(e) {
  var code = e && (e.errCode || e.code);
  var msg = ((e && (e.errMsg || e.message)) || '').toLowerCase();
  return code === -502005 || code === 'DATABASE_COLLECTION_NOT_EXIST' || (msg.indexOf('collection') >= 0 && msg.indexOf('not exist') >= 0) || msg.indexOf('集合不存在') >= 0;
}

async function listAllCacheRecords(collection) {
  var all = [];
  var offset = 0;
  while (true) {
    var res = await collection.orderBy('_id', 'asc').skip(offset).limit(PAGE_SIZE).field({ _id: true, dayKey: true }).get();
    var data = (res && res.data) || [];
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += data.length;
  }
  return all;
}

async function removeRecords(collection, records) {
  for (var i = 0; i < records.length; i += REMOVE_BATCH_SIZE) {
    var batch = records.slice(i, i + REMOVE_BATCH_SIZE);
    await Promise.all(batch.map(function(record) {
      return collection.doc(record._id).remove().catch(function(e) {
        console.error('清理缓存失败 [' + record._id + ']:', e.message || e);
      });
    }));
  }
}

exports.main = async function() {
  var db = cloud.database();
  var collection = db.collection(AI_CACHE_COLLECTION);
  var todayKey = getShanghaiDayKey();
  var records;

  try {
    records = await listAllCacheRecords(collection);
  } catch (e) {
    if (isCollectionNotExistError(e)) {
      return { success: true, deleted: 0, kept: 0, cutoffDayKey: todayKey };
    }
    console.error('读取 AI 缓存集合失败:', e.message || e);
    return { success: false, deleted: 0, kept: 0, cutoffDayKey: todayKey, error: e.message || String(e) };
  }

  var stale = records.filter(function(record) {
    return !record.dayKey || record.dayKey < todayKey;
  });

  await removeRecords(collection, stale);
  console.log('AI 缓存清理完成，删除 ' + stale.length + ' 条，保留 ' + (records.length - stale.length) + ' 条');
  return {
    success: true,
    deleted: stale.length,
    kept: records.length - stale.length,
    cutoffDayKey: todayKey
  };
};
