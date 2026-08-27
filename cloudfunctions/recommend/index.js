/*
 * 云函数：每日建仓基金推荐
 *
 * 入参:
 * {
 *   type: 'daily',
 *   excludeCodes: ['000001'], // 已持仓/自选，避免重复推荐
 *   count: 5                 // 返回数量，默认 5
 * }
 *
 * 返回:
 * {
 *   date, aiPowered, generatedAt, marketContext, recommendations
 * }
 *
 * DeepSeek 未配置或调用失败时，自动降级为规则评分。
 */

const cloud = require('wx-server-sdk');
const https = require('https');
const url = require('url');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const CACHE_COLLECTION = 'fund_recommend_cache';
const DEFAULT_COUNT = 5;
const MAX_PROFILES = 7;
const MAX_HOLDING_NEWS_STOCKS = 3;
const CONCURRENCY = 4;

const GROWTH_RANK_SORTS = [
  { ft: 'gp', sc: '1nzf', label: '股票型', pages: [1], mode: 'growth' },
  { ft: 'hh', sc: '6yzf', label: '混合型', pages: [1], mode: 'growth' },
  { ft: 'zs', sc: '1yzf', label: '指数型', pages: [1], mode: 'growth' }
];

// 从排名中后段补入价值/低估风格，避免只取近期涨幅最高的基金。
const VALUE_RANK_SORTS = [
  { ft: 'gp', sc: '1nzf', label: '股票型', pages: [2, 3], mode: 'value' },
  { ft: 'hh', sc: '6yzf', label: '混合型', pages: [2, 3], mode: 'value' },
  { ft: 'zs', sc: '1yzf', label: '指数型', pages: [2, 3, 4], mode: 'value' }
];

const CANDIDATE_SOURCES = GROWTH_RANK_SORTS.concat(VALUE_RANK_SORTS);

const VALUE_KEYWORDS = [
  '价值', '红利', '低波', '股息', '金融', '银行', '保险', '券商', '证券',
  '地产', '房地产', '基建', '建材', '能源', '资源', '煤炭', '石油', '电力',
  '公用', '央企', '国企', '中特估', '高股息', '红利低波', '沪深300价值',
  '上证50', '中证100', '恒生高股息', '钢铁', '家电', '港股通高股息'
];

const SECTOR_KEYWORDS = [
  '白酒', '新能源', '半导体', '芯片', '医药', '医疗', '军工',
  '银行', '证券', '保险', '汽车', '人工智能', 'AI', '消费',
  '科技', '传媒', '游戏', '地产', '煤炭', '电力', '有色',
  '钢铁', '农业', '环保', '食品饮料', '家电', '通信', '计算机',
  '光伏', '锂电', '储能', '机器人', '红利', '黄金', '港股', '纳指'
];

// 推荐理由中使用的轻量关键词规则，不替代 analyze 的完整引擎。
const BULLISH_KW = [
  { kw: '回购', score: 3 }, { kw: '增持', score: 3 },
  { kw: '中标', score: 3 }, { kw: '分红', score: 2 },
  { kw: '超预期', score: 3 }, { kw: '扭亏为盈', score: 3 },
  { kw: '战略合作', score: 2 }, { kw: '订单', score: 2 },
  { kw: '突破', score: 2 }, { kw: '获批', score: 2 },
  { kw: '业绩.*增长', score: 3, regex: true },
  { kw: '营收.*增长', score: 2, regex: true },
  { kw: '利润.*增长', score: 2, regex: true },
  { kw: '政策.*扶持', score: 2, regex: true },
  { kw: '利好', score: 2 }
];

const BEARISH_KW = [
  { kw: '减持', score: 3 }, { kw: '质押', score: 2 },
  { kw: '冻结', score: 3 }, { kw: '预亏', score: 3 },
  { kw: '亏损', score: 3 }, { kw: '退市', score: 3 },
  { kw: '诉讼', score: 2 }, { kw: '处罚', score: 2 },
  { kw: '调查', score: 2 }, { kw: '立案', score: 2 },
  { kw: '业绩.*下降', score: 3, regex: true },
  { kw: '营收.*下降', score: 3, regex: true },
  { kw: '利润.*下降', score: 3, regex: true },
  { kw: '订单.*取消', score: 3, regex: true },
  { kw: '利空', score: 2 }
];

const NEUTRAL_COLUMNS = [
  '股东大会', '董事会决议', '监事会决议', '社会责任', '定期报告',
  '年度报告', '半年度报告', '季度报告', '章程', '制度', '议事规则',
  '独立董事', '聘任', '担保', '授信', '关联交易', '权益分派',
  '分红实施', '会计政策', '会计估计', '续聘', '审计机构'
];

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
    if (map.year && map.month && map.day) {
      return map.year + '-' + map.month + '-' + map.day;
    }
  } catch (e) {}

  var shifted = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return shifted.getUTCFullYear() + '-' + pad2(shifted.getUTCMonth() + 1) + '-' + pad2(shifted.getUTCDate());
}

function isCollectionExistsError(e) {
  var code = e && (e.errCode || e.code);
  var msg = ((e && (e.errMsg || e.message)) || '').toLowerCase();
  return code === -502005 ||
    code === 'ResourceUnavailable.ResourceExist' ||
    msg.indexOf('exist') >= 0 ||
    msg.indexOf('已存在') >= 0;
}

function isDocumentNotExistError(e) {
  var code = e && (e.errCode || e.code);
  var msg = ((e && (e.errMsg || e.message)) || '').toLowerCase();
  return code === -502004 ||
    code === 'DATABASE_DOCUMENT_NOT_EXIST' ||
    code === 'DOCUMENT_NOT_FOUND' ||
    msg.indexOf('not exist') >= 0 ||
    msg.indexOf('not found') >= 0 ||
    msg.indexOf('不存在') >= 0;
}

async function ensureCacheCollection() {
  try {
    await cloud.database().createCollection(CACHE_COLLECTION);
  } catch (e) {
    if (!isCollectionExistsError(e)) {
      console.error('创建推荐缓存集合失败:', e.message || e);
    }
  }
}

async function readCached(dayKey) {
  await ensureCacheCollection();
  var cacheId = 'daily_' + dayKey;
  try {
    var res = await cloud.database().collection(CACHE_COLLECTION).doc(cacheId).get();
    var record = res && res.data;
    if (record && record.dayKey === dayKey && record.result && record.result.recommendations) {
      record.result.cachedFromCloud = true;
      return record.result;
    }
  } catch (e) {
    if (!isDocumentNotExistError(e)) {
      console.error('读取推荐缓存失败:', e.message || e);
    }
  }
  return null;
}

async function writeCached(dayKey, result) {
  if (!result || !result.recommendations || result.aiPowered !== true) return;
  try {
    await ensureCacheCollection();
    var cacheId = 'daily_' + dayKey;
    await cloud.database().collection(CACHE_COLLECTION).doc(cacheId).set({
      data: {
        dayKey: dayKey,
        updatedAt: Date.now(),
        result: result
      }
    });
  } catch (e) {
    console.error('写入推荐缓存失败:', e.message || e);
  }
}

function fetchText(urlString, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    var parsed;
    try {
      parsed = new URL(urlString);
    } catch (e) {
      return resolve({ ok: false, error: e.message });
    }

    var req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: opts.timeout || 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': opts.referer || 'https://fund.eastmoney.com/',
        'Accept': opts.accept || 'application/json,text/plain,*/*'
      }
    }, function(res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        resolve({ ok: true, body: body, statusCode: res.statusCode });
      });
    });

    req.setTimeout(opts.timeout || 12000, function() {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.on('error', function(e) {
      resolve({ ok: false, error: e.message });
    });
    req.end();
  });
}

function fetchBuffer(urlString, opts) {
  opts = opts || {};
  return new Promise(function(resolve) {
    var parsed;
    try {
      parsed = new URL(urlString);
    } catch (e) {
      return resolve({ ok: false, error: e.message });
    }

    var req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: opts.timeout || 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': opts.referer || 'https://finance.sina.com.cn/',
        'Accept': opts.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    }, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        resolve({ ok: true, body: Buffer.concat(chunks), statusCode: res.statusCode });
      });
    });

    req.setTimeout(opts.timeout || 12000, function() {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
    req.on('error', function(e) {
      resolve({ ok: false, error: e.message });
    });
    req.end();
  });
}

async function fetchJSON(urlString, opts) {
  var res = await fetchText(urlString, opts);
  if (!res.ok) return { error: res.error };
  try {
    return JSON.parse(res.body);
  } catch (e) {
    return { error: e.message };
  }
}

function parseRankBody(body) {
  if (!body) return { error: 'empty body' };
  try {
    var start = body.indexOf('{');
    var end = body.lastIndexOf('}');
    if (start < 0 || end < start) return { error: 'parse fail' };
    var jsonStr = body.substring(start, end + 1);
    jsonStr = jsonStr.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*:)/g, '$1"$2"$3');
    var data = JSON.parse(jsonStr);
    if (data.ErrCode && data.ErrCode !== 0) {
      return { error: data.Data || ('rank err ' + data.ErrCode) };
    }
    return {
      datas: data.datas || [],
      allPages: data.allPages || 1,
      allNum: data.allNum || 0
    };
  } catch (e) {
    return { error: e.message };
  }
}

function parseRankItem(raw, typeLabel) {
  if (!raw) return null;
  var parts = raw.split(',');
  if (parts.length < 10) return null;

  var code = (parts[0] || '').trim();
  var name = (parts[1] || '').trim();
  if (!/^\d{6}$/.test(code) || !name) return null;

  var nav = parseFloat(parts[4]) || 0;
  var dailyPct = parseFloat(parts[6]) || 0;
  var m1 = parseFloat(parts[8]) || 0;
  var m3 = parseFloat(parts[9]) || 0;
  var m6 = parseFloat(parts[10]) || 0;
  var y1 = parseFloat(parts[11]) || 0;
  var ytd = parseFloat(parts[14]) || 0;

  var sizeNum = 0;
  if (parts.length > 18) {
    var cleaned = (parts[18] || '').replace('%', '').trim();
    if (/^\d+(\.\d+)?$/.test(cleaned)) sizeNum = parseFloat(cleaned) || 0;
  }

  if (nav <= 0) return null;

  return {
    code: code,
    name: name,
    type: typeLabel || '基金',
    nav: nav,
    dailyPct: dailyPct,
    perf: { m1: m1, m3: m3, m6: m6, y1: y1, ytd: ytd },
    fundSize: sizeNum,
    valueStyle: isValueCandidate(name)
  };
}

function isValueCandidate(name) {
  if (!name) return false;
  for (var i = 0; i < VALUE_KEYWORDS.length; i++) {
    if (name.indexOf(VALUE_KEYWORDS[i]) >= 0) return true;
  }
  return false;
}

function isOverheated(item) {
  var perf = item && item.perf ? item.perf : {};
  if ((item && item.dailyPct) > 6) return true;
  if ((perf.m1 || 0) > 18) return true;
  if ((perf.m3 || 0) > 35) return true;
  if ((perf.y1 || 0) > 60) return true;
  return false;
}

function buildRankUrl(sort) {
  var today = new Date();
  var ed = new Date(today.getTime() - 86400000);
  var sd = new Date(today.getTime() - 366 * 86400000);
  var sdStr = sd.getFullYear() + '-' + pad2(sd.getMonth() + 1) + '-' + pad2(sd.getDate());
  var edStr = ed.getFullYear() + '-' + pad2(ed.getMonth() + 1) + '-' + pad2(ed.getDate());
  return 'https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=' + sort.ft +
    '&rs=&gs=0&sc=' + sort.sc + '&st=' + (sort.st || 'desc') +
    '&sd=' + sdStr + '&ed=' + edStr +
    '&qdii=&tabSubtype=,,,,,&pi=' + (sort.pi || 1) + '&pn=' + (sort.pn || 30) + '&dx=1&v=' + Date.now();
}

async function getRankCandidates(excludeCodes) {
  var excludeMap = {};
  (excludeCodes || []).forEach(function(code) {
    excludeMap[String(code).replace(/\D/g, '')] = true;
  });

  var candidates = {};
  var tasks = [];

  CANDIDATE_SOURCES.forEach(function(sort) {
    (sort.pages || [1]).forEach(function(page) {
      var pageSort = Object.assign({}, sort, { pi: page, pn: 30 });
      tasks.push(
        fetchText(buildRankUrl(pageSort), { timeout: 10000 }).then(function(res) {
          if (!res.ok) return;
          var parsed = parseRankBody(res.body);
          if (parsed.error || !parsed.datas) return;

          parsed.datas.forEach(function(raw) {
            var item = parseRankItem(raw, sort.label);
            if (!item || excludeMap[item.code]) return;

            // 规模未知时保留；已知但过小则过滤。
            if (item.fundSize > 0 && item.fundSize < 0.5) return;

            // 价值池只保留价值/低估风格；成长池避免把明显过热产品继续塞入短名单。
            if (sort.mode === 'value' && !item.valueStyle) return;
            if (sort.mode === 'growth' && isOverheated(item)) return;

            if (!candidates[item.code] || coarseScore(item) > coarseScore(candidates[item.code])) {
              candidates[item.code] = item;
            }
          });
        })
      );
    });
  });

  await Promise.all(tasks);
  return Object.keys(candidates).map(function(code) {
    return candidates[code];
  });
}

function clamp(val, min, max) {
  if (isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

function coarseScore(item) {
  var perf = item.perf || {};
  var score = 50;
  score += clamp(perf.m1 || 0, -10, 20) * 0.5;
  score += clamp(perf.m3 || 0, -15, 30) * 0.8;
  score += clamp(perf.m6 || 0, -20, 40) * 0.6;
  score += clamp(perf.y1 || 0, -25, 50) * 0.35;
  score += clamp(perf.ytd || 0, -20, 40) * 0.3;
  if (item.valueStyle) score += 12;
  if (isOverheated(item)) score -= 16;
  else if (item.dailyPct < -6) score += 4;
  return score;
}

async function fetchIndices() {
  var snUrl = 'https://hq.sinajs.cn/list=sh000001,sz399001,sz399006,sh000688';
  var res = await fetchBuffer(snUrl, {
    timeout: 8000,
    referer: 'https://finance.sina.com.cn/'
  });
  if (!res.ok) return [];

  var body;
  try {
    body = new TextDecoder('gbk').decode(res.body);
  } catch (e) {
    body = res.body.toString();
  }

  var indices = [];
  body.split('\n').filter(Boolean).forEach(function(line) {
    var m = line.match(/"([^"]*)"/);
    if (!m) return;
    var parts = m[1].split(',');
    if (parts.length < 4) return;
    var prevClose = parseFloat(parts[2]) || 0;
    var price = parseFloat(parts[3]) || 0;
    var changePct = prevClose > 0 ? (price - prevClose) / prevClose * 100 : 0;
    var codeMatch = line.match(/hq_str_(?:sh|sz)(\d+)/);
    indices.push({
      code: codeMatch ? codeMatch[1] : '',
      name: parts[0],
      price: price,
      changePct: parseFloat(changePct.toFixed(2))
    });
  });
  return indices;
}

async function fetchSectors() {
  var data = await fetchJSON('https://push2delay.eastmoney.com/api/qt/clist/get?fid=f3&po=1&pz=20&pn=1&np=1&fltt=2&invt=2&fs=m:90+t:2&fields=f2,f3,f4,f12,f14', { timeout: 8000 });
  var list = (data && data.data && data.data.diff) || [];
  return list.map(function(item) {
    return {
      code: item.f12,
      name: item.f14,
      changePct: item.f3,
      change: item.f4,
      price: item.f2
    };
  });
}

async function getMarketContext() {
  var indices = [];
  var sectors = [];
  var results = await Promise.all([
    fetchIndices().catch(function() { return []; }),
    fetchSectors().catch(function() { return []; })
  ]);
  indices = results[0];
  sectors = results[1];

  var topSectors = sectors
    .filter(function(s) { return typeof s.changePct === 'number' && isFinite(s.changePct); })
    .sort(function(a, b) { return b.changePct - a.changePct; })
    .slice(0, 5)
    .map(function(s) { return { name: s.name, changePct: s.changePct }; });

  return {
    indices: indices,
    topSectors: topSectors,
    summary: {
      upCount: indices.filter(function(i) { return i.changePct >= 0; }).length,
      downCount: indices.filter(function(i) { return i.changePct < 0; }).length,
      topSector: topSectors[0] || null
    }
  };
}

function parseHoldingsStocks(body) {
  if (!body) return [];
  var content = '';
  var cS = body.indexOf('content:"');
  var cE = body.indexOf('",arryear');
  if (cE < 0) cE = body.indexOf('",curyear');
  if (cS >= 0 && cE > cS) {
    content = body.substring(cS + 9, cE);
  }
  if (!content) {
    var tb = body.indexOf('<tbody>');
    if (tb >= 0) {
      var te = body.indexOf('</tbody>', tb);
      if (te > tb) content = body.substring(tb, te + 8);
    }
  }
  if (!content) return [];

  var stocks = [];
  var tm = content.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tm) return [];

  tm[1].split('</tr>').forEach(function(row) {
    var td = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!td || td.length < 5) return;
    var cells = td.map(function(c) { return c.replace(/<[^>]+>/g, '').trim(); });
    var code = (cells[1] || '').replace(/[^\d]/g, '');
    var name = (cells[2] || '').replace(/\s+/g, '');
    var weight = parseFloat((cells[cells.length - 3] || '').replace('%', '')) || 0;
    if (code && name && weight > 0 && stocks.length < 10) {
      stocks.push({ code: code, name: name, weight: weight });
    }
  });
  return stocks;
}

function deriveSectorFromName(name) {
  if (!name) return [];
  var sectors = [];
  SECTOR_KEYWORDS.forEach(function(kw) {
    if (name.indexOf(kw) >= 0 && sectors.indexOf(kw) < 0) sectors.push(kw);
  });
  return sectors.slice(0, 3);
}

function buildStockNewsUrl(stockCode) {
  var cn = String(stockCode).replace(/[^0-9]/g, '');
  var ex = /^60[0-3]/.test(cn) || /^68/.test(cn) ? 'SHA' : 'SZA';
  return {
    url: 'https://np-anotice-stock.eastmoney.com/api/security/ann?page_size=10&page_index=1&ann_type=' + ex + '&stock_list=' + cn,
    wscnFallback: /^0\d{4}$/.test(cn)
  };
}

function parseStockNews(data) {
  var list = (data && data.data && data.data.list) || [];
  var now = new Date();
  var news = [];
  list.forEach(function(item) {
    var m = (item.display_time || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return;
    var t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    var h = (now - t) / 36e5;
    if (h < 0 || h > 168) return;
    news.push({
      title: item.title_ch || item.title || '',
      column: (item.columns && item.columns[0]) ? item.columns[0].column_name : '',
      time: item.display_time || ''
    });
  });
  if (!news.length && list.length) {
    for (var i = 0; i < Math.min(2, list.length); i++) {
      news.push({
        title: list[i].title_ch || list[i].title || '',
        column: '',
        time: list[i].display_time || '',
        stale: true
      });
    }
  }
  return news;
}

function parseWscnNews(data, stockName) {
  var items = (data && data.data && data.data.items) || [];
  var now = new Date();
  var kw = stockName ? [stockName.substring(0, Math.min(4, stockName.length))] : [''];
  var news = [];
  items.forEach(function(item) {
    var text = item.content_text || '';
    if (!text) return;
    if (!kw.some(function(k) { return !k || text.indexOf(k) >= 0; })) return;
    var d = new Date((item.display_time || 0) * 1000);
    if (isNaN(d.getTime())) return;
    var h = (now - d) / 36e5;
    if (h < 0 || h > 168) return;
    news.push({
      title: text.length > 100 ? text.substring(0, 100) + '...' : text,
      column: '市场快讯',
      time: d.toISOString()
    });
  });
  return news;
}

async function fetchStockNews(code, name) {
  var stockCode = String(code).replace(/[^0-9]/g, '');
  var info = buildStockNewsUrl(stockCode);
  var data = await fetchJSON(info.url, { timeout: 6000 });
  if (data.error) return [];
  if (info.wscnFallback) {
    var wscnData = await fetchJSON('https://api-one.wallstcn.com/apiv1/content/lives?channel=global-channel,hk-stock-channel,a-stock-channel&client=pc&limit=50&first_page=true', { timeout: 6000 });
    return parseWscnNews(wscnData, name);
  }
  return parseStockNews(data);
}

function classifyNewsText(text, column) {
  column = column || '';
  var neutralReasons = [];
  for (var i = 0; i < NEUTRAL_COLUMNS.length; i++) {
    if (column.indexOf(NEUTRAL_COLUMNS[i]) >= 0 || text.indexOf(NEUTRAL_COLUMNS[i]) >= 0) {
      return { type: 'neutral', reason: '例行公告' };
    }
  }

  var bullScore = 0;
  var bullKw = '';
  BULLISH_KW.forEach(function(item) {
    var matched = item.regex ? new RegExp(item.kw).test(text) : text.indexOf(item.kw) >= 0;
    if (matched && item.score > bullScore) {
      bullScore = item.score;
      bullKw = item.kw;
    }
  });

  var bearScore = 0;
  var bearKw = '';
  BEARISH_KW.forEach(function(item) {
    var matched = item.regex ? new RegExp(item.kw).test(text) : text.indexOf(item.kw) >= 0;
    if (matched && item.score > bearScore) {
      bearScore = item.score;
      bearKw = item.kw;
    }
  });

  if (bullScore > bearScore) return { type: 'bullish', reason: bullKw };
  if (bearScore > bullScore) return { type: 'bearish', reason: bearKw };
  return { type: 'neutral', reason: '无明确情绪信号' };
}

async function mapLimit(items, limit, fn) {
  var results = [];
  var index = 0;

  async function worker() {
    while (index < items.length) {
      var current = index++;
      results[current] = await fn(items[current], current);
    }
  }

  var workers = [];
  var workerCount = Math.min(limit || 1, items.length || 1);
  for (var i = 0; i < workerCount; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

async function enrichProfile(profile, market) {
  var enriched = Object.assign({}, profile, {
    stocks: [],
    sectors: [],
    sentiment: { bull: 0, bear: 0, neu: 0, bullRatio: 0, bearRatio: 0 },
    newsEvidence: [],
    evidence: [],
    score: 0,
    risk: '中',
    reason: '',
    positionHint: '建议首次建仓 5%-10%',
    tags: []
  });

  var holdingsRes = await fetchText('https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=' + enriched.code + '&topline=10&year=&month=&rt=' + Date.now(), { timeout: 5000 });
  if (holdingsRes.ok) {
    enriched.stocks = parseHoldingsStocks(holdingsRes.body);
  }

  var namedSectors = deriveSectorFromName(enriched.name);
  if (enriched.stocks.length === 0 && namedSectors.length > 0) {
    enriched.sectors = namedSectors;
  }

  var topStocks = enriched.stocks.slice(0, MAX_HOLDING_NEWS_STOCKS);
  var newsByStock = await mapLimit(topStocks, Math.min(3, CONCURRENCY), function(stock) {
    return fetchStockNews(stock.code, stock.name).catch(function() {
      return [];
    }).then(function(news) {
      return { code: stock.code, name: stock.name, news: news };
    });
  });

  var bull = 0;
  var bear = 0;
  var neu = 0;
  newsByStock.forEach(function(item) {
    item.news.forEach(function(n) {
      var text = (n.title || '') + ' ' + (n.column || '');
      var label = classifyNewsText(text, n.column || '');
      if (label.type === 'bullish') bull++;
      else if (label.type === 'bearish') bear++;
      else neu++;

      if (label.type !== 'neutral') {
        enriched.newsEvidence.push({
          title: n.title,
          type: label.type,
          stockName: item.name
        });
      }
    });
  });

  var total = bull + bear + neu;
  var bullRatio = total > 0 ? bull / total : 0;
  var bearRatio = total > 0 ? bear / total : 0;
  enriched.sentiment = {
    bull: bull,
    bear: bear,
    neu: neu,
    bullRatio: bullRatio,
    bearRatio: bearRatio
  };

  enriched.tags = enriched.sectors.slice(0, 2);
  if (enriched.valueStyle) enriched.tags.push('价值/低估');
  else if (enriched.perf.m3 > 0) enriched.tags.push('中期趋势向上');
  if (bullRatio > 0.45) enriched.tags.push('重仓股情绪偏多');
  if (enriched.tags.length === 0) enriched.tags = ['估值性价比候选'];

  return enriched;
}

async function buildShortlist(candidates, market) {
  if (!candidates || candidates.length === 0) return [];

  var seenSector = {};
  var shortlist = [];

  function pickDiversified(list, limit) {
    for (var i = 0; i < list.length && shortlist.length < limit; i++) {
      var item = list[i];
      if (shortlist.some(function(existing) { return existing.code === item.code; })) continue;
      var nameSectors = deriveSectorFromName(item.name);
      var sectorKey = nameSectors[0] || 'other';
      if (seenSector[sectorKey] >= 2) continue;
      shortlist.push(item);
      seenSector[sectorKey] = (seenSector[sectorKey] || 0) + 1;
    }
  }

  var valueCandidates = candidates.filter(function(item) {
    return item.valueStyle;
  }).sort(function(a, b) {
    return coarseScore(b) - coarseScore(a);
  });
  var growthCandidates = candidates.filter(function(item) {
    return !item.valueStyle;
  }).sort(function(a, b) {
    return coarseScore(b) - coarseScore(a);
  });

  // 优先给价值/低估池保留名额，剩余名额再给成长/趋势池。
  var valueTarget = Math.max(0, Math.min(4, valueCandidates.length));
  pickDiversified(valueCandidates, valueTarget);
  pickDiversified(growthCandidates, MAX_PROFILES);

  if (shortlist.length < MAX_PROFILES) {
    var rest = candidates.slice().sort(function(a, b) {
      return coarseScore(b) - coarseScore(a);
    });
    pickDiversified(rest, MAX_PROFILES);
  }

  var profiles = await mapLimit(shortlist, CONCURRENCY, function(item) {
    return enrichProfile(item, market).catch(function(e) {
      console.error('基金画像富化失败:', item.code, e.message || e);
      return Object.assign({}, item, {
        stocks: [],
        sectors: deriveSectorFromName(item.name),
        sentiment: { bull: 0, bear: 0, neu: 0, bullRatio: 0, bearRatio: 0 },
        newsEvidence: [],
        evidence: [],
        score: 0,
        risk: '中',
        reason: '暂未获取到重仓股新闻，主要依据近期净值表现。',
        positionHint: '建议首次建仓 5%-10%',
        tags: isValueCandidate(item.name)
          ? ['价值/低估'].concat(deriveSectorFromName(item.name).slice(0, 1))
          : deriveSectorFromName(item.name).slice(0, 2)
      });
    });
  });

  return profiles;
}

function buildEvidence(profile) {
  var evidence = [];
  var perf = profile.perf || {};
  if (profile.valueStyle) evidence.push('价值/低估风格');
  if (perf.m1 != null) evidence.push('近1月 ' + formatPct(perf.m1));
  if (perf.m3 != null) evidence.push('近3月 ' + formatPct(perf.m3));
  if (perf.m6 != null) evidence.push('近6月 ' + formatPct(perf.m6));
  if (profile.sentiment && profile.sentiment.bullRatio > 0.45) {
    evidence.push('重仓股情绪偏多 ' + Math.round(profile.sentiment.bullRatio * 100) + '%');
  }
  if (profile.newsEvidence && profile.newsEvidence.length > 0) {
    evidence.push('近期信号: ' + profile.newsEvidence.slice(0, 1).map(function(n) {
      return (n.type === 'bullish' ? '利好' : '利空') + ' ' + n.title.substring(0, 16);
    }).join(''));
  }
  return evidence.slice(0, 4);
}

function formatPct(val) {
  if (val == null || isNaN(val)) return '--';
  return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
}

function scoreWithRules(profile, market) {
  var perf = profile.perf || {};
  var score = 50;
  score += clamp(perf.m1 || 0, -10, 20) * 0.7;
  score += clamp(perf.m3 || 0, -15, 30) * 0.9;
  score += clamp(perf.m6 || 0, -20, 40) * 0.7;
  score += clamp(perf.y1 || 0, -25, 50) * 0.4;
  score += clamp(perf.ytd || 0, -20, 40) * 0.4;
  if (profile.valueStyle) score += 10;
  if (isOverheated(profile)) score -= 12;

  if (profile.sentiment) {
    score += profile.sentiment.bullRatio * 20;
    score -= profile.sentiment.bearRatio * 25;
  }

  if (market && market.topSectors && market.topSectors.length > 0) {
    var topSectorNames = market.topSectors.slice(0, 3).map(function(s) { return s.name; });
    var hasHotSector = (profile.sectors || []).some(function(s) {
      return topSectorNames.indexOf(s) >= 0;
    });
    if (hasHotSector) score += 8;
  }

  return Math.max(0, Math.min(99, Math.round(score)));
}

function buildFallbackResult(shortlist, market, candidateCount) {
  var recommendations = shortlist
    .map(function(profile) {
      var score = scoreWithRules(profile, market);
      var perf = profile.perf || {};
      var reasonParts = [];
      if (profile.valueStyle) {
        reasonParts.push('价值/低估风格，估值性价比相对更优');
      }
      if (perf.m3 > 0 && !isOverheated(profile)) {
        reasonParts.push('近3月上涨 ' + formatPct(perf.m3));
      } else if (perf.m3 <= 0) {
        reasonParts.push('近期涨幅不高，估值拥挤度相对较低');
      }
      if (profile.sentiment && profile.sentiment.bullRatio > 0.4) {
        reasonParts.push('重仓股近期利好信号偏多');
      }
      if (profile.sectors && profile.sectors.length > 0) {
        reasonParts.push('主要聚焦 ' + profile.sectors.join('、'));
      }
      if (reasonParts.length === 0) reasonParts.push('估值性价比候选，具备一定安全边际');

      return {
        code: profile.code,
        name: profile.name,
        type: profile.type,
        nav: profile.nav,
        dailyPct: profile.dailyPct,
        perf: perf,
        fundSize: profile.fundSize,
        score: score,
        risk: score >= 80 ? '中高' : '中',
        reason: reasonParts.join('，') + '。',
        positionHint: '建议首次建仓 5%-10%',
        tags: profile.tags || profile.sectors.slice(0, 2),
        evidence: buildEvidence(profile)
      };
    })
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, DEFAULT_COUNT);

  return {
    date: getShanghaiDayKey(),
    aiPowered: false,
    generatedAt: Date.now(),
    marketContext: market,
    candidateCount: candidateCount,
    recommendations: recommendations
  };
}

function buildProfilePrompt(profiles, market) {
  var lines = [];
  lines.push('【当前市场】');
  lines.push('大盘指数: ' + (market.indices || []).map(function(i) {
    return i.name + ' ' + (i.changePct >= 0 ? '+' : '') + i.changePct.toFixed(2) + '%';
  }).join('，'));
  lines.push('强势行业: ' + (market.topSectors || []).map(function(s) {
    return s.name + ' ' + (s.changePct >= 0 ? '+' : '') + s.changePct.toFixed(2) + '%';
  }).join('，'));
  lines.push('');
  lines.push('【候选基金】');
  profiles.forEach(function(p, idx) {
    var perf = p.perf || {};
    lines.push((idx + 1) + '. ' + p.name + '(' + p.code + ')，类型: ' + p.type +
      '，风格: ' + (p.valueStyle ? '价值/低估' : '成长/趋势') +
      '，净值: ' + p.nav.toFixed(4) + '，当日: ' + formatPct(p.dailyPct) +
      '，近1月: ' + formatPct(perf.m1) + '，近3月: ' + formatPct(perf.m3) +
      '，近6月: ' + formatPct(perf.m6) + '，近1年: ' + formatPct(perf.y1));
    if (p.fundSize > 0) lines.push('   规模: ' + p.fundSize.toFixed(2) + '亿元');
    if (p.stocks && p.stocks.length > 0) {
      lines.push('   重仓股: ' + p.stocks.slice(0, 5).map(function(s) {
        return s.name + '(' + s.weight + '%)';
      }).join('、'));
    }
    if (p.sentiment) {
      lines.push('   新闻情绪: 利好' + p.sentiment.bull + '/利空' + p.sentiment.bear + '/中性' + p.sentiment.neu);
    }
    if (p.newsEvidence && p.newsEvidence.length > 0) {
      lines.push('   近期信号: ' + p.newsEvidence.slice(0, 3).map(function(n) {
        return (n.type === 'bullish' ? '利好' : '利空') + ' ' + n.title;
      }).join('；'));
    }
  });
  lines.push('');
  lines.push('请从候选基金中挑选最适合“当日建仓”的基金，最多返回 5 只。');
  lines.push('优先选择估值性价比更高、拥挤度更低、价值/低估风格更明确的基金。');
  lines.push('近期涨幅高不等于适合建仓，已经明显过热的产品应降低评分或直接排除。');
  lines.push('评分要综合估值性价比、中期趋势、当日位置、行业景气、新闻情绪和风险。');
  lines.push('输出纯 JSON，不要 markdown 代码块，格式如下：');
  lines.push('{"recommendations":[{"code":"6位基金代码","score":0-100,"risk":"低|中|高","reason":"80-150字理由","positionHint":"建议首次建仓比例","tags":["标签"],"evidence":["依据"]}]}');
  return lines.join('\n');
}

function callDeepSeekRecommend(profiles, market) {
  return new Promise(function(resolve, reject) {
    var apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'sk-xxxxxxxxxxxxxxxx' || apiKey.length < 10) {
      return reject(new Error('DEEPSEEK_API_KEY 未配置或无效'));
    }

    var postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是专业的基金投资顾问，擅长筛选适合建仓的基金。输出必须是合法 JSON，不要输出额外文字。'
        },
        {
          role: 'user',
          content: buildProfilePrompt(profiles, market)
        }
      ],
      temperature: 0.3,
      max_tokens: 1800,
      stream: false
    });

    var parsedUrl = url.parse('https://api.deepseek.com/v1/chat/completions');
    var req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData, 'utf8')
      },
      timeout: 30000
    }, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var resp = JSON.parse(body);
          if (res.statusCode !== 200) {
            var errMsg = resp.error && resp.error.message ? resp.error.message : ('HTTP ' + res.statusCode);
            return reject(new Error(errMsg));
          }
          var content = resp.choices && resp.choices[0] && resp.choices[0].message.content;
          if (!content) return reject(new Error('DeepSeek 返回内容为空'));

          var jsonStr = content.trim();
          var jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1].trim();
          var aiOutput = JSON.parse(jsonStr);
          if (!aiOutput.recommendations || !Array.isArray(aiOutput.recommendations)) {
            return reject(new Error('DeepSeek 返回 JSON 缺少 recommendations'));
          }

          var codeSet = {};
          profiles.forEach(function(p) { codeSet[p.code] = p; });
          var recommendations = aiOutput.recommendations
            .filter(function(item) { return item && codeSet[item.code]; })
            .map(function(item) {
              var profile = codeSet[item.code];
              return {
                code: item.code,
                name: profile.name,
                type: profile.type,
                nav: profile.nav,
                dailyPct: profile.dailyPct,
                perf: profile.perf,
                fundSize: profile.fundSize,
                score: Math.max(0, Math.min(100, Math.round(Number(item.score) || 60))),
                risk: ['低', '中', '高'].indexOf(item.risk) >= 0 ? item.risk : '中',
                reason: item.reason || '综合趋势、行业景气与风险因素，当前具备一定的建仓性价比。',
                positionHint: item.positionHint || '建议首次建仓 5%-10%',
                tags: item.tags || profile.tags || [],
                evidence: item.evidence || buildEvidence(profile)
              };
            })
            .sort(function(a, b) { return b.score - a.score; })
            .slice(0, DEFAULT_COUNT);

          resolve({ recommendations: recommendations });
        } catch (e) {
          reject(new Error('DeepSeek 响应解析失败: ' + e.message));
        }
      });
    });

    req.on('error', function(e) { reject(e); });
    req.on('timeout', function() {
      req.abort();
      reject(new Error('DeepSeek API 请求超时'));
    });
    req.write(postData);
    req.end();
  });
}

exports.main = async function(event) {
  event = event || {};
  if (event.type && event.type !== 'daily') {
    return { error: 'Unsupported type: ' + event.type, recommendations: [] };
  }

  var dayKey = getShanghaiDayKey();
  if (!event.force) {
    var cached = await readCached(dayKey);
    if (cached) return cached;
  }

  var excludeCodes = event.excludeCodes || [];
  var count = Math.max(1, Math.min(10, Number(event.count) || DEFAULT_COUNT));

  var candidates = [];
  var market = { indices: [], topSectors: [], summary: { upCount: 0, downCount: 0, topSector: null } };

  try {
    var contextResults = await Promise.all([
      getRankCandidates(excludeCodes),
      getMarketContext()
    ]);
    candidates = contextResults[0];
    market = contextResults[1];
  } catch (e) {
    console.error('获取候选基金或市场数据失败:', e.message || e);
  }

  if (!candidates || candidates.length === 0) {
    return {
      date: dayKey,
      aiPowered: false,
      generatedAt: Date.now(),
      marketContext: market,
      candidateCount: 0,
      recommendations: []
    };
  }

  var shortlist = await buildShortlist(candidates, market);
  if (!shortlist || shortlist.length === 0) {
    return buildFallbackResult([], market, candidates.length);
  }

  var aiResult = null;
  try {
    aiResult = await callDeepSeekRecommend(shortlist, market);
  } catch (e) {
    console.error('DeepSeek 推荐失败，降级为规则评分:', e.message || e);
  }

  var result;
  if (aiResult && aiResult.recommendations && aiResult.recommendations.length > 0) {
    result = {
      date: dayKey,
      aiPowered: true,
      generatedAt: Date.now(),
      marketContext: market,
      candidateCount: candidates.length,
      recommendations: aiResult.recommendations.slice(0, count)
    };
  } else {
    result = buildFallbackResult(shortlist, market, candidates.length);
    result.recommendations = result.recommendations.slice(0, count);
  }

  await writeCached(dayKey, result);
  return result;
};
