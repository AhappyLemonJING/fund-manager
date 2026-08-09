var app = getApp();

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
    // 走势图
    chartLoading: false,
    chartRange: '1M',  // 1M | 3M | 6M | 1Y
    benchmarkStatus: '',
    chartData: null,   // { dates, navs, benchmark, benchmarkDates }
    chartCanvasReady: false
  },
  _timer: null,
  _fundIndex: -1,
  _fundCode: '',
  _canvasCtx: null,
  _canvasWidth: 0,
  _canvasHeight: 0,

  onLoad: function(options) {
    var code = options.code;
    var funds = app.globalData.funds;
    var idx = -1;
    for (var i = 0; i < funds.length; i++) {
      if (funds[i].code === code) { idx = i; break; }
    }
    if (idx < 0) {
      wx.showToast({ title: '数据异常', icon: 'none' });
      wx.navigateBack();
      return;
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
    this.startAutoRefresh();
  },

  onHide: function() {
    this.stopAutoRefresh();
  },

  onUnload: function() {
    this.stopAutoRefresh();
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
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
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
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 基准线 (沪深300)
    if (benchVals && benchVals.length > 0) {
      ctx.strokeStyle = '#8b949e';
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
    ctx.strokeStyle = '#d4a853';
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
    ctx.fillStyle = '#8b949e';
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
    ctx.fillStyle = '#d4a853';
    ctx.fillRect(lx, ly, 12, 3);
    ctx.fillStyle = '#e6edf3';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('净值', lx + 16, ly + 4);

    ctx.fillStyle = '#8b949e';
    lx += 80;    ctx.fillRect(lx, ly, 12, 3);
    var bmLabel = (benchVals && benchVals.length > 0) ? '沪深300' : '沪深300(无)';
    ctx.fillStyle = benchVals && benchVals.length > 0 ? '#e6edf3' : '#6e7681';
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
        sectors: fund.holdings ? fund.holdings.sectors : [],
        stocks: fund.holdings ? fund.holdings.stocks : [],
        newsMap: fund.news || {},
        suggest: fund.suggestion || null
      });
      self.applySuggestion();
      if (!self.data.chartData) self.loadChart('1M');
      return;
    }

    self.setData({ loadingHoldings: true, holdingsError: '' });

    app.fetchHoldings(code).then(function(data) {
      if (data && data.stocks && data.stocks.length > 0) {
        var sectors = data.sectors || [];
        var stocks = data.stocks || [];
        self.setData({ sectors: sectors, stocks: stocks, loadingHoldings: false });
        if (fund) fund.holdings = { sectors: sectors, stocks: stocks };
        self.loadNewsForStocks(stocks);
      } else {
        var dump = data._dump ? data._dump : JSON.stringify(data).substring(0, 500);
        var holdings = fund && fund.holdings ? fund.holdings : { sectors: [], stocks: [] };
        self.setData({ sectors: holdings.sectors || [], stocks: holdings.stocks || [], loadingHoldings: false, holdingsError: '数据解析失败 [响应: ' + dump + ']' });        if (holdings.stocks && holdings.stocks.length > 0) self.loadNewsForStocks(holdings.stocks);
      }
      if (!self.data.chartData) self.loadChart('1M');
    }).catch(function(err) {
      var holdings = fund && fund.holdings ? fund.holdings : { sectors: [], stocks: [] };
      self.setData({ sectors: holdings.sectors || [], stocks: holdings.stocks || [], loadingHoldings: false, holdingsError: '持仓数据加载失败: ' + (err && err.message || '网络错误') });
      self.setData({ sectors: holdings.sectors || [], stocks: holdings.stocks || [], loadingHoldings: false, holdingsError: '请求失败: ' + (err && err.message || JSON.stringify(err).substring(0, 200)) });      if (!self.data.chartData) self.loadChart('1M');
    });
  },

  loadNewsForStocks: function(stocks) {
    var self = this;
    self.setData({ loadingNews: true, newsError: '' });
    var tasks = stocks.map(function(s) {
      return app.fetchStockNews(s.code, s.name).then(function(news) { return { code: s.code, news: news }; })
        .catch(function() { return { code: s.code, news: [] }; });
    });
    Promise.all(tasks).then(function(results) {
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

  runAnalyze: function(stocks, newsMap) {
    var self = this;
    self.setData({ loadingAnalysis: true });
    app.analyzeNews(stocks, newsMap).then(function(result) {
      if (!result) return;
      var labeled = result.labeled || {};
      var mergedMap = {};
      Object.keys(newsMap).forEach(function(code) {
        var newsList = newsMap[code] || [];
        var labels = labeled[code] || [];
        mergedMap[code] = newsList.map(function(n, idx) {
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
            } else if (n.date) { timeAgo = n.date; }
          }
          return {
            title: n.title || n.text || '', column: n.column || '',
            type: label.type === 'bullish' ? 'bullish' : label.type === 'bearish' ? 'bearish' : 'neutral',
            reason: label.reason || '', timeAgo: timeAgo, stale: n.stale || false
          };
        });
      });
      var suggest = result.suggest || { action: 'hold', reason: '暂无分析' };
      self.setData({ newsMap: mergedMap, suggest: suggest, stats: result.stats || null, loadingAnalysis: false });
      self.applySuggestion();
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) { fund.news = mergedMap; fund.suggestion = suggest; fund._holdingsLoaded = true; }
    }).catch(function(err) {
      self.setData({ loadingAnalysis: false });
    });
  },

  applySuggestion: function() {
    var sug = this.data.suggest;
    if (!sug) return;
    var suggestLabel = '';
    var suggestClass = 'blue';
    if (sug.action === 'buy') { suggestLabel = '加仓'; suggestClass = 'red'; }
    else if (sug.action === 'sell') { suggestLabel = '减仓'; suggestClass = 'green'; }
    else { suggestLabel = '观望'; suggestClass = 'blue'; }
    this.setData({ suggestLabel: suggestLabel, suggestClass: suggestClass });
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
  }
});
