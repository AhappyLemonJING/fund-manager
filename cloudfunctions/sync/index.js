const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

var CATEGORIES = [
  { col: 'user_funds',      key: 'code',                    name: 'fundList' },
  { col: 'user_groups',     key: 'groupId',                 name: 'groups' },
  { col: 'user_group_map',  key: 'fundCode',                name: 'groupMap' },
  { col: 'user_trades',     key: ['fundCode', 'tradeId'],   name: 'trades' },
  { col: 'user_overrides',  key: 'fundCode',                name: 'overrides' }
];

exports.main = async function(event, context) {
  var db = cloud.database();
  var openid = cloud.getWXContext().OPENID;
  var input = event.data || {};
  var errors = [];

  // 第 1 步：确保所有集合存在
  for (var c = 0; c < CATEGORIES.length; c++) {
    try {
      await db.createCollection(CATEGORIES[c].col);
      console.log('created: ' + CATEGORIES[c].col);
    } catch (e) {
      // -502005 表示已存在，其他错误记录
      if (e.errCode && e.errCode !== -502005) {
        errors.push('createCollection ' + CATEGORIES[c].col + ': ' + e.message);
      }
    }
  }

  // 第 2 步：并行合并所有分类
  var tasks = CATEGORIES.map(function(cat) {
    return doMerge(db, cat.col, openid, cat.key, input[cat.name] || [], errors)
      .then(function(result) { return { name: cat.name, data: result }; })
      .catch(function(e) { errors.push(cat.col + ' merge: ' + e.message); return { name: cat.name, data: [] }; });
  });

  var results = await Promise.all(tasks);
  var merged = {};
  for (var i = 0; i < results.length; i++) {
    merged[results[i].name] = results[i].data;
  }

  console.log('sync done, errors=' + errors.length);
  return { success: errors.length === 0, data: merged, errors: errors };
};

function doMerge(db, colName, openid, keyFields, localList, errors) {
  var collection = db.collection(colName);
  var makeKey = Array.isArray(keyFields) ?
    function(item) { return keyFields.map(function(k) { return String(item[k] || ''); }).join('::'); } :
    function(item) { return String(item[keyFields] || ''); };

  var now = Date.now();
  var cloudMap = {};

  return collection.where({ _openid: openid }).get().then(function(dbRes) {
    var records = dbRes.data || [];
    for (var i = 0; i < records.length; i++) {
      cloudMap[makeKey(records[i])] = records[i];
    }
  }).catch(function() {}).then(function() {
    var result = [];
    var writePromises = [];

    for (var j = 0; j < localList.length; j++) {
      var local = localList[j];
      var key = makeKey(local);
      var cloudItem = cloudMap[key];
      var localTime = local.updatedAt || 0;
      var cloudTime = (cloudItem && cloudItem.updatedAt) || 0;

      if (!cloudItem || localTime >= cloudTime) {
        var doc = {};
        var lk = Object.keys(local);
        for (var ki = 0; ki < lk.length; ki++) { doc[lk[ki]] = local[lk[ki]]; }
        doc.updatedAt = localTime || now;
        doc._openid = openid;

        if (cloudItem) {
          writePromises.push(
            collection.doc(cloudItem._id).update({ data: doc }).catch(function(e) {
              errors.push(colName + ' update fail [' + key + ']: ' + e.message);
            })
          );
        } else {
          writePromises.push(
            collection.add({ data: doc }).catch(function(e) {
              errors.push(colName + ' add fail [' + key + ']: ' + e.message);
            })
          );
        }
        result.push(local);
      } else {
        var clean = {};
        var ck = Object.keys(cloudItem);
        for (var ci = 0; ci < ck.length; ci++) {
          if (ck[ci] !== '_id' && ck[ci] !== '_openid') clean[ck[ci]] = cloudItem[ck[ci]];
        }
        result.push(clean);
      }
      delete cloudMap[key];
    }

    var remKeys = Object.keys(cloudMap);
    for (var r = 0; r < remKeys.length; r++) {
      var rem = cloudMap[remKeys[r]];
      var clean = {};
      var rk = Object.keys(rem);
      for (var ri = 0; ri < rk.length; ri++) {
        if (rk[ri] !== '_id' && rk[ri] !== '_openid') clean[rk[ri]] = rem[rk[ri]];
      }
      result.push(clean);
    }

    return Promise.all(writePromises).then(function() { return result; });
  });
}
