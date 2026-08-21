var app = getApp();

// ---- 利好关键词（与云函数保持同步）----
var BULLISH_KW = [
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
var BEARISH_KW = [
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
  { kw: '风险警示', score: 3 },
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

// ---- 中性公告栏目 ----
var NEUTRAL_COLUMNS_KW = [
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

Page({
  data: {
    fund: null,
    name: '',
    code: '',
    nav: '--',
    changePct: 0,
    changeStr: '',
    up: false,
    navDate: '',
    sectors: [],
    stocks: [],
    newsMap: {},
    suggest: null,
    suggestLabel: '',
    suggestClass: '',
    refreshing: false,
    lastUpdateTime: '',
    loadingHoldings: false,
    loadingNews: false,
    loadingAnalysis: false,
    holdingsError: '',
    newsError: '',
    stats: null,
    aiSectors: [],
    sectorNewsMap: {},
    loadingSectorNews: false,
    sectorNewsError: '',
    // 走势图
    chartLoading: false,
    chartRange: '1M',  // 1M | 3M | 6M | 1Y
    benchmarkStatus: '',
    chartData: null,   // { dates, navs, benchmark, benchmarkDates }
    chartCanvasReady: false,
    showTradePanel: false,
    tradeRecords: [],
    tradePlans: [],
    chickImages: {}
  },
  _timer: null,
  _fundIndex: -1,
  _fundCode: '',
  _canvasCtx: null,
  _canvasWidth: 0,
  _canvasHeight: 0,

  onLoad: function(options) {
    this.loadChickAssets();
    // 开启右上角菜单转发 + 朋友圈分享
    try {
      wx.showShareMenu({
        withShareTicket: false,
        menus: ['shareAppMessage', 'shareTimeline']
      });
    } catch (e) {}
    var code = options.code;
    var name = decodeURIComponent(options.name || '');
    var funds = app.globalData.funds;
    var idx = -1;
    for (var i = 0; i < funds.length; i++) {
      if (funds[i].code === code) { idx = i; break; }
    }
    if (idx < 0) {
      // 从发现页进入，不在自选/持仓列表中，构造临时对象
      var tempFund = { code: code, name: name, nav: null, changePct: 0, date: '' };
      app.globalData.funds.push(tempFund);
      idx = app.globalData.funds.length - 1;
      this._tempFund = true;
    }
    this._fundIndex = idx;
    this._fundCode = code;
    var fund = funds[idx];

    var pct = parseFloat(fund.changePct) || 0;
    var up = pct >= 0;

    this.setData({
      fund: fund, name: fund.name || '--', code: fund.code,
      nav: fund.nav || '--', changePct: pct,
      changeStr: (up ? '+' : '') + (fund.changePct || '0') + '%',
      up: up, navDate: fund.date || ''
    });

    this.loadHoldingsAndNews();
  },

  onShow: function() {
    this.loadChickAssets();
    this.startAutoRefresh();
  },

  onHide: function() {
    this.stopAutoRefresh();
  },

  onUnload: function() {
    this.stopAutoRefresh();
    if (this._tempFund) {
      var funds = app.globalData.funds;
      for (var i = funds.length - 1; i >= 0; i--) {
        if (funds[i].code === this._fundCode) { funds.splice(i, 1); break; }
      }
    }
  },

  loadChickAssets: function() {
    var self = this;
    app.getChickAssets().then(function(urls) {
      self.setData({ chickImages: urls });
    });
  },

  // ============ 走势图 ============

  loadChart: function(range) {
    var self = this;
    var code = this._fundCode;
    if (!code) return;

    var days;
    if (range === '1M') days = 22;
    else if (range === '3M') days = 66;
    else if (range === '6M') days = 132;
    else days = 250;  // 1Y

    self.setData({ chartRange: range, chartLoading: true, benchmarkStatus: '加载中...' });

    // 先拉基金历史净值（必须成功才能画图）
    app.fetchHistory(code, days).then(function(histData) {
      if (!histData || histData.length === 0) {
        self.setData({ chartLoading: false });
        console.warn('fetchHistory returned empty');
        return;
      }

      var dates = [];
      var navs = [];
      for (var i = 0; i < histData.length; i++) {
        dates.push(histData[i].date.substring(5));
        navs.push(histData[i].nav);
      }

      // 渲染基础图表
      self.setData({
        chartData: { dates: dates, navs: navs, benchmark: [], benchmarkDates: [] },
        chartLoading: false,
        benchmarkStatus: '加载中...'
      });
      self.drawChart();

      // 异步拉取沪深300基准（不阻塞基础图表）
      app.fetchBenchmark(days).then(function(benchData) {
        if (!benchData || benchData.length === 0) { self.setData({ benchmarkStatus: '无数据' }); return; }

        var benchMap = {};
        for (var i = 0; i < benchData.length; i++) {
          benchMap[benchData[i].date] = benchData[i].nav;
        }
        var firstBench = benchData.length > 0 ? benchData[0].nav : 1;
        var benchVals = [];
        var benchDates = [];
        for (var i = 0; i < histData.length; i++) {
          var d = histData[i].date;
          var bn = benchMap[d];
          if (bn !== undefined) {
            benchVals.push(bn / firstBench);
            benchDates.push(d.substring(5));
          }
        }
        self.setData({
          chartData: { dates: dates, navs: navs, benchmark: benchVals, benchmarkDates: benchDates }
        });
        self.setData({ benchmarkStatus: benchVals.length + ' 条匹配' });
        self.drawChart();
      }).catch(function(err) {
        self.setData({ benchmarkStatus: '无数据' });
        console.error('fetchBenchmark error:', err);
      });
    }).catch(function(err) {
      console.error('fetchHistory error:', err);
      self.setData({ chartLoading: false });
    });
  },

  switchChartRange: function(e) {
    var range = e.currentTarget.dataset.range;
    if (range === this.data.chartRange) return;
    this.loadChart(range);
  },

  drawChart: function() {
    var self = this;
    var query = wx.createSelectorQuery().in(this);
    query.select('#navChart')
      .fields({ node: true, size: true })
      .exec(function(res) {
        if (!res[0] || !res[0].node) {
          // Canvas 还未就绪，延迟重试
          setTimeout(function() { self.drawChart(); }, 200);
          return;
        }
        var canvas = res[0].node;
        var ctx = canvas.getContext('2d');
        var dpr = wx.getSystemInfoSync().pixelRatio;
        var width = res[0].width;
        var height = res[0].height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        self._canvasCtx = ctx;
        self._canvasWidth = width;
        self._canvasHeight = height;
        self._renderChart();
      });
  },

  _renderChart: function() {
    var ctx = this._canvasCtx;
    if (!ctx) return;
    var data = this.data.chartData;
    if (!data || data.navs.length === 0) return;

    var w = this._canvasWidth;
    var h = this._canvasHeight;
    if (w <= 0 || h <= 0) return;

    // 清空
    ctx.clearRect(0, 0, w, h);

    var navs = data.navs;
    var dates = data.dates;
    var benchVals = data.benchmark;
    var n = navs.length;
    var padding = { top: 20, right: 16, bottom: 30, left: 45 };
    var plotW = w - padding.left - padding.right;
    var plotH = h - padding.top - padding.bottom;

    // 计算 Y 轴范围 (相对变动, 以第一个点为 0%)
    var base = navs[0];
    var ratios = navs.map(function(v) { return (v - base) / base * 100; });
    var benchRatios = [];
    if (benchVals && benchVals.length > 0) {
      benchRatios = benchVals.map(function(v) { return (v - 1) * 100; });
    }

    var allVals = ratios.concat(benchRatios);
    var yMin = Math.min.apply(null, allVals);
    var yMax = Math.max.apply(null, allVals);
    var yRange = yMax - yMin || 1;
    yMin -= yRange * 0.1;
    yMax += yRange * 0.1;
    yRange = yMax - yMin;

    function xPos(i) { return padding.left + (i / Math.max(n - 1, 1)) * plotW; }
    function yPos(v) { return padding.top + plotH - ((v - yMin) / yRange) * plotH; }

    // 网格线
    ctx.strokeStyle = 'rgba(245, 166, 35, 0.16)';
    ctx.lineWidth = 0.5;
    for (var g = 0; g <= 4; g++) {
      var gy = padding.top + (g / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(padding.left, gy);
      ctx.lineTo(w - padding.right, gy);
      ctx.stroke();
    }

    // 零线
    var zeroY = yPos(0);
    ctx.strokeStyle = 'rgba(245, 166, 35, 0.38)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 基准线 (沪深300)
    if (benchVals && benchVals.length > 0) {
      ctx.strokeStyle = '#B28A5A';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var px = xPos(i);
        var py = yPos(benchRatios[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // 基金净值线
    ctx.strokeStyle = '#F5A623';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var px = xPos(i);
      var py = yPos(ratios[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // X 轴标签 (最多显示 5 个)
    var labelCount = Math.min(5, n);
    var step = Math.max(1, Math.floor(n / labelCount));
    ctx.fillStyle = '#B08D63';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (var i = 0; i < n; i += step) {
      ctx.fillText(dates[i], xPos(i), h - 6);
    }
    // 最后一个
    if (n > 1 && (n - 1) % step > step / 2) {
      ctx.fillText(dates[n - 1], xPos(n - 1), h - 6);
    }

    // Y 轴标签 (百分比)
    ctx.textAlign = 'right';
    for (var g = 0; g <= 4; g++) {
      var val = yMin + (g / 4) * yRange;
      var gy = yPos(val);
      ctx.fillText(val.toFixed(1) + '%', padding.left - 6, gy + 3);
    }

    // 图例
    var lx = padding.left + 8;
    var ly = padding.top + 4;
    ctx.fillStyle = '#F5A623';
    ctx.fillRect(lx, ly, 12, 3);
    ctx.fillStyle = '#8A6A4F';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('净值', lx + 16, ly + 4);

    ctx.fillStyle = '#B28A5A';
    lx += 80;    ctx.fillRect(lx, ly, 12, 3);
    var bmLabel = (benchVals && benchVals.length > 0) ? '沪深300' : '沪深300(无)';
    ctx.fillStyle = benchVals && benchVals.length > 0 ? '#8A6A4F' : '#D9B98C';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(bmLabel, lx + 16, ly + 4);  },

  // ============ 加载持仓和新闻 ============

  loadHoldingsAndNews: function() {
    var self = this;
    var code = this._fundCode;
    if (!code) return;

    var fund = app.globalData.funds[self._fundIndex];
    if (fund && fund._holdingsLoaded) {
      self.setData({
        sectors: fund._mergedSectors || (fund.holdings ? fund.holdings.sectors : []),
        stocks: fund.holdings ? fund.holdings.stocks : [],
        newsMap: fund.news || {},
        suggest: fund.suggestion || null, suggestDaily: fund.suggestDaily || null,
        stats: fund._aiStats || null,
        aiPowered: fund._aiPowered || false,
        aiSectors: fund._aiSectors || [],
        sectorNewsMap: fund._sectorNewsMap || {}
      });
      self.applySuggestion();
      if (!self.data.chartData) self.loadChart('1M');
      if (fund._aiSectors && fund._aiSectors.length > 0 && (!fund._sectorNewsMap || Object.keys(fund._sectorNewsMap).length === 0)) {
        self.loadSectorNews(fund._aiSectors);
      }
      return;
    }

    self.setData({ loadingHoldings: true, holdingsError: '' });

   app.fetchHoldings(code).then(function(data) {
      // 只有 parseHoldings 明确返回 error 才算解析失败；stocks 为空可能是债券/货币基金等正常情况
      if (data && data.error) {
        var dump = data._dump ? data._dump : JSON.stringify(data).substring(0, 500);
        var holdings = fund && fund.holdings ? fund.holdings : { sectors: [], stocks: [] };
        self.setData({ sectors: holdings.sectors || [], stocks: holdings.stocks || [], loadingHoldings: false, holdingsError: '数据解析失败 [响应: ' + dump + ']' });
        if (holdings.stocks && holdings.stocks.length > 0) self.loadNewsForStocks(holdings.stocks);
      } else {
        var sectors = (data && data.sectors) || [];
        var stocks = (data && data.stocks) || [];
        self.setData({ sectors: sectors, stocks: stocks, loadingHoldings: false });
        if (fund) fund.holdings = { sectors: sectors, stocks: stocks };
        if (stocks.length > 0) {
          self.loadNewsForStocks(stocks);
        } else if (fund) {
          fund._holdingsLoaded = true;
        }
      }
      if (!self.data.chartData) self.loadChart('1M');
    }).catch(function(err) {
      var holdings = fund && fund.holdings ? fund.holdings : { sectors: [], stocks: [] };
      self.setData({ sectors: holdings.sectors || [], stocks: holdings.stocks || [], loadingHoldings: false, holdingsError: '请求失败: ' + (err && err.message || JSON.stringify(err).substring(0, 200)) });
      if (!self.data.chartData) self.loadChart('1M');
    });
  },

  loadNewsForStocks: function(stocks) {
    var self = this;
    self.setData({ loadingNews: true, newsError: '' });
    // 分批抓取股票新闻，每批最多 5 只并行，避免云函数请求数超限
    function batchFetchNews(list, batchSize) {
      var results = [];
      function nextBatch(start) {
        if (start >= list.length) return Promise.resolve(results);
        var batch = list.slice(start, start + batchSize);
        return Promise.all(batch.map(function(s) {
          return app.fetchStockNews(s.code, s.name).then(function(news) {
            return { code: s.code, news: news };
          }).catch(function() { return { code: s.code, news: [] }; });
        })).then(function(batchResults) {
          results = results.concat(batchResults);
          return nextBatch(start + batchSize);
        });
      }
      return nextBatch(0);
    }
    batchFetchNews(stocks, 5).then(function(results) {
      var newsMap = {};
      results.forEach(function(r) { newsMap[r.code] = r.news; });
      self.setData({ newsMap: newsMap, loadingNews: false });
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) fund.news = newsMap;
      self.runAnalyze(stocks, newsMap);
    }).catch(function(err) {
      self.setData({ loadingNews: false, newsError: '新闻加载失败' });
    });
  },


  // 对单条板块新闻进行利好/利空/中性分类
  _classifySectorNews: function(text, column) {
    column = column || '';

    // 1) 中性例行公告
    for (var i = 0; i < NEUTRAL_COLUMNS_KW.length; i++) {
      var pattern = NEUTRAL_COLUMNS_KW[i];
      try { var re = new RegExp(pattern); if (re.test(column) || re.test(text)) return { type: 'neutral', reason: '例行公告: ' + column }; }
      catch(e) {}
    }

    // 2) 利好关键词
    var maxBull = 0, bullKw = '';
    BULLISH_KW.forEach(function(item) {
      var matched = item.regex ? new RegExp(item.kw).test(text) : text.indexOf(item.kw) >= 0;
      if (matched && item.score > maxBull) { maxBull = item.score; bullKw = item.kw; }
    });

    // 3) 利空关键词
    var maxBear = 0, bearKw = '';
    BEARISH_KW.forEach(function(item) {
      var matched = item.regex ? new RegExp(item.kw).test(text) : text.indexOf(item.kw) >= 0;
      if (matched && item.score > maxBear) { maxBear = item.score; bearKw = item.kw; }
    });

    // 4) 判断
    if (maxBull > maxBear) return { type: 'bullish', reason: '关键词: ' + bullKw };
    if (maxBear > maxBull) return { type: 'bearish', reason: '关键词: ' + bearKw };
    if (maxBull === 0 && maxBear === 0) return { type: 'neutral', reason: '无明确情绪信号' };
    return { type: 'neutral', reason: '多空均衡' };
  },

  loadSectorNews: function(sectors) {

    var self = this;
    if (!sectors || sectors.length === 0) return;
    self.setData({ loadingSectorNews: true });
    var tasks = sectors.map(function(s) {
      return app.fetchSectorNews(s.name).then(function(news) {
        return { sector: s.name, news: news.slice(0, 8) };
      }).catch(function() { return { sector: s.name, news: [] }; });
    });
    Promise.all(tasks).then(function(results) {
      var map = {};
      results.forEach(function(r) {
        map[r.sector] = r.news.map(function(n) {
          var label = self._classifySectorNews((n.title || '') + ' ' + (n.column || ''), n.column);
          return { title: n.title, date: n.date, type: label.type, reason: label.reason };
        });
      });
      self.setData({ sectorNewsMap: map, loadingSectorNews: false });
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) { fund._sectorNewsMap = map; fund._mergedSectors = self.data.sectors; }
    }).catch(function() {
    });
  },

 runAnalyze: function(stocks, newsMap) {
   var self = this;
   self.setData({ loadingAnalysis: true });
   var code = self._fundCode;
   var nav = parseFloat(self.data.nav) || 0;
   var cachedFund = app.globalData.funds[self._fundIndex];

    // 已有分析结果时直接展示，不再触发云函数
    if (cachedFund && cachedFund.suggestion && cachedFund._aiPowered) {
      self.setData({
        newsMap: cachedFund.news || self.data.newsMap || {},
        suggest: cachedFund.suggestion,
        suggestDaily: cachedFund.suggestDaily || null,
        stats: cachedFund._aiStats || null,
        aiPowered: true,
        aiSectors: cachedFund._aiSectors || [],
        sectors: cachedFund._mergedSectors || self.data.sectors || [],
        loadingAnalysis: false
      });
      self.applySuggestion();
      if (cachedFund._aiSectors && cachedFund._aiSectors.length > 0) {
        self.loadSectorNews(cachedFund._aiSectors);
      }
      return;
    }

    if (!stocks || stocks.length === 0) {
      if (cachedFund) cachedFund._holdingsLoaded = true;
      self.setData({ loadingAnalysis: false });
      return;
    }

    app.fetchHistory(code, 132).then(function(histData) {
      if (!histData || histData.length < 2) return null;
      function pctChange(start, end) {
        if (end >= histData.length) return null;
        return ((histData[end].nav - histData[start].nav) / histData[start].nav) * 100;
      }
      var len = histData.length;
      return {
        '1m': pctChange(Math.max(0, len - 22), len - 1),
        '3m': pctChange(Math.max(0, len - 66), len - 1),
        '6m': pctChange(0, len - 1)
      };
    }).catch(function() { return null; }).then(function(navTrend) {
      var pl = app.calcProfitLoss(code, nav);
      pl = app.applyPosOverrides(code, nav, pl);
      var position = nav > 0 && pl.shares > 0 ? { profitPct: pl.profitPct, holdingDays: pl.holdingDays } : null;
      var dailyPct = parseFloat(self.data.changePct) || null;
      return app.analyzeNews(stocks, newsMap, cachedFund && cachedFund.name, navTrend, position, dailyPct, code);
    }).then(function(result) {
      var fund = app.globalData.funds[self._fundIndex];
      if (!result) {
        if (fund) fund._holdingsLoaded = true;
        self.setData({ loadingAnalysis: false });
        return;
      }

      var suggestion = result.suggest || { action: 'hold', reason: '暂无分析' };
      var aiSectors = result.relatedSectors || [];
      var labeled = result.labeled || {};
      var mergedMap = {};

      Object.keys(newsMap).forEach(function(stockCode) {
        var newsList = newsMap[stockCode] || [];
        var labels = labeled[stockCode] || [];
        mergedMap[stockCode] = newsList.map(function(n, idx) {
          var label = labels[idx] || { type: 'neutral', reason: '' };
          var timeAgo = '';
          if (n.time) {
            var m = n.time.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
            if (m) {
              var pubTime = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
              var diffH = (new Date() - pubTime) / 36e5;
              if (diffH < 1) timeAgo = Math.round(diffH * 60) + '分钟前';
              else if (diffH < 24) timeAgo = Math.round(diffH) + '小时前';
              else timeAgo = Math.round(diffH / 24) + '天前';
            } else if (n.date) {
              timeAgo = n.date;
            }
          }
          return {
            title: n.title || n.text || '',
            column: n.column || '',
            time: n.time || '',
            date: n.date || '',
            stale: n.stale || false,
            timeAgo: timeAgo,
            type: label.type === 'bullish' ? 'bullish' : label.type === 'bearish' ? 'bearish' : 'neutral',
            reason: label.reason || ''
          };
        });
      });

      var existingSectors = self.data.sectors || [];
      var mergedSectors = existingSectors.slice();
      aiSectors.forEach(function(as) {
        if (mergedSectors.indexOf(as.name) < 0) mergedSectors.push(as.name);
      });

      if (fund) {
        fund.suggestion = suggestion;
        fund.suggestDaily = result.suggestDaily || null;
        fund.news = mergedMap;
        fund._aiStats = result.stats || null;
        fund._aiSectors = aiSectors;
        fund._aiPowered = result.aiPowered || false;
        fund._mergedSectors = mergedSectors;
        fund._holdingsLoaded = true;
      }

      self.setData({
        newsMap: mergedMap,
        sectors: mergedSectors,
        suggest: suggestion,
        suggestDaily: result.suggestDaily || null,
        stats: result.stats || null,
        aiPowered: result.aiPowered || false,
        aiSectors: aiSectors,
        loadingAnalysis: false
      });
      self.applySuggestion();
      if (aiSectors.length > 0) self.loadSectorNews(aiSectors);
    }).catch(function(err) {
      console.error('AI analysis failed:', err);
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) fund._holdingsLoaded = true;
      self.setData({ loadingAnalysis: false });
    });
  },

  applySuggestion: function() {
    var sug = this.data.suggest;
    var sugDaily = this.data.suggestDaily;
    if (!sug) return;
    var suggestLabel = '';
    var suggestClass = 'blue';
    if (sug.action === 'buy') { suggestLabel = '加仓'; suggestClass = 'red'; }
    else if (sug.action === 'sell') { suggestLabel = '减仓'; suggestClass = 'green'; }
    else { suggestLabel = '观望'; suggestClass = 'blue'; }
    var suggestDailyLabel = '';
    var suggestDailyClass = 'blue';
    if (sugDaily) {
      if (sugDaily.action === 'buy') { suggestDailyLabel = '加仓'; suggestDailyClass = 'red'; }
      else if (sugDaily.action === 'sell') { suggestDailyLabel = '减仓'; suggestDailyClass = 'green'; }
      else { suggestDailyLabel = '观望'; suggestDailyClass = 'blue'; }
    }
    this.setData({ suggestLabel: suggestLabel, suggestClass: suggestClass, suggestDailyLabel: suggestDailyLabel, suggestDailyClass: suggestDailyClass });
  },

  // ============ 自动刷新 ============

  startAutoRefresh: function() {
    var self = this;
    this.doRefresh();
    this._timer = setInterval(function() { self.doRefresh(); }, 15000);
  },

  stopAutoRefresh: function() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onRefresh: function() {
    var self = this;
    self.setData({ refreshing: true });
    this.loadHoldingsAndNews();
    this.doRefresh().then(function() { self.setData({ refreshing: false }); })
      .catch(function() { self.setData({ refreshing: false }); });
  },

  doRefresh: function() {
    var self = this;
    var code = this._fundCode;
    if (!code) return Promise.resolve();
    return app.fetchNav(code).then(function(data) {
      if (!data) return;
      var pct = data.changePct;
      var up = pct >= 0;
      var now = new Date();
      var time = now.getHours().toString().padStart(2, '0') + ':' +
                 now.getMinutes().toString().padStart(2, '0') + ':' +
                 now.getSeconds().toString().padStart(2, '0');
      self.setData({
        nav: data.nav.toFixed(4), changePct: pct,
        changeStr: (up ? '+' : '') + pct.toFixed(2) + '%',
        up: up, navDate: data.date, lastUpdateTime: time
      });
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) { fund.nav = data.nav; fund.changePct = data.changePct; fund.date = data.date; }
    });
  },

  // ============ 交易记录 ============

  openTradeRecords: function() {
    var self = this;
    var code = self._fundCode;

    // 加载交易记录
    var trades = app.loadTrades(code);
    var today = new Date();
    var todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    var records = trades.map(function(t) {
      return {
        id: t.id,
        date: t.date,
        type: t.type,
        shares: t.shares,
        amount: t.amount,
        nav: t.nav,
        autoInvest: t.autoInvest || false,
        canDelete: t.date === todayStr
      };
    });

    // 加载定投计划
    var plans = app.getFundPlans(code);
    var periodLabels = { daily: '每日', weekly: '每周', biweekly: '每两周', monthly: '每月' };
    var planData = plans.map(function(p) {
      return {
        id: p.id,
        periodLabel: periodLabels[p.period] || p.period,
        amount: p.amount,
        active: p.active,
        lastExecuted: p.lastExecuted || ''
      };
    });

    self.setData({
      showTradePanel: true,
      tradeRecords: records,
      tradePlans: planData
    });
  },

  closeTradeRecords: function() {
    this.setData({ showTradePanel: false });
  },

  deleteTradeRecord: function(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    var code = self._fundCode;
    var trades = app.loadTrades(code);
    var idx = -1;
    for (var i = 0; i < trades.length; i++) {
      if (trades[i].id === id) { idx = i; break; }
    }
    if (idx < 0) return;

    var trade = trades[idx];
    var today = new Date();
    var todayStr = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    if (trade.date !== todayStr) {
      wx.showToast({ title: '仅可删除当天记录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: '确定删除这笔交易记录吗？',
      success: function(res) {
        if (res.confirm) {
          app.deleteTrade(code, idx);
          app.pushToCloud();
          self.openTradeRecords();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // ============ 分享 ============

  onShareAppMessage: function() {
    var name = this.data.name || this._fundCode || '';
    var code = this._fundCode || '';
    var title = name + '（' + code + '）';
    if (this.data.nav && this.data.nav !== '--') {
      title += ' 最新净值 ' + this.data.nav;
    }
    return {
      title: title,
      path: '/pages/detail/detail?code=' + encodeURIComponent(code) +
        '&name=' + encodeURIComponent(name)
    };
  },

  onShareTimeline: function() {
    var name = this.data.name || this._fundCode || '';
    var code = this._fundCode || '';
    var title = name + '（' + code + '）';
    if (this.data.nav && this.data.nav !== '--') {
      title += ' 最新净值 ' + this.data.nav;
    }
    return {
      title: title,
      query: 'code=' + encodeURIComponent(code) +
        '&name=' + encodeURIComponent(name)
    };
  }
});
