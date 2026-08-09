/* 云函数：AI 分析引擎
 * 入参: { stocks: [{code,name,weight}], newsMap: { code: [{title,column,time}] } }
 * 返回: { labeled: { code: [{title,type,reason}] }, suggest: {action,reason,stats} }
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

  var labeled = {};
  var totalBull = 0, totalBear = 0, totalNeu = 0;
  var stockScores = []; // [{code,name,weight,score:{bull,bear,neu}}]

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
    stats: {
      totalNews: total,
      bullish: totalBull,
      bearish: totalBear,
      neutral: totalNeu,
      stocks: stockScores
    }
  };
};

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
