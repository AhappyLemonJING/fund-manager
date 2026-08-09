/* 云函数：AI 分析引擎（DeepSeek + 规则引擎）
 * 入参: { stocks: [{code,name,weight}], newsMap: { code: [{title,column,time}] }, fundName?: string }
 * 返回: { labeled, suggest, stats, aiPowered }
 *
 * DeepSeek API 配置步骤：
 *   1. 在 DeepSeek 开放平台 (platform.deepseek.com) 获取 API Key
 *   2. 微信云开发控制台 -> 云函数 -> analyze -> 环境变量，添加：
 *      DEEPSEEK_API_KEY = sk-xxxxxxxxxxxxxxxx
 *   3. 重新上传并部署云函数即可生效
 *
 * 若未配置 API Key 或调用失败，自动降级为关键词规则引擎。
 */

// ---- 利好关键词 (加权匹配) ----
var BULLISH = [
  { kw: '回购', score: 3 }, { kw: '增持', score: 3 },
  { kw: '中标', score: 3 }, { kw: '分红', score: 2 },
  { kw: '派息', score: 2 }, { kw: '权益分派', score: 2 },
  { kw: '业绩.*增长', score: 3, regex: true },
  { kw: '营收.*增长', score: 2, regex: true },
  { kw: '利润.*增长', score: 2, regex: true },
  { kw: '净利润.*增长', score: 2, regex: true },
  { kw: '超预期', score: 3 },
  { kw: '扭亏为盈', score: 3 },
  { kw: '盈利.*大幅', score: 2, regex: true },
  { kw: '产能.*投产', score: 2, regex: true },
  { kw: '战略合作', score: 2 },
  { kw: '合作.*协议', score: 2, regex: true },
  { kw: '订单', score: 2 },
  { kw: '合同', score: 1 },
  { kw: '突破', score: 2 },
  { kw: '创新', score: 1 },
  { kw: '获批', score: 2 },
  { kw: '许可', score: 1 },
  { kw: '研发.*成功', score: 2, regex: true },
  { kw: '临床试验.*成功', score: 3, regex: true },
  { kw: '产品.*上市', score: 2, regex: true },
  { kw: '项目.*落地', score: 2, regex: true },
  { kw: '产能扩张', score: 2 },
  { kw: '市场.*拓展', score: 1, regex: true },
  { kw: '海外.*市场', score: 2, regex: true },
  { kw: '新品发布', score: 1 },
  { kw: '资产重组', score: 1 },
  { kw: '并购', score: 1 },
  { kw: '资源整合', score: 1 },
  { kw: '补贴', score: 1 },
  { kw: '税收优惠', score: 1 },
  { kw: '政策.*扶持', score: 2, regex: true },
  { kw: '利好', score: 2 },
  { kw: '战略投资者', score: 2 },
  { kw: '引进投资', score: 1 },
  { kw: '定增', score: 1 },
  { kw: '员工持股', score: 1 },
  { kw: '股权激励', score: 1 },
  { kw: '授予.*期权', score: 1, regex: true },
  { kw: '投资收益', score: 1 },
  { kw: '资产.*增值', score: 2, regex: true }
];

// ---- 利空关键词 ----
var BEARISH = [
  { kw: '减持', score: 3 }, { kw: '质押', score: 2 },
  { kw: "冻结", score: 3 }, { kw: "强制平仓", score: 3 }, { kw: "平仓", score: 3 },
  { kw: "预亏", score: 3 }, { kw: "预减", score: 2 }, { kw: "业绩.*亏", score: 3, regex: true },
  { kw: "大幅.*下降", score: 3, regex: true }, { kw: "大幅.*下滑", score: 3, regex: true },
  { kw: '亏损', score: 3 },
  { kw: '业绩.*下降', score: 3, regex: true },
  { kw: '业绩.*下滑', score: 3, regex: true },
  { kw: '营收.*下降', score: 3, regex: true },
  { kw: '营收.*下滑', score: 2, regex: true },
  { kw: '利润.*下降', score: 3, regex: true },
  { kw: '利润.*下滑', score: 2, regex: true },
  { kw: '净利.*亏损', score: 3, regex: true },
  { kw: '退市', score: 3 },
  { kw: '暂停上市', score: 3 },
  { kw: '风险警示', score: 3, regex: true },
  { kw: '债务违约', score: 3 },
  { kw: '诉讼', score: 2 }, { kw: '仲裁', score: 1 },
  { kw: '处罚', score: 2 }, { kw: '罚款', score: 2 },
  { kw: '调查', score: 2 }, { kw: '立案', score: 2 },
  { kw: '查封', score: 2 }, { kw: '扣押', score: 2 },
  { kw: '降级', score: 2 }, { kw: '负面', score: 2 },
  { kw: '产能.*过剩', score: 2, regex: true },
  { kw: '客户.*流失', score: 2, regex: true },
  { kw: '订单.*取消', score: 3, regex: true },
  { kw: '终止.*合作', score: 2, regex: true },
  { kw: '资产.*减值', score: 2, regex: true },
  { kw: '商誉.*减值', score: 3, regex: true },
  { kw: '计提.*减值', score: 2, regex: true },
  { kw: '原材料.*上涨', score: 1, regex: true },
  { kw: '成本.*上升', score: 1, regex: true },
  { kw: '价格.*下降', score: 2, regex: true },
  { kw: '毛利.*率下降', score: 2, regex: true },
  { kw: '定单.*下降', score: 2, regex: true },
  { kw: '产能.*受限', score: 1, regex: true },
  { kw: '疫情影响', score: 1 },
  { kw: '停牌', score: 1 },
  { kw: '异常波动', score: 1 },
  { kw: '警示函', score: 2 },
  { kw: '问询函', score: 1 },
  { kw: '监管函', score: 2 },
  { kw: '责令改正', score: 2 },
  { kw: '环保.*处罚', score: 2, regex: true },
  { kw: '安全生产.*事故', score: 3, regex: true },
  { kw: '董监高.*辞职', score: 1, regex: true },
  { kw: '核心.*人员.*离职', score: 2, regex: true }
];

// ---- 股东会议 / 例行公告栏位关键词 ----
var NEUTRAL_COLUMNS = [
  '股东大会', '董事会决议', '监事会决议',
  '社会责任', '定期报告', '业绩说明会',
  '年度报告', '半年度报告', '季度报告',
  '章程', '制度', '议事规则',
  '独立董事', '聘任', '换届选举',
  '担保', '授信', '银行授信',
  '委托理财', '闲置资金', '现金管理',
  '募集资金', '使用情况', '存放',
  '关联交易', '日常关联交易',
  '股权结构', '股东信息',
  '投资者关系', '调研', '接待',
  '会计政策', '会计估计',
  '续聘', '审计机构', '会计师事务所',
  '限制性股票', '股权激励.*注销', '回购注销',
  '权益分派', '分配方案', '权益分派实施', '分红实施',
  '部分.*解锁', '部分.*解除限售'
];

/* ---- 主入口 ---- */
exports.main = async (event) => {
  var stocks = event.stocks || [];
  var newsMap = event.newsMap || {};
  var fundName = event.fundName || '';
  var navTrend = event.navTrend || null;
  var position = event.position || null;
  var dailyChangePct = event.dailyChangePct != null ? event.dailyChangePct : null;

  // 先统计每只股票有多少新闻
  var totalNewsCount = 0;
  stocks.forEach(function(s) {
    totalNewsCount += (newsMap[s.code] || []).length;
  });

  // 无新闻则直接返回
  if (totalNewsCount === 0) {
    return {
      labeled: {},
      suggest: { action: 'hold', reason: '近24小时无相关公告，暂无法进行分析。' },
      stats: { totalNews: 0, bullish: 0, bearish: 0, neutral: 0, stocks: [] },
      aiPowered: false
    };
  }

  // 跑规则引擎（作为 AI 输入特征 + 降级备用）
  var rulesResult = runRulesEngine(stocks, newsMap);

  // 尝试调用 DeepSeek AI 分析（标准版 + 融入当日涨跌幅版 + 板块分析 并行）
  var aiResult = null;
  var sectorResult = null;
  var aiDailyResult = null;
  try {
    var promises = [callDeepSeek(stocks, newsMap, rulesResult, fundName, navTrend, position, null)];
    if (dailyChangePct != null) {
      promises.push(callDeepSeek(stocks, newsMap, rulesResult, fundName, navTrend, position, dailyChangePct));
    }
    var results = await Promise.all(promises);
    sectorResult = await callDeepSeekSectors(stocks).catch(function(e) {
      console.error('板块分析失败:', e.message || e);
    });    aiResult = results[0];
    if (results.length > 1) aiDailyResult = results[1];
  } catch (e) {
    console.error('DeepSeek API 调用失败，降级为规则引擎:', e.message || e);
  }

  if (aiResult) {
    aiResult.labeled = rulesResult.labeled;
    aiResult.stats = rulesResult.stats;
    if (sectorResult) aiResult.relatedSectors = sectorResult.sectors || [];
    aiResult.aiPowered = true;
    if (aiDailyResult) {
      aiResult.suggestDaily = aiDailyResult.suggest;
    }
    return aiResult;
  }


  // 降级：使用规则引擎结果
  rulesResult.aiPowered = false;
  return rulesResult;
};

/* ---- 关键词规则引擎 (保持原有逻辑) ---- */
function runRulesEngine(stocks, newsMap) {
  var labeled = {};
  var totalBull = 0, totalBear = 0, totalNeu = 0;
  var stockScores = [];
  stocks.forEach(function(s) {
    var code = s.code;
    var newsList = newsMap[code] || [];
    var labeledList = [];
    var bullCount = 0, bearCount = 0, neuCount = 0;

    newsList.forEach(function(n) {
      var text = (n.title || '') + ' ' + (n.column || '');
      var result = classifyNews(text, n.column || '');
      labeledList.push({
        title: n.title,
        column: n.column,
        type: result.type,
        reason: result.reason
      });

      if (result.type === 'bullish') bullCount++;
      else if (result.type === 'bearish') bearCount++;
      else neuCount++;
    });

    labeled[code] = labeledList;
    totalBull += bullCount;
    totalBear += bearCount;
    totalNeu += neuCount;

    stockScores.push({
      code: s.code,
      name: s.name || '',
      weight: s.weight || 0,
      bull: bullCount,
      bear: bearCount,
      neu: neuCount
    });
  });

  // 综合建议
  var total = totalBull + totalBear + totalNeu;
  var suggest = computeSuggestion(totalBull, totalBear, totalNeu, total, stockScores);
  return {
    labeled: labeled,
    suggest: suggest,
    stats: { totalNews: total,
      bullish: totalBull,
      bearish: totalBear,
      neutral: totalNeu,
      stocks: stockScores }
  };
}

/* ---- 单条新闻分类 ---- */
function classifyNews(text, column) {
  column = column || '';

  // 1) 先看栏目是否属于中性例行公告
  for (var i = 0; i < NEUTRAL_COLUMNS.length; i++) {
    var pattern = NEUTRAL_COLUMNS[i];
    try {
      var re = new RegExp(pattern);
      if (re.test(column) || re.test(text)) {
        return { type: 'neutral', reason: '例行公告: ' + column };
      }
    } catch (e) {}
  }

  // 2) 匹配利好关键词
  var maxBullScore = 0, maxBullKw = '';
  for (var j = 0; j < BULLISH.length; j++) {
    var item = BULLISH[j];
    var matched = false;
    if (item.regex) {
      try { matched = new RegExp(item.kw).test(text); } catch (e) {}
    } else {
      matched = text.indexOf(item.kw) >= 0;
    }
    if (matched && item.score > maxBullScore) {
      maxBullScore = item.score;
      maxBullKw = item.kw;
    }
  }

  // 3) 匹配利空关键词
  var maxBearScore = 0, maxBearKw = '';
  for (var k = 0; k < BEARISH.length; k++) {
    var bitem = BEARISH[k];
    var bmatched = false;
    if (bitem.regex) {
      try { bmatched = new RegExp(bitem.kw).test(text); } catch (e) {}
    } else {
      bmatched = text.indexOf(bitem.kw) >= 0;
    }
    if (bmatched && bitem.score > maxBearScore) {
      maxBearScore = bitem.score;
      maxBearKw = bitem.kw;
    }
  }

  // 4) 判断
  var netScore = maxBullScore - maxBearScore;
  if (netScore > 0) {
    return { type: 'bullish', reason: '关键词: ' + maxBullKw };
  } else if (netScore < 0) {
    return { type: 'bearish', reason: '关键词: ' + maxBearKw };
  } else if (maxBullScore === 0 && maxBearScore === 0) {
    return { type: 'neutral', reason: '无明确情绪信号' };
  } else {
    // 同时匹配，看哪个得分更高
    if (maxBullScore >= maxBearScore) {
      return { type: 'bullish', reason: '关键词: ' + maxBullKw };
    } else {
      return { type: 'bearish', reason: '关键词: ' + maxBearKw };
    }
  }
}

/* ---- 综合操作建议 ---- */
function computeSuggestion(bull, bear, neu, total, stockScores) {
  if (total === 0) {
    return {
      action: 'hold',
      reason: '近24小时无相关公告，无法判断情绪趋势，建议观望'
    };
  }

  var bullRatio = bull / total;
  var bearRatio = bear / total;

  // 计算加权得分 (每只股票按持仓权重加权)
  var weightSum = 0, weightedBull = 0, weightedBear = 0, weightedNeu = 0;
  stockScores.forEach(function(s) {
    var w = s.weight || 1;
    weightSum += w;
    weightedBull += s.bull * w;
    weightedBear += s.bear * w;
    weightedNeu += s.neu * w;
  });
  var wTotal = weightedBull + weightedBear + weightedNeu;
  var wBullRatio = wTotal > 0 ? weightedBull / wTotal : 0;
  var wBearRatio = wTotal > 0 ? weightedBear / wTotal : 0;

  // 判断逻辑
  var reason = '';
  var action = 'hold';

  if (bullRatio >= 0.6 || wBullRatio >= 0.55) {
    action = 'buy';
    reason = '重仓股利好消息密集';
    if (wBullRatio >= 0.55) {
      reason += '（加权利好占比' + Math.round(wBullRatio * 100) + '%），';
    } else {
      reason += '（利好占比' + Math.round(bullRatio * 100) + '%），';
    }
    reason += '且头部权重股利好信号明确，建议加仓。';
  } else if (bearRatio >= 0.5 || wBearRatio >= 0.45) {
    action = 'sell';
    reason = '重仓股利空信号密集';
    if (wBearRatio >= 0.45) {
      reason += '（加权利空占比' + Math.round(wBearRatio * 100) + '%），';
    } else {
      reason += '（利空占比' + Math.round(bearRatio * 100) + '%），';
    }
    reason += '建议减仓以规避风险。';
  } else if (bullRatio >= 0.4 && bearRatio <= 0.3) {
    action = 'buy';
    reason = '利好信号偏多（利好' + Math.round(bullRatio * 100) + '%），且重仓股利空有限，可适度加仓。';
  } else if (bearRatio >= 0.35 && bullRatio <= 0.3) {
    action = 'sell';
    reason = '利空信号偏多（利空' + Math.round(bearRatio * 100) + '%），建议减仓。';
  } else {
    action = 'hold';
    reason = '多空信号均衡（利好' + Math.round(bullRatio * 100) + '% / 利空' +
      Math.round(bearRatio * 100) + '%），短期方向不明确，建议观望。';
  }

  // 补充：检查头部权重股是否集体利空
  var topWeightStocks = stockScores.filter(function(s) { return s.weight >= 5; });
  if (topWeightStocks.length >= 3) {
    var topBearCount = 0;
    topWeightStocks.forEach(function(s) {
      if (s.bear > s.bull) topBearCount++;
    });
    if (topBearCount >= topWeightStocks.length * 0.6 && action === 'hold') {
      action = 'sell';
      reason = '前五大重仓股中多数呈现利空信号，建议减仓规避。';
    }
  }

  return { action: action, reason: reason };
}


// ============ DeepSeek AI 分析 ============

// ---- 辅助函数 ----
function formatPct(val) {
  if (val == null) return '--';
  return (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
}

function computeDaysAgo(timeStr) {
  if (!timeStr) return null;
  try {
    var m = timeStr.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    var pubDate = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    var now = new Date();
    var diffMs = now - pubDate;
    var diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 0) return '今天';
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '1天前';
    return diffDays + '天前';
  } catch (e) { return null; }
}

function callDeepSeek(stocks, newsMap, rulesResult, fundName, navTrend, position, dailyChangePct) {
  return new Promise(function(resolve, reject) {
    var apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'sk-xxxxxxxxxxxxxxxx' || apiKey.length < 10) {
      return reject(new Error('DEEPSEEK_API_KEY 未配置或无效'));
    }

    var stats = rulesResult.stats;
    var labels = rulesResult.labeled;

    // ---- 1. 构建带时间信息的新闻列表 ----
    var allNewsItems = [];
    stocks.forEach(function(s) {
      var newsList = newsMap[s.code] || [];
      var stockLabels = labels[s.code] || [];
      newsList.forEach(function(n, i) {
        var label = stockLabels[i] || {};
        var daysAgo = computeDaysAgo(n.time);
        allNewsItems.push({
          stockCode: s.code,
          stockName: s.name || '',
          stockWeight: s.weight || 0,
          title: n.title || n.text || '',
          column: n.column || '',
          type: label.type === 'bullish' ? 'bullish' : label.type === 'bearish' ? 'bearish' : 'neutral',
          reason: label.reason || '',
          timeStr: n.time || '',
          daysAgo: daysAgo,
          daysAgoNum: daysAgo ? parseInt(daysAgo) : 999
        });
      });
    });

    // 按时间排序（最近在前）
    allNewsItems.sort(function(a, b) {
      var da = isNaN(a.daysAgoNum) ? 999 : a.daysAgoNum;
      var db = isNaN(b.daysAgoNum) ? 999 : b.daysAgoNum;
      return da - db;
    });

    // 时间分布统计
    var recent3d = 0, recent7d = 0, older7d = 0;
    allNewsItems.forEach(function(n) {
      if (n.daysAgoNum <= 3) recent3d++;
      else if (n.daysAgoNum <= 7) recent7d++;
      else older7d++;
    });

    // ---- 2. 按股票分组，构建详情 ----
    var stockDetails = [];
    var stockMap = {};
    stocks.forEach(function(s) {
      stockMap[s.code] = {
        name: s.name || '',
        code: s.code,
        weight: s.weight || 0,
        news: [],
        bullCount: 0, bearCount: 0, neuCount: 0
      };
    });

    allNewsItems.forEach(function(n) {
      var sm = stockMap[n.stockCode];
      if (!sm) return;
      var typeTag = n.type === 'bullish' ? '[利好]' : n.type === 'bearish' ? '[利空]' : '[中性]';
      var extra = n.reason ? ' (' + n.reason + ')' : '';
      var timeLabel = n.daysAgo ? n.daysAgo : '';
      sm.news.push('  - ' + typeTag + ' ' + timeLabel + ' ' + n.title + extra);
      if (n.type === 'bullish') sm.bullCount++;
      else if (n.type === 'bearish') sm.bearCount++;
      else sm.neuCount++;
    });

    // 按权重降序排列
    stocks.forEach(function(s) {
      var sm = stockMap[s.code];
      if (!sm || sm.news.length === 0) return;
      var weightLevel = sm.weight >= 8 ? '高' : sm.weight >= 3 ? '中' : '低';
      stockDetails.push({
        text: '【' + sm.name + '(' + sm.code + ') 持仓权重 ' + sm.weight + '% | 影响: ' + weightLevel + '】' +
          '\n  利好/利空/中性: ' + sm.bullCount + '/' + sm.bearCount + '/' + sm.neuCount +
          '\n' + sm.news.join('\n'),
        weight: sm.weight,
        bullCount: sm.bullCount,
        bearCount: sm.bearCount
      });
    });
    stockDetails.sort(function(a, b) { return b.weight - a.weight; });

    // ---- 3. 高权重股摘要 ----
    var highWeightStocks = stockDetails.filter(function(s) { return s.weight >= 5; });
    var highWeightSection = '';
    if (highWeightStocks.length > 0) {
      highWeightSection = '【重点关注 — 高权重重仓股】\n';
      highWeightSection += '以下股票持仓权重\\u22655%，对基金净值影响最大：\n';
      highWeightStocks.forEach(function(s) {
        var signal = s.bullCount > s.bearCount ? '\\u2197 偏多' : s.bearCount > s.bullCount ? '\\u2198 偏空' : '\\u2194 中性';
        highWeightSection += '  ' + signal + '\n';
      });
      highWeightSection += '\n';
    }

    // ---- 4. 组装 prompt ----
    var rulesSuggestion = rulesResult.suggest;
    var fundLabel = fundName ? '【基金名称】' + fundName + '\n' : '';

    var navSection = '';
    if (navTrend) {
      navSection = '【近期净值表现】\n' +
        (navTrend['1m'] != null ? '近1月: ' + formatPct(navTrend['1m']) + '  ' : '') +
        (navTrend['3m'] != null ? '近3月: ' + formatPct(navTrend['3m']) + '  ' : '') +
        (navTrend['6m'] != null ? '近6月: ' + formatPct(navTrend['6m']) + '\n' : '\n') +
        '\n';
    }

    var posSection = '';
    if (position) {
      posSection = '【持仓状态】\n' +
        '持有天数: ' + (position.holdingDays || 0) + '天 | 持仓盈亏: ' + formatPct(position.profitPct) + '\n\n';
    }

    var dailySection = '';
    if (dailyChangePct != null) {
      var direction = dailyChangePct >= 0 ? '上涨' : '下跌';
      var magnitude = Math.abs(dailyChangePct) >= 2 ? '大幅' : Math.abs(dailyChangePct) >= 1 ? '' : '小幅';
      dailySection = '【当日涨跌幅】' + magnitude + direction + formatPct(dailyChangePct) + '\n\n';
    }

    var timeDistSection = '【新闻时效分布】\n' +
      '近3天内: ' + recent3d + '条 | 3-7天: ' + recent7d + '条 | 7天以上: ' + older7d + '条\n\n';

    var prompt =
      '你是一位专业的基金分析助手。请根据以下信息，对基金的投资操作给出建议。\n\n' +
      fundLabel +
      navSection +
      posSection + dailySection +
      '【新闻总览】共 ' + stats.totalNews + ' 条 | 利好' + stats.bullish + ' / 利空' + stats.bearish + ' / 中性' + stats.neutral + '\n' +
      timeDistSection +
      highWeightSection +
      '【全部重仓股新闻】（按权重降序，时间倒序）\n' +
      stockDetails.map(function(s) { return s.text; }).join('\n\n') + '\n\n' +
      '【规则引擎参考】' + rulesSuggestion.action + ' (' + rulesSuggestion.reason + ')\n' +
      '（注意：以上为规则引擎的初步判断，仅供参考。请基于你的专业判断独立分析，不要盲从规则引擎的结论。）\n\n' +
      '请按以下框架综合分析：\n' +
      '1. 净值趋势与新闻信号的一致性：同向则强化结论，背离则需要重点权衡\n' +
      '2. 持仓盈亏的决策影响：浮盈时可更积极地考虑减仓，浮亏时加仓需更谨慎\n' +
      '3. 高权重持仓股的信号影响力远大于低权重股\n' +
      '4. 近3天内的新闻参考价值显著高于7天以上的旧闻' + (dailyChangePct != null ? '\n' +
      '5. 当日涨跌幅的短期信号：如果当日大幅下跌且中期趋势向好或利好密集→可能是短期错杀，考虑加仓；如果当日大幅上涨但趋势偏弱或利空密集→可能是情绪过热，考虑减仓；小幅波动应以中期趋势为主' : '') + '\n\n' +
      '最终输出纯 JSON 格式，不要使用 markdown 代码块：\n' +
      '{"action":"buy|sell|hold","reason":"120-180字分析理由，涵盖以上维度的判断依据"}';

    var postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是专业的基金投资分析助手。输出纯 JSON，不输出任何额外文字。action 取值: buy(加仓)/sell(减仓)/hold(观望)。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 800,
      stream: false
    });

    var https = require('https');
    var url = require('url');
    var parsedUrl = url.parse('https://api.deepseek.com/v1/chat/completions');

    var options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData, 'utf8')
      },
      timeout: 30000
    };

    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var resp = JSON.parse(body);

          if (res.statusCode !== 200) {
            var errMsg = resp.error && resp.error.message ?
              resp.error.message : ('HTTP ' + res.statusCode);
            console.error('DeepSeek API 返回错误:', body);
            return reject(new Error(errMsg));
          }

          var content = resp.choices && resp.choices[0] && resp.choices[0].message.content;
          if (!content) return reject(new Error('DeepSeek 返回内容为空'));

          var jsonStr = content.trim();
          var jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1].trim();

          var aiOutput = JSON.parse(jsonStr);

          if (!aiOutput.action || !aiOutput.reason) {
            return reject(new Error('DeepSeek 返回 JSON 缺少 action 或 reason'));
          }
          if (['buy', 'sell', 'hold'].indexOf(aiOutput.action) === -1) {
            return reject(new Error('无效的 action: ' + aiOutput.action));
          }

          console.log('DeepSeek AI 分析成功: action=' + aiOutput.action);
          resolve({ suggest: { action: aiOutput.action, reason: aiOutput.reason } });
        } catch (e) {
          reject(new Error('DeepSeek 响应解析失败: ' + e.message));
        }
      });
    });

    req.on('error', function(e) { reject(e); });
    req.on('timeout', function() { req.abort(); reject(new Error('DeepSeek API 请求超时')); });
    req.write(postData);
    req.end();
  });
}

// ============ AI 关联板块分析 ============

function callDeepSeekSectors(stocks) {
  return new Promise(function(resolve, reject) {
    var apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'sk-xxxxxxxxxxxxxxxx' || apiKey.length < 10) {
      return reject(new Error('DEEPSEEK_API_KEY 未配置'));
    }

    if (!stocks || stocks.length === 0) {
      return resolve({ sectors: [] });
    }

    var stockList = stocks.map(function(s) {
      return s.name + '(' + s.code + ') 权重' + (s.weight || 0) + '%';
    }).join('、');

    var prompt =
      '你是一位专业的A股行业分析师。\n\n' +
      '以下是一只基金的前十大重仓股：\n' +
      stockList + '\n\n' +
      '请根据这些重仓股，分析它们主要涉及哪些A股行业/板块（例如：白酒、新能源、半导体、医药、AI、消费电子、银行、证券、军工等）。\n' +
      '要求：\n' +
      '1. 仅输出与该基金持仓直接相关的板块，不要泛泛列举不相干的板块\n' +
      '2. 最多输出5个板块，按相关性从高到低排列\n' +
      '3. 为每个板块给出简短的分析理由（10-15个字，说明为什么这些重仓股和该板块相关）\n' +
      '4. 板块名称使用A股市场常见的名称（如"白酒"而非"白酒行业"）\n\n' +
      '输出纯 JSON 格式，不要使用 markdown 代码块：\n' +
      '{"sectors":[{"name":"板块名","reason":"理由"}]}';

    var postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是专业的A股行业分析师。输出纯 JSON，不输出任何额外文字。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 600,
      stream: false
    });

    var https = require('https');
    var url = require('url');
    var parsedUrl = url.parse('https://api.deepseek.com/v1/chat/completions');

    var options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(postData, 'utf8')
      },
      timeout: 25000
    };

    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var resp = JSON.parse(body);
          var content = resp.choices && resp.choices[0] && resp.choices[0].message.content;
          if (!content) return resolve({ sectors: [] });

          var jsonStr = content.trim();
          var jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) jsonStr = jsonMatch[1].trim();

          var aiOutput = JSON.parse(jsonStr);
          resolve({ sectors: aiOutput.sectors || [] });
        } catch (e) {
          resolve({ sectors: [] });
        }
      });
    });

    req.on('error', function(e) { reject(e); });
    req.on('timeout', function() { req.abort(); reject(new Error('DeepSeek API 请求超时')); });
    req.write(postData);
    req.end();
  });
}
