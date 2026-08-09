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
    // 加载状态
    loadingHoldings: false,
    loadingNews: false,
    loadingAnalysis: false,
    holdingsError: '',
    newsError: '',
    // 统计信息
    stats: null
  },
  _timer: null,
  _fundIndex: -1,
  _fundCode: '',
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
      fund: fund,
      name: fund.name || '--',
      code: fund.code,
      nav: fund.nav || '--',
      changePct: pct,
      changeStr: (up ? '+' : '') + (fund.changePct || '0') + '%',
      up: up,
      navDate: fund.date || ''
    });

    // 加载持仓和新闻
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

  // ============ 加载持仓和新闻 ============

  loadHoldingsAndNews: function() {
    var self = this;
    var code = this._fundCode;
    if (!code) return;

    // 先检查是否已有缓存数据
    var fund = app.globalData.funds[self._fundIndex];
    if (fund && fund._holdingsLoaded) {
      self.setData({
        sectors: fund.holdings ? fund.holdings.sectors : [],
        stocks: fund.holdings ? fund.holdings.stocks : [],
        newsMap: fund.news || {},
        suggest: fund.suggestion || null
      });
      self.applySuggestion();
      return;
    }

    // 加载真实数据
    self.setData({ loadingHoldings: true, holdingsError: '' });

    app.fetchHoldings(code).then(function(data) {
      if (data && data.stocks && data.stocks.length > 0) {
        var sectors = data.sectors || [];
        var stocks = data.stocks || [];
        self.setData({ sectors: sectors, stocks: stocks, loadingHoldings: false });

        // 保存到 globalData
        if (fund) {
          fund.holdings = { sectors: sectors, stocks: stocks };
        }

        // 加载每只重仓股的新闻
        self.loadNewsForStocks(stocks);
      } else {
        // API 无数据，沿用 index 页的 mock 数据
        var holdings = fund && fund.holdings ? fund.holdings : { sectors: [], stocks: [] };
        self.setData({
          sectors: holdings.sectors || [],
          stocks: holdings.stocks || [],
          loadingHoldings: false
        });
        if (holdings.stocks && holdings.stocks.length > 0) {
          self.loadNewsForStocks(holdings.stocks);
        }
      }
    }).catch(function(err) {
      console.error('fetchHoldings error:', err);
      // fallback
      var holdings = fund && fund.holdings ? fund.holdings : { sectors: [], stocks: [] };
      self.setData({
        sectors: holdings.sectors || [],
        stocks: holdings.stocks || [],
        loadingHoldings: false,
        holdingsError: '持仓数据加载失败，使用缓存数据'
      });
      if (holdings.stocks && holdings.stocks.length > 0) {
        self.loadNewsForStocks(holdings.stocks);
      }
    });
  },

  loadNewsForStocks: function(stocks) {
    var self = this;
    self.setData({ loadingNews: true, newsError: '' });

    var tasks = stocks.map(function(s) {
      return app.fetchStockNews(s.code, s.name).then(function(news) {
        return { code: s.code, news: news };
      }).catch(function() {
        return { code: s.code, news: [] };
      });
    });

    Promise.all(tasks).then(function(results) {
      var newsMap = {};
      results.forEach(function(r) {
        newsMap[r.code] = r.news;
      });
      self.setData({ newsMap: newsMap, loadingNews: false });

      // 保存到 globalData
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) { fund.news = newsMap; }

      // 调用 AI 分析
      self.runAnalyze(stocks, newsMap);
    }).catch(function(err) {
      console.error('loadNewsForStocks error:', err);
      self.setData({ loadingNews: false, newsError: '新闻加载失败' });
    });
  },

  runAnalyze: function(stocks, newsMap) {
    var self = this;
    self.setData({ loadingAnalysis: true });

    app.analyzeNews(stocks, newsMap).then(function(result) {
      if (!result) return;

      var labeled = result.labeled || {};
      // 将 AI 分析标签合并到 newsMap 中
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
            } else if (n.date) {
              timeAgo = n.date;
            }
          }
          return {
            title: n.title || n.text || '',
            column: n.column || '',
            type: label.type === 'bullish' ? 'bullish' : label.type === 'bearish' ? 'bearish' : 'neutral',
            reason: label.reason || '',
            timeAgo: timeAgo,
            stale: n.stale || false
          };
        });
      });

      var suggest = result.suggest || { action: 'hold', reason: '暂无分析' };
      self.setData({
        newsMap: mergedMap,
        suggest: suggest,
        stats: result.stats || null,
        loadingAnalysis: false
      });
      self.applySuggestion();

      // 保存到 globalData
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) {
        fund.news = mergedMap;
        fund.suggestion = suggest;
        fund._holdingsLoaded = true;
      }
    }).catch(function(err) {
      console.error('analyzeNews error:', err);
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

  // ============ 定时刷新净值 ============

  startAutoRefresh: function() {
    var self = this;
    this.doRefresh();
    this._timer = setInterval(function() {
      self.doRefresh();
    }, 15000);
  },

  stopAutoRefresh: function() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onRefresh: function() {
    var self = this;
    self.setData({ refreshing: true });
    this.loadHoldingsAndNews();
    this.doRefresh().then(function() {
      self.setData({ refreshing: false });
    }).catch(function() {
      self.setData({ refreshing: false });
    });
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
        nav: data.nav.toFixed(4),
        changePct: pct,
        changeStr: (up ? '+' : '') + pct.toFixed(2) + '%',
        up: up,
        navDate: data.date,
        lastUpdateTime: time
      });
      var fund = app.globalData.funds[self._fundIndex];
      if (fund) {
        fund.nav = data.nav;
        fund.changePct = data.changePct;
        fund.date = data.date;
      }
    });
  }
});
