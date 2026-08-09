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

  // 尝试调用 DeepSeek AI 分析
  var aiResult = null;
  try {
    aiResult = await callDeepSeek(stocks, newsMap, rulesResult, fundName);
  } catch (e) {
    console.error('DeepSeek API 调用失败，降级为规则引擎:', e.message || e);
  }

  if (aiResult) {
    aiResult.labeled = rulesResult.labeled;
    aiResult.stats = rulesResult.stats;
    aiResult.aiPowered = true;
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

function callDeepSeek(stocks, newsMap, rulesResult, fundName) {
  return new Promise(function(resolve, reject) {
    var apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey || apiKey === 'sk-xxxxxxxxxxxxxxxx' || apiKey.length < 10) {
      return reject(new Error('DEEPSEEK_API_KEY 未配置或无效'));
    }

    // 构建给 AI 的上下文
    var stats = rulesResult.stats;
    var stockDetails = [];

    stocks.forEach(function(s) {
      var newsList = newsMap[s.code] || [];
      if (newsList.length === 0) return;
      var labels = rulesResult.labeled[s.code] || [];
      var newsSummary = [];
      for (var i = 0; i < newsList.length; i++) {
        var n = newsList[i];
        var label = labels[i] || {};
        var typeTag = label.type === 'bullish' ? '[利好]' :
                     label.type === 'bearish' ? '[利空]' : '[中性]';
        var extra = label.reason ? ' (' + label.reason + ')' : '';
        newsSummary.push('  - ' + typeTag + ' ' + (n.title || '') + extra);
      }
      stockDetails.push(
        '【' + (s.name || '') + '(' + s.code + ') 持仓权重 ' + (s.weight || 0) + '%】' +
        '\n  利好/利空/中性: ' +
        labels.filter(function(l) { return l.type === 'bullish'; }).length + '/' +
        labels.filter(function(l) { return l.type === 'bearish'; }).length + '/' +
        labels.filter(function(l) { return l.type === 'neutral'; }).length +
        '\n' + newsSummary.join('\n')
      );
    });

    var rulesSuggestion = rulesResult.suggest;
    var fundLabel = fundName ? '【基金名称】' + fundName + '\n' : '';

    var prompt = '你是一位专业的基金分析助手，根据基金重仓股的相关新闻，给出投资建议。\n\n' +
      fundLabel +
      '【新闻总览】利好' + stats.bullish + '条 / 利空' + stats.bearish + '条 / 中性' + stats.neutral + '条\n\n' +
      '【各重仓股详情】\n' + stockDetails.join('\n\n') + '\n\n' +
      '【规则引擎初步判断】' + rulesSuggestion.action + ' (' + rulesSuggestion.reason + ')\n\n' +
      '请综合以上信息，输出一个 JSON 格式的分析结果，只包含 action 和 reason 两个字段。\n' +
      'action 取值：buy（加仓）、sell（减仓）、hold（观望）。\n' +
      'reason 是中文撰写的具体分析建议，80-120字，说明判断依据，结合个股信号。\n' +
      '格式示例：{"action":"hold","reason":"..."}\n' +
      '不要使用 markdown 代码块，直接输出纯 JSON。';

    var postData = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是专业的基金投资分析助手，只输出 JSON，不输出任何额外文字。' },
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
      timeout: 30000
    };

    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var resp = JSON.parse(body);

          // 检查 HTTP 错误
          if (res.statusCode !== 200) {
            var errMsg = resp.error && resp.error.message ?
              resp.error.message : ('HTTP ' + res.statusCode);
            console.error('DeepSeek API 返回错误:', body);
            return reject(new Error(errMsg));
          }

          var content = resp.choices && resp.choices[0] && resp.choices[0].message.content;
          if (!content) return reject(new Error('DeepSeek 返回内容为空'));

          // 尝试提取 JSON（可能被 markdown 代码块包裹）
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
