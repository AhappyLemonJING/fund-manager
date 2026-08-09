var app = getApp();

var FT_MAP = {
  all: 'all',
  gp: 'gp',
  hh: 'hh',
  zq: 'zq',
  zs: 'zs',
  hb: 'hb'
};

var SORT_OPTIONS = [
  { id: '1nzf', label: '近1年', sc: '1nzf', desc: true },
  { id: '6yzf', label: '近6月', sc: '6yzf', desc: true },
  { id: '3yzf', label: '近3月', sc: '3yzf', desc: true },
  { id: '1yzf', label: '近1月', sc: '1yzf', desc: true },
  { id: 'zzf', label: '成立来', sc: 'zzf', desc: true },
  { id: 'jnzf', label: '今年来', sc: 'jnzf', desc: true },
  { id: 'fs', label: '规模', sc: 'fs', desc: true }
];

Page({
  data: {
    activeTab: 'all',
    tabs: [
      { id: 'all', name: '全部' },
      { id: 'gp', name: '股票型' },
      { id: 'hh', name: '混合型' },
      { id: 'zq', name: '债券型' },
      { id: 'zs', name: '指数型' },
      { id: 'hb', name: '货币型' }
    ],
    activeSort: '1nzf',
    sortOptions: SORT_OPTIONS,
    showSortPicker: false,

    funds: [],
    loading: false,
    loadingMore: false,
    refreshing: false,
    error: false,
    errorMsg: '',
    page: 1,
    hasMore: true,

    searchValue: '',
    searching: false,
    showSearch: false,
    searchResults: [],
    searchTimer: null
  },

  onLoad: function() {
    this.fetchData();
  },

  switchTab: function(e) {
    var id = e.currentTarget.dataset.id;
    if (id === this.data.activeTab) return;
    this.setData({ activeTab: id, page: 1, hasMore: true, funds: [] });
    this.fetchData();
  },

  toggleSortPicker: function() {
    this.setData({ showSortPicker: !this.data.showSortPicker });
  },

  selectSort: function(e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ activeSort: id, showSortPicker: false, page: 1, hasMore: true, funds: [] });
    this.fetchData();
  },

  onSearchInput: function(e) {
    var val = e.detail.value;
    this.setData({ searchValue: val });
    if (this.data.searchTimer) clearTimeout(this.data.searchTimer);

    if (!val.trim()) {
      this.setData({ searchResults: [], searching: false, showSearch: false });
      return;
    }

    var self = this;
    this.setData({ searching: true, showSearch: true });
    this.data.searchTimer = setTimeout(function() {
      self.doSearch(val.trim());
    }, 300);
  },

  doSearch: function(keyword) {
    var self = this;
    wx.cloud.callFunction({
      name: 'fundApi',
      data: { type: 'search', code: keyword, count: 20 }
    }).then(function(res) {
      var data = res.result || {};
      var items = (data.QuotationCodeTable && data.QuotationCodeTable.Data) || [];
      var results = [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].Classify === 'OTCFUND' || items[i].SecurityTypeName === '基金') {
          // Code 是纯6位代码，QuoteID 有市场前缀(如 0.000213)
          var rawCode = items[i].Code || items[i].QuoteID || '';
          var cleanCode = rawCode.replace(/^\d+\./, '');
          results.push({
            code: cleanCode,
            name: items[i].Name,
            type: items[i].SecurityTypeName || '基金'
          });
        }
      }
      var codes = app.loadCodes();
      for (var j = 0; j < results.length; j++) {
        results[j]._added = codes.indexOf(results[j].code) >= 0;
      }
      self.setData({ searchResults: results, searching: false });
    }).catch(function() {
      self.setData({ searching: false });
    });
  },
  clearSearch: function() {
    this.setData({
      searchValue: '', searchResults: [], searching: false,
      showSearch: false, page: 1, hasMore: true, funds: []
    });
    if (this.data.searchTimer) clearTimeout(this.data.searchTimer);
    this.fetchData();
  },

  addFund: function(e) {
    var code = e.currentTarget.dataset.code;
    var name = e.currentTarget.dataset.name;
    if (!code) return;

    if (app.globalData.funds.some(function(f) { return f.code === code; })) {
      wx.showToast({ title: '该基金已在列表中', icon: 'none' });
      return;
    }

    var fund = { code: code, name: name, nav: null, changePct: 0, date: '', holdings: null, news: null, suggestion: null };
    app.globalData.funds.push(fund);
    app.saveCodes(app.globalData.funds.map(function(f) { return f.code; }));
    app.setFundType(code, 'watch');
    app.pushToCloud();

    app.fetchNav(code).then(function(data) {
      if (data) {
        fund.nav = data.nav.toFixed(4);
        fund.changePct = data.changePct.toFixed(2);
        fund.date = data.date;
      }
    }).catch(function() {});

    wx.showToast({ title: '已加入自选', icon: 'success', duration: 1000 });

    var funds = this.data.funds;
    for (var i = 0; i < funds.length; i++) {
      if (funds[i].code === code) funds[i]._added = true;
    }
    var searchResults = this.data.searchResults;
    for (var j = 0; j < searchResults.length; j++) {
      if (searchResults[j].code === code) searchResults[j]._added = true;
    }
    this.setData({ funds: funds, searchResults: searchResults });
  },

  goDetail: function(e) {
    var idx = e.currentTarget.dataset.index;
    var fund = this.data.funds[idx];
    if (!fund) return;
    wx.navigateTo({ url: '/pages/detail/detail?code=' + fund.code + '&name=' + encodeURIComponent(fund.name) });
  },

  goSearchDetail: function(e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    this.clearSearch();
    wx.navigateTo({ url: '/pages/detail/detail?code=' + code });
  },

  fetchData: function() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: false });

    var self = this;
    var ft = FT_MAP[self.data.activeTab] || 'all';
    var sortOption = null;
    for (var s = 0; s < SORT_OPTIONS.length; s++) {
      if (SORT_OPTIONS[s].id === self.data.activeSort) { sortOption = SORT_OPTIONS[s]; break; }
    }
    if (!sortOption) sortOption = SORT_OPTIONS[0];
    var sc = sortOption.sc;
    var st = sortOption.desc ? 'desc' : 'asc';

    var today = new Date();
    var ed = new Date(today.getTime() - 86400000);
    var sd = new Date(today.getTime() - 366 * 86400000);

    var pad = function(n) { return n < 10 ? '0' + n : '' + n; };
    var sdStr = sd.getFullYear() + '-' + pad(sd.getMonth() + 1) + '-' + pad(sd.getDate());
    var edStr = ed.getFullYear() + '-' + pad(ed.getMonth() + 1) + '-' + pad(ed.getDate());

    wx.cloud.callFunction({
      name: 'fundApi',
      data: {
        type: 'rank',
        ft: ft, sc: sc, st: st,
        pi: self.data.page, pn: 30,
        sd: sdStr, ed: edStr
      }
    }).then(function(res) {
      var result = res.result;
      if (result.error) {
        self.setData({ loading: false, error: true, errorMsg: result.error });
        return;
      }

      console.log("discover raw datas count:", (result.datas || []).length); if ((result.datas || []).length > 0) console.log("discover first raw:", result.datas[0].substring(0, 80)); var datas = result.datas || [];
      var newFunds = self.formatFunds(datas); if (newFunds.length > 0) console.log("discover first parsed:", JSON.stringify(newFunds[0].perf));
      var codes = app.loadCodes();
      for (var i = 0; i < newFunds.length; i++) {
        newFunds[i]._added = codes.indexOf(newFunds[i].code) >= 0;
      }

      var allFunds = self.data.page === 1 ? newFunds : self.data.funds.concat(newFunds);
      var allPages = result.allPages || 1;

      self.setData({
        funds: allFunds,
        loading: false,
        loadingMore: false,
        refreshing: false,
        hasMore: self.data.page < allPages,
        page: self.data.page
      });
    }).catch(function(err) {
      self.setData({
        loading: false, loadingMore: false, refreshing: false,
        error: true, errorMsg: (err && err.message) || '网络请求失败'
      });
    });
  },

  formatFunds: function(datas) {
    if (!datas || !datas.length) return [];

    var funds = [];
    for (var i = 0; i < datas.length; i++) {
      var parts = datas[i].split(',');
      if (parts.length < 10) continue;

      var code = parts[0] || '';
      var name = parts[1] || '';
      if (!code) continue;

      var nav = parseFloat(parts[4]) || 0;
      var dailyPct = parseFloat(parts[6]) || 0;

      var navStr = nav > 0 ? nav.toFixed(4) : '--';

      var len = parts.length;
      var perf = {};
      if (len > 8) perf.m1 = parseFloat(parts[8]) || 0;
      if (len > 9) perf.m3 = parseFloat(parts[9]) || 0;
      if (len > 10) perf.m6 = parseFloat(parts[10]) || 0;
      if (len > 11) perf.y1 = parseFloat(parts[11]) || 0;
      if (len > 12) perf.y2 = parseFloat(parts[12]) || 0;
      if (len > 13) perf.y3 = parseFloat(parts[13]) || 0;
      if (len > 14) perf.ytd = parseFloat(parts[14]) || 0;

      var fundSize = '';
      if (len > 18) {
        var rawSize = parts[18] || '';
        var cleanedSize = rawSize.replace('%', '').trim();
        if (/^\d+(\.\d+)?$/.test(cleanedSize)) {
          fundSize = cleanedSize;
        }
      }

      var sizeNum = parseFloat(fundSize) || 0;
      var sizeStr = '';
      if (sizeNum > 0) {
        // Eastmoney API returns fund size in 亿元 already
        sizeStr = sizeNum.toFixed(2) + '亿';
      }

      var fmtPerf = function(v) {
        if (v == null || isNaN(v)) return '--';
        return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
      };
      funds.push({
        code: code,
        name: name,
        nav: navStr,
        dailyPct: dailyPct,
        dailyPctStr: (dailyPct >= 0 ? '+' : '') + dailyPct.toFixed(2),
        perf: perf,
        fundSize: sizeNum,
        fundSizeStr: sizeStr,
        // 预格式化字符串，避免 WXML 复杂表达式求值问题
        m1Str: fmtPerf(perf.m1),
        m3Str: fmtPerf(perf.m3),
        m6Str: fmtPerf(perf.m6),
        y1Str: fmtPerf(perf.y1),
        m1Up: (perf.m1 || 0) >= 0,
        m3Up: (perf.m3 || 0) >= 0,
        m6Up: (perf.m6 || 0) >= 0,
        y1Up: (perf.y1 || 0) >= 0
      });
    }
    return funds;
  },

  onRefresh: function() {
    this.setData({ refreshing: true, page: 1, hasMore: true });
    this.fetchData();
  },

  loadMore: function() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true, page: this.data.page + 1 });
    this.fetchData();
  },

  goFund: function() {
    wx.redirectTo({ url: '/pages/index/index' });
  },

  goMarket: function() {
    wx.redirectTo({ url: '/pages/market/market' });
  },

  noop: function() {}
});
